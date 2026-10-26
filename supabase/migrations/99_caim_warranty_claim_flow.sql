-- Migration 99: CAIM Warranty-Claim Integration Flow (Outbound & Inbound via /scrap)
-- ---------------------------------------------------------------------------
-- CONTEXT:
--   ตามแผน docs/caim-warranty-claim-integration-plan.md
--   1. Outbound: เมื่อรับคืนอุปกรณ์สภาพ 'consumed', 'damaged', 'needs_repair'
--      ระบบจะส่ง in-app notification เข้ากระดิ่ง เพื่อนำผู้ใช้ไปยังหน้า /scrap?tab=outbound_claim
--      เพื่อให้ผู้ใช้ตรวจสอบและกดยืนยันส่งเคลม CAIM
--   2. Inbound: เมื่อ CAIM ส่ง Webhook ปิดเคส ('claim.closed') กลับมา
--      ระบบสร้าง Pending-Confirmation Entry ('caim_inbound_status = pending_confirmation')
--      และส่ง in-app notification เข้ากระดิ่งเพื่อนำผู้ใช้ไปยังหน้า /scrap?tab=inbound_caim
--      สต็อกจะยังไม่เปลี่ยนแปลง จนกว่าผู้ใช้จะกดยืนยัน:
--        - Case A (repaired / replaced_new): กดยืนยันแล้วจึงสร้าง stock_in (+1 หน่วย)
--        - Case B (unrepairable): กดยืนยันแล้วจึงบันทึก scrap_disposal_items (สต็อกไม่ขยับ)
--
-- WHAT THIS MIGRATION DOES:
--   1. เพิ่มคอลัมน์ใน public.checkout_return_logs:
--      - caim_inbound_status TEXT DEFAULT 'none' CHECK ('none', 'pending_confirmation', 'confirmed', 'rejected')
--      - caim_inbound_payload JSONB NULL
--   2. ปรับปรุง RPC public.process_return_order ให้ส่ง notification เมื่อพบอุปกรณ์รับคืนสภาพชำรุด/ทดแทน
--   3. ปรับปรุง RPC public.process_caim_webhook_event ให้สร้าง pending entry และส่ง notification
--      (ไม่ปรับสต็อกทันที)
--   4. สร้าง RPC ใหม่ public.confirm_caim_inbound_resolution สำหรับยืนยันผลเคลมจากหน้า /scrap
--
-- SECURITY:
--   - confirm_caim_inbound_resolution: SECURITY DEFINER, search_path = public, auth, pg_temp
--   - ตรวจสอบสิทธิ์ผู้เรียก: checkouts.resolve_repair หรือ stock_in.create หรือ admin / super_admin
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. เพิ่มคอลัมน์สำหรับ Inbound Confirmation
-- ---------------------------------------------------------------------------
ALTER TABLE public.checkout_return_logs
  ADD COLUMN IF NOT EXISTS caim_inbound_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS caim_inbound_payload JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.checkout_return_logs'::regclass
      AND conname = 'checkout_return_logs_caim_inbound_status_check'
  ) THEN
    ALTER TABLE public.checkout_return_logs
      ADD CONSTRAINT checkout_return_logs_caim_inbound_status_check
      CHECK (caim_inbound_status IN ('none', 'pending_confirmation', 'confirmed', 'rejected')) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.checkout_return_logs
  VALIDATE CONSTRAINT checkout_return_logs_caim_inbound_status_check;

CREATE INDEX IF NOT EXISTS idx_checkout_return_logs_caim_inbound_status
  ON public.checkout_return_logs (caim_inbound_status)
  WHERE caim_inbound_status = 'pending_confirmation';

-- ---------------------------------------------------------------------------
-- 2. ปรับปรุง RPC public.process_return_order
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_return_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_order_id UUID;
  v_returns JSONB;
  v_ret JSONB;
  v_checkout_item_id UUID;
  v_return_qty NUMERIC;
  v_condition TEXT;
  v_dest_project_id UUID;
  v_damage_notes TEXT;
  v_replaced_serial TEXT;
  v_checkout_item RECORD;
  v_order RECORD;
  v_all_returned BOOLEAN := true;
  v_new_returned_total NUMERIC;
  v_new_damaged_total NUMERIC;
  v_new_lost_total NUMERIC;
  v_new_consumed_total NUMERIC;
  v_transfer_order_id UUID;
  v_dest_project_name TEXT;
  v_created_log_id UUID;
  v_initial_sync_status TEXT;
  v_created_returns JSONB := '[]'::jsonb;
  v_has_claim_eligible BOOLEAN := false;
  v_recipients UUID[];
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_caller_id, 'checkouts.return') OR public.is_super_admin(v_caller_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.return permission.';
  END IF;

  v_order_id := (p_payload->>'order_id')::UUID;
  v_returns := p_payload->'returns';

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรหัสคำสั่งยืมพัสดุ';
  END IF;

  IF v_returns IS NULL OR jsonb_array_length(v_returns) = 0 THEN
    RAISE EXCEPTION 'กรุณาระบุรายการอุปกรณ์ที่ต้องการรับคืน';
  END IF;

  SELECT * INTO v_order FROM public.checkout_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคำสั่งยืมพัสดุ ID: %', v_order_id;
  END IF;

  IF v_order.status NOT IN ('active', 'partial_returned', 'overdue') THEN
    RAISE EXCEPTION 'ไม่สามารถรับคืนได้: คำสั่งยืมอยู่ในสถานะ %', v_order.status;
  END IF;

  FOR v_ret IN SELECT * FROM jsonb_array_elements(v_returns)
  LOOP
    v_checkout_item_id := (v_ret->>'checkout_item_id')::UUID;
    v_return_qty := (v_ret->>'returned_quantity')::NUMERIC;
    v_condition := COALESCE(NULLIF(TRIM(v_ret->>'condition'), ''), 'normal');
    v_dest_project_id := COALESCE(NULLIF(v_ret->>'destination_project_id', '')::UUID, v_order.project_id);
    v_damage_notes := NULLIF(TRIM(COALESCE(v_ret->>'damage_notes', '')), '');
    v_replaced_serial := NULLIF(TRIM(COALESCE(v_ret->>'replaced_serial_number', '')), '');

    IF v_condition NOT IN ('normal', 'damaged', 'lost', 'needs_repair', 'consumed') THEN
      RAISE EXCEPTION 'สภาพรับคืนไม่ถูกต้อง: %', v_condition;
    END IF;

    SELECT * INTO v_checkout_item 
    FROM public.checkout_items 
    WHERE id = v_checkout_item_id AND checkout_order_id = v_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ไม่พบรายการอุปกรณ์ที่ยืม ID: % ในคำสั่งยืมนี้', v_checkout_item_id;
    END IF;

    IF v_return_qty IS NULL OR v_return_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_condition = 'consumed' THEN
      IF v_damage_notes IS NULL THEN
        RAISE EXCEPTION 'กรุณาระบุเหตุผล/จุดติดตั้งที่นำไปใช้งานทดแทน';
      END IF;

      IF v_replaced_serial IS NOT NULL AND char_length(v_replaced_serial) > 100 THEN
        RAISE EXCEPTION 'หมายเลขเครื่อง (S/N) ที่ถูกทดแทนยาวเกิน 100 ตัวอักษร';
      END IF;
    ELSE
      v_replaced_serial := NULL;
    END IF;

    IF (v_checkout_item.quantity_returned + v_checkout_item.quantity_damaged + v_checkout_item.quantity_lost + v_checkout_item.quantity_consumed + v_return_qty) > v_checkout_item.quantity_borrowed THEN
      RAISE EXCEPTION 'จำนวนที่รับคืนรวมเกินกว่าจำนวนที่ยืมไป (ยืม: %, รับคืนแล้ว: %, ต้องการคืนเพิ่ม: %)',
        v_checkout_item.quantity_borrowed,
        (v_checkout_item.quantity_returned + v_checkout_item.quantity_damaged + v_checkout_item.quantity_lost + v_checkout_item.quantity_consumed),
        v_return_qty;
    END IF;

    v_initial_sync_status := CASE 
      WHEN v_condition = 'consumed' AND v_replaced_serial IS NOT NULL THEN 'pending' 
      ELSE 'not_applicable' 
    END;

    IF v_condition IN ('consumed', 'damaged', 'needs_repair') THEN
      v_has_claim_eligible := true;
    END IF;

    -- Insert Return Log
    INSERT INTO public.checkout_return_logs (
      checkout_order_id, checkout_item_id, returned_quantity,
      item_condition, destination_project_id, received_by, returned_at,
      damage_notes, replaced_serial_number, caim_sync_status
    ) VALUES (
      v_order_id, v_checkout_item_id, v_return_qty,
      v_condition, v_dest_project_id, v_caller_id, now(),
      v_damage_notes, v_replaced_serial, v_initial_sync_status
    ) RETURNING id INTO v_created_log_id;

    v_created_returns := v_created_returns || jsonb_build_object(
      'return_log_id', v_created_log_id,
      'checkout_item_id', v_checkout_item_id,
      'item_id', v_checkout_item.item_id,
      'returned_quantity', v_return_qty,
      'condition', v_condition,
      'damage_notes', v_damage_notes,
      'replaced_serial_number', v_replaced_serial,
      'caim_sync_status', v_initial_sync_status
    );

    IF v_condition = 'normal' THEN
      v_new_returned_total := v_checkout_item.quantity_returned + v_return_qty;
      v_new_damaged_total := v_checkout_item.quantity_damaged;
      v_new_lost_total := v_checkout_item.quantity_lost;
      v_new_consumed_total := v_checkout_item.quantity_consumed;

      IF v_dest_project_id = v_order.project_id THEN
        INSERT INTO public.stock_transactions (
          project_id, item_id, transaction_type, quantity, reference_id, reference_type, created_by, notes
        ) VALUES (
          v_dest_project_id, v_checkout_item.item_id, 'return_in', v_return_qty, v_order_id, 'checkout_return', v_caller_id,
          'รับคืนอุปกรณ์จากการยืม: คำสั่งยืม ' || v_order.order_number
        );
      ELSE
        SELECT name INTO v_dest_project_name FROM public.projects WHERE id = v_dest_project_id;

        INSERT INTO public.stock_in_orders (
          project_id, supplier, notes, received_date, created_by
        ) VALUES (
          v_dest_project_id, 'Checkout Return from ' || v_order.order_number,
          'รับคืนอุปกรณ์จากการยืม ' || v_order.order_number || ' (ข้ามโครงการ)',
          CURRENT_DATE, v_caller_id
        ) RETURNING id INTO v_transfer_order_id;

        INSERT INTO public.stock_in_items (
          order_id, item_id, quantity, notes
        ) VALUES (
          v_transfer_order_id, v_checkout_item.item_id, v_return_qty,
          'รับคืนอุปกรณ์จากการยืม ' || v_order.order_number
        );

        INSERT INTO public.stock_transactions (
          project_id, item_id, transaction_type, quantity, reference_id, reference_type, created_by, notes
        ) VALUES (
          v_dest_project_id, v_checkout_item.item_id, 'stock_in', v_return_qty, v_order_id, 'checkout_return', v_caller_id,
          'รับคืนอุปกรณ์จากการยืม ' || v_order.order_number || ' สู่โครงการ ' || COALESCE(v_dest_project_name, '')
        );
      END IF;
    ELSIF v_condition IN ('damaged', 'needs_repair') THEN
      v_new_returned_total := v_checkout_item.quantity_returned;
      v_new_damaged_total := v_checkout_item.quantity_damaged + v_return_qty;
      v_new_lost_total := v_checkout_item.quantity_lost;
      v_new_consumed_total := v_checkout_item.quantity_consumed;
    ELSIF v_condition = 'lost' THEN
      v_new_returned_total := v_checkout_item.quantity_returned;
      v_new_damaged_total := v_checkout_item.quantity_damaged;
      v_new_lost_total := v_checkout_item.quantity_lost + v_return_qty;
      v_new_consumed_total := v_checkout_item.quantity_consumed;
    ELSIF v_condition = 'consumed' THEN
      v_new_returned_total := v_checkout_item.quantity_returned;
      v_new_damaged_total := v_checkout_item.quantity_damaged;
      v_new_lost_total := v_checkout_item.quantity_lost;
      v_new_consumed_total := v_checkout_item.quantity_consumed + v_return_qty;
    END IF;

    UPDATE public.checkout_items SET
      quantity_returned = v_new_returned_total,
      quantity_damaged = v_new_damaged_total,
      quantity_lost = v_new_lost_total,
      quantity_consumed = v_new_consumed_total,
      status = CASE 
        WHEN (v_new_returned_total + v_new_damaged_total + v_new_lost_total + v_new_consumed_total) >= quantity_borrowed THEN 'returned'
        ELSE 'borrowed'
      END
    WHERE id = v_checkout_item_id;
  END LOOP;

  -- Check if all items in the order have been returned/accounted for
  FOR v_checkout_item IN SELECT * FROM public.checkout_items WHERE checkout_order_id = v_order_id
  LOOP
    IF (v_checkout_item.quantity_returned + v_checkout_item.quantity_damaged + v_checkout_item.quantity_lost + v_checkout_item.quantity_consumed) < v_checkout_item.quantity_borrowed THEN
      v_all_returned := false;
    END IF;
  END LOOP;

  IF v_all_returned THEN
    UPDATE public.checkout_orders 
    SET status = 'completed', actual_returned_date = now() 
    WHERE id = v_order_id;
  ELSE
    UPDATE public.checkout_orders 
    SET status = 'partial_returned' 
    WHERE id = v_order_id;
  END IF;

  -- Notification: If any items require claim/scrap review, push in-app notification
  IF v_has_claim_eligible THEN
    BEGIN
      SELECT array_agg(pr.id)
        INTO v_recipients
      FROM public.profiles pr
      WHERE pr.status = 'active'
        AND (public.has_permission(pr.id, 'checkouts.resolve_repair') 
             OR public.has_permission(pr.id, 'checkouts.return')
             OR public.has_permission(pr.id, 'stock_in.create')
             OR public.is_admin(pr.id)
             OR public.is_super_admin(pr.id));

      IF v_recipients IS NOT NULL AND array_length(v_recipients, 1) > 0 THEN
        PERFORM public.push_notifications(
          v_recipients,
          'caim.claim_required',
          'มีอุปกรณ์รับคืนรอตรวจสอบส่งเคลม CAIM',
          'คำสั่งยืม ' || v_order.order_number || ' มีอุปกรณ์รับคืนสภาพชำรุด/ทดแทน รอการตรวจสอบส่งเคลม',
          '/scrap?tab=outbound_claim',
          v_order_id,
          v_order.project_id,
          jsonb_build_object(
            'order_number', v_order.order_number,
            'order_id', v_order_id
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[process_return_order] notification push failed: %', SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'completed', v_all_returned,
    'message', CASE WHEN v_all_returned THEN 'รับคืนอุปกรณ์ครบถ้วนเรียบร้อยแล้ว' ELSE 'บันทึกการรับคืนบางส่วนสำเร็จ' END,
    'returns', v_created_returns
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. ปรับปรุง RPC public.process_caim_webhook_event
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_caim_webhook_event(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_event_id TEXT;
  v_ticket_id TEXT;
  v_event_type TEXT;
  v_repair TEXT;
  v_closed_at TIMESTAMPTZ;
  v_return RECORD;
  v_log_id UUID;
  v_existing_status TEXT;
  v_existing_message TEXT;
  v_recipients UUID[];
BEGIN
  -- 1. Validate payload basics
  IF p_payload IS NULL OR jsonb_typeof(p_payload) != 'object' THEN
    RAISE EXCEPTION 'Payload must be a JSON object';
  END IF;

  v_event_id := NULLIF(TRIM(p_payload->>'eventId'), '');
  v_ticket_id := NULLIF(TRIM(p_payload->>'ticketId'), '');
  v_event_type := NULLIF(TRIM(p_payload->>'event'), '');
  v_repair := NULLIF(TRIM(p_payload->>'repairResult'), '');

  IF v_ticket_id IS NULL THEN
    RAISE EXCEPTION 'ticketId is required';
  END IF;

  IF v_event_type IS NULL OR v_event_type != 'claim.closed' THEN
    RAISE EXCEPTION 'Unsupported event: %', COALESCE(v_event_type, '(null)');
  END IF;

  IF v_repair IS NULL OR v_repair NOT IN ('unrepairable', 'repaired', 'replaced_new') THEN
    RAISE EXCEPTION 'Unsupported repairResult: %', COALESCE(v_repair, '(null)');
  END IF;

  -- Fallback deterministic eventId
  IF v_event_id IS NULL THEN
    v_event_id := 'caim:' || v_ticket_id || ':' || v_repair;
  END IF;

  v_closed_at := CASE
    WHEN p_payload->>'closedAt' IS NOT NULL THEN (p_payload->>'closedAt')::TIMESTAMPTZ
    ELSE now()
  END;

  -- 2. Idempotency Check in caim_webhook_logs
  INSERT INTO public.caim_webhook_logs (
    event_id, ticket_id, event_type, repair_result, payload, status
  ) VALUES (
    v_event_id, v_ticket_id, v_event_type, v_repair, p_payload, 'processing'
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_log_id;

  IF v_log_id IS NULL THEN
    SELECT status, message INTO v_existing_status, v_existing_message
    FROM public.caim_webhook_logs
    WHERE event_id = v_event_id;

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'event_id', v_event_id,
      'status', COALESCE(v_existing_status, 'duplicate'),
      'message', COALESCE(v_existing_message, 'Event already processed')
    );
  END IF;

  -- 3. Process return log linking (Sub-transaction)
  BEGIN
    SELECT * INTO v_return
    FROM public.checkout_return_logs
    WHERE caim_ticket_id = v_ticket_id
    ORDER BY returned_at DESC NULLS LAST
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      UPDATE public.caim_webhook_logs
      SET status = 'unmatched',
          message = 'ไม่พบรายการรับคืนที่ผูกกับ CAIM Ticket ' || v_ticket_id,
          processed_at = now()
      WHERE id = v_log_id;

      RETURN jsonb_build_object(
        'success', false,
        'processed', false,
        'event_id', v_event_id,
        'status', 'unmatched',
        'message', 'ไม่พบรายการรับคืนที่ผูกกับ CAIM Ticket ' || v_ticket_id
      );
    END IF;

    -- If already confirmed, don't overwrite
    IF v_return.caim_inbound_status = 'confirmed' THEN
      UPDATE public.caim_webhook_logs
      SET status = 'processed',
          message = 'รายการนี้ได้รับการยืนยันผลเคลมในระบบไปแล้ว',
          processed_at = now()
      WHERE id = v_log_id;

      RETURN jsonb_build_object(
        'success', true,
        'processed', true,
        'event_id', v_event_id,
        'status', 'already_confirmed',
        'message', 'รายการนี้ได้รับการยืนยันผลเคลมในระบบไปแล้ว'
      );
    END IF;

    -- Staging / Pending confirmation: Stock does NOT move yet!
    UPDATE public.checkout_return_logs
    SET caim_repair_result = v_repair,
        caim_closed_at = v_closed_at,
        caim_inbound_status = 'pending_confirmation',
        caim_inbound_payload = p_payload
    WHERE id = v_return.id;

    UPDATE public.caim_webhook_logs
    SET status = 'processed',
        message = 'สร้างรายการรอการยืนยันผลเคลมในระบบเรียบร้อย (รอผู้ใช้กดยืนยันที่หน้า Scrap)',
        processed_at = now()
    WHERE id = v_log_id;

    -- Notification: Push in-app notification to warehouse officers / managers
    BEGIN
      SELECT array_agg(pr.id)
        INTO v_recipients
      FROM public.profiles pr
      WHERE pr.status = 'active'
        AND (public.has_permission(pr.id, 'checkouts.resolve_repair') 
             OR public.has_permission(pr.id, 'stock_in.create')
             OR public.is_admin(pr.id)
             OR public.is_super_admin(pr.id));

      IF v_recipients IS NOT NULL AND array_length(v_recipients, 1) > 0 THEN
        PERFORM public.push_notifications(
          v_recipients,
          'caim.claim_closed',
          'ผลการเคลม/ซ่อมจาก CAIM พร้อมให้ตรวจสอบ',
          'Ticket ' || v_ticket_id || ' (' || v_repair || ') มีผลการซ่อมส่งกลับมาแล้ว รอการยืนยันที่หน้า Scrap',
          '/scrap?tab=inbound_caim',
          v_return.id,
          v_return.destination_project_id,
          jsonb_build_object(
            'ticket_id', v_ticket_id,
            'repair_result', v_repair,
            'return_log_id', v_return.id
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[process_caim_webhook_event] notification push failed: %', SQLERRM;
    END;

    RETURN jsonb_build_object(
      'success', true,
      'processed', true,
      'event_id', v_event_id,
      'status', 'pending_confirmation',
      'ticket_id', v_ticket_id,
      'repair_result', v_repair,
      'return_log_id', v_return.id,
      'message', 'สร้างรายการรอการยืนยันผลเคลมในระบบเรียบร้อย (รอผู้ใช้กดยืนยันที่หน้า Scrap)'
    );

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.caim_webhook_logs
    SET status = 'failed',
        message = SQLERRM,
        processed_at = now()
    WHERE id = v_log_id;

    RETURN jsonb_build_object(
      'success', false,
      'processed', false,
      'event_id', v_event_id,
      'status', 'failed',
      'message', SQLERRM
    );
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC public.confirm_caim_inbound_resolution (Confirm from /scrap)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_caim_inbound_resolution(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_return_log_id UUID;
  v_action TEXT;
  v_custom_notes TEXT;
  v_return RECORD;
  v_payload JSONB;
  v_repair TEXT;
  v_ticket_id TEXT;
  v_serial TEXT;
  v_new_serial TEXT;
  v_closed_at TIMESTAMPTZ;
  v_closed_by TEXT;
  v_project_id UUID;
  v_item_id UUID;
  v_scrap_id UUID;
  v_stock_in_order UUID;
  v_item_name TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.resolve_repair') 
    OR public.has_permission(v_caller_id, 'stock_in.create')
    OR public.is_admin(v_caller_id)
    OR public.is_super_admin(v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.resolve_repair or stock_in.create permission.';
  END IF;

  v_return_log_id := (p_payload->>'return_log_id')::UUID;
  v_action := COALESCE(NULLIF(TRIM(p_payload->>'action'), ''), 'confirm');
  v_custom_notes := NULLIF(TRIM(p_payload->>'notes'), '');

  IF v_return_log_id IS NULL THEN
    RAISE EXCEPTION 'return_log_id is required';
  END IF;

  -- Lock return log
  SELECT * INTO v_return
  FROM public.checkout_return_logs
  WHERE id = v_return_log_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return log % not found', v_return_log_id;
  END IF;

  IF v_return.caim_inbound_status != 'pending_confirmation' THEN
    RAISE EXCEPTION 'รายการนี้ไม่อยู่ในสถานะรอการยืนยัน (สถานะปัจจุบัน: %)', v_return.caim_inbound_status;
  END IF;

  IF v_return.caim_stock_in_order_id IS NOT NULL OR v_return.caim_scrap_disposal_id IS NOT NULL THEN
    RAISE EXCEPTION 'รายการนี้ได้รับการดำเนินการรับเข้าหรือแทงจำหน่ายไปแล้ว';
  END IF;

  v_payload := COALESCE(v_return.caim_inbound_payload, '{}'::jsonb);
  v_repair := v_return.caim_repair_result;
  v_ticket_id := v_return.caim_ticket_id;
  v_serial := NULLIF(TRIM(v_payload->>'serialNo'), '');
  v_new_serial := NULLIF(TRIM(COALESCE(v_payload->>'replacedNewSerialNo', v_payload->>'newSerialNo')), '');
  v_closed_at := COALESCE(v_return.caim_closed_at, now());
  v_closed_by := NULLIF(TRIM(v_payload->>'closedBy'), '');

  -- Get project_id and item_id
  SELECT project_id INTO v_project_id
  FROM public.checkout_orders WHERE id = v_return.checkout_order_id;

  SELECT item_id INTO v_item_id
  FROM public.checkout_items WHERE id = v_return.checkout_item_id;

  IF v_project_id IS NULL OR v_item_id IS NULL THEN
    RAISE EXCEPTION 'Return log % is missing project_id or item_id', v_return.id;
  END IF;

  SELECT name INTO v_item_name FROM public.items WHERE id = v_item_id;

  -- Action: Reject
  IF v_action = 'reject' THEN
    UPDATE public.checkout_return_logs
    SET caim_inbound_status = 'rejected',
        damage_notes = COALESCE(damage_notes, '') || ' [ปฏิเสธผลเคลม CAIM: ' || COALESCE(v_custom_notes, '-') || ']'
    WHERE id = v_return.id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'rejected',
      'message', 'ปฏิเสธผลการเคลมเรียบร้อย'
    );
  END IF;

  -- Action: Confirm
  IF v_repair = 'unrepairable' THEN
    -- Case B: Unrepairable -> scrap_disposal_items (Stock does NOT move)
    INSERT INTO public.scrap_disposal_items (
      checkout_return_log_id, checkout_order_id, project_id, item_id, quantity,
      serial_number, reason, disposal_method, caim_ticket_id, caim_closed_at, closed_by, notes
    ) VALUES (
      v_return.id, v_return.checkout_order_id, v_project_id, v_item_id, 1,
      COALESCE(v_serial, v_return.replaced_serial_number),
      COALESCE(v_custom_notes, v_payload->>'notes', 'ซ่อมไม่ได้จากงานเคลม CAIM (' || v_ticket_id || ')'),
      'electronic_waste', v_ticket_id, v_closed_at,
      COALESCE(v_closed_by, 'CAIM Claim Center'),
      COALESCE(v_custom_notes, v_payload->>'notes')
    ) RETURNING id INTO v_scrap_id;

  ELSE
    -- Case A: Repaired / Replaced New -> stock_in (Stock +1)
    -- Lock item row to prevent concurrent deadlock
    PERFORM 1 FROM public.items WHERE id = v_item_id FOR UPDATE;

    INSERT INTO public.stock_in_orders (
      project_id, supplier, notes, received_date, created_by
    ) VALUES (
      v_project_id,
      'CAIM Claim Return ' || v_ticket_id,
      'รับอุปกรณ์คืนจากงานเคลม CAIM Ticket ' || v_ticket_id || ' (' || v_repair || ')'
        || CASE WHEN v_custom_notes IS NOT NULL THEN ' | หมายเหตุ: ' || v_custom_notes ELSE '' END,
      CURRENT_DATE,
      v_caller_id
    ) RETURNING id INTO v_stock_in_order;

    INSERT INTO public.stock_in_items (
      order_id, item_id, quantity, notes, serial_number
    ) VALUES (
      v_stock_in_order, v_item_id, 1,
      'รับคืนจากงานเคลม CAIM Ticket ' || v_ticket_id || ' (' || v_repair || ')'
        || COALESCE(' | S/N ใหม่: ' || v_new_serial, ''),
      COALESCE(v_new_serial, v_serial, v_return.replaced_serial_number)
    );

    INSERT INTO public.stock_transactions (
      project_id, item_id, quantity, transaction_type, reference_type, reference_id, created_by, notes
    ) VALUES (
      v_project_id, v_item_id, 1, 'stock_in', 'claim_return', v_stock_in_order, v_caller_id,
      'รับคืนจากงานเคลม CAIM Ticket ' || v_ticket_id || ' (' || v_repair || ')'
    );
  END IF;

  -- Update return log to confirmed
  UPDATE public.checkout_return_logs
  SET caim_inbound_status = 'confirmed',
      caim_inbound_processed_at = now(),
      caim_stock_in_order_id = v_stock_in_order,
      caim_scrap_disposal_id = v_scrap_id,
      repair_resolution_status = CASE 
        WHEN v_repair = 'unrepairable' THEN 'scrapped' 
        ELSE 'restored_to_stock' 
      END
  WHERE id = v_return.id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'confirmed',
    'repair_result', v_repair,
    'ticket_id', v_ticket_id,
    'return_log_id', v_return.id,
    'stock_in_order_id', v_stock_in_order,
    'scrap_disposal_id', v_scrap_id,
    'message', CASE
      WHEN v_repair = 'unrepairable' THEN 'ยืนยันแทงจำหน่ายของเสียเรียบร้อย (สต็อกไม่เปลี่ยนแปลง)'
      ELSE 'ยืนยันรับอุปกรณ์เข้าคลังเรียบร้อย (+1 หน่วย)'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_caim_inbound_resolution(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_caim_inbound_resolution(JSONB) TO authenticated;

COMMIT;
