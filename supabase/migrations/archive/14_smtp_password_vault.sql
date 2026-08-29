-- Migration 14: Secure SMTP Password Vault & Storage
-- Creates RPCs for storing and retrieving SMTP Password securely in system_secrets table without exposing passwords in system_settings

-- 1. RPC: Update SMTP Password in Vault
CREATE OR REPLACE FUNCTION public.admin_update_smtp_password(p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trimmed TEXT;
BEGIN
  -- Permission Check
  IF NOT public.has_permission(auth.uid(), 'settings.update') THEN
    RAISE EXCEPTION 'Permission denied to update SMTP password.';
  END IF;

  v_trimmed := TRIM(COALESCE(p_password, ''));

  IF v_trimmed = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'SMTP Password cannot be empty.');
  END IF;

  -- Upsert Secret
  INSERT INTO public.system_secrets (key, secret_value, updated_at, updated_by)
  VALUES ('smtp_password', v_trimmed, NOW(), auth.uid())
  ON CONFLICT (key) DO UPDATE
  SET secret_value = EXCLUDED.secret_value,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by;

  -- Audit Log
  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'SMTP_PASSWORD_UPDATED',
    jsonb_build_object('timestamp', NOW(), 'status', 'SUCCESS')
  );

  RETURN jsonb_build_object('success', true, 'message', 'SMTP Password updated successfully in vault.');
END;
$$;

-- 2. RPC: Internal Get SMTP Password (SECURITY DEFINER - restricted to admin/settings.view)
CREATE OR REPLACE FUNCTION public.admin_get_smtp_password_internal()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  SELECT secret_value INTO v_secret
  FROM public.system_secrets
  WHERE key = 'smtp_password';

  RETURN COALESCE(v_secret, '');
END;
$$;
