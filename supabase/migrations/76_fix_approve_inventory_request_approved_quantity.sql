-- =============================================================================
-- Migration 76: Fix approve_inventory_request referencing a non-existent column
-- =============================================================================
-- Symptom (production, project ref vrnutseacyejnzwcfamv):
--   POST /rest/v1/rpc/approve_inventory_request -> 400
--   { code: "42703", message: "column \"approved_quantity\" of relation
--     \"withdrawal_items\" does not exist" }
--
-- Root cause (function bug, NOT missing schema):
--   public.approve_inventory_request() executes, for every line item,
--       UPDATE public.withdrawal_items
--       SET approved_quantity = v_deduct, ...
--   but public.withdrawal_items has NEVER had an "approved_quantity" column.
--   The name was introduced in 61_complete_all_system_rpcs.sql and survived as
--   a leftover into 62_align_all_rpc_parameter_signatures.sql and
--   65_security_and_reliability_remediation.sql, even though those migrations
--   added the real breakdown columns (available_at_approval,
--   deducted_quantity, shortage_quantity). PL/pgSQL does not validate column
--   names at CREATE time, so the bug stayed dormant until Approve was clicked.
--
-- Live schema evidence (PostgREST OpenAPI, public.withdrawal_items):
--   id, order_id, item_id, quantity, delivery_to, serial_number, part_number,
--   available_at_approval, deducted_quantity, shortage_quantity, is_shortage,
--   requested_qty, fulfilled_qty, notes, created_at
--
-- Decision: fix the function, do NOT add an "approved_quantity" column.
--   The same value (v_deduct) is already written to deducted_quantity in the
--   same UPDATE, and no consumer (frontend / reports / PDF) reads
--   approved_quantity. Adding it would create a duplicate, dead column.
--
-- Idempotent: CREATE OR REPLACE + GRANT, safe to re-run.
-- Reversible: rollback block at the bottom.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.approve_inventory_request(
  p_request_id UUID,
  p_allow_shortage BOOLEAN DEFAULT FALSE,
  p_override_reason TEXT DEFAULT NULL
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
  v_available NUMERIC;
  v_requested NUMERIC;
  v_deduct NUMERIC;
  v_shortage NUMERIC;
  v_has_any_shortage BOOLEAN := FALSE;
  v_shortage_list JSONB := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_user_id, 'inventory.approve') OR 
          public.has_permission(v_user_id, 'withdrawals.approve') OR 
          public.is_super_admin(v_user_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires inventory.approve or withdrawals.approve permission.';
  END IF;

  SELECT * INTO v_order FROM public.withdrawal_orders WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found: %', p_request_id;
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending approval (current status: %)', v_order.status;
  END IF;

  -- Deadlock-free item row locking ordered by item_id
  PERFORM 1 FROM public.items i
  WHERE i.id IN (SELECT wi.item_id FROM public.withdrawal_items wi WHERE wi.order_id = p_request_id)
  ORDER BY i.id
  FOR UPDATE;

  -- Evaluate each requested item against current project stock_balance
  FOR v_item IN 
    SELECT wi.id as wi_id, wi.item_id, COALESCE(wi.requested_qty, wi.quantity) as requested_qty,
           i.name as item_name, i.sku, i.unit
    FROM public.withdrawal_items wi
    JOIN public.items i ON i.id = wi.item_id
    WHERE wi.order_id = p_request_id
    ORDER BY wi.id
  LOOP
    v_requested := v_item.requested_qty;

    SELECT balance INTO v_available
    FROM public.stock_balance
    WHERE project_id = v_order.project_id AND item_id = v_item.item_id;
    v_available := COALESCE(v_available, 0);

    IF v_available < v_requested THEN
      v_has_any_shortage := TRUE;
      v_shortage := v_requested - GREATEST(0, v_available);
      v_shortage_list := v_shortage_list || jsonb_build_object(
        'item_id', v_item.item_id,
        'item_name', v_item.item_name,
        'requested', v_requested,
        'available', v_available,
        'shortage', v_shortage
      );
    END IF;
  END LOOP;

  -- If shortages detected and shortage override was not granted, raise SHORTAGE_DETECTED
  IF v_has_any_shortage AND NOT p_allow_shortage THEN
    RAISE EXCEPTION 'SHORTAGE_DETECTED: %', jsonb_build_object('shortages', v_shortage_list)::text;
  END IF;

  -- Process deductions and line updates
  FOR v_item IN 
    SELECT wi.id as wi_id, wi.item_id, COALESCE(wi.requested_qty, wi.quantity) as requested_qty,
           i.name as item_name, i.sku, i.unit
    FROM public.withdrawal_items wi
    JOIN public.items i ON i.id = wi.item_id
    WHERE wi.order_id = p_request_id
    ORDER BY wi.id
  LOOP
    v_requested := v_item.requested_qty;

    SELECT balance INTO v_available
    FROM public.stock_balance
    WHERE project_id = v_order.project_id AND item_id = v_item.item_id;
    v_available := COALESCE(v_available, 0);

    IF v_available < v_requested THEN
      v_deduct := GREATEST(0, v_available);
      v_shortage := v_requested - v_deduct;
    ELSE
      v_deduct := v_requested;
      v_shortage := 0;
    END IF;

    -- NOTE: "approved_quantity" intentionally removed. The approved amount is
    -- persisted as deducted_quantity below; available_at_approval and
    -- shortage_quantity describe the same approval event.
    UPDATE public.withdrawal_items
    SET available_at_approval = v_available,
        deducted_quantity = v_deduct,
        shortage_quantity = v_shortage,
        is_shortage = (v_shortage > 0)
    WHERE id = v_item.wi_id;

    IF v_deduct > 0 THEN
      INSERT INTO public.stock_transactions (
        item_id, project_id, transaction_type, quantity, storage_location_id,
        created_by, reference_type, reference_id, notes
      ) VALUES (
        v_item.item_id, v_order.project_id, 'OUT', v_deduct, v_order.storage_location_id,
        v_user_id, 'withdrawal_order', p_request_id,
        COALESCE(p_override_reason, 'อนุมัติเบิกจ่าย Order #' || SUBSTRING(p_request_id::TEXT, 1, 8))
      );
    END IF;
  END LOOP;

  UPDATE public.withdrawal_orders
  SET status = 'approved',
      approved_by = v_user_id,
      approved_at = NOW(),
      has_shortage = v_has_any_shortage,
      is_shortage_override = p_allow_shortage,
      override_reason = p_override_reason,
      updated_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_request_id,
    'status', 'approved',
    'has_shortage', v_has_any_shortage,
    'message', 'อนุมัติคำขอเบิกจ่ายสำเร็จ'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_inventory_request(UUID, BOOLEAN, TEXT) TO authenticated, service_role;

-- =============================================================================
-- VERIFICATION (read-only) - run after applying:
--   SELECT pg_get_functiondef(
--     'public.approve_inventory_request(uuid,boolean,text)'::regprocedure
--   ) ILIKE '%approved_quantity%' AS still_references_missing_column; -- must be false
-- =============================================================================

-- =============================================================================
-- ROLLBACK (only if required)
-- =============================================================================
-- This migration is a pure bug fix. To roll back, re-apply the previous
-- definition from:
--   supabase/migrations/65_security_and_reliability_remediation.sql
--   (section 8, CREATE OR REPLACE FUNCTION public.approve_inventory_request)
-- Note: rolling back restores the 42703 failure for POST
-- /rest/v1/rpc/approve_inventory_request.
-- =============================================================================
