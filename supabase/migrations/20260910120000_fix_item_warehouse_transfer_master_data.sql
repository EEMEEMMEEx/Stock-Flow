-- Fix warehouse transfers so stock allocation keeps the canonical item master.
--
-- A transfer moves quantity between project/location allocations. It must not
-- create or mutate rows in public.items. The destination stock-in snapshot is
-- populated from that locked master row so legacy balance projections retain
-- the same Parent/Child and descriptive metadata as the source allocation.

BEGIN;

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
  v_transfer_order_id UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'items.transfer') OR
    public.has_permission(v_caller_id, 'inventory.transfer') OR
    public.has_permission(v_caller_id, 'inventory.manage') OR
    public.is_super_admin(v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires item transfer permission.';
  END IF;

  IF p_source_project_id IS NULL OR p_dest_project_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุคลังต้นทางและคลังปลายทางให้ครบถ้วน';
  END IF;

  IF p_source_project_id = p_dest_project_id THEN
    RAISE EXCEPTION 'คลังต้นทางและคลังปลายทางต้องไม่เป็นสถานที่เดียวกัน';
  END IF;

  IF p_item_id IS NULL OR p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'รายการวัสดุและจำนวนที่โอนต้องถูกต้อง';
  END IF;

  -- Lock and validate the canonical master. No INSERT/UPDATE is performed on
  -- public.items, so the item id and its Parent/Child relationship survive.
  SELECT * INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND OR NULLIF(BTRIM(v_item.name), '') IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลรายการวัสดุในระบบ (ID: %)', p_item_id;
  END IF;

  SELECT * INTO v_source_project
  FROM public.projects
  WHERE id = p_source_project_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคลัง/โครงการต้นทาง หรือไม่ได้อยู่ในสถานะใช้งาน';
  END IF;

  SELECT * INTO v_dest_project
  FROM public.projects
  WHERE id = p_dest_project_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคลัง/โครงการปลายทาง หรือไม่ได้อยู่ในสถานะใช้งาน';
  END IF;

  SELECT COALESCE(balance, 0) INTO v_source_balance
  FROM public.stock_balance
  WHERE project_id = p_source_project_id AND item_id = p_item_id;

  IF v_source_balance < p_quantity THEN
    RAISE EXCEPTION 'ยอดคงเหลือที่คลังต้นทางไม่เพียงพอ (คงเหลือ %, ต้องการโอน %)',
      v_source_balance, p_quantity;
  END IF;

  -- Outbound ledger entry. The quantity remains positive because stock_balance
  -- interprets transfer_out as an outbound movement.
  INSERT INTO public.stock_transactions (
    project_id, item_id, quantity, transaction_type,
    reference_type, reference_id, notes, created_by
  ) VALUES (
    p_source_project_id, p_item_id, p_quantity, 'transfer_out',
    'warehouse_transfer', NULL,
    'โอนย้ายไปยัง: ' || v_dest_project.name || COALESCE(' | ' || NULLIF(BTRIM(p_notes), ''), ''),
    v_caller_id
  );

  -- Create one destination allocation using the same item_id. The copied
  -- fields are transaction-line metadata only; the master remains authoritative.
  INSERT INTO public.stock_in_orders (
    project_id, supplier, notes, received_date, created_by
  ) VALUES (
    p_dest_project_id,
    'Warehouse Transfer',
    'รับโอนจาก: ' || v_source_project.name || COALESCE(' | ' || NULLIF(BTRIM(p_notes), ''), ''),
    CURRENT_DATE,
    v_caller_id
  ) RETURNING id INTO v_transfer_order_id;

  INSERT INTO public.stock_in_items (
    order_id, item_id, quantity, model, item_type,
    parent_id, parent_sku, seq_no, notes
  ) VALUES (
    v_transfer_order_id,
    v_item.id,
    p_quantity,
    v_item.model,
    v_item.item_type,
    v_item.parent_id,
    v_item.parent_sku,
    v_item.seq_no,
    'รับโอนจาก: ' || v_source_project.name
  );

  RETURN jsonb_build_object(
    'success', true,
    'item_id', v_item.id,
    'item_name', v_item.name,
    'item_type', v_item.item_type,
    'parent_id', v_item.parent_id,
    'parent_sku', v_item.parent_sku,
    'transferred_quantity', p_quantity,
    'source_project', v_source_project.name,
    'destination_project', v_dest_project.name,
    'transfer_order_id', v_transfer_order_id,
    'message', 'โอนย้าย ' || v_item.name || ' สำเร็จ'
  );
END;
$$;

-- Keep the JSONB contract available for older clients, but route it through the
-- same canonical implementation instead of maintaining a second data path.
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

GRANT EXECUTE ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(JSONB) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
