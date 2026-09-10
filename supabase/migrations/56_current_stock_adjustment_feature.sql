-- =================================================================
-- MIGRATION 56: CURRENT STOCK ADJUSTMENT & AUDIT LOGGING FEATURE
-- =================================================================
-- Purpose:
-- 1. Creates public.stock_adjustment_logs table with RLS and indexes.
-- 2. Seeds 'items.adjust_stock' permission and maps it to ADMIN and SUPERVISOR.
-- 3. Seeds 'allow_direct_stock_adjustment' system setting in public.system_settings.
-- 4. Creates atomic RPC public.adjust_item_current_stock for direct stock adjustment.

-- 1. Create stock_adjustment_logs table
CREATE TABLE IF NOT EXISTS public.stock_adjustment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  previous_quantity INTEGER NOT NULL DEFAULT 0,
  new_quantity INTEGER NOT NULL DEFAULT 0,
  difference INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast query and audit inspection
CREATE INDEX IF NOT EXISTS idx_stock_adj_item ON public.stock_adjustment_logs (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_adj_project ON public.stock_adjustment_logs (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_adj_created ON public.stock_adjustment_logs (created_at DESC);

-- Enable RLS
ALTER TABLE public.stock_adjustment_logs ENABLE ROW LEVEL SECURITY;

-- Read Policy: Authenticated users can view adjustment logs
DROP POLICY IF EXISTS "stock_adjustment_logs_read" ON public.stock_adjustment_logs;
CREATE POLICY "stock_adjustment_logs_read" ON public.stock_adjustment_logs
  FOR SELECT TO authenticated USING (true);

-- Insert Policy: Authenticated users with items.adjust_stock or admin
DROP POLICY IF EXISTS "stock_adjustment_logs_insert" ON public.stock_adjustment_logs;
CREATE POLICY "stock_adjustment_logs_insert" ON public.stock_adjustment_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'items.adjust_stock') 
    OR public.has_permission(auth.uid(), 'items.update')
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 2. Seed 'items.adjust_stock' RBAC permission
INSERT INTO public.permissions (code, name, description, resource, action, category)
VALUES (
  'items.adjust_stock',
  'ปรับยอดสต็อกคงเหลือปัจจุบัน',
  'แก้ไขและปรับปรุงจำนวนสต็อกคงเหลือของวัสดุโดยตรงในหน้า Master Item',
  'items',
  'adjust_stock',
  'Items Master'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action;

-- Map to ADMIN and SUPERVISOR
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('ADMIN', 'SUPERVISOR') AND p.code = 'items.adjust_stock'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. Seed 'allow_direct_stock_adjustment' default setting in system_settings
INSERT INTO public.system_settings (key, value, category, description)
VALUES (
  'allow_direct_stock_adjustment',
  'false'::jsonb,
  'inventory',
  'อนุญาตให้แก้ไขจำนวนสต็อกคงเหลือปัจจุบันโดยตรงในหน้าแก้ไขรายการวัสดุ (Current Stock Editing in Items)'
)
ON CONFLICT (key) DO NOTHING;

-- 4. Atomic RPC Function: adjust_item_current_stock
CREATE OR REPLACE FUNCTION public.adjust_item_current_stock(
  p_item_id UUID,
  p_project_id UUID,
  p_new_quantity INTEGER,
  p_reason TEXT,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_setting_val JSONB;
  v_allow_editing BOOLEAN;
  v_item_name TEXT;
  v_item_sku TEXT;
  v_item_unit TEXT;
  v_project_name TEXT;
  v_project_loc TEXT;
  v_project_display TEXT;
  v_current_balance INTEGER;
  v_diff INTEGER;
  v_abs_diff INTEGER;
  v_order_id UUID;
  v_log_id UUID;
BEGIN
  -- A. Identify caller
  v_caller_id := COALESCE(auth.uid(), p_actor_id);

  -- B. Check Global Setting
  SELECT value INTO v_setting_val
  FROM public.system_settings
  WHERE key = 'allow_direct_stock_adjustment';

  IF v_setting_val IS NOT NULL THEN
    v_allow_editing := (v_setting_val::text = 'true' OR v_setting_val = '"true"'::jsonb);
  ELSE
    v_allow_editing := false;
  END IF;

  IF NOT v_allow_editing THEN
    RAISE EXCEPTION 'ระบบถูกปิดการแก้ไขยอดสต็อกคงเหลือปัจจุบัน กรุณาเปิดใช้งานในการตั้งค่าระบบ (Settings) ก่อนทำรายการ';
  END IF;

  -- C. Authorization Check
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR (v_caller_role != 'admin' AND NOT public.has_permission(v_caller_id, 'items.adjust_stock')) THEN
    IF NOT public.has_permission(v_caller_id, 'items.update') THEN
      RAISE EXCEPTION 'Unauthorized: คุณไม่มีสิทธิ์ปรับยอดสต็อกคงเหลือ (ต้องการสิทธิ์ items.adjust_stock)';
    END IF;
  END IF;

  -- D. Parameter Validation
  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุรายการวัสดุ (Item ID)';
  END IF;

  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุโครงการ/คลังสินค้า (Project ID)';
  END IF;

  IF p_new_quantity IS NULL OR p_new_quantity < 0 THEN
    RAISE EXCEPTION 'จำนวนสต็อกใหม่ต้องเป็นตัวเลขที่ไม่ติดลบ (>= 0)';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'กรุณาระบุเหตุผลในการปรับปรุงยอดสต็อก (Reason is required)';
  END IF;

  -- E. Validate Item and Project
  SELECT name, sku, unit INTO v_item_name, v_item_sku, v_item_unit
  FROM public.items
  WHERE id = p_item_id;

  IF v_item_name IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลรายการวัสดุในระบบ (ID: %)', p_item_id;
  END IF;

  SELECT name, location INTO v_project_name, v_project_loc
  FROM public.projects
  WHERE id = p_project_id AND status = 'active';

  IF v_project_name IS NULL THEN
    RAISE EXCEPTION 'ไม่พบโครงการ/คลังสินค้า หรือโครงการไม่ได้อยู่ในสถานะใช้งาน';
  END IF;

  v_project_display := v_project_name || (CASE WHEN v_project_loc IS NOT NULL AND v_project_loc != '' THEN ' (' || v_project_loc || ')' ELSE '' END);

  -- F. Get current balance from stock_balance view
  SELECT balance INTO v_current_balance
  FROM public.stock_balance
  WHERE project_id = p_project_id AND item_id = p_item_id;

  v_current_balance := COALESCE(v_current_balance, 0);
  v_diff := p_new_quantity - v_current_balance;

  IF v_diff = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'changed', false,
      'item_name', v_item_name,
      'previous_quantity', v_current_balance,
      'new_quantity', p_new_quantity,
      'difference', 0,
      'message', 'ยอดสต็อกคงเหลือเท่าเดิม ไม่มีการปรับปรุงยอด'
    );
  END IF;

  -- G. Apply Stock Adjustment Transactions (Non-destructive)
  IF v_diff > 0 THEN
    -- Stock Increase: Create stock_in_orders + stock_in_items
    INSERT INTO public.stock_in_orders (
      project_id,
      created_by,
      received_date,
      notes
    ) VALUES (
      p_project_id,
      v_caller_id,
      CURRENT_DATE,
      'ปรับยอดสต็อกคงเหลือ (+ ' || v_diff || ' ' || v_item_unit || ') | เหตุผล: ' || TRIM(p_reason)
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.stock_in_items (
      order_id,
      item_id,
      quantity,
      notes
    ) VALUES (
      v_order_id,
      p_item_id,
      v_diff,
      'ปรับยอดสต็อกคงเหลือเพิ่ม | เหตุผล: ' || TRIM(p_reason)
    );

    -- Also record in stock_transactions
    INSERT INTO public.stock_transactions (
      project_id,
      item_id,
      quantity,
      transaction_type,
      notes,
      created_by
    ) VALUES (
      p_project_id,
      p_item_id,
      v_diff,
      'stock_in',
      'ปรับยอดสต็อกคงเหลือเพิ่ม (+ ' || v_diff || ' ' || v_item_unit || ') | เหตุผล: ' || TRIM(p_reason),
      v_caller_id
    );

  ELSE
    -- Stock Decrease: Record in stock_transactions
    v_abs_diff := ABS(v_diff);

    INSERT INTO public.stock_transactions (
      project_id,
      item_id,
      quantity,
      transaction_type,
      notes,
      created_by
    ) VALUES (
      p_project_id,
      p_item_id,
      v_abs_diff,
      'stock_out',
      'ปรับยอดสต็อกคงเหลือลดลง (- ' || v_abs_diff || ' ' || v_item_unit || ') | เหตุผล: ' || TRIM(p_reason),
      v_caller_id
    );
  END IF;

  -- H. Insert into stock_adjustment_logs
  INSERT INTO public.stock_adjustment_logs (
    item_id,
    project_id,
    previous_quantity,
    new_quantity,
    difference,
    reason,
    created_by,
    created_at
  ) VALUES (
    p_item_id,
    p_project_id,
    v_current_balance,
    p_new_quantity,
    v_diff,
    TRIM(p_reason),
    v_caller_id,
    NOW()
  ) RETURNING id INTO v_log_id;

  -- I. Insert into system audit_logs
  INSERT INTO public.audit_logs (
    actor_id,
    action,
    details
  ) VALUES (
    v_caller_id,
    'stock.adjust',
    jsonb_build_object(
      'log_id', v_log_id,
      'item_id', p_item_id,
      'item_name', v_item_name,
      'sku', v_item_sku,
      'project_id', p_project_id,
      'project_name', v_project_display,
      'previous_quantity', v_current_balance,
      'new_quantity', p_new_quantity,
      'difference', v_diff,
      'unit', v_item_unit,
      'reason', TRIM(p_reason)
    )
  );

  -- J. Return Result
  RETURN jsonb_build_object(
    'success', true,
    'changed', true,
    'log_id', v_log_id,
    'item_name', v_item_name,
    'sku', v_item_sku,
    'unit', v_item_unit,
    'project_name', v_project_display,
    'previous_quantity', v_current_balance,
    'new_quantity', p_new_quantity,
    'difference', v_diff,
    'reason', TRIM(p_reason),
    'message', 'ปรับยอดสต็อก ' || v_item_name || ' จาก ' || v_current_balance || ' เป็น ' || p_new_quantity || ' ' || v_item_unit || ' (' || (CASE WHEN v_diff > 0 THEN '+' || v_diff ELSE '' || v_diff END) || ') สำเร็จ'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_item_current_stock(UUID, UUID, INTEGER, TEXT, UUID) TO authenticated;
