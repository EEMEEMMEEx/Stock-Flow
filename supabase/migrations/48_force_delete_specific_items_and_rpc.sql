-- =================================================================
-- MIGRATION 48: ATOMIC FORCE DELETE SPECIFIC ITEMS & TARGETED CLEANUP
-- =================================================================
-- Purpose: 
-- 1. Provides public.admin_force_delete_item(UUID) and public.admin_bulk_force_delete_items(UUID[])
-- 2. Provides target script to clean up specific requested SKUs in EMS (SAP) / System-wide.

-- 1. RPC: Force Delete Single Item
CREATE OR REPLACE FUNCTION public.admin_force_delete_item(p_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role TEXT;
  v_item_name TEXT;
  v_item_sku TEXT;
BEGIN
  -- Verify caller authorization (Admin or user with items.delete permission)
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role IS NULL OR (v_caller_role != 'admin' AND NOT public.has_permission(auth.uid(), 'items.delete')) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins or authorized users can force delete items.';
  END IF;

  -- Fetch item details
  SELECT name, sku INTO v_item_name, v_item_sku
  FROM public.items
  WHERE id = p_item_id;

  IF v_item_name IS NULL THEN
    RAISE EXCEPTION 'Item not found (ID: %)', p_item_id;
  END IF;

  -- Delete checkout return logs
  IF to_regclass('public.checkout_return_logs') IS NOT NULL AND to_regclass('public.checkout_items') IS NOT NULL THEN
    DELETE FROM public.checkout_return_logs
    WHERE checkout_item_id IN (
      SELECT id FROM public.checkout_items WHERE item_id = p_item_id
    );
  END IF;

  -- Delete checkout items
  IF to_regclass('public.checkout_items') IS NOT NULL THEN
    DELETE FROM public.checkout_items WHERE item_id = p_item_id;
  END IF;

  -- Delete withdrawal items
  IF to_regclass('public.withdrawal_items') IS NOT NULL THEN
    DELETE FROM public.withdrawal_items WHERE item_id = p_item_id;
  END IF;

  -- Delete stock in items
  IF to_regclass('public.stock_in_items') IS NOT NULL THEN
    DELETE FROM public.stock_in_items WHERE item_id = p_item_id;
  END IF;

  -- Delete stock transactions
  IF to_regclass('public.stock_transactions') IS NOT NULL THEN
    DELETE FROM public.stock_transactions WHERE item_id = p_item_id;
  END IF;

  -- Delete legacy tables if present
  IF to_regclass('public.stock_entries') IS NOT NULL THEN
    DELETE FROM public.stock_entries WHERE item_id = p_item_id;
  END IF;
  IF to_regclass('public.withdrawals') IS NOT NULL THEN
    DELETE FROM public.withdrawals WHERE item_id = p_item_id;
  END IF;

  -- Break parent/child reference
  UPDATE public.items SET parent_id = NULL WHERE parent_id = p_item_id;

  -- Delete master item
  DELETE FROM public.items WHERE id = p_item_id;

  -- Record audit log
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    INSERT INTO public.audit_logs (actor_id, action, details)
    VALUES (
      auth.uid(),
      'ITEM_FORCE_DELETED',
      jsonb_build_object(
        'item_id', p_item_id,
        'item_name', v_item_name,
        'sku', v_item_sku
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('ลบรายการ "%s" พร้อมประวัติธุรกรรมเรียบร้อยแล้ว', v_item_name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_force_delete_item(UUID) TO authenticated;

-- 2. RPC: Bulk Force Delete Items by IDs
CREATE OR REPLACE FUNCTION public.admin_bulk_force_delete_items(p_item_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role TEXT;
  v_deleted_count INTEGER := 0;
BEGIN
  -- Verify caller authorization
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role IS NULL OR (v_caller_role != 'admin' AND NOT public.has_permission(auth.uid(), 'items.delete')) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins or authorized users can force delete items.';
  END IF;

  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', true, 'deleted_count', 0);
  END IF;

  -- Delete checkout return logs
  IF to_regclass('public.checkout_return_logs') IS NOT NULL AND to_regclass('public.checkout_items') IS NOT NULL THEN
    DELETE FROM public.checkout_return_logs
    WHERE checkout_item_id IN (
      SELECT id FROM public.checkout_items WHERE item_id = ANY(p_item_ids)
    );
  END IF;

  -- Delete checkout items
  IF to_regclass('public.checkout_items') IS NOT NULL THEN
    DELETE FROM public.checkout_items WHERE item_id = ANY(p_item_ids);
  END IF;

  -- Delete withdrawal items
  IF to_regclass('public.withdrawal_items') IS NOT NULL THEN
    DELETE FROM public.withdrawal_items WHERE item_id = ANY(p_item_ids);
  END IF;

  -- Delete stock in items
  IF to_regclass('public.stock_in_items') IS NOT NULL THEN
    DELETE FROM public.stock_in_items WHERE item_id = ANY(p_item_ids);
  END IF;

  -- Delete stock transactions
  IF to_regclass('public.stock_transactions') IS NOT NULL THEN
    DELETE FROM public.stock_transactions WHERE item_id = ANY(p_item_ids);
  END IF;

  -- Delete legacy tables
  IF to_regclass('public.stock_entries') IS NOT NULL THEN
    DELETE FROM public.stock_entries WHERE item_id = ANY(p_item_ids);
  END IF;
  IF to_regclass('public.withdrawals') IS NOT NULL THEN
    DELETE FROM public.withdrawals WHERE item_id = ANY(p_item_ids);
  END IF;

  -- Break parent/child reference
  UPDATE public.items SET parent_id = NULL WHERE parent_id = ANY(p_item_ids);

  -- Delete master items
  DELETE FROM public.items WHERE id = ANY(p_item_ids);
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Record audit log
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    INSERT INTO public.audit_logs (actor_id, action, details)
    VALUES (
      auth.uid(),
      'ITEMS_BULK_FORCE_DELETED',
      jsonb_build_object(
        'item_ids', p_item_ids,
        'deleted_count', v_deleted_count
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'message', format('ลบรายการวัสดุจำนวน %s รายการเรียบร้อยแล้ว', v_deleted_count)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_force_delete_items(UUID[]) TO authenticated;

-- ====================================================================
-- 3. Targeted Cleanup Execution Script for the 10 Requested SKUs
-- ====================================================================
DO $$
DECLARE
  v_target_skus TEXT[] := ARRAY[
    'SKU-1YMAPDB',
    'SKU-VZJQSZ',
    'SKU-1SS0QOD',
    'SKU-28DJXOF',
    'SKU-ARFNLB4',
    'SKU-3TMA1K8',
    'SKU-2PC1KIP',
    'SKU-1NEMK2E',
    'SKU-2H1I5O',
    'SKU-365GEW7'
  ];
  v_target_item_ids UUID[];
  v_cnt INTEGER;
BEGIN
  SELECT ARRAY_AGG(id) INTO v_target_item_ids
  FROM public.items
  WHERE sku = ANY(v_target_skus);

  IF v_target_item_ids IS NOT NULL AND array_length(v_target_item_ids, 1) > 0 THEN
    -- Delete checkout return logs
    IF to_regclass('public.checkout_return_logs') IS NOT NULL AND to_regclass('public.checkout_items') IS NOT NULL THEN
      DELETE FROM public.checkout_return_logs
      WHERE checkout_item_id IN (
        SELECT id FROM public.checkout_items WHERE item_id = ANY(v_target_item_ids)
      );
    END IF;

    -- Delete checkout items
    IF to_regclass('public.checkout_items') IS NOT NULL THEN
      DELETE FROM public.checkout_items WHERE item_id = ANY(v_target_item_ids);
    END IF;

    -- Delete withdrawal items
    IF to_regclass('public.withdrawal_items') IS NOT NULL THEN
      DELETE FROM public.withdrawal_items WHERE item_id = ANY(v_target_item_ids);
    END IF;

    -- Delete stock in items
    IF to_regclass('public.stock_in_items') IS NOT NULL THEN
      DELETE FROM public.stock_in_items WHERE item_id = ANY(v_target_item_ids);
    END IF;

    -- Delete stock transactions
    IF to_regclass('public.stock_transactions') IS NOT NULL THEN
      DELETE FROM public.stock_transactions WHERE item_id = ANY(v_target_item_ids);
    END IF;

    -- Delete legacy tables
    IF to_regclass('public.stock_entries') IS NOT NULL THEN
      DELETE FROM public.stock_entries WHERE item_id = ANY(v_target_item_ids);
    END IF;
    IF to_regclass('public.withdrawals') IS NOT NULL THEN
      DELETE FROM public.withdrawals WHERE item_id = ANY(v_target_item_ids);
    END IF;

    -- Break parent/child references
    UPDATE public.items SET parent_id = NULL WHERE parent_id = ANY(v_target_item_ids);

    -- Delete master items
    DELETE FROM public.items WHERE id = ANY(v_target_item_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;

    RAISE NOTICE 'Deleted % target SKUs successfully.', v_cnt;
  ELSE
    RAISE NOTICE 'Target SKUs not found or already deleted.';
  END IF;
END $$;
