-- Migration 07: Support Admin Shortage Approval & Inventory Override
-- Adds shortage tracking columns to withdrawal_orders and withdrawal_items,
-- and updates approve_inventory_request RPC to calculate MIN(available, requested)
-- and MAX(requested - available, 0) without creating negative stock.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawal_orders' AND column_name = 'is_shortage_override'
  ) THEN
    ALTER TABLE public.withdrawal_orders ADD COLUMN is_shortage_override BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawal_orders' AND column_name = 'override_reason'
  ) THEN
    ALTER TABLE public.withdrawal_orders ADD COLUMN override_reason TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawal_orders' AND column_name = 'has_shortage'
  ) THEN
    ALTER TABLE public.withdrawal_orders ADD COLUMN has_shortage BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawal_items' AND column_name = 'available_at_approval'
  ) THEN
    ALTER TABLE public.withdrawal_items ADD COLUMN available_at_approval INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawal_items' AND column_name = 'deducted_quantity'
  ) THEN
    ALTER TABLE public.withdrawal_items ADD COLUMN deducted_quantity INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawal_items' AND column_name = 'shortage_quantity'
  ) THEN
    ALTER TABLE public.withdrawal_items ADD COLUMN shortage_quantity INTEGER DEFAULT 0;
  END IF;
END $$;

-- Upgrade approve_inventory_request RPC function
CREATE OR REPLACE FUNCTION public.approve_inventory_request(
  p_request_id UUID,
  p_allow_shortage BOOLEAN DEFAULT FALSE,
  p_override_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_order RECORD;
  v_item RECORD;
  v_avail_stock INTEGER;
  v_deducted INTEGER;
  v_shortage INTEGER;
  v_has_any_shortage BOOLEAN := FALSE;
  v_shortage_list JSONB := '[]'::jsonb;
BEGIN
  -- A. Verify caller authorization (Admin role required for approval & override)
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can approve inventory requests.';
  END IF;

  -- B. STEP 1: Lock the target request row and verify status = 'pending'
  SELECT * INTO v_order
  FROM public.withdrawal_orders
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found: %', p_request_id;
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Invalid request state: Request is currently % (only pending requests can be approved)', v_order.status;
  END IF;

  -- C. STEP 2: Lock all referenced item rows in deterministic order to prevent deadlocks
  PERFORM id 
  FROM public.items 
  WHERE id IN (
    SELECT item_id FROM public.withdrawal_items WHERE order_id = p_request_id
  ) 
  ORDER BY id 
  FOR UPDATE;

  -- D. STEP 3: Check availability & calculate shortage for ALL items
  FOR v_item IN 
    SELECT wi.id AS request_item_id, wi.item_id, wi.quantity, i.name AS item_name, i.unit
    FROM public.withdrawal_items wi
    JOIN public.items i ON i.id = wi.item_id
    WHERE wi.order_id = p_request_id
  LOOP
    -- Calculate exact available stock for (project_id, item_id)
    SELECT COALESCE((
      SELECT balance 
      FROM public.stock_balance 
      WHERE project_id = v_order.project_id 
      AND item_id = v_item.item_id
    ), 0) INTO v_avail_stock;

    v_deducted := GREATEST(LEAST(v_avail_stock, v_item.quantity), 0);
    v_shortage := GREATEST(v_item.quantity - v_avail_stock, 0);

    IF v_shortage > 0 THEN
      v_has_any_shortage := TRUE;
      v_shortage_list := v_shortage_list || jsonb_build_object(
        'request_item_id', v_item.request_item_id,
        'item_id', v_item.item_id,
        'item_name', v_item.item_name,
        'unit', v_item.unit,
        'requested', v_item.quantity,
        'available', COALESCE(v_avail_stock, 0),
        'deducted', v_deducted,
        'shortage', v_shortage
      );
    END IF;
  END LOOP;

  -- If shortages exist and Admin has not explicitly allowed shortage override, raise SHORTAGE_DETECTED
  IF v_has_any_shortage AND NOT p_allow_shortage THEN
    RAISE EXCEPTION 'SHORTAGE_DETECTED: %', jsonb_build_object(
      'order_id', p_request_id,
      'shortages', v_shortage_list,
      'message', 'จำนวนวัสดุในโครงการนี้ไม่เพียงพอสำหรับคำขอเบิกจ่าย'
    )::text;
  END IF;

  -- E. STEP 4: Process deductions and update item-level shortage records
  FOR v_item IN 
    SELECT wi.id AS request_item_id, wi.item_id, wi.quantity
    FROM public.withdrawal_items wi
    WHERE wi.order_id = p_request_id
  LOOP
    SELECT COALESCE((
      SELECT balance 
      FROM public.stock_balance 
      WHERE project_id = v_order.project_id 
      AND item_id = v_item.item_id
    ), 0) INTO v_avail_stock;

    v_deducted := GREATEST(LEAST(v_avail_stock, v_item.quantity), 0);
    v_shortage := GREATEST(v_item.quantity - v_avail_stock, 0);

    -- Update withdrawal_items breakdown
    UPDATE public.withdrawal_items
    SET
      available_at_approval = COALESCE(v_avail_stock, 0),
      deducted_quantity = v_deducted,
      shortage_quantity = v_shortage
    WHERE id = v_item.request_item_id;

    -- Only log stock_out in stock_transactions if actual stock was deducted (deducted > 0)
    -- This guarantees stock balance NEVER goes negative!
    IF v_deducted > 0 THEN
      INSERT INTO public.stock_transactions (
        project_id,
        item_id,
        request_id,
        request_item_id,
        transaction_type,
        quantity,
        created_by
      ) VALUES (
        v_order.project_id,
        v_item.item_id,
        p_request_id,
        v_item.request_item_id,
        'stock_out',
        v_deducted,
        auth.uid()
      );
    END IF;
  END LOOP;

  -- F. STEP 5: Update request status to 'approved' with override metadata
  UPDATE public.withdrawal_orders
  SET 
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = NOW(),
    has_shortage = v_has_any_shortage,
    is_shortage_override = (p_allow_shortage AND v_has_any_shortage),
    override_reason = CASE WHEN (p_allow_shortage AND v_has_any_shortage) THEN p_override_reason ELSE NULL END
  WHERE id = p_request_id;

  -- G. STEP 6: Return success payload
  RETURN jsonb_build_object(
    'success', true,
    'message', CASE WHEN v_has_any_shortage THEN 'อนุมัติคำขอเบิกจ่ายกรณีของไม่ครบเรียบร้อยแล้ว' ELSE 'อนุมัติคำขอเบิกจ่ายและตัดสต็อกสำเร็จ' END,
    'order_id', p_request_id,
    'has_shortage', v_has_any_shortage,
    'shortages', v_shortage_list
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_inventory_request(UUID, BOOLEAN, TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';
