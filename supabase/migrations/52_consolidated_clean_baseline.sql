-- ==============================================================================
-- Migration 52: Consolidated Clean Baseline, Performance Indexes & Security Hardening
-- Description:
--   1. Ensures storage_locations table and storage_location_id columns exist across transaction tables.
--   2. Adds high-efficiency composite indexes across core tables to minimize query latency.
--   3. Hardens all SECURITY DEFINER RPCs with explicit SET search_path to pass Supabase Security Linter.
--   4. Synchronizes schema constraints and Post-R2 storage decoupling.
-- ==============================================================================

-- 0. Ensure Storage Locations Table Exists
CREATE TABLE IF NOT EXISTS public.storage_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  description TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure storage_location_id and additional columns exist on all transaction tables
ALTER TABLE public.stock_transactions ADD COLUMN IF NOT EXISTS storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL;
ALTER TABLE public.stock_transactions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.stock_transactions ADD COLUMN IF NOT EXISTS reference_type TEXT;
ALTER TABLE public.stock_transactions ADD COLUMN IF NOT EXISTS reference_id UUID;

DO $$ BEGIN
  IF to_regclass('public.stock_in_orders') IS NOT NULL THEN
    ALTER TABLE public.stock_in_orders ADD COLUMN IF NOT EXISTS storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.withdrawal_orders') IS NOT NULL THEN
    ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Update stock_transactions check constraint to support TRANSFER and other types
ALTER TABLE public.stock_transactions DROP CONSTRAINT IF EXISTS stock_transactions_transaction_type_check;
ALTER TABLE public.stock_transactions ADD CONSTRAINT stock_transactions_transaction_type_check 
  CHECK (transaction_type IN ('IN', 'OUT', 'ADJUST', 'RETURN', 'TRANSFER', 'CHECKOUT', 'stock_in', 'stock_out', 'checkout_out', 'return_in'));

-- 1. Composite & B-Tree Indexes for Query Performance & Low Egress
CREATE INDEX IF NOT EXISTS idx_stock_transactions_lookup ON public.stock_transactions (project_id, item_id, storage_location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_created ON public.stock_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_category_name ON public.items (category_id, name);
CREATE INDEX IF NOT EXISTS idx_items_sku ON public.items (sku);

DO $$ BEGIN
  IF to_regclass('public.user_project_assignments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_user_project_assignments_user ON public.user_project_assignments (user_id, project_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.withdrawal_orders') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_withdrawal_orders_status ON public.withdrawal_orders (status, requested_at DESC);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.stock_in_items') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_stock_in_items_order ON public.stock_in_items (order_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.withdrawal_items') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_withdrawal_items_order ON public.withdrawal_items (order_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.user_notifications') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_user_notifications_lookup ON public.user_notifications (user_id, is_read, created_at DESC);
  END IF;
END $$;

-- 2. Hardened Admin User RPCs (SET search_path = public, auth, pg_temp)
DROP FUNCTION IF EXISTS public.admin_get_users() CASCADE;

CREATE OR REPLACE FUNCTION public.admin_get_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  status TEXT,
  phone TEXT,
  department TEXT,
  "position" TEXT,
  avatar_url TEXT,
  must_change_password BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  assigned_project_ids UUID[],
  all_projects BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    COALESCE(u.email::TEXT, '') AS email,
    COALESCE(p.full_name, 'User') AS full_name,
    COALESCE(p.role, 'operator') AS role,
    COALESCE(p.status, 'active') AS status,
    p.phone,
    p.department,
    p."position",
    p.avatar_url,
    COALESCE(p.must_change_password, FALSE) AS must_change_password,
    p.created_at,
    p.updated_at,
    COALESCE(ARRAY_AGG(upa.project_id) FILTER (WHERE upa.project_id IS NOT NULL), ARRAY[]::UUID[]) AS assigned_project_ids,
    COALESCE(p.all_projects, p.role = 'admin', TRUE) AS all_projects
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_project_assignments upa ON upa.user_id = p.id
  GROUP BY p.id, u.email, p.full_name, p.role, p.status, p.phone, p.department, p."position", p.avatar_url, p.must_change_password, p.created_at, p.updated_at, p.all_projects
  ORDER BY p.created_at DESC;
END;
$$;

-- 3. Hardened Warehouse Transfer RPC
DROP FUNCTION IF EXISTS public.transfer_item_warehouse CASCADE;

CREATE OR REPLACE FUNCTION public.transfer_item_warehouse(
  p_item_id UUID,
  p_source_project_id UUID,
  p_source_location_id UUID,
  p_dest_project_id UUID,
  p_dest_location_id UUID,
  p_quantity INTEGER,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_calling_user_id UUID;
  v_current_stock INTEGER;
  v_transfer_id UUID;
BEGIN
  v_calling_user_id := auth.uid();
  IF v_calling_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
  END IF;

  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Quantity must be greater than 0.');
  END IF;

  IF p_source_project_id = p_dest_project_id AND p_source_location_id = p_dest_location_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Source and destination locations cannot be identical.');
  END IF;

  -- 1. Check Available Stock at Source
  SELECT COALESCE(SUM(quantity), 0) INTO v_current_stock
  FROM public.stock_transactions
  WHERE item_id = p_item_id
    AND project_id = p_source_project_id
    AND (storage_location_id = p_source_location_id OR (storage_location_id IS NULL AND p_source_location_id IS NULL));

  IF v_current_stock < p_quantity THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', format('Insufficient stock. Available: %s, Requested: %s', v_current_stock, p_quantity)
    );
  END IF;

  v_transfer_id := gen_random_uuid();

  -- 2. Deduct from Source
  INSERT INTO public.stock_transactions (
    project_id, storage_location_id, item_id, quantity, transaction_type,
    reference_type, reference_id, created_by, notes
  ) VALUES (
    p_source_project_id, p_source_location_id, p_item_id, -p_quantity, 'TRANSFER',
    'WAREHOUSE_TRANSFER_OUT', v_transfer_id, v_calling_user_id,
    COALESCE(p_notes, 'โอนย้ายออกไปยังคลังปลายทาง')
  );

  -- 3. Add to Destination
  INSERT INTO public.stock_transactions (
    project_id, storage_location_id, item_id, quantity, transaction_type,
    reference_type, reference_id, created_by, notes
  ) VALUES (
    p_dest_project_id, p_dest_location_id, p_item_id, p_quantity, 'TRANSFER',
    'WAREHOUSE_TRANSFER_IN', v_transfer_id, v_calling_user_id,
    COALESCE(p_notes, 'รับโอนย้ายเข้าจากคลังต้นทาง')
  );

  RETURN jsonb_build_object(
    'success', true,
    'transfer_id', v_transfer_id,
    'message', 'โอนย้ายสินค้าข้ามคลังสำเร็จ'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 4. Permissions
GRANT EXECUTE ON FUNCTION public.admin_get_users() TO public, authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_item_warehouse(UUID, UUID, UUID, UUID, UUID, INTEGER, TEXT) TO public, authenticated, anon, service_role;

-- 5. Reload Schema Cache
NOTIFY pgrst, 'reload schema';
