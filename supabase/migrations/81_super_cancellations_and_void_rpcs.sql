-- =============================================================================
-- Migration 81: SUPER (System Administrator) Cancellations & Void RPCs
-- =============================================================================
-- Enables SUPER role to:
--   1. Cancel withdrawal requests at /withdrawals?tab=orders
--      (Auto stock reversal via Atomic Transaction if order was approved/completed)
--   2. Cancel checkout-return records at /checkouts?tab=history
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Schema Extensions for Cancellation Metadata
-- -----------------------------------------------------------------------------

-- Extend public.withdrawal_orders
ALTER TABLE public.withdrawal_orders
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Update status check constraint for withdrawal_orders to ensure 'cancelled' is allowed
ALTER TABLE public.withdrawal_orders
  DROP CONSTRAINT IF EXISTS withdrawal_orders_status_check;

ALTER TABLE public.withdrawal_orders
  ADD CONSTRAINT withdrawal_orders_status_check
  CHECK (status IN ('pending', 'approved', 'completed', 'rejected', 'cancelled'));

-- Extend public.checkout_orders
ALTER TABLE public.checkout_orders
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- -----------------------------------------------------------------------------
-- 2. RPC: super_cancel_withdrawal_order
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.super_cancel_withdrawal_order(
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
  v_order RECORD;
  v_item RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.is_super_admin(v_user_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires SUPER (System Administrator) role.';
  END IF;

  SELECT * INTO v_order
  FROM public.withdrawal_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found: %', p_order_id;
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Withdrawal request is already cancelled.';
  END IF;

  -- If request was already approved or completed, revert deducted stock
  IF v_order.status IN ('approved', 'completed') THEN
    FOR v_item IN
      SELECT wi.id,
             wi.item_id,
             COALESCE(wi.project_id, v_order.project_id) AS source_project_id,
             COALESCE(wi.storage_location_id, v_order.storage_location_id) AS source_storage_location_id,
             COALESCE(wi.deducted_quantity, wi.fulfilled_qty, wi.quantity) AS qty_to_revert
      FROM public.withdrawal_items wi
      WHERE wi.order_id = p_order_id
      ORDER BY wi.id
    LOOP
      IF v_item.qty_to_revert > 0 AND v_item.source_project_id IS NOT NULL THEN
        INSERT INTO public.stock_transactions (
          item_id,
          project_id,
          transaction_type,
          quantity,
          storage_location_id,
          created_by,
          reference_type,
          reference_id,
          notes
        ) VALUES (
          v_item.item_id,
          v_item.source_project_id,
          'RETURN',
          v_item.qty_to_revert,
          v_item.source_storage_location_id,
          v_user_id,
          'withdrawal_cancellation',
          p_order_id,
          COALESCE(p_reason, 'SUPER ยกเลิกใบเบิก Order #' || SUBSTRING(p_order_id::TEXT, 1, 8))
        );
      END IF;
    END LOOP;
  END IF;

  -- Update order status to cancelled
  UPDATE public.withdrawal_orders
  SET status = 'cancelled',
      cancelled_by = v_user_id,
      cancelled_at = NOW(),
      cancellation_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_order_id;

  -- Log to audit_logs
  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    v_user_id,
    'WITHDRAWAL_CANCELLED_BY_SUPER',
    jsonb_build_object(
      'order_id', p_order_id,
      'reason', p_reason,
      'previous_status', v_order.status,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'cancelled',
    'message', 'ยกเลิกรายการขอเบิกสำเร็จ'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. RPC: super_cancel_checkout_order
-- -----------------------------------------------------------------------------

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
  v_unreturned NUMERIC;
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

  -- Revert unreturned quantities if checkout was active/approved
  IF v_checkout.status IN ('active', 'approved', 'overdue') THEN
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
      WHERE ci.order_id = p_order_id
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

  -- Mark checkout items as cancelled if pending or active
  UPDATE public.checkout_items
  SET status = 'rejected'
  WHERE order_id = p_order_id AND status IN ('pending', 'borrowed');

  -- Update checkout_orders status to cancelled
  UPDATE public.checkout_orders
  SET status = 'cancelled',
      cancelled_by = v_user_id,
      cancelled_at = NOW(),
      cancellation_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_order_id;

  -- Log to audit_logs
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

-- -----------------------------------------------------------------------------
-- 4. Permissions & Grants
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.super_cancel_withdrawal_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_cancel_withdrawal_order(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.super_cancel_checkout_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_cancel_checkout_order(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
