-- ===========================================================================
-- Migration 102: Fix Scrap System, CAIM State Machine, Constraints & Security
-- ---------------------------------------------------------------------------
-- 1. Fix CHECK constraint on checkout_return_logs.caim_inbound_status to allow
--    'retried_internal' and 'internal_repair'
-- 2. Fix confirm_caim_inbound_resolution:
--    - Set repair_resolution_status = 'restored_to_stock' (fixes SQL 23514 crash)
--    - Remove nonexistent public.is_admin(uuid) call (fixes SQL 42883)
--    - Correct cross-warehouse destination project: COALESCE(v_return.destination_project_id, co.project_id)
--    - Action 'retry_internal': set caim_inbound_status = 'retried_internal' and caim_inbound_processed_at = NULL
--    - Support technicianNotes, replacedNewSerialNo, disposalMethod
--    - Preserve replaced_serial_number on return log as original defective S/N
-- 3. Fix process_caim_webhook_event:
--    - Remove nonexistent public.is_admin(uuid) in notification recipients
--    - Guard against double stock-in if repair_resolution_status <> 'unresolved'
-- 4. Fix resolve_damaged_return_item:
--    - Support items returning from CAIM with caim_inbound_status = 'retried_internal' (including consumed)
--    - Add mutual exclusion guards against active CAIM claims
--    - Populate closed_by with actor name in scrap_disposal_items
-- 5. Add mark_return_for_internal_repair RPC for Tab 1 triage
-- 6. Fix update_checkout_item_serial:
--    - For 'consumed' condition, update ONLY replaced_serial_number; do not overwrite checkout_items.serial_number
-- 7. Fix RLS on scrap_disposal_items and checkout_return_logs
-- ===========================================================================

BEGIN;

-- 1. Update caim_inbound_status CHECK constraint
ALTER TABLE public.checkout_return_logs
  DROP CONSTRAINT IF EXISTS checkout_return_logs_caim_inbound_status_check;

ALTER TABLE public.checkout_return_logs
  ADD CONSTRAINT checkout_return_logs_caim_inbound_status_check
  CHECK (caim_inbound_status IN ('none', 'pending_confirmation', 'confirmed', 'rejected', 'retried_internal', 'internal_repair'));

-- 2. Secure scrap_disposal_items RLS
DROP POLICY IF EXISTS "scrap_disposal_items_read" ON public.scrap_disposal_items;
DROP POLICY IF EXISTS "scrap_disposal_items_auth_select" ON public.scrap_disposal_items;
DROP POLICY IF EXISTS "scrap_disposal_items_insert" ON public.scrap_disposal_items;
DROP POLICY IF EXISTS "scrap_disposal_items_update" ON public.scrap_disposal_items;
DROP POLICY IF EXISTS "scrap_disposal_items_delete" ON public.scrap_disposal_items;
DROP POLICY IF EXISTS "scrap_disposal_items_select_policy" ON public.scrap_disposal_items;
DROP POLICY IF EXISTS "scrap_disposal_items_admin_modify_policy" ON public.scrap_disposal_items;

CREATE POLICY "scrap_disposal_items_select_policy"
  ON public.scrap_disposal_items
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'scrap.view')
    OR public.has_permission(auth.uid(), 'checkouts.resolve_repair')
    OR public.has_permission(auth.uid(), 'stock_in.create')
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid() AND r.code IN ('ADMIN', 'SUPER')
    )
  );

CREATE POLICY "scrap_disposal_items_admin_modify_policy"
  ON public.scrap_disposal_items
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
  );

-- 3. Extend checkout_return_logs SELECT/MANAGE RLS to scrap.view and repair roles
DROP POLICY IF EXISTS "Authorized manage checkout_return_logs" ON public.checkout_return_logs;
CREATE POLICY "Authorized manage checkout_return_logs" ON public.checkout_return_logs
  FOR ALL TO authenticated
  USING (
    public.has_permission(auth.uid(), 'checkouts.return')
    OR public.has_permission(auth.uid(), 'checkouts.approve')
    OR public.has_permission(auth.uid(), 'checkouts.view')
    OR public.has_permission(auth.uid(), 'scrap.view')
    OR public.has_permission(auth.uid(), 'checkouts.resolve_repair')
    OR public.has_permission(auth.uid(), 'stock_in.create')
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.checkout_orders co
      WHERE co.id = checkout_return_logs.checkout_order_id
        AND (co.borrower_id = auth.uid() OR co.created_by = auth.uid())
    )
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'checkouts.return')
    OR public.has_permission(auth.uid(), 'checkouts.approve')
    OR public.has_permission(auth.uid(), 'scrap.view')
    OR public.has_permission(auth.uid(), 'checkouts.resolve_repair')
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.checkout_orders co
      WHERE co.id = checkout_return_logs.checkout_order_id
        AND (co.borrower_id = auth.uid() OR co.created_by = auth.uid())
    )
  );

-- 4. RPC: mark_return_for_internal_repair
CREATE OR REPLACE FUNCTION public.mark_return_for_internal_repair(p_return_log_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_log RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.resolve_repair')
    OR public.has_permission(v_caller_id, 'scrap.view')
    OR public.is_super_admin(v_caller_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = v_caller_id AND r.code IN ('ADMIN', 'SUPER')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.resolve_repair or scrap.view permission.';
  END IF;

  SELECT * INTO v_log
  FROM public.checkout_return_logs
  WHERE id = p_return_log_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบรายการรับคืน ID: %', p_return_log_id;
  END IF;

  IF v_log.repair_resolution_status <> 'unresolved' THEN
    RAISE EXCEPTION 'รายการนี้ได้รับการจัดการผลซ่อมไปแล้ว (สถานะ: %)', v_log.repair_resolution_status;
  END IF;

  IF v_log.caim_ticket_id IS NOT NULL AND v_log.caim_inbound_status NOT IN ('none', 'rejected', 'retried_internal') THEN
    RAISE EXCEPTION 'รายการนี้ถูกส่งเคลม CAIM แล้ว ไม่สามารถย้ายเข้าคิวซ่อมภายในได้โดยตรง';
  END IF;

  UPDATE public.checkout_return_logs
  SET caim_inbound_status = 'internal_repair',
      damage_notes = COALESCE(damage_notes, '') || ' [ส่งเข้าคิวซ่อมภายใน]'
  WHERE id = p_return_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'return_log_id', p_return_log_id,
    'status', 'internal_repair',
    'message', 'ย้ายอุปกรณ์เข้าคิวซ่อมภายในเรียบร้อยแล้ว'
  );
END;
$$;

-- 5. Update process_caim_webhook_event
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
  v_notif_title TEXT;
  v_notif_message TEXT;
BEGIN
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

  IF v_event_type IS NULL OR v_event_type NOT IN ('claim.closed', 'claim.rejected') THEN
    RAISE EXCEPTION 'Unsupported event: %', COALESCE(v_event_type, '(null)');
  END IF;

  IF v_repair IS NULL OR v_repair NOT IN ('unrepairable', 'repaired', 'replaced_new', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported repairResult: %', COALESCE(v_repair, '(null)');
  END IF;

  IF v_event_id IS NULL THEN
    v_event_id := 'caim:' || v_ticket_id || ':' || v_repair;
  END IF;

  v_closed_at := CASE
    WHEN p_payload->>'closedAt' IS NOT NULL THEN (p_payload->>'closedAt')::TIMESTAMPTZ
    ELSE now()
  END;

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

    -- Mutual Exclusion: If in-house repair already resolved it, block CAIM inbound confirmation
    IF v_return.repair_resolution_status <> 'unresolved' THEN
      UPDATE public.caim_webhook_logs
      SET status = 'conflict',
          message = 'รายการนี้ถูกจัดการซ่อมภายในไปแล้ว (' || v_return.repair_resolution_status || ') ไม่สามารถรับผลเคลมซ้ำได้',
          processed_at = now()
      WHERE id = v_log_id;

      RETURN jsonb_build_object(
        'success', false,
        'processed', false,
        'event_id', v_event_id,
        'status', 'conflict',
        'message', 'รายการนี้ถูกจัดการซ่อมภายในไปแล้ว ไม่สามารถรับผลเคลมซ้ำได้'
      );
    END IF;

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

    -- Push notification safely (without nonexistent is_admin)
    BEGIN
      SELECT array_agg(pr.id)
        INTO v_recipients
      FROM public.profiles pr
      LEFT JOIN public.roles r ON r.id = pr.role_id
      WHERE pr.status = 'active'
        AND (public.has_permission(pr.id, 'checkouts.resolve_repair') 
             OR public.has_permission(pr.id, 'stock_in.create')
             OR public.has_permission(pr.id, 'scrap.view')
             OR public.is_super_admin(pr.id)
             OR r.code IN ('ADMIN', 'SUPER'));

      IF v_recipients IS NOT NULL AND array_length(v_recipients, 1) > 0 THEN
        IF v_repair = 'rejected' THEN
          v_notif_title := 'CAIM ปฏิเสธการเคลม (Ticket ' || v_ticket_id || ')';
          v_notif_message := 'Ticket ' || v_ticket_id || ' ถูกปฏิเสธการเคลมจากศูนย์บริการ กรุณาตรวจสอบและดำเนินการที่หน้า Scrap';
        ELSE
          v_notif_title := 'ผลการเคลม/ซ่อมจาก CAIM พร้อมให้ตรวจสอบ';
          v_notif_message := 'Ticket ' || v_ticket_id || ' (' || v_repair || ') มีผลการซ่อมส่งกลับมาแล้ว รอการยืนยันที่หน้า Scrap';
        END IF;

        PERFORM public.push_notifications(
          v_recipients,
          'caim.claim_closed',
          v_notif_title,
          v_notif_message,
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

-- 6. Update confirm_caim_inbound_resolution
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
      COALESCE(v_return.replaced_serial_number, v_serial, v_item_serial),
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
      COALESCE(v_new_serial, v_return.replaced_serial_number, v_serial, v_item_serial),
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

-- 7. Update resolve_damaged_return_item
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
      COALESCE(v_serial, v_log.replaced_serial_number, v_item_serial),
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
      COALESCE(v_serial, v_log.replaced_serial_number, v_item_serial),
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
        'ชิ้นส่วนที่ยังใช้งานได้จากการแยกอะไหล่ ' || v_return_log_id::TEXT
      );

      INSERT INTO public.stock_transactions (
        project_id, item_id, quantity, transaction_type, reference_type, reference_id, created_by, notes
      ) VALUES (
        v_project_id, v_harvest_item_id, v_harvest_qty, 'stock_in', 'parts_harvest', v_return_log_id, v_caller_id,
        'รับเข้าชิ้นส่วนที่ใช้งานได้จากการแยกอะไหล่'
      );
    END IF;
  END IF;

  UPDATE public.checkout_return_logs
  SET repair_resolution_status = v_resolution,
      repair_notes = v_repair_notes,
      repair_resolved_at = now(),
      repair_resolved_by = v_caller_id,
      restored_stock_in_order_id = v_stock_in_order,
      repair_scrap_disposal_id = v_scrap_id,
      spare_part_item_id = v_spare_item_id,
      spare_part_quantity = v_spare_qty
  WHERE id = v_return_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'return_log_id', v_return_log_id,
    'resolution', v_resolution,
    'quantity', v_quantity,
    'stock_in_order_id', v_stock_in_order,
    'scrap_disposal_id', v_scrap_id,
    'message', 'บันทึกผลการจัดการอุปกรณ์เรียบร้อยแล้ว'
  );
END;
$$;

-- 8. Fix update_checkout_item_serial: do not overwrite checkout_items on consumed returns
CREATE OR REPLACE FUNCTION public.update_checkout_item_serial(
  p_checkout_item_id UUID,
  p_new_serial TEXT,
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
  v_new_serial TEXT := NULLIF(TRIM(p_new_serial), '');
  v_reason TEXT := NULLIF(TRIM(p_reason), '');
  v_item RECORD;
  v_order RECORD;
  v_log RECORD;
  v_existing_id UUID;
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

    -- Update return log's replaced_serial_number
    UPDATE public.checkout_return_logs
    SET replaced_serial_number = v_new_serial
    WHERE id = p_return_log_id;

    -- If condition is consumed, DO NOT overwrite checkout_items.serial_number (which belongs to the new installed replacement!)
    IF v_log.item_condition <> 'consumed' THEN
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

COMMIT;

NOTIFY pgrst, 'reload schema';
