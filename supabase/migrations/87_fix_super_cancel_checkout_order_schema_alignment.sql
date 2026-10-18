-- =============================================================================
-- Migration 87: Fix super_cancel_checkout_order schema alignment
-- =============================================================================
-- Resolves Postgres error 42703 (undefined_column "order_id") by aligning
-- foreign key column checkout_items.checkout_order_id and ensuring updated_at
-- exists on public.checkout_orders.
-- =============================================================================

BEGIN;

-- 1. Ensure updated_at column exists on checkout_orders for audit completeness
ALTER TABLE public.checkout_orders
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Corrected super_cancel_checkout_order RPC
CREATE OR REPLACE FUNCTION public.super_cancel_checkout_order(
  p_order_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_checkout RECORD;
  v_ci RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.is_super_admin(v_user_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires SUPER (System Administrator) role.';
  END IF;

  SELECT * INTO v_checkout
  FROM public.checkout_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout order not found: %', p_order_id;
  END IF;

  IF v_checkout.status = 'cancelled' THEN
    RAISE EXCEPTION 'Checkout order is already cancelled.';
  END IF;

  -- Revert unreturned quantities if checkout was active/approved/overdue/partial_returned
  IF v_checkout.status IN ('active', 'approved', 'overdue', 'partial_returned') THEN
    FOR v_ci IN
      SELECT ci.id,
             ci.item_id,
             COALESCE(ci.quantity_borrowed, 0) - (
               COALESCE(ci.quantity_returned, 0) +
               COALESCE(ci.quantity_consumed, 0) +
               COALESCE(ci.quantity_damaged, 0) +
               COALESCE(ci.quantity_lost, 0)
             ) AS unreturned_qty
      FROM public.checkout_items ci
      WHERE ci.checkout_order_id = p_order_id
      ORDER BY ci.id
    LOOP
      IF v_ci.unreturned_qty > 0 AND v_checkout.project_id IS NOT NULL THEN
        INSERT INTO public.stock_transactions (
          item_id,
          project_id,
          transaction_type,
          quantity,
          created_by,
          reference_type,
          reference_id,
          notes
        ) VALUES (
          v_ci.item_id,
          v_checkout.project_id,
          'RETURN',
          v_ci.unreturned_qty,
          v_user_id,
          'checkout_cancellation',
          p_order_id,
          COALESCE(p_reason, 'SUPER ยกเลิกรายการยืม #' || COALESCE(v_checkout.order_number, SUBSTRING(p_order_id::TEXT, 1, 8)))
        );
      END IF;
    END LOOP;
  END IF;

  -- Mark pending or borrowed checkout items as rejected
  UPDATE public.checkout_items
  SET status = 'rejected'
  WHERE checkout_order_id = p_order_id AND status IN ('pending', 'borrowed');

  -- Update checkout_orders status to cancelled
  UPDATE public.checkout_orders
  SET status = 'cancelled',
      cancelled_by = v_user_id,
      cancelled_at = NOW(),
      cancellation_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_order_id;

  -- Log action to audit_logs
  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    v_user_id,
    'CHECKOUT_CANCELLED_BY_SUPER',
    jsonb_build_object(
      'order_id', p_order_id,
      'order_number', v_checkout.order_number,
      'reason', p_reason,
      'previous_status', v_checkout.status,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'cancelled',
    'message', 'ยกเลิกรายการยืม-คืนสำเร็จ'
  );
END;
$$;

-- 3. Security, Grants & Schema Cache Reload
REVOKE ALL ON FUNCTION public.super_cancel_checkout_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_cancel_checkout_order(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
