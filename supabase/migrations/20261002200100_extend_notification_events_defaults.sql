-- Migration: seed notification_events defaults for checkout lifecycle events (7-13)
-- ---------------------------------------------------------------------------
-- CONTEXT
--   public.system_settings.notification_events only ships the original six
--   withdrawal/stock keys. EmailTemplateManager merges DEFAULT_EVENTS_CONFIG on
--   the client, so the UI already shows the new keys, but the dispatcher reads
--   notification_events straight from the database and would therefore fall back
--   to hardcoded roles for the checkout events.
--
-- WHAT THIS MIGRATION DOES
--   Merges the seven new event keys into the existing JSONB with the `||`
--   operator: keys that already exist WIN (left side), so an administrator's
--   saved enable/role customisation is never overwritten, and re-running this
--   migration is a no-op.
--
-- Deliberately NOT touched: enabled flags / roles / subjects of the six
-- pre-existing events, branding, and smtp_config.

BEGIN;

UPDATE public.system_settings
SET value = value || '{
  "checkout_submitted":   {"enabled": true, "roles": ["ADMIN", "SUPERVISOR"]},
  "checkout_approved":    {"enabled": true, "roles": ["STAFF", "ADMIN"]},
  "checkout_rejected":    {"enabled": true, "roles": ["STAFF"]},
  "checkout_handed_over": {"enabled": true, "roles": ["STAFF", "ADMIN"]},
  "checkout_due_soon":    {"enabled": true, "roles": ["STAFF"]},
  "checkout_overdue":     {"enabled": true, "roles": ["STAFF", "ADMIN", "SUPERVISOR"]},
  "checkout_returned":    {"enabled": true, "roles": ["STAFF", "ADMIN"]}
}'::jsonb,
    updated_at = NOW()
WHERE key = 'notification_events'
  AND value IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
