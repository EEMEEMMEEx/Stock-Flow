-- ==============================================================================
-- Migration 64: Fix process_stock_in RPC Schema Alignment & Permission Check
--
-- Root Cause:
-- Previous migrations (61 & 62) referenced a non-existent column 'lot_number' in
-- public.stock_in_items, invalid columns on public.items (current_stock, part_number),
-- invalid column on public.stock_transactions (unit_price), and non-existent
-- permission code 'inventory.stock_in'.
--
-- Fix:
-- Align process_stock_in with the exact existing schema:
-- 1. stock_in_items columns:
--    order_id, item_id, quantity, unit_price, delivery_to, serial_number,
--    part_number, model, item_type, parent_id, parent_sku, seq_no, notes
-- 2. stock_transactions columns:
--    project_id, item_id, quantity, transaction_type, reference_type,
--    reference_id, notes, created_by
-- 3. Dynamic RBAC permission check:
--    public.has_permission(v_user_id, 'stock_in.create') OR public.is_super_admin(v_user_id)
-- ==============================================================================

BEGIN;

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
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_project RECORD;
  v_order_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_qty NUMERIC;
  v_unit_price NUMERIC;
  v_model TEXT;
  v_part_number TEXT;
  v_delivery_to TEXT;
  v_serial_number TEXT;
  v_item_notes TEXT;
  v_parent_id UUID;
  v_parent_sku TEXT;
  v_item_type TEXT;
  v_seq_no INTEGER;
  v_item_exists BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_user_id, 'stock_in.create') OR public.is_super_admin(v_user_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires stock_in.create permission.';
  END IF;

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

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Invalid items: At least one item is required for stock in.';
  END IF;

  -- 1. Insert order record
  INSERT INTO public.stock_in_orders (
    project_id, supplier, po_number, notes, received_date, created_by
  ) VALUES (
    p_project_id, p_supplier, p_po_number, p_notes, CURRENT_DATE, v_user_id
  ) RETURNING id INTO v_order_id;

  -- 2. Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_delivery_to := v_item->>'delivery_to';
    v_serial_number := v_item->>'serial_number';
    v_part_number := v_item->>'part_number';
    v_model := v_item->>'model';
    v_item_type := UPPER(COALESCE(NULLIF(TRIM(v_item->>'item_type'), ''), 'PARENT'));
    v_parent_sku := NULLIF(TRIM(v_item->>'parent_sku'), '');
    v_seq_no := (v_item->>'seq_no')::INTEGER;
    v_item_notes := v_item->>'notes';
    v_parent_id := (v_item->>'parent_id')::UUID;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity: % for item %', v_qty, v_item_id;
    END IF;

    -- Auto-resolve item_id by SKU or Name if null
    IF v_item_id IS NULL THEN
      IF (v_item->>'sku') IS NOT NULL AND TRIM(v_item->>'sku') != '' THEN
        SELECT id INTO v_item_id FROM public.items WHERE LOWER(sku) = LOWER(TRIM(v_item->>'sku')) LIMIT 1;
      END IF;
      IF v_item_id IS NULL AND (v_item->>'name') IS NOT NULL AND TRIM(v_item->>'name') != '' THEN
        SELECT id INTO v_item_id FROM public.items WHERE LOWER(name) = LOWER(TRIM(v_item->>'name')) LIMIT 1;
      END IF;
      IF v_item_id IS NULL THEN
        INSERT INTO public.items (name, model, sku, unit)
        VALUES (
          COALESCE(NULLIF(TRIM(v_item->>'name'), ''), COALESCE(NULLIF(TRIM(v_item->>'sku'), ''), 'วัสดุทั่วไป')),
          NULLIF(TRIM(v_item->>'model'), ''),
          NULLIF(TRIM(v_item->>'sku'), ''),
          COALESCE(NULLIF(TRIM(v_item->>'unit'), ''), 'ชิ้น')
        )
        RETURNING id INTO v_item_id;
      END IF;
    ELSE
      SELECT EXISTS (SELECT 1 FROM public.items WHERE id = v_item_id) INTO v_item_exists;
      IF NOT v_item_exists THEN
        RAISE EXCEPTION 'Item not found: %', v_item_id;
      END IF;
    END IF;

    -- Resolve parent_id from parent_sku if needed
    IF v_parent_id IS NULL AND v_parent_sku IS NOT NULL THEN
      SELECT id INTO v_parent_id FROM public.items WHERE LOWER(sku) = LOWER(v_parent_sku) LIMIT 1;
    END IF;

    -- Sync model to items table if needed
    IF v_model IS NOT NULL AND TRIM(v_model) != '' THEN
      UPDATE public.items 
      SET model = TRIM(v_model), updated_at = NOW() 
      WHERE id = v_item_id AND (model IS NULL OR model = '' OR model = '-');
    END IF;

    -- Insert into stock_in_items (matching exact active schema)
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
      v_qty,
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

    -- Insert into stock_transactions (matching exact active schema)
    INSERT INTO public.stock_transactions (
      project_id,
      item_id,
      quantity,
      transaction_type,
      reference_type,
      reference_id,
      notes,
      created_by
    ) VALUES (
      p_project_id,
      v_item_id,
      v_qty,
      'stock_in',
      'stock_in_order',
      v_order_id,
      v_item_notes,
      v_user_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Stock in recorded successfully with hierarchy support.',
    'order_id', v_order_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_stock_in(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
