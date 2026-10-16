-- Migration 82: Partial Damage & Component Repair Resolution
-- (ซ่อมเสร็จคืนคลัง / แยกอะไหล่ / แทงจำหน่าย สำหรับรายการคืนสภาพชำรุดบางส่วน)
-- ---------------------------------------------------------------------------
-- CONTEXT
--   ตามแผน docs/partial-damage-component-repair-plan.md §6.1
--   ปัจจุบันเมื่อรับคืนอุปกรณ์สภาพ 'damaged' / 'needs_repair' นั้น process_return_order
--   ไม่สร้าง stock movement ใด ๆ (สต็อกถูกตัดไปตั้งแต่ตอนอนุมัติยืม) และไม่มีที่ให้บันทึกว่า
--   "ซ่อมเสร็จแล้ว" จึงเกิด Dead-End State เช่นใบยืม CHK-202610-3252
--   (HEAT EXCHANGER 65W/K DC HEX — บอร์ด Control เสีย แต่พัดลมยังใช้งานได้)
--   ที่ต้องไปคีย์รับเข้า /stock-in เองแบบ Manual
--
-- WHAT THIS MIGRATION DOES
--   1. เพิ่มคอลัมน์ติดตามผลการซ่อมใน public.checkout_return_logs
--      - repair_resolution_status : 'unresolved' (ค่าเริ่มต้น) | 'restored_to_stock'
--                                   | 'parts_harvested' | 'scrapped'
--      - repair_notes / repair_resolved_at / repair_resolved_by
--      - restored_stock_in_order_id   : เอกสารรับเข้าที่สร้างจากการซ่อมเสร็จ
--      - repair_scrap_disposal_id     : ทะเบียนของเสียที่สร้างจากการแยกอะไหล่/แทงจำหน่าย
--      - spare_part_item_id / spare_part_quantity : อะไหล่ย่อยที่ตัดสต็อกเพื่อใช้ซ่อม
--   2. Backfill รายการที่งานเคลม CAIM รับเข้าคลัง/บันทึกของเสียไปแล้ว
--      (caim_inbound_processed_at IS NOT NULL) ให้เป็น 'restored_to_stock' / 'scrapped'
--      เพื่อกันการกดซ่อมเสร็จซ้ำแล้วปั๊มสต็อกเป็นสองเท่า
--   3. RPC public.resolve_damaged_return_item(p_payload JSONB)
--      - restored_to_stock : สร้าง stock_in_orders + stock_in_items + stock_transactions
--        ('stock_in', reference_type = 'repair_restored') => stock_balance +N
--        พร้อมตัดสต็อกอะไหล่ย่อย (spare_part_item_id) ด้วย 'stock_out' ใน Transaction เดียวกัน
--      - parts_harvested / scrapped : บันทึก public.scrap_disposal_items
--        (กรณี parts_harvested รับเข้าชิ้นส่วนที่ยังดีเป็นอะไหล่สำรองได้ถ้าระบุ harvested_item_id)
--      - ล็อกแถว checkout_return_logs ด้วย FOR UPDATE + ตรวจ repair_resolution_status = 'unresolved'
--        => กดซ้ำไม่ได้ (Idempotent)
--      - ล็อกแถว public.items เรียงตาม item_id (mutex ต่อ item) เหมือน approve_inventory_request /
--        approve_checkout_order เพื่อไม่ให้เกิด deadlock กับ RPC ที่ตัดสต็อก item เดียวกัน
--
-- SECURITY
--   - SECURITY DEFINER, SET search_path = public, auth, pg_temp
--   - ต้องมี checkouts.return หรือ stock_in.create หรือ super admin
--   - REVOKE จาก PUBLIC/anon, GRANT เฉพาะ authenticated, service_role
--
-- COMPATIBILITY
--   - additive ทั้งหมด (ไม่มี DROP/UPDATE ข้อมูลเดิม ยกเว้น backfill สถานะจาก CAIM ที่มีอยู่แล้ว)
--   - process_return_order / process_caim_webhook_event ไม่ถูกแก้ไข
--
-- ROLLBACK
--   BEGIN;
--     DROP FUNCTION IF EXISTS public.resolve_damaged_return_item(JSONB);
--     ALTER TABLE public.checkout_return_logs
--       DROP COLUMN IF EXISTS repair_resolution_status,
--       DROP COLUMN IF EXISTS repair_notes,
--       DROP COLUMN IF EXISTS repair_resolved_at,
--       DROP COLUMN IF EXISTS repair_resolved_by,
--       DROP COLUMN IF EXISTS restored_stock_in_order_id,
--       DROP COLUMN IF EXISTS repair_scrap_disposal_id,
--       DROP COLUMN IF EXISTS spare_part_item_id,
--       DROP COLUMN IF EXISTS spare_part_quantity;
--     DROP INDEX IF EXISTS public.idx_checkout_return_logs_repair_pending;
--   COMMIT;
--   หมายเหตุ: คอลัมน์เหล่านี้เป็นประวัติ (additive) — หากมีข้อมูลถูกบันทึกแล้วไม่ควร DROP
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. คอลัมน์ติดตามผลการซ่อม / คืนสภาพ
-- ---------------------------------------------------------------------------
ALTER TABLE public.checkout_return_logs
  ADD COLUMN IF NOT EXISTS repair_resolution_status TEXT NOT NULL DEFAULT 'unresolved',
  ADD COLUMN IF NOT EXISTS repair_notes TEXT,
  ADD COLUMN IF NOT EXISTS repair_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS repair_resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS restored_stock_in_order_id UUID REFERENCES public.stock_in_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS repair_scrap_disposal_id UUID REFERENCES public.scrap_disposal_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS spare_part_item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS spare_part_quantity NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.checkout_return_logs'::regclass
      AND conname = 'checkout_return_logs_repair_resolution_status_check'
  ) THEN
    ALTER TABLE public.checkout_return_logs
      ADD CONSTRAINT checkout_return_logs_repair_resolution_status_check
      CHECK (repair_resolution_status IN ('unresolved', 'restored_to_stock', 'parts_harvested', 'scrapped'))
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.checkout_return_logs
  VALIDATE CONSTRAINT checkout_return_logs_repair_resolution_status_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.checkout_return_logs'::regclass
      AND conname = 'checkout_return_logs_spare_part_quantity_check'
  ) THEN
    ALTER TABLE public.checkout_return_logs
      ADD CONSTRAINT checkout_return_logs_spare_part_quantity_check
      CHECK (spare_part_quantity IS NULL OR spare_part_quantity > 0)
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.checkout_return_logs
  VALIDATE CONSTRAINT checkout_return_logs_spare_part_quantity_check;

-- ค้นหารายการค้างจัดการ (unresolved) ของสภาพชำรุด/ส่งซ่อม ได้เร็วขึ้น
CREATE INDEX IF NOT EXISTS idx_checkout_return_logs_repair_pending
  ON public.checkout_return_logs (checkout_order_id, returned_at DESC)
  WHERE repair_resolution_status = 'unresolved'
    AND item_condition IN ('damaged', 'needs_repair');

-- ---------------------------------------------------------------------------
-- 2. Backfill สถานะจากงานเคลม CAIM ที่ประมวลผลไปแล้ว (กันนับสต็อกซ้ำ)
-- ---------------------------------------------------------------------------
UPDATE public.checkout_return_logs
SET repair_resolution_status = CASE
      WHEN caim_repair_result = 'unrepairable' THEN 'scrapped'
      ELSE 'restored_to_stock'
    END,
    repair_notes = COALESCE(repair_notes, 'CAIM: ' || COALESCE(caim_repair_result, 'processed')),
    repair_resolved_at = COALESCE(repair_resolved_at, caim_inbound_processed_at, caim_closed_at),
    restored_stock_in_order_id = COALESCE(restored_stock_in_order_id, caim_stock_in_order_id),
    repair_scrap_disposal_id = COALESCE(repair_scrap_disposal_id, caim_scrap_disposal_id)
WHERE item_condition IN ('damaged', 'needs_repair')
  AND repair_resolution_status = 'unresolved'
  AND caim_inbound_processed_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. RPC: resolve_damaged_return_item(JSONB)
-- ---------------------------------------------------------------------------
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
  v_lock RECORD;
  v_lock_ids UUID[];
BEGIN
  -- 3.1 Authorization
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.return')
    OR public.has_permission(v_caller_id, 'stock_in.create')
    OR public.is_super_admin(v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.return or stock_in.create permission.';
  END IF;

  IF v_return_log_id IS NULL THEN
    RAISE EXCEPTION 'return_log_id is required';
  END IF;

  IF v_resolution NOT IN ('restored_to_stock', 'parts_harvested', 'scrapped') THEN
    RAISE EXCEPTION 'Unsupported resolution: %', v_resolution;
  END IF;

  -- 3.2 ล็อกแถวรายการรับคืน + กันการกดซ้ำ
  SELECT * INTO v_log
  FROM public.checkout_return_logs
  WHERE id = v_return_log_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบรายการรับคืน ID: %', v_return_log_id;
  END IF;

  IF v_log.item_condition NOT IN ('damaged', 'needs_repair') THEN
    RAISE EXCEPTION 'จัดการซ่อมได้เฉพาะรายการที่รับคืนสภาพชำรุด/ส่งซ่อมเท่านั้น (สภาพปัจจุบัน: %)', v_log.item_condition;
  END IF;

  IF v_log.repair_resolution_status <> 'unresolved' THEN
    RAISE EXCEPTION 'รายการนี้ถูกบันทึกผลการซ่อมไปแล้ว (สถานะ: %)', v_log.repair_resolution_status;
  END IF;

  IF v_log.caim_stock_in_order_id IS NOT NULL OR v_log.caim_inbound_processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'รายการนี้ถูกรับเข้าคลังผ่านงานเคลม CAIM แล้ว ไม่สามารถคืนสต็อกซ้ำได้';
  END IF;

  -- 3.3 อุปกรณ์หลักของรายการนี้
  SELECT ci.item_id, ci.serial_number, co.project_id, co.order_number
  INTO v_item_id, v_item_serial, v_order_project_id, v_order_number
  FROM public.checkout_items ci
  JOIN public.checkout_orders co ON co.id = ci.checkout_order_id
  WHERE ci.id = v_log.checkout_item_id;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการอุปกรณ์ต้นทางของ return log %', v_return_log_id;
  END IF;

  -- 3.4 ปลายทาง (ค่าเริ่มต้น: คลังที่รับคืน → โครงการของใบยืม)
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

  -- 3.5 จำนวน (ต้องเป็นจำนวนเต็ม ไม่เกินยอดที่รับคืนไว้)
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

  v_serial := COALESCE(v_serial, v_item_serial, v_log.replaced_serial_number);

  -- อะไหล่ย่อยใช้ได้เฉพาะกรณีซ่อมเสร็จคืนคลังเท่านั้น
  IF v_resolution <> 'restored_to_stock' THEN
    v_spare_item_id := NULL;
  END IF;

  -- 3.6 ตรวจ payload ของอะไหล่/ชิ้นส่วนที่เกี่ยวข้อง
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

  -- 3.7 ล็อกแถว items ที่จะถูกแตะ เรียงตาม id (mutex ต่อ item — ลำดับเดียวกับ RPC อื่น)
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_lock_ids
  FROM unnest(ARRAY[v_item_id, v_spare_item_id, v_harvest_item_id]) AS t(x)
  WHERE x IS NOT NULL;

  IF v_lock_ids IS NOT NULL THEN
    FOR v_lock IN SELECT id FROM public.items WHERE id = ANY(v_lock_ids) ORDER BY id FOR UPDATE
    LOOP
      NULL; -- เพียงล็อกเพื่อรักษาลำดับ mutex เดียวกับ approve_inventory_request / approve_checkout_order
    END LOOP;
  END IF;

  -- 3.8 ตรวจสต็อกอะไหล่ย่อยก่อนตัดจริง (stock_balance เป็น VIEW: GROUP BY project_id, item_id)
  IF v_resolution = 'restored_to_stock' AND v_spare_item_id IS NOT NULL THEN
    SELECT COALESCE(balance, 0) INTO v_available
    FROM public.stock_balance
    WHERE project_id = v_project_id AND item_id = v_spare_item_id;

    IF COALESCE(v_available, 0) < v_spare_qty THEN
      RAISE EXCEPTION 'สต็อกอะไหล่ไม่เพียงพอ (คงเหลือ % ต้องการ %)', COALESCE(v_available, 0), v_spare_qty;
    END IF;
  END IF;

  -- 3.9 ดำเนินการตามแนวทางที่เลือก
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
    -- parts_harvested / scrapped : ลงทะเบียนของเสีย (ไม่คืนสต็อกตัวหลัก)
    INSERT INTO public.scrap_disposal_items (
      checkout_return_log_id, checkout_order_id, project_id, item_id, quantity,
      serial_number, reason, disposal_method, notes
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
      'อ้างอิงใบยืม ' || COALESCE(v_order_number, '-')
    ) RETURNING id INTO v_scrap_id;

    -- รับเข้าชิ้นส่วนที่ยังใช้งานได้เป็นอะไหล่สำรอง (ถ้าระบุ)
    IF v_harvest_item_id IS NOT NULL THEN
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

  -- 3.10 ปิดสถานะรายการ (กันการกดซ้ำ)
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

-- ---------------------------------------------------------------------------
-- 4. Verification Guard (fail fast ถ้าผลลัพธ์ไม่ตรง)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_column TEXT;
  v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOREACH v_column IN ARRAY ARRAY[
    'repair_resolution_status', 'repair_notes', 'repair_resolved_at', 'repair_resolved_by',
    'restored_stock_in_order_id', 'repair_scrap_disposal_id',
    'spare_part_item_id', 'spare_part_quantity'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'checkout_return_logs'
        AND column_name = v_column
    ) THEN
      v_missing := v_missing || v_column;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Migration validation failed: checkout_return_logs ขาดคอลัมน์ %',
      array_to_string(v_missing, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'resolve_damaged_return_item'
  ) THEN
    RAISE EXCEPTION 'Migration validation failed: public.resolve_damaged_return_item is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'resolve_damaged_return_item'
      AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'Migration validation failed: resolve_damaged_return_item must be SECURITY DEFINER';
  END IF;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
