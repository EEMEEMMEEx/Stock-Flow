-- ==============================================================================
-- Migration 98: Remove Email Notification System & SMTP Infrastructure
-- ==============================================================================
-- Decommissions all email-specific tables, functions, secrets, and system settings
-- while strictly preserving in-app notifications (public.notifications) and auth data.

-- 1. Drop email-specific log tables
DROP TABLE IF EXISTS public.email_delivery_logs CASCADE;
DROP TABLE IF EXISTS public.email_dispatch_logs CASCADE;

-- 2. Drop email & SMTP RPC functions
DROP FUNCTION IF EXISTS public.admin_update_smtp_password(TEXT);
DROP FUNCTION IF EXISTS public.admin_get_smtp_password_internal();
DROP FUNCTION IF EXISTS public.get_user_emails(UUID[], TEXT[]);
DROP FUNCTION IF EXISTS public.admin_authorize_email_send();
DROP FUNCTION IF EXISTS public.admin_record_email_sent_audit(TEXT, TEXT, TEXT);

-- 3. Remove email secrets from shared system_secrets (retains default_reset_password)
DELETE FROM public.system_secrets 
WHERE key = 'smtp_password';

-- 4. Remove email configurations from shared system_settings (retains inventory rules & general settings)
DELETE FROM public.system_settings 
WHERE key IN ('smtp_config', 'notification_events', 'branding');
