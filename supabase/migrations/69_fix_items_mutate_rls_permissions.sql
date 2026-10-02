-- ==============================================================================
-- Migration 69: Fix Items Mutation RLS Policy for Admin and Authorized Roles
-- ==============================================================================
-- Rationale:
-- Migration 65 restricted mutation of public.items to:
--   public.has_permission(auth.uid(), 'items.manage') OR public.is_super_admin(auth.uid())
-- However, the RBAC catalog defines 'items.update', 'items.create', 'items.delete' (not 'items.manage').
-- This caused ADMIN users (who have 'items.update' and are not super admins) to be silently blocked by RLS (0 rows affected).
-- This migration restores proper access by checking actual catalog permissions and system role status.

BEGIN;

-- 1. Ensure 'items.manage' exists in public.permissions as an alias/super-permission
INSERT INTO public.permissions (code, name, description, resource, action, category)
VALUES ('items.manage', 'จัดการรายการวัสดุ Master ทั้งหมด', 'จัดการ เพิ่ม ลบ แก้ไข ข้อมูลวัสดุใน Master Catalog', 'items', 'manage', 'Items Master')
ON CONFLICT (code) DO NOTHING;

-- 2. Link 'items.manage' to ADMIN and SUPER roles
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('ADMIN', 'SUPER') AND p.code = 'items.manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. Replace the restrictive RLS policy on public.items
DROP POLICY IF EXISTS "Authorized users mutate items" ON public.items;
DROP POLICY IF EXISTS "Allow auth mutate items" ON public.items;

CREATE POLICY "Authorized users mutate items" ON public.items
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid()) OR
    public.has_permission(auth.uid(), 'items.update') OR
    public.has_permission(auth.uid(), 'items.create') OR
    public.has_permission(auth.uid(), 'items.delete') OR
    public.has_permission(auth.uid(), 'items.manage')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid()) OR
    public.has_permission(auth.uid(), 'items.update') OR
    public.has_permission(auth.uid(), 'items.create') OR
    public.has_permission(auth.uid(), 'items.delete') OR
    public.has_permission(auth.uid(), 'items.manage')
  );

COMMIT;
