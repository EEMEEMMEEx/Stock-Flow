-- Migration 75: Fix RBAC Privilege Escalation Trigger and User Management Permissions
-- Allows Administrators with users.update permission to modify user roles and profile details
-- Allows users with users.reset_password/users.update to reset user passwords
-- Allows users with users.deactivate/users.update to toggle user account status
-- Protects Super Admin accounts and the last active Administrator account
-- Normalizes legacy 'operator' role to 'staff' in public.profiles

BEGIN;

-- 1. Redefine trg_check_profile_privilege_escalation
CREATE OR REPLACE FUNCTION public.trg_check_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  -- Allow direct database migrations, background jobs, or service_role without JWT session
  IF auth.uid() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Check role/role_id modification: requires super_admin, users.update, or users.manage
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.role_id IS DISTINCT FROM OLD.role_id) THEN
    IF NOT (
      public.is_super_admin(auth.uid()) OR 
      public.has_permission(auth.uid(), 'users.update') OR 
      public.has_permission(auth.uid(), 'users.manage')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can modify user role or role_id.';
    END IF;
  END IF;

  -- Check status modification: requires super_admin, users.deactivate, users.update, or users.manage
  IF (NEW.status IS DISTINCT FROM OLD.status) THEN
    IF NOT (
      public.is_super_admin(auth.uid()) OR 
      public.has_permission(auth.uid(), 'users.deactivate') OR 
      public.has_permission(auth.uid(), 'users.update') OR 
      public.has_permission(auth.uid(), 'users.manage')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can modify account status.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER check_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_profile_privilege_escalation();

-- 2. Update admin_reset_user_password with proper permission check and Super Admin protection
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  p_target_id UUID,
  p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
BEGIN
  -- Permission check: super_admin, users.reset_password, users.update, or users.manage
  IF NOT (
    public.is_super_admin(auth.uid()) OR 
    public.has_permission(auth.uid(), 'users.reset_password') OR 
    public.has_permission(auth.uid(), 'users.update') OR 
    public.has_permission(auth.uid(), 'users.manage')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires users.reset_password or users.update permission.';
  END IF;

  -- Security: Protect Super Admin accounts from non-super admin
  IF (SELECT (UPPER(role) IN ('SUPER', 'SUPERADMIN') OR LOWER(COALESCE((SELECT email FROM auth.users WHERE id = p_target_id), '')) = 'admin@stockflow.com') FROM public.profiles WHERE id = p_target_id)
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Permission Denied: Only Super Admin can reset password of Super Admin accounts.';
  END IF;

  IF p_new_password IS NULL OR length(trim(p_new_password)) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters.';
  END IF;

  UPDATE auth.users
  SET 
    encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
    updated_at = NOW()
  WHERE id = p_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found in auth.users.';
  END IF;

  UPDATE public.profiles
  SET 
    must_change_password = TRUE,
    updated_at = NOW()
  WHERE id = p_target_id;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'USER_PASSWORD_RESET',
    jsonb_build_object('target_user_id', p_target_id, 'timestamp', NOW())
  );

  RETURN jsonb_build_object('success', true, 'message', 'Password reset successfully.');
END;
$$;

-- 3. Update admin_toggle_user_status with proper permission check and protections
CREATE OR REPLACE FUNCTION public.admin_toggle_user_status(
  p_target_id UUID,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  -- Permission check: super_admin, users.deactivate, users.update, or users.manage
  IF NOT (
    public.is_super_admin(auth.uid()) OR 
    public.has_permission(auth.uid(), 'users.deactivate') OR 
    public.has_permission(auth.uid(), 'users.update') OR 
    public.has_permission(auth.uid(), 'users.manage')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires users.deactivate or users.update permission.';
  END IF;

  IF p_status NOT IN ('active', 'inactive', 'suspended') THEN
    RAISE EXCEPTION 'Invalid status. Allowed values: active, inactive, suspended.';
  END IF;

  -- Protect Super Admin
  IF (SELECT (UPPER(role) IN ('SUPER', 'SUPERADMIN') OR LOWER(COALESCE((SELECT email FROM auth.users WHERE id = p_target_id), '')) = 'admin@stockflow.com') FROM public.profiles WHERE id = p_target_id)
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Permission Denied: Only Super Admin can change status of Super Admin accounts.';
  END IF;

  -- Protect Last Admin
  IF p_status != 'active' AND (SELECT LOWER(role) = 'admin' FROM public.profiles WHERE id = p_target_id) THEN
    IF (SELECT COUNT(*) FROM public.profiles WHERE LOWER(role) = 'admin' AND status = 'active') <= 1 AND NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Security Protection: Cannot deactivate the last remaining active Administrator account.';
    END IF;
  END IF;

  UPDATE public.profiles
  SET 
    status = p_status,
    updated_at = NOW()
  WHERE id = p_target_id;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'USER_STATUS_TOGGLED',
    jsonb_build_object('target_user_id', p_target_id, 'new_status', p_status, 'timestamp', NOW())
  );

  RETURN jsonb_build_object('success', true, 'message', 'User status updated successfully.');
END;
$$;

-- 4. Cleanse legacy 'operator' role to 'staff' in public.profiles
ALTER TABLE public.profiles DISABLE TRIGGER check_profile_privilege_escalation;

UPDATE public.profiles
SET 
  role = 'staff',
  role_id = COALESCE(
    role_id, 
    (SELECT id FROM public.roles WHERE UPPER(code) = 'STAFF' LIMIT 1)
  ),
  updated_at = NOW()
WHERE LOWER(role) = 'operator';

ALTER TABLE public.profiles ENABLE TRIGGER check_profile_privilege_escalation;

COMMIT;
