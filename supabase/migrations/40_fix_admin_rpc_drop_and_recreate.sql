-- Migration 40: Drop and Recreate Admin RPCs (Add missing profiles columns & Role Validation)
-- Purpose:
--   1. Ensure department, phone, position, and all_projects columns exist on public.profiles
--   2. Recreate admin_get_users returning user details and email from auth.users without SQLSTATE 42803
--   3. Recreate admin_create_user supporting admin, supervisor, operator, and staff roles safely
--   4. Grant EXECUTE permissions to public, authenticated, anon, service_role and reload PostgREST schema cache

-- 0. Ensure missing profile columns exist on public.profiles and fix role check constraint
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "position" TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS all_projects BOOLEAN DEFAULT TRUE;

-- Fix profiles_role_check constraint to allow any non-empty valid role (e.g. operator, supervisor, admin, staff, RBAC roles)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IS NOT NULL AND length(trim(role)) > 0);


-- 1. Drop existing functions with CASCADE to prevent signature conflict 42P13
DROP FUNCTION IF EXISTS public.admin_get_users() CASCADE;
DROP FUNCTION IF EXISTS public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[]) CASCADE;
DROP FUNCTION IF EXISTS public.admin_create_user CASCADE;

-- 2. Recreate admin_get_users
CREATE OR REPLACE FUNCTION public.admin_get_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  status TEXT,
  phone TEXT,
  "position" TEXT,
  avatar_url TEXT,
  must_change_password BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  assigned_project_ids UUID[],
  all_projects BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    COALESCE(u.email::TEXT, '') AS email,
    COALESCE(p.full_name, 'User') AS full_name,
    COALESCE(p.role, 'operator') AS role,
    COALESCE(p.status, 'active') AS status,
    p.phone,
    p."position",
    p.avatar_url,
    COALESCE(p.must_change_password, FALSE) AS must_change_password,
    p.created_at,
    p.updated_at,
    COALESCE(ARRAY_AGG(upa.project_id) FILTER (WHERE upa.project_id IS NOT NULL), ARRAY[]::UUID[]) AS assigned_project_ids,
    COALESCE(p.all_projects, p.role = 'admin', TRUE) AS all_projects
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_project_assignments upa ON upa.user_id = p.id
  GROUP BY p.id, u.email, p.full_name, p.role, p.status, p.phone, p."position", p.avatar_url, p.must_change_password, p.created_at, p.updated_at, p.all_projects
  ORDER BY p.created_at DESC;
END;
$$;

-- 3. Recreate admin_create_user
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_phone TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_position TEXT DEFAULT NULL,
  p_password TEXT DEFAULT NULL,
  p_all_projects BOOLEAN DEFAULT TRUE,
  p_project_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_calling_user_id UUID;
  v_calling_role TEXT;
  v_new_id UUID;
  v_effective_pw TEXT;
  v_encrypted_pw TEXT;
  v_proj_id UUID;
  v_role_clean TEXT;
BEGIN
  -- A. Authentication & Permission Checks
  v_calling_user_id := auth.uid();
  IF v_calling_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
  END IF;

  SELECT LOWER(role) INTO v_calling_role
  FROM public.profiles
  WHERE id = v_calling_user_id;

  IF v_calling_role IS NULL OR v_calling_role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission denied. Admin role required.');
  END IF;

  -- B. Input Validation
  IF p_email IS NULL OR TRIM(p_email) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Email is required.');
  END IF;

  IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Full name is required.');
  END IF;

  v_role_clean := LOWER(TRIM(COALESCE(p_role, 'operator')));
  IF v_role_clean = 'staff' THEN
    v_role_clean := 'operator';
  END IF;

  IF v_role_clean NOT IN ('admin', 'supervisor', 'operator', 'staff') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid role. Must be admin, supervisor, or operator.');
  END IF;

  -- C. Check for existing email in auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_email))) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Email address is already in use.');
  END IF;

  -- D. Determine Effective Password
  IF p_password IS NOT NULL AND TRIM(p_password) != '' THEN
    v_effective_pw := TRIM(p_password);
  ELSE
    v_effective_pw := 'Password123!';
  END IF;

  v_new_id := gen_random_uuid();
  v_encrypted_pw := extensions.crypt(v_effective_pw, extensions.gen_salt('bf'));

  -- E. Insert into auth.users (With explicit non-null tokens and booleans for GoTrue)
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
    created_at,
    updated_at
  ) VALUES (
    v_new_id,
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
    jsonb_build_object('full_name', TRIM(p_full_name), 'role', v_role_clean),
    'authenticated',
    'authenticated',
    false,
    false,
    NOW(),
    NOW()
  );

  -- F. Insert into auth.identities
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
    v_new_id,
    v_new_id,
    jsonb_build_object('sub', v_new_id::text, 'email', LOWER(TRIM(p_email))),
    'email',
    v_new_id::text,
    NOW(),
    NOW(),
    NOW()
  );

  -- G. Upsert into public.profiles
  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    phone,
    department,
    position,
    status,
    all_projects,
    must_change_password,
    created_at,
    updated_at
  ) VALUES (
    v_new_id,
    TRIM(p_full_name),
    v_role_clean,
    p_phone,
    p_department,
    p_position,
    'active',
    COALESCE(p_all_projects, TRUE),
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    phone = EXCLUDED.phone,
    department = EXCLUDED.department,
    position = EXCLUDED.position,
    status = EXCLUDED.status,
    all_projects = EXCLUDED.all_projects,
    must_change_password = EXCLUDED.must_change_password,
    updated_at = NOW();

  -- H. Insert User Project Access if not all_projects
  IF NOT COALESCE(p_all_projects, TRUE) AND p_project_ids IS NOT NULL AND array_length(p_project_ids, 1) > 0 THEN
    FOREACH v_proj_id IN ARRAY p_project_ids LOOP
      INSERT INTO public.user_project_assignments (user_id, project_id, created_by)
      VALUES (v_new_id, v_proj_id, v_calling_user_id)
      ON CONFLICT (user_id, project_id) DO NOTHING;
    END LOOP;
  END IF;

  -- I. Log in audit_logs
  INSERT INTO public.audit_logs (
    actor_id,
    target_user_id,
    action,
    details
  ) VALUES (
    v_calling_user_id,
    v_new_id,
    'USER_CREATED',
    jsonb_build_object(
      'email', LOWER(TRIM(p_email)),
      'role', v_role_clean,
      'full_name', TRIM(p_full_name),
      'all_projects', COALESCE(p_all_projects, TRUE)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_new_id,
    'message', 'User created successfully.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', SQLERRM
  );
END;
$$;

-- 4. ให้สิทธิ์การเรียกใช้งาน
GRANT EXECUTE ON FUNCTION public.admin_get_users() TO public, authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[]) TO public, authenticated, anon, service_role;

-- 5. บังคับรีโหลด PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
