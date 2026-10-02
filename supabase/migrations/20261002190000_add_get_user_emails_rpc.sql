-- Migration: expose canonical user emails (auth.users) through a guarded RPC
-- ---------------------------------------------------------------------------
-- CONTEXT / ROOT CAUSE
--   public.profiles intentionally has NO email column — canonical login emails
--   live only in auth.users.email (documented in
--   archive/38_fix_admin_create_user_profiles_pkey_conflict.sql). Several
--   frontend queries still asked PostgREST for profiles.email, which fails with
--   HTTP 400 / SQLSTATE 42703 ("column profiles.email does not exist"):
--     - src/components/checkouts/CheckoutDetailModal.jsx (approver/creator profile)
--     - src/pages/Checkouts.jsx (creator profile enrichment)
--     - src/lib/notificationDispatcher.js (recipient email resolution, 4 sites
--       plus 2 embedded joins) -> the whole email notification flow aborted.
--
-- WHAT THIS MIGRATION DOES
--   Adds a single, authenticated-only, SECURITY DEFINER lookup so the client can
--   resolve emails from auth.users without exposing the auth schema and without
--   duplicating the email into public.profiles.
--
-- SECURITY NOTES
--   - SECURITY DEFINER with a pinned search_path, revoking PUBLIC/anon.
--   - Requires an authenticated caller (auth.uid() IS NOT NULL).
--   - Requires an explicit filter (p_user_ids or p_roles); no "dump everything".
--   - Only ACTIVE profiles with a non-empty auth email are returned.
--   - Trade-off: any authenticated user can resolve emails for the roles/user ids
--     they name. If that is too broad, move recipient resolution into
--     /api/send-email (which already holds the service role) and revoke this from
--     authenticated.

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
BEGIN
  IF auth.uid() IS NULL THEN
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

REVOKE ALL ON FUNCTION public.get_user_emails(UUID[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_emails(UUID[], TEXT[]) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
