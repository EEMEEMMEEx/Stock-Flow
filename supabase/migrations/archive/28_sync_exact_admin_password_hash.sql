-- Migration 28: Sync Exact Working Admin Password Hash to watchara.m@forth.co.th
-- Copies the exact verified working bcrypt password hash from admin@stockflow.com.

UPDATE auth.users 
SET encrypted_password = (
      SELECT encrypted_password 
      FROM auth.users 
      WHERE LOWER(email) = 'admin@stockflow.com' 
      LIMIT 1
    ),
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
WHERE LOWER(email) = 'watchara.m@forth.co.th';

UPDATE public.profiles 
SET must_change_password = TRUE,
    updated_at = NOW()
WHERE id = (SELECT id FROM auth.users WHERE LOWER(email) = 'watchara.m@forth.co.th');
