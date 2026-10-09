-- Migration 78: Integrate CAIM Claim & RMA Ticket Tracking with Checkout Return Logs
-- ---------------------------------------------------------------------------
-- CONTEXT
--   เมื่ออุปกรณ์ที่ยืมไปถูกนำไปใช้งานทดแทนอุปกรณ์ชำรุดหน้างาน (condition = 'consumed')
--   พร้อมระบุ S/N ของอุปกรณ์ที่เสีย (replaced_serial_number) อุปกรณ์ชำรุดนั้นจะต้องถูกส่งซ่อม
--   ในระบบ CAIM (Process Claim / RMA System).
--   Migration นี้เพิ่มฟิลด์สำหรับติดตาม Ticket ของ CAIM และขยาย process_return_order
--   ให้ส่งคืนข้อมูล return logs ที่ถูกสร้างเพื่อให้นำไป sync ต่อยัง CAIM ได้ทันที
--
-- WHAT THIS MIGRATION DOES
--   1. เพิ่มคอลัมน์ใน public.checkout_return_logs:
--      - caim_ticket_id    TEXT NULL       (เช่น "CLM-2026-0089")
--      - caim_ticket_url   TEXT NULL       (ลิงก์ไปยังหน้ารายละเอียด Ticket ใน CAIM)
--      - caim_sync_status  TEXT DEFAULT 'not_applicable' CHECK IN ('pending','synced','failed','not_applicable')
--      - caim_synced_at    TIMESTAMPTZ NULL
--      - caim_sync_error   TEXT NULL
--   2. อัปเดต process_return_order ให้บันทึก caim_sync_status = 'pending' สำหรับ consumed returns
--      และส่งคืน created returns array ใน JSON response
--   3. เพิ่ม RPC public.update_checkout_return_caim_sync สำหรับอัปเดตผลลัพธ์หลัง sync ไปยัง CAIM
--
-- SECURITY
--   - update_checkout_return_caim_sync: SECURITY DEFINER, search_path ปลอดภัย, ตรวจสอบ checkouts.return
--   - REVOKE ALL FROM PUBLIC/anon, GRANT เฉพาะ authenticated, service_role
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. เพิ่มคอลัมน์สำหรับ CAIM Integration
-- ---------------------------------------------------------------------------
ALTER TABLE public.checkout_return_logs
  ADD COLUMN IF NOT EXISTS caim_ticket_id TEXT,
  ADD COLUMN IF NOT EXISTS caim_ticket_url TEXT,
  ADD COLUMN IF NOT EXISTS caim_sync_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS caim_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS caim_sync_error TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.checkout_return_logs'::regclass
      AND conname = 'checkout_return_logs_caim_sync_status_check'
  ) THEN
    ALTER TABLE public.checkout_return_logs
      ADD CONSTRAINT checkout_return_logs_caim_sync_status_check
      CHECK (caim_sync_status IN ('pending', 'synced', 'failed', 'not_applicable')) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.checkout_return_logs
  VALIDATE CONSTRAINT checkout_return_logs_caim_sync_status_check;

-- ---------------------------------------------------------------------------
-- 2. CREATE OR REPLACE public.process_return_order(JSONB)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_return_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_order_id UUID;
  v_returns JSONB;
  v_ret JSONB;
  v_checkout_item_id UUID;
  v_return_qty NUMERIC;
  v_condition TEXT;
  v_dest_project_id UUID;
  v_damage_notes TEXT;
  v_replaced_serial TEXT;
  v_checkout_item RECORD;
  v_order RECORD;
  v_all_returned BOOLEAN := true;
  v_new_returned_total NUMERIC;
  v_new_damaged_total NUMERIC;
  v_new_lost_total NUMERIC;
  v_new_consumed_total NUMERIC;
  v_transfer_order_id UUID;
  v_dest_project_name TEXT;
  v_created_log_id UUID;
  v_initial_sync_status TEXT;
  v_created_returns JSONB := '[]'::jsonb;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_caller_id, 'checkouts.return') OR public.is_super_admin(v_caller_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.return permission.';
  END IF;

  v_order_id := (p_payload->>'order_id')::UUID;
  v_returns := p_payload->'returns';

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรหัสคำสั่งยืมพัสดุ';
  END IF;

  IF v_returns IS NULL OR jsonb_array_length(v_returns) = 0 THEN
    RAISE EXCEPTION 'กรุณาระบุรายการอุปกรณ์ที่ต้องการรับคืน';
  END IF;

  SELECT * INTO v_order FROM public.checkout_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคำสั่งยืมพัสดุ ID: %', v_order_id;
  END IF;

  IF v_order.status NOT IN ('active', 'partial_returned', 'overdue') THEN
    RAISE EXCEPTION 'ไม่สามารถรับคืนได้: คำสั่งยืมอยู่ในสถานะ %', v_order.status;
  END IF;

  FOR v_ret IN SELECT * FROM jsonb_array_elements(v_returns)
  LOOP
    v_checkout_item_id := (v_ret->>'checkout_item_id')::UUID;
    v_return_qty := (v_ret->>'returned_quantity')::NUMERIC;
    v_condition := COALESCE(NULLIF(TRIM(v_ret->>'condition'), ''), 'normal');
    v_dest_project_id := COALESCE(NULLIF(v_ret->>'destination_project_id', '')::UUID, v_order.project_id);
    v_damage_notes := NULLIF(TRIM(COALESCE(v_ret->>'damage_notes', '')), '');
    v_replaced_serial := NULLIF(TRIM(COALESCE(v_ret->>'replaced_serial_number', '')), '');

    IF v_condition NOT IN ('normal', 'damaged', 'lost', 'needs_repair', 'consumed') THEN
      RAISE EXCEPTION 'สภาพรับคืนไม่ถูกต้อง: %', v_condition;
    END IF;

    SELECT * INTO v_checkout_item 
    FROM public.checkout_items 
    WHERE id = v_checkout_item_id AND checkout_order_id = v_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ไม่พบรายการอุปกรณ์ที่ยืม ID: % ในคำสั่งยืมนี้', v_checkout_item_id;
    END IF;

    IF v_return_qty IS NULL OR v_return_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_condition = 'consumed' THEN
      -- ต้องมีเหตุผล/จุดติดตั้งเสมอ เพื่อให้ตรวจสอบย้อนหลังได้
      IF v_damage_notes IS NULL THEN
        RAISE EXCEPTION 'กรุณาระบุเหตุผล/จุดติดตั้งที่นำไปใช้งานทดแทน';
      END IF;

      IF v_replaced_serial IS NOT NULL AND char_length(v_replaced_serial) > 100 THEN
        RAISE EXCEPTION 'หมายเลขเครื่อง (S/N) ที่ถูกทดแทนยาวเกิน 100 ตัวอักษร';
      END IF;
    ELSE
      v_replaced_serial := NULL;
    END IF;

    IF (v_checkout_item.quantity_returned + v_checkout_item.quantity_damaged + v_checkout_item.quantity_lost + v_checkout_item.quantity_consumed + v_return_qty) > v_checkout_item.quantity_borrowed THEN
      RAISE EXCEPTION 'จำนวนที่รับคืนรวมเกินกว่าจำนวนที่ยืมไป (ยืม: %, รับคืนแล้ว: %, ต้องการคืนเพิ่ม: %)',
        v_checkout_item.quantity_borrowed,
        (v_checkout_item.quantity_returned + v_checkout_item.quantity_damaged + v_checkout_item.quantity_lost + v_checkout_item.quantity_consumed),
        v_return_qty;
    END IF;

    v_initial_sync_status := CASE 
      WHEN v_condition = 'consumed' AND v_replaced_serial IS NOT NULL THEN 'pending' 
      ELSE 'not_applicable' 
    END;

    -- Insert Return Log
    INSERT INTO public.checkout_return_logs (
      checkout_order_id, checkout_item_id, returned_quantity,
      item_condition, destination_project_id, received_by, returned_at,
      damage_notes, replaced_serial_number, caim_sync_status
    ) VALUES (
      v_order_id, v_checkout_item_id, v_return_qty,
      v_condition, v_dest_project_id, v_caller_id, now(),
      v_damage_notes, v_replaced_serial, v_initial_sync_status
    ) RETURNING id INTO v_created_log_id;

    -- Collect created return log information for caller integration
    v_created_returns := v_created_returns || jsonb_build_object(
      'return_log_id', v_created_log_id,
      'checkout_item_id', v_checkout_item_id,
      'item_id', v_checkout_item.item_id,
      'returned_quantity', v_return_qty,
      'condition', v_condition,
      'damage_notes', v_damage_notes,
      'replaced_serial_number', v_replaced_serial,
      'caim_sync_status', v_initial_sync_status
    );

    IF v_condition = 'normal' THEN
      v_new_returned_total := v_checkout_item.quantity_returned + v_return_qty;
      v_new_damaged_total := v_checkout_item.quantity_damaged;
      v_new_lost_total := v_checkout_item.quantity_lost;
      v_new_consumed_total := v_checkout_item.quantity_consumed;

      IF v_dest_project_id = v_order.project_id THEN
        -- Return to the same project
        INSERT INTO public.stock_transactions (
          project_id, item_id, transaction_type, quantity, reference_id, reference_type, created_by, notes
        ) VALUES (
          v_dest_project_id, v_checkout_item.item_id, 'return_in', v_return_qty, v_order_id, 'checkout_return', v_caller_id,
          'รับคืนอุปกรณ์จากการยืม: คำสั่งยืม ' || v_order.order_number
        );
      ELSE
        -- Returned to a different project: credit dest project via stock_in so view reflects accurately
        SELECT name INTO v_dest_project_name FROM public.projects WHERE id = v_dest_project_id;

        INSERT INTO public.stock_in_orders (
          project_id, supplier, notes, received_date, created_by
        ) VALUES (
          v_dest_project_id, 'Checkout Return from ' || v_order.order_number,
          'รับคืนอุปกรณ์จากการยืม ' || v_order.order_number || ' (ข้ามโครงการ)',
          CURRENT_DATE, v_caller_id
        ) RETURNING id INTO v_transfer_order_id;

        INSERT INTO public.stock_in_items (
          order_id, item_id, quantity, notes
        ) VALUES (
          v_transfer_order_id, v_checkout_item.item_id, v_return_qty,
          'รับคืนอุปกรณ์จากการยืม ' || v_order.order_number
        );

        INSERT INTO public.stock_transactions (
          project_id, item_id, transaction_type, quantity, reference_id, reference_type, created_by, notes
        ) VALUES (
          v_dest_project_id, v_checkout_item.item_id, 'stock_in', v_return_qty, v_order_id, 'checkout_return', v_caller_id,
          'รับคืนอุปกรณ์จากการยืม ' || v_order.order_number || ' สู่โครงการ ' || COALESCE(v_dest_project_name, '')
        );
      END IF;
    ELSIF v_condition IN ('damaged', 'needs_repair') THEN
      v_new_returned_total := v_checkout_item.quantity_returned;
      v_new_damaged_total := v_checkout_item.quantity_damaged + v_return_qty;
      v_new_lost_total := v_checkout_item.quantity_lost;
      v_new_consumed_total := v_checkout_item.quantity_consumed;
    ELSIF v_condition = 'lost' THEN
      v_new_returned_total := v_checkout_item.quantity_returned;
      v_new_damaged_total := v_checkout_item.quantity_damaged;
      v_new_lost_total := v_checkout_item.quantity_lost + v_return_qty;
      v_new_consumed_total := v_checkout_item.quantity_consumed;
    ELSIF v_condition = 'consumed' THEN
      -- นำไปใช้งานทดแทน: สต็อกถูกตัดไปแล้วตอนอนุมัติยืม จึงไม่ต้องมี stock movement
      v_new_returned_total := v_checkout_item.quantity_returned;
      v_new_damaged_total := v_checkout_item.quantity_damaged;
      v_new_lost_total := v_checkout_item.quantity_lost;
      v_new_consumed_total := v_checkout_item.quantity_consumed + v_return_qty;
    END IF;

    UPDATE public.checkout_items SET
      quantity_returned = v_new_returned_total,
      quantity_damaged = v_new_damaged_total,
      quantity_lost = v_new_lost_total,
      quantity_consumed = v_new_consumed_total,
      status = CASE 
        WHEN (v_new_returned_total + v_new_damaged_total + v_new_lost_total + v_new_consumed_total) >= quantity_borrowed THEN 'returned'
        ELSE 'borrowed'
      END
    WHERE id = v_checkout_item_id;
  END LOOP;

  -- Check if all items in the order have been returned/accounted for
  FOR v_checkout_item IN SELECT * FROM public.checkout_items WHERE checkout_order_id = v_order_id
  LOOP
    IF (v_checkout_item.quantity_returned + v_checkout_item.quantity_damaged + v_checkout_item.quantity_lost + v_checkout_item.quantity_consumed) < v_checkout_item.quantity_borrowed THEN
      v_all_returned := false;
    END IF;
  END LOOP;

  IF v_all_returned THEN
    UPDATE public.checkout_orders 
    SET status = 'completed', actual_returned_date = now() 
    WHERE id = v_order_id;
  ELSE
    UPDATE public.checkout_orders 
    SET status = 'partial_returned' 
    WHERE id = v_order_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'completed', v_all_returned,
    'message', CASE WHEN v_all_returned THEN 'รับคืนอุปกรณ์ครบถ้วนเรียบร้อยแล้ว' ELSE 'บันทึกการรับคืนบางส่วนสำเร็จ' END,
    'returns', v_created_returns
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC: update_checkout_return_caim_sync
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_checkout_return_caim_sync(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_return_log_id UUID := (p_payload->>'return_log_id')::UUID;
  v_ticket_id TEXT := NULLIF(TRIM(p_payload->>'caim_ticket_id'), '');
  v_ticket_url TEXT := NULLIF(TRIM(p_payload->>'caim_ticket_url'), '');
  v_sync_status TEXT := COALESCE(NULLIF(TRIM(p_payload->>'caim_sync_status'), ''), 'synced');
  v_sync_error TEXT := NULLIF(TRIM(p_payload->>'caim_sync_error'), '');
BEGIN
  IF v_caller_id IS NOT NULL AND NOT (
    public.has_permission(v_caller_id, 'checkouts.return')
    OR public.has_permission(v_caller_id, 'checkouts.update')
    OR public.is_super_admin(v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.return permission';
  END IF;

  IF v_return_log_id IS NULL THEN
    RAISE EXCEPTION 'return_log_id is required';
  END IF;

  IF v_sync_status NOT IN ('pending', 'synced', 'failed', 'not_applicable') THEN
    RAISE EXCEPTION 'Invalid sync status: %', v_sync_status;
  END IF;

  UPDATE public.checkout_return_logs
  SET
    caim_ticket_id = COALESCE(v_ticket_id, caim_ticket_id),
    caim_ticket_url = COALESCE(v_ticket_url, caim_ticket_url),
    caim_sync_status = v_sync_status,
    caim_synced_at = CASE WHEN v_sync_status = 'synced' THEN now() ELSE caim_synced_at END,
    caim_sync_error = v_sync_error
  WHERE id = v_return_log_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return log ID % not found', v_return_log_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'return_log_id', v_return_log_id,
    'caim_ticket_id', v_ticket_id,
    'caim_sync_status', v_sync_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_checkout_return_caim_sync(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_checkout_return_caim_sync(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Verification Guard
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'checkout_return_logs'
      AND column_name = 'caim_ticket_id'
  ) THEN
    RAISE EXCEPTION 'Migration validation failed: checkout_return_logs.caim_ticket_id is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'checkout_return_logs'
      AND column_name = 'caim_sync_status'
  ) THEN
    RAISE EXCEPTION 'Migration validation failed: checkout_return_logs.caim_sync_status is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'update_checkout_return_caim_sync'
  ) THEN
    RAISE EXCEPTION 'Migration validation failed: update_checkout_return_caim_sync is missing';
  END IF;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
