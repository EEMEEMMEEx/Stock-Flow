-- 1. Drop old tables and views (WARNING: Deletes old transactions)
DROP VIEW IF EXISTS public.stock_balance;
DROP TABLE IF EXISTS public.withdrawals;
DROP TABLE IF EXISTS public.stock_entries;

-- 2. Withdrawal Orders (หัวบิลเบิกจ่าย)
CREATE TABLE public.withdrawal_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  requested_by UUID REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  purpose TEXT,
  notes TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.withdrawal_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own withdrawal_orders, admins view all" ON public.withdrawal_orders FOR SELECT USING (
  auth.uid() = requested_by OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can insert withdrawal_orders" ON public.withdrawal_orders FOR INSERT WITH CHECK (
  auth.uid() = requested_by
);
CREATE POLICY "Admins can update withdrawal_orders" ON public.withdrawal_orders FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 3. Withdrawal Items (รายการเบิกจ่ายย่อย)
CREATE TABLE public.withdrawal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.withdrawal_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

ALTER TABLE public.withdrawal_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own withdrawal_items, admins view all" ON public.withdrawal_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.withdrawal_orders 
    WHERE withdrawal_orders.id = withdrawal_items.order_id 
    AND (withdrawal_orders.requested_by = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  )
);
CREATE POLICY "Users can insert withdrawal_items" ON public.withdrawal_items FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.withdrawal_orders 
    WHERE withdrawal_orders.id = order_id AND withdrawal_orders.requested_by = auth.uid()
  )
);

-- 4. Stock In Orders (หัวบิลรับเข้า)
CREATE TABLE public.stock_in_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id),
  supplier TEXT,
  po_number TEXT,
  notes TEXT,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.stock_in_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Stock in orders viewable by everyone" ON public.stock_in_orders FOR SELECT USING (true);
CREATE POLICY "Only admins can manage stock in orders" ON public.stock_in_orders FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 5. Stock In Items (รายการรับเข้าย่อย)
CREATE TABLE public.stock_in_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.stock_in_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(12,2)
);

ALTER TABLE public.stock_in_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Stock in items viewable by everyone" ON public.stock_in_items FOR SELECT USING (true);
CREATE POLICY "Only admins can manage stock in items" ON public.stock_in_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 6. Recreate Stock Balance View
CREATE OR REPLACE VIEW public.stock_balance AS
SELECT 
  sio.project_id,
  sii.item_id,
  i.name AS item_name,
  i.unit,
  p.name AS project_name,
  COALESCE(SUM(sii.quantity), 0) AS total_in,
  COALESCE((
    SELECT SUM(wi.quantity) 
    FROM public.withdrawal_items wi
    JOIN public.withdrawal_orders wo ON wo.id = wi.order_id
    WHERE wo.project_id = sio.project_id 
    AND wi.item_id = sii.item_id 
    AND wo.status IN ('approved', 'completed')
  ), 0) AS total_out,
  COALESCE(SUM(sii.quantity), 0) - COALESCE((
    SELECT SUM(wi.quantity) 
    FROM public.withdrawal_items wi
    JOIN public.withdrawal_orders wo ON wo.id = wi.order_id
    WHERE wo.project_id = sio.project_id 
    AND wi.item_id = sii.item_id 
    AND wo.status IN ('approved', 'completed')
  ), 0) AS balance
FROM public.stock_in_items sii
JOIN public.stock_in_orders sio ON sio.id = sii.order_id
JOIN public.items i ON i.id = sii.item_id
JOIN public.projects p ON p.id = sio.project_id
GROUP BY sio.project_id, sii.item_id, i.name, i.unit, p.name;
