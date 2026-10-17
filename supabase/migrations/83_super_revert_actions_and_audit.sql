-- =============================================================================
-- Migration 83: SUPER Revert / Undo Actions + Append-Only Audit Trail
-- =============================================================================
-- Implements docs/super-revert-undo-plan.md (defaults: Option A for all 3 open
-- questions). Only public.is_super_admin(auth.uid()) may call the revert RPCs.
--
-- Why this migration exists
--   Migration 81 cancels a request permanently (status = 'cancelled'). It cannot
--   step a workflow back (completed -> approved -> pending) or undo a confirmed
--   return. This migration adds explicit reverse transitions, restores the stock
--   ledger for each reverted step, and records the actor, state transition and
--   reason in public.audit_logs.
--
-- Reversibility
--   Additive columns, one permission row, three RPCs and one trigger. The
--   rollback block at the end reverts every object created here.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Audit trail: standard revert columns (additive; actor_id/action/details kept)
-- -----------------------------------------------------------------------------
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_role TEXT,
  ADD COLUMN IF NOT EXISTS action_type TEXT,
  ADD COLUMN IF NOT EXISTS target_table TEXT,
  ADD COLUMN IF NOT EXISTS target_id UUID,
  ADD COLUMN IF NOT EXISTS previous_status TEXT,
  ADD COLUMN IF NOT EXISTS new_status TEXT,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type
  ON public.audit_logs (action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target
  ON public.audit_logs (target_table, target_id);

-- Append-only guard.
-- The FK actions from public.profiles are ON DELETE SET NULL, which performs a
-- nested UPDATE on audit_logs when a user is deleted. That nested update must
-- stay allowed or admin_delete_user would fail for every audited user. Direct
-- updates/deletes (trigger depth 1) are rejected.
CREATE OR REPLACE FUNCTION public.enforce_audit_log_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND pg_trigger_depth() > 1 THEN
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

-- Read policy: SUPER or ADMIN only. No INSERT/UPDATE/DELETE policy is added,
-- so direct client writes remain denied (SECURITY DEFINER RPCs bypass RLS).
DROP POLICY IF EXISTS "Audit logs admin read" ON public.audit_logs;
CREATE POLICY "Audit logs admin read"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'roles.view')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- 2. Business tables: last revert metadata + soft revert flag on return logs
-- -----------------------------------------------------------------------------
ALTER TABLE public.withdrawal_orders
  ADD COLUMN IF NOT EXISTS last_reverted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_reverted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_revert_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_revert_from_status TEXT,
  ADD COLUMN IF NOT EXISTS last_revert_to_status TEXT;

ALTER TABLE public.checkout_orders
  ADD COLUMN IF NOT EXISTS last_reverted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_reverted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_revert_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_revert_from_status TEXT,
  ADD COLUMN IF NOT EXISTS last_revert_to_status TEXT;

ALTER TABLE public.checkout_return_logs
  ADD COLUMN IF NOT EXISTS is_reverted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reverted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revert_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_checkout_return_logs_active
  ON public.checkout_return_logs (checkout_order_id, returned_at DESC)
  WHERE is_reverted = FALSE;

-- -----------------------------------------------------------------------------
-- 3. Permission catalog: system.revert_actions (SUPER only)
-- -----------------------------------------------------------------------------
INSERT INTO public.permissions (code, name, description, resource, action, category)
VALUES (
  'system.revert_actions',
  'ยกเลิก/ย้อนสถานะการดำเนินการ (Revert Actions)',
  'ย้อนสถานะใบเบิกและรายการยืม-คืนกลับไปยังขั้นตอนก่อนหน้า พร้อมคืน/หักสต็อกและบันทึก Audit Log (เฉพาะ SUPER)',
  'system',
  'revert_actions',
  'Role Management'
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    category = EXCLUDED.category;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE UPPER(TRIM(r.code)) = 'SUPER'
  AND p.code = 'system.revert_actions'
ON CONFLICT DO NOTHING;

-- Lock the permission to SUPER. Other roles are silently stripped, and the
-- SUPER role always keeps it, regardless of what the client submits.
CREATE OR REPLACE FUNCTION public.admin_save_role_permissions(
  p_role_id UUID,
  p_permission_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_permission_ids UUID[];
  v_pid UUID;
  v_role_code TEXT;
  v_revert_perm_id UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT (public.is_super_admin(v_caller_id) OR public.has_permission(v_caller_id, 'roles.manage_permissions')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.manage_permissions permission.';
  END IF;

  SELECT code INTO v_role_code FROM public.roles WHERE id = p_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not Found: Target role does not exist.';
  END IF;

  IF v_role_code = 'SUPER' AND NOT public.is_super_admin(v_caller_id) THEN
    RAISE EXCEPTION 'Permission Denied: Only Super Admin can modify SUPER role permissions.';
  END IF;

  v_permission_ids := COALESCE(p_permission_ids, ARRAY[]::UUID[]);
  v_permission_ids := ARRAY(
    SELECT DISTINCT x FROM unnest(v_permission_ids) AS t(x) WHERE x IS NOT NULL
  );

  SELECT id INTO v_revert_perm_id
  FROM public.permissions
  WHERE code = 'system.revert_actions';

  IF v_revert_perm_id IS NOT NULL THEN
    IF v_role_code = 'SUPER' THEN
      IF NOT (v_revert_perm_id = ANY(v_permission_ids)) THEN
        v_permission_ids := v_permission_ids || v_revert_perm_id;
      END IF;
    ELSE
      v_permission_ids := array_remove(v_permission_ids, v_revert_perm_id);
    END IF;
  END IF;

  DELETE FROM public.role_permissions WHERE role_id = p_role_id;

  IF ARRAY_LENGTH(v_permission_ids, 1) > 0 THEN
    FOREACH v_pid IN ARRAY v_permission_ids LOOP
      INSERT INTO public.role_permissions (role_id, permission_id)
      VALUES (p_role_id, v_pid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  BEGIN
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
      INSERT INTO public.audit_logs (actor_id, action, details)
      VALUES (
        v_caller_id,
        'ROLE_PERMISSION_CHANGED',
        jsonb_build_object(
          'role_id', p_role_id,
          'role_code', v_role_code,
          'permissions_count', COALESCE(ARRAY_LENGTH(v_permission_ids, 1), 0)
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN END;

  RETURN jsonb_build_object('success', true, 'message', 'Role permissions updated successfully.');
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Central guard + audit helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_super_revert_authorized(p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_super_admin(v_user_id) THEN
    RAISE EXCEPTION 'Forbidden: Only SUPER (System Administrator) can revert actions.'
      USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR LENGTH(BTRIM(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Bad Request: Revert reason is required.'
      USING ERRCODE = '22023';
  END IF;

  IF LENGTH(p_reason) > 2000 THEN
    RAISE EXCEPTION 'Bad Request: Revert reason must not exceed 2000 characters.'
      USING ERRCODE = '22023';
  END IF;

  RETURN v_user_id;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.record_super_revert_audit(
  p_action_type TEXT,
  p_target_table TEXT,
  p_target_id UUID,
  p_previous_status TEXT,
  p_new_status TEXT,
  p_reason TEXT,
  p_details JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, action_type,
    target_table, target_id, previous_status, new_status,
    reason, details, ip_address, user_agent
  ) VALUES (
    auth.uid(),
    'SUPER',
    p_action_type,
    p_action_type,
    p_target_table,
    p_target_id,
    p_previous_status,
    p_new_status,
    BTRIM(p_reason),
    COALESCE(p_details, '{}'::JSONB) || jsonb_build_object('reverted_at', NOW()),
    public.request_header('x-forwarded-for'),
    public.request_header('user-agent')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assert_super_revert_authorized(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_super_revert_audit(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_header(TEXT) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. RPC: super_revert_withdrawal_action
--    p_target_action:
--      'revert_completion' : completed -> approved (no stock movement)
--      'revert_approval'   : approved  -> pending  (restore deducted stock)
--      'revert_rejection'  : rejected  -> pending  (clear rejection)
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

    -- Same per-item mutex order used by approve_inventory_request.
    PERFORM 1
    FROM public.items i
    WHERE i.id IN (SELECT wi.item_id FROM public.withdrawal_items wi WHERE wi.order_id = p_order_id)
    ORDER BY i.id
    FOR UPDATE;

    FOR v_item IN
      SELECT wi.id,
             wi.item_id,
             wi.project_id AS source_project_id,
             wi.storage_location_id AS source_storage_location_id,
             COALESCE(wi.deducted_quantity, 0) AS deducted_quantity
      FROM public.withdrawal_items wi
      WHERE wi.order_id = p_order_id
      ORDER BY wi.project_id, wi.item_id, wi.id
    LOOP
      v_qty := COALESCE(v_item.deducted_quantity, 0);

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
-- 6. RPC: super_revert_checkout_approval
--    active/overdue -> pending when no return has been confirmed yet.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_revert_checkout_approval(
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
  v_item RECORD;
  v_previous_status TEXT;
  v_restored_qty NUMERIC := 0;
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

  IF v_order.status IN ('completed', 'partial_returned') THEN
    RAISE EXCEPTION 'CASCADE_BLOCKED: Revert the confirmed return(s) before reverting this approval.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_order.status NOT IN ('active', 'overdue') THEN
    RAISE EXCEPTION 'INVALID_STATE: Only active/overdue loans can be reverted to pending (current: %)', v_order.status
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.checkout_return_logs l
    WHERE l.checkout_order_id = p_order_id AND l.is_reverted = FALSE
  ) THEN
    RAISE EXCEPTION 'CASCADE_BLOCKED: This loan already has confirmed return records; revert them first.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.checkout_items ci
    WHERE ci.checkout_order_id = p_order_id
      AND (
        COALESCE(ci.quantity_returned, 0) + COALESCE(ci.quantity_damaged, 0)
        + COALESCE(ci.quantity_lost, 0) + COALESCE(ci.quantity_consumed, 0)
      ) > 0
  ) THEN
    RAISE EXCEPTION 'CASCADE_BLOCKED: Return quantities already exist on this loan; revert the return records first.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1
  FROM public.checkout_items ci
  WHERE ci.checkout_order_id = p_order_id
  ORDER BY ci.id
  FOR UPDATE;

  PERFORM 1
  FROM public.items i
  WHERE i.id IN (SELECT ci.item_id FROM public.checkout_items ci WHERE ci.checkout_order_id = p_order_id)
  ORDER BY i.id
  FOR UPDATE;

  FOR v_item IN
    SELECT ci.id, ci.item_id, COALESCE(ci.quantity_borrowed, 0) AS quantity_borrowed
    FROM public.checkout_items ci
    WHERE ci.checkout_order_id = p_order_id
    ORDER BY ci.id
  LOOP
    IF v_item.quantity_borrowed > 0 AND v_order.project_id IS NOT NULL THEN
      INSERT INTO public.stock_transactions (
        project_id, item_id, transaction_type, quantity,
        reference_id, reference_type, created_by, notes
      ) VALUES (
        v_order.project_id,
        v_item.item_id,
        'return_in',
        v_item.quantity_borrowed::INTEGER,
        p_order_id,
        'checkout_approval_revert',
        v_user_id,
        'SUPER ย้อนการอนุมัติใบยืม: ' || BTRIM(p_reason)
      );

      v_restored_qty := v_restored_qty + v_item.quantity_borrowed;
    END IF;

    UPDATE public.checkout_items
    SET status = 'pending'
    WHERE id = v_item.id;
  END LOOP;

  v_previous_status := v_order.status;

  UPDATE public.checkout_orders
  SET status = 'pending',
      approved_by = NULL,
      approved_at = NULL,
      actual_returned_date = NULL,
      last_reverted_by = v_user_id,
      last_reverted_at = NOW(),
      last_revert_reason = BTRIM(p_reason),
      last_revert_from_status = v_previous_status,
      last_revert_to_status = 'pending'
  WHERE id = p_order_id;

  PERFORM public.record_super_revert_audit(
    'CHECKOUT_APPROVAL_REVERT',
    'checkout_orders',
    p_order_id,
    v_previous_status,
    'pending',
    p_reason,
    jsonb_build_object('restored_quantity', v_restored_qty)
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', p_order_id,
    'previous_status', v_previous_status,
    'new_status', 'pending',
    'restored_quantity', v_restored_qty,
    'message', 'ย้อนการอนุมัติใบยืมสำเร็จ'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC: super_revert_checkout_return
--    Soft-reverts one return log, removes its stock credit (normal only) and
--    recomputes the loan status (completed/partial_returned -> active/partial).
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

  -- Lock order -> item -> return log, the same order used by process_return_order.
  SELECT * INTO v_order
  FROM public.checkout_orders
  WHERE id = v_log.checkout_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Checkout order for this return no longer exists: %', v_log.checkout_order_id
      USING ERRCODE = 'P0002';
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
    v_new_returned := GREATEST(0, v_new_returned - v_qty);
  ELSIF v_log.item_condition IN ('damaged', 'needs_repair') THEN
    v_new_damaged := GREATEST(0, v_new_damaged - v_qty);
  ELSIF v_log.item_condition = 'lost' THEN
    v_new_lost := GREATEST(0, v_new_lost - v_qty);
  ELSIF v_log.item_condition = 'consumed' THEN
    v_new_consumed := GREATEST(0, v_new_consumed - v_qty);
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

-- -----------------------------------------------------------------------------
-- 8. Grants (authoritative authorization stays inside each RPC)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.super_revert_withdrawal_action(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_revert_withdrawal_action(UUID, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.super_revert_checkout_approval(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_revert_checkout_approval(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.super_revert_checkout_return(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_revert_checkout_return(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_save_role_permissions(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_role_permissions(UUID, UUID[]) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. Post-apply assertions (fail the migration instead of shipping a half state)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT STRING_AGG(t.table_name || '.' || t.required_column, ', ') INTO v_missing
  FROM (VALUES
    ('audit_logs', 'actor_role'),
    ('audit_logs', 'action_type'),
    ('audit_logs', 'target_table'),
    ('audit_logs', 'target_id'),
    ('audit_logs', 'previous_status'),
    ('audit_logs', 'new_status'),
    ('audit_logs', 'reason'),
    ('audit_logs', 'user_agent'),
    ('withdrawal_orders', 'last_reverted_by'),
    ('checkout_orders', 'last_reverted_by'),
    ('checkout_return_logs', 'is_reverted')
  ) AS t(table_name, required_column)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = t.table_name
      AND c.column_name = t.required_column
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 83 validation failed: missing columns %', v_missing;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE code = 'system.revert_actions') THEN
    RAISE EXCEPTION 'Migration 83 validation failed: system.revert_actions permission is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'super_revert_withdrawal_action') THEN
    RAISE EXCEPTION 'Migration 83 validation failed: super_revert_withdrawal_action is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_logs_append_only') THEN
    RAISE EXCEPTION 'Migration 83 validation failed: append-only trigger is missing';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- ROLLBACK (manual, only when necessary)
-- =============================================================================
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.super_revert_checkout_return(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.super_revert_checkout_approval(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.super_revert_withdrawal_action(UUID, TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.record_super_revert_audit(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB);
--   DROP FUNCTION IF EXISTS public.request_header(TEXT);
--   DROP FUNCTION IF EXISTS public.assert_super_revert_authorized(TEXT);
--   DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON public.audit_logs;
--   DROP FUNCTION IF EXISTS public.enforce_audit_log_append_only();
--   DROP POLICY IF EXISTS "Audit logs admin read" ON public.audit_logs;
--   CREATE POLICY "Audit logs admin read" ON public.audit_logs FOR SELECT USING (
--     EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
--   );
--   DROP INDEX IF EXISTS public.idx_checkout_return_logs_active;
--   DROP INDEX IF EXISTS public.idx_audit_logs_target;
--   DROP INDEX IF EXISTS public.idx_audit_logs_action_type;
--   ALTER TABLE public.checkout_return_logs
--     DROP COLUMN IF EXISTS is_reverted,
--     DROP COLUMN IF EXISTS reverted_by,
--     DROP COLUMN IF EXISTS reverted_at,
--     DROP COLUMN IF EXISTS revert_reason;
--   ALTER TABLE public.checkout_orders
--     DROP COLUMN IF EXISTS last_reverted_by,
--     DROP COLUMN IF EXISTS last_reverted_at,
--     DROP COLUMN IF EXISTS last_revert_reason,
--     DROP COLUMN IF EXISTS last_revert_from_status,
--     DROP COLUMN IF EXISTS last_revert_to_status;
--   ALTER TABLE public.withdrawal_orders
--     DROP COLUMN IF EXISTS last_reverted_by,
--     DROP COLUMN IF EXISTS last_reverted_at,
--     DROP COLUMN IF EXISTS last_revert_reason,
--     DROP COLUMN IF EXISTS last_revert_from_status,
--     DROP COLUMN IF EXISTS last_revert_to_status;
--   ALTER TABLE public.audit_logs
--     DROP COLUMN IF EXISTS actor_role,
--     DROP COLUMN IF EXISTS action_type,
--     DROP COLUMN IF EXISTS target_table,
--     DROP COLUMN IF EXISTS target_id,
--     DROP COLUMN IF EXISTS previous_status,
--     DROP COLUMN IF EXISTS new_status,
--     DROP COLUMN IF EXISTS reason,
--     DROP COLUMN IF EXISTS user_agent;
--   DELETE FROM public.role_permissions rp
--   USING public.permissions p
--   WHERE rp.permission_id = p.id AND p.code = 'system.revert_actions';
--   DELETE FROM public.permissions WHERE code = 'system.revert_actions';
--   -- admin_save_role_permissions must be restored from migration 60.
-- COMMIT;
-- =============================================================================
