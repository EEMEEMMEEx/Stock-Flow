-- ==============================================================================
-- MIGRATION 92: Fix Admin Force Delete Item RPC & Cascading Deletion
-- ==============================================================================
-- 1. Redefine public.admin_force_delete_item(UUID)
--    - Removes reference to non-existent 'public.pos_order_items'
--    - Cleans up child foreign keys: checkout_return_logs, checkout_items,
--      scrap_disposal_items, site_bom_templates, stock_adjustment_logs,
--      stock_transactions, stock_in_items, withdrawal_items, items.parent_id
--    - Uses IF to_regclass(...) IS NOT NULL for defense against missing tables
--    - Enforces items.delete / items.manage permissions with SECURITY DEFINER
-- 2. Redefine public.admin_bulk_force_delete_items(UUID[])
--    - Supports bulk atomic force delete of multiple items
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. RE-DEFINE public.admin_force_delete_item(UUID)
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_force_delete_item(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.admin_force_delete_item(p_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_item_name TEXT;
  v_item_sku TEXT;
  v_caller_role TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_user_id;

  IF NOT (
    v_caller_role IN ('admin', 'super_admin')
    OR public.has_permission(v_user_id, 'items.delete')
    OR public.has_permission(v_user_id, 'items.manage')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires items.delete permission.';
  END IF;

  SELECT name, sku INTO v_item_name, v_item_sku FROM public.items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found: %', p_item_id;
  END IF;

  -- 1. Break parent/child self-reference in items
  UPDATE public.items SET parent_id = NULL WHERE parent_id = p_item_id;

  -- 2. Break parent/child reference in stock_in_items (if column exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'stock_in_items' AND column_name = 'parent_id'
  ) THEN
    EXECUTE 'UPDATE public.stock_in_items SET parent_id = NULL WHERE parent_id = $1' USING p_item_id;
  END IF;

  -- 3. Clear spare_part_item_id in checkout_return_logs (if column exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'checkout_return_logs' AND column_name = 'spare_part_item_id'
  ) THEN
    EXECUTE 'UPDATE public.checkout_return_logs SET spare_part_item_id = NULL WHERE spare_part_item_id = $1' USING p_item_id;
  END IF;

  -- 4. Delete checkout_return_logs for checkouts referencing this item
  IF to_regclass('public.checkout_return_logs') IS NOT NULL AND to_regclass('public.checkout_items') IS NOT NULL THEN
    DELETE FROM public.checkout_return_logs
    WHERE checkout_item_id IN (
      SELECT id FROM public.checkout_items WHERE item_id = p_item_id
    );
  END IF;

  -- 5. Delete checkout_items
  IF to_regclass('public.checkout_items') IS NOT NULL THEN
    DELETE FROM public.checkout_items WHERE item_id = p_item_id;
  END IF;

  -- 6. Delete scrap_disposal_items
  IF to_regclass('public.scrap_disposal_items') IS NOT NULL THEN
    DELETE FROM public.scrap_disposal_items WHERE item_id = p_item_id;
  END IF;

  -- 7. Nullify site_bom_templates references
  IF to_regclass('public.site_bom_templates') IS NOT NULL THEN
    UPDATE public.site_bom_templates SET item_id = NULL WHERE item_id = p_item_id;
  END IF;

  -- 8. Delete stock_adjustment_logs
  IF to_regclass('public.stock_adjustment_logs') IS NOT NULL THEN
    DELETE FROM public.stock_adjustment_logs WHERE item_id = p_item_id;
  END IF;

  -- 9. Delete stock_transactions
  IF to_regclass('public.stock_transactions') IS NOT NULL THEN
    DELETE FROM public.stock_transactions WHERE item_id = p_item_id;
  END IF;

  -- 10. Delete stock_in_items
  IF to_regclass('public.stock_in_items') IS NOT NULL THEN
    DELETE FROM public.stock_in_items WHERE item_id = p_item_id;
  END IF;

  -- 11. Delete withdrawal_items
  IF to_regclass('public.withdrawal_items') IS NOT NULL THEN
    DELETE FROM public.withdrawal_items WHERE item_id = p_item_id;
  END IF;

  -- 12. Delete master item
  DELETE FROM public.items WHERE id = p_item_id;

  -- 13. Audit log
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    INSERT INTO public.audit_logs (actor_id, action, details)
    VALUES (
      v_user_id,
      'ITEM_FORCE_DELETED',
      jsonb_build_object(
        'item_id', p_item_id,
        'item_name', v_item_name,
        'sku', v_item_sku,
        'timestamp', NOW()
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('ลบรายการ "%s" พร้อมประวัติธุรกรรมเรียบร้อยแล้ว', v_item_name)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_force_delete_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_force_delete_item(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. RE-DEFINE public.admin_bulk_force_delete_items(UUID[])
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_bulk_force_delete_items(UUID[]) CASCADE;

CREATE OR REPLACE FUNCTION public.admin_bulk_force_delete_items(p_item_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_caller_role TEXT;
  v_deleted_count INTEGER := 0;
  v_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_user_id;

  IF NOT (
    v_caller_role IN ('admin', 'super_admin')
    OR public.has_permission(v_user_id, 'items.delete')
    OR public.has_permission(v_user_id, 'items.manage')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires items.delete permission.';
  END IF;

  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'deleted_count', 0, 'message', 'ไม่มีรายการพัสดุที่ต้องลบ');
  END IF;

  FOREACH v_id IN ARRAY p_item_ids LOOP
    PERFORM public.admin_force_delete_item(v_id);
    v_deleted_count := v_deleted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'message', format('ลบรายการพัสดุจำนวน %s รายการพร้อมประวัติธุรกรรมเรียบร้อยแล้ว', v_deleted_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_force_delete_items(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_force_delete_items(UUID[]) TO authenticated, service_role;

COMMIT;
