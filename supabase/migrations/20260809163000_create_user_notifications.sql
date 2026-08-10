-- In-app notifications for StockFlow workflow events.
-- Each recipient owns a separate row, allowing a simple and strict RLS policy.

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  target_path TEXT,
  reference_id UUID REFERENCES public.withdrawal_orders(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_event_reference
  ON public.notifications (user_id, event_type, reference_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notifications FROM anon;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;

DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can mark own notifications as read" ON public.notifications;
CREATE POLICY "Users can mark own notifications as read"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

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

DROP TRIGGER IF EXISTS trg_withdrawal_notifications ON public.withdrawal_orders;
CREATE TRIGGER trg_withdrawal_notifications
  AFTER UPDATE OF status ON public.withdrawal_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.create_withdrawal_notifications();

CREATE OR REPLACE FUNCTION public.create_withdrawal_submitted_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_requester_name TEXT;
  v_item_count INTEGER;
BEGIN
  FOR v_order IN
    SELECT o.id, o.project_id, o.requested_by, p.name AS project_name, p.project_code
    FROM public.withdrawal_orders o
    JOIN (SELECT DISTINCT order_id FROM inserted_items) i ON i.order_id = o.id
    LEFT JOIN public.projects p ON p.id = o.project_id
    WHERE o.status = 'pending'
  LOOP
    SELECT COALESCE(full_name, 'ผู้ขอเบิก')
      INTO v_requester_name
    FROM public.profiles
    WHERE id = v_order.requested_by;

    SELECT COUNT(*)
      INTO v_item_count
    FROM public.withdrawal_items
    WHERE order_id = v_order.id;

    INSERT INTO public.notifications (
      user_id, event_type, title, message, target_path, reference_id, project_id, metadata
    )
    SELECT
      p.id,
      'withdrawal.submitted',
      'คำขอเบิกใหม่',
      v_requester_name || ' ส่งคำขอเบิก WO-' || UPPER(LEFT(v_order.id::TEXT, 8)) || ' จำนวน ' || v_item_count || ' รายการ',
      '/withdrawals',
      v_order.id,
      v_order.project_id,
      jsonb_build_object('request_no', 'WO-' || UPPER(LEFT(v_order.id::TEXT, 8)), 'project_name', COALESCE(v_order.project_name, ''), 'project_code', COALESCE(v_order.project_code, ''), 'item_count', v_item_count)
    FROM public.profiles p
    WHERE p.status = 'active'
      AND p.id <> v_order.requested_by
      AND public.has_permission(p.id, 'withdrawals.approve')
    ON CONFLICT (user_id, event_type, reference_id) DO UPDATE SET
      message = EXCLUDED.message,
      metadata = EXCLUDED.metadata,
      created_at = EXCLUDED.created_at,
      read_at = NULL;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.create_withdrawal_submitted_notifications() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_withdrawal_submitted_notifications ON public.withdrawal_items;
CREATE TRIGGER trg_withdrawal_submitted_notifications
  AFTER INSERT ON public.withdrawal_items
  REFERENCING NEW TABLE AS inserted_items
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.create_withdrawal_submitted_notifications();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END;
$$;
