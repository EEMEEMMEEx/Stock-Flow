-- ==============================================================================
-- Migration 90: Add scrap.view permission for Damaged & Salvage Items Management
-- ==============================================================================
-- Summary:
--   1. Inserts 'scrap.view' into public.permissions under 'Inventory Operations'.
--   2. Grants 'scrap.view' to ADMIN and SUPER roles in public.role_permissions.
--   3. Hardens SELECT policy on public.scrap_disposal_items for scrap.view holders.
-- ==============================================================================

BEGIN;

-- 1. Insert 'scrap.view' permission
INSERT INTO public.permissions (code, name, description, resource, action, category)
VALUES (
  'scrap.view',
  'ดูรายการของเสียหายและซากพัสดุ',
  'สิทธิ์เข้าถึงหน้ารวมศูนย์ของเสียและซากพัสดุชำรุด (Scrap & Salvage)',
  'scrap',
  'view',
  'Inventory Operations'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  category = EXCLUDED.category;

-- 2. Grant to ADMIN role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'ADMIN' AND p.code = 'scrap.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. Explicitly grant to SUPER role (in addition to trg_auto_grant_permission_to_super)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('SUPER', 'SUPERADMIN', 'SUPER_ADMIN') AND p.code = 'scrap.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. Harden SELECT policy on public.scrap_disposal_items
DROP POLICY IF EXISTS "scrap_disposal_items_auth_select" ON public.scrap_disposal_items;
CREATE POLICY "scrap_disposal_items_auth_select" ON public.scrap_disposal_items
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'scrap.view')
    OR public.has_permission((SELECT auth.uid()), 'inventory.manage')
  );

COMMIT;
