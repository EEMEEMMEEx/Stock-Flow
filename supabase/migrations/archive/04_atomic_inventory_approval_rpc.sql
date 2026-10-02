-- =================================================================
-- MIGRATION 04: ATOMIC INVENTORY APPROVAL & STOCK TRANSACTIONS RPC
-- (Self-Contained Full Schema Setup & RPC Migration)
-- =================================================================

-- 0. Base Master Tables (Idempotent Setup)

-- 0.1 Profiles (เก็บข้อมูล user เพิ่มเติมจาก auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT 'User',
  role TEXT NOT NULL DEFAULT 'staff',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all required columns exist even if public.profiles already pre-existed
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT 'User',
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'staff',
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile." ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
CREATE POLICY "Users can update own profile." ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Handle new user creation trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'User'), 
    COALESCE(new.raw_user_meta_data->>'role', 'staff')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 0.2 Projects (โครงการ)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_code TEXT,
  description TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS project_code TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id);

-- Fix owner_id NOT NULL constraint if it pre-existed in database
DO $$ 
BEGIN
  ALTER TABLE public.projects ALTER COLUMN owner_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN 
  NULL;
END $$;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Projects are viewable by everyone." ON public.projects;
CREATE POLICY "Projects are viewable by everyone." ON public.projects FOR SELECT USING (true);
DROP POLICY IF EXISTS "Only admins can insert projects" ON public.projects;
CREATE POLICY "Only admins can insert projects" ON public.projects FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
DROP POLICY IF EXISTS "Only admins can update projects" ON public.projects;
CREATE POLICY "Only admins can update projects" ON public.projects FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 0.3 Categories (หมวดหมู่สินค้า)
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Categories are viewable by everyone." ON public.categories;
CREATE POLICY "Categories are viewable by everyone." ON public.categories FOR SELECT USING (true);

-- Seed default categories if empty
INSERT INTO public.categories (name, description)
SELECT name, description FROM (VALUES
  ('วัสดุก่อสร้าง', 'ปูน, หิน, ดิน, ทราย, เหล็ก'),
  ('งานไฟฟ้าและแสงสว่าง', 'สายไฟ, สวิตช์, หลอดไฟ'),
  ('งานประปาและสุขภัณฑ์', 'ท่อ PVC, ก๊อกน้ำ, ข้อต่อ'),
  ('เครื่องมือช่างและอุปกรณ์', 'สว่าน, ค้อน, คีม, ตะปู'),
  ('สีและเคมีภัณฑ์', 'สีทาบ้าน, กาว, น้ำยา'),
  ('เบ็ดเตล็ด', 'อุปกรณ์ทั่วไป')
) AS default_cats(name, description)
WHERE NOT EXISTS (SELECT 1 FROM public.categories LIMIT 1);
DROP POLICY IF EXISTS "Only admins can insert categories" ON public.categories;
CREATE POLICY "Only admins can insert categories" ON public.categories FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 0.4 Items (รายการสินค้า/วัสดุ Master)
CREATE TABLE IF NOT EXISTS public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  category_id UUID REFERENCES public.categories(id),
  unit TEXT NOT NULL DEFAULT 'ชิ้น',
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.items 
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS sku TEXT,
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id),
ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'ชิ้น',
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Items viewable by everyone" ON public.items;
CREATE POLICY "Items viewable by everyone" ON public.items FOR SELECT USING (true);
DROP POLICY IF EXISTS "Only admins can manage items" ON public.items;
CREATE POLICY "Only admins can manage items" ON public.items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 0.5 Withdrawal Orders & Items (คำขอเบิกจ่าย)
CREATE TABLE IF NOT EXISTS public.withdrawal_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id),
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by UUID REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  purpose TEXT,
  notes TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.withdrawal_orders 
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id),
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS purpose TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reject_reason TEXT,
ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS delivery_address TEXT;

CREATE TABLE IF NOT EXISTS public.withdrawal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.withdrawal_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  delivery_to TEXT,
  serial_number TEXT,
  part_number TEXT
);

ALTER TABLE public.withdrawal_items 
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.withdrawal_orders(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES public.items(id),
ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS delivery_to TEXT,
ADD COLUMN IF NOT EXISTS serial_number TEXT,
ADD COLUMN IF NOT EXISTS part_number TEXT;

ALTER TABLE public.withdrawal_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own withdrawal_orders, admins view all" ON public.withdrawal_orders;
CREATE POLICY "Users can view their own withdrawal_orders, admins view all" ON public.withdrawal_orders FOR SELECT USING (
  auth.uid() = requested_by OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
DROP POLICY IF EXISTS "Users can insert withdrawal_orders" ON public.withdrawal_orders;
CREATE POLICY "Users can insert withdrawal_orders" ON public.withdrawal_orders FOR INSERT WITH CHECK (
  auth.uid() = requested_by
);
DROP POLICY IF EXISTS "Admins can update withdrawal_orders" ON public.withdrawal_orders;
CREATE POLICY "Admins can update withdrawal_orders" ON public.withdrawal_orders FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

ALTER TABLE public.withdrawal_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own withdrawal_items, admins view all" ON public.withdrawal_items;
CREATE POLICY "Users can view their own withdrawal_items, admins view all" ON public.withdrawal_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.withdrawal_orders 
    WHERE withdrawal_orders.id = withdrawal_items.order_id 
    AND (withdrawal_orders.requested_by = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  )
);
DROP POLICY IF EXISTS "Users can insert withdrawal_items" ON public.withdrawal_items;
CREATE POLICY "Users can insert withdrawal_items" ON public.withdrawal_items FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.withdrawal_orders 
    WHERE withdrawal_orders.id = order_id AND withdrawal_orders.requested_by = auth.uid()
  )
);

-- 0.6 Stock In Orders & Items (บิลรับเข้าสต็อก)
CREATE TABLE IF NOT EXISTS public.stock_in_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id),
  supplier TEXT,
  po_number TEXT,
  notes TEXT,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.stock_in_orders 
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id),
ADD COLUMN IF NOT EXISTS supplier TEXT,
ADD COLUMN IF NOT EXISTS po_number TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS received_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.stock_in_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.stock_in_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(12,2),
  delivery_to TEXT,
  serial_number TEXT,
  part_number TEXT
);

ALTER TABLE public.stock_in_items 
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.stock_in_orders(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES public.items(id),
ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS unit_price DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS delivery_to TEXT,
ADD COLUMN IF NOT EXISTS serial_number TEXT,
ADD COLUMN IF NOT EXISTS part_number TEXT;

ALTER TABLE public.stock_in_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Stock in orders viewable by everyone" ON public.stock_in_orders;
CREATE POLICY "Stock in orders viewable by everyone" ON public.stock_in_orders FOR SELECT USING (true);
DROP POLICY IF EXISTS "Only admins can manage stock in orders" ON public.stock_in_orders;
CREATE POLICY "Only admins can manage stock in orders" ON public.stock_in_orders FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

ALTER TABLE public.stock_in_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Stock in items viewable by everyone" ON public.stock_in_items;
CREATE POLICY "Stock in items viewable by everyone" ON public.stock_in_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "Only admins can manage stock in items" ON public.stock_in_items;
CREATE POLICY "Only admins can manage stock in items" ON public.stock_in_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Ensure status check constraint includes 'pending', 'approved', 'rejected', 'completed'
ALTER TABLE public.withdrawal_orders DROP CONSTRAINT IF EXISTS withdrawal_orders_status_check;
ALTER TABLE public.withdrawal_orders ADD CONSTRAINT withdrawal_orders_status_check 
  CHECK (status IN ('pending', 'approved', 'rejected', 'completed'));

-- 2. Create Stock Transactions Table (idempotent logging of inventory changes)
CREATE TABLE IF NOT EXISTS public.stock_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id),
  item_id UUID NOT NULL REFERENCES public.items(id),
  request_id UUID REFERENCES public.withdrawal_orders(id) ON DELETE CASCADE,
  request_item_id UUID REFERENCES public.withdrawal_items(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('stock_in', 'stock_out')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_request_item_stock_out UNIQUE (request_item_id, transaction_type)
);

-- RLS for stock_transactions
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Stock transactions viewable by everyone" ON public.stock_transactions;
CREATE POLICY "Stock transactions viewable by everyone" ON public.stock_transactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Only admins can manage stock transactions" ON public.stock_transactions;
CREATE POLICY "Only admins can manage stock transactions" ON public.stock_transactions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_stock_transactions_request_id ON public.stock_transactions(request_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_project_item ON public.stock_transactions(project_id, item_id);

-- 3. Re-create Stock Balance View to calculate physical balance based on stock_in and stock_out transactions
CREATE OR REPLACE VIEW public.stock_balance AS
SELECT 
  sio.project_id,
  sii.item_id,
  i.name AS item_name,
  i.unit,
  p.name AS project_name,
  COALESCE(SUM(sii.quantity), 0) AS total_in,
  COALESCE((
    SELECT SUM(st.quantity) 
    FROM public.stock_transactions st
    WHERE st.project_id = sio.project_id 
    AND st.item_id = sii.item_id 
    AND st.transaction_type = 'stock_out'
  ), 0) AS total_out,
  COALESCE(SUM(sii.quantity), 0) - COALESCE((
    SELECT SUM(st.quantity) 
    FROM public.stock_transactions st
    WHERE st.project_id = sio.project_id 
    AND st.item_id = sii.item_id 
    AND st.transaction_type = 'stock_out'
  ), 0) AS balance
FROM public.stock_in_items sii
JOIN public.stock_in_orders sio ON sio.id = sii.order_id
JOIN public.items i ON i.id = sii.item_id
JOIN public.projects p ON p.id = sio.project_id
GROUP BY sio.project_id, sii.item_id, i.name, i.unit, p.name;

-- 4. Supabase RPC: approve_inventory_request(p_request_id UUID, p_allow_shortage BOOLEAN, p_override_reason TEXT)
CREATE OR REPLACE FUNCTION public.approve_inventory_request(
  p_request_id UUID,
  p_allow_shortage BOOLEAN DEFAULT FALSE,
  p_override_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_order RECORD;
  v_item RECORD;
  v_avail_stock INTEGER;
  v_deducted INTEGER;
  v_shortage INTEGER;
  v_has_any_shortage BOOLEAN := FALSE;
  v_shortage_list JSONB := '[]'::jsonb;
BEGIN
  -- A. Verify caller authorization
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can approve inventory requests.';
  END IF;

  -- B. STEP 1: Lock the target request row and verify status = 'pending'
  SELECT * INTO v_order
  FROM public.withdrawal_orders
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found: %', p_request_id;
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Invalid request state: Request is currently % (only pending requests can be approved)', v_order.status;
  END IF;

  -- C. STEP 2: Lock all referenced item rows in deterministic order to prevent deadlocks
  PERFORM id 
  FROM public.items 
  WHERE id IN (
    SELECT item_id FROM public.withdrawal_items WHERE order_id = p_request_id
  ) 
  ORDER BY id 
  FOR UPDATE;

  -- D. STEP 3: Check availability & calculate shortage for ALL items
  FOR v_item IN 
    SELECT wi.id AS request_item_id, wi.item_id, wi.quantity, i.name AS item_name, i.unit
    FROM public.withdrawal_items wi
    JOIN public.items i ON i.id = wi.item_id
    WHERE wi.order_id = p_request_id
  LOOP
    SELECT COALESCE((
      SELECT balance 
      FROM public.stock_balance 
      WHERE project_id = v_order.project_id 
      AND item_id = v_item.item_id
    ), 0) INTO v_avail_stock;

    v_deducted := GREATEST(LEAST(v_avail_stock, v_item.quantity), 0);
    v_shortage := GREATEST(v_item.quantity - v_avail_stock, 0);

    IF v_shortage > 0 THEN
      v_has_any_shortage := TRUE;
      v_shortage_list := v_shortage_list || jsonb_build_object(
        'request_item_id', v_item.request_item_id,
        'item_id', v_item.item_id,
        'item_name', v_item.item_name,
        'unit', v_item.unit,
        'requested', v_item.quantity,
        'available', COALESCE(v_avail_stock, 0),
        'deducted', v_deducted,
        'shortage', v_shortage
      );
    END IF;
  END LOOP;

  IF v_has_any_shortage AND NOT p_allow_shortage THEN
    RAISE EXCEPTION 'SHORTAGE_DETECTED: %', jsonb_build_object(
      'order_id', p_request_id,
      'shortages', v_shortage_list,
      'message', 'จำนวนวัสดุในโครงการนี้ไม่เพียงพอสำหรับคำขอเบิกจ่าย'
    )::text;
  END IF;

  -- E. STEP 4: Process deductions and update item-level shortage records
  FOR v_item IN 
    SELECT wi.id AS request_item_id, wi.item_id, wi.quantity
    FROM public.withdrawal_items wi
    WHERE wi.order_id = p_request_id
  LOOP
    SELECT COALESCE((
      SELECT balance 
      FROM public.stock_balance 
      WHERE project_id = v_order.project_id 
      AND item_id = v_item.item_id
    ), 0) INTO v_avail_stock;

    v_deducted := GREATEST(LEAST(v_avail_stock, v_item.quantity), 0);
    v_shortage := GREATEST(v_item.quantity - v_avail_stock, 0);

    UPDATE public.withdrawal_items
    SET
      available_at_approval = COALESCE(v_avail_stock, 0),
      deducted_quantity = v_deducted,
      shortage_quantity = v_shortage
    WHERE id = v_item.request_item_id;

    IF v_deducted > 0 THEN
      INSERT INTO public.stock_transactions (
        project_id,
        item_id,
        request_id,
        request_item_id,
        transaction_type,
        quantity,
        created_by
      ) VALUES (
        v_order.project_id,
        v_item.item_id,
        p_request_id,
        v_item.request_item_id,
        'stock_out',
        v_deducted,
        auth.uid()
      );
    END IF;
  END LOOP;

  -- F. STEP 5: Update request status to 'approved' with override metadata
  UPDATE public.withdrawal_orders
  SET 
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = NOW(),
    has_shortage = v_has_any_shortage,
    is_shortage_override = (p_allow_shortage AND v_has_any_shortage),
    override_reason = CASE WHEN (p_allow_shortage AND v_has_any_shortage) THEN p_override_reason ELSE NULL END
  WHERE id = p_request_id;

  -- G. STEP 6: Return success payload
  RETURN jsonb_build_object(
    'success', true,
    'message', CASE WHEN v_has_any_shortage THEN 'อนุมัติคำขอเบิกจ่ายกรณีของไม่ครบเรียบร้อยแล้ว' ELSE 'อนุมัติคำขอเบิกจ่ายและตัดสต็อกสำเร็จ' END,
    'order_id', p_request_id,
    'has_shortage', v_has_any_shortage,
    'shortages', v_shortage_list
  );
END;
$$;

-- 5. Supabase RPC: reject_inventory_request(p_request_id UUID, p_reject_reason TEXT)
CREATE OR REPLACE FUNCTION public.reject_inventory_request(
  p_request_id UUID,
  p_reject_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_order RECORD;
BEGIN
  -- A. Verify caller authorization
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can reject inventory requests.';
  END IF;

  -- B. Lock request and verify pending status
  SELECT * INTO v_order
  FROM public.withdrawal_orders
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found: %', p_request_id;
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Invalid request state: Request % is currently % (only pending requests can be rejected)', p_request_id, v_order.status;
  END IF;

  -- C. Update request to rejected
  UPDATE public.withdrawal_orders
  SET 
    status = 'rejected',
    reject_reason = p_reject_reason,
    rejected_by = auth.uid(),
    rejected_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Request rejected successfully.',
    'request_id', p_request_id
  );
END;
$$;

-- 6. Supabase RPC: complete_inventory_request(p_request_id UUID)
CREATE OR REPLACE FUNCTION public.complete_inventory_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  -- Lock request and verify ownership and approved status
  SELECT * INTO v_order
  FROM public.withdrawal_orders
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found: %', p_request_id;
  END IF;

  IF v_order.requested_by != auth.uid() THEN
    -- Check if admin override is allowed or restrict strictly to requester
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
      RAISE EXCEPTION 'Unauthorized: You can only complete your own requests.';
    END IF;
  END IF;

  IF v_order.status != 'approved' THEN
    RAISE EXCEPTION 'Invalid request state: Request % is currently % (only approved requests can be completed)', p_request_id, v_order.status;
  END IF;

  -- Update request to completed
  UPDATE public.withdrawal_orders
  SET 
    status = 'completed',
    completed_at = NOW(),
    completed_by = auth.uid()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Request completed successfully.',
    'request_id', p_request_id
  );
END;
$$;

-- Grant EXECUTE permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.approve_inventory_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_inventory_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_inventory_request(UUID) TO authenticated;

-- Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
