-- Migration 105: Web Push Notification Subscriptions & Dispatch Tracking
-- ---------------------------------------------------------------------------
-- 1. Creates public.push_subscriptions with strict per-user RLS.
-- 2. Adds push_dispatched_at column & partial pending-dispatch index to public.notifications.
-- 3. Updates public.push_notifications() so upserted notifications reset push_dispatched_at = NULL.
-- 4. Adds SECURITY DEFINER RPCs upsert_push_subscription() and remove_push_subscription().

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Push subscriptions table, indexes, RLS, and grants
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  device_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
  ON public.push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_active
  ON public.push_subscriptions (user_id)
  WHERE is_active = true;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

DROP POLICY IF EXISTS "Users can read own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can read own push subscriptions"
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can insert own push subscriptions"
  ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can update own push subscriptions"
  ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can delete own push subscriptions"
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Dispatch tracking on public.notifications
-- ---------------------------------------------------------------------------

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_dispatched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_pending_push
  ON public.notifications (created_at DESC)
  WHERE push_dispatched_at IS NULL AND read_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Update push_notifications() to reset push_dispatched_at on conflict update
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

  -- Notifications are a side effect: failures must not abort the business transaction.
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
      read_at = NULL,
      push_dispatched_at = NULL;

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

REVOKE ALL ON FUNCTION public.push_notifications(UUID[], TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_notifications(UUID[], TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Subscription management RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_push_subscription(
  p_endpoint TEXT,
  p_p256dh TEXT,
  p_auth TEXT,
  p_user_agent TEXT DEFAULT NULL,
  p_device_label TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_endpoint TEXT := NULLIF(TRIM(p_endpoint), '');
  v_p256dh TEXT := NULLIF(TRIM(p_p256dh), '');
  v_auth TEXT := NULLIF(TRIM(p_auth), '');
  v_subscription_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  IF v_endpoint IS NULL OR v_p256dh IS NULL OR v_auth IS NULL THEN
    RAISE EXCEPTION 'Invalid push subscription: endpoint, p256dh, and auth are required';
  END IF;

  INSERT INTO public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    device_label,
    is_active,
    updated_at
  )
  VALUES (
    v_user_id,
    v_endpoint,
    v_p256dh,
    v_auth,
    NULLIF(TRIM(p_user_agent), ''),
    NULLIF(TRIM(p_device_label), ''),
    true,
    NOW()
  )
  ON CONFLICT (endpoint) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    user_agent = COALESCE(EXCLUDED.user_agent, public.push_subscriptions.user_agent),
    device_label = COALESCE(EXCLUDED.device_label, public.push_subscriptions.device_label),
    is_active = true,
    updated_at = NOW()
  RETURNING id INTO v_subscription_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_subscription_id,
    'endpoint', v_endpoint
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_push_subscription(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_push_subscription(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_push_subscription(
  p_endpoint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_endpoint TEXT := NULLIF(TRIM(p_endpoint), '');
  v_deleted INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  IF v_endpoint IS NULL THEN
    RAISE EXCEPTION 'Invalid push subscription: endpoint is required';
  END IF;

  DELETE FROM public.push_subscriptions
  WHERE user_id = v_user_id
    AND endpoint = v_endpoint;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deleted', v_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_push_subscription(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_push_subscription(TEXT) TO authenticated;

DO $$
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    INSERT INTO supabase_migrations.schema_migrations(version)
    VALUES ('105')
    ON CONFLICT (version) DO NOTHING;
  END IF;
END;
$$;

COMMIT;
