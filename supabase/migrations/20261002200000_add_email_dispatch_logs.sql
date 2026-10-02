-- Migration: email_dispatch_logs — anti-duplicate ledger for scheduled checkout emails
-- ---------------------------------------------------------------------------
-- CONTEXT
--   The daily cron (api/checkouts-cron.js) sends checkout_due_soon /
--   checkout_overdue reminders. Without a durable ledger, any retry, manual
--   invocation, or overlapping run would email the borrower again.
--
-- WHAT THIS MIGRATION DOES
--   1. Creates public.email_dispatch_logs with a UNIQUE claim key
--      (order_id, event_type, dispatched_date, recipient_email) so a concurrent
--      or repeated run cannot insert the same claim twice.
--   2. Enables RLS and grants NOTHING to anon/authenticated: only the
--      service_role (cron) may read or write this table.
--
-- NOTE
--   Rows are CLAIMED BEFORE SENDING. A failed send deletes its claim so the next
--   run may retry; a successful send keeps it, so the same (order, event, day,
--   recipient) never sends twice.

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_dispatch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.checkout_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  dispatched_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recipient_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_email_dispatch_daily UNIQUE (order_id, event_type, dispatched_date, recipient_email)
);

COMMENT ON TABLE public.email_dispatch_logs IS
  'Idempotency ledger for scheduled notification emails; claimed before send, deleted on send failure.';

CREATE INDEX IF NOT EXISTS idx_email_dispatch_logs_lookup
  ON public.email_dispatch_logs (order_id, event_type, dispatched_date);

ALTER TABLE public.email_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- Cron runs with the service role (bypasses RLS). No client-facing policy or
-- grant exists on purpose: the ledger must never be writable from the browser.
REVOKE ALL ON public.email_dispatch_logs FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
