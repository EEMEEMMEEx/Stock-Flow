-- Migration 25: Clone watchara.m@forth.co.th from Working Admin User
-- Copies all working auth columns and identity structure from admin@stockflow.com to guarantee zero GoTrue 500 errors.

DO $$
DECLARE
  v_admin_rec RECORD;
  v_admin_identity RECORD;
  v_new_id UUID := gen_random_uuid();
BEGIN
  -- 1. Get exact working admin record from auth.users
  SELECT * INTO v_admin_rec 
  FROM auth.users 
  WHERE LOWER(email) = 'admin@stockflow.com' 
  LIMIT 1;

  IF v_admin_rec.id IS NULL THEN
    RAISE EXCEPTION 'Admin user admin@stockflow.com not found.';
  END IF;

  -- 2. Get exact working admin identity record from auth.identities if present
  SELECT * INTO v_admin_identity 
  FROM auth.identities 
  WHERE user_id = v_admin_rec.id 
  LIMIT 1;

  -- 3. Clean up existing watchara.m@forth.co.th records completely
  DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE LOWER(email) = 'watchara.m@forth.co.th');
  DELETE FROM public.user_project_assignments WHERE user_id IN (SELECT id FROM auth.users WHERE LOWER(email) = 'watchara.m@forth.co.th');
  DELETE FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE LOWER(email) = 'watchara.m@forth.co.th');
  DELETE FROM auth.users WHERE LOWER(email) = 'watchara.m@forth.co.th';

  -- 4. Clone auth.users record from working admin
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    invited_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at,
    is_sso_user,
    deleted_at,
    is_anonymous
  ) VALUES (
    v_new_id,
    v_admin_rec.instance_id,
    'watchara.m@forth.co.th',
    v_admin_rec.encrypted_password, -- Working bcrypt password hash from admin (password123)
    NOW(),
    v_admin_rec.invited_at,
    v_admin_rec.confirmation_token,
    v_admin_rec.confirmation_sent_at,
    v_admin_rec.recovery_token,
    v_admin_rec.recovery_sent_at,
    v_admin_rec.email_change_token_new,
    v_admin_rec.email_change,
    v_admin_rec.email_change_sent_at,
    v_admin_rec.last_sign_in_at,
    v_admin_rec.raw_app_meta_data,
    jsonb_build_object('full_name', 'วัชระ มานะดี', 'role', 'staff'),
    v_admin_rec.is_super_admin,
    NOW(),
    NOW(),
    v_admin_rec.phone,
    v_admin_rec.phone_confirmed_at,
    v_admin_rec.phone_change,
    v_admin_rec.phone_change_token,
    v_admin_rec.phone_change_sent_at,
    v_admin_rec.email_change_token_current,
    v_admin_rec.email_change_confirm_status,
    v_admin_rec.banned_until,
    v_admin_rec.reauthentication_token,
    v_admin_rec.reauthentication_sent_at,
    COALESCE(v_admin_rec.is_sso_user, false),
    v_admin_rec.deleted_at,
    COALESCE(v_admin_rec.is_anonymous, false)
  );

  -- 5. Clone auth.identities record
  IF v_admin_identity.id IS NOT NULL THEN
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
      gen_random_uuid(),
      v_new_id,
      jsonb_build_object('sub', v_new_id::text, 'email', 'watchara.m@forth.co.th', 'email_verified', true),
      v_admin_identity.provider,
      v_new_id::text,
      NOW(),
      NOW(),
      NOW()
    );
  END IF;

  -- 6. Insert or Update Profile (ON CONFLICT handles automatic trigger inserts gracefully)
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
