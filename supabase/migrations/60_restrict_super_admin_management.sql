-- Migration 60: Restrict SUPER ADMIN Management & Enforce Strict RBAC Hierarchy
-- Target: Only SUPER ADMIN can edit, delete, assign, or modify permissions for SUPER role/users

BEGIN;

-- Helper Function: Check if caller is Super Admin
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_role_code TEXT;
  v_email TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT COALESCE(r.code, UPPER(p.role))
  INTO v_role_code
  FROM public.profiles p
  LEFT JOIN public.roles r ON (r.id = p.role_id OR r.code = UPPER(TRIM(p.role)))
  WHERE p.id = p_user_id AND p.status = 'active';

  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  RETURN (v_role_code = 'SUPER' OR LOWER(COALESCE(v_email, '')) = 'admin@stockflow.com');
END;
$$;

-- 1. Hardened admin_save_role_permissions
CREATE OR REPLACE FUNCTION public.admin_save_role_permissions(
  p_role_id UUID,
  p_permission_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_pid UUID;
  v_role_code TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT (public.is_super_admin(v_caller_id) OR public.has_permission(v_caller_id, 'roles.manage_permissions')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.manage_permissions permission.';
  END IF;

  SELECT code INTO v_role_code FROM public.roles WHERE id = p_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not Found: Target role does not exist.';
  END IF;

  -- Security Hierarchy Restriction: Only Super Admin can modify SUPER role permissions
  IF v_role_code = 'SUPER' AND NOT public.is_super_admin(v_caller_id) THEN
    RAISE EXCEPTION 'Permission Denied: Only Super Admin can modify SUPER role permissions.';
  END IF;

  -- Delete existing permissions for role
  DELETE FROM public.role_permissions WHERE role_id = p_role_id;

  -- Re-insert selected permissions
  IF p_permission_ids IS NOT NULL AND ARRAY_LENGTH(p_permission_ids, 1) > 0 THEN
    FOREACH v_pid IN ARRAY p_permission_ids LOOP
      INSERT INTO public.role_permissions (role_id, permission_id)
      VALUES (p_role_id, v_pid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Audit log
  BEGIN
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
      INSERT INTO public.audit_logs (actor_id, action, details)
      VALUES (
        v_caller_id,
        'ROLE_PERMISSION_CHANGED',
        jsonb_build_object(
          'role_id', p_role_id,
          'role_code', v_role_code,
          'permissions_count', COALESCE(ARRAY_LENGTH(p_permission_ids, 1), 0)
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN END;

  RETURN jsonb_build_object('success', true, 'message', 'Role permissions updated successfully.');
END;
$$;

-- 2. Hardened admin_update_role
CREATE OR REPLACE FUNCTION public.admin_update_role(
  p_role_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_badge_background TEXT,
  p_badge_text_color TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_role_code TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT (public.is_super_admin(v_caller_id) OR public.has_permission(v_caller_id, 'roles.update')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.update permission.';
  END IF;

  SELECT code INTO v_role_code FROM public.roles WHERE id = p_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not Found: Target role does not exist.';
  END IF;

  -- Security Hierarchy Restriction: Only Super Admin can modify SUPER role metadata
  IF v_role_code = 'SUPER' AND NOT public.is_super_admin(v_caller_id) THEN
    RAISE EXCEPTION 'Permission Denied: Only Super Admin can edit Super Admin role.';
  END IF;

  UPDATE public.roles
  SET 
    name = TRIM(p_name),
    description = TRIM(p_description),
    badge_background = p_badge_background,
    badge_text_color = p_badge_text_color,
    updated_at = NOW()
  WHERE id = p_role_id;

  RETURN jsonb_build_object('success', true, 'message', 'Role updated successfully.');
END;
$$;

-- 3. Hardened admin_delete_role
CREATE OR REPLACE FUNCTION public.admin_delete_role(
  p_role_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_role_code TEXT;
  v_is_system BOOLEAN;
  v_user_count INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT (public.is_super_admin(v_caller_id) OR public.has_permission(v_caller_id, 'roles.delete')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.delete permission.';
  END IF;

  SELECT code, is_system INTO v_role_code, v_is_system FROM public.roles WHERE id = p_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not Found: Target role does not exist.';
  END IF;

  IF v_is_system OR v_role_code IN ('SUPER', 'ADMIN', 'SUPERVISOR', 'STAFF') THEN
    RAISE EXCEPTION 'Permission Denied: System roles cannot be deleted.';
  END IF;

  SELECT COUNT(*) INTO v_user_count FROM public.profiles WHERE role_id = p_role_id;
  IF v_user_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete role assigned to active users.';
  END IF;

  DELETE FROM public.role_permissions WHERE role_id = p_role_id;
  DELETE FROM public.roles WHERE id = p_role_id;

  RETURN jsonb_build_object('success', true, 'message', 'Role deleted successfully.');
END;
$$;

-- 4. Hardened admin_update_user RPC with Super Admin Hierarchy Protection
CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_target_id UUID,
  p_full_name TEXT,
  p_role TEXT,
  p_status TEXT,
  p_phone TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_position TEXT DEFAULT NULL,
  p_all_projects BOOLEAN DEFAULT TRUE,
  p_project_ids UUID[] DEFAULT ARRAY[]::UUID[],
  p_avatar_url TEXT DEFAULT NULL,
  p_must_change_password BOOLEAN DEFAULT FALSE,
  p_role_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_calling_user_id UUID;
  v_admin_count INTEGER;
  v_old_role TEXT;
  v_old_role_id UUID;
  v_old_status TEXT;
  v_old_email TEXT;
  v_effective_role_id UUID;
  v_new_role_code TEXT;
  v_is_caller_super BOOLEAN;
  v_is_target_super BOOLEAN;
BEGIN
  v_calling_user_id := auth.uid();
  IF v_calling_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
  END IF;

  v_is_caller_super := public.is_super_admin(v_calling_user_id);

  -- 1. Permission check: caller must have users.update or be admin
  IF NOT (v_is_caller_super OR public.has_permission(v_calling_user_id, 'users.update')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission denied. users.update permission required.');
  END IF;

  -- 2. Verify target user exists
  SELECT role, role_id, status INTO v_old_role, v_old_role_id, v_old_status
  FROM public.profiles
  WHERE id = p_target_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Target user profile does not exist.');
  END IF;

  BEGIN
    SELECT email INTO v_old_email FROM auth.users WHERE id = p_target_id;
  EXCEPTION WHEN OTHERS THEN
    v_old_email := NULL;
  END;

  v_is_target_super := (UPPER(v_old_role) IN ('SUPER', 'SUPERADMIN', 'SUPER_ADMIN') OR LOWER(COALESCE(v_old_email, '')) = 'admin@stockflow.com');
  IF NOT v_is_target_super AND v_old_role_id IS NOT NULL THEN
    SELECT (code = 'SUPER') INTO v_is_target_super FROM public.roles WHERE id = v_old_role_id;
  END IF;

  -- Security Hierarchy Protection: Only Super Admin can modify a Super Admin user
  IF v_is_target_super AND NOT v_is_caller_super THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission Denied: Only Super Admin can manage or modify Super Admin accounts.');
  END IF;

  -- 3. Resolve effective role_id
  v_effective_role_id := p_role_id;
  IF v_effective_role_id IS NULL AND p_role IS NOT NULL THEN
    SELECT id, code INTO v_effective_role_id, v_new_role_code
    FROM public.roles
    WHERE UPPER(code) = UPPER(TRIM(p_role))
       OR (UPPER(TRIM(p_role)) IN ('STAFF', 'OPERATOR', 'REQUESTER') AND code = 'STAFF')
       OR (UPPER(TRIM(p_role)) IN ('SUPERVISOR', 'APPROVER', 'MANAGER') AND code = 'SUPERVISOR')
       OR (UPPER(TRIM(p_role)) IN ('ADMIN', 'ADMINISTRATOR') AND code = 'ADMIN')
       OR (UPPER(TRIM(p_role)) IN ('SUPER', 'SUPERADMIN') AND code = 'SUPER')
    LIMIT 1;
  ELSEIF v_effective_role_id IS NOT NULL THEN
    SELECT code INTO v_new_role_code FROM public.roles WHERE id = v_effective_role_id;
  END IF;

  -- Security Hierarchy Protection: Only Super Admin can grant/assign the SUPER role to any user
  IF (UPPER(p_role) IN ('SUPER', 'SUPERADMIN') OR v_new_role_code = 'SUPER') AND NOT v_is_caller_super THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission Denied: Only Super Admin can assign the Super Admin role.');
  END IF;

  -- 4. Security Protection: Prevent demoting or deactivating the last active Admin
  IF (LOWER(v_old_role) = 'admin' AND (LOWER(p_role) != 'admin' OR p_status != 'active')) THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM public.profiles
    WHERE LOWER(role) = 'admin' AND status = 'active';

    IF v_admin_count <= 1 AND NOT v_is_caller_super THEN
      RETURN jsonb_build_object('success', false, 'message', 'Security Protection: Cannot demote or deactivate the last remaining active Administrator account.');
    END IF;
  END IF;

  -- 5. Update profiles table
  UPDATE public.profiles
  SET 
    full_name = TRIM(p_full_name),
    role = LOWER(TRIM(p_role)),
    role_id = v_effective_role_id,
    status = p_status,
    phone = NULLIF(TRIM(p_phone), ''),
    department = NULLIF(TRIM(p_department), ''),
    "position" = NULLIF(TRIM(p_position), ''),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    must_change_password = COALESCE(p_must_change_password, FALSE),
    all_projects = COALESCE(p_all_projects, TRUE),
    updated_at = NOW()
  WHERE id = p_target_id;

  -- 6. Synchronize project assignments
  DELETE FROM public.user_project_assignments WHERE user_id = p_target_id;

  IF NOT COALESCE(p_all_projects, TRUE) AND p_project_ids IS NOT NULL AND ARRAY_LENGTH(p_project_ids, 1) > 0 THEN
    INSERT INTO public.user_project_assignments (user_id, project_id)
    SELECT p_target_id, UNNEST(p_project_ids);
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'User updated successfully.');
END;
$$;

-- 5. Hardened admin_create_user with Super Admin check
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_phone TEXT DEFAULT NULL,
  p_position TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_all_projects BOOLEAN DEFAULT TRUE,
  p_project_ids UUID[] DEFAULT ARRAY[]::UUID[],
  p_avatar_url TEXT DEFAULT NULL,
  p_role_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_calling_user_id UUID;
  v_new_user_id UUID;
  v_effective_role_id UUID;
  v_new_role_code TEXT;
  v_is_caller_super BOOLEAN;
BEGIN
  v_calling_user_id := auth.uid();
  IF v_calling_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
  END IF;

  v_is_caller_super := public.is_super_admin(v_calling_user_id);

  IF NOT (v_is_caller_super OR public.has_permission(v_calling_user_id, 'users.create')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission denied. users.create permission required.');
  END IF;

  -- Resolve effective role_id
  v_effective_role_id := p_role_id;
  IF v_effective_role_id IS NULL AND p_role IS NOT NULL THEN
    SELECT id, code INTO v_effective_role_id, v_new_role_code
    FROM public.roles
    WHERE UPPER(code) = UPPER(TRIM(p_role))
       OR (UPPER(TRIM(p_role)) IN ('STAFF', 'OPERATOR', 'REQUESTER') AND code = 'STAFF')
       OR (UPPER(TRIM(p_role)) IN ('SUPERVISOR', 'APPROVER', 'MANAGER') AND code = 'SUPERVISOR')
       OR (UPPER(TRIM(p_role)) IN ('ADMIN', 'ADMINISTRATOR') AND code = 'ADMIN')
       OR (UPPER(TRIM(p_role)) IN ('SUPER', 'SUPERADMIN') AND code = 'SUPER')
    LIMIT 1;
  ELSEIF v_effective_role_id IS NOT NULL THEN
    SELECT code INTO v_new_role_code FROM public.roles WHERE id = v_effective_role_id;
  END IF;

  -- Security Hierarchy Protection: Only Super Admin can create Super Admin accounts
  IF (UPPER(p_role) IN ('SUPER', 'SUPERADMIN') OR v_new_role_code = 'SUPER') AND NOT v_is_caller_super THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission Denied: Only Super Admin can create Super Admin accounts.');
  END IF;

  -- Create Auth User
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    LOWER(TRIM(p_email)),
    crypt(p_password, gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', TRIM(p_full_name)),
    FALSE
  )
  RETURNING id INTO v_new_user_id;

  -- Create or Update Profile
  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    role_id,
    status,
    phone,
    department,
    "position",
    avatar_url,
    all_projects,
    created_at,
    updated_at
  )
  VALUES (
    v_new_user_id,
    TRIM(p_full_name),
    LOWER(TRIM(p_role)),
    v_effective_role_id,
    'active',
    NULLIF(TRIM(p_phone), ''),
    NULLIF(TRIM(p_department), ''),
    NULLIF(TRIM(p_position), ''),
    p_avatar_url,
    COALESCE(p_all_projects, TRUE),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    role_id = EXCLUDED.role_id,
    status = EXCLUDED.status,
    phone = EXCLUDED.phone,
    department = EXCLUDED.department,
    "position" = EXCLUDED."position",
    avatar_url = EXCLUDED.avatar_url,
    all_projects = EXCLUDED.all_projects,
    updated_at = NOW();

  -- Project assignments
  IF NOT COALESCE(p_all_projects, TRUE) AND p_project_ids IS NOT NULL AND ARRAY_LENGTH(p_project_ids, 1) > 0 THEN
    INSERT INTO public.user_project_assignments (user_id, project_id)
    SELECT v_new_user_id, UNNEST(p_project_ids);
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', v_new_user_id, 'message', 'User created successfully.');
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_role_permissions(UUID, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_role(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_role(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[], TEXT, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[], TEXT, UUID) TO authenticated, service_role;

COMMIT;
