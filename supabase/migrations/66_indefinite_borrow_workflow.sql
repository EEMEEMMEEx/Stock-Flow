-- Migration 66: Indefinite Borrow Workflow for Checkouts System
-- Supports indefinite/open-ended material borrow records without requiring a return due date

-- 1. Alter checkout_orders to make expected_return_date nullable
ALTER TABLE public.checkout_orders 
  ALTER COLUMN expected_return_date DROP NOT NULL;

-- 2. Alter checkout_extension_logs to make new_due_date and previous_due_date nullable
ALTER TABLE public.checkout_extension_logs 
  ALTER COLUMN new_due_date DROP NOT NULL;
ALTER TABLE public.checkout_extension_logs 
  ALTER COLUMN previous_due_date DROP NOT NULL;

-- 3. Add borrow_type column with default 'standard'
ALTER TABLE public.checkout_orders 
  ADD COLUMN IF NOT EXISTS borrow_type TEXT NOT NULL DEFAULT 'standard' 
  CHECK (borrow_type IN ('standard', 'indefinite'));

-- 4. Create index on borrow_type for efficient filtering
CREATE INDEX IF NOT EXISTS idx_checkout_orders_borrow_type 
  ON public.checkout_orders (borrow_type);

-- 4. Update Atomic RPC: process_checkout_order to support borrow_type
CREATE OR REPLACE FUNCTION public.process_checkout_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id UUID;
  v_borrower_name TEXT;
  v_borrower_phone TEXT;
  v_borrower_department TEXT;
  v_borrower_id UUID;
  v_borrow_type TEXT;
  v_expected_return_date DATE;
  v_purpose TEXT;
  v_notes TEXT;
  v_created_by UUID;
  v_items JSONB;
  v_order_number TEXT;
  v_order_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_qty NUMERIC;
  v_serial TEXT;
  v_condition TEXT;
BEGIN
  -- Parse header params
  v_project_id := (p_payload->>'project_id')::UUID;
  v_borrower_name := TRIM(p_payload->>'borrower_name');
  v_borrower_phone := p_payload->>'borrower_phone';
  v_borrower_department := p_payload->>'borrower_department';
  v_borrow_type := COALESCE(p_payload->>'borrow_type', 'standard');
  v_purpose := p_payload->>'purpose';
  v_notes := p_payload->>'notes';
  v_created_by := NULLIF(p_payload->>'created_by', '')::UUID;
  v_items := p_payload->'items';

  IF v_borrower_name IS NULL OR v_borrower_name = '' THEN
    RAISE EXCEPTION 'กรุณาระบุชื่อผู้ยืมพัสดุ';
  END IF;

  -- Validate borrow_type & expected_return_date
  IF v_borrow_type = 'standard' THEN
    v_expected_return_date := (p_payload->>'expected_return_date')::DATE;
    IF v_expected_return_date IS NULL THEN
      RAISE EXCEPTION 'กรุณาระบุกำหนดวันส่งคืนสำหรับการยืมแบบระบุวันส่งคืน';
    END IF;
  ELSIF v_borrow_type = 'indefinite' THEN
    v_expected_return_date := NULL;
  ELSE
    RAISE EXCEPTION 'ประเภทการยืมไม่ถูกต้อง (ต้องเป็น standard หรือ indefinite)';
  END IF;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'ต้องมีรายการวัสดุ/เครื่องมืออย่างน้อย 1 รายการ';
  END IF;

  -- Generate order number: CHK-YYYYMM-XXXX
  v_order_number := 'CHK-' || to_char(now(), 'YYYYMM') || '-' || lpad(floor(random()*9000 + 1000)::text, 4, '0');

  -- Insert checkout order header
  INSERT INTO public.checkout_orders (
    order_number, project_id, borrower_id, borrower_name, borrower_phone,
    borrower_department, checkout_date, expected_return_date, borrow_type, status,
    purpose, notes, created_by
  ) VALUES (
    v_order_number, v_project_id, v_borrower_id, v_borrower_name, v_borrower_phone,
    v_borrower_department, now(), v_expected_return_date, v_borrow_type, 'active',
    v_purpose, v_notes, v_created_by
  ) RETURNING id INTO v_order_id;

  -- Insert line items
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_serial := NULLIF(v_item->>'serial_number', '');
    v_condition := COALESCE(v_item->>'condition', 'normal');

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'จำนวนที่ขอยืมต้องมากกว่า 0';
    END IF;

    INSERT INTO public.checkout_items (
      checkout_order_id, item_id, serial_number, quantity_borrowed,
      quantity_returned, condition_on_checkout, status, notes
    ) VALUES (
      v_order_id, v_item_id, v_serial, v_qty,
      0, v_condition, 'borrowed', v_item->>'notes'
    );

    -- Log transaction deduction (checkout_out)
    INSERT INTO public.stock_transactions (
      project_id, item_id, transaction_type, quantity, created_by
    ) VALUES (
      v_project_id, v_item_id, 'checkout_out', v_qty, v_created_by
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'borrow_type', v_borrow_type
  );
END;
$$;

-- 5. Update Atomic RPC: extend_checkout_due_date with guard for indefinite borrow
CREATE OR REPLACE FUNCTION public.extend_checkout_due_date(
  p_order_id UUID,
  p_new_due_date DATE DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_extended_by UUID DEFAULT NULL,
  p_is_indefinite BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_effective_user_id UUID;
  v_order RECORD;
  v_prev_due_date DATE;
  v_new_status TEXT;
  v_log_id UUID;
BEGIN
  -- 1. Authorization check
  IF v_caller_id IS NOT NULL THEN
    IF NOT (public.has_permission(v_caller_id, 'checkouts.extend') OR public.has_permission(v_caller_id, 'checkouts.update')) THEN
      RAISE EXCEPTION 'Unauthorized: Requires checkouts.extend permission.';
    END IF;
    v_effective_user_id := v_caller_id;
  ELSE
    v_effective_user_id := p_extended_by;
  END IF;

  -- 2. Fetch checkout order
  SELECT * INTO v_order
  FROM public.checkout_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout order not found with ID %', p_order_id;
  END IF;

  IF v_order.status = 'completed' OR v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot extend return date for a completed or cancelled checkout order.';
  END IF;

  v_prev_due_date := v_order.expected_return_date;

  -- 3. Check for transition to Indefinite Borrow
  IF p_is_indefinite THEN
    v_new_status := CASE 
      WHEN v_order.status = 'overdue' THEN 
        CASE WHEN EXISTS (
          SELECT 1 FROM public.checkout_items 
          WHERE checkout_order_id = p_order_id AND (quantity_returned > 0 OR quantity_damaged > 0 OR quantity_lost > 0)
        ) THEN 'partial_returned' ELSE 'active' END
      ELSE v_order.status 
    END;

    UPDATE public.checkout_orders
    SET 
      borrow_type = 'indefinite',
      expected_return_date = NULL,
      status = v_new_status
    WHERE id = p_order_id;

    INSERT INTO public.checkout_extension_logs (
      checkout_order_id,
      previous_due_date,
      new_due_date,
      extension_reason,
      extended_by,
      extended_at
    ) VALUES (
      p_order_id,
      v_prev_due_date,
      NULL,
      COALESCE(p_reason, 'เปลี่ยนประเภทเป็นไม่มีกำหนดคืน (Indefinite Borrow)'),
      v_effective_user_id,
      now()
    ) RETURNING id INTO v_log_id;

    RETURN jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'previous_due_date', v_prev_due_date,
      'new_due_date', NULL,
      'status', v_new_status,
      'borrow_type', 'indefinite',
      'log_id', v_log_id
    );
  END IF;

  -- Standard Date Extension validation
  IF v_order.borrow_type = 'indefinite' OR v_order.expected_return_date IS NULL THEN
    RAISE EXCEPTION 'Cannot extend return date for an indefinite borrow order.';
  END IF;

  IF p_new_due_date IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุกำหนดส่งคืนใหม่';
  END IF;

  IF p_new_due_date <= v_prev_due_date THEN
    RAISE EXCEPTION 'New return due date (%) must be later than the current due date (%).', p_new_due_date, v_prev_due_date;
  END IF;

  -- 4. Recalculate status for date extension
  IF v_order.status = 'overdue' THEN
    IF p_new_due_date >= CURRENT_DATE THEN
      IF EXISTS (
        SELECT 1 FROM public.checkout_items 
        WHERE checkout_order_id = p_order_id AND (quantity_returned > 0 OR quantity_damaged > 0 OR quantity_lost > 0)
      ) THEN
        v_new_status := 'partial_returned';
      ELSE
        v_new_status := 'active';
      END IF;
    ELSE
      v_new_status := 'overdue';
    END IF;
  ELSE
    v_new_status := v_order.status;
  END IF;

  -- 5. Update checkout_orders
  UPDATE public.checkout_orders
  SET 
    expected_return_date = p_new_due_date,
    status = v_new_status
  WHERE id = p_order_id;

  -- 6. Insert into checkout_extension_logs
  INSERT INTO public.checkout_extension_logs (
    checkout_order_id,
    previous_due_date,
    new_due_date,
    extension_reason,
    extended_by,
    extended_at
  ) VALUES (
    p_order_id,
    v_prev_due_date,
    p_new_due_date,
    p_reason,
    v_effective_user_id,
    now()
  ) RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'previous_due_date', v_prev_due_date,
    'new_due_date', p_new_due_date,
    'status', v_new_status,
    'log_id', v_log_id
  );
END;
$$;
