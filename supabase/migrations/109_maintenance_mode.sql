-- ==============================================================================
-- Migration 109: System Maintenance Mode (SUPER Only)
-- Description:
--   1. Seeds default maintenance_mode configuration in public.system_settings.
--   2. Adds public.get_maintenance_status() RPC accessible to anon & authenticated
--      returning ONLY maintenance status (enabled, message, estimated_end).
--   3. Hardens public.admin_update_system_settings() so only System Administrator
--      (public.is_super_admin) can modify the 'maintenance_mode' key.
-- ==============================================================================

INSERT INTO public.system_settings (key, value, category, description)
VALUES (
  'maintenance_mode',
  '{"enabled": false, "message": "", "estimated_end": ""}'::jsonb,
  'maintenance',
  'Global system maintenance mode configuration (SUPER only)'
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_maintenance_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_val JSONB;
BEGIN
  SELECT value INTO v_val
  FROM public.system_settings
  WHERE key = 'maintenance_mode';

  IF v_val IS NULL THEN
    RETURN jsonb_build_object(
      'enabled', false,
      'message', '',
      'estimated_end', ''
    );
  END IF;

  RETURN jsonb_build_object(
    'enabled', COALESCE((v_val->>'enabled')::boolean, false),
    'message', COALESCE(v_val->>'message', ''),
    'estimated_end', COALESCE(v_val->>'estimated_end', '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_maintenance_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_maintenance_status() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_update_system_settings(
  p_settings JSONB,
  p_category TEXT DEFAULT 'general'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_key TEXT;
  v_val JSONB;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'settings.update') THEN
    RAISE EXCEPTION 'Access Denied: Requires settings.update permission to save configuration changes.';
  END IF;

  IF p_settings ? 'maintenance_mode' AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: Only System Administrator (SUPER) can modify maintenance mode.';
  END IF;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_settings) LOOP
    INSERT INTO public.system_settings (key, value, category, updated_at, updated_by)
    VALUES (v_key, v_val, p_category, NOW(), auth.uid())
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      category = EXCLUDED.category,
      updated_at = NOW(),
      updated_by = auth.uid();
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'SYSTEM_SETTINGS_UPDATED',
    jsonb_build_object(
      'category', p_category,
      'keys_updated', (SELECT jsonb_agg(key) FROM jsonb_each(p_settings)),
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'System settings updated successfully.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_system_settings(JSONB, TEXT) TO authenticated, service_role;
