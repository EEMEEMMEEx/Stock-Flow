-- =============================================================================
-- Migration 94: SUPER revert — CAIM Claim Stock-In Reversal
-- =============================================================================
-- Allows authorized SUPER users to undo/reverse a stock-in created by a CAIM
-- claim job (process_caim_webhook_event) when testing or correcting operational mistakes.
--
-- What this migration does:
--   1. Defines public.super_revert_caim_stock_in(p_return_log_id UUID, p_reason TEXT)
--      - Enforces SUPER role authorization (assert_super_revert_authorized)
--      - Locks row and verifies that a CAIM stock-in exists
--      - Verifies available stock balance >= 1 to prevent negative inventory
--      - Verifies equipment S/N has not been re-loaned out elsewhere
--      - Inserts compensating stock_transactions row ('stock_out', 'caim_stock_in_revert')
--      - Resets return log caim pointers and sets repair_resolution_status = 'unresolved'
--      - Records append-only audit log in public.audit_logs
--   2. Grants execute permissions to authenticated and service_role
--   3. Adds self-verification block to guarantee function existence and attributes
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.super_revert_caim_stock_in(
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
  v_project_id UUID;
  v_storage_location_id UUID;
  v_item_id UUID;
  v_qty NUMERIC := 1;
  v_serial TEXT;
  v_available NUMERIC;
BEGIN
  -- 1. Authorization: Only SUPER role permitted
  v_user_id := public.assert_super_revert_authorized(p_reason);

  -- 2. Lock return log row
  SELECT * INTO v_log
  FROM public.checkout_return_logs
  WHERE id = p_return_log_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Return log not found: %', p_return_log_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Validate that CAIM stock-in actually occurred on this item
  IF v_log.caim_stock_in_order_id IS NULL AND v_log.caim_inbound_processed_at IS NULL THEN
    RAISE EXCEPTION 'INVALID_STATE: รายการนี้ไม่ได้ถูกรับเข้าสต็อกจากงานเคลม CAIM'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Identify target warehouse and item
  IF v_log.caim_stock_in_order_id IS NOT NULL THEN
    SELECT sio.project_id, sio.storage_location_id, sii.item_id, COALESCE(sii.quantity, 1), sii.serial_number
    INTO v_project_id, v_storage_location_id, v_item_id, v_qty, v_serial
    FROM public.stock_in_orders sio
    JOIN public.stock_in_items sii ON sii.order_id = sio.id
    WHERE sio.id = v_log.caim_stock_in_order_id
    LIMIT 1;
  END IF;

  -- Fallback to source checkout line if order line lookup didn't populate
  IF v_item_id IS NULL THEN
    SELECT ci.item_id, ci.serial_number, COALESCE(v_log.destination_project_id, co.project_id), 1
    INTO v_item_id, v_serial, v_project_id, v_qty
    FROM public.checkout_items ci
    JOIN public.checkout_orders co ON co.id = ci.checkout_order_id
    WHERE ci.id = v_log.checkout_item_id;
  END IF;

  v_serial := COALESCE(v_serial, v_log.replaced_serial_number);
  v_qty := COALESCE(v_qty, 1);

  IF v_project_id IS NULL OR v_item_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_STATE: ไม่สามารถระบุคลังหรือพัสดุของรายการนี้ได้'
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Mutex lock on item to avoid concurrency deadlock
  PERFORM 1 FROM public.items WHERE id = v_item_id ORDER BY id FOR UPDATE;

  -- 6. Pre-flight stock check: Ensure warehouse has enough stock to deduct
  SELECT COALESCE(balance, 0) INTO v_available
  FROM public.stock_balance
  WHERE project_id = v_project_id AND item_id = v_item_id;

  IF COALESCE(v_available, 0) < v_qty THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: ไม่สามารถย้อนการรับเข้าได้ เนื่องจากพัสดุถูกเบิกหรือจ่ายออกไปแล้ว (คงเหลือ %, ต้องการหักออก %)',
      COALESCE(v_available, 0), v_qty
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. Serial number guard: Ensure serialized equipment was not re-loaned out in another order
  IF v_serial IS NOT NULL AND TRIM(v_serial) <> '' AND TRIM(v_serial) <> '-' THEN
    IF EXISTS (
      SELECT 1
      FROM public.checkout_items ci
      JOIN public.checkout_orders co ON co.id = ci.checkout_order_id
      WHERE ci.serial_number = TRIM(v_serial)
        AND (v_log.checkout_order_id IS NULL OR ci.checkout_order_id <> v_log.checkout_order_id)
        AND co.status IN ('active', 'overdue', 'partial_returned')
        AND (COALESCE(ci.quantity_borrowed, 0) - COALESCE(ci.quantity_returned, 0) - COALESCE(ci.quantity_damaged, 0) - COALESCE(ci.quantity_lost, 0) - COALESCE(ci.quantity_consumed, 0)) > 0
    ) THEN
      RAISE EXCEPTION 'EQUIPMENT_ALREADY_RELOANED: ไม่สามารถย้อนการรับเข้าได้ เนื่องจากอุปกรณ์ S/N % ถูกนำไปให้ยืมในใบยืมอื่นแล้ว', TRIM(v_serial)
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 8. Compensating ledger transaction (Immutable ledger standard)
  INSERT INTO public.stock_transactions (
    project_id, storage_location_id, item_id, transaction_type, quantity,
    reference_id, reference_type, created_by, notes
  ) VALUES (
    v_project_id, v_storage_location_id, v_item_id,
    'stock_out', v_qty::INTEGER,
    p_return_log_id, 'caim_stock_in_revert', v_user_id,
    'SUPER ย้อนการรับเข้าพัสดุจาก CAIM (Ticket ' || COALESCE(v_log.caim_ticket_id, '-') || '): ' || BTRIM(p_reason)
  );

  -- 9. Reset return log status back to unresolved and clear CAIM inbound flags
  UPDATE public.checkout_return_logs
  SET caim_inbound_processed_at = NULL,
      caim_repair_result = NULL,
      caim_closed_at = NULL,
      caim_stock_in_order_id = NULL,
      repair_resolution_status = 'unresolved',
      repair_notes = NULL,
      repair_resolved_at = NULL,
      repair_resolved_by = NULL,
      restored_stock_in_order_id = NULL
  WHERE id = p_return_log_id;

  -- 10. Append-only audit logging
  PERFORM public.record_super_revert_audit(
    'CAIM_STOCK_IN_REVERT',
    'checkout_return_logs',
    p_return_log_id,
    COALESCE(v_log.repair_resolution_status, 'restored_to_stock'),
    'unresolved',
    p_reason,
    jsonb_build_object(
      'checkout_order_id', v_log.checkout_order_id,
      'caim_ticket_id', v_log.caim_ticket_id,
      'caim_stock_in_order_id', v_log.caim_stock_in_order_id,
      'item_id', v_item_id,
      'project_id', v_project_id,
      'quantity', v_qty
    )
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'return_log_id', p_return_log_id,
    'reverted_quantity', v_qty,
    'project_id', v_project_id,
    'new_status', 'unresolved',
    'message', 'ย้อนการรับเข้าพัสดุจาก CAIM สำเร็จ'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.super_revert_caim_stock_in(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_revert_caim_stock_in(UUID, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Self-test verification
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'super_revert_caim_stock_in'
      AND p.prosecdef = TRUE
  ) THEN
    RAISE EXCEPTION 'Migration 94 validation failed: super_revert_caim_stock_in must exist and be SECURITY DEFINER';
  END IF;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
