-- Migration 59: Configure SUPER as System Role with Full Permissions
-- Target: StockFlow RBAC Infrastructure

BEGIN;

-- 1. Ensure SUPER role exists with correct metadata and is_system = TRUE
INSERT INTO public.roles (code, name, description, badge_background, badge_text_color, is_system, is_active)
VALUES (
  'SUPER',
  'ผู้ดูแลระบบสูงสุด (Super Admin)',
  'สิทธิ์สูงสุด จัดการทุกอย่าง รวมถึง Admin, สิทธิ์, การตั้งค่าระบบ, Security, Integration',
  'bg-gradient-to-r from-amber-500/15 via-purple-500/15 to-rose-500/15',
  'text-purple-900 dark:text-purple-200',
  TRUE,
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  badge_background = EXCLUDED.badge_background,
  badge_text_color = EXCLUDED.badge_text_color,
  is_system = TRUE,
  is_active = TRUE,
  updated_at = NOW();

-- 2. Mark STAFF, SUPERVISOR, ADMIN, SUPER explicitly as System Roles
UPDATE public.roles
SET is_system = TRUE
WHERE code IN ('STAFF', 'SUPERVISOR', 'ADMIN', 'SUPER');

-- 3. Assign ALL 36 catalog permissions to the SUPER role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'SUPER'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. Re-link profiles for SUPER role safely (matching role or auth.users email)
UPDATE public.profiles p
SET role_id = r.id, role = 'super'
FROM public.roles r
WHERE r.code = 'SUPER' 
  AND (
    UPPER(p.role) IN ('SUPER', 'SUPERADMIN', 'SUPER_ADMIN')
    OR p.id IN (SELECT id FROM auth.users WHERE LOWER(email) = 'admin@stockflow.com')
  )
  AND (p.role_id IS DISTINCT FROM r.id OR p.role IS DISTINCT FROM 'super');

COMMIT;
