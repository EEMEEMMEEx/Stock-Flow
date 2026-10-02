-- Migration 38: Fix admin_create_user profiles_pkey unique constraint & email column reference
-- Root Cause 1: When admin_create_user inserts a new user into auth.users, the AFTER INSERT trigger `on_auth_user_created` (public.handle_new_user)
--   immediately fires and inserts a profile record with `id = v_new_id`. When admin_create_user subsequently attempted a plain `INSERT INTO public.profiles`,
--   PostgreSQL threw `duplicate key value violates unique constraint "profiles_pkey"` (HTTP 409).
-- Root Cause 2: `public.profiles` does NOT contain an `email` column. Canonical user emails are stored exclusively in `auth.users.email`.
--   Querying `public.profiles.email` threw `ERROR: column "email" does not exist` (HTTP 400).
-- Fix: Update admin_create_user to:
--   1. Check duplicate email exclusively against `auth.users.email`.
--   2. Use `ON CONFLICT (id) DO UPDATE` for public.profiles, making profile creation atomic, idempotent, and trigger-safe.

-- 1. Ensure handle_new_user trigger function uses ON CONFLICT (id) DO UPDATE
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    full_name, 
    role, 
    status, 
    must_change_password,
    created_at,
    updated_at
  ) VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'User'), 
    LOWER(COALESCE(new.raw_user_meta_data->>'role', 'staff')),
    'active',
    FALSE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      updated_at = NOW();

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user trigger warning: %', SQLERRM;
  RETURN new;
END;
$$;

-- 2. Update admin_create_user RPC
DROP FUNCTION IF EXISTS public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[]);
DROP FUNCTION IF EXISTS public.admin_create_user;

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT DEFAULT NULL,
  p_full_name TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'staff',
  p_status TEXT DEFAULT 'active',
  p_phone TEXT DEFAULT NULL,
  p_position TEXT DEFAULT NULL,
  p_all_projects BOOLEAN DEFAULT TRUE,
  p_project_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_new_id UUID := gen_random_uuid();
  v_effective_pw TEXT;
  v_encrypted_pw TEXT;
  v_pid UUID;
BEGIN
  -- A. Authorization check
  IF NOT public.is_active_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only active admins can create users.';
  END IF;

  -- B. Input validation
  IF p_email IS NULL OR TRIM(p_email) = '' THEN
    RAISE EXCEPTION 'Invalid Input: Email is required.';
  END IF;

  IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN
    RAISE EXCEPTION 'Invalid Input: Full name is required.';
  END IF;

  IF LOWER(p_role) NOT IN ('admin', 'staff', 'supervisor') THEN
    RAISE EXCEPTION 'Invalid Input: Role must be admin, supervisor, or staff.';
  END IF;

  IF p_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'Invalid Input: Status must be active or inactive.';
  END IF;

  -- C. Check for existing email in auth.users (Canonical email store)
  IF EXISTS (
    SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_email))
  ) THEN
    RAISE EXCEPTION 'Duplicate Error: Email address % is already registered.', TRIM(p_email);
  END IF;

  -- D. Resolve password: If not provided, fetch configured Default Reset Password from Vault
  IF p_password IS NOT NULL AND CHAR_LENGTH(TRIM(p_password)) >= 6 THEN
    v_effective_pw := TRIM(p_password);
  ELSE
    SELECT secret_value INTO v_effective_pw
    FROM public.system_secrets
    WHERE key = 'default_reset_password';

    IF v_effective_pw IS NULL OR CHAR_LENGTH(TRIM(v_effective_pw)) < 6 THEN
      v_effective_pw := 'StockFlow@2026!';
    END IF;
  END IF;

  -- E. Encrypt password
  v_encrypted_pw := extensions.crypt(v_effective_pw, extensions.gen_salt('bf'));

  -- F. Insert into auth.users (With explicit non-null booleans for GoTrue)
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
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
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', TRIM(p_full_name), 'role', LOWER(p_role)),
    'authenticated',
    'authenticated',
    false,
    false,
    NOW(),
    NOW()
  );

  -- G. Insert into auth.identities
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
  )
  ON CONFLICT DO NOTHING;

  -- H. Insert or Update Profile record (UPSERT to avoid profiles_pkey unique constraint error)
  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    status,
    phone,
    "position",
    must_change_password,
    created_at,
    updated_at
  ) VALUES (
    v_new_id,
    TRIM(p_full_name),
    LOWER(p_role),
    p_status,
    TRIM(p_phone),
    TRIM(p_position),
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      status = EXCLUDED.status,
      phone = EXCLUDED.phone,
      "position" = EXCLUDED."position",
      must_change_password = EXCLUDED.must_change_password,
      updated_at = NOW();

  -- I. Assign projects if restricted
  IF NOT p_all_projects AND array_length(p_project_ids, 1) > 0 THEN
    FOREACH v_pid IN ARRAY p_project_ids LOOP
      INSERT INTO public.user_project_assignments (user_id, project_id, created_by)
      VALUES (v_new_id, v_pid, auth.uid())
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- J. Record Audit Log
  INSERT INTO public.audit_logs (actor_id, target_user_id, action, details)
  VALUES (
    auth.uid(),
    v_new_id,
    'USER_CREATED',
    jsonb_build_object(
      'email', LOWER(TRIM(p_email)),
      'full_name', TRIM(p_full_name),
      'role', LOWER(p_role),
      'must_change_password', true
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_new_id,
    'email', LOWER(TRIM(p_email)),
    'must_change_password', true,
    'message', 'User created successfully.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[]) TO authenticated;
