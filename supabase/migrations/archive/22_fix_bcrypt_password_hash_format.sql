-- Migration 22: Fix Bcrypt Password Hash Format & Standardize Auth Passwords
-- Replaces incompatible pgcrypto hashes with standard GoTrue-compatible bcrypt hashes.

-- 1. Sync watchara.m@forth.co.th encrypted_password to match working admin bcrypt hash
UPDATE auth.users 
SET encrypted_password = (
      SELECT encrypted_password 
      FROM auth.users 
      WHERE email = 'admin@stockflow.com' 
      LIMIT 1
    ),
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
WHERE email = 'watchara.m@forth.co.th';

-- 2. Update profiles must_change_password to TRUE so user is prompted to change password on login
UPDATE public.profiles 
SET must_change_password = TRUE 
WHERE id = (SELECT id FROM auth.users WHERE email = 'watchara.m@forth.co.th');
