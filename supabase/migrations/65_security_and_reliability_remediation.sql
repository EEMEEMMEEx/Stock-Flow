-- ==============================================================================
-- Migration 65: Security, Reliability, and Database RPC Remediation
--
-- Findings Addressed:
-- 1. C4: Insecure RLS Policies (Lock down profiles, stock_transactions, items, orders)
-- 2. H2: checkout_orders / checkout_items atomic process_checkout_order RPC
-- 3. H3: checkout_return_logs atomic process_return_order RPC
-- 4. H4, H9: Atomic process_item_transfer with actor spoofing prevention
-- 5. H5: approve_inventory_request, reject_inventory_request, complete_inventory_request
--        with correct signatures, deadlock-free row locking, and SHORTAGE_DETECTED
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. RLS HARDENING: PROFILES TABLE
-- ------------------------------------------------------------------------------

-- Ensure profiles UPDATE policy is restricted to own user ID
DROP POLICY IF EXISTS "Allow auth mutate profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow self update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Trigger to prevent privilege escalation on profiles (role, role_id, status)
CREATE OR REPLACE FUNCTION public.trg_check_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  -- Only super admin or user with users.manage permission can change role, role_id, or status
  IF (NEW.role IS DISTINCT FROM OLD.role OR 
      NEW.role_id IS DISTINCT FROM OLD.role_id OR 
      NEW.status IS DISTINCT FROM OLD.status) THEN
    IF NOT (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'users.manage')) THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can modify user role, role_id, or account status.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER check_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_profile_privilege_escalation();

-- ------------------------------------------------------------------------------
-- 2. RLS HARDENING: STOCK TRANSACTIONS & ITEMS
-- ------------------------------------------------------------------------------

-- Stock transactions must never be directly mutated by non-admin users
DROP POLICY IF EXISTS "Allow auth mutate stock_transactions" ON public.stock_transactions;
DROP POLICY IF EXISTS "Admin only mutate stock_transactions" ON public.stock_transactions;

CREATE POLICY "Admin only mutate stock_transactions" ON public.stock_transactions
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Items master table should only be mutated by users with items.manage or admin
DROP POLICY IF EXISTS "Allow auth mutate items" ON public.items;
DROP POLICY IF EXISTS "Authorized users mutate items" ON public.items;

CREATE POLICY "Authorized users mutate items" ON public.items
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'items.manage') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_permission(auth.uid(), 'items.manage') OR public.is_super_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 3. RLS HARDENING: WITHDRAWAL ORDERS & ITEMS
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow auth mutate withdrawal_orders" ON public.withdrawal_orders;
DROP POLICY IF EXISTS "Users can insert withdrawal_orders" ON public.withdrawal_orders;
DROP POLICY IF EXISTS "Managers can update withdrawal_orders" ON public.withdrawal_orders;

CREATE POLICY "Users can insert withdrawal_orders" ON public.withdrawal_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid() OR 
    public.has_permission(auth.uid(), 'withdrawals.create') OR 
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "Managers can update withdrawal_orders" ON public.withdrawal_orders
  FOR UPDATE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'withdrawals.update') OR 
    public.has_permission(auth.uid(), 'inventory.approve') OR 
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'withdrawals.update') OR 
    public.has_permission(auth.uid(), 'inventory.approve') OR 
    public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Allow auth mutate withdrawal_items" ON public.withdrawal_items;
DROP POLICY IF EXISTS "Users can insert withdrawal_items" ON public.withdrawal_items;
DROP POLICY IF EXISTS "Managers can update withdrawal_items" ON public.withdrawal_items;

CREATE POLICY "Users can insert withdrawal_items" ON public.withdrawal_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.withdrawal_orders wo
      WHERE wo.id = order_id AND (wo.requested_by = auth.uid() OR public.is_super_admin(auth.uid()))
    )
  );

CREATE POLICY "Managers can update withdrawal_items" ON public.withdrawal_items
  FOR UPDATE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'inventory.approve') OR 
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'inventory.approve') OR 
    public.is_super_admin(auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 4. RLS HARDENING: CHECKOUT ORDERS & ITEMS
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow auth mutate checkout_orders" ON public.checkout_orders;
DROP POLICY IF EXISTS "Allow auth mutate checkout_items" ON public.checkout_items;
DROP POLICY IF EXISTS "Allow auth mutate checkout_return_logs" ON public.checkout_return_logs;
DROP POLICY IF EXISTS "Allow auth mutate checkout_extension_logs" ON public.checkout_extension_logs;

CREATE POLICY "Authorized manage checkout_orders" ON public.checkout_orders
  FOR ALL TO authenticated
  USING (
    public.has_permission(auth.uid(), 'checkouts.update') OR 
    public.has_permission(auth.uid(), 'checkouts.create') OR 
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'checkouts.update') OR 
    public.has_permission(auth.uid(), 'checkouts.create') OR 
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "Authorized manage checkout_items" ON public.checkout_items
  FOR ALL TO authenticated
  USING (
    public.has_permission(auth.uid(), 'checkouts.update') OR 
    public.has_permission(auth.uid(), 'checkouts.create') OR 
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'checkouts.update') OR 
    public.has_permission(auth.uid(), 'checkouts.create') OR 
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "Authorized manage checkout_return_logs" ON public.checkout_return_logs
  FOR ALL TO authenticated
  USING (
    public.has_permission(auth.uid(), 'checkouts.return') OR 
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'checkouts.return') OR 
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "Authorized manage checkout_extension_logs" ON public.checkout_extension_logs
  FOR ALL TO authenticated
  USING (
    public.has_permission(auth.uid(), 'checkouts.extend') OR 
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'checkouts.extend') OR 
    public.is_super_admin(auth.uid())
  );


-- ==============================================================================
-- 5. ATOMIC RPC: process_checkout_order (H2, H9)
-- ==============================================================================

DROP FUNCTION IF EXISTS public.process_checkout_order(JSONB) CASCADE;

CREATE OR REPLACE FUNCTION public.process_checkout_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_project_id UUID;
  v_borrower_name TEXT;
  v_borrower_phone TEXT;
  v_borrower_department TEXT;
  v_borrower_id UUID;
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
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_caller_id, 'checkouts.create') OR public.is_super_admin(v_caller_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.create permission.';
  END IF;

  v_project_id := (p_payload->>'project_id')::UUID;
  v_borrower_name := TRIM(COALESCE(p_payload->>'borrower_name', ''));
  v_borrower_phone := NULLIF(TRIM(COALESCE(p_payload->>'borrower_phone', '')), '');
  v_borrower_department := NULLIF(TRIM(COALESCE(p_payload->>'borrower_department', '')), '');
  v_borrower_id := NULLIF(p_payload->>'borrower_id', '')::UUID;
  v_expected_return_date := (p_payload->>'expected_return_date')::DATE;
  v_purpose := NULLIF(TRIM(COALESCE(p_payload->>'purpose', '')), '');
  v_notes := NULLIF(TRIM(COALESCE(p_payload->>'notes', '')), '');
  v_items := p_payload->'items';

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุโครงการหรือคลังสินค้าต้นทาง';
  END IF;

  IF v_borrower_name = '' THEN
    RAISE EXCEPTION 'กรุณาระบุชื่อผู้ยืมพัสดุ';
  END IF;

  IF v_expected_return_date IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุกำหนดวันส่งคืน';
  END IF;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'ต้องมีรายการวัสดุ/เครื่องมืออย่างน้อย 1 รายการ';
  END IF;

  -- 1. Validate & lock each item to verify available stock before creating order
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;

    IF v_item_id IS NULL THEN
      RAISE EXCEPTION 'พบรายการที่ไม่ระบุรหัสวัสดุ (Item ID is missing)';
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'จำนวนที่ขอยืมต้องมากกว่า 0';
    END IF;

    -- Lock the item record in items master
    SELECT name INTO v_item_name FROM public.items WHERE id = v_item_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ไม่พบข้อมูลรายการวัสดุ ID: %', v_item_id;
    END IF;

    -- Check current balance in project
    SELECT balance INTO v_avail
    FROM public.stock_balance
    WHERE project_id = v_project_id AND item_id = v_item_id;
    v_avail := COALESCE(v_avail, 0);

    IF v_avail < v_qty THEN
      RAISE EXCEPTION 'ยอดสต็อกคงเหลือในโครงการไม่เพียงพอสำหรับ "%" (คงเหลือ % ชิ้น, ต้องการยืม % ชิ้น)',
        v_item_name, v_avail, v_qty;
    END IF;
  END LOOP;

  -- 2. Generate Order Number
  v_order_number := 'CHK-' || to_char(now(), 'YYYYMM') || '-' || lpad(floor(random()*9000 + 1000)::text, 4, '0');

  -- 3. Insert checkout order
  INSERT INTO public.checkout_orders (
    order_number, project_id, borrower_id, borrower_name, borrower_phone,
    borrower_department, checkout_date, expected_return_date, status,
    purpose, notes, created_by
  ) VALUES (
    v_order_number, v_project_id, v_borrower_id, v_borrower_name, v_borrower_phone,
    v_borrower_department, now(), v_expected_return_date, 'active',
    v_purpose, v_notes, v_caller_id
  ) RETURNING id INTO v_order_id;

  -- 4. Insert items and write stock deduction ledger
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_serial := NULLIF(TRIM(COALESCE(v_item->>'serial_number', '')), '');
    v_condition := COALESCE(NULLIF(TRIM(v_item->>'condition'), ''), 'normal');

    INSERT INTO public.checkout_items (
      checkout_order_id, item_id, serial_number, quantity_borrowed,
      quantity_returned, condition_on_checkout, status, notes
    ) VALUES (
      v_order_id, v_item_id, v_serial, v_qty, 0, v_condition, 'borrowed', NULLIF(TRIM(COALESCE(v_item->>'notes', '')), '')
    );

    INSERT INTO public.stock_transactions (
      project_id, item_id, transaction_type, quantity, reference_id, reference_type, created_by, notes
    ) VALUES (
      v_project_id, v_item_id, 'checkout_out', v_qty, v_order_id, 'checkout_order', v_caller_id,
      'ยืมอุปกรณ์: คำสั่งยืม ' || v_order_number
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'message', 'สร้างคำสั่งยืม ' || v_order_number || ' สำเร็จเรียบร้อย'
  );
END;
$$;


-- ==============================================================================
-- 6. ATOMIC RPC: process_return_order (H3, H9)
-- ==============================================================================

DROP FUNCTION IF EXISTS public.process_return_order(JSONB) CASCADE;

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
  v_checkout_item RECORD;
  v_order RECORD;
  v_all_returned BOOLEAN := true;
  v_new_returned_total NUMERIC;
  v_new_damaged_total NUMERIC;
  v_new_lost_total NUMERIC;
  v_transfer_order_id UUID;
  v_dest_project_name TEXT;
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

  FOR v_ret IN SELECT * FROM jsonb_array_elements(v_returns)
  LOOP
    v_checkout_item_id := (v_ret->>'checkout_item_id')::UUID;
    v_return_qty := (v_ret->>'returned_quantity')::NUMERIC;
    v_condition := COALESCE(NULLIF(TRIM(v_ret->>'condition'), ''), 'normal');
    v_dest_project_id := COALESCE(NULLIF(v_ret->>'destination_project_id', '')::UUID, v_order.project_id);
    v_damage_notes := NULLIF(TRIM(COALESCE(v_ret->>'damage_notes', '')), '');

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

    IF (v_checkout_item.quantity_returned + v_checkout_item.quantity_damaged + v_checkout_item.quantity_lost + v_return_qty) > v_checkout_item.quantity_borrowed THEN
      RAISE EXCEPTION 'จำนวนที่รับคืนรวมเกินกว่าจำนวนที่ยืมไป (ยืม: %, รับคืนแล้ว: %, ต้องการคืนเพิ่ม: %)',
        v_checkout_item.quantity_borrowed,
        (v_checkout_item.quantity_returned + v_checkout_item.quantity_damaged + v_checkout_item.quantity_lost),
        v_return_qty;
    END IF;

    -- Insert Return Log
    INSERT INTO public.checkout_return_logs (
      checkout_order_id, checkout_item_id, returned_quantity,
      item_condition, destination_project_id, received_by, returned_at, damage_notes
    ) VALUES (
      v_order_id, v_checkout_item_id, v_return_qty, v_condition, v_dest_project_id, v_caller_id, now(), v_damage_notes
    );

    IF v_condition = 'normal' THEN
      v_new_returned_total := v_checkout_item.quantity_returned + v_return_qty;
      v_new_damaged_total := v_checkout_item.quantity_damaged;
      v_new_lost_total := v_checkout_item.quantity_lost;

      IF v_dest_project_id = v_order.project_id THEN
        -- Return to the same project
        INSERT INTO public.stock_transactions (
          project_id, item_id, transaction_type, quantity, reference_id, reference_type, created_by, notes
        ) VALUES (
          v_dest_project_id, v_checkout_item.item_id, 'return_in', v_return_qty, v_order_id, 'checkout_return', v_caller_id,
          'รับคืนอุปกรณ์จากการยืม: คำสั่งยืม ' || v_order.order_number
        );
      ELSE
        -- Returned to a different project: credit dest project via stock_in so view reflects accurately
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
    ELSIF v_condition = 'lost' THEN
      v_new_returned_total := v_checkout_item.quantity_returned;
      v_new_damaged_total := v_checkout_item.quantity_damaged;
      v_new_lost_total := v_checkout_item.quantity_lost + v_return_qty;
    END IF;

    UPDATE public.checkout_items SET
      quantity_returned = v_new_returned_total,
      quantity_damaged = v_new_damaged_total,
      quantity_lost = v_new_lost_total,
      status = CASE 
        WHEN (v_new_returned_total + v_new_damaged_total + v_new_lost_total) >= quantity_borrowed THEN 'returned'
        ELSE 'borrowed'
      END
    WHERE id = v_checkout_item_id;
  END LOOP;

  -- Check if all items in the order have been returned/accounted for
  FOR v_checkout_item IN SELECT * FROM public.checkout_items WHERE checkout_order_id = v_order_id
  LOOP
    IF (v_checkout_item.quantity_returned + v_checkout_item.quantity_damaged + v_checkout_item.quantity_lost) < v_checkout_item.quantity_borrowed THEN
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

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'completed', v_all_returned,
    'message', CASE WHEN v_all_returned THEN 'รับคืนอุปกรณ์ครบถ้วนเรียบร้อยแล้ว' ELSE 'บันทึกการรับคืนบางส่วนสำเร็จ' END
  );
END;
$$;


-- ==============================================================================
-- 7. ATOMIC RPC: process_item_transfer (H4, H9)
-- ==============================================================================

DROP FUNCTION IF EXISTS public.process_item_transfer(UUID, UUID, UUID, INTEGER, TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.process_item_transfer(JSONB) CASCADE;

CREATE OR REPLACE FUNCTION public.process_item_transfer(
  p_source_project_id UUID,
  p_dest_project_id UUID,
  p_item_id UUID,
  p_quantity NUMERIC,
  p_notes TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_item RECORD;
  v_source_project RECORD;
  v_dest_project RECORD;
  v_source_balance NUMERIC;
  v_transfer_in_order_id UUID;
BEGIN
  -- Strict actor verification to prevent actor spoofing
  IF v_caller_id IS NULL THEN
    IF p_actor_id IS NOT NULL AND current_setting('role') = 'service_role' THEN
      v_caller_id := p_actor_id;
    ELSE
      RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
    END IF;
  END IF;

  IF NOT (public.has_permission(v_caller_id, 'inventory.transfer') OR 
          public.has_permission(v_caller_id, 'inventory.manage') OR 
          public.is_super_admin(v_caller_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires inventory.transfer or inventory.manage permission.';
  END IF;

  IF p_source_project_id IS NULL OR p_dest_project_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุโครงการต้นทางและโครงการปลายทาง';
  END IF;

  IF p_source_project_id = p_dest_project_id THEN
    RAISE EXCEPTION 'โครงการต้นทางและปลายทางต้องไม่เป็นโครงการเดียวกัน';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'จำนวนที่ต้องการโอนย้ายต้องมากกว่า 0';
  END IF;

  -- Verify and lock item in items catalog
  SELECT * INTO v_item FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบรายการวัสดุ ID: %', p_item_id;
  END IF;

  -- Verify source and destination projects
  SELECT * INTO v_source_project FROM public.projects WHERE id = p_source_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบโครงการต้นทาง';
  END IF;

  SELECT * INTO v_dest_project FROM public.projects WHERE id = p_dest_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบโครงการปลายทาง';
  END IF;

  IF v_dest_project.status != 'active' THEN
    RAISE EXCEPTION 'โครงการปลายทางไม่ได้อยู่ในสถานะใช้งาน (Active)';
  END IF;

  -- Check available stock in source project
  SELECT balance INTO v_source_balance 
  FROM public.stock_balance 
  WHERE project_id = p_source_project_id AND item_id = p_item_id;
  v_source_balance := COALESCE(v_source_balance, 0);

  IF v_source_balance < p_quantity THEN
    RAISE EXCEPTION 'ยอดคงเหลือในโครงการต้นทางไม่เพียงพอ (คงเหลือ % %, ต้องการโอน % %)',
      v_source_balance, COALESCE(v_item.unit, 'ชิ้น'), p_quantity, COALESCE(v_item.unit, 'ชิ้น');
  END IF;

  -- 1. Deduct stock from source project via transfer_out transaction
  INSERT INTO public.stock_transactions (
    project_id, item_id, quantity, transaction_type,
    notes, created_by
  ) VALUES (
    p_source_project_id, p_item_id, p_quantity, 'transfer_out',
    'โอนย้ายไปยังโครงการ ' || v_dest_project.name || COALESCE(': ' || p_notes, ''),
    v_caller_id
  );

  -- 2. Credit stock to destination project via stock_in order & stock_in_items so view is always synchronized
  INSERT INTO public.stock_in_orders (
    project_id, supplier, notes, received_date, created_by
  ) VALUES (
    p_dest_project_id, 'Transfer from ' || v_source_project.name,
    'รับโอนจากโครงการ ' || v_source_project.name || COALESCE(': ' || p_notes, ''),
    CURRENT_DATE, v_caller_id
  ) RETURNING id INTO v_transfer_in_order_id;

  INSERT INTO public.stock_in_items (
    order_id, item_id, quantity, notes
  ) VALUES (
    v_transfer_in_order_id, p_item_id, p_quantity,
    'รับโอนจากโครงการ ' || v_source_project.name
  );

  INSERT INTO public.stock_transactions (
    project_id, item_id, quantity, transaction_type,
    notes, created_by
  ) VALUES (
    p_dest_project_id, p_item_id, p_quantity, 'stock_in',
    'รับโอนจากโครงการ ' || v_source_project.name || COALESCE(': ' || p_notes, ''),
    v_caller_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'item_id', p_item_id,
    'transferred_quantity', p_quantity,
    'source_project', v_source_project.name,
    'destination_project', v_dest_project.name,
    'message', 'โอนย้าย ' || v_item.name || ' จำนวน ' || p_quantity || ' ' || COALESCE(v_item.unit, 'ชิ้น') || ' สำเร็จ'
  );
END;
$$;

-- JSONB Overload for process_item_transfer
CREATE OR REPLACE FUNCTION public.process_item_transfer(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN public.process_item_transfer(
    (p_payload->>'source_project_id')::UUID,
    (p_payload->>'dest_project_id')::UUID,
    (p_payload->>'item_id')::UUID,
    (p_payload->>'quantity')::NUMERIC,
    p_payload->>'notes',
    NULLIF(p_payload->>'actor_id', '')::UUID
  );
END;
$$;


-- ==============================================================================
-- 8. ATOMIC WITHDRAWAL RPCS: approve, reject, complete (H5, H9)
-- ==============================================================================

DROP FUNCTION IF EXISTS public.approve_inventory_request(UUID, BOOLEAN, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.approve_withdrawal_order(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.approve_inventory_request(
  p_request_id UUID,
  p_allow_shortage BOOLEAN DEFAULT FALSE,
  p_override_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_order RECORD;
  v_item RECORD;
  v_available NUMERIC;
  v_requested NUMERIC;
  v_deduct NUMERIC;
  v_shortage NUMERIC;
  v_has_any_shortage BOOLEAN := FALSE;
  v_shortage_list JSONB := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_user_id, 'inventory.approve') OR 
          public.has_permission(v_user_id, 'withdrawals.approve') OR 
          public.is_super_admin(v_user_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires inventory.approve or withdrawals.approve permission.';
  END IF;

  SELECT * INTO v_order FROM public.withdrawal_orders WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found: %', p_request_id;
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending approval (current status: %)', v_order.status;
  END IF;

  -- Deadlock-free item row locking ordered by item_id
  PERFORM 1 FROM public.items i
  WHERE i.id IN (SELECT wi.item_id FROM public.withdrawal_items wi WHERE wi.order_id = p_request_id)
  ORDER BY i.id
  FOR UPDATE;

  -- Evaluate each requested item against current project stock_balance
  FOR v_item IN 
    SELECT wi.id as wi_id, wi.item_id, COALESCE(wi.requested_qty, wi.quantity) as requested_qty,
           i.name as item_name, i.sku, i.unit
    FROM public.withdrawal_items wi
    JOIN public.items i ON i.id = wi.item_id
    WHERE wi.order_id = p_request_id
    ORDER BY wi.id
  LOOP
    v_requested := v_item.requested_qty;

    SELECT balance INTO v_available
    FROM public.stock_balance
    WHERE project_id = v_order.project_id AND item_id = v_item.item_id;
    v_available := COALESCE(v_available, 0);

    IF v_available < v_requested THEN
      v_has_any_shortage := TRUE;
      v_shortage := v_requested - GREATEST(0, v_available);
      v_shortage_list := v_shortage_list || jsonb_build_object(
        'item_id', v_item.item_id,
        'item_name', v_item.item_name,
        'requested', v_requested,
        'available', v_available,
        'shortage', v_shortage
      );
    END IF;
  END LOOP;

  -- If shortages detected and shortage override was not granted, raise SHORTAGE_DETECTED
  IF v_has_any_shortage AND NOT p_allow_shortage THEN
    RAISE EXCEPTION 'SHORTAGE_DETECTED: %', jsonb_build_object('shortages', v_shortage_list)::text;
  END IF;

  -- Process deductions and line updates
  FOR v_item IN 
    SELECT wi.id as wi_id, wi.item_id, COALESCE(wi.requested_qty, wi.quantity) as requested_qty,
           i.name as item_name, i.sku, i.unit
    FROM public.withdrawal_items wi
    JOIN public.items i ON i.id = wi.item_id
    WHERE wi.order_id = p_request_id
    ORDER BY wi.id
  LOOP
    v_requested := v_item.requested_qty;

    SELECT balance INTO v_available
    FROM public.stock_balance
    WHERE project_id = v_order.project_id AND item_id = v_item.item_id;
    v_available := COALESCE(v_available, 0);

    IF v_available < v_requested THEN
      v_deduct := GREATEST(0, v_available);
      v_shortage := v_requested - v_deduct;
    ELSE
      v_deduct := v_requested;
      v_shortage := 0;
    END IF;

    UPDATE public.withdrawal_items
    SET approved_quantity = v_deduct,
        available_at_approval = v_available,
        deducted_quantity = v_deduct,
        shortage_quantity = v_shortage,
        is_shortage = (v_shortage > 0)
    WHERE id = v_item.wi_id;

    IF v_deduct > 0 THEN
      INSERT INTO public.stock_transactions (
        item_id, project_id, transaction_type, quantity, storage_location_id,
        created_by, reference_type, reference_id, notes
      ) VALUES (
        v_item.item_id, v_order.project_id, 'OUT', v_deduct, v_order.storage_location_id,
        v_user_id, 'withdrawal_order', p_request_id,
        COALESCE(p_override_reason, 'อนุมัติเบิกจ่าย Order #' || SUBSTRING(p_request_id::TEXT, 1, 8))
      );
    END IF;
  END LOOP;

  UPDATE public.withdrawal_orders
  SET status = 'approved',
      approved_by = v_user_id,
      approved_at = NOW(),
      has_shortage = v_has_any_shortage,
      is_shortage_override = p_allow_shortage,
      override_reason = p_override_reason,
      updated_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_request_id,
    'status', 'approved',
    'has_shortage', v_has_any_shortage,
    'message', 'อนุมัติคำขอเบิกจ่ายสำเร็จ'
  );
END;
$$;

-- Backward-compatible alias approve_withdrawal_order
CREATE OR REPLACE FUNCTION public.approve_withdrawal_order(
  p_order_id UUID,
  p_approver_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN public.approve_inventory_request(p_order_id, FALSE, NULL);
END;
$$;

DROP FUNCTION IF EXISTS public.reject_inventory_request(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.reject_withdrawal_order(UUID, TEXT, UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.reject_inventory_request(
  p_request_id UUID,
  p_reject_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_order RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_user_id, 'withdrawals.reject') OR 
          public.has_permission(v_user_id, 'inventory.approve') OR 
          public.is_super_admin(v_user_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires withdrawals.reject permission.';
  END IF;

  SELECT * INTO v_order FROM public.withdrawal_orders WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found: %', p_request_id;
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (current status: %)', v_order.status;
  END IF;

  UPDATE public.withdrawal_orders
  SET status = 'rejected',
      reject_reason = p_reject_reason,
      rejected_by = v_user_id,
      rejected_at = NOW(),
      updated_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_request_id,
    'status', 'rejected',
    'message', 'ปฏิเสธคำขอเรียบร้อยแล้ว'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_withdrawal_order(
  p_order_id UUID,
  p_reason TEXT DEFAULT 'Rejected by approver',
  p_rejecter_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN public.reject_inventory_request(p_order_id, p_reason);
END;
$$;

DROP FUNCTION IF EXISTS public.complete_inventory_request(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.complete_withdrawal_order(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.complete_inventory_request(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_order RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_user_id, 'withdrawals.complete') OR 
          public.has_permission(v_user_id, 'inventory.manage') OR 
          public.is_super_admin(v_user_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires withdrawals.complete permission.';
  END IF;

  SELECT * INTO v_order FROM public.withdrawal_orders WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found: %', p_request_id;
  END IF;

  IF v_order.status != 'approved' THEN
    RAISE EXCEPTION 'Request must be in approved status before completion (current status: %)', v_order.status;
  END IF;

  UPDATE public.withdrawal_orders
  SET status = 'completed',
      completed_by = v_user_id,
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_request_id,
    'status', 'completed',
    'message', 'ยืนยันการรับของสำเร็จ'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_withdrawal_order(
  p_order_id UUID,
  p_completer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN public.complete_inventory_request(p_order_id);
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. PERMISSION GRANTS
-- ------------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.process_checkout_order(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_return_order(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_inventory_request(UUID, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_withdrawal_order(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_inventory_request(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_withdrawal_order(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_inventory_request(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_withdrawal_order(UUID, UUID) TO authenticated, service_role;

COMMIT;
