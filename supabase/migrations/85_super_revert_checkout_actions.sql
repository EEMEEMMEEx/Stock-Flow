-- =============================================================================
-- Migration 85: SUPER revert — remaining checkout actions + S/N re-loan guard
-- =============================================================================
-- Forward-only completion of the SUPER revert feature (docs/ระบบย้อนกลับสถานะ
-- การยืม-คืนพัสดุ (SUPER Revert  Undo on checkoutstab=history & roles.md).
-- Migrations 83/84 already shipped the withdrawal revert, checkout approval
-- revert and the single-return revert. This migration adds the missing pieces:
--
--   1. scrap_disposal_items revert flags (repair resolution revert keeps history)
--   2. super_revert_checkout_return  — adds the EQUIPMENT_ALREADY_RELOANED guard
--      on top of the migration 84 definition (S/N already re-loaned elsewhere)
--   3. super_revert_checkout_order_returns — one-click revert of every return
--   4. super_revert_checkout_rejection     — rejected -> pending
--   5. super_revert_damaged_repair         — repair resolution -> unresolved
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE + GRANT.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Repair-resolution revert flags (row is kept, only flagged)
-- -----------------------------------------------------------------------------
ALTER TABLE public.scrap_disposal_items
  ADD COLUMN IF NOT EXISTS is_reverted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reverted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revert_reason TEXT;

-- -----------------------------------------------------------------------------
-- 2. super_revert_checkout_return (migration 84 definition + S/N guard)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.super_revert_checkout_return(
  p_return_log_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_log RECORD;
  v_order RECORD;
  v_item RECORD;
  v_previous_order_status TEXT;
  v_new_order_status TEXT;
  v_destination_project_id UUID;
  v_available NUMERIC;
  v_qty NUMERIC;
  v_new_returned NUMERIC;
  v_new_damaged NUMERIC;
  v_new_lost NUMERIC;
  v_new_consumed NUMERIC;
  v_total_accounted NUMERIC;
BEGIN
  v_user_id := public.assert_super_revert_authorized(p_reason);

  SELECT * INTO v_log
  FROM public.checkout_return_logs
  WHERE id = p_return_log_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Return log not found: %', p_return_log_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order
  FROM public.checkout_orders
  WHERE id = v_log.checkout_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Checkout order for this return no longer exists: %', v_log.checkout_order_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status NOT IN ('active', 'partial_returned', 'completed', 'overdue') THEN
    RAISE EXCEPTION 'INVALID_STATE: Returns on a % loan cannot be reverted.', v_order.status
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_item
  FROM public.checkout_items
  WHERE id = v_log.checkout_item_id
  FOR UPDATE;

  SELECT * INTO v_log
  FROM public.checkout_return_logs
  WHERE id = p_return_log_id
  FOR UPDATE;

  IF v_log.is_reverted THEN
    RAISE EXCEPTION 'INVALID_STATE: This return record has already been reverted.'
      USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(v_log.repair_resolution_status, 'unresolved') <> 'unresolved' THEN
    RAISE EXCEPTION 'CASCADE_BLOCKED: This damaged item already has a repair resolution; revert the repair resolution first.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_log.caim_inbound_processed_at IS NOT NULL
     OR v_log.caim_stock_in_order_id IS NOT NULL
     OR v_log.caim_scrap_disposal_id IS NOT NULL THEN
    RAISE EXCEPTION 'CASCADE_BLOCKED: This return was already processed by the CAIM claim workflow.'
      USING ERRCODE = 'P0001';
  END IF;
  -- Guard: the same serial number must not already be on loan again in another
  -- live order, otherwise the physical unit cannot be "un-returned".
  IF COALESCE(v_item.serial_number, '') <> '' THEN
    IF EXISTS (
      SELECT 1
      FROM public.checkout_items other_ci
      JOIN public.checkout_orders other_co ON other_co.id = other_ci.checkout_order_id
      WHERE other_ci.serial_number = v_item.serial_number
        AND other_ci.checkout_order_id <> v_item.checkout_order_id
        AND other_co.status IN ('active', 'overdue', 'partial_returned')
        AND (COALESCE(other_ci.quantity_borrowed, 0)
             - COALESCE(other_ci.quantity_returned, 0)
             - COALESCE(other_ci.quantity_damaged, 0)
             - COALESCE(other_ci.quantity_lost, 0)
             - COALESCE(other_ci.quantity_consumed, 0)) > 0
    ) THEN
      RAISE EXCEPTION 'EQUIPMENT_ALREADY_RELOANED: Serial % is already on loan in another active order.', v_item.serial_number
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'INVALID_STATE: Checkout line for this return no longer exists.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1
  FROM public.items i
  WHERE i.id = v_item.item_id
  FOR UPDATE;

  v_qty := COALESCE(v_log.returned_quantity, 0);
  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'INVALID_STATE: Return quantity must be greater than zero.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Counter/ledger mismatch: refuse instead of silently clamping to zero.
  IF v_log.item_condition = 'normal' AND COALESCE(v_item.quantity_returned, 0) < v_qty THEN
    RAISE EXCEPTION 'INVALID_STATE: Return counter mismatch for this line (returned %, log %).', COALESCE(v_item.quantity_returned, 0), v_qty
      USING ERRCODE = 'P0001';
  ELSIF v_log.item_condition IN ('damaged', 'needs_repair') AND COALESCE(v_item.quantity_damaged, 0) < v_qty THEN
    RAISE EXCEPTION 'INVALID_STATE: Damaged counter mismatch for this line (damaged %, log %).', COALESCE(v_item.quantity_damaged, 0), v_qty
      USING ERRCODE = 'P0001';
  ELSIF v_log.item_condition = 'lost' AND COALESCE(v_item.quantity_lost, 0) < v_qty THEN
    RAISE EXCEPTION 'INVALID_STATE: Lost counter mismatch for this line (lost %, log %).', COALESCE(v_item.quantity_lost, 0), v_qty
      USING ERRCODE = 'P0001';
  ELSIF v_log.item_condition = 'consumed' AND COALESCE(v_item.quantity_consumed, 0) < v_qty THEN
    RAISE EXCEPTION 'INVALID_STATE: Consumed counter mismatch for this line (consumed %, log %).', COALESCE(v_item.quantity_consumed, 0), v_qty
      USING ERRCODE = 'P0001';
  END IF;

  v_destination_project_id := COALESCE(v_log.destination_project_id, v_order.project_id);

  IF v_log.item_condition = 'normal' THEN
    IF v_destination_project_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_STATE: Cannot determine the destination warehouse for this return.'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT balance INTO v_available
    FROM public.stock_balance
    WHERE project_id = v_destination_project_id
      AND item_id = v_item.item_id;

    IF COALESCE(v_available, 0) < v_qty THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: Not enough stock to revert this return (available: %, required: %)',
        COALESCE(v_available, 0), v_qty
        USING ERRCODE = 'P0001';
    END IF;

    -- A cross-project return originally created a stock_in order + item. The
    -- opposite ledger entry keeps that receive history immutable while removing
    -- the credited balance from the destination warehouse.
    INSERT INTO public.stock_transactions (
      project_id, item_id, transaction_type, quantity,
      reference_id, reference_type, created_by, notes
    ) VALUES (
      v_destination_project_id,
      v_item.item_id,
      'OUT',
      v_qty::INTEGER,
      p_return_log_id,
      'checkout_return_revert',
      v_user_id,
      'SUPER ย้อนการรับคืนพัสดุ: ' || BTRIM(p_reason)
    );
  END IF;

  v_new_returned := COALESCE(v_item.quantity_returned, 0);
  v_new_damaged := COALESCE(v_item.quantity_damaged, 0);
  v_new_lost := COALESCE(v_item.quantity_lost, 0);
  v_new_consumed := COALESCE(v_item.quantity_consumed, 0);

  IF v_log.item_condition = 'normal' THEN
    v_new_returned := v_new_returned - v_qty;
  ELSIF v_log.item_condition IN ('damaged', 'needs_repair') THEN
    v_new_damaged := v_new_damaged - v_qty;
  ELSIF v_log.item_condition = 'lost' THEN
    v_new_lost := v_new_lost - v_qty;
  ELSIF v_log.item_condition = 'consumed' THEN
    v_new_consumed := v_new_consumed - v_qty;
  END IF;

  UPDATE public.checkout_items
  SET quantity_returned = v_new_returned,
      quantity_damaged = v_new_damaged,
      quantity_lost = v_new_lost,
      quantity_consumed = v_new_consumed,
      status = CASE
        WHEN (v_new_returned + v_new_damaged + v_new_lost + v_new_consumed) >= COALESCE(quantity_borrowed, 0)
          THEN 'returned'
        ELSE 'borrowed'
      END
  WHERE id = v_item.id;

  UPDATE public.checkout_return_logs
  SET is_reverted = TRUE,
      reverted_by = v_user_id,
      reverted_at = NOW(),
      revert_reason = BTRIM(p_reason)
  WHERE id = p_return_log_id;

  v_previous_order_status := v_order.status;

  SELECT COALESCE(SUM(
           COALESCE(quantity_returned, 0) + COALESCE(quantity_damaged, 0)
           + COALESCE(quantity_lost, 0) + COALESCE(quantity_consumed, 0)
         ), 0)
  INTO v_total_accounted
  FROM public.checkout_items
  WHERE checkout_order_id = v_order.id;

  v_new_order_status := CASE WHEN v_total_accounted > 0 THEN 'partial_returned' ELSE 'active' END;

  UPDATE public.checkout_orders
  SET status = v_new_order_status,
      actual_returned_date = NULL,
      last_reverted_by = v_user_id,
      last_reverted_at = NOW(),
      last_revert_reason = BTRIM(p_reason),
      last_revert_from_status = v_previous_order_status,
      last_revert_to_status = v_new_order_status
  WHERE id = v_order.id;

  PERFORM public.record_super_revert_audit(
    'CHECKOUT_RETURN_REVERT',
    'checkout_return_logs',
    p_return_log_id,
    v_previous_order_status,
    v_new_order_status,
    p_reason,
    jsonb_build_object(
      'checkout_order_id', v_order.id,
      'checkout_item_id', v_item.id,
      'item_condition', v_log.item_condition,
      'returned_quantity', v_qty,
      'destination_project_id', v_destination_project_id
    )
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'return_log_id', p_return_log_id,
    'order_id', v_order.id,
    'previous_status', v_previous_order_status,
    'new_status', v_new_order_status,
    'stock_reversed', (v_log.item_condition = 'normal'),
    'message', 'ย้อนการยืนยันรับคืนพัสดุสำเร็จ'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.super_revert_checkout_return(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_revert_checkout_return(UUID, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. super_revert_checkout_order_returns — revert every live return of a loan
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_revert_checkout_order_returns(
  p_order_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_order RECORD;
  v_log_id UUID;
  v_count INTEGER := 0;
  v_last JSONB;
BEGIN
  v_user_id := public.assert_super_revert_authorized(p_reason);

  SELECT * INTO v_order
  FROM public.checkout_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Checkout order not found: %', p_order_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status NOT IN ('completed', 'partial_returned', 'active', 'overdue') THEN
    RAISE EXCEPTION 'INVALID_STATE: Cannot revert returns for a loan in status %', v_order.status
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.checkout_return_logs
    WHERE checkout_order_id = p_order_id AND is_reverted = FALSE
  ) THEN
    RAISE EXCEPTION 'INVALID_STATE: This loan has no return records to revert.'
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_log_id IN
    SELECT id FROM public.checkout_return_logs
    WHERE checkout_order_id = p_order_id AND is_reverted = FALSE
    ORDER BY returned_at ASC, id ASC
  LOOP
    v_last := public.super_revert_checkout_return(v_log_id, p_reason);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'reverted_logs', v_count,
    'new_status', COALESCE(v_last->>'new_status', 'active'),
    'message', 'ย้อนการยืนยันรับคืนพัสดุทั้งหมดสำเร็จ'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. super_revert_checkout_rejection — rejected -> pending
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_revert_checkout_rejection(
  p_order_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_order RECORD;
BEGIN
  v_user_id := public.assert_super_revert_authorized(p_reason);

  SELECT * INTO v_order
  FROM public.checkout_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Checkout order not found: %', p_order_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status <> 'rejected' THEN
    RAISE EXCEPTION 'INVALID_STATE: Only rejected loans can be reverted to pending (current: %)', v_order.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.checkout_items
  SET status = 'pending'
  WHERE checkout_order_id = p_order_id;

  UPDATE public.checkout_orders
  SET status = 'pending',
      rejected_by = NULL,
      rejected_at = NULL,
      rejection_reason = NULL,
      last_reverted_by = v_user_id,
      last_reverted_at = NOW(),
      last_revert_reason = BTRIM(p_reason),
      last_revert_from_status = 'rejected',
      last_revert_to_status = 'pending'
  WHERE id = p_order_id;

  PERFORM public.record_super_revert_audit(
    'CHECKOUT_REJECT_REVERT',
    'checkout_orders',
    p_order_id,
    'rejected',
    'pending',
    p_reason,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'original_rejection_reason', v_order.rejection_reason
    )
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'previous_status', 'rejected',
    'new_status', 'pending',
    'message', 'ย้อนการปฏิเสธคำขอยืมสำเร็จ'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. super_revert_damaged_repair — repair resolution -> unresolved
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_revert_damaged_repair(
  p_return_log_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_log RECORD;
  v_tx RECORD;
  v_lock_ids UUID[];
BEGIN
  v_user_id := public.assert_super_revert_authorized(p_reason);

  SELECT * INTO v_log
  FROM public.checkout_return_logs
  WHERE id = p_return_log_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Return log not found: %', p_return_log_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_log.is_reverted THEN
    RAISE EXCEPTION 'INVALID_STATE: This return record has already been reverted.'
      USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(v_log.repair_resolution_status, 'unresolved') = 'unresolved' THEN
    RAISE EXCEPTION 'INVALID_STATE: This return has no repair resolution to revert.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_log.caim_inbound_processed_at IS NOT NULL
     OR v_log.caim_stock_in_order_id IS NOT NULL
     OR v_log.caim_scrap_disposal_id IS NOT NULL THEN
    RAISE EXCEPTION 'CASCADE_BLOCKED: This return was already processed by the CAIM claim workflow.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT array_agg(DISTINCT st.item_id ORDER BY st.item_id) INTO v_lock_ids
  FROM public.stock_transactions st
  WHERE st.reference_id = p_return_log_id
    AND st.reference_type IN ('repair_restored', 'repair_spare_part', 'parts_harvest');

  IF v_lock_ids IS NOT NULL THEN
    PERFORM 1 FROM public.items i
    WHERE i.id = ANY (v_lock_ids)
    ORDER BY i.id
    FOR UPDATE;
  END IF;

  FOR v_tx IN
    SELECT project_id, storage_location_id, item_id, quantity, reference_type
    FROM public.stock_transactions
    WHERE reference_id = p_return_log_id
      AND reference_type IN ('repair_restored', 'repair_spare_part', 'parts_harvest')
    ORDER BY id
  LOOP
    IF v_tx.reference_type = 'repair_spare_part' THEN
      INSERT INTO public.stock_transactions (
        project_id, storage_location_id, item_id, transaction_type, quantity,
        reference_id, reference_type, created_by, notes
      ) VALUES (
        v_tx.project_id, v_tx.storage_location_id, v_tx.item_id,
        'return_in', v_tx.quantity,
        p_return_log_id, 'repair_revert', v_user_id,
        'SUPER ย้อนผลการซ่อม: คืนอะไหล่ที่เคยตัด: ' || BTRIM(p_reason)
      );
    ELSE
      INSERT INTO public.stock_transactions (
        project_id, storage_location_id, item_id, transaction_type, quantity,
        reference_id, reference_type, created_by, notes
      ) VALUES (
        v_tx.project_id, v_tx.storage_location_id, v_tx.item_id,
        'stock_out', v_tx.quantity,
        p_return_log_id, 'repair_revert', v_user_id,
        'SUPER ย้อนผลการซ่อม: หักยอดที่เคยรับเข้า: ' || BTRIM(p_reason)
      );
    END IF;
  END LOOP;

  -- Legacy rows restored through a stock-in order without a ledger marker.
  IF v_log.restored_stock_in_order_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.stock_transactions
       WHERE reference_id = p_return_log_id
         AND reference_type = 'repair_restored'
     ) THEN
    INSERT INTO public.stock_transactions (
      project_id, item_id, transaction_type, quantity,
      reference_id, reference_type, created_by, notes
    )
    SELECT sio.project_id, sii.item_id, 'stock_out', sii.quantity,
           p_return_log_id, 'repair_restored', v_user_id,
           'SUPER ย้อนผลการซ่อม: หักยอดรับเข้าจากใบรับของ ' || sio.id::TEXT
    FROM public.stock_in_orders sio
    JOIN public.stock_in_items sii ON sii.order_id = sio.id
    WHERE sio.id = v_log.restored_stock_in_order_id;
  END IF;

  IF v_log.repair_scrap_disposal_id IS NOT NULL THEN
    UPDATE public.scrap_disposal_items
    SET is_reverted = TRUE,
        reverted_by = v_user_id,
        reverted_at = NOW(),
        revert_reason = BTRIM(p_reason)
    WHERE id = v_log.repair_scrap_disposal_id;
  END IF;

  UPDATE public.checkout_return_logs
  SET repair_resolution_status = 'unresolved',
      repair_notes = NULL,
      repair_resolved_at = NULL,
      repair_resolved_by = NULL,
      restored_stock_in_order_id = NULL,
      repair_scrap_disposal_id = NULL,
      spare_part_item_id = NULL,
      spare_part_quantity = NULL
  WHERE id = p_return_log_id;

  PERFORM public.record_super_revert_audit(
    'CHECKOUT_REPAIR_REVERT',
    'checkout_return_logs',
    p_return_log_id,
    v_log.repair_resolution_status,
    'unresolved',
    p_reason,
    jsonb_build_object(
      'checkout_order_id', v_log.checkout_order_id,
      'scrap_disposal_id', v_log.repair_scrap_disposal_id
    )
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'return_log_id', p_return_log_id,
    'previous_status', v_log.repair_resolution_status,
    'new_status', 'unresolved',
    'message', 'ย้อนผลการซ่อมสำเร็จ'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Grants
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.super_revert_checkout_order_returns(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_revert_checkout_order_returns(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.super_revert_checkout_rejection(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_revert_checkout_rejection(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.super_revert_damaged_repair(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_revert_damaged_repair(UUID, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. Post-apply assertions
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'super_revert_checkout_order_returns') THEN
    RAISE EXCEPTION 'Migration 85 validation failed: super_revert_checkout_order_returns is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'super_revert_checkout_rejection') THEN
    RAISE EXCEPTION 'Migration 85 validation failed: super_revert_checkout_rejection is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'super_revert_damaged_repair') THEN
    RAISE EXCEPTION 'Migration 85 validation failed: super_revert_damaged_repair is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'super_revert_checkout_return'
                  AND pg_get_functiondef(oid) LIKE '%EQUIPMENT_ALREADY_RELOANED%') THEN
    RAISE EXCEPTION 'Migration 85 validation failed: S/N re-loan guard is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scrap_disposal_items'
      AND column_name = 'is_reverted'
  ) THEN
    RAISE EXCEPTION 'Migration 85 validation failed: scrap_disposal_items.is_reverted is missing';
  END IF;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- ROLLBACK (manual, only when necessary)
-- =============================================================================
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.super_revert_damaged_repair(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.super_revert_checkout_rejection(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.super_revert_checkout_order_returns(UUID, TEXT);
--   -- super_revert_checkout_return: restore the migration 84 definition.
-- COMMIT;