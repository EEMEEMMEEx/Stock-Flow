-- Migration 21: Fix Missing auth.identities Records & Update admin_create_user RPC
-- Fixes Supabase GoTrue Auth HTTP 500 error caused by missing auth.identities records for admin-created users.

-- 1. Backfill missing auth.identities for all users in auth.users
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT 
  u.id,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  u.id::text,
  NOW(),
  COALESCE(u.created_at, NOW()),
  COALESCE(u.updated_at, NOW())
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i WHERE i.user_id = u.id
)
ON CONFLICT DO NOTHING;

-- 2. Update admin_create_user RPC to always insert into auth.identities
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

  -- C. Check for existing email in auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_email))) THEN
    RAISE EXCEPTION 'Duplicate Error: Email address % is already registered.', p_email;
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

  -- F. Insert into auth.users
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
    NOW(),
    NOW()
  );

  -- G. Insert into auth.identities (CRITICAL: Required by Supabase GoTrue Auth Engine)
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

  -- H. Insert Profile record with must_change_password = TRUE
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
  );

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
