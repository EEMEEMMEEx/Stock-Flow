-- Migration: allow the scheduled checkout cron to resolve user emails
-- ---------------------------------------------------------------------------
-- CONTEXT / ROOT CAUSE
--   api/checkouts-cron.js runs on Vercel Cron with no end-user JWT, so the call
--   carries auth.role() = 'service_role' and auth.uid() = NULL. The existing
--   public.get_user_emails() rejects every such call with
--   'Unauthorized: User is not authenticated.' — the due-soon / overdue
--   reminders could therefore never resolve a borrower email address.
--
-- WHAT THIS MIGRATION DOES
--   Replaces public.get_user_emails() with the same read logic, but accepts the
--   documented background-job caller (`auth.role() = 'service_role'`) in
--   addition to an authenticated user. This mirrors the precedent already used
--   in 75_fix_rbac_privilege_escalation_and_role_assignment.sql.
--
-- SECURITY
--   - SECURITY DEFINER with pinned search_path; PUBLIC/anon still revoked.
--   - EXECUTE stays granted to `authenticated` (the client notification
--     dispatcher depends on it) and is added for service_role. The difference
--     is only that a service-role caller no longer needs auth.uid().
--   - Still requires an explicit p_user_ids / p_roles filter: no bulk dump.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_user_emails(
  p_user_ids UUID[] DEFAULT NULL,
  p_roles TEXT[] DEFAULT NULL
)
RETURNS TABLE (user_id UUID, email TEXT, role TEXT, full_name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_roles TEXT[];
  -- Two independent, service-role-only signals are accepted: whether PostgREST
  -- exposes the role through the JWT claim (auth.role()) or through the
  -- database role. `authenticated` JWT sessions satisfy neither, so client
  -- callers keep the original "must be authenticated" behaviour.
  v_is_service_role BOOLEAN := (
    auth.role() = 'service_role'
    OR current_setting('role', true) = 'service_role'
  );
BEGIN
  IF NOT v_is_service_role AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF p_roles IS NOT NULL THEN
    SELECT array_agg(DISTINCT LOWER(BTRIM(r)))
      INTO v_roles
    FROM unnest(p_roles) AS r
    WHERE BTRIM(r) <> '';
  END IF;

  IF p_user_ids IS NULL AND v_roles IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุรายชื่อผู้ใช้หรือบทบาทที่ต้องการค้นหาอีเมล';
  END IF;

  RETURN QUERY
  SELECT p.id,
         u.email::TEXT,
         p.role,
         p.full_name
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.status = 'active'
    AND COALESCE(u.email, '') <> ''
    AND (
      (p_user_ids IS NOT NULL AND p.id = ANY(p_user_ids))
      OR (v_roles IS NOT NULL AND LOWER(COALESCE(p.role, '')) = ANY(v_roles))
    )
  ORDER BY p.full_name;
END;
$$;

-- Keep the original `authenticated` grant (src/lib/notificationDispatcher.js
-- depends on it) and add the service role used by api/checkouts-cron.js.
REVOKE ALL ON FUNCTION public.get_user_emails(UUID[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_emails(UUID[], TEXT[]) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
