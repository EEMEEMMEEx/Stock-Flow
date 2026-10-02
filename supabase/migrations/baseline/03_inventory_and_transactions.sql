-- ==============================================================================
-- BASELINE 03: Inventory Orders, POS Withdrawals, Checkouts & Atomic RPCs
-- ==============================================================================

-- 1. Stock In Orders & Items (การรับเข้าสินค้า/วัสดุ)
CREATE TABLE IF NOT EXISTS public.stock_in_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  supplier TEXT,
  received_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  total_items INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_in_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_in_order_id UUID NOT NULL REFERENCES public.stock_in_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) DEFAULT 0,
  batch_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Inventory Requests & POS Orders (การเบิกจ่ายสินค้า/วัสดุ)
CREATE TABLE IF NOT EXISTS public.inventory_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number TEXT UNIQUE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  requester_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  purpose TEXT,
  notes TEXT,
  rejection_reason TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pos_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES public.inventory_requests(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  issued_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_name TEXT,
  delivery_note_number TEXT,
  delivery_note_file_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pos_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_order_id UUID NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Material Checkout & Return System (การยืม-คืนวัสดุ/อุปกรณ์)
CREATE TABLE IF NOT EXISTS public.material_checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_number TEXT UNIQUE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  serial_number TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  borrower_name TEXT NOT NULL,
  borrower_contact TEXT,
  issued_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  expected_return_date DATE,
  status TEXT NOT NULL DEFAULT 'borrowed' CHECK (status IN ('borrowed', 'returned', 'overdue', 'lost')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.material_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id UUID NOT NULL REFERENCES public.material_checkouts(id) ON DELETE CASCADE,
  return_date TIMESTAMPTZ DEFAULT NOW(),
  returned_by_name TEXT,
  received_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  condition TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('good', 'damaged', 'needs_repair', 'lost')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Stock Transactions Ledger (สมุดบัญชีคลังสินค้าหลัก - Source of Truth)
CREATE TABLE IF NOT EXISTS public.stock_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('IN', 'OUT', 'ADJUST', 'RETURN', 'TRANSFER', 'CHECKOUT')),
  reference_type TEXT,
  reference_id UUID,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. High-Performance Composite Indexes
CREATE INDEX IF NOT EXISTS idx_stock_transactions_lookup ON public.stock_transactions (project_id, item_id, storage_location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_created ON public.stock_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_requests_status ON public.inventory_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_in_items_order ON public.stock_in_items (stock_in_order_id);
CREATE INDEX IF NOT EXISTS idx_pos_order_items_order ON public.pos_order_items (pos_order_id);
CREATE INDEX IF NOT EXISTS idx_material_checkouts_status ON public.material_checkouts (status, project_id);

-- 6. Enable RLS
ALTER TABLE public.stock_in_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_in_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies (Read & Authenticated operations)
DROP POLICY IF EXISTS "stock_in_orders_read" ON public.stock_in_orders;
CREATE POLICY "stock_in_orders_read" ON public.stock_in_orders FOR SELECT USING (true);
DROP POLICY IF EXISTS "stock_in_items_read" ON public.stock_in_items;
CREATE POLICY "stock_in_items_read" ON public.stock_in_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "inventory_requests_read" ON public.inventory_requests;
CREATE POLICY "inventory_requests_read" ON public.inventory_requests FOR SELECT USING (true);
DROP POLICY IF EXISTS "pos_orders_read" ON public.pos_orders;
CREATE POLICY "pos_orders_read" ON public.pos_orders FOR SELECT USING (true);
DROP POLICY IF EXISTS "pos_order_items_read" ON public.pos_order_items;
CREATE POLICY "pos_order_items_read" ON public.pos_order_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "material_checkouts_read" ON public.material_checkouts;
CREATE POLICY "material_checkouts_read" ON public.material_checkouts FOR SELECT USING (true);
DROP POLICY IF EXISTS "material_returns_read" ON public.material_returns;
CREATE POLICY "material_returns_read" ON public.material_returns FOR SELECT USING (true);
DROP POLICY IF EXISTS "stock_transactions_read" ON public.stock_transactions;
CREATE POLICY "stock_transactions_read" ON public.stock_transactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "stock_in_orders_auth" ON public.stock_in_orders;
CREATE POLICY "stock_in_orders_auth" ON public.stock_in_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "stock_in_items_auth" ON public.stock_in_items;
CREATE POLICY "stock_in_items_auth" ON public.stock_in_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "inventory_requests_auth" ON public.inventory_requests;
CREATE POLICY "inventory_requests_auth" ON public.inventory_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "pos_orders_auth" ON public.pos_orders;
CREATE POLICY "pos_orders_auth" ON public.pos_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "pos_order_items_auth" ON public.pos_order_items;
CREATE POLICY "pos_order_items_auth" ON public.pos_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "material_checkouts_auth" ON public.material_checkouts;
CREATE POLICY "material_checkouts_auth" ON public.material_checkouts FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "material_returns_auth" ON public.material_returns;
CREATE POLICY "material_returns_auth" ON public.material_returns FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "stock_transactions_auth" ON public.stock_transactions;
CREATE POLICY "stock_transactions_auth" ON public.stock_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. Hardened Atomic RPCs (SET search_path = public, pg_temp)

-- Warehouse Item Transfer RPC
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

GRANT EXECUTE ON FUNCTION public.transfer_item_warehouse(UUID, UUID, UUID, UUID, UUID, INTEGER, TEXT) TO authenticated, service_role;
