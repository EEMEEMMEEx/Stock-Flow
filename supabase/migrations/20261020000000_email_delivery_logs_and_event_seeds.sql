-- Migration: email_delivery_logs and missing notification_events seed defaults
-- ---------------------------------------------------------------------------
-- 1. Creates public.email_delivery_logs for tracking email delivery status and history.
-- 2. Seeds defaults for stock_in_created (event 5), withdrawal_reverted (event 14),
--    and checkout_reverted (event 15) into public.system_settings.notification_events.

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  message_id TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_delivery_logs IS
  'Audit log for email notifications dispatched through the StockFlow mailer.';

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_created_at
  ON public.email_delivery_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_event_type
  ON public.email_delivery_logs (event_type);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_status
  ON public.email_delivery_logs (status);

ALTER TABLE public.email_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users with settings.view permission or super_admin to view email logs
DROP POLICY IF EXISTS "email_delivery_logs_select" ON public.email_delivery_logs;
CREATE POLICY "email_delivery_logs_select" ON public.email_delivery_logs
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'settings.view')
    OR public.is_super_admin(auth.uid())
  );

-- Service role has full access (used by /api/send-email serverless function)
DROP POLICY IF EXISTS "email_delivery_logs_service_role_all" ON public.email_delivery_logs;
CREATE POLICY "email_delivery_logs_service_role_all" ON public.email_delivery_logs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed missing notification_events keys into public.system_settings:
-- Defaults are prepended so existing customized keys in value win
UPDATE public.system_settings
SET value = '{
  "stock_in_created":    {"enabled": true, "roles": ["ADMIN", "SUPERVISOR"]},
  "withdrawal_reverted": {"enabled": true, "roles": ["ADMIN", "SUPER"]},
  "checkout_reverted":   {"enabled": true, "roles": ["ADMIN", "SUPER"]}
}'::jsonb || value,
    updated_at = NOW()
WHERE key = 'notification_events'
  AND value IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
