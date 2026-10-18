-- =============================================================================
-- Migration 86: Remediate Supabase Database Security Linter Warnings
-- =============================================================================
-- Addresses 100+ WARN-level findings reported by Supabase Postgres Linter (Splinter):
--   1. anon_security_definer_function_executable (Public Can Execute SECURITY DEFINER Function)
--   2. authenticated_security_definer_function_executable (Signed-In Users Can Execute SECURITY DEFINER Function)
--   3. rls_policy_always_true (RLS Policy Always True on mutating operations)
--   4. extension_in_public (Extension installed in public schema)
--   5. search_path_mutable / insecure actor ID resolution
--
-- Forward-only, idempotent, and reversible.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: Move Extensions Out of public Schema (Step 4)
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'btree_gist' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION btree_gist SET SCHEMA extensions;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
END $$;


-- =============================================================================
-- PART 2: Revoke EXECUTE from PUBLIC and anon on SECURITY DEFINER Functions (Step 1)
-- =============================================================================
-- Dynamic loop to guarantee every overload of all targeted functions in public
-- has EXECUTE revoked from PUBLIC and anon.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        -- Admin
        'admin_create_role', 'admin_create_user', 'admin_delete_role', 'admin_delete_user',
        'admin_force_delete_item', 'admin_get_default_password_for_reset', 'admin_get_default_password_status',
        'admin_get_permissions_catalog', 'admin_get_role_permissions', 'admin_get_roles_with_stats',
        'admin_get_system_settings', 'admin_get_users', 'admin_reset_user_password',
        'admin_save_category_bom', 'admin_toggle_user_status', 'admin_update_default_password',
        'admin_update_role', 'admin_update_smtp_password', 'admin_update_system_settings',
        'admin_update_user', 'admin_save_role_permissions',
        -- Inventory / Orders
        'adjust_item_current_stock', 'approve_withdrawal_order', 'approve_inventory_request',
        'complete_inventory_request', 'complete_withdrawal_order', 'extend_checkout_due_date',
        'process_return_order', 'process_stock_in', 'reject_inventory_request', 'reject_withdrawal_order',
        'transfer_and_delete_project', 'transfer_item_warehouse', 'process_item_transfer',
        'get_site_installation_kits_availability', 'process_checkout_order', 'approve_checkout_order',
        'reject_checkout_order', 'resolve_damaged_return_item',
        -- Auth / Permissions
        'can_manage_site_bom', 'complete_force_password_change', 'get_my_permissions',
        'get_user_permissions', 'has_permission', 'is_super_admin',
        -- Internal / Triggers
        'enforce_audit_log_append_only', 'rls_auto_enable', 'set_withdrawal_item_source_project',
        'sync_profile_role_function', 'trg_check_profile_privilege_escalation',
        'notify_checkout_status', 'notify_checkout_submitted', 'notify_stock_in_received',
        'notify_withdrawal_status', 'notify_withdrawal_submitted', 'push_notifications',
        'update_checkout_return_caim_sync', 'process_caim_webhook_event',
        'admin_get_smtp_password_internal', 'admin_collect_database_file_references'
      )
  ) LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.func_signature || ' FROM PUBLIC, anon;';
  END LOOP;
END $$;


-- =============================================================================
-- PART 3: Restrict Trigger & Server-Only Functions (Step 2.1)
-- =============================================================================
-- Trigger and internal functions must NEVER be callable via PostgREST RPC.
-- Revoke from PUBLIC, anon, AND authenticated; grant strictly to service_role.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'enforce_audit_log_append_only', 'rls_auto_enable', 'set_withdrawal_item_source_project',
        'sync_profile_role_function', 'trg_check_profile_privilege_escalation',
        'notify_checkout_status', 'notify_checkout_submitted', 'notify_stock_in_received',
        'notify_withdrawal_status', 'notify_withdrawal_submitted', 'push_notifications',
        'update_checkout_return_caim_sync', 'process_caim_webhook_event',
        'admin_get_smtp_password_internal', 'admin_collect_database_file_references'
      )
  ) LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || r.func_signature || ' FROM PUBLIC, anon, authenticated;';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || r.func_signature || ' TO service_role;';
  END LOOP;
END $$;


-- =============================================================================
-- PART 4: Harden Function Definitions with Guards & Pinned search_path (Step 2.2 - 2.5)
-- =============================================================================

-- 4.1 transfer_and_delete_project: Never trust caller-supplied p_actor_id
CREATE OR REPLACE FUNCTION public.transfer_and_delete_project(
  p_source_project_ids UUID[],
  p_dest_project_id UUID DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_source_id UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.is_super_admin(v_actor) OR public.has_permission(v_actor, 'projects.delete')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires projects.delete permission or super admin.';
  END IF;

  IF p_actor_id IS NOT NULL AND p_actor_id <> v_actor THEN
    RAISE EXCEPTION 'Actor ID mismatch.';
  END IF;

  FOREACH v_source_id IN ARRAY p_source_project_ids LOOP
    IF p_dest_project_id IS NOT NULL THEN
      UPDATE public.stock_transactions SET project_id = p_dest_project_id WHERE project_id = v_source_id;
      UPDATE public.withdrawal_orders SET project_id = p_dest_project_id WHERE project_id = v_source_id;
      UPDATE public.pos_orders SET project_id = p_dest_project_id WHERE project_id = v_source_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_projects') THEN
      DELETE FROM public.user_projects WHERE project_id = v_source_id;
    END IF;
    DELETE FROM public.projects WHERE id = v_source_id;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'message', 'Project transferred and deleted.');
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_and_delete_project(UUID[], UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_and_delete_project(UUID[], UUID, UUID) TO authenticated, service_role;


-- 4.2 adjust_item_current_stock: Never fallback to p_actor_id without auth
CREATE OR REPLACE FUNCTION public.adjust_item_current_stock(
  p_item_id UUID,
  p_project_id UUID,
  p_new_quantity NUMERIC,
  p_reason TEXT,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
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
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF p_actor_id IS NOT NULL AND p_actor_id <> v_caller_id THEN
    RAISE EXCEPTION 'Actor ID mismatch.';
  END IF;

  -- Global Setting Check
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

  -- Authorization Check
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR (v_caller_role != 'admin' AND NOT public.has_permission(v_caller_id, 'items.adjust_stock')) THEN
    IF NOT (public.has_permission(v_caller_id, 'items.update') OR public.is_super_admin(v_caller_id)) THEN
      RAISE EXCEPTION 'Unauthorized: คุณไม่มีสิทธิ์ปรับยอดสต็อกคงเหลือ (ต้องการสิทธิ์ items.adjust_stock)';
    END IF;
  END IF;

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
    RAISE EXCEPTION 'ไม่พบข้อมูลโครงการ/คลังสินค้า หรือโครงการไม่ได้อยู่ในสถานะ active (ID: %)', p_project_id;
  END IF;

  v_project_display := v_project_name || COALESCE(' (' || v_project_loc || ')', '');

  SELECT balance INTO v_current_balance
  FROM public.stock_balance
  WHERE item_id = p_item_id AND project_id = p_project_id;

  v_current_balance := COALESCE(v_current_balance, 0);
  v_diff := p_new_quantity::INTEGER - v_current_balance;

  IF v_diff = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'ยอดสต็อกคงเหลือเท่าเดิม ไม่มีการเปลี่ยนแปลง',
      'item_id', p_item_id,
      'project_id', p_project_id,
      'previous_quantity', v_current_balance,
      'new_quantity', p_new_quantity,
      'difference', 0
    );
  END IF;

  v_abs_diff := ABS(v_diff);

  INSERT INTO public.stock_adjustment_logs (
    item_id, project_id, previous_quantity, new_quantity, difference, reason, created_by
  ) VALUES (
    p_item_id, p_project_id, v_current_balance, p_new_quantity::INTEGER, v_diff, TRIM(p_reason), v_caller_id
  ) RETURNING id INTO v_log_id;

  IF v_diff > 0 THEN
    INSERT INTO public.stock_in_orders (
      project_id, supplier, po_number, notes, created_by, status
    ) VALUES (
      p_project_id,
      'System Inventory Adjustment',
      'ADJ-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'),
      'ปรับยอดสต็อกเพิ่ม: ' || TRIM(p_reason),
      v_caller_id,
      'completed'
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.stock_in_items (
      order_id, item_id, quantity, notes
    ) VALUES (
      v_order_id, p_item_id, v_abs_diff, 'ปรับยอดเพิ่มจาก ' || v_current_balance || ' เป็น ' || p_new_quantity
    );
  ELSE
    INSERT INTO public.withdrawal_orders (
      project_id, requested_by, status, notes, order_number, completed_at, completed_by
    ) VALUES (
      p_project_id,
      v_caller_id,
      'completed',
      'ปรับยอดสต็อกลด: ' || TRIM(p_reason),
      'ADJ-OUT-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'),
      NOW(),
      v_caller_id
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.withdrawal_items (
      order_id, item_id, quantity, notes
    ) VALUES (
      v_order_id, p_item_id, v_abs_diff, 'ปรับยอดลดจาก ' || v_current_balance || ' เป็น ' || p_new_quantity
    );

    INSERT INTO public.stock_transactions (
      project_id, item_id, transaction_type, quantity, reference_id, reference_type, created_by, notes
    ) VALUES (
      p_project_id,
      p_item_id,
      'ADJUSTMENT_OUT',
      v_abs_diff,
      v_order_id,
      'withdrawal_order',
      v_caller_id,
      'ปรับยอดสต็อกลดลงโดยตรง: ' || TRIM(p_reason)
    );
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    v_caller_id,
    'STOCK_DIRECT_ADJUSTMENT',
    jsonb_build_object(
      'item_id', p_item_id,
      'item_name', v_item_name,
      'sku', v_item_sku,
      'project_id', p_project_id,
      'project_name', v_project_display,
      'previous_quantity', v_current_balance,
      'new_quantity', p_new_quantity,
      'difference', v_diff,
      'reason', TRIM(p_reason),
      'adjustment_log_id', v_log_id,
      'reference_order_id', v_order_id,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'ปรับปรุงยอดสต็อกคงเหลือสำเร็จ',
    'item_id', p_item_id,
    'item_name', v_item_name,
    'project_id', p_project_id,
    'previous_quantity', v_current_balance,
    'new_quantity', p_new_quantity,
    'difference', v_diff,
    'log_id', v_log_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_item_current_stock(UUID, UUID, NUMERIC, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_item_current_stock(UUID, UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;


-- 4.3 extend_checkout_due_date: Require authenticated caller & validate actor
CREATE OR REPLACE FUNCTION public.extend_checkout_due_date(
  p_order_id UUID,
  p_new_due_date DATE DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_extended_by UUID DEFAULT NULL,
  p_is_indefinite BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_order RECORD;
  v_prev_due_date DATE;
  v_new_status TEXT;
  v_log_id UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF p_extended_by IS NOT NULL AND p_extended_by <> v_caller_id THEN
    RAISE EXCEPTION 'Actor ID mismatch.';
  END IF;

  IF NOT (
    public.is_super_admin(v_caller_id)
    OR public.has_permission(v_caller_id, 'checkouts.extend')
    OR public.has_permission(v_caller_id, 'checkouts.update')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.extend permission.';
  END IF;

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

  IF p_is_indefinite THEN
    v_new_status := CASE 
      WHEN v_order.status = 'overdue' THEN 
        CASE WHEN EXISTS (
          SELECT 1 FROM public.checkout_items 
          WHERE checkout_order_id = p_order_id AND (quantity_returned > 0 OR quantity_damaged > 0 OR quantity_lost > 0)
        ) THEN 'partial_returned' ELSE 'active' END
      ELSE v_order.status 
    END;

    UPDATE public.checkout_orders
    SET 
      borrow_type = 'indefinite',
      expected_return_date = NULL,
      status = v_new_status
    WHERE id = p_order_id;

    INSERT INTO public.checkout_extension_logs (
      checkout_order_id,
      previous_due_date,
      new_due_date,
      extension_reason,
      extended_by,
      extended_at
    ) VALUES (
      p_order_id,
      v_prev_due_date,
      NULL,
      COALESCE(p_reason, 'เปลี่ยนประเภทเป็นไม่มีกำหนดคืน (Indefinite Borrow)'),
      v_caller_id,
      now()
    ) RETURNING id INTO v_log_id;

    RETURN jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'previous_due_date', v_prev_due_date,
      'new_due_date', NULL,
      'status', v_new_status,
      'borrow_type', 'indefinite',
      'log_id', v_log_id
    );
  END IF;

  IF v_order.borrow_type = 'indefinite' OR v_order.expected_return_date IS NULL THEN
    RAISE EXCEPTION 'Cannot extend return date for an indefinite borrow order.';
  END IF;

  IF p_new_due_date IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุกำหนดส่งคืนใหม่';
  END IF;

  IF p_new_due_date <= v_prev_due_date THEN
    RAISE EXCEPTION 'New return due date (%) must be later than the current due date (%).', p_new_due_date, v_prev_due_date;
  END IF;

  IF v_order.status = 'overdue' THEN
    IF p_new_due_date >= CURRENT_DATE THEN
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

  UPDATE public.checkout_orders
  SET 
    expected_return_date = p_new_due_date,
    status = v_new_status
  WHERE id = p_order_id;

  INSERT INTO public.checkout_extension_logs (
    checkout_order_id,
    previous_due_date,
    new_due_date,
    extension_reason,
    extended_by,
    extended_at
  ) VALUES (
    p_order_id,
    v_prev_due_date,
    p_new_due_date,
    p_reason,
    v_caller_id,
    now()
  ) RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'previous_due_date', v_prev_due_date,
    'new_due_date', p_new_due_date,
    'status', v_new_status,
    'borrow_type', 'standard',
    'log_id', v_log_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.extend_checkout_due_date(UUID, DATE, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extend_checkout_due_date(UUID, DATE, TEXT, UUID, BOOLEAN) TO authenticated, service_role;


-- 4.4 process_item_transfer: Validate actor ID and permissions
CREATE OR REPLACE FUNCTION public.process_item_transfer(
  p_source_project_id UUID,
  p_dest_project_id UUID,
  p_item_id UUID,
  p_quantity NUMERIC,
  p_notes TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF p_actor_id IS NOT NULL AND p_actor_id <> v_actor THEN
    RAISE EXCEPTION 'Actor ID mismatch.';
  END IF;

  IF NOT (
    public.is_super_admin(v_actor)
    OR public.has_permission(v_actor, 'items.transfer')
    OR public.has_permission(v_actor, 'inventory.manage')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires items.transfer or inventory.manage permission.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Invalid transfer quantity: %', p_quantity;
  END IF;

  INSERT INTO public.stock_transactions (
    item_id, project_id, transaction_type, quantity, notes, created_by, reference_type
  ) VALUES (
    p_item_id, p_source_project_id, 'TRANSFER', -p_quantity,
    'Transfer out to Project: ' || p_dest_project_id::text, v_actor, 'project_transfer'
  );

  INSERT INTO public.stock_transactions (
    item_id, project_id, transaction_type, quantity, notes, created_by, reference_type
  ) VALUES (
    p_item_id, p_dest_project_id, 'TRANSFER', p_quantity,
    'Transfer in from Project: ' || p_source_project_id::text, v_actor, 'project_transfer'
  );

  RETURN jsonb_build_object('success', true, 'message', 'Item transferred successfully.');
END;
$$;

REVOKE ALL ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;


-- 4.5 get_user_permissions: Disallow querying other users unless admin
CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID DEFAULT auth.uid())
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_target_user_id UUID;
  v_status TEXT;
  v_role_code TEXT;
  v_role_id UUID;
  v_email TEXT;
  v_perms JSONB;
BEGIN
  v_target_user_id := COALESCE(p_user_id, auth.uid());
  IF v_target_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Disallow querying other users' permissions unless caller is an admin
  IF auth.uid() IS NULL THEN
    IF NOT (
      COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
      OR COALESCE(current_setting('role', true), '') = 'service_role'
      OR current_user = 'service_role'
    ) THEN
      RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
    END IF;
  ELSIF v_target_user_id <> auth.uid() THEN
    IF NOT (public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND lower(role) IN ('admin', 'super_admin')
    )) THEN
      RAISE EXCEPTION 'Unauthorized: Cannot query permissions of other users.';
    END IF;
  END IF;

  SELECT p.status, 
         COALESCE(r.code, UPPER(p.role)), 
         COALESCE(p.role_id, r.id)
  INTO v_status, v_role_code, v_role_id
  FROM public.profiles p
  LEFT JOIN public.roles r ON (r.id = p.role_id OR r.code = UPPER(TRIM(p.role)))
  WHERE p.id = v_target_user_id;

  IF v_status IS NULL OR v_status != 'active' THEN
    RETURN '[]'::jsonb;
  END IF;

  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = v_target_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  IF v_role_code = 'SUPER' OR LOWER(COALESCE(v_email, '')) = 'admin@stockflow.com' THEN
    SELECT COALESCE(jsonb_agg(code ORDER BY code), '[]'::jsonb)
    INTO v_perms
    FROM public.permissions;
    RETURN v_perms;
  END IF;

  SELECT COALESCE(jsonb_agg(p.code ORDER BY p.code), '[]'::jsonb)
  INTO v_perms
  FROM public.role_permissions rp
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE rp.role_id = v_role_id;

  RETURN v_perms;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_permissions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID) TO authenticated, service_role;


-- 4.6 has_permission: Disallow checking other users unless admin
CREATE OR REPLACE FUNCTION public.has_permission(
  p_user_id UUID,
  p_perm_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_role_code TEXT;
  v_role_id UUID;
  v_email TEXT;
BEGIN
  IF p_user_id IS NULL OR p_perm_code IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Disallow querying other users' permissions unless caller is an admin
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    IF NOT (public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND lower(role) IN ('admin', 'super_admin')
    )) THEN
      RAISE EXCEPTION 'Unauthorized: Cannot check permissions of other users.';
    END IF;
  END IF;

  SELECT p.status, 
         COALESCE(r.code, UPPER(p.role)), 
         COALESCE(p.role_id, r.id)
  INTO v_status, v_role_code, v_role_id
  FROM public.profiles p
  LEFT JOIN public.roles r ON (r.id = p.role_id OR r.code = UPPER(TRIM(p.role)))
  WHERE p.id = p_user_id;

  IF v_status IS NULL OR v_status != 'active' THEN
    RETURN FALSE;
  END IF;

  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  IF v_role_code = 'SUPER' OR LOWER(COALESCE(v_email, '')) = 'admin@stockflow.com' THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 
    FROM public.role_permissions rp
    JOIN public.permissions perm ON perm.id = rp.permission_id
    WHERE rp.role_id = v_role_id AND perm.code = p_perm_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_permission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(UUID, TEXT) TO authenticated, service_role;


-- 4.7 get_user_emails: Restrict caller access and pin search_path
CREATE OR REPLACE FUNCTION public.get_user_emails(
  p_user_ids UUID[] DEFAULT NULL,
  p_roles TEXT[] DEFAULT NULL
)
RETURNS TABLE (user_id UUID, email TEXT, role TEXT, full_name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_roles TEXT[];
  v_caller_id UUID := auth.uid();
  v_is_service_role BOOLEAN := (
    COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR COALESCE(current_setting('role', true), '') = 'service_role'
    OR current_user = 'service_role'
  );
BEGIN
  IF NOT v_is_service_role AND v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT v_is_service_role THEN
    IF NOT (
      public.is_super_admin(v_caller_id)
      OR public.has_permission(v_caller_id, 'users.view')
      OR public.has_permission(v_caller_id, 'settings.view')
      OR public.has_permission(v_caller_id, 'withdrawals.create')
      OR public.has_permission(v_caller_id, 'withdrawals.approve')
      OR public.has_permission(v_caller_id, 'checkouts.create')
      OR public.has_permission(v_caller_id, 'checkouts.return')
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND lower(role) IN ('admin', 'super_admin', 'supervisor'))
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Insufficient permissions to query user emails.';
    END IF;
  END IF;

  IF p_roles IS NOT NULL THEN
    SELECT array_agg(DISTINCT LOWER(BTRIM(r)))
      INTO v_roles
    FROM unnest(p_roles) AS r
    WHERE BTRIM(r) <> '';
  END IF;

  IF p_user_ids IS NULL AND v_roles IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุรายชื่อผู้ใช้หรือบทบาทที่ต้องการค้นหาอีเมล';
  END IF;

  RETURN QUERY
  SELECT p.id,
         u.email::TEXT,
         p.role,
         p.full_name
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.status = 'active'
    AND COALESCE(u.email, '') <> ''
    AND (
      (p_user_ids IS NOT NULL AND p.id = ANY(p_user_ids))
      OR (v_roles IS NOT NULL AND LOWER(COALESCE(p.role, '')) = ANY(v_roles))
    )
  ORDER BY p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_emails(UUID[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_emails(UUID[], TEXT[]) TO authenticated, service_role;


-- 4.8 Default Password Management Functions: Pin search_path and restrict anon
CREATE OR REPLACE FUNCTION public.admin_get_default_password_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_secret_rec RECORD;
BEGIN
  IF NOT (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'settings.view')
    OR public.has_permission(auth.uid(), 'users.view')
  ) THEN
    RAISE EXCEPTION 'Permission denied to view password configuration status.';
  END IF;

  SELECT updated_at INTO v_secret_rec
  FROM public.system_secrets
  WHERE key = 'default_reset_password';

  IF FOUND THEN
    RETURN jsonb_build_object('configured', true, 'updated_at', v_secret_rec.updated_at);
  ELSE
    RETURN jsonb_build_object('configured', false, 'updated_at', NULL);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_default_password_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_default_password_status() TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.admin_update_default_password(p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'settings.update')) THEN
    RAISE EXCEPTION 'Permission denied to update default password configuration.';
  END IF;

  IF p_password IS NULL OR length(p_password) < 12 THEN
    RAISE EXCEPTION 'Invalid password: Minimum 12 characters required.';
  END IF;

  IF p_password != trim(p_password) THEN
    RAISE EXCEPTION 'Invalid password: Leading or trailing whitespace is not allowed.';
  END IF;

  INSERT INTO public.system_secrets (key, secret_value, updated_at, updated_by)
  VALUES ('default_reset_password', p_password, now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
  SET secret_value = EXCLUDED.secret_value,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'DEFAULT_PASSWORD_UPDATED',
    jsonb_build_object('timestamp', now(), 'status', 'SUCCESS')
  );

  RETURN jsonb_build_object('success', true, 'message', 'Default password updated successfully.');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_default_password(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_default_password(TEXT) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.admin_get_default_password_for_reset()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  IF NOT (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'users.reset_password')
    OR public.has_permission(auth.uid(), 'users.update')
  ) THEN
    RAISE EXCEPTION 'Permission denied to access reset password configuration.';
  END IF;

  SELECT secret_value INTO v_secret
  FROM public.system_secrets
  WHERE key = 'default_reset_password';

  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_default_password_for_reset() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_default_password_for_reset() TO authenticated, service_role;


-- 4.9 System Settings: Pin search_path = public, auth, pg_temp
CREATE OR REPLACE FUNCTION public.admin_get_system_settings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_object_agg(key, value) INTO v_result
  FROM public.system_settings;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_system_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_system_settings() TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.admin_update_system_settings(
  p_settings JSONB,
  p_category TEXT DEFAULT 'general'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_key TEXT;
  v_val JSONB;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'settings.update')) THEN
    RAISE EXCEPTION 'Access Denied: Requires settings.update permission to save configuration changes.';
  END IF;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_settings) LOOP
    INSERT INTO public.system_settings (key, value, category, updated_at, updated_by)
    VALUES (v_key, v_val, p_category, NOW(), auth.uid())
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      category = EXCLUDED.category,
      updated_at = NOW(),
      updated_by = auth.uid();
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'SYSTEM_SETTINGS_UPDATED',
    jsonb_build_object('category', p_category, 'keys', (SELECT array_agg(k) FROM jsonb_object_keys(p_settings) k), 'timestamp', NOW())
  );

  RETURN jsonb_build_object('success', true, 'message', 'Settings updated successfully.');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_system_settings(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_system_settings(JSONB, TEXT) TO authenticated, service_role;


-- =============================================================================
-- PART 5: Remediate RLS Policies with USING/WITH CHECK (true) (Step 3)
-- =============================================================================

-- 5.1 categories
DROP POLICY IF EXISTS "Allow auth mutate categories" ON public.categories;
DROP POLICY IF EXISTS "categories_auth_insert" ON public.categories;
DROP POLICY IF EXISTS "categories_auth_update" ON public.categories;
DROP POLICY IF EXISTS "categories_auth_delete" ON public.categories;

CREATE POLICY "categories_auth_insert" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'items.create')
    OR public.has_permission((SELECT auth.uid()), 'items.manage')
  );

CREATE POLICY "categories_auth_update" ON public.categories
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'items.update')
    OR public.has_permission((SELECT auth.uid()), 'items.manage')
  )
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'items.update')
    OR public.has_permission((SELECT auth.uid()), 'items.manage')
  );

CREATE POLICY "categories_auth_delete" ON public.categories
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'items.delete')
    OR public.has_permission((SELECT auth.uid()), 'items.manage')
  );


-- 5.2 projects
DROP POLICY IF EXISTS "Allow auth mutate projects" ON public.projects;
DROP POLICY IF EXISTS "projects_auth_insert" ON public.projects;
DROP POLICY IF EXISTS "projects_auth_update" ON public.projects;
DROP POLICY IF EXISTS "projects_auth_delete" ON public.projects;

CREATE POLICY "projects_auth_insert" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'projects.create')
  );

CREATE POLICY "projects_auth_update" ON public.projects
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'projects.update')
    OR created_by = (SELECT auth.uid())
  )
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'projects.update')
    OR created_by = (SELECT auth.uid())
  );

CREATE POLICY "projects_auth_delete" ON public.projects
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'projects.delete')
  );


-- 5.3 stock_in_orders
DROP POLICY IF EXISTS "Allow auth mutate stock_in_orders" ON public.stock_in_orders;
DROP POLICY IF EXISTS "stock_in_orders_auth_insert" ON public.stock_in_orders;
DROP POLICY IF EXISTS "stock_in_orders_auth_update" ON public.stock_in_orders;
DROP POLICY IF EXISTS "stock_in_orders_auth_delete" ON public.stock_in_orders;

CREATE POLICY "stock_in_orders_auth_insert" ON public.stock_in_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'stock_in.create')
    OR created_by = (SELECT auth.uid())
  );

CREATE POLICY "stock_in_orders_auth_update" ON public.stock_in_orders
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'stock_in.create')
    OR created_by = (SELECT auth.uid())
  )
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'stock_in.create')
    OR created_by = (SELECT auth.uid())
  );

CREATE POLICY "stock_in_orders_auth_delete" ON public.stock_in_orders
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'stock_in.create')
    OR created_by = (SELECT auth.uid())
  );


-- 5.4 stock_in_items
DROP POLICY IF EXISTS "Allow auth mutate stock_in_items" ON public.stock_in_items;
DROP POLICY IF EXISTS "stock_in_items_auth_insert" ON public.stock_in_items;
DROP POLICY IF EXISTS "stock_in_items_auth_update" ON public.stock_in_items;
DROP POLICY IF EXISTS "stock_in_items_auth_delete" ON public.stock_in_items;

CREATE POLICY "stock_in_items_auth_insert" ON public.stock_in_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stock_in_orders o
      WHERE o.id = stock_in_items.order_id
        AND (
          public.is_super_admin((SELECT auth.uid()))
          OR public.has_permission((SELECT auth.uid()), 'stock_in.create')
          OR o.created_by = (SELECT auth.uid())
        )
    )
  );

CREATE POLICY "stock_in_items_auth_update" ON public.stock_in_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stock_in_orders o
      WHERE o.id = stock_in_items.order_id
        AND (
          public.is_super_admin((SELECT auth.uid()))
          OR public.has_permission((SELECT auth.uid()), 'stock_in.create')
          OR o.created_by = (SELECT auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stock_in_orders o
      WHERE o.id = stock_in_items.order_id
        AND (
          public.is_super_admin((SELECT auth.uid()))
          OR public.has_permission((SELECT auth.uid()), 'stock_in.create')
          OR o.created_by = (SELECT auth.uid())
        )
    )
  );

CREATE POLICY "stock_in_items_auth_delete" ON public.stock_in_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stock_in_orders o
      WHERE o.id = stock_in_items.order_id
        AND (
          public.is_super_admin((SELECT auth.uid()))
          OR public.has_permission((SELECT auth.uid()), 'stock_in.create')
          OR o.created_by = (SELECT auth.uid())
        )
    )
  );


-- 5.5 storage_locations
DROP POLICY IF EXISTS "Allow auth mutate storage_locations" ON public.storage_locations;
DROP POLICY IF EXISTS "Allow authenticated insert storage_locations" ON public.storage_locations;
DROP POLICY IF EXISTS "storage_locations_auth_insert" ON public.storage_locations;
DROP POLICY IF EXISTS "storage_locations_auth_update" ON public.storage_locations;
DROP POLICY IF EXISTS "storage_locations_auth_delete" ON public.storage_locations;

CREATE POLICY "storage_locations_auth_insert" ON public.storage_locations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'projects.create')
    OR public.has_permission((SELECT auth.uid()), 'items.manage')
  );

CREATE POLICY "storage_locations_auth_update" ON public.storage_locations
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'projects.update')
    OR public.has_permission((SELECT auth.uid()), 'items.manage')
  )
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'projects.update')
    OR public.has_permission((SELECT auth.uid()), 'items.manage')
  );

CREATE POLICY "storage_locations_auth_delete" ON public.storage_locations
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'projects.delete')
    OR public.has_permission((SELECT auth.uid()), 'items.manage')
  );


-- 5.6 scrap_disposal_items
DROP POLICY IF EXISTS "scrap_disposal_items_auth_manage" ON public.scrap_disposal_items;
DROP POLICY IF EXISTS "scrap_disposal_items_auth_insert" ON public.scrap_disposal_items;
DROP POLICY IF EXISTS "scrap_disposal_items_auth_update" ON public.scrap_disposal_items;
DROP POLICY IF EXISTS "scrap_disposal_items_auth_delete" ON public.scrap_disposal_items;

CREATE POLICY "scrap_disposal_items_auth_insert" ON public.scrap_disposal_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'inventory.manage')
    OR public.has_permission((SELECT auth.uid()), 'checkouts.return')
  );

CREATE POLICY "scrap_disposal_items_auth_update" ON public.scrap_disposal_items
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'inventory.manage')
    OR public.has_permission((SELECT auth.uid()), 'checkouts.return')
  )
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'inventory.manage')
    OR public.has_permission((SELECT auth.uid()), 'checkouts.return')
  );

CREATE POLICY "scrap_disposal_items_auth_delete" ON public.scrap_disposal_items
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_permission((SELECT auth.uid()), 'inventory.manage')
  );


-- 5.7 checkout_extension_logs
DROP POLICY IF EXISTS "Allow authenticated users to insert checkout_extension_logs" ON public.checkout_extension_logs;
DROP POLICY IF EXISTS "checkout_extension_logs_auth_insert" ON public.checkout_extension_logs;

CREATE POLICY "checkout_extension_logs_auth_insert" ON public.checkout_extension_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    extended_by = (SELECT auth.uid())
    AND (
      public.is_super_admin((SELECT auth.uid()))
      OR public.has_permission((SELECT auth.uid()), 'checkouts.extend')
      OR EXISTS (
        SELECT 1 FROM public.checkout_orders co
        WHERE co.id = checkout_extension_logs.checkout_order_id
          AND (co.borrower_id = (SELECT auth.uid()) OR co.created_by = (SELECT auth.uid()))
      )
    )
  );

COMMIT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
