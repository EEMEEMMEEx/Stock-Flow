-- Migration: Fix public.approve_checkout_order — SQLSTATE 0A000
-- "FOR UPDATE is not allowed with GROUP BY clause"
--
-- Root cause:
--   public.stock_balance is a VIEW that aggregates stock_in_items / stock_transactions
--   (GROUP BY sio.project_id, sii.item_id, i.name, i.unit, p.name — see archive/46).
--   Migration 74 issued `PERFORM 1 FROM public.stock_balance ... FOR UPDATE`, which
--   PostgreSQL rejects on any aggregated relation with:
--     ERROR: 0A000 (feature_not_supported) FOR UPDATE is not allowed with GROUP BY clause
--   so every approve_checkout_order call failed with HTTP 400 before any stock was moved.
--
-- Fix (no behaviour change):
--   Step A — lock only real base-table rows (checkout_orders, checkout_items, items).
--   Step B — read the stock_balance aggregate WITHOUT any locking clause.
--   Both steps stay in the same transaction, so the locks are held until COMMIT.
--
-- Signature, return type, SECURITY DEFINER and search_path are unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION public.approve_checkout_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_order_id UUID;
  v_order RECORD;
  v_item RECORD;
  v_available NUMERIC;
  v_item_name TEXT;
  v_notes TEXT;
BEGIN
  -- ----------------------------------------------------------------
  -- All business rules raise ERRCODE P0001 (business_error) so the
  -- message stays Thai and reaches the client as HTTP 400.
  -- ----------------------------------------------------------------
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.approve')
    OR public.is_super_admin(v_caller_id)
    OR public.is_checkout_delegate(v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.approve permission.';
  END IF;

  v_order_id := NULLIF(p_payload->>'order_id', '')::UUID;
  v_notes := NULLIF(TRIM(COALESCE(p_payload->>'notes', '')), '');

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุรหัสคำขอยืม (order_id is required)';
  END IF;

  -- =================================================================
  -- STEP A: lock base-table rows only (never the stock_balance view)
  -- =================================================================

  -- A-1. Row lock the checkout order: serializes double-approval attempts.
  SELECT * INTO v_order
  FROM public.checkout_orders
  WHERE id = v_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลคำขอยืมพัสดุ ID: %', v_order_id;
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติ (สถานะปัจจุบัน: %)', v_order.status;
  END IF;

  -- A-2. Lock the checkout line rows that will be flipped to 'borrowed'.
  PERFORM 1
  FROM public.checkout_items ci
  WHERE ci.checkout_order_id = v_order_id
  ORDER BY ci.id
  FOR UPDATE;

  -- A-3. Lock the item master rows in deterministic order to prevent deadlock.
  --      This is the same per-item mutex used by approve_withdrawal_order and
  --      process_item_transfer, so concurrent stock movements on the same item
  --      are serialized against this approval.
  PERFORM 1
  FROM public.items i
  WHERE i.id IN (
    SELECT ci.item_id
    FROM public.checkout_items ci
    WHERE ci.checkout_order_id = v_order_id
  )
  ORDER BY i.id
  FOR UPDATE;

  -- =================================================================
  -- STEP B: aggregate read — stock_balance is a GROUP BY view, so it
  -- must be read with NO locking clause (see header comment).
  -- =================================================================

  -- Validate stock sufficiency and deduct stock for each checkout item
  FOR v_item IN
    SELECT ci.id AS item_row_id, ci.item_id, ci.quantity_borrowed, ci.serial_number, i.name AS item_name
    FROM public.checkout_items ci
    JOIN public.items i ON i.id = ci.item_id
    WHERE ci.checkout_order_id = v_order_id
    ORDER BY ci.id
  LOOP
    SELECT balance INTO v_available
    FROM public.stock_balance
    WHERE project_id = v_order.project_id AND item_id = v_item.item_id;

    IF COALESCE(v_available, 0) < v_item.quantity_borrowed THEN
      RAISE EXCEPTION 'ยอดสต็อกคงเหลือไม่เพียงพอสำหรับ "%" (คงเหลือ % ชิ้น, ต้องการจ่าย % ชิ้น)',
        v_item.item_name, COALESCE(v_available, 0), v_item.quantity_borrowed;
    END IF;

    -- Record stock deduction transaction
    INSERT INTO public.stock_transactions (
      project_id,
      item_id,
      transaction_type,
      quantity,
      reference_id,
      reference_type,
      created_by,
      notes
    ) VALUES (
      v_order.project_id,
      v_item.item_id,
      'checkout_out',
      v_item.quantity_borrowed,
      v_order.id,
      'checkout_order',
      v_caller_id,
      'อนุมัติและจ่ายอุปกรณ์: คำสั่งยืม ' || v_order.order_number
    );

    -- Update line item status to 'borrowed'
    UPDATE public.checkout_items
    SET status = 'borrowed'
    WHERE id = v_item.item_row_id;
  END LOOP;

  -- Update order status to active with approver identity
  UPDATE public.checkout_orders
  SET
    status = 'active',
    approved_by = v_caller_id,
    approved_at = now(),
    notes = CASE
      WHEN v_notes IS NOT NULL AND v_order.notes IS NOT NULL THEN v_order.notes || E'\n[อนุมัติโดยเจ้าหน้าที่]: ' || v_notes
      WHEN v_notes IS NOT NULL THEN '[อนุมัติโดยเจ้าหน้าที่]: ' || v_notes
      ELSE v_order.notes
    END
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order.order_number,
    'status', 'active',
    'approved_by', v_caller_id,
    'approved_at', now(),
    'message', 'อนุมัติและจ่ายพัสดุสำหรับคำขอยืม ' || v_order.order_number || ' สำเร็จเรียบร้อย'
  );
EXCEPTION
  -- Business rule violations already carry a Thai, user-facing message.
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  -- Anything else is surfaced as a typed business error instead of a raw
  -- PostgreSQL error; the original SQLSTATE/message stays in DETAIL for logs.
  WHEN OTHERS THEN
    RAISE EXCEPTION 'อนุมัติคำขอยืมไม่สำเร็จ: ระบบฐานข้อมูลขัดข้อง กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบ'
      USING ERRCODE = 'P0001',
            DETAIL = 'SQLSTATE ' || SQLSTATE || ': ' || SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_checkout_order(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_checkout_order(JSONB) TO authenticated, service_role;

COMMIT;
