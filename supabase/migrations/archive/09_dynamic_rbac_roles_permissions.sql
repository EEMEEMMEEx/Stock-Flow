-- Migration 09: Dynamic Role & Permission Management (RBAC)
-- Creates roles, permissions, role_permissions tables, seeds default roles & catalog,
-- updates profiles.role_id, provides PL/pgSQL RPCs and RLS policies.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Roles Table
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  badge_background TEXT DEFAULT 'bg-purple-100 dark:bg-purple-950',
  badge_text_color TEXT DEFAULT 'text-purple-700 dark:text-purple-300',
  is_system BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Permissions Table
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Role Permissions Mapping Table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT role_permission_unique UNIQUE (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON public.role_permissions(permission_id);

-- 4. Add role_id to public.profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'role_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enable RLS on new tables
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- 5. Seed Default System Roles
INSERT INTO public.roles (code, name, description, badge_background, badge_text_color, is_system)
VALUES 
  ('ADMIN', 'ผู้ดูแลระบบ (Administrator)', 'สิทธิ์สูงสุด บริหารจัดการผู้ใช้งาน บทบาท สต็อก และโครงการทั้งหมด', 'bg-purple-100 dark:bg-purple-950', 'text-purple-700 dark:text-purple-300', TRUE),
  ('STAFF', 'เจ้าหน้าที่ / ผู้ขอเบิก (Staff)', 'สามารถขอเบิกจ่ายวัสดุ และดูข้อมูลสต็อกเฉพาะโครงการที่ได้รับมอบหมาย', 'bg-blue-100 dark:bg-blue-950', 'text-blue-700 dark:text-blue-300', TRUE),
  ('SUPERVISOR', 'ผู้จัดการ / ผู้อนุมัติ (Supervisor)', 'สามารถตรวจสอบ อนุมัติการเบิกจ่าย และดูรายงานระดับโครงการ', 'bg-emerald-100 dark:bg-emerald-950', 'text-emerald-700 dark:text-emerald-300', TRUE)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_system = TRUE;

-- 6. Seed Complete Permissions Catalog
INSERT INTO public.permissions (code, name, description, resource, action, category)
VALUES
  -- Dashboard
  ('dashboard.view', 'ดูหน้า Dashboard', 'เข้าถึงหน้าภาพรวมระบบและสถิติ', 'dashboard', 'view', 'Dashboard'),

  -- Projects
  ('projects.view', 'ดูรายการโครงการ', 'ดูข้อมูลและรายละเอียดโครงการ', 'projects', 'view', 'Projects'),
  ('projects.create', 'สร้างโครงการใหม่', 'สร้างโครงการใหม่ในระบบ', 'projects', 'create', 'Projects'),
  ('projects.update', 'แก้ไขโครงการ', 'แก้ไขข้อมูลโครงการ', 'projects', 'update', 'Projects'),
  ('projects.delete', 'ลบโครงการ', 'ลบโครงการออกจากระบบ', 'projects', 'delete', 'Projects'),

  -- Items
  ('items.view', 'ดูรายการวัสดุ Master', 'ดูรายการและรายละเอียดวัสดุอุปกรณ์', 'items', 'view', 'Items Master'),
  ('items.create', 'เพิ่มรายการวัสดุ', 'เพิ่มวัสดุใหม่ลง Master', 'items', 'create', 'Items Master'),
  ('items.update', 'แก้ไขรายการวัสดุ', 'แก้ไขข้อมูลวัสดุใน Master', 'items', 'update', 'Items Master'),
  ('items.delete', 'ลบรายการวัสดุ', 'ลบรายการวัสดุออกจาก Master', 'items', 'delete', 'Items Master'),

  -- Stock In
  ('stock_in.view', 'ดูประวัติการรับเข้า Stock', 'ดูรายการและประวัติการนำเข้าสต็อก', 'stock_in', 'view', 'Stock In'),
  ('stock_in.create', 'บันทึกรับเข้า Stock', 'บันทึกการรับเข้าวัสดุสู่คลังสินค้า', 'stock_in', 'create', 'Stock In'),

  -- Withdrawals
  ('withdrawals.view', 'ดูรายการเบิกจ่าย', 'ดูรายการและสถานะการเบิกจ่ายวัสดุ', 'withdrawals', 'view', 'Withdrawals'),
  ('withdrawals.create', 'สร้างรายการขอเบิก', 'สร้างคำขอเบิกจ่ายวัสดุอุปกรณ์', 'withdrawals', 'create', 'Withdrawals'),
  ('withdrawals.approve', 'อนุมัติการเบิกจ่าย', 'อนุมัติคำขอเบิกจ่ายวัสดุ', 'withdrawals', 'approve', 'Withdrawals'),
  ('withdrawals.reject', 'ปฏิเสธการเบิกจ่าย', 'ปฏิเสธคำขอเบิกจ่ายวัสดุ', 'withdrawals', 'reject', 'Withdrawals'),
  ('withdrawals.complete', 'ยืนยันรับของสำเร็จ', 'ยืนยันการส่งมอบ/รับวัสดุเบิกจ่าย', 'withdrawals', 'complete', 'Withdrawals'),

  -- History & Reports
  ('history.view', 'ดูประวัติการทำรายการ', 'ดูประวัติธุรกรรมสต็อกย้อนหลัง', 'history', 'view', 'History & Reports'),
  ('reports.view', 'ดูรายงานสรุปสต็อก', 'ดูสรุปรายงานและกราฟสถิติ', 'reports', 'view', 'History & Reports'),
  ('reports.export', 'ส่งออกรายงาน (Excel/PDF)', 'ดาวน์โหลดไฟล์รายงาน Excel และ PDF', 'reports', 'export', 'History & Reports'),

  -- Users Management
  ('users.view', 'ดูรายการผู้ใช้งาน', 'เข้าถึงหน้าจัดการผู้ใช้และดูโปรไฟล์', 'users', 'view', 'User Management'),
  ('users.create', 'เพิ่มผู้ใช้งานใหม่', 'สร้างบัญชีผู้ใช้งานใหม่ในระบบ', 'users', 'create', 'User Management'),
  ('users.update', 'แก้ไขข้อมูลผู้ใช้', 'แก้ไขบทบาท โครงการ และโปรไฟล์ผู้ใช้', 'users', 'update', 'User Management'),
  ('users.deactivate', 'ระงับการใช้งานบัญชี', 'เปลี่ยนสถานะเป็น Inactive', 'users', 'deactivate', 'User Management'),
  ('users.reset_password', 'รีเซ็ตรหัสผ่านผู้ใช้', 'รีเซ็ตรหัสผ่านให้ผู้ใช้งาน', 'users', 'reset_password', 'User Management'),

  -- Roles & Permissions
  ('roles.view', 'ดูรายการบทบาทและสิทธิ์', 'เข้าถึงหน้าจัดการบทบาท (RBAC)', 'roles', 'view', 'Role Management'),
  ('roles.create', 'สร้างบทบาทใหม่', 'สร้างบทบาทกำหนดเอง (Custom Role)', 'roles', 'create', 'Role Management'),
  ('roles.update', 'แก้ไขบทบาท', 'แก้ไขชื่อและสีของบทบาท', 'roles', 'update', 'Role Management'),
  ('roles.delete', 'ลบบทบาท', 'ลบบทบาทที่ไม่ได้ใช้งาน', 'roles', 'delete', 'Role Management'),
  ('roles.manage_permissions', 'กำหนดและตั้งค่าสิทธิ์ (RBAC)', 'เปิด-ปิดสิทธิ์การใช้งานให้แต่ละบทบาท', 'roles', 'manage_permissions', 'Role Management'),

  -- Settings
  ('settings.view', 'ดูการตั้งค่าระบบ', 'เข้าถึงหน้าตั้งค่าระบบ', 'settings', 'view', 'Settings'),
  ('settings.update', 'แก้ไขการตั้งค่าระบบ', 'ปรับแต่งค่ากำหนดของแอปพลิเคชัน', 'settings', 'update', 'Settings')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

-- 7. Seed Role Permissions
-- ADMIN receives ALL permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'ADMIN'
ON CONFLICT DO NOTHING;

-- STAFF receives basic operational permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'dashboard.view', 'projects.view', 'items.view', 'stock_in.view', 
  'withdrawals.view', 'withdrawals.create', 'history.view'
)
WHERE r.code = 'STAFF'
ON CONFLICT DO NOTHING;

-- SUPERVISOR receives staff + approval + reports permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'dashboard.view', 'projects.view', 'items.view', 'stock_in.view', 
  'withdrawals.view', 'withdrawals.create', 'withdrawals.approve', 'withdrawals.reject', 
  'history.view', 'reports.view', 'reports.export'
)
WHERE r.code = 'SUPERVISOR'
ON CONFLICT DO NOTHING;

-- 8. Map existing profiles.role to profiles.role_id
UPDATE public.profiles p
SET role_id = r.id
FROM public.roles r
WHERE UPPER(p.role) = r.code AND p.role_id IS NULL;

-- Default unmatched role_id to STAFF
UPDATE public.profiles
SET role_id = (SELECT id FROM public.roles WHERE code = 'STAFF')
WHERE role_id IS NULL;

-- 9. Helper Function: Check User Permission
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_perm_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_code TEXT;
  v_status TEXT;
BEGIN
  -- A. Get user status and role code
  SELECT p.status, r.code INTO v_status, v_role_code
  FROM public.profiles p
  LEFT JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = p_user_id;

  IF v_status IS NULL OR v_status != 'active' THEN
    RETURN FALSE;
  END IF;

  -- B. Admin fallback has full permission
  IF v_role_code = 'ADMIN' OR UPPER(v_role_code) = 'ADMIN' THEN
    RETURN TRUE;
  END IF;

  -- C. Check role_permissions table
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles prof
    JOIN public.role_permissions rp ON rp.role_id = prof.role_id
    JOIN public.permissions perm ON perm.id = rp.permission_id
    WHERE prof.id = p_user_id AND perm.code = p_perm_code
  );
END;
$$;

-- 10. RPC: get_user_permissions
CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (permission_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_code TEXT;
  v_status TEXT;
BEGIN
  SELECT p.status, COALESCE(r.code, UPPER(p.role)) INTO v_status, v_role_code
  FROM public.profiles p
  LEFT JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = p_user_id;

  IF v_status IS NULL OR v_status != 'active' THEN
    RETURN;
  END IF;

  -- If Admin, return ALL active permission codes
  IF v_role_code = 'ADMIN' THEN
    RETURN QUERY SELECT code FROM public.permissions;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT perm.code
  FROM public.profiles prof
  JOIN public.role_permissions rp ON rp.role_id = prof.role_id
  JOIN public.permissions perm ON perm.id = rp.permission_id
  WHERE prof.id = p_user_id;
END;
$$;

-- 11. RPC: admin_get_roles_with_stats
CREATE OR REPLACE FUNCTION public.admin_get_roles_with_stats()
RETURNS TABLE (
  id UUID,
  code TEXT,
  name TEXT,
  description TEXT,
  badge_background TEXT,
  badge_text_color TEXT,
  is_system BOOLEAN,
  is_active BOOLEAN,
  user_count BIGINT,
  permission_count BIGINT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.view') THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.view permission.';
  END IF;

  RETURN QUERY
  SELECT 
    r.id,
    r.code,
    r.name,
    r.description,
    r.badge_background,
    r.badge_text_color,
    r.is_system,
    r.is_active,
    COUNT(DISTINCT p.id)::BIGINT AS user_count,
    COUNT(DISTINCT rp.permission_id)::BIGINT AS permission_count,
    r.created_at,
    r.updated_at
  FROM public.roles r
  LEFT JOIN public.profiles p ON p.role_id = r.id
  LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
  GROUP BY r.id, r.code, r.name, r.description, r.badge_background, r.badge_text_color, r.is_system, r.is_active, r.created_at, r.updated_at
  ORDER BY r.is_system DESC, r.created_at ASC;
END;
$$;

-- 12. RPC: admin_get_permissions_catalog
CREATE OR REPLACE FUNCTION public.admin_get_permissions_catalog()
RETURNS TABLE (
  id UUID,
  code TEXT,
  name TEXT,
  description TEXT,
  resource TEXT,
  action TEXT,
  category TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.view') THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.view permission.';
  END IF;

  RETURN QUERY
  SELECT p.id, p.code, p.name, p.description, p.resource, p.action, p.category
  FROM public.permissions p
  ORDER BY p.category ASC, p.code ASC;
END;
$$;

-- 13. RPC: admin_get_role_permissions
CREATE OR REPLACE FUNCTION public.admin_get_role_permissions(p_role_id UUID)
RETURNS TABLE (permission_id UUID, permission_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.view') THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.view permission.';
  END IF;

  RETURN QUERY
  SELECT perm.id AS permission_id, perm.code AS permission_code
  FROM public.role_permissions rp
  JOIN public.permissions perm ON perm.id = rp.permission_id
  WHERE rp.role_id = p_role_id;
END;
$$;

-- 14. RPC: admin_save_role_permissions
CREATE OR REPLACE FUNCTION public.admin_save_role_permissions(
  p_role_id UUID,
  p_permission_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid UUID;
  v_role_code TEXT;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.manage_permissions') THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.manage_permissions permission.';
  END IF;

  SELECT code INTO v_role_code FROM public.roles WHERE id = p_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not Found: Target role does not exist.';
  END IF;

  -- Delete existing permissions for role
  DELETE FROM public.role_permissions WHERE role_id = p_role_id;

  -- Re-insert selected permissions
  IF p_permission_ids IS NOT NULL AND ARRAY_LENGTH(p_permission_ids, 1) > 0 THEN
    FOREACH v_pid IN ARRAY p_permission_ids LOOP
      INSERT INTO public.role_permissions (role_id, permission_id)
      VALUES (p_role_id, v_pid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'ROLE_PERMISSION_CHANGED',
    jsonb_build_object(
      'role_id', p_role_id,
      'role_code', v_role_code,
      'permissions_count', COALESCE(ARRAY_LENGTH(p_permission_ids, 1), 0)
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'Role permissions updated successfully.');
END;
$$;

-- 15. RPC: admin_create_role
CREATE OR REPLACE FUNCTION public.admin_create_role(
  p_code TEXT,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_badge_background TEXT DEFAULT 'bg-purple-100 dark:bg-purple-950',
  p_badge_text_color TEXT DEFAULT 'text-purple-700 dark:text-purple-300'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_code TEXT;
  v_new_id UUID := gen_random_uuid();
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.create') THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.create permission.';
  END IF;

  IF p_code IS NULL OR TRIM(p_code) = '' THEN
    RAISE EXCEPTION 'Invalid Input: Role code is required.';
  END IF;

  v_normalized_code := UPPER(TRIM(p_code));

  IF v_normalized_code ~ '[^A-Z0-9_]' THEN
    RAISE EXCEPTION 'Invalid Input: Role code must contain only uppercase letters, numbers, and underscores (e.g. SITE_MANAGER).';
  END IF;

  IF EXISTS (SELECT 1 FROM public.roles WHERE code = v_normalized_code) THEN
    RAISE EXCEPTION 'Duplicate Error: Role code % already exists.', v_normalized_code;
  END IF;

  INSERT INTO public.roles (
    id, code, name, description, badge_background, badge_text_color, is_system, is_active
  ) VALUES (
    v_new_id, v_normalized_code, TRIM(p_name), TRIM(p_description), p_badge_background, p_badge_text_color, FALSE, TRUE
  );

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'ROLE_CREATED',
    jsonb_build_object('role_id', v_new_id, 'code', v_normalized_code, 'name', p_name)
  );

  RETURN jsonb_build_object('success', true, 'role_id', v_new_id, 'message', 'Role created successfully.');
END;
$$;

-- 16. RPC: admin_update_role
CREATE OR REPLACE FUNCTION public.admin_update_role(
  p_role_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_badge_background TEXT DEFAULT NULL,
  p_badge_text_color TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.update') THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.update permission.';
  END IF;

  UPDATE public.roles
  SET 
    name = TRIM(p_name),
    description = TRIM(p_description),
    badge_background = COALESCE(p_badge_background, badge_background),
    badge_text_color = COALESCE(p_badge_text_color, badge_text_color),
    updated_at = NOW()
  WHERE id = p_role_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not Found: Target role does not exist.';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'ROLE_UPDATED',
    jsonb_build_object('role_id', p_role_id, 'name', p_name)
  );

  RETURN jsonb_build_object('success', true, 'message', 'Role updated successfully.');
END;
$$;

-- 17. RPC: admin_delete_role
CREATE OR REPLACE FUNCTION public.admin_delete_role(p_role_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_system BOOLEAN;
  v_code TEXT;
  v_user_count INTEGER;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.delete') THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.delete permission.';
  END IF;

  SELECT is_system, code INTO v_is_system, v_code
  FROM public.roles
  WHERE id = p_role_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not Found: Target role does not exist.';
  END IF;

  IF v_is_system THEN
    RAISE EXCEPTION 'System Safeguard: System roles (%s) cannot be deleted.', v_code;
  END IF;

  SELECT COUNT(*) INTO v_user_count
  FROM public.profiles
  WHERE role_id = p_role_id;

  IF v_user_count > 0 THEN
    RAISE EXCEPTION 'Delete Error: Cannot delete role % because % user(s) are assigned to it. Please reassign users first.', v_code, v_user_count;
  END IF;

  DELETE FROM public.roles WHERE id = p_role_id;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'ROLE_DELETED',
    jsonb_build_object('role_id', p_role_id, 'code', v_code)
  );

  RETURN jsonb_build_object('success', true, 'message', 'Role deleted successfully.');
END;
$$;

-- 18. RLS POLICIES FOR ROLES & PERMISSIONS

CREATE POLICY "Roles viewable by authenticated users" ON public.roles 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Permissions viewable by authenticated users" ON public.permissions 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Role permissions viewable by authenticated users" ON public.role_permissions 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Manage roles" ON public.roles 
FOR ALL USING (public.has_permission(auth.uid(), 'roles.create') OR public.has_permission(auth.uid(), 'roles.update'));

CREATE POLICY "Manage role permissions" ON public.role_permissions 
FOR ALL USING (public.has_permission(auth.uid(), 'roles.manage_permissions'));
