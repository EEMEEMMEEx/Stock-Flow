-- ===========================================================================
-- Migration 107: Allow internal_repair status in resolve_damaged_return_item
-- ---------------------------------------------------------------------------
-- Fix 400 error when resolving 'consumed' items routed to the internal repair
-- queue via mark_return_for_internal_repair (caim_inbound_status = 'internal_repair').
-- Previously resolve_damaged_return_item only allowed 'retried_internal'.
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
BEGIN
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
      WHERE p.id = v_caller_id AND r.code IN ('ADMIN', 'SUPER')
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

  SELECT * INTO v_log
  FROM public.checkout_return_logs
  WHERE id = v_return_log_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบรายการรับคืน ID: %', v_return_log_id;
  END IF;

  -- Allow damaged, needs_repair, OR items routed to internal repair / retried from CAIM (e.g. consumed)
  IF v_log.item_condition NOT IN ('damaged', 'needs_repair')
     AND COALESCE(v_log.caim_inbound_status, 'none') NOT IN ('retried_internal', 'internal_repair') THEN
    RAISE EXCEPTION 'จัดการซ่อมได้เฉพาะรายการที่รับคืนสภาพชำรุด/ส่งซ่อม หรือส่งเข้าคิวซ่อมภายใน/ตีกลับจาก CAIM เท่านั้น (สภาพปัจจุบัน: %)', v_log.item_condition;
  END IF;

  IF v_log.repair_resolution_status <> 'unresolved' THEN
    RAISE EXCEPTION 'รายการนี้ถูกบันทึกผลการซ่อมไปแล้ว (สถานะ: %)', v_log.repair_resolution_status;
  END IF;

  -- Mutual Exclusion: Disallow in-house repair while pending confirmation in CAIM
  IF v_log.caim_inbound_status = 'pending_confirmation' THEN
    RAISE EXCEPTION 'รายการนี้อยู่ระหว่างรอการยืนยันผลเคลมจาก CAIM ไม่สามารถซ่อมภายในได้';
  END IF;

  IF v_log.caim_ticket_id IS NOT NULL AND v_log.caim_inbound_status NOT IN ('none', 'rejected', 'retried_internal', 'internal_repair') THEN
    RAISE EXCEPTION 'รายการนี้ถูกส่งเคลม CAIM แล้ว (Ticket: %) ไม่สามารถซ่อมภายในได้', v_log.caim_ticket_id;
  END IF;

  IF v_log.caim_stock_in_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'รายการนี้ถูกรับเข้าคลังผ่านงานเคลม CAIM แล้ว ไม่สามารถคืนสต็อกซ้ำได้';
  END IF;

  IF v_log.caim_scrap_disposal_id IS NOT NULL THEN
    RAISE EXCEPTION 'รายการนี้ถูกแทงจำหน่ายผ่านงานเคลม CAIM แล้ว ไม่สามารถดำเนินการซ้ำได้';
  END IF;

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

  v_quantity := COALESCE(NULLIF(TRIM(COALESCE(p_payload->>'quantity', '')), '')::NUMERIC, v_log.returned_quantity, 1);
  IF v_quantity <= 0 OR v_quantity > v_log.returned_quantity THEN
    RAISE EXCEPTION 'จำนวนที่บันทึกผลไม่ถูกต้อง (ระบุ: %, คืนไว้: %)', v_quantity, v_log.returned_quantity;
  END IF;

  SELECT full_name INTO v_caller_name FROM public.profiles WHERE id = v_caller_id;

  -- 1. Restored to stock
  IF v_resolution = 'restored_to_stock' THEN
    IF v_spare_item_id IS NOT NULL THEN
      IF v_spare_qty <= 0 THEN
        RAISE EXCEPTION 'จำนวนอะไหล่ที่ใช้ต้องมากกว่า 0';
      END IF;

      SELECT current_stock INTO v_available
      FROM public.v_current_stock
      WHERE project_id = v_project_id AND item_id = v_spare_item_id;

      IF COALESCE(v_available, 0) < v_spare_qty THEN
        RAISE EXCEPTION 'อะไหล่ชิ้นส่วนคงเหลือไม่พอ (มีอยู่: %, ต้องการใช้: %)', COALESCE(v_available, 0), v_spare_qty;
      END IF;

      INSERT INTO public.stock_transactions (
        project_id, item_id, quantity, transaction_type, reference_type, reference_id, created_by, notes
      ) VALUES (
        v_project_id, v_spare_item_id, -v_spare_qty, 'withdrawal', 'spare_part_usage', v_return_log_id, v_caller_id,
        'ตัดใช้อะไหล่ซ่อมอุปกรณ์คืนจากใบยืม ' || COALESCE(v_order_number, '-')
      );
    END IF;

    INSERT INTO public.stock_in_orders (
      project_id, supplier, notes, received_date, created_by
    ) VALUES (
      v_project_id,
      'ซ่อมภายในคลัง — อ้างอิงใบยืม ' || COALESCE(v_order_number, '-'),
      'รับเข้าอุปกรณ์ที่ซ่อมเสร็จแล้ว | ' || COALESCE(v_repair_notes, '-'),
      CURRENT_DATE,
      v_caller_id
    ) RETURNING id INTO v_stock_in_order;

    INSERT INTO public.stock_in_items (
      order_id, item_id, quantity, serial_number, notes
    ) VALUES (
      v_stock_in_order, v_item_id, v_quantity,
      COALESCE(v_serial, v_log.returned_serial_number, v_log.replaced_serial_number, v_item_serial),
      'อุปกรณ์ที่ซ่อมเสร็จจากรายการรับคืน ' || v_return_log_id::TEXT
    );

    INSERT INTO public.stock_transactions (
      project_id, item_id, quantity, transaction_type, reference_type, reference_id, created_by, notes
    ) VALUES (
      v_project_id, v_item_id, v_quantity, 'stock_in', 'damaged_repair_restore', v_return_log_id, v_caller_id,
      'รับคืนอุปกรณ์ที่ผ่านการซ่อมแล้วเข้าสต็อก'
    );

  -- 2. Scrapped or Parts Harvested
  ELSE
    INSERT INTO public.scrap_disposal_items (
      checkout_return_log_id, checkout_order_id, project_id, item_id, quantity,
      serial_number, reason, disposal_method, notes, closed_by
    ) VALUES (
      v_return_log_id, v_log.checkout_order_id, v_project_id, v_item_id, v_quantity,
      COALESCE(v_serial, v_log.returned_serial_number, v_log.replaced_serial_number, v_item_serial),
      COALESCE(v_repair_notes, 'ซ่อมไม่ได้ / แยกอะไหล่'),
      COALESCE(v_disposal_method, 'electronic_waste'),
      v_repair_notes,
      COALESCE(v_caller_name, 'In-house Technician')
    ) RETURNING id INTO v_scrap_id;

    IF v_resolution = 'parts_harvested' AND v_harvest_item_id IS NOT NULL THEN
      IF v_harvest_qty <= 0 THEN
        RAISE EXCEPTION 'จำนวนชิ้นส่วนที่แยกได้ต้องมากกว่า 0';
      END IF;

      INSERT INTO public.stock_in_orders (
        project_id, supplier, notes, received_date, created_by
      ) VALUES (
        v_project_id,
        'Parts Harvest — ใบยืม ' || COALESCE(v_order_number, '-'),
        'รับเข้าชิ้นส่วนจากการแยกอะไหล่ | ' || COALESCE(v_repair_notes, '-'),
        CURRENT_DATE,
        v_caller_id
      ) RETURNING id INTO v_harvest_order;

      INSERT INTO public.stock_in_items (
        order_id, item_id, quantity, notes
      ) VALUES (
        v_harvest_order, v_harvest_item_id, v_harvest_qty,
        'ชิ้นส่วนที่แยกได้จากอุปกรณ์คืนชำรุด ' || v_return_log_id::TEXT
      );

      INSERT INTO public.stock_transactions (
        project_id, item_id, quantity, transaction_type, reference_type, reference_id, created_by, notes
      ) VALUES (
        v_project_id, v_harvest_item_id, v_harvest_qty, 'stock_in', 'parts_harvest_in', v_return_log_id, v_caller_id,
        'รับเข้าชิ้นส่วนจากการแยกอะไหล่อุปกรณ์ชำรุด'
      );
    END IF;
  END IF;

  UPDATE public.checkout_return_logs
  SET repair_resolution_status = v_resolution,
      repair_resolved_at = now(),
      repair_resolved_by = v_caller_id,
      repair_notes = v_repair_notes,
      repair_stock_in_order_id = v_stock_in_order,
      repair_scrap_disposal_id = v_scrap_id,
      spare_part_item_id = v_spare_item_id,
      spare_part_quantity = CASE WHEN v_spare_item_id IS NOT NULL THEN v_spare_qty ELSE NULL END
  WHERE id = v_return_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'return_log_id', v_return_log_id,
    'resolution', v_resolution,
    'stock_in_order_id', v_stock_in_order,
    'scrap_disposal_id', v_scrap_id,
    'harvest_order_id', v_harvest_order,
    'message', CASE
      WHEN v_resolution = 'restored_to_stock' THEN 'บันทึกซ่อมเสร็จและรับคืนเข้าสต็อกเรียบร้อยแล้ว'
      WHEN v_resolution = 'parts_harvested' THEN 'บันทึกแยกอะไหล่และรับชิ้นส่วนดีเข้าสต็อกเรียบร้อยแล้ว'
      ELSE 'บันทึกแทงจำหน่ายของเสียเรียบร้อยแล้ว'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_damaged_return_item(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_damaged_return_item(JSONB) TO authenticated, service_role;

COMMIT;
