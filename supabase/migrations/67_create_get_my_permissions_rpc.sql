-- ==============================================================================
-- Migration 67: Create get_my_permissions RPC Alias Function
-- Description: Provides public.get_my_permissions() RPC matching get_user_permissions(auth.uid())
--              to resolve PostgREST 404 Not Found while supporting seamless backward-compatible
--              client permission fetching.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE (permission_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT p.permission_code
  FROM public.get_user_permissions(auth.uid()) p;
END;
$$;

-- Grant execution to authenticated, anon, and service_role
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated, anon, service_role;
