-- Migration 44: Material Checkout & Return System
-- Enables tool/equipment/asset temporary checkout, due-date tracking, partial returns, and condition auditing

-- 1. Create Checkout Orders Table (Header)
CREATE TABLE IF NOT EXISTS public.checkout_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  
  -- Borrower Details
  borrower_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  borrower_name TEXT NOT NULL,
  borrower_phone TEXT,
  borrower_department TEXT,
  
  -- Date & Deadlines
  checkout_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_return_date DATE NOT NULL,
  actual_returned_date TIMESTAMPTZ,
  
  -- Lifecycle Status: active, partial_returned, completed, overdue, cancelled
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'partial_returned', 'completed', 'overdue', 'cancelled')
  ),
  
  purpose TEXT,
  signature_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Checkout Items Table (Line Items)
CREATE TABLE IF NOT EXISTS public.checkout_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_order_id UUID NOT NULL REFERENCES public.checkout_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  
  serial_number TEXT,
  quantity_borrowed NUMERIC NOT NULL CHECK (quantity_borrowed > 0),
  quantity_returned NUMERIC NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
  quantity_damaged NUMERIC NOT NULL DEFAULT 0 CHECK (quantity_damaged >= 0),
  quantity_lost NUMERIC NOT NULL DEFAULT 0 CHECK (quantity_lost >= 0),
  
  condition_on_checkout TEXT DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'borrowed' CHECK (
    status IN ('borrowed', 'returned', 'damaged', 'lost')
  ),
  notes TEXT
);

-- 3. Create Return Logs Table (Audit Trail of Returns)
CREATE TABLE IF NOT EXISTS public.checkout_return_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_order_id UUID NOT NULL REFERENCES public.checkout_orders(id) ON DELETE CASCADE,
  checkout_item_id UUID NOT NULL REFERENCES public.checkout_items(id) ON DELETE CASCADE,
  
  returned_quantity NUMERIC NOT NULL CHECK (returned_quantity > 0),
  item_condition TEXT NOT NULL DEFAULT 'normal' CHECK (
    item_condition IN ('normal', 'damaged', 'lost', 'needs_repair')
  ),
  destination_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  
  received_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  returned_at TIMESTAMPTZ DEFAULT now(),
  damage_notes TEXT,
  evidence_photo_url TEXT
);

-- 4. Enable RLS
ALTER TABLE public.checkout_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_return_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (Allow authenticated users full view/insert/update)
DROP POLICY IF EXISTS "Allow authenticated full access to checkout_orders" ON public.checkout_orders;
CREATE POLICY "Allow authenticated full access to checkout_orders"
ON public.checkout_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to checkout_items" ON public.checkout_items;
CREATE POLICY "Allow authenticated full access to checkout_items"
ON public.checkout_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to checkout_return_logs" ON public.checkout_return_logs;
CREATE POLICY "Allow authenticated full access to checkout_return_logs"
ON public.checkout_return_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Indexes for High-Performance Queries
CREATE INDEX IF NOT EXISTS idx_checkout_orders_project_id ON public.checkout_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_checkout_orders_status ON public.checkout_orders(status);
CREATE INDEX IF NOT EXISTS idx_checkout_orders_expected_return ON public.checkout_orders(expected_return_date);
CREATE INDEX IF NOT EXISTS idx_checkout_items_order_id ON public.checkout_items(checkout_order_id);
CREATE INDEX IF NOT EXISTS idx_checkout_items_item_id ON public.checkout_items(item_id);
CREATE INDEX IF NOT EXISTS idx_checkout_return_logs_order_id ON public.checkout_return_logs(checkout_order_id);

-- 7. Atomic RPC: Process Checkout Order
CREATE OR REPLACE FUNCTION public.process_checkout_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id UUID;
  v_borrower_name TEXT;
  v_borrower_phone TEXT;
  v_borrower_department TEXT;
  v_borrower_id UUID;
  v_expected_return_date DATE;
  v_purpose TEXT;
  v_notes TEXT;
  v_created_by UUID;
  v_items JSONB;
  v_order_number TEXT;
  v_order_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_qty NUMERIC;
  v_serial TEXT;
  v_condition TEXT;
BEGIN
  -- Parse header params
  v_project_id := (p_payload->>'project_id')::UUID;
  v_borrower_name := TRIM(p_payload->>'borrower_name');
  v_borrower_phone := p_payload->>'borrower_phone';
  v_borrower_department := p_payload->>'borrower_department';
  v_expected_return_date := (p_payload->>'expected_return_date')::DATE;
  v_purpose := p_payload->>'purpose';
  v_notes := p_payload->>'notes';
  v_created_by := NULLIF(p_payload->>'created_by', '')::UUID;
  v_items := p_payload->'items';

  IF v_borrower_name IS NULL OR v_borrower_name = '' THEN
    RAISE EXCEPTION 'กรุณาระบุชื่อผู้ยืมพัสดุ';
  END IF;

  IF v_expected_return_date IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุกำหนดวันส่งคืน';
  END IF;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'ต้องมีรายการวัสดุ/เครื่องมืออย่างน้อย 1 รายการ';
  END IF;

  -- Generate order number: CHK-YYYYMM-XXXX
  v_order_number := 'CHK-' || to_char(now(), 'YYYYMM') || '-' || lpad(floor(random()*9000 + 1000)::text, 4, '0');

  -- Insert checkout order header
  INSERT INTO public.checkout_orders (
    order_number, project_id, borrower_id, borrower_name, borrower_phone,
    borrower_department, checkout_date, expected_return_date, status,
    purpose, notes, created_by
  ) VALUES (
    v_order_number, v_project_id, v_borrower_id, v_borrower_name, v_borrower_phone,
    v_borrower_department, now(), v_expected_return_date, 'active',
    v_purpose, v_notes, v_created_by
  ) RETURNING id INTO v_order_id;

  -- Insert line items
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_serial := NULLIF(v_item->>'serial_number', '');
    v_condition := COALESCE(v_item->>'condition', 'normal');

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'จำนวนที่ขอยืมต้องมากกว่า 0';
    END IF;

    INSERT INTO public.checkout_items (
      checkout_order_id, item_id, serial_number, quantity_borrowed,
      quantity_returned, condition_on_checkout, status, notes
    ) VALUES (
      v_order_id, v_item_id, v_serial, v_qty,
      0, v_condition, 'borrowed', v_item->>'notes'
    );

    -- Log transaction deduction (checkout_out)
    INSERT INTO public.stock_transactions (
      project_id, item_id, transaction_type, quantity, created_by
    ) VALUES (
      v_project_id, v_item_id, 'checkout_out', v_qty, v_created_by
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$$;

-- 8. Atomic RPC: Process Return Order
CREATE OR REPLACE FUNCTION public.process_return_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id UUID;
  v_received_by UUID;
  v_returns JSONB;
  v_ret JSONB;
  v_checkout_item_id UUID;
  v_return_qty NUMERIC;
  v_condition TEXT;
  v_dest_project_id UUID;
  v_damage_notes TEXT;
  v_checkout_item RECORD;
  v_order_project_id UUID;
  v_all_returned BOOLEAN := true;
  v_new_returned_total NUMERIC;
  v_new_damaged_total NUMERIC;
  v_new_lost_total NUMERIC;
BEGIN
  v_order_id := (p_payload->>'order_id')::UUID;
  v_received_by := NULLIF(p_payload->>'received_by', '')::UUID;
  v_returns := p_payload->'returns';

  SELECT project_id INTO v_order_project_id FROM public.checkout_orders WHERE id = v_order_id;
  IF v_order_project_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคำสั่งยืมพัสดุ';
  END IF;

  FOR v_ret IN SELECT * FROM jsonb_array_elements(v_returns)
  LOOP
    v_checkout_item_id := (v_ret->>'checkout_item_id')::UUID;
    v_return_qty := (v_ret->>'returned_quantity')::NUMERIC;
    v_condition := COALESCE(v_ret->>'condition', 'normal');
    v_dest_project_id := COALESCE(NULLIF(v_ret->>'destination_project_id', '')::UUID, v_order_project_id);
    v_damage_notes := v_ret->>'damage_notes';

    SELECT * INTO v_checkout_item FROM public.checkout_items WHERE id = v_checkout_item_id;
    IF v_checkout_item.id IS NULL THEN
      RAISE EXCEPTION 'ไม่พบรายการอุปกรณ์ที่ยืม ID: %', v_checkout_item_id;
    END IF;

    IF v_return_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF (v_checkout_item.quantity_returned + v_checkout_item.quantity_damaged + v_checkout_item.quantity_lost + v_return_qty) > v_checkout_item.quantity_borrowed THEN
      RAISE EXCEPTION 'จำนวนที่รับคืนรวมเกินกว่าจำนวนที่ยืมไป';
    END IF;

    -- Record return log
    INSERT INTO public.checkout_return_logs (
      checkout_order_id, checkout_item_id, returned_quantity,
      item_condition, destination_project_id, received_by, returned_at,
      damage_notes
    ) VALUES (
      v_order_id, v_checkout_item_id, v_return_qty,
      v_condition, v_dest_project_id, v_received_by, now(),
      v_damage_notes
    );

    -- Calculate updated metrics on line item
    IF v_condition = 'normal' THEN
      v_new_returned_total := v_checkout_item.quantity_returned + v_return_qty;
      v_new_damaged_total := v_checkout_item.quantity_damaged;
      v_new_lost_total := v_checkout_item.quantity_lost;
      
      -- Add stock back to destination project
      INSERT INTO public.stock_transactions (
        project_id, item_id, transaction_type, quantity, created_by
      ) VALUES (
        v_dest_project_id, v_checkout_item.item_id, 'return_in', v_return_qty, v_received_by
      );
    ELSIF v_condition = 'damaged' OR v_condition = 'needs_repair' THEN
      v_new_returned_total := v_checkout_item.quantity_returned;
      v_new_damaged_total := v_checkout_item.quantity_damaged + v_return_qty;
      v_new_lost_total := v_checkout_item.quantity_lost;
    ELSIF v_condition = 'lost' THEN
      v_new_returned_total := v_checkout_item.quantity_returned;
      v_new_damaged_total := v_checkout_item.quantity_damaged;
      v_new_lost_total := v_checkout_item.quantity_lost + v_return_qty;
    END IF;

    UPDATE public.checkout_items SET
      quantity_returned = v_new_returned_total,
      quantity_damaged = v_new_damaged_total,
      quantity_lost = v_new_lost_total,
      status = CASE 
        WHEN (v_new_returned_total + v_new_damaged_total + v_new_lost_total) >= quantity_borrowed THEN 'returned'
        ELSE 'borrowed'
      END
    WHERE id = v_checkout_item_id;
  END LOOP;

  -- Check if all items in order are completed
  FOR v_checkout_item IN SELECT * FROM public.checkout_items WHERE checkout_order_id = v_order_id
  LOOP
    IF (v_checkout_item.quantity_returned + v_checkout_item.quantity_damaged + v_checkout_item.quantity_lost) < v_checkout_item.quantity_borrowed THEN
      v_all_returned := false;
    END IF;
  END LOOP;

  -- Update checkout order status
  IF v_all_returned THEN
    UPDATE public.checkout_orders SET
      status = 'completed',
      actual_returned_date = now()
    WHERE id = v_order_id;
  ELSE
    UPDATE public.checkout_orders SET
      status = 'partial_returned'
    WHERE id = v_order_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'completed', v_all_returned
  );
END;
$$;
