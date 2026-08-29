-- Migration 15: Fix Profiles Role Check Constraint & Safe Auth Hook Triggers
-- Drops rigid role check constraint on public.profiles to allow 'supervisor', 'admin', 'staff' in any case,
-- and updates handle_new_user() trigger to be exception-safe.

-- 1. Drop outdated role check constraint on public.profiles if exists
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Add flexible role check constraint supporting supervisor, admin, staff (case-insensitive)
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
  CHECK (LOWER(role) IN ('admin', 'staff', 'supervisor'));

-- 3. Exception-safe handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, status)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'User'), 
    LOWER(COALESCE(new.raw_user_meta_data->>'role', 'staff')),
    'active'
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role = EXCLUDED.role;
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Prevent database trigger failure from blocking Auth GoTrue session creation
  RAISE WARNING 'handle_new_user trigger error: %', SQLERRM;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
