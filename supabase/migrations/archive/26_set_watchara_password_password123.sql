-- Migration 26: Set Exact Password for watchara.m@forth.co.th to password123
-- Generates a fresh standard bcrypt hash for 'password123'.

UPDATE auth.users 
SET encrypted_password = extensions.crypt('password123', extensions.gen_salt('bf', 10)),
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
WHERE LOWER(email) = 'watchara.m@forth.co.th';

UPDATE public.profiles 
SET must_change_password = TRUE,
    updated_at = NOW()
WHERE id = (SELECT id FROM auth.users WHERE LOWER(email) = 'watchara.m@forth.co.th');
