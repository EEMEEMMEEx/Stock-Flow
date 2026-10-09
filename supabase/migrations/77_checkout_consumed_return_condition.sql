-- Migration 77: Checkout "consumed" return condition (นำไปใช้งานทดแทน)
-- ---------------------------------------------------------------------------
-- CONTEXT
--   approve_checkout_order ตัดสต็อกเต็มจำนวนด้วย checkout_out ตอนอนุมัติ
--   (20261002161500_fix_approve_checkout_order_locking_on_view.sql) ดังนั้นของที่
--   ยืมไปแล้วถูกนำไปใช้งานทดแทนของชำรุด/สูญหาย จึงไม่ต้องมี stock movement เพิ่ม
--   แต่ก่อน migration นี้ไม่มีสภาพรับคืนใดรองรับกรณีนี้ ทำให้ยอดค้างของ checkout
--   ไม่ถูกเคลียร์ หรือถูกบันทึกปนกับ damaged/lost
--
-- WHAT THIS MIGRATION DOES
--   1. checkout_items.quantity_consumed      -> ยอดที่นำไปใช้ทดแทน (ไม่คืนสต็อก)
--   2. checkout_return_logs.replaced_serial_number -> S/N ของอุปกรณ์ชำรุดที่ถูกทดแทน
--   3. ขยาย CHECK item_condition ให้รวม 'consumed'
--   4. CREATE OR REPLACE public.process_return_order(JSONB) ให้รองรับ 'consumed'
--      (signature/return เดิม, SECURITY DEFINER, search_path คงเดิม, ไม่แตะ GRANT)
--   5. เพิ่ม public.get_checkout_consumed_usage(...) สำหรับหน้ารายงาน
--      (เลี่ยง RLS ของ checkout_return_logs โดยไม่เปิด policy กว้างขึ้น)
--
-- SECURITY
--   - process_return_order: ต้องมี checkouts.return หรือ super admin (ตาม 65)
--   - get_checkout_consumed_usage: ต้องมี reports.view หรือ super admin,
--     REVOKE จาก PUBLIC/anon, GRANT เฉพาะ authenticated/service_role
--
-- BEHAVIOR PRESERVED
--   - 'normal'/'damaged'/'needs_repair'/'lost' ทำงานเหมือนเวอร์ชัน 65 ทุกประการ
--   - 'consumed' ไม่ insert stock_transactions และไม่แตะ stock_balance
--
-- ROLLBACK
--   BEGIN;
--     DROP FUNCTION IF EXISTS public.get_checkout_consumed_usage(UUID, DATE, DATE);
--     CREATE OR REPLACE FUNCTION public.process_return_order(p_payload JSONB) ... ;
--       -- คืนนิยามเวอร์ชัน 65_security_and_reliability_remediation.sql (บรรทัด 347-517)
--     ALTER TABLE public.checkout_return_logs
--       DROP CONSTRAINT IF EXISTS checkout_return_logs_item_condition_check;
--     ALTER TABLE public.checkout_return_logs
--       ADD CONSTRAINT checkout_return_logs_item_condition_check
--       CHECK (item_condition IN ('normal','damaged','lost','needs_repair'));
--   COMMIT;
--   หมายเหตุ: คอลัมน์ quantity_consumed / replaced_serial_number เป็น additive
--   ห้าม DROP หากมีข้อมูล 'consumed' ถูกบันทึกแล้ว

BEGIN;

-- ---------------------------------------------------------------------------
-- 1.1 checkout_items.quantity_consumed
-- ---------------------------------------------------------------------------
ALTER TABLE public.checkout_items
  ADD COLUMN IF NOT EXISTS quantity_consumed NUMERIC NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.checkout_items'::regclass
      AND conname = 'checkout_items_quantity_consumed_check'
  ) THEN
    ALTER TABLE public.checkout_items
      ADD CONSTRAINT checkout_items_quantity_consumed_check
      CHECK (quantity_consumed >= 0) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.checkout_items
  VALIDATE CONSTRAINT checkout_items_quantity_consumed_check;

-- ---------------------------------------------------------------------------
-- 1.2 checkout_return_logs.replaced_serial_number
-- ---------------------------------------------------------------------------
ALTER TABLE public.checkout_return_logs
  ADD COLUMN IF NOT EXISTS replaced_serial_number TEXT;

-- ---------------------------------------------------------------------------
-- 1.3 ขยาย CHECK item_condition ให้รวม 'consumed'
--     ชื่อ constraint ถูกค้นจาก pg_constraint แทนการเดา (DDL เดิมอยู่แค่ archive/44)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_connames TEXT[];
BEGIN
  -- เลือกเฉพาะ CHECK constraint ที่อ้างคอลัมน์ item_condition จริง (ไม่เดาจากชื่อ)
  SELECT array_agg(c.conname ORDER BY c.conname) INTO v_connames
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'public.checkout_return_logs'::regclass
    AND c.contype = 'c'
    AND a.attname = 'item_condition';

  IF v_connames IS NULL OR array_length(v_connames, 1) = 0 THEN
    RAISE EXCEPTION
      'Expected CHECK constraint on public.checkout_return_logs.item_condition was not found';
  END IF;

  IF array_length(v_connames, 1) > 1 THEN
    RAISE EXCEPTION
      'Multiple CHECK constraints reference checkout_return_logs.item_condition (%): review manually before applying',
      array_to_string(v_connames, ', ');
  END IF;

  EXECUTE format('ALTER TABLE public.checkout_return_logs DROP CONSTRAINT %I', v_connames[1]);
END;
$$;

ALTER TABLE public.checkout_return_logs
  ADD CONSTRAINT checkout_return_logs_item_condition_check
  CHECK (
    item_condition IN ('normal', 'damaged', 'lost', 'needs_repair', 'consumed')
  ) NOT VALID;

ALTER TABLE public.checkout_return_logs
  VALIDATE CONSTRAINT checkout_return_logs_item_condition_check;

-- ---------------------------------------------------------------------------
-- 1.4 process_return_order รองรับ 'consumed'
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

    -- Insert Return Log
    INSERT INTO public.checkout_return_logs (
      checkout_order_id, checkout_item_id, returned_quantity,
      item_condition, destination_project_id, received_by, returned_at,
      damage_notes, replaced_serial_number
    ) VALUES (
      v_order_id, v_checkout_item_id, v_return_qty, v_condition, v_dest_project_id, v_caller_id, now(),
      v_damage_notes, v_replaced_serial
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
    'message', CASE WHEN v_all_returned THEN 'รับคืนอุปกรณ์ครบถ้วนเรียบร้อยแล้ว' ELSE 'บันทึกการรับคืนบางส่วนสำเร็จ' END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 1.5 get_checkout_consumed_usage — รายงานการนำไปใช้งานทดแทน
--     อ่านผ่าน SECURITY DEFINER เพื่อไม่ต้องเปิด RLS ของ checkout_return_logs
--     (ปัจจุบัน policy 172-181 ของ 65 อนุญาตเฉพาะ checkouts.return/super admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_checkout_consumed_usage(
  p_project_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  return_log_id UUID,
  returned_at TIMESTAMPTZ,
  project_id UUID,
  project_name TEXT,
  project_code TEXT,
  project_location TEXT,
  project_description TEXT,
  order_number TEXT,
  borrower_name TEXT,
  item_name TEXT,
  unit TEXT,
  quantity NUMERIC,
  replaced_serial_number TEXT,
  damage_notes TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_caller_id, 'reports.view') OR public.is_super_admin(v_caller_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires reports.view permission.';
  END IF;

  RETURN QUERY
  SELECT cl.id,
         cl.returned_at,
         p.id,
         p.name,
         p.project_code,
         p.location,
         p.description,
         co.order_number,
         co.borrower_name,
         i.name,
         i.unit,
         cl.returned_quantity,
         cl.replaced_serial_number,
         cl.damage_notes
  FROM public.checkout_return_logs cl
  JOIN public.checkout_orders co ON co.id = cl.checkout_order_id
  JOIN public.checkout_items ci ON ci.id = cl.checkout_item_id
  JOIN public.items i ON i.id = ci.item_id
  LEFT JOIN public.projects p ON p.id = co.project_id
  WHERE cl.item_condition = 'consumed'
    AND (p_project_id IS NULL OR co.project_id = p_project_id)
    AND (p_start_date IS NULL OR cl.returned_at::date >= p_start_date)
    AND (p_end_date IS NULL OR cl.returned_at::date <= p_end_date)
  ORDER BY cl.returned_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_checkout_consumed_usage(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_checkout_consumed_usage(UUID, DATE, DATE) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verification (fail fast ถ้าผลลัพธ์ไม่ตรง)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'checkout_items'
      AND column_name = 'quantity_consumed'
  ) THEN
    RAISE EXCEPTION 'Migration validation failed: checkout_items.quantity_consumed is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'checkout_return_logs'
      AND column_name = 'replaced_serial_number'
  ) THEN
    RAISE EXCEPTION 'Migration validation failed: checkout_return_logs.replaced_serial_number is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.checkout_return_logs'::regclass
      AND conname = 'checkout_return_logs_item_condition_check'
      AND pg_get_constraintdef(oid, true) LIKE '%consumed%'
  ) THEN
    RAISE EXCEPTION 'Migration validation failed: item_condition does not allow consumed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_checkout_consumed_usage'
      AND pg_get_functiondef(oid) LIKE '%item_condition = ''consumed''%'
  ) THEN
    RAISE EXCEPTION 'Migration validation failed: get_checkout_consumed_usage is missing or wrong';
  END IF;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
