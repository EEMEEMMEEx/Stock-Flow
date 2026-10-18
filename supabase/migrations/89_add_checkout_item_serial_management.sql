-- =============================================================================
-- Migration 88: Add checkout item serial management and retro-entry for CAIM
-- (docs/caim-claim-sn-fix-plan.md)
-- =============================================================================
-- Enables retro-entry / correction of Serial Numbers (S/N) for borrowed and
-- returned equipment (especially damaged items requiring CAIM claim submission).
-- 1. Registers 'checkouts.edit_serial' permission in public.permissions
-- 2. Grants 'checkouts.edit_serial' to SUPER, ADMIN, SUPERVISOR roles
-- 3. Provides atomic RPC public.update_checkout_item_serial with permission gate,
--    row locks, duplicate active serial guard, append-only audit logging,
--    and CAIM-synced state protection.
-- =============================================================================

BEGIN;

-- 1. Register 'checkouts.edit_serial' Permission in Master Catalog
INSERT INTO public.permissions (code, name, description, resource, action, category)
VALUES (
  'checkouts.edit_serial',
  'แก้ไขหมายเลขซีเรียล',
  'อนุญาตให้ระบุหรือแก้ไขหมายเลขซีเรียล (Serial Number) ของอุปกรณ์ในรายการยืมและรับคืน',
  'checkouts',
  'edit_serial',
  'Checkouts & Returns'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

-- 2. Assign 'checkouts.edit_serial' to SUPER, ADMIN, and SUPERVISOR by default
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('SUPER', 'ADMIN', 'SUPERVISOR')
  AND p.code = 'checkouts.edit_serial'
ON CONFLICT DO NOTHING;

-- 3. Atomic RPC: public.update_checkout_item_serial
CREATE OR REPLACE FUNCTION public.update_checkout_item_serial(
  p_checkout_item_id UUID,
  p_new_serial_number TEXT,
  p_reason TEXT,
  p_return_log_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_actor_role TEXT;
  v_new_serial TEXT;
  v_ci RECORD;
  v_log RECORD;
  v_old_serial TEXT;
  v_conflict_order TEXT;
  v_ip TEXT;
  v_ua TEXT;
BEGIN
  -- 3.1 Authentication Check
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.' USING ERRCODE = '42501';
  END IF;

  -- 3.2 Authorization Check (checkouts.edit_serial OR SUPER role)
  IF NOT (public.has_permission(v_caller_id, 'checkouts.edit_serial') OR public.is_super_admin(v_caller_id)) THEN
    RAISE EXCEPTION 'Access denied: Requires checkouts.edit_serial permission.' USING ERRCODE = '42501';
  END IF;

  -- 3.3 Validate Reason (mandatory, 2-2000 characters)
  IF p_reason IS NULL OR LENGTH(BTRIM(p_reason)) < 2 THEN
    RAISE EXCEPTION 'Validation error: A valid reason (min 2 characters) is required.' USING ERRCODE = '22023';
  END IF;
  IF LENGTH(p_reason) > 2000 THEN
    RAISE EXCEPTION 'Validation error: Reason cannot exceed 2000 characters.' USING ERRCODE = '22023';
  END IF;

  -- 3.4 Validate Serial Number (non-empty after trim, uppercase, max 100 characters)
  v_new_serial := UPPER(BTRIM(COALESCE(p_new_serial_number, '')));
  IF v_new_serial = '' THEN
    RAISE EXCEPTION 'Validation error: Serial number cannot be empty.' USING ERRCODE = '22023';
  END IF;
  IF LENGTH(v_new_serial) > 100 THEN
    RAISE EXCEPTION 'Validation error: Serial number cannot exceed 100 characters.' USING ERRCODE = '22023';
  END IF;

  -- 3.5 Lock checkout_items row FOR UPDATE
  SELECT * INTO v_ci
  FROM public.checkout_items
  WHERE id = p_checkout_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout item not found: %', p_checkout_item_id USING ERRCODE = 'P0002';
  END IF;

  v_old_serial := v_ci.serial_number;

  -- 3.6 S/N Custody Guard: check duplicate across active loaned equipment
  SELECT co.order_number INTO v_conflict_order
  FROM public.checkout_items ci
  JOIN public.checkout_orders co ON ci.checkout_order_id = co.id
  WHERE ci.id <> p_checkout_item_id
    AND UPPER(BTRIM(ci.serial_number)) = v_new_serial
    AND co.status IN ('active', 'approved', 'overdue', 'partial_returned')
    AND (
      COALESCE(ci.quantity_borrowed, 0) - (
        COALESCE(ci.quantity_returned, 0) +
        COALESCE(ci.quantity_consumed, 0) +
        COALESCE(ci.quantity_damaged, 0) +
        COALESCE(ci.quantity_lost, 0)
      )
    ) > 0
  LIMIT 1;

  IF v_conflict_order IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_ACTIVE_SERIAL: Serial number % is currently loaned out in active order %', v_new_serial, v_conflict_order USING ERRCODE = '23505';
  END IF;

  -- 3.7 If return log is provided, lock and validate CAIM sync state
  IF p_return_log_id IS NOT NULL THEN
    SELECT * INTO v_log
    FROM public.checkout_return_logs
    WHERE id = p_return_log_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Return log not found: %', p_return_log_id USING ERRCODE = 'P0002';
    END IF;

    -- Guard: If already synced to CAIM, require SUPER role with reason
    IF (v_log.caim_ticket_id IS NOT NULL OR v_log.caim_sync_status = 'synced') THEN
      IF NOT public.is_super_admin(v_caller_id) THEN
        RAISE EXCEPTION 'CAIM_ALREADY_SYNCED: Cannot edit serial for claim that has already been synced to CAIM (Ticket: %). Requires SUPER role.', v_log.caim_ticket_id USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Update return log's replaced_serial_number
    UPDATE public.checkout_return_logs
    SET replaced_serial_number = v_new_serial
    WHERE id = p_return_log_id;
  END IF;

  -- 3.8 Update checkout_items serial_number
  UPDATE public.checkout_items
  SET serial_number = v_new_serial
  WHERE id = p_checkout_item_id;

  -- 3.9 Resolve actor role for audit log
  SELECT COALESCE(r.code, p.role, 'STAFF') INTO v_actor_role
  FROM public.profiles p
  LEFT JOIN public.roles r ON p.role_id = r.id
  WHERE p.id = v_caller_id;

  -- Extract client request headers safely
  BEGIN
    v_ip := public.request_header('x-forwarded-for');
    v_ua := public.request_header('user-agent');
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
    v_ua := NULL;
  END;

  -- 3.10 Record in append-only audit_logs
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    action_type,
    target_table,
    target_id,
    previous_status,
    new_status,
    reason,
    details,
    ip_address,
    user_agent,
    created_at
  ) VALUES (
    v_caller_id,
    COALESCE(v_actor_role, 'USER'),
    'CHECKOUT_ITEM_SERIAL_UPDATE',
    'CHECKOUT_ITEM_SERIAL_UPDATE',
    'checkout_items',
    p_checkout_item_id,
    COALESCE(v_old_serial, 'NONE'),
    v_new_serial,
    BTRIM(p_reason),
    jsonb_build_object(
      'checkout_order_id', v_ci.checkout_order_id,
      'return_log_id', p_return_log_id,
      'previous_serial', v_old_serial,
      'new_serial', v_new_serial,
      'updated_at', NOW()
    ),
    v_ip,
    v_ua,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'checkout_item_id', p_checkout_item_id,
    'return_log_id', p_return_log_id,
    'previous_serial', v_old_serial,
    'new_serial', v_new_serial,
    'message', 'Serial number updated successfully'
  );
END;
$$;

-- 4. Permissions on RPC
REVOKE ALL ON FUNCTION public.update_checkout_item_serial(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_checkout_item_serial(UUID, TEXT, TEXT, UUID) TO authenticated, service_role;

COMMIT;
