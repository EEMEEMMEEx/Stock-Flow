-- ==============================================================================
-- Migration 57: Enhanced Admin Update User RPC & Synchronized RBAC Management
-- ==============================================================================

-- 1. Hardened admin_update_user RPC
DROP FUNCTION IF EXISTS public.admin_update_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[], TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.admin_update_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[], TEXT, BOOLEAN, UUID) CASCADE;

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
  v_old_status TEXT;
  v_effective_role_id UUID;
  v_pid UUID;
BEGIN
  v_calling_user_id := auth.uid();
  IF v_calling_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
  END IF;

  -- 1. Permission check: caller must have users.update or be admin
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = v_calling_user_id AND role = 'admin' AND status = 'active')
    OR public.has_permission(v_calling_user_id, 'users.update')
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission denied. Administrator or users.update permission required.');
  END IF;

  -- 2. Verify target user exists
  SELECT role, status INTO v_old_role, v_old_status
  FROM public.profiles
  WHERE id = p_target_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Target user profile does not exist.');
  END IF;

  -- 3. Security Protection: Prevent demoting or deactivating the last active Admin
  IF (LOWER(v_old_role) = 'admin' AND (LOWER(p_role) != 'admin' OR p_status != 'active')) THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM public.profiles
    WHERE LOWER(role) = 'admin' AND status = 'active';

    IF v_admin_count <= 1 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Security Protection: Cannot demote or deactivate the last remaining active Administrator account.');
    END IF;
  END IF;

  -- 4. Resolve effective role_id
  v_effective_role_id := p_role_id;
  IF v_effective_role_id IS NULL AND p_role IS NOT NULL THEN
    SELECT id INTO v_effective_role_id
    FROM public.roles
    WHERE UPPER(code) = UPPER(TRIM(p_role))
       OR (UPPER(TRIM(p_role)) IN ('STAFF', 'OPERATOR', 'REQUESTER') AND code = 'STAFF')
       OR (UPPER(TRIM(p_role)) IN ('SUPERVISOR', 'APPROVER', 'MANAGER') AND code = 'SUPERVISOR')
       OR (UPPER(TRIM(p_role)) IN ('ADMIN', 'ADMINISTRATOR') AND code = 'ADMIN')
    LIMIT 1;
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
    FOREACH v_pid IN ARRAY p_project_ids LOOP
      INSERT INTO public.user_project_assignments (user_id, project_id, created_by)
      VALUES (p_target_id, v_pid, v_calling_user_id)
      ON CONFLICT (user_id, project_id) DO NOTHING;
    END LOOP;
  END IF;

  -- 7. Audit log
  INSERT INTO public.audit_logs (actor_id, target_user_id, action, details)
  VALUES (
    v_calling_user_id,
    p_target_id,
    'USER_UPDATED',
    jsonb_build_object(
      'full_name', TRIM(p_full_name),
      'old_role', v_old_role,
      'new_role', p_role,
      'old_status', v_old_status,
      'new_status', p_status,
      'department', p_department,
      'all_projects', p_all_projects,
      'assigned_projects_count', COALESCE(ARRAY_LENGTH(p_project_ids, 1), 0),
      'must_change_password', p_must_change_password
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'User profile and permissions updated successfully.');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 2. Permissions
GRANT EXECUTE ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[], TEXT, BOOLEAN, UUID) TO authenticated, service_role;

-- 3. Reload schema cache
NOTIFY pgrst, 'reload schema';
