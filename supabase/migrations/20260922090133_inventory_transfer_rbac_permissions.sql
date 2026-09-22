-- Align the transfer permission catalog and role mappings with the canonical
-- process_item_transfer RPC contract. The RPC intentionally authorizes only
-- inventory.transfer or inventory.manage (plus the existing SUPER bypass).

BEGIN;

INSERT INTO public.permissions (code, name, description, resource, action, category)
VALUES
  (
    'inventory.transfer',
    'โอนย้ายสต็อก',
    'โอนย้ายสต็อกระหว่างคลัง/โครงการ',
    'inventory',
    'transfer',
    'Inventory Operations'
  ),
  (
    'inventory.manage',
    'จัดการสต็อก',
    'จัดการการเคลื่อนไหวและการดำเนินงานของสต็อก',
    'inventory',
    'manage',
    'Inventory Operations'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  category = EXCLUDED.category;

-- Preserve the effective access previously granted through the legacy
-- items.transfer permission, including custom roles, under the canonical key.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT legacy_rp.role_id, transfer_permission.id
FROM public.role_permissions legacy_rp
JOIN public.permissions legacy_permission
  ON legacy_permission.id = legacy_rp.permission_id
JOIN public.permissions transfer_permission
  ON transfer_permission.code = 'inventory.transfer'
WHERE legacy_permission.code = 'items.transfer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Keep the built-in role model explicit: supervisors can transfer, while
-- administrators can transfer and manage inventory operations.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p
  ON p.code = 'inventory.transfer'
WHERE r.code IN ('SUPERVISOR', 'ADMIN', 'SUPER')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p
  ON p.code = 'inventory.manage'
WHERE r.code IN ('ADMIN', 'SUPER')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Remove only the obsolete role assignment. Keep the catalog row for
-- compatibility with historical role data; it no longer authorizes transfers.
DELETE FROM public.role_permissions legacy_rp
USING public.permissions legacy_permission
WHERE legacy_permission.id = legacy_rp.permission_id
  AND legacy_permission.code = 'items.transfer';

COMMIT;

NOTIFY pgrst, 'reload schema';
