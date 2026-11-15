-- Migration 106: Self-Service Cancel Pending Checkout Requisition RPC
-- ---------------------------------------------------------------------------
-- 1. Idempotently ensures cancellation and updated_at tracking columns exist
--    on public.checkout_orders.
-- 2. Adds SECURITY DEFINER RPC public.cancel_pending_checkout_order(UUID, TEXT)
--    allowing ONLY the request owner (created_by or borrower_id) to cancel a
--    requisition while its status is still 'pending' (before approval/stock
--    deduction), using FOR UPDATE row locking and atomic audit logging.
-- ---------------------------------------------------------------------------

BEGIN;

-- 1. Idempotent schema alignment on public.checkout_orders
ALTER TABLE public.checkout_orders
  ADD COLUMN IF NOT EXISTS cancelled_by UUID,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Atomic RPC: cancel_pending_checkout_order
CREATE OR REPLACE FUNCTION public.cancel_pending_checkout_order(
  p_order_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_order RECORD;
  v_clean_reason TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required.';
  END IF;

  -- Row-level lock to serialize against concurrent approval, rejection, or cancellation
  SELECT *
  INTO v_order
  FROM public.checkout_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout order not found: %', p_order_id;
  END IF;

  -- COALESCE avoids SQL 3-valued NULL when either created_by or borrower_id is NULL
  IF NOT COALESCE(v_order.created_by = v_caller_id OR v_order.borrower_id = v_caller_id, FALSE) THEN
    RAISE EXCEPTION 'Unauthorized: Only the request owner can cancel this requisition.';
  END IF;

  IF v_order.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Cannot cancel requisition: current status is % (must be pending).', v_order.status;
  END IF;

  v_clean_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

  -- checkout_items_status_check permits pending/borrowed/returned/damaged/lost/rejected
  UPDATE public.checkout_items
  SET status = 'rejected'
  WHERE checkout_order_id = p_order_id
    AND status = 'pending';

  UPDATE public.checkout_orders
  SET status = 'cancelled',
      cancelled_by = v_caller_id,
      cancelled_at = v_now,
      cancellation_reason = v_clean_reason,
      updated_at = v_now
  WHERE id = p_order_id;

  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    INSERT INTO public.audit_logs (actor_id, action, details)
    VALUES (
      v_caller_id,
      'CHECKOUT_CANCELLED_BY_REQUESTER',
      jsonb_build_object(
        'order_id', p_order_id,
        'order_number', v_order.order_number,
        'previous_status', v_order.status,
        'reason', v_clean_reason,
        'timestamp', v_now
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'status', 'cancelled',
    'cancelled_by', v_caller_id,
    'cancelled_at', v_now,
    'message', 'ยกเลิกคำขอยืม ' || COALESCE(v_order.order_number, '') || ' เรียบร้อยแล้ว'
  );
END;
$$;

-- 3. Principle of Least Privilege: restrict execution to authenticated & service_role
REVOKE ALL ON FUNCTION public.cancel_pending_checkout_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_pending_checkout_order(UUID, TEXT) TO authenticated, service_role;

-- 4. Track migration version when schema_migrations table is present
DO $$
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    INSERT INTO supabase_migrations.schema_migrations(version)
    VALUES ('106')
    ON CONFLICT (version) DO NOTHING;
  END IF;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
