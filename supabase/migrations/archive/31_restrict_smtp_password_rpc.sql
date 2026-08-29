-- SMTP credentials are server-only. This SECURITY DEFINER function must never
-- be executable by browser roles.
REVOKE ALL ON FUNCTION public.admin_get_smtp_password_internal() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_smtp_password_internal() FROM anon;
REVOKE ALL ON FUNCTION public.admin_get_smtp_password_internal() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_smtp_password_internal() TO service_role;
