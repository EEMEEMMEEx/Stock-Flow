-- =================================================================
-- MIGRATION 49: ATOMIC ITEM WAREHOUSE / LOCATION TRANSFER RPC
-- =================================================================
-- Purpose:
-- 1. Provides public.process_item_transfer for atomic inter-warehouse/inter-project stock transfers.
-- 2. Seeds 'items.transfer' RBAC permission for ADMIN and SUPERVISOR roles.

-- 1. Seed 'items.transfer' permission
INSERT INTO public.permissions (code, name, description, resource, action, category)
VALUES (
  'items.transfer', 
  'โอนย้ายสถานที่จัดเก็บ', 
  'โอนย้ายวัสดุอุปกรณ์ระหว่างคลังและโครงการ', 
  'items', 
  'transfer', 
  'Items Master'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action;

-- 2. Map permission to ADMIN and SUPERVISOR roles
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('ADMIN', 'SUPERVISOR') AND p.code = 'items.transfer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. Ensure stock_transactions table has notes column
ALTER TABLE public.stock_transactions ADD COLUMN IF NOT EXISTS notes TEXT;

-- 4. Atomic Item Transfer RPC Function
CREATE OR REPLACE FUNCTION public.process_item_transfer(
  p_source_project_id UUID,
  p_dest_project_id UUID,
  p_item_id UUID,
  p_quantity INTEGER,
  p_notes TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_id UUID;
  v_item_name TEXT;
  v_item_unit TEXT;
  v_item_sku TEXT;
  v_source_name TEXT;
  v_source_loc TEXT;
  v_dest_name TEXT;
  v_dest_loc TEXT;
  v_current_balance INTEGER;
  v_order_id UUID;
  v_source_display TEXT;
  v_dest_display TEXT;
BEGIN
  -- A. Identify actor
  v_caller_id := COALESCE(auth.uid(), p_actor_id);

  -- B. Authorization check
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR (v_caller_role != 'admin' AND NOT public.has_permission(v_caller_id, 'items.transfer')) THEN
    -- Fallback check: if user has items.update or stock_in.create
    IF NOT public.has_permission(v_caller_id, 'items.update') AND NOT public.has_permission(v_caller_id, 'stock_in.create') THEN
      RAISE EXCEPTION 'Unauthorized: You do not have permission to transfer stock between locations.';
    END IF;
  END IF;

  -- C. Validate parameters
  IF p_source_project_id IS NULL OR p_dest_project_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุคลังต้นทางและคลังปลายทางให้ครบถ้วน';
  END IF;

  IF p_source_project_id = p_dest_project_id THEN
    RAISE EXCEPTION 'คลังต้นทางและคลังปลายทางต้องไม่เป็นสถานที่เดียวกัน';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'จำนวนที่ต้องการโอนย้ายต้องมากกว่า 0';
  END IF;

  -- D. Validate Item
  SELECT name, unit, sku INTO v_item_name, v_item_unit, v_item_sku
  FROM public.items
  WHERE id = p_item_id;

  IF v_item_name IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลรายการวัสดุในระบบ (ID: %)', p_item_id;
  END IF;

  -- E. Validate Source & Destination Projects
  SELECT name, location INTO v_source_name, v_source_loc
  FROM public.projects
  WHERE id = p_source_project_id AND status = 'active';

  IF v_source_name IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคลัง/โครงการต้นทาง หรือโครงการไม่ได้อยู่ในสถานะใช้งาน';
  END IF;

  SELECT name, location INTO v_dest_name, v_dest_loc
  FROM public.projects
  WHERE id = p_dest_project_id AND status = 'active';

  IF v_dest_name IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคลัง/โครงการปลายทาง หรือโครงการไม่ได้อยู่ในสถานะใช้งาน';
  END IF;

  v_source_display := v_source_name || (CASE WHEN v_source_loc IS NOT NULL AND v_source_loc != '' THEN ' (' || v_source_loc || ')' ELSE '' END);
  v_dest_display := v_dest_name || (CASE WHEN v_dest_loc IS NOT NULL AND v_dest_loc != '' THEN ' (' || v_dest_loc || ')' ELSE '' END);

  -- F. Check and verify available balance at source
  SELECT balance INTO v_current_balance
  FROM public.stock_balance
  WHERE project_id = p_source_project_id AND item_id = p_item_id;

  IF v_current_balance IS NULL OR v_current_balance < p_quantity THEN
    RAISE EXCEPTION 'ยอดคงเหลือที่คลังต้นทางไม่เพียงพอ (คงเหลือ % % แต่ต้องการโอน % %)',
      COALESCE(v_current_balance, 0), v_item_unit, p_quantity, v_item_unit;
  END IF;

  -- G. Step 1: Deduct from source project (Record transfer_out in stock_transactions)
  INSERT INTO public.stock_transactions (
    project_id,
    item_id,
    quantity,
    transaction_type,
    notes,
    created_by
  ) VALUES (
    p_source_project_id,
    p_item_id,
    p_quantity,
    'transfer_out',
    'โอนย้ายไปยัง: ' || v_dest_display || (CASE WHEN p_notes IS NOT NULL AND p_notes != '' THEN ' | เหตุผล: ' || p_notes ELSE '' END),
    v_caller_id
  );

  -- H. Step 2: Add to destination project (Create stock_in_orders + stock_in_items)
  INSERT INTO public.stock_in_orders (
    project_id,
    created_by,
    received_date,
    notes
  ) VALUES (
    p_dest_project_id,
    v_caller_id,
    CURRENT_DATE,
    'รับโอนสต็อกมาจาก: ' || v_source_display || (CASE WHEN p_notes IS NOT NULL AND p_notes != '' THEN ' | บันทึก: ' || p_notes ELSE '' END)
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.stock_in_items (
    order_id,
    item_id,
    quantity,
    notes
  ) VALUES (
    v_order_id,
    p_item_id,
    p_quantity,
    'รับโอนมาจาก ' || v_source_display
  );

  -- I. Return Success Object
  RETURN jsonb_build_object(
    'success', true,
    'item_name', v_item_name,
    'sku', v_item_sku,
    'transferred_quantity', p_quantity,
    'unit', v_item_unit,
    'source_project', v_source_display,
    'dest_project', v_dest_display,
    'order_id', v_order_id,
    'message', 'โอนย้าย ' || v_item_name || ' จำนวน ' || p_quantity || ' ' || v_item_unit || ' ไปยัง ' || v_dest_display || ' สำเร็จ'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, INTEGER, TEXT, UUID) TO authenticated;
