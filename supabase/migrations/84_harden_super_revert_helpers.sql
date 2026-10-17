-- =============================================================================
-- Migration 84: Harden and correct the SUPER revert actions
-- =============================================================================
-- Forward-only fixes for databases that already applied migration 83:
--   1. request_header: pin search_path + revoke execute from clients
--   2. stock_balance: record the authoritative formula used by production
--      (verified against all 146 live view rows: OUT/CHECKOUT decrease the
--      balance, RETURN/return_in increase it; the archived migration 46
--      definition matched only 141/146)
--   3. audit read RLS: SUPER or ADMIN only (roles.view is not enough)
--   4. append-only trigger: only the FK ON DELETE SET NULL update is exempt
--   5. super_revert_withdrawal_action: restore legacy deductions via
--      fulfilled_qty / available_at_approval and block when unknowable
--   6. super_revert_checkout_return: block cancelled/pending/rejected loans,
--      refuse counter mismatches instead of clamping, keep the order guard
-- Idempotent and additive.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Header helper hardening
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_header(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_headers TEXT;
BEGIN
  v_headers := NULLIF(current_setting('request.headers', true), '');
  IF v_headers IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN NULLIF(BTRIM(v_headers::jsonb ->> p_name), '');
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.request_header(TEXT) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Authoritative stock_balance formula
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.stock_balance AS
SELECT
  sio.project_id,
  sii.item_id,
  i.name AS item_name,
  i.unit,
  p.name AS project_name,
  COALESCE(SUM(sii.quantity), 0) AS total_in,
  COALESCE((
    SELECT SUM(CASE
        WHEN st.transaction_type IN ('stock_out', 'checkout_out', 'transfer_out', 'OUT', 'CHECKOUT') THEN st.quantity
        WHEN st.transaction_type IN ('return_in', 'RETURN') THEN -st.quantity
        ELSE 0 END)
    FROM public.stock_transactions st
    WHERE st.project_id = sio.project_id
      AND st.item_id = sii.item_id
  ), 0) AS total_out,
  COALESCE(SUM(sii.quantity), 0) - COALESCE((
    SELECT SUM(CASE
        WHEN st.transaction_type IN ('stock_out', 'checkout_out', 'transfer_out', 'OUT', 'CHECKOUT') THEN st.quantity
        WHEN st.transaction_type IN ('return_in', 'RETURN') THEN -st.quantity
        ELSE 0 END)
    FROM public.stock_transactions st
    WHERE st.project_id = sio.project_id
      AND st.item_id = sii.item_id
  ), 0) AS balance
FROM public.stock_in_items sii
JOIN public.stock_in_orders sio ON sio.id = sii.order_id
JOIN public.items i ON i.id = sii.item_id
JOIN public.projects p ON p.id = sio.project_id
GROUP BY sio.project_id, sii.item_id, i.name, i.unit, p.name;

-- -----------------------------------------------------------------------------
-- 3. Audit read policy: SUPER or ADMIN only
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Audit logs admin read" ON public.audit_logs;
CREATE POLICY "Audit logs admin read"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND LOWER(COALESCE(p.role, '')) = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Append-only trigger: narrow the FK exemption
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_audit_log_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND pg_trigger_depth() > 1
     AND (NEW.actor_id IS DISTINCT FROM OLD.actor_id OR NEW.target_user_id IS DISTINCT FROM OLD.target_user_id)
     AND (NEW.actor_id IS NULL OR NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id)
     AND (NEW.target_user_id IS NULL OR NEW.target_user_id IS NOT DISTINCT FROM OLD.target_user_id)
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.action IS NOT DISTINCT FROM OLD.action
     AND NEW.details IS NOT DISTINCT FROM OLD.details
     AND NEW.ip_address IS NOT DISTINCT FROM OLD.ip_address
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.actor_role IS NOT DISTINCT FROM OLD.actor_role
     AND NEW.action_type IS NOT DISTINCT FROM OLD.action_type
     AND NEW.target_table IS NOT DISTINCT FROM OLD.target_table
     AND NEW.target_id IS NOT DISTINCT FROM OLD.target_id
     AND NEW.previous_status IS NOT DISTINCT FROM OLD.previous_status
     AND NEW.new_status IS NOT DISTINCT FROM OLD.new_status
     AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW.user_agent IS NOT DISTINCT FROM OLD.user_agent
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Audit logs are append-only and cannot be modified or deleted'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_audit_log_append_only();

-- -----------------------------------------------------------------------------
-- 5. super_revert_withdrawal_action: legacy-deduction aware
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_revert_withdrawal_action(
  p_order_id UUID,
  p_target_action TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_action TEXT := LOWER(BTRIM(COALESCE(p_target_action, '')));
  v_order RECORD;
  v_item RECORD;
  v_qty NUMERIC;
  v_previous_status TEXT;
  v_new_status TEXT;
  v_audit_action TEXT;
  v_restored_qty NUMERIC := 0;
  v_restored_lines INTEGER := 0;
  v_unknown_lines INTEGER := 0;
BEGIN
  v_user_id := public.assert_super_revert_authorized(p_reason);

  IF v_action NOT IN ('revert_completion', 'revert_approval', 'revert_rejection') THEN
    RAISE EXCEPTION 'INVALID_STATE: Unsupported revert action: %', p_target_action
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_order
  FROM public.withdrawal_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Withdrawal request not found: %', p_order_id
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
  FROM public.withdrawal_items wi
  WHERE wi.order_id = p_order_id
  ORDER BY wi.id
  FOR UPDATE;

  v_previous_status := v_order.status;

  IF v_action = 'revert_completion' THEN
    IF v_order.status <> 'completed' THEN
      RAISE EXCEPTION 'INVALID_STATE: Only completed requests can be reverted to approved (current: %)', v_order.status
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.withdrawal_orders
    SET status = 'approved',
        completed_by = NULL,
        completed_at = NULL,
        last_reverted_by = v_user_id,
        last_reverted_at = NOW(),
        last_revert_reason = BTRIM(p_reason),
        last_revert_from_status = 'completed',
        last_revert_to_status = 'approved',
        updated_at = NOW()
    WHERE id = p_order_id;

    v_new_status := 'approved';
    v_audit_action := 'WITHDRAWAL_COMPLETE_REVERT';

  ELSIF v_action = 'revert_approval' THEN
    IF v_order.status = 'completed' THEN
      RAISE EXCEPTION 'CASCADE_BLOCKED: Revert the receipt confirmation (completed -> approved) first.'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_order.status <> 'approved' THEN
      RAISE EXCEPTION 'INVALID_STATE: Only approved requests can be reverted to pending (current: %)', v_order.status
        USING ERRCODE = 'P0001';
    END IF;

    PERFORM 1
    FROM public.items i
    WHERE i.id IN (SELECT wi.item_id FROM public.withdrawal_items wi WHERE wi.order_id = p_order_id)
    ORDER BY i.id
    FOR UPDATE;

    -- Refuse to flip status without restoring stock. Legacy approvals (before
    -- migration 80) may have deducted_quantity = 0/NULL; derive the deducted
    -- amount from fulfilled_qty or available_at_approval. If neither exists the
    -- amount is unknowable, so the operator must reconcile the ledger first.
    FOR v_item IN
      SELECT wi.id,
             COALESCE(wi.requested_qty, wi.quantity) AS requested_qty,
             COALESCE(
               NULLIF(wi.deducted_quantity, 0),
               NULLIF(wi.fulfilled_qty, 0),
               CASE
                 WHEN wi.available_at_approval IS NOT NULL
                   THEN LEAST(COALESCE(wi.requested_qty, wi.quantity), GREATEST(wi.available_at_approval, 0))
                 ELSE NULL
               END
             ) AS qty_to_restore
      FROM public.withdrawal_items wi
      WHERE wi.order_id = p_order_id
      ORDER BY wi.id
    LOOP
      IF v_item.qty_to_restore IS NULL AND v_item.requested_qty > 0 THEN
        v_unknown_lines := v_unknown_lines + 1;
      END IF;
    END LOOP;

    IF v_unknown_lines > 0 THEN
      RAISE EXCEPTION 'LEGACY_STOCK_UNKNOWN: Cannot determine the deducted stock for % line(s). Reconcile the ledger before reverting.', v_unknown_lines
        USING ERRCODE = 'P0001';
    END IF;

    FOR v_item IN
      SELECT wi.id,
             wi.item_id,
             wi.project_id AS source_project_id,
             wi.storage_location_id AS source_storage_location_id,
             COALESCE(
               NULLIF(wi.deducted_quantity, 0),
               NULLIF(wi.fulfilled_qty, 0),
               CASE
                 WHEN wi.available_at_approval IS NOT NULL
                   THEN LEAST(COALESCE(wi.requested_qty, wi.quantity), GREATEST(wi.available_at_approval, 0))
                 ELSE 0
               END
             ) AS qty_to_restore
      FROM public.withdrawal_items wi
      WHERE wi.order_id = p_order_id
      ORDER BY wi.project_id, wi.item_id, wi.id
    LOOP
      v_qty := COALESCE(v_item.qty_to_restore, 0);

      IF v_qty > 0 AND v_item.source_project_id IS NOT NULL THEN
        INSERT INTO public.stock_transactions (
          item_id, project_id, transaction_type, quantity, storage_location_id,
          created_by, reference_type, reference_id, notes
        ) VALUES (
          v_item.item_id,
          v_item.source_project_id,
          'RETURN',
          v_qty::INTEGER,
          v_item.source_storage_location_id,
          v_user_id,
          'withdrawal_approval_revert',
          p_order_id,
          'SUPER ย้อนการอนุมัติใบเบิก: ' || BTRIM(p_reason)
        );

        v_restored_qty := v_restored_qty + v_qty;
        v_restored_lines := v_restored_lines + 1;
      END IF;

      UPDATE public.withdrawal_items
      SET available_at_approval = NULL,
          deducted_quantity = 0,
          shortage_quantity = 0,
          is_shortage = FALSE
      WHERE id = v_item.id;
    END LOOP;

    UPDATE public.withdrawal_orders
    SET status = 'pending',
        approved_by = NULL,
        approved_at = NULL,
        has_shortage = FALSE,
        is_shortage_override = FALSE,
        override_reason = NULL,
        last_reverted_by = v_user_id,
        last_reverted_at = NOW(),
        last_revert_reason = BTRIM(p_reason),
        last_revert_from_status = 'approved',
        last_revert_to_status = 'pending',
        updated_at = NOW()
    WHERE id = p_order_id;

    v_new_status := 'pending';
    v_audit_action := 'WITHDRAWAL_APPROVAL_REVERT';

  ELSE
    IF v_order.status <> 'rejected' THEN
      RAISE EXCEPTION 'INVALID_STATE: Only rejected requests can be reverted to pending (current: %)', v_order.status
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.withdrawal_orders
    SET status = 'pending',
        rejected_by = NULL,
        rejected_at = NULL,
        reject_reason = NULL,
        last_reverted_by = v_user_id,
        last_reverted_at = NOW(),
        last_revert_reason = BTRIM(p_reason),
        last_revert_from_status = 'rejected',
        last_revert_to_status = 'pending',
        updated_at = NOW()
    WHERE id = p_order_id;

    v_new_status := 'pending';
    v_audit_action := 'WITHDRAWAL_REJECT_REVERT';
  END IF;

  PERFORM public.record_super_revert_audit(
    v_audit_action,
    'withdrawal_orders',
    p_order_id,
    v_previous_status,
    v_new_status,
    p_reason,
    jsonb_build_object(
      'revert_action', v_action,
      'restored_quantity', v_restored_qty,
      'restored_lines', v_restored_lines
    )
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', p_order_id,
    'target_action', v_action,
    'previous_status', v_previous_status,
    'new_status', v_new_status,
    'restored_quantity', v_restored_qty,
    'restored_lines', v_restored_lines,
    'message', 'ย้อนสถานะคำขอเบิกสำเร็จ'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. super_revert_checkout_return: order-status + counter guards
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

REVOKE ALL ON FUNCTION public.super_revert_withdrawal_action(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_revert_withdrawal_action(UUID, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.super_revert_checkout_return(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_revert_checkout_return(UUID, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. Post-apply assertions
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_view TEXT;
  v_trigger TEXT;
  v_policy TEXT;
BEGIN
  v_view := pg_get_viewdef('public.stock_balance'::regclass, true);
  IF v_view NOT ILIKE '%''OUT''%' OR v_view NOT ILIKE '%''RETURN''%' THEN
    RAISE EXCEPTION 'Migration 84 validation failed: stock_balance does not count OUT/RETURN';
  END IF;

  v_trigger := pg_get_functiondef('public.enforce_audit_log_append_only()'::regprocedure);
  IF v_trigger NOT ILIKE '%target_user_id%' THEN
    RAISE EXCEPTION 'Migration 84 validation failed: append-only FK exemption is missing';
  END IF;

  SELECT qual INTO v_policy
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'Audit logs admin read';

  IF v_policy IS NULL OR v_policy ILIKE '%roles.view%' THEN
    RAISE EXCEPTION 'Migration 84 validation failed: audit read policy is missing or too broad';
  END IF;

  IF has_function_privilege('authenticated', 'public.request_header(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Migration 84 validation failed: request_header is still executable by authenticated';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- ROLLBACK (manual)
-- =============================================================================
-- BEGIN;
--   DROP POLICY IF EXISTS "Audit logs admin read" ON public.audit_logs;
--   CREATE POLICY "Audit logs admin read" ON public.audit_logs FOR SELECT TO authenticated USING (
--     public.is_super_admin(auth.uid())
--     OR public.has_permission(auth.uid(), 'roles.view')
--     OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
--   );
--   -- Restore the migration 83 trigger function / request_header / view / RPCs
--   -- from supabase/migrations/83_super_revert_actions_and_audit.sql.
-- COMMIT;
-- =============================================================================
