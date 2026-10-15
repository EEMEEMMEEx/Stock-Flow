-- =============================================================================
-- Migration 80: Multi-Warehouse / Multi-Project Requisition Support
-- =============================================================================
-- Phase 1 ของ docs/multi-warehouse-withdrawal-plan.md
--   เป้าหมาย: ใบเบิก 1 ใบ (1 เลขที่เอกสาร) ดึงพัสดุจากหลายโครงการ/หลายคลังได้
--   โดยย้าย "คลังต้นทาง" จากระดับหัวใบเบิก (withdrawal_orders.project_id)
--   ลงมาระดับรายการ (withdrawal_items.project_id) แบบ backward compatible 100%
--
-- หลักฐาน live schema (PostgREST OpenAPI, project vrnutseacyejnzwcfamv):
--   public.withdrawal_items  = id, order_id, item_id, quantity, delivery_to,
--     serial_number, part_number, available_at_approval, deducted_quantity,
--     shortage_quantity, is_shortage, requested_qty, fulfilled_qty, notes,
--     created_at  -> ยังไม่มี project_id / storage_location_id
--   public.withdrawal_orders = project_id (NULLABLE), storage_location_id, ...
--   ข้อมูลจริง: withdrawal_orders 12 ใบ, project_id IS NULL = 0 ใบ
--   public.stock_balance     = VIEW ที่ GROUP BY project_id, item_id
--                              (ล็อกแถวไม่ได้ -> SQLSTATE 0A000)
--
-- การตัดสินใจออกแบบ (Phase 1)
--   1. เพิ่ม project_id (คลัง/โครงการต้นทางของแต่ละบรรทัด) + storage_location_id
--   2. Backfill จาก withdrawal_orders.project_id แล้วบังคับ NOT NULL
--   3. BEFORE trigger เติม project_id จากหัวใบเบิกอัตโนมัติ เมื่อผู้เรียกไม่ส่งมา
--      -> frontend ปัจจุบัน (ที่ยังไม่ส่ง project_id รายบรรทัด) ทำงานได้ต่อเนื่อง
--         จนกว่า Phase 2/3 จะส่งค่าจริงมาเอง
--   4. approve_inventory_request ตัดสต็อกจาก stock_balance ตาม project_id ของ
--      "แต่ละบรรทัด" ไม่ใช่ของหัวใบเบิก และบันทึก stock_transactions แยกตามคลัง
--   5. Deadlock: stock_balance เป็น GROUP BY view จึงล็อกแถวไม่ได้
--      จึงล็อกแถว public.items เรียงตาม item_id (mutex ต่อ item) เหมือน
--      approve_checkout_order และ process_item_transfer เพื่อให้ทุก RPC
--      ที่แตะสต็อก item เดียวกันใช้ลำดับล็อกเดียวกัน
--
-- Idempotent : ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS
-- Reversible : rollback block ท้ายไฟล์ (คืนฟังก์ชันจาก migration 76)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) เพิ่มคอลัมน์คลังต้นทางระดับรายการ
-- -----------------------------------------------------------------------------
ALTER TABLE public.withdrawal_items
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id),
  ADD COLUMN IF NOT EXISTS storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 2) Backfill ข้อมูลเก่า (เดิม 1 ใบ = 1 คลัง จึงคัดลอกจากหัวใบเบิก)
-- -----------------------------------------------------------------------------
UPDATE public.withdrawal_items wi
SET project_id = wo.project_id
FROM public.withdrawal_orders wo
WHERE wi.order_id = wo.id
  AND wi.project_id IS NULL;

-- ถ้ามีแถวเก่าที่ยังระบุคลังต้นทางไม่ได้ ให้ล้มทั้ง migration แบบมีข้อความชัดเจน
-- (ปลอดภัยกว่า SET NOT NULL แล้ว error แบบ 23502 ที่ไม่บอกว่าแถวไหน)
DO $$
DECLARE
  v_orphan_count INTEGER;
  v_sample TEXT;
BEGIN
  SELECT COUNT(*) INTO v_orphan_count
  FROM public.withdrawal_items wi
  WHERE wi.project_id IS NULL;

  IF v_orphan_count > 0 THEN
    SELECT STRING_AGG(t.id::TEXT, ', ') INTO v_sample
    FROM (
      SELECT wi.id
      FROM public.withdrawal_items wi
      WHERE wi.project_id IS NULL
      LIMIT 5
    ) t;

    RAISE EXCEPTION
      'Migration 80: withdrawal_items % แถวยังระบุคลังต้นทางไม่ได้ (หัวใบเบิกไม่มี project_id). ตัวอย่าง id: %',
      v_orphan_count, v_sample;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) Backward compatibility: เติมคลังต้นทางจากหัวใบเบิกอัตโนมัติ
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_withdrawal_item_source_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  -- trigger นี้ทำงานหลัง RLS INSERT ของ withdrawal_items ผ่านแล้ว จึงไม่ต้อง
  -- ตรวจสิทธิ์ซ้ำ; หน้าที่เดียวคือรักษา invariant ของคลังต้นทาง
  IF NEW.project_id IS NULL THEN
    SELECT wo.project_id INTO NEW.project_id
    FROM public.withdrawal_orders wo
    WHERE wo.id = NEW.order_id;
  END IF;

  IF NEW.project_id IS NULL THEN
    RAISE EXCEPTION 'withdrawal_items.project_id is required (order % has no project_id)', NEW.order_id
      USING ERRCODE = '23502';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_withdrawal_items_source_project ON public.withdrawal_items;
CREATE TRIGGER trg_withdrawal_items_source_project
BEFORE INSERT OR UPDATE OF project_id, order_id ON public.withdrawal_items
FOR EACH ROW
EXECUTE FUNCTION public.set_withdrawal_item_source_project();

-- -----------------------------------------------------------------------------
-- 4) บังคับ invariant หลังทุกแถวมีคลังต้นทางแล้ว
-- -----------------------------------------------------------------------------
ALTER TABLE public.withdrawal_items ALTER COLUMN project_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawal_items_project_item
  ON public.withdrawal_items (project_id, item_id);

-- -----------------------------------------------------------------------------
-- 5) approve_inventory_request: ตัดสต็อกตามคลังต้นทางของแต่ละบรรทัด
--    signature / return shape / สิทธิ์ เดิมทั้งหมด (frontend ไม่ต้องแก้)
-- -----------------------------------------------------------------------------
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

  -- A-1. ล็อกหัวใบเบิก: กันอนุมัติซ้ำพร้อมกัน
  SELECT * INTO v_order FROM public.withdrawal_orders WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found: %', p_request_id;
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending approval (current status: %)', v_order.status;
  END IF;

  -- A-2. ล็อกบรรทัดรายการตามลำดับ id ที่แน่นอน
  PERFORM 1
  FROM public.withdrawal_items wi
  WHERE wi.order_id = p_request_id
  ORDER BY wi.id
  FOR UPDATE;

  -- A-3. Per-item mutex: stock_balance เป็น GROUP BY view ล็อกไม่ได้ (0A000)
  --      จึงล็อก public.items เรียงตาม item_id ให้ตรงกับ approve_checkout_order
  --      และ process_item_transfer
  PERFORM 1
  FROM public.items i
  WHERE i.id IN (SELECT wi.item_id FROM public.withdrawal_items wi WHERE wi.order_id = p_request_id)
  ORDER BY i.id
  FOR UPDATE;

  -- B-1. ประเมินของขาดแยกตามคลังต้นทางของแต่ละบรรทัด
  FOR v_item IN
    SELECT wi.id AS wi_id,
           wi.item_id,
           wi.project_id AS source_project_id,
           COALESCE(wi.requested_qty, wi.quantity) AS requested_qty,
           i.name AS item_name,
           p.name AS source_project_name
    FROM public.withdrawal_items wi
    JOIN public.items i ON i.id = wi.item_id
    LEFT JOIN public.projects p ON p.id = wi.project_id
    WHERE wi.order_id = p_request_id
    ORDER BY wi.project_id, wi.item_id, wi.id
  LOOP
    v_requested := v_item.requested_qty;

    SELECT balance INTO v_available
    FROM public.stock_balance
    WHERE project_id = v_item.source_project_id AND item_id = v_item.item_id;
    v_available := COALESCE(v_available, 0);

    IF v_available < v_requested THEN
      v_has_any_shortage := TRUE;
      v_shortage := v_requested - GREATEST(0, v_available);
      v_shortage_list := v_shortage_list || jsonb_build_object(
        'item_id', v_item.item_id,
        'item_name', v_item.item_name,
        'project_id', v_item.source_project_id,
        'warehouse_name', v_item.source_project_name,
        'requested', v_requested,
        'available', v_available,
        'shortage', v_shortage
      );
    END IF;
  END LOOP;

  IF v_has_any_shortage AND NOT p_allow_shortage THEN
    RAISE EXCEPTION 'SHORTAGE_DETECTED: %', jsonb_build_object('shortages', v_shortage_list)::text;
  END IF;

  -- B-2. ตัดสต็อกและบันทึก ledger แยกตามคลังต้นทางรายบรรทัด
  FOR v_item IN
    SELECT wi.id AS wi_id,
           wi.item_id,
           wi.project_id AS source_project_id,
           wi.storage_location_id AS source_storage_location_id,
           COALESCE(wi.requested_qty, wi.quantity) AS requested_qty
    FROM public.withdrawal_items wi
    WHERE wi.order_id = p_request_id
    ORDER BY wi.project_id, wi.item_id, wi.id
  LOOP
    v_requested := v_item.requested_qty;

    SELECT balance INTO v_available
    FROM public.stock_balance
    WHERE project_id = v_item.source_project_id AND item_id = v_item.item_id;
    v_available := COALESCE(v_available, 0);

    IF v_available < v_requested THEN
      v_deduct := GREATEST(0, v_available);
      v_shortage := v_requested - v_deduct;
    ELSE
      v_deduct := v_requested;
      v_shortage := 0;
    END IF;

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
        v_item.item_id, v_item.source_project_id, 'OUT', v_deduct,
        COALESCE(v_item.source_storage_location_id, v_order.storage_location_id),
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

REVOKE ALL ON FUNCTION public.approve_inventory_request(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_inventory_request(UUID, BOOLEAN, TEXT) TO authenticated, service_role;

-- Reload PostgREST schema cache ให้คอลัมน์/RPC ใหม่พร้อมใช้ทันที
NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- VERIFICATION (read-only) — รันหลัง apply
-- =============================================================================
-- 1) คอลัมน์ใหม่ + NOT NULL
-- SELECT column_name, is_nullable, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'withdrawal_items'
--   AND column_name IN ('project_id', 'storage_location_id');
-- คาดหวัง: project_id NOT NULL, storage_location_id NULL
--
-- 2) ไม่มีบรรทัดที่ไม่มีคลังต้นทาง
-- SELECT COUNT(*) AS items_without_source
-- FROM public.withdrawal_items WHERE project_id IS NULL;   -- ต้องได้ 0
--
-- 3) RPC ใหม่ใช้ project_id ของบรรทัดจริง
-- SELECT pg_get_functiondef(
--   'public.approve_inventory_request(uuid,boolean,text)'::regprocedure
-- ) ILIKE '%wi.project_id AS source_project_id%' AS uses_line_project;  -- true
--
-- 4) trigger + index มีจริง
-- SELECT tgname FROM pg_trigger
-- WHERE tgrelid = 'public.withdrawal_items'::regclass AND NOT tgisinternal;
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'withdrawal_items';
-- =============================================================================

-- =============================================================================
-- ROLLBACK (เฉพาะกรณีจำเป็น)
-- =============================================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_withdrawal_items_source_project ON public.withdrawal_items;
--   DROP FUNCTION IF EXISTS public.set_withdrawal_item_source_project();
--   DROP INDEX IF EXISTS public.idx_withdrawal_items_project_item;
--   ALTER TABLE public.withdrawal_items DROP COLUMN IF EXISTS storage_location_id;
--   ALTER TABLE public.withdrawal_items DROP COLUMN IF EXISTS project_id;
--   -- คืน RPC เวอร์ชัน migration 76 (ตัดสต็อกจาก v_order.project_id)
--   -- แล้วจึง GRANT/REVOKE ตามเดิม
-- COMMIT;
-- หมายเหตุ: การ rollback จะทำให้ approve ของใบเบิกที่ผูกหลายคลังคิดสต็อกผิด
--          (ใช้ project_id ของหัวใบเบิกกับทุกบรรทัด) จึงควรทำเฉพาะกรณีฉุกเฉิน
-- =============================================================================
