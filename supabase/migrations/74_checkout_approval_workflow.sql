-- Migration 74: Checkout Approval Workflow and Self-Service Requisition Control
-- Enables staff self-service checkout requisitions with pending approval state,
-- atomic approval with stock deduction, rejection handling, and auditable approver signatures.

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. SCHEMA UPDATES: checkout_orders & checkout_items
-- ------------------------------------------------------------------------------

-- Update checkout_orders status check constraint to include 'pending' and 'rejected'
ALTER TABLE public.checkout_orders 
  DROP CONSTRAINT IF EXISTS checkout_orders_status_check;

ALTER TABLE public.checkout_orders 
  ADD CONSTRAINT checkout_orders_status_check 
  CHECK (status IN ('pending', 'active', 'partial_returned', 'completed', 'overdue', 'cancelled', 'rejected'));

-- Add approver and rejector tracking columns
ALTER TABLE public.checkout_orders 
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_checkout_orders_approved_by 
  ON public.checkout_orders(approved_by);

CREATE INDEX IF NOT EXISTS idx_checkout_orders_rejected_by 
  ON public.checkout_orders(rejected_by);

-- Update checkout_items status check constraint to include 'pending' and 'rejected'
ALTER TABLE public.checkout_items 
  DROP CONSTRAINT IF EXISTS checkout_items_status_check;

ALTER TABLE public.checkout_items 
  ADD CONSTRAINT checkout_items_status_check 
  CHECK (status IN ('pending', 'borrowed', 'returned', 'damaged', 'lost', 'rejected'));

-- ------------------------------------------------------------------------------
-- 2. RBAC: REGISTER 'checkouts.approve' PERMISSION
-- ------------------------------------------------------------------------------

INSERT INTO public.permissions (code, name, description, module, action, category)
VALUES (
  'checkouts.approve',
  'อนุมัติและจ่ายพัสดุยืม',
  'ตรวจสอบและอนุมัติคำขอยืมพัสดุและตัดสต็อก',
  'checkouts',
  'approve',
  'Checkouts & Returns'
)
ON CONFLICT (code) DO UPDATE 
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    action = EXCLUDED.action,
    category = EXCLUDED.category;

-- Assign 'checkouts.approve' to ADMIN, SUPERVISOR, and SUPER roles by default
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE UPPER(TRIM(r.code)) IN ('ADMIN', 'SUPERVISOR', 'SUPER')
  AND p.code = 'checkouts.approve'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. RLS HARDENING: checkout_orders & checkout_items
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authorized manage checkout_orders" ON public.checkout_orders;
CREATE POLICY "Authorized manage checkout_orders" ON public.checkout_orders
  FOR ALL TO authenticated
  USING (
    public.has_permission(auth.uid(), 'checkouts.update') OR 
    public.has_permission(auth.uid(), 'checkouts.create') OR 
    public.has_permission(auth.uid(), 'checkouts.view') OR 
    public.has_permission(auth.uid(), 'checkouts.approve') OR 
    borrower_id = auth.uid() OR
    created_by = auth.uid() OR
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'checkouts.update') OR 
    public.has_permission(auth.uid(), 'checkouts.create') OR 
    public.has_permission(auth.uid(), 'checkouts.approve') OR 
    borrower_id = auth.uid() OR
    created_by = auth.uid() OR
    public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Authorized manage checkout_items" ON public.checkout_items;
CREATE POLICY "Authorized manage checkout_items" ON public.checkout_items
  FOR ALL TO authenticated
  USING (
    public.has_permission(auth.uid(), 'checkouts.update') OR 
    public.has_permission(auth.uid(), 'checkouts.create') OR 
    public.has_permission(auth.uid(), 'checkouts.view') OR 
    public.has_permission(auth.uid(), 'checkouts.approve') OR 
    EXISTS (
      SELECT 1 FROM public.checkout_orders co 
      WHERE co.id = checkout_items.checkout_order_id 
        AND (co.borrower_id = auth.uid() OR co.created_by = auth.uid())
    ) OR
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'checkouts.update') OR 
    public.has_permission(auth.uid(), 'checkouts.create') OR 
    public.has_permission(auth.uid(), 'checkouts.approve') OR 
    public.is_super_admin(auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 4. ATOMIC RPC: process_checkout_order (SUPPORT SELF-SERVICE & DIRECT POS)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_checkout_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_project_id UUID;
  v_borrower_id UUID;
  v_borrower_type TEXT;
  v_borrower_name TEXT;
  v_borrower_phone TEXT;
  v_borrower_department TEXT;
  v_borrow_type TEXT;
  v_expected_return_date DATE;
  v_purpose TEXT;
  v_notes TEXT;
  v_items JSONB;
  v_order_number TEXT;
  v_order_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_qty NUMERIC;
  v_serial TEXT;
  v_condition TEXT;
  v_avail NUMERIC;
  v_item_name TEXT;
  v_borrower_profile RECORD;
  v_is_approver BOOLEAN := FALSE;
  v_initial_status TEXT;
  v_item_status TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.create')
    OR public.has_permission(v_caller_id, 'checkouts.approve')
    OR public.is_super_admin(v_caller_id)
    OR public.is_checkout_delegate(v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.create permission.';
  END IF;

  -- Determine if caller is an authorized approver/delegate (Direct Checkout)
  v_is_approver := (
    public.is_super_admin(v_caller_id)
    OR public.is_checkout_delegate(v_caller_id)
    OR public.has_permission(v_caller_id, 'checkouts.approve')
  );

  v_project_id := NULLIF(p_payload->>'project_id', '')::UUID;
  v_borrower_type := COALESCE(NULLIF(TRIM(p_payload->>'borrower_type'), ''), 'profile');
  v_borrow_type := COALESCE(NULLIF(TRIM(p_payload->>'borrow_type'), ''), 'standard');
  v_expected_return_date := NULLIF(p_payload->>'expected_return_date', '')::DATE;
  v_purpose := NULLIF(TRIM(COALESCE(p_payload->>'purpose', '')), '');
  v_notes := NULLIF(TRIM(COALESCE(p_payload->>'notes', '')), '');
  v_items := p_payload->'items';

  IF v_borrower_type NOT IN ('profile', 'external') THEN
    RAISE EXCEPTION 'ประเภทผู้ยืมไม่ถูกต้อง (ต้องเป็น profile หรือ external)';
  END IF;

  IF v_borrower_type = 'external' THEN
    IF NOT v_is_approver THEN
      RAISE EXCEPTION 'Permission denied: only ADMIN or SUPER can checkout for a person outside the system.';
    END IF;

    v_borrower_id := NULL;
    v_borrower_name := TRIM(COALESCE(p_payload->>'borrower_name', ''));
    v_borrower_phone := NULLIF(TRIM(COALESCE(p_payload->>'borrower_phone', '')), '');
    v_borrower_department := NULLIF(TRIM(COALESCE(p_payload->>'borrower_department', '')), '');
  ELSE
    v_borrower_id := NULLIF(p_payload->>'borrower_id', '')::UUID;
    v_borrower_id := COALESCE(v_borrower_id, v_caller_id);

    IF v_borrower_id <> v_caller_id AND NOT v_is_approver THEN
      RAISE EXCEPTION 'Permission denied: regular users may only checkout for their own account.';
    END IF;

    SELECT
      p.id,
      p.full_name,
      p.phone,
      p.department,
      p.status
    INTO v_borrower_profile
    FROM public.profiles p
    WHERE p.id = v_borrower_id;

    IF NOT FOUND OR v_borrower_profile.status <> 'active' THEN
      RAISE EXCEPTION 'The selected checkout user is not an active user.';
    END IF;

    v_borrower_name := TRIM(COALESCE(v_borrower_profile.full_name, ''));
    v_borrower_phone := NULLIF(TRIM(COALESCE(v_borrower_profile.phone, '')), '');
    v_borrower_department := NULLIF(
      TRIM(COALESCE(NULLIF(TRIM(p_payload->>'borrower_department'), ''), v_borrower_profile.department, '')),
      ''
    );
  END IF;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุโครงการหรือคลังสินค้าต้นทาง';
  END IF;

  IF v_borrower_name = '' THEN
    IF v_borrower_type = 'external' THEN
      RAISE EXCEPTION 'กรุณาระบุชื่อบุคคลภายนอกระบบ';
    ELSE
      RAISE EXCEPTION 'ไม่พบชื่อผู้ยืมในข้อมูลบัญชี';
    END IF;
  END IF;

  IF v_borrow_type = 'standard' THEN
    IF v_expected_return_date IS NULL THEN
      RAISE EXCEPTION 'กรุณาระบุกำหนดวันส่งคืน';
    END IF;
  ELSIF v_borrow_type = 'indefinite' THEN
    v_expected_return_date := NULL;
  ELSE
    RAISE EXCEPTION 'ประเภทการยืมไม่ถูกต้อง (ต้องเป็น standard หรือ indefinite)';
  END IF;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'ต้องมีรายการวัสดุ/เครื่องมืออย่างน้อย 1 รายการ';
  END IF;

  -- Validate the current balance before creating order
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_item_id := NULLIF(v_item->>'item_id', '')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;

    IF v_item_id IS NULL THEN
      RAISE EXCEPTION 'พบรายการที่ไม่ระบุรหัสวัสดุ (Item ID is missing)';
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'จำนวนที่ขอยืมต้องมากกว่า 0';
    END IF;

    SELECT name INTO v_item_name
    FROM public.items
    WHERE id = v_item_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ไม่พบข้อมูลรายการวัสดุ ID: %', v_item_id;
    END IF;

    IF v_is_approver THEN
      -- Direct checkout: Lock row in stock_balance
      SELECT balance INTO v_avail
      FROM public.stock_balance
      WHERE project_id = v_project_id AND item_id = v_item_id
      FOR UPDATE;
    ELSE
      -- Self-service requisition: check balance without locking
      SELECT balance INTO v_avail
      FROM public.stock_balance
      WHERE project_id = v_project_id AND item_id = v_item_id;
    END IF;

    IF COALESCE(v_avail, 0) < v_qty THEN
      RAISE EXCEPTION 'ยอดสต็อกคงเหลือในโครงการไม่เพียงพอสำหรับ "%" (คงเหลือ % ชิ้น, ต้องการยืม % ชิ้น)',
        v_item_name, COALESCE(v_avail, 0), v_qty;
    END IF;
  END LOOP;

  v_order_number := 'CHK-' || to_char(now(), 'YYYYMM') || '-' || lpad(floor(random() * 9000 + 1000)::TEXT, 4, '0');

  -- If caller is Admin/Approver, order is immediately active & approved
  -- If caller is regular staff, order enters 'pending' workflow
  IF v_is_approver THEN
    v_initial_status := 'active';
    v_item_status := 'borrowed';
  ELSE
    v_initial_status := 'pending';
    v_item_status := 'pending';
  END IF;

  INSERT INTO public.checkout_orders (
    order_number,
    project_id,
    borrower_id,
    borrower_name,
    borrower_phone,
    borrower_department,
    checkout_date,
    expected_return_date,
    borrow_type,
    status,
    purpose,
    notes,
    created_by,
    approved_by,
    approved_at
  ) VALUES (
    v_order_number,
    v_project_id,
    v_borrower_id,
    v_borrower_name,
    v_borrower_phone,
    v_borrower_department,
    now(),
    v_expected_return_date,
    v_borrow_type,
    v_initial_status,
    v_purpose,
    v_notes,
    v_caller_id,
    CASE WHEN v_is_approver THEN v_caller_id ELSE NULL END,
    CASE WHEN v_is_approver THEN now() ELSE NULL END
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_serial := NULLIF(TRIM(COALESCE(v_item->>'serial_number', '')), '');
    v_condition := COALESCE(NULLIF(TRIM(v_item->>'condition'), ''), 'normal');

    INSERT INTO public.checkout_items (
      checkout_order_id,
      item_id,
      serial_number,
      quantity_borrowed,
      quantity_returned,
      condition_on_checkout,
      status,
      notes
    ) VALUES (
      v_order_id,
      v_item_id,
      v_serial,
      v_qty,
      0,
      v_condition,
      v_item_status,
      NULLIF(TRIM(COALESCE(v_item->>'notes', '')), '')
    );

    -- Only deduct stock immediately if Direct Checkout by Approver
    IF v_is_approver THEN
      INSERT INTO public.stock_transactions (
        project_id,
        item_id,
        transaction_type,
        quantity,
        reference_id,
        reference_type,
        created_by,
        notes
      ) VALUES (
        v_project_id,
        v_item_id,
        'checkout_out',
        v_qty,
        v_order_id,
        'checkout_order',
        v_caller_id,
        'ยืมอุปกรณ์: คำสั่งยืม ' || v_order_number
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'status', v_initial_status,
    'borrower_type', v_borrower_type,
    'borrower_id', v_borrower_id,
    'borrow_type', v_borrow_type,
    'message', CASE 
      WHEN v_is_approver THEN 'สร้างคำสั่งยืม ' || v_order_number || ' และจ่ายพัสดุสำเร็จเรียบร้อย'
      ELSE 'ยื่นคำขอยืม ' || v_order_number || ' เรียบร้อยแล้ว รอเจ้าหน้าที่ตรวจสอบและอนุมัติ'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_checkout_order(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_checkout_order(JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. ATOMIC RPC: approve_checkout_order (APPROVE & DISPENSE ITEMS)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_checkout_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_order_id UUID;
  v_order RECORD;
  v_item RECORD;
  v_available NUMERIC;
  v_item_name TEXT;
  v_notes TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.approve')
    OR public.is_super_admin(v_caller_id)
    OR public.is_checkout_delegate(v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.approve permission.';
  END IF;

  v_order_id := NULLIF(p_payload->>'order_id', '')::UUID;
  v_notes := NULLIF(TRIM(COALESCE(p_payload->>'notes', '')), '');

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุรหัสคำขอยืม (order_id is required)';
  END IF;

  -- Row lock the checkout order to prevent double-approval race conditions
  SELECT * INTO v_order 
  FROM public.checkout_orders 
  WHERE id = v_order_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลคำขอยืมพัสดุ ID: %', v_order_id;
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติ (สถานะปัจจุบัน: %)', v_order.status;
  END IF;

  -- Row lock items and project balances in deterministic order to prevent deadlock
  PERFORM 1 FROM public.items i
  WHERE i.id IN (SELECT ci.item_id FROM public.checkout_items ci WHERE ci.checkout_order_id = v_order_id)
  ORDER BY i.id
  FOR UPDATE;

  PERFORM 1 FROM public.stock_balance sb
  WHERE sb.project_id = v_order.project_id
    AND sb.item_id IN (SELECT ci.item_id FROM public.checkout_items ci WHERE ci.checkout_order_id = v_order_id)
  ORDER BY sb.item_id
  FOR UPDATE;

  -- Validate stock sufficiency and deduct stock for each checkout item
  FOR v_item IN 
    SELECT ci.id AS item_row_id, ci.item_id, ci.quantity_borrowed, ci.serial_number, i.name AS item_name
    FROM public.checkout_items ci
    JOIN public.items i ON i.id = ci.item_id
    WHERE ci.checkout_order_id = v_order_id
    ORDER BY ci.id
  LOOP
    SELECT balance INTO v_available
    FROM public.stock_balance
    WHERE project_id = v_order.project_id AND item_id = v_item.item_id;

    IF COALESCE(v_available, 0) < v_item.quantity_borrowed THEN
      RAISE EXCEPTION 'ยอดสต็อกคงเหลือไม่เพียงพอสำหรับ "%" (คงเหลือ % ชิ้น, ต้องการจ่าย % ชิ้น)',
        v_item.item_name, COALESCE(v_available, 0), v_item.quantity_borrowed;
    END IF;

    -- Record stock deduction transaction
    INSERT INTO public.stock_transactions (
      project_id,
      item_id,
      transaction_type,
      quantity,
      reference_id,
      reference_type,
      created_by,
      notes
    ) VALUES (
      v_order.project_id,
      v_item.item_id,
      'checkout_out',
      v_item.quantity_borrowed,
      v_order.id,
      'checkout_order',
      v_caller_id,
      'อนุมัติและจ่ายอุปกรณ์: คำสั่งยืม ' || v_order.order_number
    );

    -- Update line item status to 'borrowed'
    UPDATE public.checkout_items
    SET status = 'borrowed'
    WHERE id = v_item.item_row_id;
  END LOOP;

  -- Update order status to active with approver identity
  UPDATE public.checkout_orders
  SET 
    status = 'active',
    approved_by = v_caller_id,
    approved_at = now(),
    notes = CASE 
      WHEN v_notes IS NOT NULL AND v_order.notes IS NOT NULL THEN v_order.notes || E'\n[อนุมัติโดยเจ้าหน้าที่]: ' || v_notes
      WHEN v_notes IS NOT NULL THEN '[อนุมัติโดยเจ้าหน้าที่]: ' || v_notes
      ELSE v_order.notes
    END
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order.order_number,
    'status', 'active',
    'approved_by', v_caller_id,
    'approved_at', now(),
    'message', 'อนุมัติและจ่ายพัสดุสำหรับคำขอยืม ' || v_order.order_number || ' สำเร็จเรียบร้อย'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_checkout_order(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_checkout_order(JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. ATOMIC RPC: reject_checkout_order (REJECT PENDING REQUISITIONS)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reject_checkout_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_order_id UUID;
  v_order RECORD;
  v_reason TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.approve')
    OR public.is_super_admin(v_caller_id)
    OR public.is_checkout_delegate(v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.approve permission.';
  END IF;

  v_order_id := NULLIF(p_payload->>'order_id', '')::UUID;
  v_reason := NULLIF(TRIM(COALESCE(p_payload->>'rejection_reason', '')), '');

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุรหัสคำขอยืม (order_id is required)';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุเหตุผลในการปฏิเสธคำขอยืม';
  END IF;

  -- Lock order row
  SELECT * INTO v_order 
  FROM public.checkout_orders 
  WHERE id = v_order_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลคำขอยืมพัสดุ ID: %', v_order_id;
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติ (สถานะปัจจุบัน: %)', v_order.status;
  END IF;

  -- Update checkout_orders status to rejected
  UPDATE public.checkout_orders
  SET 
    status = 'rejected',
    rejected_by = v_caller_id,
    rejected_at = now(),
    rejection_reason = v_reason
  WHERE id = v_order_id;

  -- Update line items status to rejected
  UPDATE public.checkout_items
  SET status = 'rejected'
  WHERE checkout_order_id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order.order_number,
    'status', 'rejected',
    'rejected_by', v_caller_id,
    'rejected_at', now(),
    'message', 'ปฏิเสธคำขอยืม ' || v_order.order_number || ' เรียบร้อยแล้ว'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_checkout_order(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_checkout_order(JSONB) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
