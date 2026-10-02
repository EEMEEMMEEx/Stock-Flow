-- Migration 55: Return Due Date Extension for Checkouts System
-- Adds checkout_extension_logs table, checkouts.extend permission, and atomic RPC extend_checkout_due_date

-- 1. Create Extension Logs Table (Audit Trail)
CREATE TABLE IF NOT EXISTS public.checkout_extension_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_order_id UUID NOT NULL REFERENCES public.checkout_orders(id) ON DELETE CASCADE,
  previous_due_date DATE NOT NULL,
  new_due_date DATE NOT NULL,
  extension_reason TEXT,
  extended_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  extended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_checkout_ext_order ON public.checkout_extension_logs(checkout_order_id);
CREATE INDEX IF NOT EXISTS idx_checkout_ext_extended_at ON public.checkout_extension_logs(extended_at DESC);

-- 2. Enable RLS on checkout_extension_logs
ALTER TABLE public.checkout_extension_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read checkout_extension_logs" ON public.checkout_extension_logs;
CREATE POLICY "Allow authenticated users to read checkout_extension_logs"
ON public.checkout_extension_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert checkout_extension_logs" ON public.checkout_extension_logs;
CREATE POLICY "Allow authenticated users to insert checkout_extension_logs"
ON public.checkout_extension_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 3. Register 'checkouts.extend' Permission in Master Catalog
INSERT INTO public.permissions (code, name, description, resource, action, category)
VALUES (
  'checkouts.extend',
  'ขยายกำหนดวันส่งคืนพัสดุ',
  'อนุญาตให้ขยายกำหนดวันส่งคืนสำหรับรายการยืมคงค้าง (Extend Return Due Date)',
  'checkouts',
  'extend',
  'Checkouts & Returns'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

-- Assign 'checkouts.extend' to SUPERVISOR and ADMIN by default
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('ADMIN', 'SUPERVISOR')
  AND p.code = 'checkouts.extend'
ON CONFLICT DO NOTHING;

-- 4. Atomic Stored Procedure / RPC: extend_checkout_due_date
CREATE OR REPLACE FUNCTION public.extend_checkout_due_date(
  p_order_id UUID,
  p_new_due_date DATE,
  p_reason TEXT DEFAULT NULL,
  p_extended_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_effective_user_id UUID;
  v_order RECORD;
  v_prev_due_date DATE;
  v_new_status TEXT;
  v_log_id UUID;
BEGIN
  -- 1. Authorization check
  IF v_caller_id IS NOT NULL THEN
    IF NOT (public.has_permission(v_caller_id, 'checkouts.extend') OR public.has_permission(v_caller_id, 'checkouts.update')) THEN
      RAISE EXCEPTION 'Unauthorized: Requires checkouts.extend permission.';
    END IF;
    v_effective_user_id := v_caller_id;
  ELSE
    v_effective_user_id := p_extended_by;
  END IF;

  -- 2. Fetch checkout order
  SELECT * INTO v_order
  FROM public.checkout_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout order not found with ID %', p_order_id;
  END IF;

  IF v_order.status = 'completed' OR v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot extend return date for a completed or cancelled checkout order.';
  END IF;

  v_prev_due_date := v_order.expected_return_date;

  -- 3. Validate new date
  IF p_new_due_date <= v_prev_due_date THEN
    RAISE EXCEPTION 'New return due date (%) must be later than the current due date (%).', p_new_due_date, v_prev_due_date;
  END IF;

  -- 4. Recalculate status
  -- If previously overdue, and new due date is today or in future -> set to 'active' or 'partial_returned'
  IF v_order.status = 'overdue' THEN
    IF p_new_due_date >= CURRENT_DATE THEN
      -- Check if any items already returned
      IF EXISTS (
        SELECT 1 FROM public.checkout_items 
        WHERE checkout_order_id = p_order_id AND (quantity_returned > 0 OR quantity_damaged > 0 OR quantity_lost > 0)
      ) THEN
        v_new_status := 'partial_returned';
      ELSE
        v_new_status := 'active';
      END IF;
    ELSE
      v_new_status := 'overdue';
    END IF;
  ELSE
    v_new_status := v_order.status;
  END IF;

  -- 5. Update checkout_orders
  UPDATE public.checkout_orders
  SET 
    expected_return_date = p_new_due_date,
    status = v_new_status
  WHERE id = p_order_id;

  -- 6. Insert into checkout_extension_logs
  INSERT INTO public.checkout_extension_logs (
    checkout_order_id,
    previous_due_date,
    new_due_date,
    extension_reason,
    extended_by,
    extended_at
  )
  VALUES (
    p_order_id,
    v_prev_due_date,
    p_new_due_date,
    TRIM(p_reason),
    v_effective_user_id,
    now()
  )
  RETURNING id INTO v_log_id;

  -- 7. Audit log if available
  BEGIN
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
      INSERT INTO public.audit_logs (user_id, action, target_type, target_id, details)
      VALUES (
        v_effective_user_id,
        'checkout.extend_due_date',
        'checkout_order',
        p_order_id::TEXT,
        jsonb_build_object(
          'order_number', v_order.order_number,
          'previous_due_date', v_prev_due_date,
          'new_due_date', p_new_due_date,
          'reason', p_reason,
          'extended_by', v_effective_user_id
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Silently ignore audit log failures to preserve primary transaction
  END;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'previous_due_date', v_prev_due_date,
    'new_due_date', p_new_due_date,
    'new_status', v_new_status,
    'log_id', v_log_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.extend_checkout_due_date(UUID, DATE, TEXT, UUID) TO authenticated;
