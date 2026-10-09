-- Migration 79: CAIM Inbound Webhook Processing (Phase 3)
-- ---------------------------------------------------------------------------
-- CONTEXT
--   CAIM (ระบบงานเคลม/RMA) ยิง Webhook กลับมาเมื่อปิดเคสพร้อมผลการซ่อม
--   (Phase 2 ฝั่ง CAIM: POST https://stockflowth.online/api/caim-webhook)
--   Migration นี้สร้างตาราง/คอลัมน์ที่จำเป็นสำหรับประมวลผลขากลับแบบ Atomic
--   และ Idempotent ตามแผน docs/caim-webhook-integration-plan.md ข้อ 4.1
--
-- WHAT THIS MIGRATION DOES
--   1. public.caim_webhook_logs        : บันทึกทุก event + UNIQUE(event_id) กันประมวลผลซ้ำ
--   2. public.scrap_disposal_items     : ทะเบียนของเสีย (unrepairable) — ไม่กระทบยอดสต็อก
--   3. คอลัมน์ติดตามผลขากลับใน checkout_return_logs
--      (caim_repair_result, caim_closed_at, caim_inbound_processed_at,
--       caim_stock_in_order_id, caim_scrap_disposal_id)
--   4. คอลัมน์ stock_in_items.serial_number สำหรับบันทึก S/N ที่รับกลับเข้าคลัง
--   5. RPC public.process_caim_webhook_event(JSONB)
--      - unrepairable            -> บันทึกของเสีย (สต็อกไม่ขยับ)
--      - repaired / replaced_new -> สร้างเอกสารรับเข้า (stock_in) 1 หน่วย
--   6. Index สำหรับค้นหา return log ด้วย caim_ticket_id
--
-- SECURITY
--   - RPC: SECURITY DEFINER, SET search_path = public, auth, pg_temp
--   - RPC: REVOKE จาก PUBLIC/anon, GRANT เฉพาะ service_role (เรียกจาก Serverless เท่านั้น)
--   - ตารางใหม่: ENABLE ROW LEVEL SECURITY + Policy อ่านอย่างเดียวสำหรับ authenticated
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. ตารางบันทึก Webhook (Idempotency Guard)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.caim_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  ticket_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  repair_result TEXT,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.caim_webhook_logs'::regclass
      AND conname = 'caim_webhook_logs_status_check'
  ) THEN
    ALTER TABLE public.caim_webhook_logs
      ADD CONSTRAINT caim_webhook_logs_status_check
      CHECK (status IN ('processing', 'processed', 'duplicate', 'unmatched', 'failed')) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.caim_webhook_logs
  VALIDATE CONSTRAINT caim_webhook_logs_status_check;

CREATE INDEX IF NOT EXISTS idx_caim_webhook_logs_ticket
  ON public.caim_webhook_logs (ticket_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. ตารางทะเบียนของเสีย (Scrap / Unrepairable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scrap_disposal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_return_log_id UUID REFERENCES public.checkout_return_logs(id) ON DELETE SET NULL,
  checkout_order_id UUID REFERENCES public.checkout_orders(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  serial_number TEXT,
  reason TEXT,
  disposal_method TEXT,
  caim_ticket_id TEXT,
  caim_closed_at TIMESTAMPTZ,
  closed_by TEXT,
  disposed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrap_disposal_items_project
  ON public.scrap_disposal_items (project_id, disposed_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrap_disposal_items_ticket
  ON public.scrap_disposal_items (caim_ticket_id);

-- ---------------------------------------------------------------------------
-- 3. คอลัมน์ติดตามผลขากลับใน checkout_return_logs
-- ---------------------------------------------------------------------------
ALTER TABLE public.checkout_return_logs
  ADD COLUMN IF NOT EXISTS caim_repair_result TEXT,
  ADD COLUMN IF NOT EXISTS caim_closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS caim_inbound_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS caim_stock_in_order_id UUID REFERENCES public.stock_in_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS caim_scrap_disposal_id UUID REFERENCES public.scrap_disposal_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_checkout_return_logs_caim_ticket
  ON public.checkout_return_logs (caim_ticket_id)
  WHERE caim_ticket_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. S/N ที่รับกลับเข้าคลัง (ผลซ่อมสำเร็จ / เปลี่ยนเครื่องใหม่)
-- ---------------------------------------------------------------------------
ALTER TABLE public.stock_in_items
  ADD COLUMN IF NOT EXISTS serial_number TEXT;

-- ---------------------------------------------------------------------------
-- 5. RPC: process_caim_webhook_event(JSONB)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_caim_webhook_event(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_event TEXT := NULLIF(TRIM(COALESCE(p_payload->>'event', '')), '');
  v_event_id TEXT := NULLIF(TRIM(COALESCE(p_payload->>'eventId', '')), '');
  v_ticket_id TEXT := NULLIF(TRIM(COALESCE(p_payload->>'ticketId', '')), '');
  v_serial TEXT := NULLIF(TRIM(COALESCE(p_payload->>'serialNo', '')), '');
  v_repair TEXT := NULLIF(TRIM(COALESCE(p_payload->>'repairResult', '')), '');
  v_notes TEXT := NULLIF(TRIM(COALESCE(p_payload->>'technicianNotes', '')), '');
  v_disposal TEXT := NULLIF(TRIM(COALESCE(p_payload->>'disposalMethod', '')), '');
  v_new_serial TEXT := NULLIF(TRIM(COALESCE(p_payload->>'replacedNewSerialNo', '')), '');
  v_closed_at TIMESTAMPTZ := COALESCE(NULLIF(TRIM(COALESCE(p_payload->>'closedAt', '')), '')::TIMESTAMPTZ, now());
  v_closed_by TEXT := NULLIF(TRIM(COALESCE(p_payload->>'closedBy', '')), '');
  v_log_id UUID;
  v_existing_status TEXT;
  v_existing_message TEXT;
  v_return RECORD;
  v_project_id UUID;
  v_item_id UUID;
  v_stock_in_order UUID;
  v_scrap_id UUID;
BEGIN
  -- 5.1 Authorization: service_role (auth.uid() IS NULL) หรือผู้มีสิทธิ์รับคืน
  IF v_caller IS NOT NULL AND NOT (
    public.has_permission(v_caller, 'checkouts.return') OR public.is_super_admin(v_caller)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.return permission.';
  END IF;

  -- 5.2 Validate payload (ผิดรูปแบบ = ปฏิเสธด้วย SQL error -> HTTP 4xx ไม่ retry)
  IF v_event IS DISTINCT FROM 'claim.closed' THEN
    RAISE EXCEPTION 'Unsupported event: %', COALESCE(v_event, '(null)');
  END IF;

  IF v_ticket_id IS NULL THEN
    RAISE EXCEPTION 'ticketId is required';
  END IF;

  IF v_repair IS NULL OR v_repair NOT IN ('unrepairable', 'repaired', 'replaced_new') THEN
    RAISE EXCEPTION 'Unsupported repairResult: %', COALESCE(v_repair, '(null)');
  END IF;

  IF v_event_id IS NULL THEN
    v_event_id := v_ticket_id || ':' || v_repair || ':' || COALESCE(v_new_serial, v_serial, '-');
  END IF;

  -- 5.3 Idempotency claim: event เดียวกันประมวลผลได้ครั้งเดียว
  INSERT INTO public.caim_webhook_logs (event_id, ticket_id, event_type, repair_result, payload, status)
  VALUES (v_event_id, v_ticket_id, v_event, v_repair, p_payload, 'processing')
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_log_id;

  IF v_log_id IS NULL THEN
    SELECT status, message INTO v_existing_status, v_existing_message
    FROM public.caim_webhook_logs WHERE event_id = v_event_id;

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'event_id', v_event_id,
      'status', COALESCE(v_existing_status, 'duplicate'),
      'message', COALESCE(v_existing_message, 'Event already processed')
    );
  END IF;

  -- 5.4 ประมวลผลใน sub-transaction: ล้มเหลวแล้ว rollback เฉพาะงาน แต่ยังเก็บ log ไว้
  BEGIN
    SELECT * INTO v_return
    FROM public.checkout_return_logs
    WHERE caim_ticket_id = v_ticket_id
    ORDER BY returned_at DESC NULLS LAST
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      UPDATE public.caim_webhook_logs
      SET status = 'unmatched',
          message = 'ไม่พบรายการรับคืนที่ผูกกับ CAIM Ticket ' || v_ticket_id,
          processed_at = now()
      WHERE id = v_log_id;

      RETURN jsonb_build_object(
        'success', false,
        'processed', false,
        'event_id', v_event_id,
        'status', 'unmatched',
        'message', 'ไม่พบรายการรับคืนที่ผูกกับ CAIM Ticket ' || v_ticket_id
      );
    END IF;

    SELECT project_id INTO v_project_id
    FROM public.checkout_orders WHERE id = v_return.checkout_order_id;

    SELECT item_id INTO v_item_id
    FROM public.checkout_items WHERE id = v_return.checkout_item_id;

    IF v_project_id IS NULL OR v_item_id IS NULL THEN
      RAISE EXCEPTION 'Return log % is missing project_id or item_id', v_return.id;
    END IF;

    IF v_repair = 'unrepairable' THEN
      -- ของเสีย: ไม่มี stock movement (สต็อกถูกตัดไปตั้งแต่การยืมแล้ว)
      INSERT INTO public.scrap_disposal_items (
        checkout_return_log_id, checkout_order_id, project_id, item_id, quantity,
        serial_number, reason, disposal_method, caim_ticket_id, caim_closed_at, closed_by, notes
      ) VALUES (
        v_return.id, v_return.checkout_order_id, v_project_id, v_item_id, 1,
        COALESCE(v_serial, v_return.replaced_serial_number), v_notes,
        COALESCE(v_disposal, 'electronic_waste'), v_ticket_id, v_closed_at, v_closed_by, v_notes
      ) RETURNING id INTO v_scrap_id;
    ELSE
      -- ซ่อมสำเร็จ / เปลี่ยนเครื่องใหม่: สร้างเอกสารรับเข้า 1 หน่วย
      INSERT INTO public.stock_in_orders (
        project_id, supplier, notes, received_date, created_by
      ) VALUES (
        v_project_id,
        'CAIM Claim Return ' || v_ticket_id,
        'รับอุปกรณ์คืนจากงานเคลม CAIM Ticket ' || v_ticket_id || ' (' || v_repair || ')',
        CURRENT_DATE,
        v_caller
      ) RETURNING id INTO v_stock_in_order;

      INSERT INTO public.stock_in_items (
        order_id, item_id, quantity, notes, serial_number
      ) VALUES (
        v_stock_in_order, v_item_id, 1,
        'รับคืนจากงานเคลม CAIM Ticket ' || v_ticket_id || ' (' || v_repair || ')'
          || COALESCE(' | S/N ใหม่: ' || v_new_serial, ''),
        COALESCE(v_new_serial, v_serial, v_return.replaced_serial_number)
      );

      INSERT INTO public.stock_transactions (
        project_id, item_id, quantity, transaction_type, reference_type, reference_id, created_by, notes
      ) VALUES (
        v_project_id, v_item_id, 1, 'stock_in', 'claim_return', v_stock_in_order, v_caller,
        'รับคืนจากงานเคลม CAIM Ticket ' || v_ticket_id || ' (' || v_repair || ')'
      );
    END IF;

    UPDATE public.checkout_return_logs
    SET caim_repair_result = v_repair,
        caim_closed_at = v_closed_at,
        caim_inbound_processed_at = now(),
        caim_stock_in_order_id = v_stock_in_order,
        caim_scrap_disposal_id = v_scrap_id
    WHERE id = v_return.id;

    UPDATE public.caim_webhook_logs
    SET status = 'processed',
        message = CASE
          WHEN v_repair = 'unrepairable' THEN 'บันทึกของเสียเรียบร้อย (สต็อกไม่เปลี่ยนแปลง)'
          ELSE 'รับอุปกรณ์เข้าคลังเรียบร้อย (+1)'
        END,
        processed_at = now()
    WHERE id = v_log_id;

    RETURN jsonb_build_object(
      'success', true,
      'processed', true,
      'event_id', v_event_id,
      'status', 'processed',
      'ticket_id', v_ticket_id,
      'repair_result', v_repair,
      'return_log_id', v_return.id,
      'scrap_disposal_id', v_scrap_id,
      'stock_in_order_id', v_stock_in_order,
      'message', CASE
        WHEN v_repair = 'unrepairable' THEN 'บันทึกของเสียเรียบร้อย (สต็อกไม่เปลี่ยนแปลง)'
        ELSE 'รับอุปกรณ์เข้าคลังเรียบร้อย (+1)'
      END
    );
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.caim_webhook_logs
    SET status = 'failed',
        message = SQLERRM,
        processed_at = now()
    WHERE id = v_log_id;

    RETURN jsonb_build_object(
      'success', false,
      'processed', false,
      'event_id', v_event_id,
      'status', 'failed',
      'message', SQLERRM
    );
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.process_caim_webhook_event(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_caim_webhook_event(JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. RLS & สิทธิ์อ่านสำหรับรายงาน
-- ---------------------------------------------------------------------------
ALTER TABLE public.caim_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrap_disposal_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caim_webhook_logs_read" ON public.caim_webhook_logs;
CREATE POLICY "caim_webhook_logs_read" ON public.caim_webhook_logs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "scrap_disposal_items_read" ON public.scrap_disposal_items;
CREATE POLICY "scrap_disposal_items_read" ON public.scrap_disposal_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "scrap_disposal_items_auth_manage" ON public.scrap_disposal_items;
CREATE POLICY "scrap_disposal_items_auth_manage" ON public.scrap_disposal_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON public.caim_webhook_logs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scrap_disposal_items TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Verification Guard
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.caim_webhook_logs') IS NULL THEN
    RAISE EXCEPTION 'Migration validation failed: public.caim_webhook_logs is missing';
  END IF;

  IF to_regclass('public.scrap_disposal_items') IS NULL THEN
    RAISE EXCEPTION 'Migration validation failed: public.scrap_disposal_items is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'checkout_return_logs'
      AND column_name = 'caim_inbound_processed_at'
  ) THEN
    RAISE EXCEPTION 'Migration validation failed: checkout_return_logs.caim_inbound_processed_at is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_in_items'
      AND column_name = 'serial_number'
  ) THEN
    RAISE EXCEPTION 'Migration validation failed: stock_in_items.serial_number is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'process_caim_webhook_event'
  ) THEN
    RAISE EXCEPTION 'Migration validation failed: process_caim_webhook_event is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_checkout_return_logs_caim_ticket'
  ) THEN
    RAISE EXCEPTION 'Migration validation failed: idx_checkout_return_logs_caim_ticket is missing';
  END IF;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
