-- =================================================================
-- MIGRATION 47: RESET STOCK AND ITEMS INVENTORY (CLEAN SLATE)
-- =================================================================
-- Purpose: Safely delete all stock transactions, orders, checkouts,
-- withdrawals, and items master data while preserving projects, users, and roles.
-- Uses resilient dynamic execution (to_regclass) so it will NEVER fail
-- with 42P01 (relation does not exist) even if some legacy tables are absent.

DO $$
DECLARE
  t TEXT;
  target_tables TEXT[] := ARRAY[
    'checkout_return_logs',
    'checkout_items',
    'checkout_orders',
    'withdrawal_items',
    'withdrawal_orders',
    'withdrawals',
    'stock_in_items',
    'stock_in_orders',
    'stock_entries',
    'stock_transactions'
  ];
BEGIN
  -- 1. Loop through all transaction tables and delete only if table exists in DB
  FOREACH t IN ARRAY target_tables
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.' || quote_ident(t);
      RAISE NOTICE 'Cleared table: %', t;
    END IF;
  END LOOP;

  -- 2. Items Master (Break self-referential parent_id first, then delete)
  IF to_regclass('public.items') IS NOT NULL THEN
    EXECUTE 'UPDATE public.items SET parent_id = NULL';
    EXECUTE 'DELETE FROM public.items';
    RAISE NOTICE 'Cleared table: items';
  END IF;

  RAISE NOTICE 'Inventory reset completed successfully: All transactions and items cleared.';
END $$;

-- Optional RPC for admin users to perform inventory reset with strict confirmation token
CREATE OR REPLACE FUNCTION public.admin_reset_inventory(p_confirmation TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  t TEXT;
  target_tables TEXT[] := ARRAY[
    'checkout_return_logs',
    'checkout_items',
    'checkout_orders',
    'withdrawal_items',
    'withdrawal_orders',
    'withdrawals',
    'stock_in_items',
    'stock_in_orders',
    'stock_entries',
    'stock_transactions'
  ];
BEGIN
  -- Verify caller authorization (Admin only)
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can reset inventory.';
  END IF;

  IF p_confirmation != 'CONFIRM_RESET_ALL_STOCK_AND_ITEMS' THEN
    RAISE EXCEPTION 'Invalid confirmation token. Operation aborted.';
  END IF;

  -- Loop through all transaction tables safely
  FOREACH t IN ARRAY target_tables
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.' || quote_ident(t);
    END IF;
  END LOOP;

  -- Clear Items Master
  IF to_regclass('public.items') IS NOT NULL THEN
    EXECUTE 'UPDATE public.items SET parent_id = NULL';
    EXECUTE 'DELETE FROM public.items';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Inventory and items master data have been completely reset.'
  );
END;
$$;
