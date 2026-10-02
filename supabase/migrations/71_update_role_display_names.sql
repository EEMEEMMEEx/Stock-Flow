-- ==============================================================================
-- Migration 71: Update Role Display Names & Establish Dynamic Role Naming Standard
-- Description: Sets clean Enterprise Title Case display names in public.roles
--              while preserving internal role keys (STAFF, SUPERVISOR, ADMIN, SUPER)
-- ==============================================================================

-- 1. Update existing system roles with clean enterprise title case display names
UPDATE public.roles
SET name = 'Staff / Requester',
    updated_at = NOW()
WHERE code = 'STAFF' AND (name = 'STAFF / REQUESTER' OR name = 'STAFF' OR name IS NULL);

UPDATE public.roles
SET name = 'Supervisor / Approver',
    updated_at = NOW()
WHERE code = 'SUPERVISOR' AND (name = 'SUPERVISOR / APPROVER' OR name = 'SUPERVISOR' OR name IS NULL);

UPDATE public.roles
SET name = 'Administrator',
    updated_at = NOW()
WHERE code = 'ADMIN' AND (name = 'ADMINISTRATOR' OR name = 'ADMIN' OR name IS NULL);

UPDATE public.roles
SET name = 'System Administrator',
    updated_at = NOW()
WHERE code = 'SUPER' AND (name = 'SUPER ADMIN' OR name = 'Super Admin' OR name = 'SUPER' OR name IS NULL);

-- 2. Ensure role code index exists for fast key lookups
CREATE INDEX IF NOT EXISTS idx_roles_code ON public.roles (code);
