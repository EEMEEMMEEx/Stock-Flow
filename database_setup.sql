-- =====================================================
-- FORTH StockFlow Database Setup Script
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. WAREHOUSES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.warehouses (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  address TEXT,
  phone TEXT,
  manager_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default warehouse
INSERT INTO public.warehouses (name, code, address) VALUES 
  ('คลังหลัก', 'MAIN', 'สำนักงานใหญ่')
ON CONFLICT (code) DO NOTHING;

-- Enable RLS
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow read for authenticated users" ON public.warehouses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow all for admin" ON public.warehouses
  FOR ALL TO authenticated 
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');


-- =====================================================
-- 2. WAREHOUSE TRANSFERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.warehouse_transfers (
  id SERIAL PRIMARY KEY,
  transfer_code TEXT UNIQUE NOT NULL,
  from_warehouse_id INTEGER REFERENCES public.warehouses(id),
  to_warehouse_id INTEGER REFERENCES public.warehouses(id),
  status TEXT DEFAULT 'pending', -- pending, in_transit, completed, cancelled
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.warehouse_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users" ON public.warehouse_transfers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated users" ON public.warehouse_transfers
  FOR INSERT TO authenticated WITH CHECK (true);


-- =====================================================
-- 3. TRANSFER ITEMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.transfer_items (
  id SERIAL PRIMARY KEY,
  transfer_id INTEGER REFERENCES public.warehouse_transfers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  quantity INTEGER NOT NULL
);

-- Enable RLS
ALTER TABLE public.transfer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users" ON public.transfer_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated users" ON public.transfer_items
  FOR INSERT TO authenticated WITH CHECK (true);


-- =====================================================
-- 4. ADD warehouse_id TO PRODUCTS
-- =====================================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'warehouse_id'
  ) THEN
    ALTER TABLE public.products 
    ADD COLUMN warehouse_id INTEGER REFERENCES public.warehouses(id) DEFAULT 1;
  END IF;
END $$;


-- =====================================================
-- 5. ADD warehouse_id TO ASSETS
-- =====================================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assets' AND column_name = 'warehouse_id'
  ) THEN
    ALTER TABLE public.assets 
    ADD COLUMN warehouse_id INTEGER REFERENCES public.warehouses(id) DEFAULT 1;
  END IF;
END $$;


-- =====================================================
-- 6. AUDIT LOGS TABLE (if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL, -- create, update, delete
  entity_type TEXT NOT NULL, -- product, asset, transaction, user
  entity_id TEXT,
  entity_name TEXT,
  old_value JSONB,
  new_value JSONB,
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  user_name TEXT,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for admin" ON public.audit_logs
  FOR SELECT TO authenticated 
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

CREATE POLICY "Allow insert for authenticated users" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);


-- =====================================================
-- 7. PROFILES TABLE (for user management)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'staff', -- admin, staff, viewer
  department TEXT,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow update own profile" ON public.profiles
  FOR UPDATE TO authenticated 
  USING (auth.uid() = id);

CREATE POLICY "Allow all for admin" ON public.profiles
  FOR ALL TO authenticated 
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =====================================================
-- 8. NOTIFICATIONS TABLE (optional)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  type TEXT NOT NULL, -- low_stock, checkout, return, system
  title TEXT NOT NULL,
  message TEXT,
  data JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read own notifications" ON public.notifications
  FOR SELECT TO authenticated 
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Allow insert for system" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

-- =====================================================
-- 9. RPC FUNCTIONS
-- =====================================================

-- Function: Get Low Stock Products (quantity < min_threshold)
CREATE OR REPLACE FUNCTION get_low_stock_products()
RETURNS TABLE (
  id UUID,
  name TEXT,
  quantity INTEGER,
  min_threshold INTEGER,
  sku TEXT,
  category TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name, p.quantity, p.min_threshold, p.sku, p.category
  FROM products p
  WHERE p.quantity < p.min_threshold
  ORDER BY p.quantity ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get Dashboard Stats
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_products', (SELECT COUNT(*) FROM products),
    'low_stock_count', (SELECT COUNT(*) FROM products WHERE quantity < min_threshold),
    'total_items', (SELECT COALESCE(SUM(quantity), 0) FROM products),
    'total_assets', (SELECT COUNT(*) FROM assets),
    'assets_in_use', (SELECT COUNT(*) FROM assets WHERE status = 'in_use')
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =====================================================
-- DONE! Verify tables created:
-- =====================================================
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;
