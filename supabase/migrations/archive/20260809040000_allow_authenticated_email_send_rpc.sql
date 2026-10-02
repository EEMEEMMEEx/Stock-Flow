BEGIN;

-- Update admin_authorize_email_send to allow any active authenticated user 
-- (STAFF, SUPERVISOR, ADMIN) to authorize transactional email notifications
-- for operational workflows (such as withdrawal submissions, approvals, rejections).

CREATE OR REPLACE FUNCTION public.admin_authorize_email_send()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to send email.' USING ERRCODE = '42501';
  END IF;

  -- Ensure caller account is active in profiles
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND (status = 'active' OR status IS NULL)
  ) THEN
    RAISE EXCEPTION 'Permission denied: Active user account required to send email.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_authorize_email_send() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_authorize_email_send() FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_authorize_email_send() TO authenticated;

COMMIT;
