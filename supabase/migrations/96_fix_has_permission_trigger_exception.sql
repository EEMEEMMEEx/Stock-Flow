-- =============================================================================
-- Migration 96: Fix has_permission() Exception Breaking Notification Triggers
-- =============================================================================
-- Problem:
--   Migration 86 added a check in public.has_permission(UUID, TEXT) that raised:
--     ERROR: Unauthorized: Cannot check permissions of other users.
--   whenever auth.uid() <> p_user_id and the caller was not an admin.
--
--   Because notification triggers (e.g. notify_checkout_submitted, notify_withdrawal_submitted,
--   notify_stock_in_submitted) query all active profiles to find recipient approvers:
--     SELECT ... FROM public.profiles pr
--     WHERE (public.has_permission(pr.id, 'checkouts.approve') OR public.is_checkout_delegate(pr.id))
--   whenever a regular staff member creates an order/requisition, the trigger evaluates
--   has_permission on other user IDs, raising the exception and aborting the entire transaction.
--
-- Solution:
--   Remove the exception check from public.has_permission(p_user_id, p_perm_code) and restore
--   pure boolean return (TRUE/FALSE). A predicate function used in WHERE clauses and triggers
--   must never raise an authorization exception on candidate rows.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.has_permission(
  p_user_id UUID,
  p_perm_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_role_code TEXT;
  v_role_id UUID;
  v_email TEXT;
BEGIN
  IF p_user_id IS NULL OR p_perm_code IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Lookup user status, role code, and role_id from public.profiles
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

  -- Lookup email safely from auth.users (public.profiles does not have email column)
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  -- Super Admin or master system admin bypass
  IF v_role_code = 'SUPER' OR LOWER(COALESCE(v_email, '')) = 'admin@stockflow.com' THEN
    RETURN TRUE;
  END IF;

  -- Check role_permissions table dynamically for all roles
  RETURN EXISTS (
    SELECT 1 
    FROM public.role_permissions rp
    JOIN public.permissions perm ON perm.id = rp.permission_id
    WHERE rp.role_id = v_role_id 
      AND perm.code = p_perm_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_permission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
