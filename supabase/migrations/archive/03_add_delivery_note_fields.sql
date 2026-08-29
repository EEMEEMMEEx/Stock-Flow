-- Add Delivery Note fields to withdrawal_items
ALTER TABLE public.withdrawal_items 
ADD COLUMN delivery_to TEXT,
ADD COLUMN serial_number TEXT,
ADD COLUMN part_number TEXT;

-- Also add to stock_in_items in case they want to record it during receiving
ALTER TABLE public.stock_in_items 
ADD COLUMN delivery_to TEXT,
ADD COLUMN serial_number TEXT,
ADD COLUMN part_number TEXT;
