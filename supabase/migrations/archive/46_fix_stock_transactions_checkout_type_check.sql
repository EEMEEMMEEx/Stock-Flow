-- Migration 46: Fix Stock Transactions Transaction Type Check Constraint & Balance Calculation
-- Resolves Error 23514 (stock_transactions_transaction_type_check violation)
-- Expands allowed transaction types to include 'checkout_out', 'return_in', 'transfer_in', 'transfer_out', 'adjustment'
-- Updates stock_balance view to accurately deduct checked-out items and add back returned items.

-- 1. Drop existing transaction_type check constraint
ALTER TABLE public.stock_transactions 
  DROP CONSTRAINT IF EXISTS stock_transactions_transaction_type_check;

-- 2. Add new check constraint with all active and forward-compatible transaction types
ALTER TABLE public.stock_transactions 
  ADD CONSTRAINT stock_transactions_transaction_type_check 
  CHECK (transaction_type IN ('stock_in', 'stock_out', 'checkout_out', 'return_in', 'transfer_in', 'transfer_out', 'adjustment'));

-- 3. Update stock_balance view to reflect checkout_out and return_in
CREATE OR REPLACE VIEW public.stock_balance AS
SELECT 
  sio.project_id,
  sii.item_id,
  i.name AS item_name,
  i.unit,
  p.name AS project_name,
  COALESCE(SUM(sii.quantity), 0) AS total_in,
  COALESCE((
    SELECT SUM(
      CASE 
        WHEN st.transaction_type IN ('stock_out', 'checkout_out', 'transfer_out') THEN st.quantity
        WHEN st.transaction_type IN ('return_in') THEN -st.quantity
        ELSE 0
      END
    )
    FROM public.stock_transactions st
    WHERE st.project_id = sio.project_id 
    AND st.item_id = sii.item_id 
  ), 0) AS total_out,
  COALESCE(SUM(sii.quantity), 0) - COALESCE((
    SELECT SUM(
      CASE 
        WHEN st.transaction_type IN ('stock_out', 'checkout_out', 'transfer_out') THEN st.quantity
        WHEN st.transaction_type IN ('return_in') THEN -st.quantity
        ELSE 0
      END
    )
    FROM public.stock_transactions st
    WHERE st.project_id = sio.project_id 
    AND st.item_id = sii.item_id 
  ), 0) AS balance
FROM public.stock_in_items sii
JOIN public.stock_in_orders sio ON sio.id = sii.order_id
JOIN public.items i ON i.id = sii.item_id
JOIN public.projects p ON p.id = sio.project_id
GROUP BY sio.project_id, sii.item_id, i.name, i.unit, p.name;
