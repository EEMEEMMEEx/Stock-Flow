-- Migration 45: Seed Complete Dynamic RBAC Permissions Catalog & Default Role Mappings
-- Ensures permissions table and role_permissions table are fully populated with all system capabilities.

-- 1. Insert / Upsert all application permissions
INSERT INTO public.permissions (code, name, description, resource, action, category)
VALUES
  -- Dashboard
  ('dashboard.view', 'ดูหน้า Dashboard', 'เข้าถึงหน้าภาพรวมระบบและสถิติ', 'dashboard', 'view', 'Dashboard'),

  -- Projects
  ('projects.view', 'ดูรายการโครงการ', 'ดูข้อมูลและรายละเอียดโครงการ', 'projects', 'view', 'Projects'),
  ('projects.create', 'สร้างโครงการใหม่', 'สร้างโครงการใหม่ในระบบ', 'projects', 'create', 'Projects'),
  ('projects.update', 'แก้ไขโครงการ', 'แก้ไขข้อมูลโครงการ', 'projects', 'update', 'Projects'),
  ('projects.delete', 'ลบโครงการ', 'ลบโครงการออกจากระบบ', 'projects', 'delete', 'Projects'),

  -- Items Master
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

  -- Checkouts & Returns (ยืม-คืน)
  ('checkouts.view', 'ดูรายการยืม-คืน', 'ดูรายการและสถานะการยืม-คืนวัสดุอุปกรณ์', 'checkouts', 'view', 'Checkouts & Returns'),
  ('checkouts.create', 'สร้างรายการยืมของ', 'สร้างคำขอยืมวัสดุ/เครื่องมือ', 'checkouts', 'create', 'Checkouts & Returns'),
  ('checkouts.return', 'บันทึกรับคืนของ', 'บันทึกการส่งคืนและตรวจสอบสภาพของ', 'checkouts', 'return', 'Checkouts & Returns'),

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

  -- Role Management
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

-- 2. Link ADMIN role to ALL permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. Link STAFF role to operational permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'dashboard.view', 'projects.view', 'items.view', 'stock_in.view', 
  'withdrawals.view', 'withdrawals.create', 
  'checkouts.view', 'checkouts.create', 'checkouts.return',
  'history.view'
)
WHERE r.code = 'STAFF'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. Link SUPERVISOR role to staff + approval + reports permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'dashboard.view', 'projects.view', 'items.view', 'stock_in.view', 
  'withdrawals.view', 'withdrawals.create', 'withdrawals.approve', 'withdrawals.reject', 
  'checkouts.view', 'checkouts.create', 'checkouts.return',
  'history.view', 'reports.view', 'reports.export'
)
WHERE r.code = 'SUPERVISOR'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 5. Backfill profiles.role_id for any profiles where role_id is NULL
UPDATE public.profiles p
SET role_id = r.id
FROM public.roles r
WHERE UPPER(p.role) = r.code AND p.role_id IS NULL;
