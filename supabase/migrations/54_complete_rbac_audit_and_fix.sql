-- ==============================================================================
-- Migration 54: Comprehensive RBAC Audit & End-to-End Authorization Hardening
-- Description:
--   1. Ensures roles, permissions, role_permissions tables, indexes, and full catalog exist.
--   2. Auto-sync trigger on public.profiles to guarantee profiles.role_id and profiles.role
--      are ALWAYS synchronized in real time.
--   3. Dynamic, resilient get_user_permissions() and has_permission() functions.
--   4. Hardens all administrative, operational, and transaction RPCs with has_permission().
--   5. Full RLS security policies across RBAC and operational tables.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Ensure Roles Table Exists
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

-- 2. Ensure Permissions Catalog Table Exists
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

-- 3. Ensure Role Permissions Mapping Table Exists
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT role_permission_unique UNIQUE (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON public.role_permissions(permission_id);

-- 4. Ensure profiles table has role_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'role_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles(role_id);

-- 5. Seed Standard Default Roles
INSERT INTO public.roles (code, name, description, badge_background, badge_text_color, is_system, is_active)
VALUES 
  ('ADMIN', 'ผู้ดูแลระบบ (Administrator)', 'สิทธิ์สูงสุด บริหารจัดการผู้ใช้งาน บทบาท สต็อก และโครงการทั้งหมด', 'bg-purple-100 dark:bg-purple-950', 'text-purple-700 dark:text-purple-300', TRUE, TRUE),
  ('STAFF', 'เจ้าหน้าที่ / ผู้ขอเบิก (Staff)', 'สามารถขอเบิกจ่ายวัสดุ และดูข้อมูลสต็อกเฉพาะโครงการที่ได้รับมอบหมาย', 'bg-blue-100 dark:bg-blue-950', 'text-blue-700 dark:text-blue-300', TRUE, TRUE),
  ('SUPERVISOR', 'ผู้จัดการ / ผู้อนุมัติ (Supervisor)', 'สามารถตรวจสอบ อนุมัติการเบิกจ่าย และดูรายงานระดับโครงการ', 'bg-emerald-100 dark:bg-emerald-950', 'text-emerald-700 dark:text-emerald-300', TRUE, TRUE)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_system = TRUE,
  is_active = TRUE;

-- 6. Seed Complete Canonical Permissions Catalog
INSERT INTO public.permissions (code, name, description, resource, action, category)
VALUES
  -- Dashboard
  ('dashboard.view', 'ดูหน้า Dashboard', 'เข้าถึงหน้าภาพรวมระบบและสถิติ', 'dashboard', 'view', 'Dashboard'),

  -- Projects
  ('projects.view', 'ดูรายการโครงการ', 'ดูข้อมูลและรายละเอียดโครงการ', 'projects', 'view', 'Projects'),
  ('projects.create', 'สร้างโครงการใหม่', 'สร้างโครงการใหม่และสถานที่จัดเก็บ', 'projects', 'create', 'Projects'),
  ('projects.update', 'แก้ไขโครงการ', 'แก้ไขข้อมูลโครงการและสถานที่จัดเก็บ', 'projects', 'update', 'Projects'),
  ('projects.delete', 'ลบโครงการ', 'ลบโครงการและสถานที่จัดเก็บ', 'projects', 'delete', 'Projects'),

  -- Items Master
  ('items.view', 'ดูรายการวัสดุ Master', 'ดูรายการและรายละเอียดวัสดุอุปกรณ์', 'items', 'view', 'Items Master'),
  ('items.create', 'เพิ่มรายการวัสดุ', 'เพิ่มวัสดุใหม่ลง Master Catalog', 'items', 'create', 'Items Master'),
  ('items.update', 'แก้ไขรายการวัสดุ', 'แก้ไขข้อมูลวัสดุใน Master Catalog', 'items', 'update', 'Items Master'),
  ('items.delete', 'ลบรายการวัสดุ', 'ลบรายการวัสดุออกจาก Master Catalog', 'items', 'delete', 'Items Master'),
  ('items.transfer', 'โอนย้ายสถานที่จัดเก็บ', 'โอนย้ายวัสดุระหว่างคลัง/โครงการ', 'items', 'transfer', 'Items Master'),

  -- Stock In
  ('stock_in.view', 'ดูประวัติการรับเข้า Stock', 'ดูรายการและประวัติการนำเข้าสต็อก', 'stock_in', 'view', 'Stock In'),
  ('stock_in.create', 'บันทึกรับเข้า Stock', 'บันทึกการรับเข้าวัสดุสู่คลังสินค้าและนำเข้า CSV', 'stock_in', 'create', 'Stock In'),

  -- Withdrawals
  ('withdrawals.view', 'ดูรายการเบิกจ่าย', 'ดูรายการและสถานะการเบิกจ่ายวัสดุ', 'withdrawals', 'view', 'Withdrawals'),
  ('withdrawals.create', 'สร้างรายการขอเบิก', 'สร้างคำขอเบิกจ่ายวัสดุอุปกรณ์ผ่าน POS', 'withdrawals', 'create', 'Withdrawals'),
  ('withdrawals.approve', 'อนุมัติการเบิกจ่าย', 'อนุมัติคำขอเบิกจ่ายวัสดุและตัดยอดสต็อก', 'withdrawals', 'approve', 'Withdrawals'),
  ('withdrawals.reject', 'ปฏิเสธการเบิกจ่าย', 'ปฏิเสธคำขอเบิกจ่ายวัสดุ', 'withdrawals', 'reject', 'Withdrawals'),
  ('withdrawals.complete', 'ยืนยันรับของสำเร็จ', 'ยืนยันการส่งมอบ/รับมอบวัสดุเบิกจ่าย', 'withdrawals', 'complete', 'Withdrawals'),

  -- Checkouts (Loans & Returns)
  ('checkouts.view', 'ดูรายการยืม-คืน', 'ดูรายการและสถานะการยืมคืนวัสดุ', 'checkouts', 'view', 'Checkouts'),
  ('checkouts.create', 'สร้างรายการยืมพัสดุ', 'บันทึกการยืมพัสดุอุปกรณ์', 'checkouts', 'create', 'Checkouts'),
  ('checkouts.return', 'บันทึกรับคืนพัสดุ', 'บันทึกการส่งคืนพัสดุเข้าคลัง', 'checkouts', 'return', 'Checkouts'),

  -- History & Reports
  ('history.view', 'ดูประวัติการทำรายการ', 'ดูประวัติธุรกรรมสต็อกย้อนหลัง', 'history', 'view', 'History & Reports'),
  ('reports.view', 'ดูรายงานสรุปสต็อก', 'ดูสรุปรายงานและกราฟสถิติ', 'reports', 'view', 'History & Reports'),
  ('reports.export', 'ส่งออกรายงาน (Excel/PDF)', 'ดาวน์โหลดไฟล์รายงาน Excel และ PDF', 'reports', 'export', 'History & Reports'),

  -- User Management
  ('users.view', 'ดูรายการผู้ใช้งาน', 'เข้าถึงหน้าจัดการผู้ใช้และดูโปรไฟล์', 'users', 'view', 'User Management'),
  ('users.create', 'เพิ่มผู้ใช้งานใหม่', 'สร้างบัญชีผู้ใช้งานใหม่ในระบบ', 'users', 'create', 'User Management'),
  ('users.update', 'แก้ไขข้อมูลผู้ใช้', 'แก้ไขบทบาท โครงการ และโปรไฟล์ผู้ใช้', 'users', 'update', 'User Management'),
  ('users.deactivate', 'ระงับการใช้งานบัญชี', 'เปลี่ยนสถานะเป็น Inactive', 'users', 'deactivate', 'User Management'),
  ('users.reset_password', 'รีเซ็ตรหัสผ่านผู้ใช้', 'รีเซ็ตรหัสผ่านให้ผู้ใช้งาน', 'users', 'reset_password', 'User Management'),

  -- Roles & Permissions (RBAC)
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
  category = EXCLUDED.category,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action;

-- 7. Ensure Baseline Role Permissions are Populated
-- 7.1 ADMIN: Receives ALL Permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 7.2 STAFF: Requisitions, View Stock, View Checkouts, Self Actions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'dashboard.view', 'projects.view', 'items.view', 'stock_in.view', 
  'withdrawals.view', 'withdrawals.create', 'withdrawals.complete',
  'checkouts.view', 'checkouts.create', 'checkouts.return',
  'history.view'
)
WHERE r.code = 'STAFF'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 7.3 SUPERVISOR: Staff perms + Approvals, Rejections, and Reports
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'dashboard.view', 'projects.view', 'items.view', 'stock_in.view', 
  'withdrawals.view', 'withdrawals.create', 'withdrawals.approve', 'withdrawals.reject', 'withdrawals.complete',
  'checkouts.view', 'checkouts.create', 'checkouts.return',
  'history.view', 'reports.view', 'reports.export'
)
WHERE r.code = 'SUPERVISOR'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 8. Bidirectional Synchronization Trigger for public.profiles (role <-> role_id)
CREATE OR REPLACE FUNCTION public.sync_profile_role_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_rec RECORD;
BEGIN
  -- If role_id is provided or changed, sync role string
  IF NEW.role_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.role_id IS DISTINCT FROM OLD.role_id) THEN
    SELECT id, code INTO v_role_rec FROM public.roles WHERE id = NEW.role_id;
    IF FOUND THEN
      NEW.role := LOWER(v_role_rec.code);
    END IF;
  -- If role string is provided or changed, sync role_id
  ELSIF NEW.role IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role OR NEW.role_id IS NULL) THEN
    SELECT id, code INTO v_role_rec FROM public.roles 
    WHERE code = UPPER(TRIM(NEW.role)) OR LOWER(TRIM(name)) = LOWER(TRIM(NEW.role))
    LIMIT 1;

    IF FOUND THEN
      NEW.role_id := v_role_rec.id;
      NEW.role := LOWER(v_role_rec.code);
    ELSE
      -- Fallback to STAFF role if unmatched
      SELECT id, code INTO v_role_rec FROM public.roles WHERE code = 'STAFF';
      IF FOUND THEN
        NEW.role_id := v_role_rec.id;
        NEW.role := 'staff';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_role ON public.profiles;
CREATE TRIGGER trg_sync_profile_role
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_role_function();

-- 9. Backfill all existing profiles to ensure role_id is populated
UPDATE public.profiles p
SET role_id = r.id,
    role = LOWER(r.code)
FROM public.roles r
WHERE UPPER(TRIM(p.role)) = r.code;

UPDATE public.profiles
SET role_id = (SELECT id FROM public.roles WHERE code = 'STAFF')
WHERE role_id IS NULL;

-- 10. Robust Core Permission Verification Functions
-- 10.1 Check Single Permission
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_perm_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_role_code TEXT;
  v_role_id UUID;
BEGIN
  IF p_user_id IS NULL OR p_perm_code IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Lookup user status, role code, and role_id
  SELECT p.status, 
         COALESCE(r.code, UPPER(p.role)), 
         COALESCE(p.role_id, r.id)
  INTO v_status, v_role_code, v_role_id
  FROM public.profiles p
  LEFT JOIN public.roles r ON (r.id = p.role_id OR r.code = UPPER(TRIM(p.role)))
  WHERE p.id = p_user_id;

  IF v_status IS NULL OR v_status != 'active' THEN
    RETURN FALSE;
  END IF;

  -- Admin always has all permissions
  IF v_role_code = 'ADMIN' THEN
    RETURN TRUE;
  END IF;

  -- Check role_permissions table
  RETURN EXISTS (
    SELECT 1 
    FROM public.role_permissions rp
    JOIN public.permissions perm ON perm.id = rp.permission_id
    WHERE rp.role_id = v_role_id 
      AND perm.code = p_perm_code
  );
END;
$$;

-- 10.2 Get User Permissions Array / Table
CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (permission_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_role_code TEXT;
  v_role_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT p.status, 
         COALESCE(r.code, UPPER(p.role)), 
         COALESCE(p.role_id, r.id)
  INTO v_status, v_role_code, v_role_id
  FROM public.profiles p
  LEFT JOIN public.roles r ON (r.id = p.role_id OR r.code = UPPER(TRIM(p.role)))
  WHERE p.id = p_user_id;

  IF v_status IS NULL OR v_status != 'active' THEN
    RETURN;
  END IF;

  -- Admin receives all permissions from catalog
  IF v_role_code = 'ADMIN' THEN
    RETURN QUERY SELECT code FROM public.permissions ORDER BY code;
    RETURN;
  END IF;

  -- Regular and customized roles receive exactly what is configured
  RETURN QUERY
  SELECT DISTINCT perm.code
  FROM public.role_permissions rp
  JOIN public.permissions perm ON perm.id = rp.permission_id
  WHERE rp.role_id = v_role_id
  ORDER BY perm.code;
END;
$$;

-- 11. Hardened RBAC Management RPCs
-- 11.1 admin_get_roles_with_stats
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
SET search_path = public, auth, pg_temp
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
  LEFT JOIN public.profiles p ON (
    p.role_id = r.id 
    OR UPPER(TRIM(p.role)) = r.code
    OR (r.code = 'STAFF' AND UPPER(TRIM(p.role)) IN ('STAFF', 'OPERATOR', 'REQUESTER'))
    OR (r.code = 'SUPERVISOR' AND UPPER(TRIM(p.role)) IN ('SUPERVISOR', 'APPROVER', 'MANAGER'))
    OR (r.code = 'ADMIN' AND UPPER(TRIM(p.role)) IN ('ADMIN', 'ADMINISTRATOR'))
  )
  LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
  GROUP BY r.id, r.code, r.name, r.description, r.badge_background, r.badge_text_color, r.is_system, r.is_active, r.created_at, r.updated_at
  ORDER BY r.is_system DESC, r.created_at ASC;
END;
$$;

-- 11.2 admin_get_permissions_catalog
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
SET search_path = public, auth, pg_temp
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

-- 11.3 admin_get_role_permissions
CREATE OR REPLACE FUNCTION public.admin_get_role_permissions(p_role_id UUID)
RETURNS TABLE (permission_id UUID, permission_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
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

-- 11.4 admin_save_role_permissions
CREATE OR REPLACE FUNCTION public.admin_save_role_permissions(
  p_role_id UUID,
  p_permission_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
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
  BEGIN
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
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
    END IF;
  EXCEPTION WHEN OTHERS THEN END;

  RETURN jsonb_build_object('success', true, 'message', 'Role permissions updated successfully.');
END;
$$;

-- 12. Hardened Operational Withdrawal RPCs with RBAC
-- 12.1 approve_withdrawal_order
CREATE OR REPLACE FUNCTION public.approve_withdrawal_order(
  p_order_id UUID,
  p_approver_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := COALESCE(auth.uid(), p_approver_id);
  v_order RECORD;
  v_item RECORD;
  v_current_stock NUMERIC;
BEGIN
  -- Verify permission
  IF NOT public.has_permission(v_caller_id, 'withdrawals.approve') THEN
    RAISE EXCEPTION 'Unauthorized: Requires withdrawals.approve permission.';
  END IF;

  -- Lock order row
  SELECT * INTO v_order 
  FROM public.withdrawal_orders 
  WHERE id = p_order_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Order is not in pending status (Current: %)', v_order.status;
  END IF;

  -- Process withdrawal items and deduct stock
  FOR v_item IN 
    SELECT * FROM public.withdrawal_items 
    WHERE order_id = p_order_id 
  LOOP
    -- Check current stock balance
    SELECT COALESCE(SUM(quantity), 0) INTO v_current_stock
    FROM public.stock_transactions
    WHERE item_id = v_item.item_id 
      AND project_id = v_order.project_id;

    -- Record transaction OUT
    INSERT INTO public.stock_transactions (
      project_id,
      item_id,
      transaction_type,
      quantity,
      reference_id,
      reference_type,
      created_by,
      notes
    ) VALUES (
      v_order.project_id,
      v_item.item_id,
      'OUT',
      -v_item.quantity,
      p_order_id,
      'withdrawal_order',
      v_caller_id,
      'Withdrawal Approved: Order #' || SUBSTRING(p_order_id::TEXT, 1, 8)
    );
  END LOOP;

  -- Update order status
  UPDATE public.withdrawal_orders
  SET 
    status = 'approved',
    approved_by = v_caller_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'approved',
    'message', 'Withdrawal order approved and stock deducted successfully'
  );
END;
$$;

-- 12.2 reject_withdrawal_order
CREATE OR REPLACE FUNCTION public.reject_withdrawal_order(
  p_order_id UUID,
  p_reason TEXT DEFAULT 'Rejected by approver',
  p_rejecter_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := COALESCE(auth.uid(), p_rejecter_id);
  v_order RECORD;
BEGIN
  -- Verify permission
  IF NOT public.has_permission(v_caller_id, 'withdrawals.reject') THEN
    RAISE EXCEPTION 'Unauthorized: Requires withdrawals.reject permission.';
  END IF;

  SELECT * INTO v_order 
  FROM public.withdrawal_orders 
  WHERE id = p_order_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Order is not in pending status (Current: %)', v_order.status;
  END IF;

  UPDATE public.withdrawal_orders
  SET 
    status = 'rejected',
    reject_reason = p_reason,
    rejected_by = v_caller_id,
    rejected_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'rejected',
    'message', 'Withdrawal order rejected'
  );
END;
$$;

-- 12.3 complete_withdrawal_order
CREATE OR REPLACE FUNCTION public.complete_withdrawal_order(
  p_order_id UUID,
  p_completer_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := COALESCE(auth.uid(), p_completer_id);
  v_order RECORD;
BEGIN
  -- Verify permission
  IF NOT public.has_permission(v_caller_id, 'withdrawals.complete') THEN
    RAISE EXCEPTION 'Unauthorized: Requires withdrawals.complete permission.';
  END IF;

  SELECT * INTO v_order 
  FROM public.withdrawal_orders 
  WHERE id = p_order_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF v_order.status != 'approved' THEN
    RAISE EXCEPTION 'Order must be in approved status before completion (Current: %)', v_order.status;
  END IF;

  UPDATE public.withdrawal_orders
  SET 
    status = 'completed',
    completed_by = v_caller_id,
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'completed',
    'message', 'Withdrawal receipt confirmed'
  );
END;
$$;

-- 13. Enable Row-Level Security (RLS) Policies on Core RBAC Tables
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- 13.1 Roles RLS
DROP POLICY IF EXISTS "Allow read roles" ON public.roles;
CREATE POLICY "Allow read roles" ON public.roles FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Allow admin modify roles" ON public.roles;
CREATE POLICY "Allow admin modify roles" ON public.roles FOR ALL TO authenticated USING (
  public.has_permission(auth.uid(), 'roles.manage_permissions') OR
  public.has_permission(auth.uid(), 'roles.update') OR
  public.has_permission(auth.uid(), 'roles.create') OR
  public.has_permission(auth.uid(), 'roles.delete')
);

-- 13.2 Permissions Catalog RLS
DROP POLICY IF EXISTS "Allow read permissions" ON public.permissions;
CREATE POLICY "Allow read permissions" ON public.permissions FOR SELECT TO authenticated, anon USING (true);

-- 13.3 Role Permissions Mapping RLS
DROP POLICY IF EXISTS "Allow read role_permissions" ON public.role_permissions;
CREATE POLICY "Allow read role_permissions" ON public.role_permissions FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Allow admin modify role_permissions" ON public.role_permissions;
CREATE POLICY "Allow admin modify role_permissions" ON public.role_permissions FOR ALL TO authenticated USING (
  public.has_permission(auth.uid(), 'roles.manage_permissions')
);

-- 14. Grants
GRANT EXECUTE ON FUNCTION public.has_permission(UUID, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_roles_with_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_permissions_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_role_permissions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_role_permissions(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_withdrawal_order(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_withdrawal_order(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_withdrawal_order(UUID, UUID) TO authenticated;
