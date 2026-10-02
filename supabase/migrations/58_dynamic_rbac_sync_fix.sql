-- ==============================================================================
-- Migration 58: Dynamic RBAC Synchronization & Role Permissions Alignment
-- Description: Ensures has_permission() and get_user_permissions() dynamically
--              reflect role_permissions for all roles (ADMIN, SUPERVISOR, STAFF, custom),
--              matching the exact configuration in /roles.
-- ==============================================================================

-- 1. Update has_permission()
CREATE OR REPLACE FUNCTION public.has_permission(
  p_user_id UUID,
  p_perm_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_role_code TEXT;
  v_role_id UUID;
  v_email TEXT;
BEGIN
  IF p_user_id IS NULL OR p_perm_code IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Lookup user status, role code, and role_id from public.profiles
  SELECT p.status, 
         COALESCE(r.code, UPPER(p.role)), 
         COALESCE(p.role_id, r.id)
  INTO v_status, v_role_code, v_role_id
  FROM public.profiles p
  LEFT JOIN public.roles r ON (r.id = p.role_id OR r.code = UPPER(TRIM(p.role)))
  WHERE p.id = p_user_id;

  IF v_status IS NULL OR v_status != 'active' THEN
    RETURN FALSE;
  END IF;

  -- Lookup email safely from auth.users (public.profiles does not have email column)
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  -- Super Admin or master system admin bypass
  IF v_role_code = 'SUPER' OR LOWER(COALESCE(v_email, '')) = 'admin@stockflow.com' THEN
    RETURN TRUE;
  END IF;

  -- Check role_permissions table dynamically for all roles (including ADMIN, SUPERVISOR, STAFF)
  RETURN EXISTS (
    SELECT 1 
    FROM public.role_permissions rp
    JOIN public.permissions perm ON perm.id = rp.permission_id
    WHERE rp.role_id = v_role_id 
      AND perm.code = p_perm_code
  );
END;
$$;

-- 2. Update get_user_permissions()
CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (permission_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_role_code TEXT;
  v_role_id UUID;
  v_email TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Lookup user status, role code, and role_id from public.profiles
  SELECT p.status, 
         COALESCE(r.code, UPPER(p.role)), 
         COALESCE(p.role_id, r.id)
  INTO v_status, v_role_code, v_role_id
  FROM public.profiles p
  LEFT JOIN public.roles r ON (r.id = p.role_id OR r.code = UPPER(TRIM(p.role)))
  WHERE p.id = p_user_id;

  IF v_status IS NULL OR v_status != 'active' THEN
    RETURN;
  END IF;

  -- Lookup email safely from auth.users (public.profiles does not have email column)
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  -- Super Admin receives all catalog permissions
  IF v_role_code = 'SUPER' OR LOWER(COALESCE(v_email, '')) = 'admin@stockflow.com' THEN
    RETURN QUERY SELECT code FROM public.permissions ORDER BY code;
    RETURN;
  END IF;

  -- Regular, Admin, Supervisor, Staff and customized roles receive exactly what is configured in role_permissions
  RETURN QUERY
  SELECT DISTINCT perm.code
  FROM public.role_permissions rp
  JOIN public.permissions perm ON perm.id = rp.permission_id
  WHERE rp.role_id = v_role_id
  ORDER BY perm.code;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.has_permission(UUID, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID) TO authenticated, anon, service_role;
