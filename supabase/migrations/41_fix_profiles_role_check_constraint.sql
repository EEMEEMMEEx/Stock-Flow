-- Migration 41: Fix profiles_role_check Constraint to Support Operator and Dynamic RBAC Roles
-- Purpose:
--   The previous profiles_role_check constraint restricted public.profiles.role to ONLY ('admin', 'staff', 'supervisor').
--   When creating users with role 'operator' or custom RBAC roles, PostgreSQL throws:
--   "new row for relation \"profiles\" violates check constraint \"profiles_role_check\""
--   This migration updates profiles_role_check to allow any non-empty role string safely.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IS NOT NULL AND length(trim(role)) > 0);
