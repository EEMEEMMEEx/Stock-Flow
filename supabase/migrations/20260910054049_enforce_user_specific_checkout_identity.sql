-- Enforce profile-backed checkout identities.
-- Regular users can only check equipment out for themselves. ADMIN/SUPER may
-- select another active profile, while the database remains the source of truth
-- for borrower name and phone values.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_checkout_delegate(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_is_admin_or_super BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    LEFT JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = p_user_id
      AND p.status = 'active'
      AND (
        UPPER(TRIM(COALESCE(p.role, ''))) IN ('ADMIN', 'SUPER')
        OR UPPER(TRIM(COALESCE(r.code, ''))) IN ('ADMIN', 'SUPER')
      )
  ) OR public.is_super_admin(p_user_id)
  INTO v_is_admin_or_super;

  RETURN COALESCE(v_is_admin_or_super, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.is_checkout_delegate(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_checkout_delegate(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_checkout_borrowers()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  phone TEXT,
  department TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_checkout_delegate(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: only ADMIN or SUPER can choose another checkout user.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    COALESCE(NULLIF(TRIM(p.full_name), ''), 'User')::TEXT,
    NULLIF(TRIM(COALESCE(p.phone, '')), '')::TEXT,
    NULLIF(TRIM(COALESCE(p.department, '')), '')::TEXT
  FROM public.profiles p
  WHERE p.status = 'active'
  ORDER BY COALESCE(NULLIF(TRIM(p.full_name), ''), 'User'), p.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_checkout_borrowers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_checkout_borrowers() TO authenticated, service_role;

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
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.create')
    OR public.is_super_admin(v_caller_id)
    OR public.is_checkout_delegate(v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.create permission.';
  END IF;

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
    IF NOT public.is_checkout_delegate(v_caller_id) THEN
      RAISE EXCEPTION 'Permission denied: only ADMIN or SUPER can checkout for a person outside the system.';
    END IF;

    v_borrower_id := NULL;
    v_borrower_name := TRIM(COALESCE(p_payload->>'borrower_name', ''));
    v_borrower_phone := NULLIF(TRIM(COALESCE(p_payload->>'borrower_phone', '')), '');
    v_borrower_department := NULLIF(TRIM(COALESCE(p_payload->>'borrower_department', '')), '');
  ELSE
    v_borrower_id := NULLIF(p_payload->>'borrower_id', '')::UUID;
    v_borrower_id := COALESCE(v_borrower_id, v_caller_id);

    IF v_borrower_id <> v_caller_id AND NOT public.is_checkout_delegate(v_caller_id) THEN
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

    -- Never trust client-provided name/phone; use the selected profile as source of truth.
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

  -- Validate the current balance before any order rows or ledger entries are written.
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

    SELECT balance INTO v_avail
    FROM public.stock_balance
    WHERE project_id = v_project_id AND item_id = v_item_id;

    IF COALESCE(v_avail, 0) < v_qty THEN
      RAISE EXCEPTION 'ยอดสต็อกคงเหลือในโครงการไม่เพียงพอสำหรับ "%" (คงเหลือ % ชิ้น, ต้องการยืม % ชิ้น)',
        v_item_name, COALESCE(v_avail, 0), v_qty;
    END IF;
  END LOOP;

  v_order_number := 'CHK-' || to_char(now(), 'YYYYMM') || '-' || lpad(floor(random() * 9000 + 1000)::TEXT, 4, '0');

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
    created_by
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
    'active',
    v_purpose,
    v_notes,
    v_caller_id
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
      'borrowed',
      NULLIF(TRIM(COALESCE(v_item->>'notes', '')), '')
    );

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
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'borrower_type', v_borrower_type,
    'borrower_id', v_borrower_id,
    'borrow_type', v_borrow_type,
    'message', 'สร้างคำสั่งยืม ' || v_order_number || ' สำเร็จเรียบร้อย'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_checkout_order(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_checkout_order(JSONB) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;