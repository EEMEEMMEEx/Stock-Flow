BEGIN;

-- Supabase can retain explicit grants for the anon role even after PUBLIC
-- privileges are revoked. Revoke that role explicitly and retain only the
-- authenticated grant required by the email backend.
REVOKE ALL ON FUNCTION public.admin_authorize_email_send() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_record_email_sent_audit(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_authorize_email_send() FROM anon;
REVOKE ALL ON FUNCTION public.admin_record_email_sent_audit(TEXT, TEXT, TEXT) FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_authorize_email_send() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_email_sent_audit(TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
