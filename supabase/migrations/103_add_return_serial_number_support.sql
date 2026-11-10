-- Migration 103: Support Returned Device Serial Number (Optional) & Auto-Backfill
-- ---------------------------------------------------------------------------
-- CONTEXT:
--   1. Borrowers often borrow items without serial numbers recorded in advance
--      (e.g., bulk borrow or missing S/N on checkout).
--   2. When returning items, the returned physical device has a serial number (S/N)
--      on its label that the borrower can optionally enter/scan.
--   3. Recording this S/N is completely optional (non-blocking / zero-lock)
--      since some items truly do not have a serial number.
--   4. Admin reviews the S/N against the return photo in CheckoutReturnReviewModal.
--   5. Upon Admin confirmation, auto-backfill the S/N into checkout_items.serial_number
--      if quantity_borrowed = 1 and checkout_items.serial_number was previously null/empty.
--   6. Propagate returned_serial_number into downstream flows (cross-project stock_in,
--      CAIM tickets, and scrap disposal).
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Schema Updates on public.checkout_return_logs
-- ---------------------------------------------------------------------------
ALTER TABLE public.checkout_return_logs
  ADD COLUMN IF NOT EXISTS returned_serial_number TEXT;

CREATE INDEX IF NOT EXISTS idx_checkout_return_logs_returned_serial
  ON public.checkout_return_logs(returned_serial_number)
  WHERE returned_serial_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. RPC: public.process_return_order (Record Optional Returned S/N)
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
  v_returned_serial TEXT;
  v_evidence_photo_url TEXT;
  v_checkout_item RECORD;
  v_order RECORD;
  v_pending_qty NUMERIC;
  v_accounted_qty NUMERIC;
  v_created_log_id UUID;
  v_initial_sync_status TEXT;
  v_created_returns JSONB := '[]'::jsonb;
  v_recipients UUID[];
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  v_order_id := NULLIF(TRIM(COALESCE(p_payload->>'order_id', '')), '')::UUID;
  v_returns := p_payload->'returns';

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรหัสคำสั่งยืมพัสดุ';
  END IF;

  IF v_returns IS NULL OR jsonb_typeof(v_returns) != 'array' OR jsonb_array_length(v_returns) = 0 THEN
    RAISE EXCEPTION 'กรุณาระบุรายการอุปกรณ์ที่ต้องการส่งคืน';
  END IF;

  SELECT * INTO v_order FROM public.checkout_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคำสั่งยืมพัสดุ ID: %', v_order_id;
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.return')
    OR public.has_permission(v_caller_id, 'checkouts.approve')
    OR public.is_super_admin(v_caller_id)
    OR v_order.borrower_id = v_caller_id
    OR v_order.created_by = v_caller_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.return permission or borrower ownership.';
  END IF;

  IF v_order.status NOT IN ('active', 'partial_returned', 'overdue') THEN
    RAISE EXCEPTION 'ไม่สามารถส่งคืนได้: คำสั่งยืมอยู่ในสถานะ %', v_order.status;
  END IF;

  FOR v_ret IN SELECT * FROM jsonb_array_elements(v_returns)
  LOOP
    v_checkout_item_id := NULLIF(TRIM(COALESCE(v_ret->>'checkout_item_id', '')), '')::UUID;
    v_return_qty := (v_ret->>'returned_quantity')::NUMERIC;
    v_condition := COALESCE(NULLIF(TRIM(v_ret->>'condition'), ''), 'normal');
    v_dest_project_id := COALESCE(NULLIF(TRIM(COALESCE(v_ret->>'destination_project_id', '')), '')::UUID, v_order.project_id);
    v_damage_notes := NULLIF(TRIM(COALESCE(v_ret->>'damage_notes', '')), '');
    v_replaced_serial := NULLIF(TRIM(COALESCE(v_ret->>'replaced_serial_number', '')), '');
    v_returned_serial := NULLIF(UPPER(TRIM(COALESCE(v_ret->>'returned_serial_number', v_ret->>'serial_number', ''))), '');
    v_evidence_photo_url := NULLIF(TRIM(COALESCE(v_ret->>'evidence_photo_url', '')), '');

    IF v_return_qty IS NULL OR v_return_qty <= 0 THEN
      CONTINUE;
    END IF;

    -- Returned serial number check (Optional: non-blocking, max 100 chars)
    IF v_returned_serial IS NOT NULL AND char_length(v_returned_serial) > 100 THEN
      RAISE EXCEPTION 'หมายเลขเครื่อง (S/N) ที่ส่งคืนยาวเกิน 100 ตัวอักษร';
    END IF;

    -- Requirement: Every returned item MUST have 1 proof-of-return photo attached
    IF v_evidence_photo_url IS NULL OR NOT (v_evidence_photo_url LIKE 'http://%' OR v_evidence_photo_url LIKE 'https://%') THEN
      RAISE EXCEPTION 'กรุณาอัปโหลดรูปถ่ายหลักฐานการคืนพัสดุให้ครบทุกรายการ (Missing return proof photo)';
    END IF;

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

    SELECT COALESCE(SUM(returned_quantity), 0)
    INTO v_pending_qty
    FROM public.checkout_return_logs
    WHERE checkout_item_id = v_checkout_item_id
      AND verification_status = 'pending_review'
      AND COALESCE(is_reverted, FALSE) = FALSE;

    v_accounted_qty := COALESCE(v_checkout_item.quantity_returned, 0)
      + COALESCE(v_checkout_item.quantity_damaged, 0)
      + COALESCE(v_checkout_item.quantity_lost, 0)
      + COALESCE(v_checkout_item.quantity_consumed, 0);

    IF (v_accounted_qty + v_pending_qty + v_return_qty) > v_checkout_item.quantity_borrowed THEN
      RAISE EXCEPTION 'จำนวนที่ส่งคืนรวมเกินกว่าจำนวนที่ยืมไป (ยืม: %, คืน/รออนุมัติแล้ว: %, ต้องการคืนเพิ่ม: %)',
        v_checkout_item.quantity_borrowed,
        (v_accounted_qty + v_pending_qty),
        v_return_qty;
    END IF;

    v_initial_sync_status := CASE
      WHEN v_condition = 'consumed' AND v_replaced_serial IS NOT NULL THEN 'pending'
      ELSE 'not_applicable'
    END;

    -- Insert Return Log in 'pending_review' status with returned_serial_number
    INSERT INTO public.checkout_return_logs (
      checkout_order_id,
      checkout_item_id,
      returned_quantity,
      item_condition,
      destination_project_id,
      submitted_by,
      received_by,
      returned_at,
      damage_notes,
      replaced_serial_number,
      returned_serial_number,
      evidence_photo_url,
      verification_status,
      caim_sync_status
    ) VALUES (
      v_order_id,
      v_checkout_item_id,
      v_return_qty,
      v_condition,
      v_dest_project_id,
      v_caller_id,
      NULL,
      now(),
      v_damage_notes,
      v_replaced_serial,
      v_returned_serial,
      v_evidence_photo_url,
      'pending_review',
      v_initial_sync_status
    ) RETURNING id INTO v_created_log_id;

    v_created_returns := v_created_returns || jsonb_build_object(
      'return_log_id', v_created_log_id,
      'checkout_item_id', v_checkout_item_id,
      'item_id', v_checkout_item.item_id,
      'returned_quantity', v_return_qty,
      'condition', v_condition,
      'damage_notes', v_damage_notes,
      'replaced_serial_number', v_replaced_serial,
      'returned_serial_number', v_returned_serial,
      'evidence_photo_url', v_evidence_photo_url,
      'verification_status', 'pending_review',
      'caim_sync_status', v_initial_sync_status
    );
  END LOOP;

  IF jsonb_array_length(v_created_returns) = 0 THEN
    RAISE EXCEPTION 'กรุณาระบุจำนวนอุปกรณ์ที่ต้องการส่งคืนอย่างน้อย 1 รายการ';
  END IF;

  -- Push in-app notification to Admins / Approvers to review photo & confirm return
  BEGIN
    SELECT array_agg(pr.id)
      INTO v_recipients
    FROM public.profiles pr
    WHERE pr.status = 'active'
      AND (
        public.has_permission(pr.id, 'checkouts.approve')
        OR public.is_super_admin(pr.id)
        OR UPPER(TRIM(COALESCE(pr.role, ''))) IN ('ADMIN', 'SUPER', 'SUPERVISOR')
      );

    IF v_recipients IS NOT NULL AND array_length(v_recipients, 1) > 0 THEN
      PERFORM public.push_notifications(
        v_recipients,
        'checkout.return_submitted',
        'มีรายการแจ้งคืนพัสดุรอตรวจสอบรูปถ่าย',
        'คำสั่งยืม ' || v_order.order_number || ' มีการส่งคืนอุปกรณ์พร้อมรูปถ่ายหลักฐาน รอแอดมินตรวจสอบและกดยืนยันรับคืน',
        '/checkouts?tab=active',
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

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'completed', false,
    'pending_review', true,
    'message', 'ส่งข้อมูลแจ้งคืนพร้อมรูปถ่ายเรียบร้อยแล้ว รอผู้ดูแลระบบตรวจสอบและยืนยันการรับคืน',
    'returns', v_created_returns
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_return_order(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_return_order(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. RPC: public.confirm_checkout_return (Auto-backfill S/N & Cross-project S/N)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_checkout_return(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_order_id UUID;
  v_return_log_id UUID;
  v_log RECORD;
  v_order RECORD;
  v_checkout_item RECORD;
  v_dest_project_id UUID;
  v_dest_project_name TEXT;
  v_transfer_order_id UUID;
  v_new_returned_total NUMERIC;
  v_new_damaged_total NUMERIC;
  v_new_lost_total NUMERIC;
  v_new_consumed_total NUMERIC;
  v_all_returned BOOLEAN := true;
  v_has_pending_review BOOLEAN := false;
  v_has_claim_eligible BOOLEAN := false;
  v_confirmed_logs JSONB := '[]'::jsonb;
  v_recipients UUID[];
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.approve')
    OR public.is_super_admin(v_caller_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_caller_id
        AND p.status = 'active'
        AND UPPER(TRIM(COALESCE(p.role, ''))) IN ('ADMIN', 'SUPER', 'SUPERVISOR')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires admin or checkouts.approve permission to confirm return.';
  END IF;

  v_return_log_id := NULLIF(TRIM(COALESCE(p_payload->>'return_log_id', '')), '')::UUID;
  v_order_id := NULLIF(TRIM(COALESCE(p_payload->>'order_id', '')), '')::UUID;

  IF v_order_id IS NULL AND v_return_log_id IS NOT NULL THEN
    SELECT checkout_order_id INTO v_order_id
    FROM public.checkout_return_logs
    WHERE id = v_return_log_id;
  END IF;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรหัสคำสั่งยืมพัสดุสำหรับยืนยันการรับคืน';
  END IF;

  SELECT * INTO v_order
  FROM public.checkout_orders
  WHERE id = v_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคำสั่งยืมพัสดุ ID: %', v_order_id;
  END IF;

  FOR v_log IN
    SELECT *
    FROM public.checkout_return_logs
    WHERE checkout_order_id = v_order_id
      AND (v_return_log_id IS NULL OR id = v_return_log_id)
      AND verification_status = 'pending_review'
      AND COALESCE(is_reverted, FALSE) = FALSE
    ORDER BY returned_at ASC, id ASC
    FOR UPDATE
  LOOP
    IF v_log.evidence_photo_url IS NULL OR TRIM(v_log.evidence_photo_url) = '' THEN
      RAISE EXCEPTION 'ไม่สามารถยืนยันการรับคืนได้เนื่องจากไม่มีรูปถ่ายหลักฐาน (Return Log ID: %)', v_log.id;
    END IF;

    SELECT * INTO v_checkout_item
    FROM public.checkout_items
    WHERE id = v_log.checkout_item_id AND checkout_order_id = v_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ไม่พบรายการอุปกรณ์ที่ยืม ID: %', v_log.checkout_item_id;
    END IF;

    IF (
      COALESCE(v_checkout_item.quantity_returned, 0)
      + COALESCE(v_checkout_item.quantity_damaged, 0)
      + COALESCE(v_checkout_item.quantity_lost, 0)
      + COALESCE(v_checkout_item.quantity_consumed, 0)
      + v_log.returned_quantity
    ) > v_checkout_item.quantity_borrowed THEN
      RAISE EXCEPTION 'จำนวนที่ยืนยันรับคืนเกินกว่าจำนวนที่ยืมไปสำหรับรายการ %', v_checkout_item.id;
    END IF;

    -- Auto-backfill serial number into checkout_items if quantity_borrowed = 1 and checkout_items.serial_number is empty
    IF v_checkout_item.quantity_borrowed = 1
       AND (v_checkout_item.serial_number IS NULL OR TRIM(v_checkout_item.serial_number) = '')
       AND v_log.returned_serial_number IS NOT NULL THEN
      v_checkout_item.serial_number := v_log.returned_serial_number;
    END IF;

    v_dest_project_id := COALESCE(v_log.destination_project_id, v_order.project_id);

    IF v_log.item_condition = 'normal' THEN
      v_new_returned_total := COALESCE(v_checkout_item.quantity_returned, 0) + v_log.returned_quantity;
      v_new_damaged_total := COALESCE(v_checkout_item.quantity_damaged, 0);
      v_new_lost_total := COALESCE(v_checkout_item.quantity_lost, 0);
      v_new_consumed_total := COALESCE(v_checkout_item.quantity_consumed, 0);

      IF v_dest_project_id = v_order.project_id THEN
        INSERT INTO public.stock_transactions (
          project_id, item_id, transaction_type, quantity, reference_id, reference_type, created_by, notes
        ) VALUES (
          v_dest_project_id, v_checkout_item.item_id, 'return_in', v_log.returned_quantity, v_order_id, 'checkout_return', v_caller_id,
          'ยืนยันรับคืนอุปกรณ์จากการยืม: คำสั่งยืม ' || v_order.order_number
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
          order_id, item_id, quantity, serial_number, notes
        ) VALUES (
          v_transfer_order_id, v_checkout_item.item_id, v_log.returned_quantity,
          COALESCE(v_log.returned_serial_number, v_checkout_item.serial_number),
          'รับคืนอุปกรณ์จากการยืม ' || v_order.order_number
        );

        INSERT INTO public.stock_transactions (
          project_id, item_id, transaction_type, quantity, reference_id, reference_type, created_by, notes
        ) VALUES (
          v_dest_project_id, v_checkout_item.item_id, 'stock_in', v_log.returned_quantity, v_order_id, 'checkout_return', v_caller_id,
          'ยืนยันรับคืนอุปกรณ์จากการยืม ' || v_order.order_number || ' สู่โครงการ ' || COALESCE(v_dest_project_name, '')
        );
      END IF;
    ELSIF v_log.item_condition IN ('damaged', 'needs_repair') THEN
      v_new_returned_total := COALESCE(v_checkout_item.quantity_returned, 0);
      v_new_damaged_total := COALESCE(v_checkout_item.quantity_damaged, 0) + v_log.returned_quantity;
      v_new_lost_total := COALESCE(v_checkout_item.quantity_lost, 0);
      v_new_consumed_total := COALESCE(v_checkout_item.quantity_consumed, 0);
      v_has_claim_eligible := true;
    ELSIF v_log.item_condition = 'lost' THEN
      v_new_returned_total := COALESCE(v_checkout_item.quantity_returned, 0);
      v_new_damaged_total := COALESCE(v_checkout_item.quantity_damaged, 0);
      v_new_lost_total := COALESCE(v_checkout_item.quantity_lost, 0) + v_log.returned_quantity;
      v_new_consumed_total := COALESCE(v_checkout_item.quantity_consumed, 0);
    ELSIF v_log.item_condition = 'consumed' THEN
      v_new_returned_total := COALESCE(v_checkout_item.quantity_returned, 0);
      v_new_damaged_total := COALESCE(v_checkout_item.quantity_damaged, 0);
      v_new_lost_total := COALESCE(v_checkout_item.quantity_lost, 0);
      v_new_consumed_total := COALESCE(v_checkout_item.quantity_consumed, 0) + v_log.returned_quantity;
      v_has_claim_eligible := true;
    END IF;

    -- Update checkout_items counters, status, and serial_number (with auto-backfill support)
    UPDATE public.checkout_items
    SET
      quantity_returned = v_new_returned_total,
      quantity_damaged = v_new_damaged_total,
      quantity_lost = v_new_lost_total,
      quantity_consumed = v_new_consumed_total,
      serial_number = COALESCE(v_checkout_item.serial_number, serial_number),
      status = CASE
        WHEN (v_new_returned_total + v_new_damaged_total + v_new_lost_total + v_new_consumed_total) >= quantity_borrowed THEN 'returned'
        ELSE 'borrowed'
      END
    WHERE id = v_checkout_item.id;

    UPDATE public.checkout_return_logs
    SET
      verification_status = 'confirmed',
      received_by = v_caller_id,
      verified_by = v_caller_id,
      verified_at = now()
    WHERE id = v_log.id;

    v_confirmed_logs := v_confirmed_logs || jsonb_build_object(
      'return_log_id', v_log.id,
      'checkout_item_id', v_log.checkout_item_id,
      'item_id', v_checkout_item.item_id,
      'returned_quantity', v_log.returned_quantity,
      'condition', v_log.item_condition,
      'returned_serial_number', v_log.returned_serial_number,
      'evidence_photo_url', v_log.evidence_photo_url,
      'verification_status', 'confirmed'
    );
  END LOOP;

  IF jsonb_array_length(v_confirmed_logs) = 0 THEN
    RAISE EXCEPTION 'ไม่พบรายการแจ้งคืนที่รอการยืนยัน';
  END IF;

  -- Check if all items in the order have now been confirmed returned/accounted for
  FOR v_checkout_item IN SELECT * FROM public.checkout_items WHERE checkout_order_id = v_order_id
  LOOP
    IF (
      COALESCE(v_checkout_item.quantity_returned, 0)
      + COALESCE(v_checkout_item.quantity_damaged, 0)
      + COALESCE(v_checkout_item.quantity_lost, 0)
      + COALESCE(v_checkout_item.quantity_consumed, 0)
    ) < v_checkout_item.quantity_borrowed THEN
      v_all_returned := false;
    END IF;
  END LOOP;

  SELECT EXISTS (
    SELECT 1 FROM public.checkout_return_logs
    WHERE checkout_order_id = v_order_id
      AND verification_status = 'pending_review'
      AND COALESCE(is_reverted, FALSE) = FALSE
  ) INTO v_has_pending_review;

  IF v_all_returned AND NOT v_has_pending_review THEN
    UPDATE public.checkout_orders
    SET status = 'completed', actual_returned_date = now()
    WHERE id = v_order_id;
  ELSE
    UPDATE public.checkout_orders
    SET status = 'partial_returned'
    WHERE id = v_order_id;
  END IF;

  -- Push CAIM notification if any confirmed items are damaged/consumed/needs_repair
  IF v_has_claim_eligible THEN
    BEGIN
      SELECT array_agg(pr.id)
        INTO v_recipients
      FROM public.profiles pr
      WHERE pr.status = 'active'
        AND (
          public.has_permission(pr.id, 'checkouts.resolve_repair')
          OR public.has_permission(pr.id, 'checkouts.return')
          OR public.has_permission(pr.id, 'stock_in.create')
          OR public.is_super_admin(pr.id)
          OR UPPER(TRIM(COALESCE(pr.role, ''))) IN ('ADMIN', 'SUPER')
        );

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
      RAISE WARNING '[confirm_checkout_return] notification push failed: %', SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'completed', (v_all_returned AND NOT v_has_pending_review),
    'message', CASE
      WHEN v_all_returned AND NOT v_has_pending_review THEN 'ยืนยันรับคืนอุปกรณ์ครบถ้วนเรียบร้อยแล้ว'
      ELSE 'ยืนยันการรับคืนพัสดุสำเร็จ'
    END,
    'returns', v_confirmed_logs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_checkout_return(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_checkout_return(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RPC: public.confirm_caim_inbound_resolution (Connect returned_serial_number)
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
  v_item_serial TEXT;
  v_scrap_id UUID;
  v_stock_in_order UUID;
  v_item_name TEXT;
  v_disposal_method TEXT;
  v_qty NUMERIC;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.resolve_repair') 
    OR public.has_permission(v_caller_id, 'stock_in.create')
    OR public.is_super_admin(v_caller_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = v_caller_id AND r.code IN ('ADMIN', 'SUPER')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.resolve_repair, stock_in.create, or Admin privilege.';
  END IF;

  v_return_log_id := (p_payload->>'return_log_id')::UUID;
  v_action := COALESCE(NULLIF(TRIM(p_payload->>'action'), ''), 'confirm');
  v_custom_notes := NULLIF(TRIM(p_payload->>'notes'), '');

  IF v_return_log_id IS NULL THEN
    RAISE EXCEPTION 'return_log_id is required';
  END IF;

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

  -- Mutual Exclusion: If resolved in-house, prevent double stock-in
  IF v_return.repair_resolution_status <> 'unresolved' THEN
    RAISE EXCEPTION 'รายการนี้ได้รับการจัดการซ่อมภายในไปแล้ว (สถานะ: %)', v_return.repair_resolution_status;
  END IF;

  v_payload := COALESCE(v_return.caim_inbound_payload, '{}'::jsonb);
  v_repair := v_return.caim_repair_result;
  v_ticket_id := v_return.caim_ticket_id;
  v_serial := NULLIF(TRIM(v_payload->>'serialNo'), '');
  v_new_serial := NULLIF(TRIM(COALESCE(v_payload->>'replacedNewSerialNo', v_payload->>'newSerialNo')), '');
  v_closed_at := COALESCE(v_return.caim_closed_at, now());
  v_closed_by := COALESCE(NULLIF(TRIM(v_payload->>'closedBy'), ''), 'CAIM Claim Center');
  v_disposal_method := COALESCE(NULLIF(TRIM(v_payload->>'disposalMethod'), ''), 'electronic_waste');
  v_qty := COALESCE(v_return.returned_quantity, 1);

  -- Respect cross-warehouse return destination
  SELECT COALESCE(v_return.destination_project_id, co.project_id) INTO v_project_id
  FROM public.checkout_orders co WHERE co.id = v_return.checkout_order_id;

  SELECT ci.item_id, ci.serial_number INTO v_item_id, v_item_serial
  FROM public.checkout_items ci WHERE ci.id = v_return.checkout_item_id;

  IF v_project_id IS NULL OR v_item_id IS NULL THEN
    RAISE EXCEPTION 'Return log % is missing project_id or item_id', v_return.id;
  END IF;

  SELECT name INTO v_item_name FROM public.items WHERE id = v_item_id;

  -- Action: Reject resolution
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

  -- Action: Return to internal repair queue
  IF v_action = 'retry_internal' THEN
    UPDATE public.checkout_return_logs
    SET caim_inbound_status = 'retried_internal',
        caim_inbound_processed_at = NULL,
        repair_resolution_status = 'unresolved',
        damage_notes = COALESCE(damage_notes, '') || ' [CAIM ปฏิเสธเคลม: ส่งกลับเข้าคิวซ่อมภายใน - ' || COALESCE(v_custom_notes, '-') || ']'
    WHERE id = v_return.id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'retried_internal',
      'resolution', 'retry_internal',
      'message', 'ส่งอุปกรณ์กลับเข้าคิวรอจัดการ/ซ่อมภายในเรียบร้อยแล้ว'
    );
  END IF;

  -- Action: Confirm / Scrap
  IF v_repair = 'unrepairable' OR (v_repair = 'rejected' AND v_action IN ('confirm', 'scrap')) THEN
    INSERT INTO public.scrap_disposal_items (
      checkout_return_log_id, checkout_order_id, project_id, item_id, quantity,
      serial_number, reason, disposal_method, caim_ticket_id, caim_closed_at, closed_by, notes
    ) VALUES (
      v_return.id, v_return.checkout_order_id, v_project_id, v_item_id, v_qty,
      COALESCE(v_return.returned_serial_number, v_return.replaced_serial_number, v_serial, v_item_serial),
      COALESCE(v_custom_notes, v_payload->>'technicianNotes', v_payload->>'notes', 
        CASE WHEN v_repair = 'rejected' THEN 'ถูกปฏิเสธเคลมจากศูนย์บริการ CAIM (' || v_ticket_id || ')'
             ELSE 'ซ่อมไม่ได้จากงานเคลม CAIM (' || v_ticket_id || ')' END),
      v_disposal_method, v_ticket_id, v_closed_at,
      v_closed_by,
      COALESCE(v_custom_notes, v_payload->>'technicianNotes', v_payload->>'notes')
    ) RETURNING id INTO v_scrap_id;

    UPDATE public.checkout_return_logs
    SET caim_inbound_status = 'confirmed',
        caim_inbound_processed_at = now(),
        caim_scrap_disposal_id = v_scrap_id,
        repair_resolution_status = 'scrapped',
        damage_notes = COALESCE(damage_notes, '') || ' [แทงจำหน่ายของเสีย' || CASE WHEN v_repair = 'rejected' THEN ' (CAIM ปฏิเสธเคลม)' ELSE '' END || ': ' || COALESCE(v_custom_notes, '-') || ']'
    WHERE id = v_return.id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'confirmed',
      'resolution', 'scrap_disposed',
      'scrap_disposal_id', v_scrap_id,
      'message', 'บันทึกลงทะเบียนของเสียเรียบร้อยแล้ว (สต็อกไม่เปลี่ยนแปลง)'
    );

  ELSE
    -- Case: Repaired / Replaced New -> stock_in (Stock +1)
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
      order_id, item_id, quantity, serial_number, notes
    ) VALUES (
      v_stock_in_order, v_item_id, v_qty,
      COALESCE(v_new_serial, v_return.returned_serial_number, v_return.replaced_serial_number, v_serial, v_item_serial),
      'รับเข้าจากการเคลม CAIM Ticket ' || v_ticket_id || ' (' || v_repair || ')'
    );

    INSERT INTO public.stock_transactions (
      project_id, item_id, transaction_type, quantity, reference_id, reference_type, created_by, notes
    ) VALUES (
      v_project_id, v_item_id, 'stock_in', v_qty, v_stock_in_order, 'claim_return', v_caller_id,
      'รับอุปกรณ์คืนจากงานเคลม CAIM Ticket ' || v_ticket_id || ' (' || v_repair || ')'
    );

    UPDATE public.checkout_return_logs
    SET caim_inbound_status = 'confirmed',
        caim_inbound_processed_at = now(),
        caim_stock_in_order_id = v_stock_in_order,
        repair_resolution_status = 'restored_to_stock',
        damage_notes = COALESCE(damage_notes, '') || ' [รับเข้าคลังเรียบร้อย: ' || COALESCE(v_custom_notes, '-') || ']'
    WHERE id = v_return.id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'confirmed',
      'resolution', 'stock_in',
      'stock_in_order_id', v_stock_in_order,
      'message', 'รับอุปกรณ์เข้าคลังเรียบร้อยแล้ว (+' || v_qty::TEXT || ' หน่วย)'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_caim_inbound_resolution(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_caim_inbound_resolution(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. RPC: public.resolve_damaged_return_item (Connect returned_serial_number)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_damaged_return_item(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_return_log_id UUID := NULLIF(TRIM(COALESCE(p_payload->>'return_log_id', '')), '')::UUID;
  v_resolution TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_payload->>'resolution', '')), ''), 'restored_to_stock');
  v_project_id UUID := NULLIF(TRIM(COALESCE(p_payload->>'project_id', '')), '')::UUID;
  v_storage_location_id UUID := NULLIF(TRIM(COALESCE(p_payload->>'storage_location_id', '')), '')::UUID;
  v_repair_notes TEXT := NULLIF(TRIM(COALESCE(p_payload->>'repair_notes', '')), '');
  v_reference TEXT := NULLIF(TRIM(COALESCE(p_payload->>'reference_number', '')), '');
  v_serial TEXT := NULLIF(TRIM(COALESCE(p_payload->>'serial_number', '')), '');
  v_disposal_method TEXT := NULLIF(TRIM(COALESCE(p_payload->>'disposal_method', '')), '');
  v_spare_item_id UUID := NULLIF(TRIM(COALESCE(p_payload->>'spare_part_item_id', '')), '')::UUID;
  v_spare_qty NUMERIC := COALESCE(NULLIF(TRIM(COALESCE(p_payload->>'spare_part_quantity', '')), '')::NUMERIC, 1);
  v_harvest_item_id UUID := NULLIF(TRIM(COALESCE(p_payload->>'harvested_item_id', '')), '')::UUID;
  v_harvest_qty NUMERIC := COALESCE(NULLIF(TRIM(COALESCE(p_payload->>'harvested_quantity', '')), '')::NUMERIC, 1);
  v_quantity NUMERIC;
  v_log RECORD;
  v_item_id UUID;
  v_item_serial TEXT;
  v_order_number TEXT;
  v_order_project_id UUID;
  v_available NUMERIC;
  v_stock_in_order UUID;
  v_harvest_order UUID;
  v_scrap_id UUID;
  v_caller_name TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.resolve_repair')
    OR public.has_permission(v_caller_id, 'checkouts.return')
    OR public.has_permission(v_caller_id, 'stock_in.create')
    OR public.is_super_admin(v_caller_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = v_caller_id AND r.code IN ('ADMIN', 'SUPER')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.resolve_repair, checkouts.return, or stock_in.create permission.';
  END IF;

  IF v_return_log_id IS NULL THEN
    RAISE EXCEPTION 'return_log_id is required';
  END IF;

  IF v_resolution NOT IN ('restored_to_stock', 'parts_harvested', 'scrapped') THEN
    RAISE EXCEPTION 'Unsupported resolution: %', v_resolution;
  END IF;

  SELECT * INTO v_log
  FROM public.checkout_return_logs
  WHERE id = v_return_log_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบรายการรับคืน ID: %', v_return_log_id;
  END IF;

  -- Allow damaged, needs_repair, OR consumed items that have returned from CAIM with retried_internal
  IF v_log.item_condition NOT IN ('damaged', 'needs_repair') AND v_log.caim_inbound_status <> 'retried_internal' THEN
    RAISE EXCEPTION 'จัดการซ่อมได้เฉพาะรายการที่รับคืนสภาพชำรุด/ส่งซ่อม หรือตีกลับจาก CAIM เท่านั้น (สภาพปัจจุบัน: %)', v_log.item_condition;
  END IF;

  IF v_log.repair_resolution_status <> 'unresolved' THEN
    RAISE EXCEPTION 'รายการนี้ถูกบันทึกผลการซ่อมไปแล้ว (สถานะ: %)', v_log.repair_resolution_status;
  END IF;

  -- Mutual Exclusion: Disallow in-house repair while pending confirmation in CAIM
  IF v_log.caim_inbound_status = 'pending_confirmation' THEN
    RAISE EXCEPTION 'รายการนี้อยู่ระหว่างรอการยืนยันผลเคลมจาก CAIM ไม่สามารถซ่อมภายในได้';
  END IF;

  IF v_log.caim_ticket_id IS NOT NULL AND v_log.caim_inbound_status NOT IN ('none', 'rejected', 'retried_internal', 'internal_repair') THEN
    RAISE EXCEPTION 'รายการนี้ถูกส่งเคลม CAIM แล้ว (Ticket: %) ไม่สามารถซ่อมภายในได้', v_log.caim_ticket_id;
  END IF;

  IF v_log.caim_stock_in_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'รายการนี้ถูกรับเข้าคลังผ่านงานเคลม CAIM แล้ว ไม่สามารถคืนสต็อกซ้ำได้';
  END IF;

  IF v_log.caim_scrap_disposal_id IS NOT NULL THEN
    RAISE EXCEPTION 'รายการนี้ถูกแทงจำหน่ายผ่านงานเคลม CAIM แล้ว ไม่สามารถดำเนินการซ้ำได้';
  END IF;

  SELECT ci.item_id, ci.serial_number, co.project_id, co.order_number
  INTO v_item_id, v_item_serial, v_order_project_id, v_order_number
  FROM public.checkout_items ci
  JOIN public.checkout_orders co ON co.id = ci.checkout_order_id
  WHERE ci.id = v_log.checkout_item_id;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการอุปกรณ์ต้นทางของ return log %', v_return_log_id;
  END IF;

  v_project_id := COALESCE(v_project_id, v_log.destination_project_id, v_order_project_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุคลัง/โครงการปลายทางที่รับอุปกรณ์กลับเข้าสต็อก';
  END IF;

  v_quantity := COALESCE(NULLIF(TRIM(COALESCE(p_payload->>'quantity', '')), '')::NUMERIC, v_log.returned_quantity, 1);
  IF v_quantity <= 0 OR v_quantity > v_log.returned_quantity THEN
    RAISE EXCEPTION 'จำนวนที่บันทึกผลไม่ถูกต้อง (ระบุ: %, คืนไว้: %)', v_quantity, v_log.returned_quantity;
  END IF;

  SELECT full_name INTO v_caller_name FROM public.profiles WHERE id = v_caller_id;

  -- 1. Restored to stock
  IF v_resolution = 'restored_to_stock' THEN
    -- Check spare part if enabled
    IF v_spare_item_id IS NOT NULL THEN
      IF v_spare_qty <= 0 THEN
        RAISE EXCEPTION 'จำนวนอะไหล่ที่ใช้ต้องมากกว่า 0';
      END IF;

      SELECT current_stock INTO v_available
      FROM public.v_current_stock
      WHERE project_id = v_project_id AND item_id = v_spare_item_id;

      IF COALESCE(v_available, 0) < v_spare_qty THEN
        RAISE EXCEPTION 'อะไหล่ชิ้นส่วนคงเหลือไม่พอ (มีอยู่: %, ต้องการใช้: %)', COALESCE(v_available, 0), v_spare_qty;
      END IF;

      INSERT INTO public.stock_transactions (
        project_id, item_id, quantity, transaction_type, reference_type, reference_id, created_by, notes
      ) VALUES (
        v_project_id, v_spare_item_id, -v_spare_qty, 'withdrawal', 'spare_part_usage', v_return_log_id, v_caller_id,
        'ตัดใช้อะไหล่ซ่อมอุปกรณ์คืนจากใบยืม ' || COALESCE(v_order_number, '-')
      );
    END IF;

    INSERT INTO public.stock_in_orders (
      project_id, supplier, notes, received_date, created_by
    ) VALUES (
      v_project_id,
      'ซ่อมภายในคลัง — อ้างอิงใบยืม ' || COALESCE(v_order_number, '-'),
      'รับเข้าอุปกรณ์ที่ซ่อมเสร็จแล้ว | ' || COALESCE(v_repair_notes, '-'),
      CURRENT_DATE,
      v_caller_id
    ) RETURNING id INTO v_stock_in_order;

    INSERT INTO public.stock_in_items (
      order_id, item_id, quantity, serial_number, notes
    ) VALUES (
      v_stock_in_order, v_item_id, v_quantity,
      COALESCE(v_serial, v_log.returned_serial_number, v_log.replaced_serial_number, v_item_serial),
      'อุปกรณ์ที่ซ่อมเสร็จจากรายการรับคืน ' || v_return_log_id::TEXT
    );

    INSERT INTO public.stock_transactions (
      project_id, item_id, quantity, transaction_type, reference_type, reference_id, created_by, notes
    ) VALUES (
      v_project_id, v_item_id, v_quantity, 'stock_in', 'damaged_repair_restore', v_return_log_id, v_caller_id,
      'รับคืนอุปกรณ์ที่ผ่านการซ่อมแล้วเข้าสต็อก'
    );

  -- 2. Scrapped or Parts Harvested
  ELSE
    INSERT INTO public.scrap_disposal_items (
      checkout_return_log_id, checkout_order_id, project_id, item_id, quantity,
      serial_number, reason, disposal_method, notes, closed_by
    ) VALUES (
      v_return_log_id, v_log.checkout_order_id, v_project_id, v_item_id, v_quantity,
      COALESCE(v_serial, v_log.returned_serial_number, v_log.replaced_serial_number, v_item_serial),
      COALESCE(v_repair_notes, 'ซ่อมไม่ได้ / แยกอะไหล่'),
      COALESCE(v_disposal_method, 'electronic_waste'),
      v_repair_notes,
      COALESCE(v_caller_name, 'In-house Technician')
    ) RETURNING id INTO v_scrap_id;

    -- Parts harvested: stock-in good components
    IF v_resolution = 'parts_harvested' AND v_harvest_item_id IS NOT NULL THEN
      IF v_harvest_qty <= 0 THEN
        RAISE EXCEPTION 'จำนวนชิ้นส่วนที่แยกได้ต้องมากกว่า 0';
      END IF;

      INSERT INTO public.stock_in_orders (
        project_id, supplier, notes, received_date, created_by
      ) VALUES (
        v_project_id,
        'Parts Harvest — ใบยืม ' || COALESCE(v_order_number, '-'),
        'รับเข้าชิ้นส่วนจากการแยกอะไหล่ | ' || COALESCE(v_repair_notes, '-'),
        CURRENT_DATE,
        v_caller_id
      ) RETURNING id INTO v_harvest_order;

      INSERT INTO public.stock_in_items (
        order_id, item_id, quantity, notes
      ) VALUES (
        v_harvest_order, v_harvest_item_id, v_harvest_qty,
        'ชิ้นส่วนที่แยกได้จากอุปกรณ์คืนชำรุด ' || v_return_log_id::TEXT
      );

      INSERT INTO public.stock_transactions (
        project_id, item_id, quantity, transaction_type, reference_type, reference_id, created_by, notes
      ) VALUES (
        v_project_id, v_harvest_item_id, v_harvest_qty, 'stock_in', 'parts_harvest_in', v_return_log_id, v_caller_id,
        'รับเข้าชิ้นส่วนจากการแยกอะไหล่อุปกรณ์ชำรุด'
      );
    END IF;
  END IF;

  UPDATE public.checkout_return_logs
  SET repair_resolution_status = v_resolution,
      repair_resolved_at = now(),
      repair_resolved_by = v_caller_id,
      repair_notes = v_repair_notes,
      repair_stock_in_order_id = v_stock_in_order,
      repair_scrap_disposal_id = v_scrap_id,
      spare_part_item_id = v_spare_item_id,
      spare_part_quantity = CASE WHEN v_spare_item_id IS NOT NULL THEN v_spare_qty ELSE NULL END
  WHERE id = v_return_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'return_log_id', v_return_log_id,
    'resolution', v_resolution,
    'stock_in_order_id', v_stock_in_order,
    'scrap_disposal_id', v_scrap_id,
    'harvest_order_id', v_harvest_order,
    'message', CASE
      WHEN v_resolution = 'restored_to_stock' THEN 'บันทึกซ่อมเสร็จและรับคืนเข้าสต็อกเรียบร้อยแล้ว'
      WHEN v_resolution = 'parts_harvested' THEN 'บันทึกแยกอะไหล่และรับชิ้นส่วนดีเข้าสต็อกเรียบร้อยแล้ว'
      ELSE 'บันทึกแทงจำหน่ายของเสียเรียบร้อยแล้ว'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_damaged_return_item(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_damaged_return_item(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. RPC: public.update_checkout_item_serial (Sync returned_serial_number)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_checkout_item_serial(UUID, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.update_checkout_item_serial(
  p_checkout_item_id UUID,
  p_new_serial_number TEXT,
  p_reason TEXT,
  p_return_log_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_new_serial TEXT := NULLIF(TRIM(p_new_serial_number), '');
  v_reason TEXT := NULLIF(TRIM(p_reason), '');
  v_item RECORD;
  v_order RECORD;
  v_log RECORD;
  v_old_serial TEXT;
  v_actor_role TEXT;
  v_ip TEXT;
  v_user_agent TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_permission(v_caller_id, 'checkouts.edit_serial') OR public.is_super_admin(v_caller_id)) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Requires checkouts.edit_serial permission' USING ERRCODE = '42501';
  END IF;

  IF p_checkout_item_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: checkout_item_id is required' USING ERRCODE = '22023';
  END IF;

  IF v_new_serial IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: new_serial cannot be empty' USING ERRCODE = '22023';
  END IF;

  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: reason must be at least 3 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item
  FROM public.checkout_items
  WHERE id = p_checkout_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout item not found: %', p_checkout_item_id USING ERRCODE = 'P0002';
  END IF;

  v_old_serial := v_item.serial_number;

  SELECT * INTO v_order
  FROM public.checkout_orders
  WHERE id = v_item.checkout_order_id;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'INVALID_ORDER_STATUS: Cannot edit serial for cancelled order' USING ERRCODE = '22000';
  END IF;

  IF p_return_log_id IS NOT NULL THEN
    SELECT * INTO v_log
    FROM public.checkout_return_logs
    WHERE id = p_return_log_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Return log not found: %', p_return_log_id USING ERRCODE = 'P0002';
    END IF;

    IF (v_log.caim_ticket_id IS NOT NULL OR v_log.caim_sync_status = 'synced') THEN
      IF NOT public.is_super_admin(v_caller_id) THEN
        RAISE EXCEPTION 'CAIM_ALREADY_SYNCED: Cannot edit serial for claim that has already been synced to CAIM (Ticket: %). Requires SUPER role.', v_log.caim_ticket_id USING ERRCODE = '42501';
      END IF;
    END IF;

    -- If condition is consumed, update replaced_serial_number without overwriting checkout_items.serial_number
    IF v_log.item_condition = 'consumed' THEN
      UPDATE public.checkout_return_logs
      SET replaced_serial_number = v_new_serial
      WHERE id = p_return_log_id;
    ELSE
      UPDATE public.checkout_return_logs
      SET returned_serial_number = v_new_serial,
          replaced_serial_number = COALESCE(replaced_serial_number, v_new_serial)
      WHERE id = p_return_log_id;

      UPDATE public.checkout_items
      SET serial_number = v_new_serial
      WHERE id = p_checkout_item_id;
    END IF;
  ELSE
    UPDATE public.checkout_items
    SET serial_number = v_new_serial
    WHERE id = p_checkout_item_id;
  END IF;

  SELECT COALESCE(r.code, p.role, 'STAFF') INTO v_actor_role
  FROM public.profiles p
  LEFT JOIN public.roles r ON p.role_id = r.id
  WHERE p.id = v_caller_id;

  BEGIN
    v_ip := public.request_header('x-forwarded-for');
    v_user_agent := public.request_header('user-agent');
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
    v_user_agent := NULL;
  END;

  INSERT INTO public.checkout_audit_logs (
    checkout_order_id, action, actor_id, actor_role, details, ip_address, user_agent
  ) VALUES (
    v_item.checkout_order_id,
    'serial_number_updated',
    v_caller_id,
    v_actor_role,
    jsonb_build_object(
      'checkout_item_id', p_checkout_item_id,
      'return_log_id', p_return_log_id,
      'item_condition', v_log.item_condition,
      'old_serial', v_old_serial,
      'new_serial', v_new_serial,
      'reason', v_reason
    ),
    v_ip,
    v_user_agent
  );

  RETURN jsonb_build_object(
    'success', true,
    'checkout_item_id', p_checkout_item_id,
    'return_log_id', p_return_log_id,
    'old_serial', v_old_serial,
    'new_serial', v_new_serial,
    'updated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_checkout_item_serial(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_checkout_item_serial(UUID, TEXT, TEXT, UUID) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
