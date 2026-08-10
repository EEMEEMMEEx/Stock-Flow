-- =================================================================
-- MIGRATION 35: ADD PARENT-CHILD HIERARCHY TO ITEMS & STOCK IN RPC
-- =================================================================

-- 1. Add Parent-Child hierarchy columns to stock_in_items and items tables
ALTER TABLE public.items 
  ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'PARENT',
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_sku TEXT,
  ADD COLUMN IF NOT EXISTS seq_no INTEGER,
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.stock_in_items 
  ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'PARENT',
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_sku TEXT,
  ADD COLUMN IF NOT EXISTS seq_no INTEGER,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Update Supabase RPC: process_stock_in to support Parent-Child hierarchy
CREATE OR REPLACE FUNCTION public.process_stock_in(
  p_project_id UUID,
  p_supplier TEXT DEFAULT NULL,
  p_po_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_project RECORD;
  v_order_id UUID;
  v_item_json JSONB;
  v_item_id UUID;
  v_parent_id UUID;
  v_quantity INTEGER;
  v_unit_price DECIMAL(12,2);
  v_delivery_to TEXT;
  v_serial_number TEXT;
  v_part_number TEXT;
  v_model TEXT;
  v_item_type TEXT;
  v_parent_sku TEXT;
  v_seq_no INTEGER;
  v_item_notes TEXT;
  v_item_exists BOOLEAN;
BEGIN
  -- A. Verify caller authorization (Only admins can record stock in)
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can record stock in transactions.';
  END IF;

  -- B. Validate project_id
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'Invalid project: Project ID cannot be empty.';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found: %', p_project_id;
  END IF;

  IF v_project.status != 'active' THEN
    RAISE EXCEPTION 'Invalid project: Project "%" is currently % (only active projects can receive stock).', v_project.name, v_project.status;
  END IF;

  -- C. Validate items payload
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Invalid items: At least one item is required for stock in.';
  END IF;

  -- Step 1: Resolve/create all items in public.items
  FOR v_item_json IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item_json->>'item_id')::UUID;
    v_quantity := COALESCE((v_item_json->>'quantity')::INTEGER, 0);

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity: Stock in quantity must be greater than 0.';
    END IF;

    -- If item_id is not provided, resolve or auto-create item in public.items
    IF v_item_id IS NULL THEN
      IF (v_item_json->>'sku') IS NOT NULL AND TRIM(v_item_json->>'sku') != '' THEN
        SELECT id INTO v_item_id FROM public.items WHERE LOWER(sku) = LOWER(TRIM(v_item_json->>'sku')) LIMIT 1;
      END IF;
      IF v_item_id IS NULL AND (v_item_json->>'name') IS NOT NULL AND TRIM(v_item_json->>'name') != '' THEN
        SELECT id INTO v_item_id FROM public.items WHERE LOWER(name) = LOWER(TRIM(v_item_json->>'name')) LIMIT 1;
      END IF;
      IF v_item_id IS NULL THEN
        INSERT INTO public.items (name, model, sku, unit)
        VALUES (
          COALESCE(NULLIF(TRIM(v_item_json->>'name'), ''), COALESCE(NULLIF(TRIM(v_item_json->>'sku'), ''), 'วัสดุทั่วไป')),
          NULLIF(TRIM(v_item_json->>'model'), ''),
          NULLIF(TRIM(v_item_json->>'sku'), ''),
          COALESCE(NULLIF(TRIM(v_item_json->>'unit'), ''), 'ชิ้น')
        )
        RETURNING id INTO v_item_id;
      END IF;
    ELSE
      SELECT EXISTS (SELECT 1 FROM public.items WHERE id = v_item_id) INTO v_item_exists;
      IF NOT v_item_exists THEN
        RAISE EXCEPTION 'Item not found: %', v_item_id;
      END IF;
    END IF;
  END LOOP;

  -- D. Insert into stock_in_orders
  INSERT INTO public.stock_in_orders (
    project_id,
    supplier,
    po_number,
    notes,
    received_date,
    created_by,
    created_at
  ) VALUES (
    p_project_id,
    p_supplier,
    p_po_number,
    p_notes,
    CURRENT_DATE,
    auth.uid(),
    NOW()
  ) RETURNING id INTO v_order_id;

  -- E. Insert into stock_in_items & stock_transactions for each item
  FOR v_item_json IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item_json->>'item_id')::UUID;
    v_quantity := (v_item_json->>'quantity')::INTEGER;
    v_unit_price := CASE WHEN (v_item_json->>'unit_price') IS NOT NULL AND (v_item_json->>'unit_price') != '' 
                         THEN (v_item_json->>'unit_price')::DECIMAL(12,2) 
                         ELSE NULL END;
    v_delivery_to := v_item_json->>'delivery_to';
    v_serial_number := v_item_json->>'serial_number';
    v_part_number := v_item_json->>'part_number';
    v_model := v_item_json->>'model';
    v_item_type := UPPER(COALESCE(NULLIF(TRIM(v_item_json->>'item_type'), ''), 'PARENT'));
    v_parent_sku := NULLIF(TRIM(v_item_json->>'parent_sku'), '');
    v_seq_no := CASE WHEN (v_item_json->>'seq_no') IS NOT NULL AND (v_item_json->>'seq_no') != '' 
                     THEN (v_item_json->>'seq_no')::INTEGER 
                     ELSE NULL END;
    v_item_notes := v_item_json->>'notes';
    v_parent_id := NULL;

    -- Resolve v_item_id if not set directly
    IF v_item_id IS NULL THEN
      IF (v_item_json->>'sku') IS NOT NULL AND TRIM(v_item_json->>'sku') != '' THEN
        SELECT id INTO v_item_id FROM public.items WHERE LOWER(sku) = LOWER(TRIM(v_item_json->>'sku')) LIMIT 1;
      END IF;
      IF v_item_id IS NULL AND (v_item_json->>'name') IS NOT NULL AND TRIM(v_item_json->>'name') != '' THEN
        SELECT id INTO v_item_id FROM public.items WHERE LOWER(name) = LOWER(TRIM(v_item_json->>'name')) LIMIT 1;
      END IF;
    END IF;

    -- Resolve parent_id if parent_sku is provided
    IF v_parent_sku IS NOT NULL THEN
      SELECT id INTO v_parent_id FROM public.items WHERE LOWER(sku) = LOWER(v_parent_sku) LIMIT 1;
    END IF;

    -- Update model on items master if available
    IF v_item_id IS NOT NULL AND v_model IS NOT NULL AND TRIM(v_model) != '' THEN
      UPDATE public.items SET model = TRIM(v_model) WHERE id = v_item_id AND (model IS NULL OR model = '');
    END IF;

    INSERT INTO public.stock_in_items (
      order_id,
      item_id,
      quantity,
      unit_price,
      delivery_to,
      serial_number,
      part_number,
      model,
      item_type,
      parent_id,
      parent_sku,
      seq_no,
      notes
    ) VALUES (
      v_order_id,
      v_item_id,
      v_quantity,
      v_unit_price,
      v_delivery_to,
      v_serial_number,
      v_part_number,
      v_model,
      v_item_type,
      v_parent_id,
      v_parent_sku,
      v_seq_no,
      v_item_notes
    );

    -- Log transaction in stock_transactions table
    INSERT INTO public.stock_transactions (
      project_id,
      item_id,
      transaction_type,
      quantity,
      created_by,
      created_at
    ) VALUES (
      p_project_id,
      v_item_id,
      'stock_in',
      v_quantity,
      auth.uid(),
      NOW()
    );
  END LOOP;

  -- F. Return success payload
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Stock in recorded successfully with hierarchy support.',
    'order_id', v_order_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_stock_in(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated;
NOTIFY pgrst, 'reload schema';
