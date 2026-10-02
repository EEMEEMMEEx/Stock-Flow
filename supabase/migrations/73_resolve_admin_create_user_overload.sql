-- Migration 73: Resolve admin_create_user Function Overload Conflict (PGRST203)
-- Removes duplicate/overloaded admin_create_user functions and standardizes on a single canonical signature

BEGIN;

-- 1. Safely drop all existing variants of admin_create_user to eliminate overloads
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT oid::regprocedure AS func_signature
    FROM pg_proc
    WHERE proname = 'admin_create_user'
      AND pronamespace = 'public'::regnamespace
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE;';
  END LOOP;
END $$;

-- Explicit drops for backwards-compatible DDL runners
DROP FUNCTION IF EXISTS public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[]) CASCADE;
DROP FUNCTION IF EXISTS public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[], TEXT, UUID) CASCADE;

-- 2. Create single canonical function supporting all required parameters
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT DEFAULT NULL,
  p_full_name TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'staff',
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
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_calling_user_id UUID;
  v_new_user_id UUID;
  v_effective_role_id UUID;
  v_new_role_code TEXT;
  v_is_caller_super BOOLEAN := FALSE;
  v_effective_password TEXT;
  v_encrypted_pw TEXT;
  v_calling_role TEXT;
BEGIN
  -- A. Authentication & Permission Verification
  v_calling_user_id := auth.uid();
  IF v_calling_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
  END IF;

  -- Check Super Admin status
  v_is_caller_super := public.is_super_admin(v_calling_user_id);

  -- Caller must be Super Admin, have users.create permission, or have admin role in profiles
  IF NOT (
    v_is_caller_super OR 
    public.has_permission(v_calling_user_id, 'users.create') OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = v_calling_user_id AND LOWER(role) IN ('admin', 'super_admin', 'super'))
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission denied. users.create permission required.');
  END IF;

  -- B. Input Validation
  IF p_email IS NULL OR TRIM(p_email) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Email is required.');
  END IF;

  IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Full name is required.');
  END IF;

  -- C. Resolve effective role_id and normalized code
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

  -- Fallback if no matching role found
  IF v_new_role_code IS NULL THEN
    v_new_role_code := COALESCE(NULLIF(LOWER(TRIM(p_role)), ''), 'staff');
  END IF;

  -- Security Hierarchy Protection: Only Super Admin can create Super Admin accounts
  IF (UPPER(COALESCE(p_role, '')) IN ('SUPER', 'SUPERADMIN') OR v_new_role_code = 'SUPER') AND NOT v_is_caller_super THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission Denied: Only Super Admin can create Super Admin accounts.');
  END IF;

  -- D. Check for existing email in auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_email))) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Email address is already in use.');
  END IF;

  -- E. Determine Effective Password
  IF p_password IS NOT NULL AND TRIM(p_password) != '' THEN
    v_effective_password := TRIM(p_password);
  ELSE
    SELECT secret_value INTO v_effective_password
    FROM public.system_secrets
    WHERE key = 'default_reset_password';

    IF v_effective_password IS NULL OR TRIM(v_effective_password) = '' THEN
      v_effective_password := 'F0rth2026@dtrs';
    END IF;
  END IF;

  v_new_user_id := gen_random_uuid();
  v_encrypted_pw := extensions.crypt(v_effective_password, extensions.gen_salt('bf'));

  -- F. Insert into auth.users (With explicit GoTrue tokens and metadata)
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    reauthentication_token,
    email_change,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    is_sso_user,
    is_anonymous,
    is_super_admin,
    created_at,
    updated_at
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000',
    LOWER(TRIM(p_email)),
    v_encrypted_pw,
    NOW(),
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', TRIM(p_full_name), 'role', LOWER(v_new_role_code)),
    'authenticated',
    'authenticated',
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

  -- G. Insert into auth.identities (Required for GoTrue Email Auth)
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_new_user_id,
    v_new_user_id,
    jsonb_build_object('sub', v_new_user_id::text, 'email', LOWER(TRIM(p_email))),
    'email',
    v_new_user_id::text,
    NOW(),
    NOW(),
    NOW()
  ) ON CONFLICT (provider, provider_id) DO NOTHING;

  -- H. Create or Update Profile
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
    LOWER(TRIM(v_new_role_code)),
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

  -- I. Project Assignments
  IF NOT COALESCE(p_all_projects, TRUE) AND p_project_ids IS NOT NULL AND ARRAY_LENGTH(p_project_ids, 1) > 0 THEN
    INSERT INTO public.user_project_assignments (user_id, project_id)
    SELECT v_new_user_id, UNNEST(p_project_ids);
  END IF;

  -- J. Record Audit Log
  INSERT INTO public.audit_logs (actor_id, target_user_id, action, details)
  VALUES (
    v_calling_user_id,
    v_new_user_id,
    'USER_CREATED',
    jsonb_build_object(
      'email', LOWER(TRIM(p_email)),
      'full_name', TRIM(p_full_name),
      'role', v_new_role_code,
      'role_id', v_effective_role_id,
      'all_projects', COALESCE(p_all_projects, TRUE),
      'project_ids', p_project_ids,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true, 
    'user_id', v_new_user_id, 
    'message', 'User created successfully.'
  );
END;
$$;

-- 3. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[], TEXT, UUID) TO authenticated, service_role;

COMMIT;

-- 4. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
