-- Migration 39: Fix GoTrue 500 error on /recover (Scan error on column confirmation_token: converting NULL to string is unsupported)
-- Root Cause: When admin_create_user or raw SQL inserts users into auth.users without confirmation_token, 
--   Postgres leaves confirmation_token as NULL. Go's database/sql driver in Supabase GoTrue cannot scan NULL 
--   into a Go string variable during POST /auth/v1/recover, causing HTTP 500 (unexpected_failure).
-- Fix:
--   1. Update all existing auth.users rows to set NULL token columns to empty string ''
--   2. Set DEFAULT '' on token columns if allowed
--   3. Update admin_create_user RPC to explicitly populate non-null empty strings for all token columns

-- 1. Fix existing NULL tokens in auth.users
UPDATE auth.users
SET confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    reauthentication_token = COALESCE(reauthentication_token, ''),
    email_change = COALESCE(email_change, '');

-- 2. Update admin_create_user RPC
DROP FUNCTION IF EXISTS public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[]);
DROP FUNCTION IF EXISTS public.admin_create_user;

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

  IF p_role IS NULL OR LOWER(TRIM(p_role)) NOT IN ('admin', 'supervisor', 'operator') THEN
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
    '', -- Empty string confirmation_token (Prevents GoTrue Go Scan NULL to string error)
    '', -- Empty string recovery_token
    '', -- Empty string email_change_token_new
    '', -- Empty string reauthentication_token
    '', -- Empty string email_change
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', TRIM(p_full_name), 'role', LOWER(p_role)),
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
    email,
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
    LOWER(TRIM(p_email)),
    TRIM(p_full_name),
    LOWER(TRIM(p_role)),
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
    email = EXCLUDED.email,
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
      INSERT INTO public.user_projects (user_id, project_id)
      VALUES (v_new_id, v_proj_id)
      ON CONFLICT (user_id, project_id) DO NOTHING;
    END LOOP;
  END IF;

  -- I. Log in audit_logs
  INSERT INTO public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    v_calling_user_id,
    'USER_CREATED',
    'profiles',
    v_new_id,
    jsonb_build_object(
      'email', LOWER(TRIM(p_email)),
      'role', LOWER(TRIM(p_role)),
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

GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[]) TO authenticated;
