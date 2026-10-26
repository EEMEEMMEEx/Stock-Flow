-- ===========================================================================
-- Transactional smoke test for Migration 99: CAIM Warranty-Claim Integration Flow
-- ---------------------------------------------------------------------------
-- Ends with ROLLBACK — never persists test data to the live database.
-- ===========================================================================

BEGIN;

DO $smoke$
DECLARE
  v_actor UUID;
  v_test_ticket TEXT := 'CLM-TEST-SMOKE-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
  v_test_order_id UUID;
  v_test_item_id UUID;
  v_test_checkout_item_id UUID;
  v_test_return_log_id UUID;
  v_test_project_id UUID;
  v_webhook_res JSONB;
  v_confirm_res JSONB;
  v_stock_before NUMERIC;
  v_stock_after NUMERIC;
  v_return_record RECORD;
BEGIN
  -- 0. Find active SUPER/Admin actor
  SELECT p.id INTO v_actor
  FROM public.profiles p
  WHERE p.status = 'active'
    AND (public.is_super_admin(p.id) OR public.is_admin(p.id))
  ORDER BY p.id
  LIMIT 1;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'SMOKE TEST: ไม่พบผู้ใช้ SUPER/Admin ที่ active สำหรับทดสอบ';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_actor::TEXT, 'role', 'authenticated')::TEXT, true);
  PERFORM set_config('request.jwt.claim.sub', v_actor::TEXT, true);

  -- 1. Get test project and item
  SELECT id INTO v_test_project_id FROM public.projects WHERE status = 'active' LIMIT 1;
  SELECT id INTO v_test_item_id FROM public.items LIMIT 1;

  IF v_test_project_id IS NULL OR v_test_item_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE TEST: ไม่พบ project หรือ item สำหรับทดสอบ';
  END IF;

  -- 2. Create mock checkout order & return log with caim_ticket_id
  INSERT INTO public.checkout_orders (
    order_number, project_id, borrower_name, status, created_by
  ) VALUES (
    'SMOKE-CHK-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 6),
    v_test_project_id, 'Smoke Tester', 'completed', v_actor
  ) RETURNING id INTO v_test_order_id;

  INSERT INTO public.checkout_items (
    checkout_order_id, item_id, quantity_borrowed, quantity_returned, status, serial_number
  ) VALUES (
    v_test_order_id, v_test_item_id, 1, 1, 'returned', 'SN-SMOKE-ORIGINAL'
  ) RETURNING id INTO v_test_checkout_item_id;

  INSERT INTO public.checkout_return_logs (
    checkout_order_id, checkout_item_id, returned_quantity, item_condition,
    destination_project_id, received_by, returned_at, caim_ticket_id, caim_sync_status
  ) VALUES (
    v_test_order_id, v_test_checkout_item_id, 1, 'consumed',
    v_test_project_id, v_actor, now(), v_test_ticket, 'synced'
  ) RETURNING id INTO v_test_return_log_id;

  -- 3. Verify stock balance before webhook
  SELECT COALESCE(balance, 0) INTO v_stock_before
  FROM public.stock_balance
  WHERE project_id = v_test_project_id AND item_id = v_test_item_id;

  v_stock_before := COALESCE(v_stock_before, 0);

  -- 4. Test Webhook: claim.closed with repairResult = 'repaired'
  v_webhook_res := public.process_caim_webhook_event(jsonb_build_object(
    'eventId', 'smoke-event-' || v_test_ticket,
    'ticketId', v_test_ticket,
    'event', 'claim.closed',
    'repairResult', 'repaired',
    'notes', 'Smoke test repair completed',
    'closedAt', now()::TEXT
  ));

  IF (v_webhook_res->>'success')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'SMOKE TEST: process_caim_webhook_event failed: %', v_webhook_res;
  END IF;

  -- Verify return log is in 'pending_confirmation' and stock DID NOT move
  SELECT * INTO v_return_record
  FROM public.checkout_return_logs
  WHERE id = v_test_return_log_id;

  IF v_return_record.caim_inbound_status != 'pending_confirmation' THEN
    RAISE EXCEPTION 'SMOKE TEST: Expected caim_inbound_status = pending_confirmation, got %', v_return_record.caim_inbound_status;
  END IF;

  SELECT COALESCE(balance, 0) INTO v_stock_after
  FROM public.stock_balance
  WHERE project_id = v_test_project_id AND item_id = v_test_item_id;

  IF v_stock_after != v_stock_before THEN
    RAISE EXCEPTION 'SMOKE TEST: Invariant violated: Stock moved before user confirmation (before %, after %)', v_stock_before, v_stock_after;
  END IF;

  -- 5. Test Confirm: Call confirm_caim_inbound_resolution
  v_confirm_res := public.confirm_caim_inbound_resolution(jsonb_build_object(
    'return_log_id', v_test_return_log_id,
    'action', 'confirm',
    'notes', 'User approved receipt from CAIM'
  ));

  IF (v_confirm_res->>'success')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'SMOKE TEST: confirm_caim_inbound_resolution failed: %', v_confirm_res;
  END IF;

  -- Verify return log is now 'confirmed'
  SELECT * INTO v_return_record
  FROM public.checkout_return_logs
  WHERE id = v_test_return_log_id;

  IF v_return_record.caim_inbound_status != 'confirmed' THEN
    RAISE EXCEPTION 'SMOKE TEST: Expected caim_inbound_status = confirmed, got %', v_return_record.caim_inbound_status;
  END IF;

  -- Verify stock balance increased by exactly 1
  SELECT COALESCE(balance, 0) INTO v_stock_after
  FROM public.stock_balance
  WHERE project_id = v_test_project_id AND item_id = v_test_item_id;

  IF v_stock_after != (v_stock_before + 1) THEN
    RAISE EXCEPTION 'SMOKE TEST: Invariant violated: Expected stock % + 1 = %, got %',
      v_stock_before, (v_stock_before + 1), v_stock_after;
  END IF;

  -- 6. Test Idempotency: Confirming again must fail
  BEGIN
    PERFORM public.confirm_caim_inbound_resolution(jsonb_build_object(
      'return_log_id', v_test_return_log_id,
      'action', 'confirm'
    ));
    RAISE EXCEPTION 'SMOKE TEST: Invariant violated: Double confirmation was not blocked!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Invariant violated%' THEN
      RAISE;
    END IF;
    -- Expected rejection on double confirm: PASS
  END;

  RAISE NOTICE 'SMOKE TEST: All invariants verified successfully! Rolling back.';
END;
$smoke$;

ROLLBACK;
