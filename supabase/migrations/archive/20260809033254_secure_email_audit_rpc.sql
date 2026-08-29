BEGIN;

-- Keep audit_logs write-only from the browser. These RPCs validate the JWT
-- and RBAC permission before the backend sends an email or stores its audit event.
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

  IF NOT public.has_permission(auth.uid(), 'settings.update') THEN
    RAISE EXCEPTION 'Permission denied: Requires settings.update permission to send email.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_record_email_sent_audit(
  p_recipient TEXT,
  p_subject TEXT,
  p_message_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipient TEXT;
BEGIN
  PERFORM public.admin_authorize_email_send();

  v_recipient := LOWER(BTRIM(COALESCE(p_recipient, '')));
  IF v_recipient = '' OR LENGTH(v_recipient) > 320 THEN
    RAISE EXCEPTION 'A valid email recipient is required for audit logging.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'EMAIL_SENT',
    jsonb_build_object(
      'recipient', v_recipient,
      'subject', LEFT(COALESCE(p_subject, ''), 500),
      'message_id', NULLIF(BTRIM(COALESCE(p_message_id, '')), '')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_authorize_email_send() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_record_email_sent_audit(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_authorize_email_send() FROM anon;
REVOKE ALL ON FUNCTION public.admin_record_email_sent_audit(TEXT, TEXT, TEXT) FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_authorize_email_send() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_email_sent_audit(TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
