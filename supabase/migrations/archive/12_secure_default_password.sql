-- Migration 12: Secure Default Password Management & Vault
-- Creates private system_secrets table and RPCs for managing default reset password without exposing secrets to client

-- 1. Create Private System Secrets Table
CREATE TABLE IF NOT EXISTS public.system_secrets (
  key TEXT PRIMARY KEY,
  secret_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id)
);

-- Enable RLS (Strictly no client SELECT policy — accessible only via Security Definer RPCs)
ALTER TABLE public.system_secrets ENABLE ROW LEVEL SECURITY;

-- 2. RPC: Check Default Password Configuration Status (GET status only, NEVER returns secret)
CREATE OR REPLACE FUNCTION public.admin_get_default_password_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret_rec RECORD;
  v_result JSONB;
BEGIN
  -- Permission Check
  IF NOT (public.has_permission(auth.uid(), 'settings.view') OR public.has_permission(auth.uid(), 'users.manage')) THEN
    RAISE EXCEPTION 'Permission denied to view password configuration status.';
  END IF;

  SELECT updated_at INTO v_secret_rec
  FROM public.system_secrets
  WHERE key = 'default_reset_password';

  IF FOUND THEN
    v_result := jsonb_build_object(
      'configured', true,
      'updated_at', v_secret_rec.updated_at
    );
  ELSE
    v_result := jsonb_build_object(
      'configured', false,
      'updated_at', NULL
    );
  END IF;

  RETURN v_result;
END;
$$;

-- 3. RPC: Update Default Password (Server-side validation & audit logging)
CREATE OR REPLACE FUNCTION public.admin_update_default_password(p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trimmed TEXT;
BEGIN
  -- 1. Permission Check
  IF NOT public.has_permission(auth.uid(), 'settings.update') THEN
    RAISE EXCEPTION 'Permission denied to update default password configuration.';
  END IF;

  -- 2. Server-side Validation
  IF p_password IS NULL OR length(p_password) < 12 THEN
    RAISE EXCEPTION 'Invalid password: Minimum 12 characters required.';
  END IF;

  IF p_password != trim(p_password) THEN
    RAISE EXCEPTION 'Invalid password: Leading or trailing whitespace is not allowed.';
  END IF;

  IF NOT (p_password ~ '[A-Z]') THEN
    RAISE EXCEPTION 'Invalid password: Must contain at least one uppercase letter (A-Z).';
  END IF;

  IF NOT (p_password ~ '[a-z]') THEN
    RAISE EXCEPTION 'Invalid password: Must contain at least one lowercase letter (a-z).';
  END IF;

  IF NOT (p_password ~ '[0-9]') THEN
    RAISE EXCEPTION 'Invalid password: Must contain at least one digit (0-9).';
  END IF;

  IF NOT (p_password ~ '[!@#$%^&*()_+\-=\[\]{};'':"\\|,.<>\/?]') THEN
    RAISE EXCEPTION 'Invalid password: Must contain at least one special character.';
  END IF;

  -- 3. Upsert Secret into Vault
  INSERT INTO public.system_secrets (key, secret_value, updated_at, updated_by)
  VALUES ('default_reset_password', p_password, NOW(), auth.uid())
  ON CONFLICT (key) DO UPDATE
  SET secret_value = EXCLUDED.secret_value,
      updated_at = NOW(),
      updated_by = EXCLUDED.updated_by;

  -- 4. Record Audit Log (NO SECRETS OR PASSWORDS LOGGED)
  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'DEFAULT_PASSWORD_UPDATED',
    jsonb_build_object(
      'success', true,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'configured', true,
    'updated_at', NOW()
  );
END;
$$;

-- 4. RPC: Resolve Default Password for Reset Action (Callable only by users with users.manage permission during Reset Pass)
CREATE OR REPLACE FUNCTION public.admin_get_default_password_for_reset()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'users.manage') THEN
    RAISE EXCEPTION 'Permission denied to access reset password configuration.';
  END IF;

  SELECT secret_value INTO v_secret
  FROM public.system_secrets
  WHERE key = 'default_reset_password';

  RETURN v_secret;
END;
$$;

-- Grant execution permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.admin_get_default_password_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_default_password(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_default_password_for_reset() TO authenticated;
