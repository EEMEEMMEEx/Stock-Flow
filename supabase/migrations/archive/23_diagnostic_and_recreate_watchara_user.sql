-- Migration 23: Definitive Repair & Creation for watchara.m@forth.co.th
-- Ensures user watchara.m@forth.co.th exists with complete auth, identity, and profile records.

DO $$
DECLARE
  v_user_id UUID;
  v_admin_hash TEXT;
BEGIN
  -- 1. Fetch valid working bcrypt password hash from admin@stockflow.com
  SELECT encrypted_password INTO v_admin_hash 
  FROM auth.users 
  WHERE LOWER(email) = 'admin@stockflow.com' 
  LIMIT 1;

  -- 2. Find existing user ID for watchara.m@forth.co.th if present
  SELECT id INTO v_user_id 
  FROM auth.users 
  WHERE LOWER(email) = 'watchara.m@forth.co.th' 
  LIMIT 1;

  IF v_user_id IS NULL THEN
    -- Create new UUID if user does not exist
    v_user_id := gen_random_uuid();

    -- Insert into auth.users
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
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'watchara.m@forth.co.th',
      v_admin_hash,
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'วัชระ มานะดี', 'role', 'staff'),
      'authenticated',
      'authenticated',
      NOW(),
      NOW()
    );
  ELSE
    -- User exists: update password hash & confirm email
    UPDATE auth.users 
    SET encrypted_password = v_admin_hash,
        email_confirmed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  -- 3. Ensure matching record in auth.identities
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
    v_user_id,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', 'watchara.m@forth.co.th'),
    'email',
    v_user_id::text,
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT DO NOTHING;

  -- 4. Ensure matching profile record in public.profiles
  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    status,
    must_change_password,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
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
      status = 'active',
      must_change_password = TRUE,
      updated_at = NOW();

  RAISE NOTICE 'Definitive Repair Completed for watchara.m@forth.co.th. User ID: %', v_user_id;
END $$;
