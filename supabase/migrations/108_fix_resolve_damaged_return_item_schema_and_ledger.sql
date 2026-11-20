-- ===========================================================================
-- Migration 108: Fix resolve_damaged_return_item Schema & Ledger Mismatches
-- ---------------------------------------------------------------------------
-- Root causes fixed (regressions introduced in migrations 102/103/107):
--   1. Updated nonexistent column `repair_stock_in_order_id` on
--      `checkout_return_logs` (SQLSTATE 42703) instead of
--      `restored_stock_in_order_id` — which triggered `isSchemaMismatchError`
--      in RepairResolutionModal ("migration 82 missing").
--   2. Queried nonexistent view `public.v_current_stock` (SQLSTATE 42P01)
--      instead of `public.stock_balance(balance)`.
--   3. Deducted spare parts with `transaction_type = 'withdrawal'` and
--      negative quantity (violates `stock_transactions_transaction_type_check`
--      SQLSTATE 23514 and breaks `stock_balance` math) instead of positive
--      `'stock_out'`.
--   4. Restored canonical `reference_type` values ('repair_restored',
--      'repair_spare_part', 'parts_harvest') required by migration 85
--      (`super_revert_checkout_repair`), plus `storage_location_id`,
--      `po_number`, `items` row mutex locking, and full input validation,
--      while preserving `caim_inbound_status` ('retried_internal',
--      'internal_repair'), `returned_serial_number`, and `closed_by`.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_damaged_return_item(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_return_log_id UUID := NULLIF(TRIM(COALESCE(p_payload->>'return_log_id', '')), '')::UUID;
  v_resolution TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_payload->>'resolution', '')), ''), 'restored_to_stock');
  v_project_id UUID := NULLIF(TRIM(COALESCE(p_payload->>'project_id', '')), '')::UUID;
  v_storage_location_id UUID := NULLIF(TRIM(COALESCE(p_payload->>'storage_location_id', '')), '')::UUID;
  v_repair_notes TEXT := NULLIF(TRIM(COALESCE(p_payload->>'repair_notes', '')), '');
  v_reference TEXT := NULLIF(TRIM(COALESCE(p_payload->>'reference_number', '')), '');
  v_serial TEXT := NULLIF(TRIM(COALESCE(p_payload->>'serial_number', '')), '');
  v_disposal_method TEXT := NULLIF(TRIM(COALESCE(p_payload->>'disposal_method', '')), '');
  v_spare_item_id UUID := NULLIF(TRIM(COALESCE(p_payload->>'spare_part_item_id', '')), '')::UUID;
  v_spare_qty NUMERIC := COALESCE(NULLIF(TRIM(COALESCE(p_payload->>'spare_part_quantity', '')), '')::NUMERIC, 1);
  v_harvest_item_id UUID := NULLIF(TRIM(COALESCE(p_payload->>'harvested_item_id', '')), '')::UUID;
  v_harvest_qty NUMERIC := COALESCE(NULLIF(TRIM(COALESCE(p_payload->>'harvested_quantity', '')), '')::NUMERIC, 1);
  v_quantity NUMERIC;
  v_log RECORD;
  v_item_id UUID;
  v_item_serial TEXT;
  v_order_number TEXT;
  v_order_project_id UUID;
  v_available NUMERIC;
  v_stock_in_order UUID;
  v_harvest_order UUID;
  v_scrap_id UUID;
  v_caller_name TEXT;
  v_lock RECORD;
  v_lock_ids UUID[];
BEGIN
  -- 1. Authorization
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.resolve_repair')
    OR public.has_permission(v_caller_id, 'checkouts.return')
    OR public.has_permission(v_caller_id, 'stock_in.create')
    OR public.is_super_admin(v_caller_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = v_caller_id
        AND COALESCE(p.status, 'active') = 'active'
        AND r.code IN ('ADMIN', 'SUPER')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.resolve_repair, checkouts.return, or stock_in.create permission.';
  END IF;

  IF v_return_log_id IS NULL THEN
    RAISE EXCEPTION 'return_log_id is required';
  END IF;

  IF v_resolution NOT IN ('restored_to_stock', 'parts_harvested', 'scrapped') THEN
    RAISE EXCEPTION 'Unsupported resolution: %', v_resolution;
  END IF;

  -- 2. Lock return log row and enforce state/CAIM mutual exclusion
  SELECT * INTO v_log
  FROM public.checkout_return_logs
  WHERE id = v_return_log_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบรายการรับคืน ID: %', v_return_log_id;
  END IF;

  IF v_log.item_condition NOT IN ('damaged', 'needs_repair')
     AND COALESCE(v_log.caim_inbound_status, 'none') NOT IN ('retried_internal', 'internal_repair') THEN
    RAISE EXCEPTION 'จัดการซ่อมได้เฉพาะรายการที่รับคืนสภาพชำรุด/ส่งซ่อม หรือส่งเข้าคิวซ่อมภายใน/ตีกลับจาก CAIM เท่านั้น (สภาพปัจจุบัน: %)', v_log.item_condition;
  END IF;

  IF COALESCE(v_log.repair_resolution_status, 'unresolved') <> 'unresolved' THEN
    RAISE EXCEPTION 'รายการนี้ถูกบันทึกผลการซ่อมไปแล้ว (สถานะ: %)', v_log.repair_resolution_status;
  END IF;

  IF v_log.caim_inbound_status = 'pending_confirmation' THEN
    RAISE EXCEPTION 'รายการนี้อยู่ระหว่างรอการยืนยันผลเคลมจาก CAIM ไม่สามารถซ่อมภายในได้';
  END IF;

  IF v_log.caim_ticket_id IS NOT NULL
     AND COALESCE(v_log.caim_inbound_status, 'none') NOT IN ('none', 'rejected', 'retried_internal', 'internal_repair') THEN
    RAISE EXCEPTION 'รายการนี้ถูกส่งเคลม CAIM แล้ว (Ticket: %) ไม่สามารถซ่อมภายในได้', v_log.caim_ticket_id;
  END IF;

  IF v_log.caim_stock_in_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'รายการนี้ถูกรับเข้าคลังผ่านงานเคลม CAIM แล้ว ไม่สามารถคืนสต็อกซ้ำได้';
  END IF;

  IF v_log.caim_scrap_disposal_id IS NOT NULL THEN
    RAISE EXCEPTION 'รายการนี้ถูกแทงจำหน่ายผ่านงานเคลม CAIM แล้ว ไม่สามารถดำเนินการซ้ำได้';
  END IF;

  IF v_log.caim_inbound_processed_at IS NOT NULL
     AND COALESCE(v_log.caim_inbound_status, 'none') NOT IN ('rejected', 'retried_internal', 'internal_repair') THEN
    RAISE EXCEPTION 'รายการนี้ถูกประมวลผลผ่านงานเคลม CAIM แล้ว ไม่สามารถดำเนินการซ้ำได้';
  END IF;

  -- 3. Resolve source item & destination warehouse
  SELECT ci.item_id, ci.serial_number, co.project_id, co.order_number
  INTO v_item_id, v_item_serial, v_order_project_id, v_order_number
  FROM public.checkout_items ci
  JOIN public.checkout_orders co ON co.id = ci.checkout_order_id
  WHERE ci.id = v_log.checkout_item_id;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการอุปกรณ์ต้นทางของ return log %', v_return_log_id;
  END IF;

  v_project_id := COALESCE(v_project_id, v_log.destination_project_id, v_order_project_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุคลัง/โครงการปลายทางที่รับอุปกรณ์กลับเข้าสต็อก';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_project_id) THEN
    RAISE EXCEPTION 'ไม่พบโครงการ/คลัง ID: %', v_project_id;
  END IF;

  IF v_storage_location_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.storage_locations WHERE id = v_storage_location_id) THEN
    RAISE EXCEPTION 'ไม่พบสถานที่จัดเก็บ ID: %', v_storage_location_id;
  END IF;

  -- 4. Validate quantity, notes, serial, and spare/harvest inputs
  v_quantity := COALESCE(
    NULLIF(TRIM(COALESCE(p_payload->>'quantity', '')), '')::NUMERIC,
    v_log.returned_quantity,
    1
  );

  IF v_quantity <= 0 THEN
    RAISE EXCEPTION 'จำนวนต้องมากกว่า 0';
  END IF;

  IF v_quantity <> TRUNC(v_quantity) THEN
    RAISE EXCEPTION 'จำนวนต้องเป็นจำนวนเต็ม (รับมา: %)', v_quantity;
  END IF;

  IF v_log.returned_quantity IS NOT NULL AND v_quantity > v_log.returned_quantity THEN
    RAISE EXCEPTION 'จำนวนที่จัดการ (%) เกินจำนวนที่รับคืนไว้ (%)', v_quantity, v_log.returned_quantity;
  END IF;

  IF v_repair_notes IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุรายละเอียดการซ่อม/เหตุผลการจำหน่าย';
  END IF;

  v_serial := COALESCE(v_serial, v_log.returned_serial_number, v_log.replaced_serial_number, v_item_serial);

  IF v_resolution <> 'restored_to_stock' THEN
    v_spare_item_id := NULL;
  END IF;

  IF v_spare_item_id IS NOT NULL THEN
    IF v_spare_item_id = v_item_id THEN
      RAISE EXCEPTION 'อะไหล่ที่ตัดสต็อกต้องไม่ใช่ตัวอุปกรณ์หลัก';
    END IF;
    IF v_spare_qty <= 0 OR v_spare_qty <> TRUNC(v_spare_qty) THEN
      RAISE EXCEPTION 'จำนวนอะไหล่ต้องเป็นจำนวนเต็มมากกว่า 0';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.items WHERE id = v_spare_item_id) THEN
      RAISE EXCEPTION 'ไม่พบอะไหล่ ID: %', v_spare_item_id;
    END IF;
  END IF;

  IF v_harvest_item_id IS NOT NULL THEN
    IF v_harvest_item_id = v_item_id THEN
      RAISE EXCEPTION 'ชิ้นส่วนที่รับเข้าต้องไม่ใช่ตัวอุปกรณ์หลัก';
    END IF;
    IF v_harvest_qty <= 0 OR v_harvest_qty <> TRUNC(v_harvest_qty) THEN
      RAISE EXCEPTION 'จำนวนชิ้นส่วนที่รับเข้าต้องเป็นจำนวนเต็มมากกว่า 0';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.items WHERE id = v_harvest_item_id) THEN
      RAISE EXCEPTION 'ไม่พบชิ้นส่วน ID: %', v_harvest_item_id;
    END IF;
  END IF;

  -- 5. Deterministic item-level mutex lock (matches inventory/checkout RPC lock order)
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_lock_ids
  FROM unnest(ARRAY[v_item_id, v_spare_item_id, v_harvest_item_id]) AS t(x)
  WHERE x IS NOT NULL;

  IF v_lock_ids IS NOT NULL THEN
    FOR v_lock IN SELECT id FROM public.items WHERE id = ANY(v_lock_ids) ORDER BY id FOR UPDATE
    LOOP
      NULL;
    END LOOP;
  END IF;

  -- 6. Re-check spare part availability using real stock_balance view
  IF v_resolution = 'restored_to_stock' AND v_spare_item_id IS NOT NULL THEN
    SELECT COALESCE(balance, 0) INTO v_available
    FROM public.stock_balance
    WHERE project_id = v_project_id AND item_id = v_spare_item_id;

    IF COALESCE(v_available, 0) < v_spare_qty THEN
      RAISE EXCEPTION 'สต็อกอะไหล่ไม่เพียงพอ (คงเหลือ % ต้องการ %)', COALESCE(v_available, 0), v_spare_qty;
    END IF;
  END IF;

  SELECT full_name INTO v_caller_name FROM public.profiles WHERE id = v_caller_id;

  -- 7. Execute resolution atomically
  IF v_resolution = 'restored_to_stock' THEN
    INSERT INTO public.stock_in_orders (
      project_id, storage_location_id, supplier, po_number, notes, received_date, created_by
    ) VALUES (
      v_project_id,
      v_storage_location_id,
      'Repair & Restore',
      v_reference,
      'ซ่อมเสร็จ/คืนสภาพเข้าคลัง — อ้างอิงใบยืม ' || COALESCE(v_order_number, '-')
        || ' | ' || v_repair_notes,
      CURRENT_DATE,
      v_caller_id
    ) RETURNING id INTO v_stock_in_order;

    INSERT INTO public.stock_in_items (
      order_id, item_id, quantity, serial_number, notes
    ) VALUES (
      v_stock_in_order,
      v_item_id,
      v_quantity::INTEGER,
      v_serial,
      'รับคืนหลังซ่อมจากรายการรับคืน ' || v_return_log_id::TEXT
    );

    INSERT INTO public.stock_transactions (
      project_id, storage_location_id, item_id, quantity, transaction_type,
      reference_type, reference_id, created_by, notes
    ) VALUES (
      v_project_id,
      v_storage_location_id,
      v_item_id,
      v_quantity::INTEGER,
      'stock_in',
      'repair_restored',
      v_return_log_id,
      v_caller_id,
      'ซ่อมเสร็จคืนเข้าคลัง: ' || v_repair_notes
        || ' (ใบยืม ' || COALESCE(v_order_number, '-') || ')'
    );

    IF v_spare_item_id IS NOT NULL THEN
      INSERT INTO public.stock_transactions (
        project_id, storage_location_id, item_id, quantity, transaction_type,
        reference_type, reference_id, created_by, notes
      ) VALUES (
        v_project_id,
        v_storage_location_id,
        v_spare_item_id,
        v_spare_qty::INTEGER,
        'stock_out',
        'repair_spare_part',
        v_return_log_id,
        v_caller_id,
        'ตัดสต็อกอะไหล่ย่อยเพื่อซ่อมอุปกรณ์' || COALESCE(' (ใบยืม ' || v_order_number || ')', '')
      );
    END IF;
  ELSE
    INSERT INTO public.scrap_disposal_items (
      checkout_return_log_id, checkout_order_id, project_id, item_id, quantity,
      serial_number, reason, disposal_method, notes, closed_by
    ) VALUES (
      v_return_log_id,
      v_log.checkout_order_id,
      v_project_id,
      v_item_id,
      v_quantity::INTEGER,
      v_serial,
      v_repair_notes,
      COALESCE(
        v_disposal_method,
        CASE WHEN v_resolution = 'parts_harvested' THEN 'parts_harvest' ELSE 'electronic_waste' END
      ),
      'อ้างอิงใบยืม ' || COALESCE(v_order_number, '-'),
      COALESCE(v_caller_name, 'In-house Technician')
    ) RETURNING id INTO v_scrap_id;

    IF v_resolution = 'parts_harvested' AND v_harvest_item_id IS NOT NULL THEN
      INSERT INTO public.stock_in_orders (
        project_id, storage_location_id, supplier, po_number, notes, received_date, created_by
      ) VALUES (
        v_project_id,
        v_storage_location_id,
        'Parts Harvest',
        v_reference,
        'รับเข้าชิ้นส่วนจากการแยกอะไหล่ — อ้างอิงใบยืม ' || COALESCE(v_order_number, '-')
          || ' | ' || v_repair_notes,
        CURRENT_DATE,
        v_caller_id
      ) RETURNING id INTO v_harvest_order;

      INSERT INTO public.stock_in_items (
        order_id, item_id, quantity, notes
      ) VALUES (
        v_harvest_order,
        v_harvest_item_id,
        v_harvest_qty::INTEGER,
        'ชิ้นส่วนที่ยังใช้งานได้จากรายการรับคืน ' || v_return_log_id::TEXT
      );

      INSERT INTO public.stock_transactions (
        project_id, storage_location_id, item_id, quantity, transaction_type,
        reference_type, reference_id, created_by, notes
      ) VALUES (
        v_project_id,
        v_storage_location_id,
        v_harvest_item_id,
        v_harvest_qty::INTEGER,
        'stock_in',
        'parts_harvest',
        v_return_log_id,
        v_caller_id,
        'รับเข้าชิ้นส่วนที่ยังใช้งานได้จากการแยกอะไหล่'
          || COALESCE(' (ใบยืม ' || v_order_number || ')', '')
      );
    END IF;
  END IF;

  -- 8. Update checkout_return_logs using canonical column `restored_stock_in_order_id`
  UPDATE public.checkout_return_logs
  SET repair_resolution_status = v_resolution,
      repair_notes = v_repair_notes,
      repair_resolved_at = now(),
      repair_resolved_by = v_caller_id,
      restored_stock_in_order_id = CASE
        WHEN v_resolution = 'restored_to_stock' THEN v_stock_in_order
        ELSE v_harvest_order
      END,
      repair_scrap_disposal_id = v_scrap_id,
      spare_part_item_id = v_spare_item_id,
      spare_part_quantity = CASE WHEN v_spare_item_id IS NULL THEN NULL ELSE v_spare_qty END
  WHERE id = v_return_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'return_log_id', v_return_log_id,
    'resolution', v_resolution,
    'project_id', v_project_id,
    'quantity', v_quantity,
    'stock_in_order_id', CASE
      WHEN v_resolution = 'restored_to_stock' THEN v_stock_in_order
      ELSE v_harvest_order
    END,
    'harvest_order_id', v_harvest_order,
    'scrap_disposal_id', v_scrap_id,
    'spare_part_item_id', v_spare_item_id,
    'spare_part_quantity', CASE WHEN v_spare_item_id IS NULL THEN NULL ELSE v_spare_qty END,
    'message', CASE v_resolution
      WHEN 'restored_to_stock' THEN 'บันทึกซ่อมเสร็จและคืนอุปกรณ์เข้าคลังเรียบร้อย (+' || v_quantity::TEXT || ')'
      WHEN 'parts_harvested' THEN 'บันทึกการแยกอะไหล่เรียบร้อย (ไม่ได้คืนสต็อกตัวหลัก)'
      ELSE 'บันทึกการแทงจำหน่ายของเสียเรียบร้อย (ไม่ได้คืนสต็อก)'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_damaged_return_item(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_damaged_return_item(JSONB) TO authenticated, service_role;

-- 9. Self-verification guard inside transaction
DO $$
DECLARE
  v_src TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'checkout_return_logs'
      AND column_name = 'restored_stock_in_order_id'
  ) THEN
    RAISE EXCEPTION 'Migration 108 guard failed: checkout_return_logs.restored_stock_in_order_id missing';
  END IF;

  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'resolve_damaged_return_item'
    AND p.prosecdef = true;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'Migration 108 guard failed: public.resolve_damaged_return_item SECURITY DEFINER missing';
  END IF;

  IF v_src ~* 'repair_stock_in_order_id|v_current_stock|''withdrawal''' THEN
    RAISE EXCEPTION 'Migration 108 guard failed: stale schema identifiers detected in resolve_damaged_return_item';
  END IF;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
