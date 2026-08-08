-- Migration 30: Fix auth.identities ID to equal user_id (Resolves GoTrue Nil Pointer Panic HTTP 500)
-- Ensures auth.identities.id matches auth.users.id exactly.

DO $$
DECLARE
  v_admin_rec RECORD;
  v_new_id UUID := gen_random_uuid();
BEGIN
  -- 1. Fetch exact admin record from auth.users
  SELECT * INTO v_admin_rec 
  FROM auth.users 
  WHERE LOWER(email) = 'admin@stockflow.com' 
  LIMIT 1;

  IF v_admin_rec.id IS NULL THEN
    RAISE EXCEPTION 'Admin user admin@stockflow.com not found.';
  END IF;

  -- 2. Clean up existing watchara.m@forth.co.th records completely across all tables
  DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE LOWER(email) = 'watchara.m@forth.co.th');
  DELETE FROM public.user_project_assignments WHERE user_id IN (SELECT id FROM auth.users WHERE LOWER(email) = 'watchara.m@forth.co.th');
  DELETE FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE LOWER(email) = 'watchara.m@forth.co.th');
  DELETE FROM auth.users WHERE LOWER(email) = 'watchara.m@forth.co.th';

  -- 3. Insert into auth.users (With valid working bcrypt password hash from admin)
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    email_change_confirm_status,
    is_sso_user,
    is_anonymous
  ) VALUES (
    v_new_id,
    v_admin_rec.instance_id,
    'authenticated',
    'authenticated',
    'watchara.m@forth.co.th',
    v_admin_rec.encrypted_password, -- Verified working bcrypt password hash from admin (password123)
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', 'วัชระ มานะดี', 'role', 'staff'),
    false,
    NOW(),
    NOW(),
    0,
    false,
    false
  );

  -- 4. Insert into auth.identities (CRITICAL FIX: id MUST BE EQUAL TO v_new_id!)
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
    v_new_id, -- MUST BE v_new_id (matches auth.users.id exactly)!
    v_new_id,
    jsonb_build_object('sub', v_new_id::text, 'email', 'watchara.m@forth.co.th', 'email_verified', true, 'phone_verified', false),
    'email',
    v_new_id::text,
    NOW(),
    NOW(),
    NOW()
  );

  -- 5. Insert or Update Profile in public.profiles
  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    status,
    must_change_password,
    created_at,
    updated_at
  ) VALUES (
    v_new_id,
    'วัชระ มานะดี',
    'staff',
    'active',
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE 
  SET full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      status = EXCLUDED.status,
      must_change_password = EXCLUDED.must_change_password,
      updated_at = NOW();

END $$;
