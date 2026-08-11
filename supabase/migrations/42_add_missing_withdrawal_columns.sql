-- Migration 42: Add missing columns to withdrawal_orders and withdrawal_items on Cloud DB
-- Purpose: Resolve HTTP 400 when creating withdrawal orders with delivery_address and tracking details

ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS work_order_no TEXT;
ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS is_shortage_override BOOLEAN DEFAULT FALSE;
ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS override_reason TEXT;
ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS has_shortage BOOLEAN DEFAULT FALSE;
ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS reject_reason TEXT;
ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

ALTER TABLE public.withdrawal_items ADD COLUMN IF NOT EXISTS delivery_to TEXT;
ALTER TABLE public.withdrawal_items ADD COLUMN IF NOT EXISTS serial_number TEXT;
ALTER TABLE public.withdrawal_items ADD COLUMN IF NOT EXISTS part_number TEXT;
ALTER TABLE public.withdrawal_items ADD COLUMN IF NOT EXISTS is_shortage BOOLEAN DEFAULT FALSE;
ALTER TABLE public.withdrawal_items ADD COLUMN IF NOT EXISTS requested_qty INTEGER;
ALTER TABLE public.withdrawal_items ADD COLUMN IF NOT EXISTS fulfilled_qty INTEGER DEFAULT 0;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
