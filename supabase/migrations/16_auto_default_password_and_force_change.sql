-- Migration 16: Centralized Default Reset Password Auto-Assignment & Forced Password Change
-- Adds must_change_password column to profiles, updates admin_create_user to auto-assign default password,
-- and creates RPC complete_force_password_change.

-- 1. Add must_change_password column to profiles table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'must_change_password'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN must_change_password BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- 2. Update admin_create_user RPC to auto-assign Default Reset Password & mark must_change_password = TRUE
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

  -- G. Insert Profile record with must_change_password = TRUE
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
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    phone = EXCLUDED.phone,
    "position" = EXCLUDED."position",
    must_change_password = TRUE,
    updated_at = NOW();

  -- H. Assign projects if not all_projects
  IF NOT p_all_projects AND p_project_ids IS NOT NULL AND ARRAY_LENGTH(p_project_ids, 1) > 0 THEN
    FOREACH v_pid IN ARRAY p_project_ids LOOP
      INSERT INTO public.user_project_assignments (user_id, project_id, created_by)
      VALUES (v_new_id, v_pid, auth.uid())
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- I. Record audit log
  INSERT INTO public.audit_logs (actor_id, target_user_id, action, details)
  VALUES (
    auth.uid(),
    v_new_id,
    'USER_CREATED',
    jsonb_build_object(
      'email', p_email,
      'role', p_role,
      'auto_assigned_default_password', TRUE,
      'must_change_password', TRUE
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_new_id,
    'email', p_email,
    'must_change_password', true
  );
END;
$$;

-- 3. RPC: admin_get_users (updated to include must_change_password)
DROP FUNCTION IF EXISTS public.admin_get_users();
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
  IF NOT public.is_active_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only active admins can view user management list.';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    u.email::TEXT,
    p.full_name,
    p.role,
    p.status,
    p.phone,
    p."position",
    p.avatar_url,
    COALESCE(p.must_change_password, FALSE) AS must_change_password,
    p.created_at,
    p.updated_at,
    COALESCE(ARRAY_AGG(upa.project_id) FILTER (WHERE upa.project_id IS NOT NULL), ARRAY[]::UUID[]) AS assigned_project_ids,
    (
      p.role = 'admin' OR 
      NOT EXISTS (SELECT 1 FROM public.user_project_assignments WHERE user_id = p.id)
    ) AS all_projects
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_project_assignments upa ON upa.user_id = p.id
  GROUP BY p.id, u.email, p.full_name, p.role, p.status, p.phone, p."position", p.avatar_url, p.must_change_password, p.created_at, p.updated_at
  ORDER BY p.created_at DESC;
END;
$$;

-- 4. RPC: complete_force_password_change
CREATE OR REPLACE FUNCTION public.complete_force_password_change()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  UPDATE public.profiles
  SET must_change_password = FALSE,
      updated_at = NOW()
  WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true, 'updated_at', NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_force_password_change() TO authenticated;
