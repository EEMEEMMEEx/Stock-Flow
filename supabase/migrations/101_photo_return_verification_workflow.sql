-- Migration 101: Photo-Based Return Verification & Admin Confirmation Workflow
-- ---------------------------------------------------------------------------
-- CONTEXT:
--   1. Require the borrower to upload exactly 1 photo per returned item as proof of return.
--   2. Block the return submission until every returned item has its photo attached.
--   3. Add an admin review step: the admin views the photo and clicks "Confirm Return"
--      to complete the return. Only then update the item status to "returned" and
--      credit stock balance.
--
-- WHAT THIS MIGRATION DOES:
--   1. Ensures public.checkout_return_logs has:
--      - evidence_photo_url TEXT
--      - verification_status TEXT NOT NULL DEFAULT 'confirmed' CHECK ('pending_review', 'confirmed', 'rejected')
--      - submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
--      - verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
--      - verified_at TIMESTAMPTZ
--      - rejection_reason TEXT
--   2. Updates RLS policy on public.checkout_return_logs so borrowers, returners,
--      and admins/approvers can view and submit return logs.
--   3. Updates public.process_return_order(p_payload JSONB):
--      - Enforces that every returned item has a non-empty evidence_photo_url.
--      - Inserts checkout_return_logs with verification_status = 'pending_review'.
--      - Does NOT mark checkout_items.status = 'returned' or credit stock until
--        an admin confirms the return.
--   4. Creates public.confirm_checkout_return(p_payload JSONB):
--      - Requires admin / checkouts.approve permission.
--      - Confirms pending return logs (single log or all pending logs on an order),
--        updates checkout_items counters & status = 'returned', credits stock_transactions
--        (for normal condition), and updates checkout_orders.status.
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Schema Updates on public.checkout_return_logs
-- ---------------------------------------------------------------------------
ALTER TABLE public.checkout_return_logs
  ADD COLUMN IF NOT EXISTS evidence_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS is_reverted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.checkout_return_logs'::regclass
      AND conname = 'checkout_return_logs_verification_status_check'
  ) THEN
    ALTER TABLE public.checkout_return_logs
      ADD CONSTRAINT checkout_return_logs_verification_status_check
      CHECK (verification_status IN ('pending_review', 'confirmed', 'rejected')) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.checkout_return_logs
  VALIDATE CONSTRAINT checkout_return_logs_verification_status_check;

CREATE INDEX IF NOT EXISTS idx_checkout_return_logs_pending_review
  ON public.checkout_return_logs (checkout_order_id, returned_at DESC)
  WHERE verification_status = 'pending_review' AND is_reverted = FALSE;

-- ---------------------------------------------------------------------------
-- 2. RLS Policy Update on public.checkout_return_logs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authorized manage checkout_return_logs" ON public.checkout_return_logs;
CREATE POLICY "Authorized manage checkout_return_logs" ON public.checkout_return_logs
  FOR ALL TO authenticated
  USING (
    public.has_permission(auth.uid(), 'checkouts.return')
    OR public.has_permission(auth.uid(), 'checkouts.approve')
    OR public.has_permission(auth.uid(), 'checkouts.view')
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
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.checkout_orders co
      WHERE co.id = checkout_return_logs.checkout_order_id
        AND (co.borrower_id = auth.uid() OR co.created_by = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. RPC: public.process_return_order (Submit Return with Mandatory Photo Proof)
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
    v_evidence_photo_url := NULLIF(TRIM(COALESCE(v_ret->>'evidence_photo_url', '')), '');

    IF v_return_qty IS NULL OR v_return_qty <= 0 THEN
      CONTINUE;
    END IF;

    -- Requirement 1 & 2: Every returned item MUST have 1 proof-of-return photo attached
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

    -- Insert Return Log in 'pending_review' status.
    -- Item status remains 'borrowed' and stock is NOT credited until Admin clicks "Confirm Return".
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
-- 4. RPC: public.confirm_checkout_return (Admin Photo Review & Confirm Return)
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

  -- Requirement 3: Only Admin / Approver can review photo and confirm return
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
          order_id, item_id, quantity, notes
        ) VALUES (
          v_transfer_order_id, v_checkout_item.item_id, v_log.returned_quantity,
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

    -- Requirement 3: Only now update checkout_items quantities and status to 'returned'
    UPDATE public.checkout_items
    SET
      quantity_returned = v_new_returned_total,
      quantity_damaged = v_new_damaged_total,
      quantity_lost = v_new_lost_total,
      quantity_consumed = v_new_consumed_total,
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

COMMIT;
