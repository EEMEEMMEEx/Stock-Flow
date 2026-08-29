-- Fix trigger function create_withdrawal_notifications() column "v_item_count" does not exist error
-- Declare v_item_count INTEGER and count withdrawal_items before jsonb_build_object construction

CREATE OR REPLACE FUNCTION public.create_withdrawal_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_no TEXT := 'WO-' || UPPER(LEFT(NEW.id::TEXT, 8));
  v_project_name TEXT := '';
  v_project_code TEXT := '';
  v_event_type TEXT;
  v_title TEXT;
  v_message TEXT;
  v_item_count INTEGER := 0;
BEGIN
  SELECT COALESCE(name, ''), COALESCE(project_code, '')
    INTO v_project_name, v_project_code
  FROM public.projects
  WHERE id = NEW.project_id;

  SELECT COUNT(*)
    INTO v_item_count
  FROM public.withdrawal_items
  WHERE order_id = NEW.id;

  IF OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.requested_by IS NULL THEN
    RETURN NEW;
  END IF;

  CASE NEW.status
    WHEN 'approved' THEN
      v_event_type := 'withdrawal.approved';
      v_title := 'คำขอเบิกได้รับการอนุมัติ';
      v_message := 'คำขอ ' || v_request_no || ' สำหรับโครงการ ' || COALESCE(NULLIF(v_project_name, ''), '-') || ' กำลังรอจ่ายวัสดุ';
    WHEN 'rejected' THEN
      v_event_type := 'withdrawal.rejected';
      v_title := 'คำขอเบิกไม่ได้รับการอนุมัติ';
      v_message := 'คำขอ ' || v_request_no || ' ถูกปฏิเสธ' || CASE WHEN COALESCE(NEW.reject_reason, '') <> '' THEN ': ' || NEW.reject_reason ELSE '' END;
    WHEN 'completed' THEN
      v_event_type := 'withdrawal.completed';
      v_title := 'จ่ายวัสดุเรียบร้อยแล้ว';
      v_message := 'คำขอ ' || v_request_no || ' สำหรับโครงการ ' || COALESCE(NULLIF(v_project_name, ''), '-') || ' ได้รับการจ่ายวัสดุแล้ว';
    ELSE
      RETURN NEW;
  END CASE;

  INSERT INTO public.notifications (
    user_id, event_type, title, message, target_path, reference_id, project_id, metadata
  ) VALUES (
    NEW.requested_by,
    v_event_type,
    v_title,
    v_message,
    '/withdrawals',
    NEW.id,
    NEW.project_id,
    jsonb_build_object('request_no', v_request_no, 'project_name', v_project_name, 'project_code', v_project_code, 'item_count', v_item_count)
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_withdrawal_notifications() FROM PUBLIC;
