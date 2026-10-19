-- ==============================================================================
-- MIGRATION 91: Sequential Checkout Order Numbering (Starting at 0000)
-- ==============================================================================
-- 1. Create public.document_counters table for atomic sequence management
-- 2. Phase 1: Set temporary prefix on checkout_orders.order_number to avoid unique collisions
-- 3. Phase 2: Renumber all existing checkout_orders chronologically per month from 0000
-- 4. Phase 3: Populate document_counters with the maximum sequence assigned per month
-- 5. Phase 4: Update public.process_checkout_order RPC to allocate sequential numbers
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. CREATE SEQUENCE / COUNTER TABLE
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.document_counters (
  doc_type TEXT NOT NULL,
  period TEXT NOT NULL,
  current_val INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_type, period)
);

ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'document_counters'
      AND policyname = 'Allow authenticated read on document_counters'
  ) THEN
    CREATE POLICY "Allow authenticated read on document_counters"
      ON public.document_counters
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

GRANT SELECT ON public.document_counters TO authenticated;
GRANT ALL ON public.document_counters TO service_role;

-- ------------------------------------------------------------------------------
-- 2. PHASE 1: AVOID UNIQUE CONSTRAINT COLLISION DURING RENUMBERING
-- ------------------------------------------------------------------------------

UPDATE public.checkout_orders
SET order_number = 'TEMP-' || id::TEXT
WHERE order_number IS NOT NULL AND order_number NOT LIKE 'TEMP-%';

-- ------------------------------------------------------------------------------
-- 3. PHASE 2: RENUMBER ALL HISTORIC CHECKOUT ORDERS CHRONOLOGICALLY PER MONTH
-- ------------------------------------------------------------------------------

WITH ranked_orders AS (
  SELECT
    id,
    to_char(COALESCE(created_at, now()), 'YYYYMM') AS period,
    ROW_NUMBER() OVER (
      PARTITION BY to_char(COALESCE(created_at, now()), 'YYYYMM')
      ORDER BY created_at ASC, id ASC
    ) - 1 AS seq_num
  FROM public.checkout_orders
)
UPDATE public.checkout_orders co
SET order_number = 'CHK-' || ro.period || '-' ||
  CASE
    WHEN ro.seq_num < 10000 THEN lpad(ro.seq_num::TEXT, 4, '0')
    ELSE ro.seq_num::TEXT
  END
FROM ranked_orders ro
WHERE co.id = ro.id;

-- ------------------------------------------------------------------------------
-- 4. PHASE 3: POPULATE DOCUMENT_COUNTERS WITH LATEST ASSIGNED SEQUENCES
-- ------------------------------------------------------------------------------

INSERT INTO public.document_counters (doc_type, period, current_val, updated_at)
SELECT
  'checkout' AS doc_type,
  to_char(COALESCE(created_at, now()), 'YYYYMM') AS period,
  MAX(
    (SUBSTRING(order_number FROM 'CHK-[0-9]{6}-([0-9]+)$'))::INTEGER
  ) AS current_val,
  now() AS updated_at
FROM public.checkout_orders
WHERE order_number LIKE 'CHK-%'
GROUP BY to_char(COALESCE(created_at, now()), 'YYYYMM')
ON CONFLICT (doc_type, period) DO UPDATE
  SET current_val = EXCLUDED.current_val,
      updated_at = now();

-- ------------------------------------------------------------------------------
-- 5. PHASE 4: UPDATE process_checkout_order TO GENERATE SEQUENTIAL NUMBERS
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
  v_period TEXT;
  v_seq INTEGER;
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

  -- ----------------------------------------------------------------------------
  -- SEQUENTIAL DOCUMENT NUMBER GENERATION (CHK-YYYYMM-XXXX starting at 0000)
  -- ----------------------------------------------------------------------------
  v_period := to_char(now(), 'YYYYMM');

  -- Atomic counter allocation: first order of period gets 0, subsequent increment by 1
  INSERT INTO public.document_counters (doc_type, period, current_val, updated_at)
  VALUES ('checkout', v_period, 0, now())
  ON CONFLICT (doc_type, period) DO UPDATE
    SET current_val = public.document_counters.current_val + 1,
        updated_at = now()
  RETURNING current_val INTO v_seq;

  -- Format order number: 4-digit padding for < 10000, raw 5+ digits for >= 10000 (Option A)
  IF v_seq < 10000 THEN
    v_order_number := 'CHK-' || v_period || '-' || lpad(v_seq::TEXT, 4, '0');
  ELSE
    v_order_number := 'CHK-' || v_period || '-' || v_seq::TEXT;
  END IF;

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

COMMIT;
