-- Restore legacy transfer ledger types required by process_item_transfer.
--
-- Pre-deployment backup (required): export the current output of
-- pg_get_constraintdef(...) and pg_get_functiondef(...) from the production
-- project, then store it with the deployment record. This migration does not
-- modify functions, RLS, grants, or inventory history.
--
-- The target set preserves the values introduced by migration 52 and restores
-- the legacy transfer values used by migration 49 and public.stock_balance.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stock_transactions'::regclass
      AND conname = 'stock_transactions_transaction_type_check'
  ) THEN
    RAISE EXCEPTION
      'Expected constraint public.stock_transactions_transaction_type_check was not found';
  END IF;

  -- Do not replace a constraint if existing history contains an unreviewed
  -- transaction type outside the explicit, backwards-compatible target set.
  IF EXISTS (
    SELECT 1
    FROM public.stock_transactions
    WHERE transaction_type NOT IN (
      'IN', 'OUT', 'ADJUST', 'RETURN', 'TRANSFER', 'CHECKOUT',
      'stock_in', 'stock_out', 'checkout_out', 'return_in',
      'transfer_in', 'transfer_out', 'adjustment'
    )
  ) THEN
    RAISE EXCEPTION
      'Unreviewed transaction_type values exist; inspect the production constraint and ledger before applying this migration';
  END IF;
END;
$$;

ALTER TABLE public.stock_transactions
  DROP CONSTRAINT stock_transactions_transaction_type_check;

ALTER TABLE public.stock_transactions
  ADD CONSTRAINT stock_transactions_transaction_type_check
  CHECK (
    transaction_type IN (
      'IN', 'OUT', 'ADJUST', 'RETURN', 'TRANSFER', 'CHECKOUT',
      'stock_in', 'stock_out', 'checkout_out', 'return_in',
      'transfer_in', 'transfer_out', 'adjustment'
    )
  ) NOT VALID;

ALTER TABLE public.stock_transactions
  VALIDATE CONSTRAINT stock_transactions_transaction_type_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stock_transactions'::regclass
      AND conname = 'stock_transactions_transaction_type_check'
      AND pg_get_constraintdef(oid, true) LIKE '%transfer_out%'
  ) THEN
    RAISE EXCEPTION
      'Migration validation failed: transfer_out is not allowed by the final constraint';
  END IF;
END;
$$;

COMMIT;
