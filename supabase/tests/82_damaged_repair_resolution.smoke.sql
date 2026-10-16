-- ===========================================================================
-- Smoke test (transactional) สำหรับ migration 82: public.resolve_damaged_return_item
-- ---------------------------------------------------------------------------
-- วิธีรัน (จบด้วย ROLLBACK เสมอ — ไม่แก้ข้อมูลจริง):
--   node scripts/apply-migration-82.mjs --self-test
--   หรือ  npx supabase db query --db-url "$SUPABASE_DB_URL" --file supabase/tests/82_damaged_repair_resolution.smoke.sql
--
-- หมายเหตุ: ไฟล์นี้ไม่ใช่ pgTAP (ไม่ต้องรันด้วย "supabase test db")
--
-- สิ่งที่ตรวจ (ตาม docs/partial-damage-component-repair-plan.md §8.1):
--   A. ซ่อมเสร็จคืนคลัง  → stock_balance +N, มี stock_in_orders/items + ledger 'repair_restored',
--      และตัดสต็อกอะไหล่ย่อย 'repair_spare_part' ได้ในทรานแซกชันเดียว (ถ้ามีอะไหล่ในคลัง)
--   B. แทงจำหน่าย/แยกอะไหล่ → บันทึก scrap_disposal_items และสต็อกไม่เปลี่ยน
--   C. Idempotency → เรียกซ้ำต้องถูกปฏิเสธ (กันปั๊มสต็อก)
-- ===========================================================================

BEGIN;

DO $smoke$
DECLARE
  v_actor UUID;
  v_log RECORD;
  v_log2 RECORD;
  v_item_id UUID;
  v_project_id UUID;
  v_qty NUMERIC;
  v_before NUMERIC;
  v_after NUMERIC;
  v_spare_id UUID;
  v_spare_before NUMERIC;
  v_spare_after NUMERIC;
  v_result JSONB;
  v_note TEXT := 'SMOKE TEST (rollback): เปลี่ยนบอร์ด Control ใหม่ พัดลมเดิมใช้งานได้ปกติ';
  v_case_order TEXT := 'CHK-202610-3252';
BEGIN
  -- 0) ต้องมีผู้ใช้ระดับ SUPER สำหรับจำลองผู้เรียก (auth.uid())
  SELECT p.id INTO v_actor
  FROM public.profiles p
  WHERE p.status = 'active'
    AND public.is_super_admin(p.id)
  ORDER BY p.id
  LIMIT 1;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'SMOKE TEST: ไม่พบผู้ใช้ SUPER ที่ active สำหรับจำลองผู้เรียก';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_actor::TEXT, 'role', 'authenticated')::TEXT, true);
  PERFORM set_config('request.jwt.claim.sub', v_actor::TEXT, true);

  IF auth.uid() IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'SMOKE TEST: ตั้งค่า auth.uid() ไม่สำเร็จ (ได้ %) — ต้องรันใน transaction เดียวกับ set_config', auth.uid();
  END IF;

  -- 1) เลือกรายการตัวอย่าง: ใบยืมกรณีศึกษาก่อน ถ้าไม่มีให้ใช้รายการชำรุดที่ยังไม่จัดการล่าสุด
  SELECT cl.*, co.order_number, co.project_id AS order_project_id
  INTO v_log
  FROM public.checkout_return_logs cl
  JOIN public.checkout_orders co ON co.id = cl.checkout_order_id
  WHERE cl.item_condition IN ('damaged', 'needs_repair')
    AND cl.repair_resolution_status = 'unresolved'
  ORDER BY (co.order_number = v_case_order) DESC, cl.returned_at DESC
  LIMIT 1;

  IF v_log.id IS NULL THEN
    RAISE NOTICE 'SMOKE TEST: ไม่มีรายการรับคืนสภาพชำรุดที่ยังไม่ถูกจัดการ — ข้ามการทดสอบ (ไม่มีอะไรให้ตรวจ)';
    RETURN;
  END IF;

  SELECT ci.item_id INTO v_item_id
  FROM public.checkout_items ci
  WHERE ci.id = v_log.checkout_item_id;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE TEST: return log % ไม่พบ item ต้นทาง', v_log.id;
  END IF;

  v_project_id := COALESCE(v_log.destination_project_id, v_log.order_project_id);
  v_qty := COALESCE(v_log.returned_quantity, 1);

  SELECT COALESCE(MAX(balance), 0) INTO v_before
  FROM public.stock_balance
  WHERE project_id = v_project_id AND item_id = v_item_id;

  -- อะไหล่ย่อยสำหรับทดสอบการตัดสต็อก (ถ้ามีของในคลังปลายทาง)
  SELECT sb.item_id, sb.balance INTO v_spare_id, v_spare_before
  FROM public.stock_balance sb
  WHERE sb.project_id = v_project_id
    AND sb.item_id <> v_item_id
    AND sb.balance > 0
  ORDER BY sb.balance ASC, sb.item_id
  LIMIT 1;

  RAISE NOTICE 'SMOKE TEST: ทดสอบกับ return log % (ใบยืม %) item % คลัง %',
    v_log.id, v_log.order_number, v_item_id, v_project_id;

  -- 2) กรณี A: ซ่อมเสร็จ / คืนเข้าคลัง (+N) พร้อมตัดอะไหล่ย่อยถ้ามี
  v_result := public.resolve_damaged_return_item(jsonb_build_object(
    'return_log_id', v_log.id,
    'resolution', 'restored_to_stock',
    'project_id', v_project_id,
    'quantity', v_qty,
    'repair_notes', v_note,
    'reference_number', 'SMOKE-TEST',
    'spare_part_item_id', v_spare_id,
    'spare_part_quantity', CASE WHEN v_spare_id IS NULL THEN NULL ELSE 1 END
  ));

  IF COALESCE((v_result->>'success')::BOOLEAN, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'SMOKE TEST FAILED: RPC ไม่คืน success (result=%)', v_result;
  END IF;

  IF v_result->>'resolution' IS DISTINCT FROM 'restored_to_stock' THEN
    RAISE EXCEPTION 'SMOKE TEST FAILED: resolution ไม่ตรง (%)', v_result->>'resolution';
  END IF;

  SELECT COALESCE(MAX(balance), 0) INTO v_after
  FROM public.stock_balance
  WHERE project_id = v_project_id AND item_id = v_item_id;

  IF v_after <> v_before + v_qty THEN
    RAISE EXCEPTION 'SMOKE TEST FAILED: stock_balance ต้องเพิ่มขึ้น % (ก่อน % หลัง %)', v_qty, v_before, v_after;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stock_transactions st
    WHERE st.reference_type = 'repair_restored'
      AND st.reference_id = v_log.id
      AND st.item_id = v_item_id
      AND st.transaction_type = 'stock_in'
      AND st.quantity = v_qty::INTEGER
  ) THEN
    RAISE EXCEPTION 'SMOKE TEST FAILED: ไม่พบ ledger stock_in/repair_restored ของ return log %', v_log.id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.checkout_return_logs cl
    JOIN public.stock_in_items sii ON sii.order_id = cl.restored_stock_in_order_id
    WHERE cl.id = v_log.id
      AND cl.repair_resolution_status = 'restored_to_stock'
      AND cl.repair_resolved_at IS NOT NULL
      AND sii.item_id = v_item_id
      AND sii.quantity = v_qty::INTEGER
  ) THEN
    RAISE EXCEPTION 'SMOKE TEST FAILED: ไม่พบเอกสารรับเข้า (stock_in_orders/items) ที่ผูกกับ return log %', v_log.id;
  END IF;

  IF v_spare_id IS NOT NULL THEN
    SELECT COALESCE(MAX(balance), 0) INTO v_spare_after
    FROM public.stock_balance
    WHERE project_id = v_project_id AND item_id = v_spare_id;

    IF v_spare_after <> v_spare_before - 1 THEN
      RAISE EXCEPTION 'SMOKE TEST FAILED: สต็อกอะไหล่ % ต้องลดลง 1 (ก่อน % หลัง %)', v_spare_id, v_spare_before, v_spare_after;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.stock_transactions st
      WHERE st.reference_type = 'repair_spare_part'
        AND st.reference_id = v_log.id
        AND st.item_id = v_spare_id
        AND st.transaction_type = 'stock_out'
        AND st.quantity = 1
    ) THEN
      RAISE EXCEPTION 'SMOKE TEST FAILED: ไม่พบ ledger stock_out/repair_spare_part ของอะไหล่ %', v_spare_id;
    END IF;

    RAISE NOTICE 'SMOKE TEST: ตัดสต็อกอะไหล่ย่อยสำเร็จ (% → %)', v_spare_before, v_spare_after;
  ELSE
    RAISE NOTICE 'SMOKE TEST: ไม่มีอะไหล่คงเหลือในคลังนี้ — ข้ามการตรวจการตัดสต็อกอะไหล่ย่อย';
  END IF;

  RAISE NOTICE 'SMOKE TEST: ซ่อมเสร็จคืนคลังสำเร็จ stock % → %', v_before, v_after;

  -- 3) กรณี C: กดซ้ำต้องถูกปฏิเสธ (Idempotent)
  BEGIN
    PERFORM public.resolve_damaged_return_item(jsonb_build_object(
      'return_log_id', v_log.id,
      'resolution', 'restored_to_stock',
      'project_id', v_project_id,
      'quantity', v_qty,
      'repair_notes', v_note
    ));
    RAISE EXCEPTION 'SMOKE TEST FAILED: การกดซ้ำต้องถูกปฏิเสธ แต่ RPC ทำงานสำเร็จ';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'SMOKE TEST FAILED%' THEN
        RAISE;
      END IF;
      RAISE NOTICE 'SMOKE TEST: ปฏิเสธการกดซ้ำตามคาด → %', SQLERRM;
  END;

  -- 4) กรณี B: แทงจำหน่าย (ถ้ามีรายการชำรุดที่ยังไม่จัดการอีกรายการ)
  SELECT cl.*, co.project_id AS order_project_id
  INTO v_log2
  FROM public.checkout_return_logs cl
  JOIN public.checkout_orders co ON co.id = cl.checkout_order_id
  WHERE cl.item_condition IN ('damaged', 'needs_repair')
    AND cl.repair_resolution_status = 'unresolved'
    AND cl.id <> v_log.id
  ORDER BY cl.returned_at DESC
  LIMIT 1;

  IF v_log2.id IS NULL THEN
    RAISE NOTICE 'SMOKE TEST: ไม่มีรายการชำรุดรายการที่สอง — ข้ามการทดสอบกรณีแทงจำหน่าย';
  ELSE
    SELECT ci.item_id INTO v_item_id FROM public.checkout_items ci WHERE ci.id = v_log2.checkout_item_id;
    v_project_id := COALESCE(v_log2.destination_project_id, v_log2.order_project_id);

    SELECT COALESCE(MAX(balance), 0) INTO v_before
    FROM public.stock_balance WHERE project_id = v_project_id AND item_id = v_item_id;

    v_result := public.resolve_damaged_return_item(jsonb_build_object(
      'return_log_id', v_log2.id,
      'resolution', 'scrapped',
      'project_id', v_project_id,
      'quantity', COALESCE(v_log2.returned_quantity, 1),
      'repair_notes', 'SMOKE TEST (rollback): ซ่อมไม่คุ้ม แทงจำหน่าย',
      'disposal_method', 'electronic_waste'
    ));

    IF v_result->>'resolution' IS DISTINCT FROM 'scrapped' THEN
      RAISE EXCEPTION 'SMOKE TEST FAILED: resolution ของรายการที่สองไม่ตรง (%)', v_result->>'resolution';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.scrap_disposal_items sdi
      WHERE sdi.checkout_return_log_id = v_log2.id
        AND sdi.item_id = v_item_id
        AND sdi.disposal_method = 'electronic_waste'
    ) THEN
      RAISE EXCEPTION 'SMOKE TEST FAILED: ไม่พบทะเบียนของเสียของ return log %', v_log2.id;
    END IF;

    SELECT COALESCE(MAX(balance), 0) INTO v_after
    FROM public.stock_balance WHERE project_id = v_project_id AND item_id = v_item_id;

    IF v_after <> v_before THEN
      RAISE EXCEPTION 'SMOKE TEST FAILED: แทงจำหน่ายต้องไม่กระทบสต็อก (ก่อน % หลัง %)', v_before, v_after;
    END IF;

    RAISE NOTICE 'SMOKE TEST: แทงจำหน่ายสำเร็จ (สต็อกคงเดิม %)', v_after;
  END IF;

  RAISE NOTICE 'SMOKE TEST PASSED: migration 82 ทำงานครบทุกกรณี (transaction นี้จะถูก ROLLBACK)';
END;
$smoke$;

ROLLBACK;
