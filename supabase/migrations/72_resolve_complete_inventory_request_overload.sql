-- Migration 72: Resolve complete_inventory_request Overload Conflict (PGRST203)
-- Removes duplicate/overloaded functions and consolidates into a single canonical RPC

-- 1. Drop old function overloads
DROP FUNCTION IF EXISTS public.complete_inventory_request(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.complete_inventory_request(UUID, TEXT) CASCADE;

-- 2. Ensure remarks column exists on withdrawal_orders for schema compatibility
ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS remarks TEXT;

-- 3. Create single canonical function with optional p_remarks
CREATE OR REPLACE FUNCTION public.complete_inventory_request(
  p_request_id UUID,
  p_remarks TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_order RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  -- Lock request row for atomic update
  SELECT * INTO v_order
  FROM public.withdrawal_orders
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found: %', p_request_id;
  END IF;

  -- Verify permissions: Requester can complete their own, or users with complete/manage permissions / admin role
  IF v_order.requested_by != v_user_id THEN
    IF NOT (
      public.is_super_admin(v_user_id) OR
      public.has_permission(v_user_id, 'withdrawals.complete') OR
      public.has_permission(v_user_id, 'withdrawals.manage') OR
      EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND role IN ('admin', 'super_admin', 'supervisor'))
    ) THEN
      RAISE EXCEPTION 'Unauthorized: You can only complete your own requests.';
    END IF;
  END IF;

  IF v_order.status != 'approved' THEN
    RAISE EXCEPTION 'Invalid request state: Request % is currently % (only approved requests can be completed)', p_request_id, v_order.status;
  END IF;

  -- Update withdrawal order status to completed
  UPDATE public.withdrawal_orders
  SET 
    status = 'completed',
    notes = COALESCE(p_remarks, notes),
    remarks = COALESCE(p_remarks, remarks, notes),
    completed_at = NOW(),
    completed_by = v_user_id
  WHERE id = p_request_id;

  -- Record audit log
  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    v_user_id,
    'WITHDRAWAL_COMPLETED',
    jsonb_build_object(
      'order_id', p_request_id,
      'remarks', p_remarks,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Request completed successfully.',
    'order_id', p_request_id,
    'request_id', p_request_id
  );
END;
$$;

-- 3. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.complete_inventory_request(UUID, TEXT) TO authenticated, service_role;

-- 4. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
