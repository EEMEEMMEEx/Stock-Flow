-- Keep SECURITY DEFINER name resolution deterministic when updating the SMTP secret.
CREATE OR REPLACE FUNCTION public.admin_update_smtp_password(p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_trimmed text;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'settings.update') THEN
    RAISE EXCEPTION 'Permission denied to update SMTP password.';
  END IF;

  v_trimmed := trim(coalesce(p_password, ''));
  IF v_trimmed = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'SMTP Password cannot be empty.');
  END IF;

  INSERT INTO public.system_secrets (key, secret_value, updated_at, updated_by)
  VALUES ('smtp_password', v_trimmed, now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
  SET secret_value = EXCLUDED.secret_value,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'SMTP_PASSWORD_UPDATED',
    jsonb_build_object('timestamp', now(), 'status', 'SUCCESS')
  );

  RETURN jsonb_build_object('success', true, 'message', 'SMTP Password updated successfully in vault.');
END;
$$;
