-- Migration 104: Allow Relative Storage Object Keys in Return Orders (R2 / S3 SSOT)
-- ---------------------------------------------------------------------------
-- CONTEXT:
--   1. Previously, migration 101/103 enforced that v_evidence_photo_url in process_return_order
--      must start with 'http://' or 'https://'.
--   2. Under the Zero-Egress Storage Architecture, databases store ONLY relative object keys
--      (e.g., 'attachments/return_CHK-202611-0007_...jpg') rather than hardcoded full CDN URLs.
--   3. This migration updates public.process_return_order to accept both relative object keys
--      and absolute URLs, validating that a valid, non-empty photo identifier is supplied.
-- ---------------------------------------------------------------------------

BEGIN;

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

    -- Requirement: Every returned item MUST have 1 proof-of-return photo attached (accepts relative object keys and full URLs)
    IF v_evidence_photo_url IS NULL OR TRIM(v_evidence_photo_url) = '' THEN
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

    -- Insert Return Log in 'pending_review' status with returned_serial_number and evidence_photo_url
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

INSERT INTO supabase_migrations.schema_migrations(version)
VALUES ('104')
ON CONFLICT (version) DO NOTHING;

COMMIT;
