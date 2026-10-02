-- Migration: Restore and extend in-app notification producers
-- ---------------------------------------------------------------------------
-- ROOT CAUSE CONTEXT (evidence-backed)
--   public.notifications has 7 rows, newest 2026-08-27. A withdrawal status
--   change on 2026-09-15 (rejected, requested_by NOT NULL) produced NO row,
--   and 41 stock_in orders / 31 checkout_orders produced none at all.
--   => The producer TRIGGERS are missing from the live database. Their DDL only
--      ever lived in supabase/migrations/archive/20260809163000_create_user_notifications.sql,
--      which is NOT part of the applied migration chain (baseline/ + 52..75 +
--      the timestamped migrations never create them), and the disaster-recovery
--      DDL in scripts/backup-full-database.mjs does not contain them either.
--
-- WHAT THIS MIGRATION DOES
--   1. Idempotently guarantees the notifications table, indexes, RLS and grants
--      exist (the table is missing from the applied chain entirely).
--   2. Recreates the withdrawal producers (submitted / approved / rejected / completed).
--   3. Adds the checkout producers (submitted / approved / rejected / completed / overdue).
--   4. Adds the stock-in producer (stock.received).
--   5. Ensures the table is in the supabase_realtime publication for live push.
--   6. Adds the missing DELETE policy/grant so the bell's delete button works.
--
-- All functions are SECURITY DEFINER with search_path pinned, matching the repo
-- convention for RPCs and triggers. No frontend contract changes.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Table, indexes, RLS, grants (self-sufficient + idempotent)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  target_path TEXT,
  reference_id UUID,
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

-- The dedupe index must be UNIQUE because push_notifications() uses ON CONFLICT.
-- If a non-unique index with this name already exists it is replaced.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'idx_notifications_user_event_reference'
      AND i.indisunique
  ) THEN
    DROP INDEX IF EXISTS public.idx_notifications_user_event_reference;
    CREATE UNIQUE INDEX idx_notifications_user_event_reference
      ON public.notifications (user_id, event_type, reference_id);
  END IF;
END;
$$;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notifications FROM anon;
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;

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

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Realtime publication (guarded: plain PostgreSQL has no supabase_realtime)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Shared writer: one fan-out helper so every producer behaves identically
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.push_notifications(
  p_user_ids UUID[],
  p_event_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_target_path TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Notifications are a side effect: a failure here must never abort the
  -- business transaction that fired the trigger (stock movement, approval...).
  -- Failures are surfaced as a greppable WARNING in the database log instead.
  BEGIN
    INSERT INTO public.notifications (
      user_id, event_type, title, message, target_path, reference_id, project_id, metadata
    )
    SELECT DISTINCT
      u.user_id,
      p_event_type,
      p_title,
      p_message,
      p_target_path,
      p_reference_id,
      p_project_id,
      COALESCE(p_metadata, '{}'::jsonb)
    FROM unnest(p_user_ids) AS u(user_id)
    JOIN public.profiles pr
      ON pr.id = u.user_id
     AND pr.status = 'active'
    ON CONFLICT (user_id, event_type, reference_id) DO UPDATE SET
      title = EXCLUDED.title,
      message = EXCLUDED.message,
      target_path = EXCLUDED.target_path,
      project_id = EXCLUDED.project_id,
      metadata = EXCLUDED.metadata,
      created_at = EXCLUDED.created_at,
      read_at = NULL;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[notifications] push_notifications skipped event % reference % -> SQLSTATE % / %',
        p_event_type, p_reference_id, SQLSTATE, SQLERRM;
      RETURN -1;
  END;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.push_notifications(UUID[], TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 3. Withdrawal producers (recreated)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_withdrawal_notifications ON public.withdrawal_orders;
DROP TRIGGER IF EXISTS trg_withdrawal_submitted_notifications ON public.withdrawal_items;
DROP FUNCTION IF EXISTS public.create_withdrawal_notifications() CASCADE;
DROP FUNCTION IF EXISTS public.create_withdrawal_submitted_notifications() CASCADE;

-- 3.1 New pending requisition -> notify every active approver except the requester
CREATE OR REPLACE FUNCTION public.notify_withdrawal_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_requester_name TEXT;
  v_item_count INTEGER;
  v_request_no TEXT;
  v_recipients UUID[];
BEGIN
  FOR v_order IN
    SELECT o.id, o.project_id, o.requested_by, o.work_order_no,
           p.name AS project_name, p.project_code
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

    v_request_no := COALESCE(NULLIF(BTRIM(v_order.work_order_no), ''), 'WO-' || UPPER(LEFT(v_order.id::TEXT, 8)));

    SELECT array_agg(pr.id)
      INTO v_recipients
    FROM public.profiles pr
    WHERE pr.status = 'active'
      AND (v_order.requested_by IS NULL OR pr.id <> v_order.requested_by)
      AND public.has_permission(pr.id, 'withdrawals.approve');

    PERFORM public.push_notifications(
      v_recipients,
      'withdrawal.submitted',
      'คำขอเบิกใหม่',
      COALESCE(v_requester_name, 'ผู้ขอเบิก') || ' ส่งคำขอเบิก ' || v_request_no || ' จำนวน ' || v_item_count || ' รายการ',
      '/withdrawals',
      v_order.id,
      v_order.project_id,
      jsonb_build_object(
        'request_no', v_request_no,
        'project_name', COALESCE(v_order.project_name, ''),
        'project_code', COALESCE(v_order.project_code, ''),
        'item_count', v_item_count
      )
    );
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_withdrawal_submitted() FROM PUBLIC, anon;

CREATE TRIGGER trg_withdrawal_submitted_notifications
  AFTER INSERT ON public.withdrawal_items
  REFERENCING NEW TABLE AS inserted_items
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.notify_withdrawal_submitted();

-- 3.2 Status transition -> notify the requester
CREATE OR REPLACE FUNCTION public.notify_withdrawal_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_project_name TEXT := '';
  v_request_no TEXT;
  v_event_type TEXT;
  v_title TEXT;
  v_message TEXT;
  v_item_count INTEGER := 0;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.requested_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(name, '')
    INTO v_project_name
  FROM public.projects
  WHERE id = NEW.project_id;

  SELECT COUNT(*)
    INTO v_item_count
  FROM public.withdrawal_items
  WHERE order_id = NEW.id;

  v_request_no := COALESCE(NULLIF(BTRIM(NEW.work_order_no), ''), 'WO-' || UPPER(LEFT(NEW.id::TEXT, 8)));

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

  PERFORM public.push_notifications(
    ARRAY[NEW.requested_by],
    v_event_type,
    v_title,
    v_message,
    '/withdrawals',
    NEW.id,
    NEW.project_id,
    jsonb_build_object(
      'request_no', v_request_no,
      'project_name', v_project_name,
      'item_count', v_item_count
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_withdrawal_status() FROM PUBLIC, anon;

CREATE TRIGGER trg_withdrawal_notifications
  AFTER UPDATE OF status ON public.withdrawal_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_withdrawal_status();

-- ---------------------------------------------------------------------------
-- 4. Checkout producers (new)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_checkout_submitted_notifications ON public.checkout_items;
DROP TRIGGER IF EXISTS trg_checkout_status_notifications ON public.checkout_orders;

-- 4.1 New pending requisition -> notify approvers / delegates (same rule as approve_checkout_order)
CREATE OR REPLACE FUNCTION public.notify_checkout_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_requester_id UUID;
  v_requester_name TEXT;
  v_item_count INTEGER;
  v_recipients UUID[];
BEGIN
  FOR v_order IN
    SELECT o.id, o.order_number, o.project_id, o.created_by, o.borrower_id, o.borrower_name,
           p.name AS project_name, p.project_code
    FROM public.checkout_orders o
    JOIN (SELECT DISTINCT checkout_order_id FROM inserted_items) i ON i.checkout_order_id = o.id
    LEFT JOIN public.projects p ON p.id = o.project_id
    WHERE o.status = 'pending'
  LOOP
    v_requester_id := COALESCE(v_order.created_by, v_order.borrower_id);

    SELECT COALESCE(full_name, 'ผู้ขอยืม')
      INTO v_requester_name
    FROM public.profiles
    WHERE id = v_requester_id;
    v_requester_name := COALESCE(v_requester_name, v_order.borrower_name, 'ผู้ขอยืม');

    SELECT COUNT(*)
      INTO v_item_count
    FROM public.checkout_items
    WHERE checkout_order_id = v_order.id;

    SELECT array_agg(pr.id)
      INTO v_recipients
    FROM public.profiles pr
    WHERE pr.status = 'active'
      AND (v_requester_id IS NULL OR pr.id <> v_requester_id)
      AND (public.has_permission(pr.id, 'checkouts.approve') OR public.is_checkout_delegate(pr.id));

    PERFORM public.push_notifications(
      v_recipients,
      'checkout.submitted',
      'คำขอยืมใหม่',
      v_requester_name || ' ส่งคำขอยืม ' || v_order.order_number || ' จำนวน ' || v_item_count || ' รายการ รอการอนุมัติ',
      '/checkouts',
      v_order.id,
      v_order.project_id,
      jsonb_build_object(
        'request_no', v_order.order_number,
        'project_name', COALESCE(v_order.project_name, ''),
        'project_code', COALESCE(v_order.project_code, ''),
        'item_count', v_item_count
      )
    );
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_checkout_submitted() FROM PUBLIC, anon;

CREATE TRIGGER trg_checkout_submitted_notifications
  AFTER INSERT ON public.checkout_items
  REFERENCING NEW TABLE AS inserted_items
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.notify_checkout_submitted();

-- 4.2 Status transition -> notify the requester and the borrower
CREATE OR REPLACE FUNCTION public.notify_checkout_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_event_type TEXT;
  v_title TEXT;
  v_message TEXT;
  v_item_count INTEGER := 0;
  v_recipients UUID[];
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
    INTO v_item_count
  FROM public.checkout_items
  WHERE checkout_order_id = NEW.id;

  IF NEW.status = 'active' AND OLD.status = 'pending' THEN
    v_event_type := 'checkout.approved';
    v_title := 'คำขอยืมได้รับการอนุมัติ';
    v_message := 'คำขอยืม ' || NEW.order_number || ' ได้รับการอนุมัติและจ่ายพัสดุแล้ว';
  ELSIF NEW.status = 'rejected' THEN
    v_event_type := 'checkout.rejected';
    v_title := 'คำขอยืมไม่ได้รับการอนุมัติ';
    v_message := 'คำขอยืม ' || NEW.order_number || ' ถูกปฏิเสธ' || CASE WHEN COALESCE(NEW.rejection_reason, '') <> '' THEN ': ' || NEW.rejection_reason ELSE '' END;
  ELSIF NEW.status = 'completed' THEN
    v_event_type := 'checkout.completed';
    v_title := 'คืนพัสดุครบถ้วนแล้ว';
    v_message := 'คำขอยืม ' || NEW.order_number || ' ได้รับการคืนพัสดุครบถ้วนแล้ว';
  ELSIF NEW.status = 'overdue' THEN
    v_event_type := 'checkout.overdue';
    v_title := 'คำขอยืมเกินกำหนดส่งคืน';
    v_message := 'คำขอยืม ' || NEW.order_number || ' เกินกำหนดส่งคืนแล้ว กรุณาดำเนินการรับคืนพัสดุ';
  ELSE
    RETURN NEW;
  END IF;

  SELECT array_agg(DISTINCT u.user_id)
    INTO v_recipients
  FROM unnest(ARRAY[NEW.created_by, NEW.borrower_id]) AS u(user_id)
  WHERE u.user_id IS NOT NULL;

  PERFORM public.push_notifications(
    v_recipients,
    v_event_type,
    v_title,
    v_message,
    '/checkouts',
    NEW.id,
    NEW.project_id,
    jsonb_build_object('request_no', NEW.order_number, 'item_count', v_item_count)
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_checkout_status() FROM PUBLIC, anon;

CREATE TRIGGER trg_checkout_status_notifications
  AFTER UPDATE OF status ON public.checkout_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_checkout_status();

-- ---------------------------------------------------------------------------
-- 5. Stock-in producer (new): notify inventory managers, except the receiver
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_stock_in_notifications ON public.stock_in_items;

CREATE OR REPLACE FUNCTION public.notify_stock_in_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_item_count INTEGER;
  v_total_qty INTEGER;
  v_recipients UUID[];
BEGIN
  FOR v_order IN
    SELECT o.id, o.project_id, o.created_by, o.supplier,
           p.name AS project_name, p.project_code
    FROM public.stock_in_orders o
    JOIN (SELECT DISTINCT order_id FROM inserted_items) i ON i.order_id = o.id
    LEFT JOIN public.projects p ON p.id = o.project_id
  LOOP
    SELECT COUNT(*), COALESCE(SUM(quantity), 0)
      INTO v_item_count, v_total_qty
    FROM public.stock_in_items
    WHERE order_id = v_order.id;

    SELECT array_agg(pr.id)
      INTO v_recipients
    FROM public.profiles pr
    WHERE pr.status = 'active'
      AND (v_order.created_by IS NULL OR pr.id <> v_order.created_by)
      AND (public.has_permission(pr.id, 'inventory.manage') OR public.has_permission(pr.id, 'stock_in.create'));

    PERFORM public.push_notifications(
      v_recipients,
      'stock.received',
      'รับพัสดุเข้าคลัง',
      'รับพัสดุ ' || v_item_count || ' รายการ (รวม ' || v_total_qty || ' ชิ้น) เข้าโครงการ ' || COALESCE(NULLIF(v_order.project_name, ''), '-'),
      '/stock-in',
      v_order.id,
      v_order.project_id,
      jsonb_build_object(
        'item_count', v_item_count,
        'total_qty', v_total_qty,
        'project_name', COALESCE(v_order.project_name, ''),
        'project_code', COALESCE(v_order.project_code, ''),
        'supplier', COALESCE(v_order.supplier, '')
      )
    );
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_stock_in_received() FROM PUBLIC, anon;

CREATE TRIGGER trg_stock_in_notifications
  AFTER INSERT ON public.stock_in_items
  REFERENCING NEW TABLE AS inserted_items
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.notify_stock_in_received();

COMMIT;

NOTIFY pgrst, 'reload schema';
