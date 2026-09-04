import fs from 'fs';

const migration61Sql = `-- ==============================================================================
-- Migration 61: Complete Missing System RPCs & Database Functions (Aligned Signatures)
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Drop function signatures with cascade first to prevent conflicts
DROP FUNCTION IF EXISTS public.admin_create_role(TEXT, TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.admin_get_system_settings() CASCADE;
DROP FUNCTION IF EXISTS public.admin_update_system_settings(JSONB, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.admin_get_default_password_status() CASCADE;
DROP FUNCTION IF EXISTS public.admin_update_default_password(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.admin_get_default_password_for_reset() CASCADE;
DROP FUNCTION IF EXISTS public.admin_update_smtp_password(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.admin_reset_user_password(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.admin_toggle_user_status(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.admin_delete_user(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.complete_force_password_change() CASCADE;
DROP FUNCTION IF EXISTS public.process_stock_in(UUID, TEXT, TEXT, TEXT, JSONB) CASCADE;
DROP FUNCTION IF EXISTS public.process_stock_in(JSONB) CASCADE;
DROP FUNCTION IF EXISTS public.approve_inventory_request(UUID, BOOLEAN, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.approve_inventory_request(UUID, JSONB, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.reject_inventory_request(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.complete_inventory_request(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.complete_inventory_request(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.admin_force_delete_item(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.process_item_transfer(UUID, UUID, UUID, INTEGER, TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.process_item_transfer(JSONB) CASCADE;
DROP FUNCTION IF EXISTS public.transfer_and_delete_project(UUID[], UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.transfer_and_delete_project(UUID, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.process_checkout_order(JSONB) CASCADE;
DROP FUNCTION IF EXISTS public.process_return_order(JSONB) CASCADE;
DROP FUNCTION IF EXISTS public.get_site_installation_kits_availability(UUID) CASCADE;

-- ==============================================================================
-- 1. SYSTEM SETTINGS & AUDIT LOGGING
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read Settings" ON public.system_settings;
CREATE POLICY "Authenticated Read Settings" ON public.system_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Update Settings Permission" ON public.system_settings;
CREATE POLICY "Update Settings Permission" ON public.system_settings
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'settings.update'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.update'));

INSERT INTO public.system_settings (key, value, category, description)
VALUES 
  ('app_name', '"StockFlow"', 'application', 'ชื่อของระบบแอปพลิเคชัน'),
  ('company_name', '""', 'application', 'ชื่อองค์กรหรือบริษัท'),
  ('app_subtitle', '"Inventory Management System"', 'application', 'คำอธิบายระบบส่วนย่อย'),
  ('low_stock_threshold', '10', 'inventory', 'เกณฑ์แจ้งเตือนวัสดุคงเหลือน้อย (ชิ้น)'),
  ('require_withdrawal_purpose', 'true', 'inventory', 'บังคับระบุวัตถุประสงค์ในการขอเบิก'),
  ('auto_receipt_completion', 'false', 'inventory', 'ยืนยันการรับของอัตโนมัติเมื่ออนุมัติ'),
  ('allow_inactive_project_view', 'true', 'inventory', 'อนุญาตให้ดูประวัติโครงการที่ปิดตัวลงแล้ว'),
  ('withdrawal_approval_policy', '"all_or_nothing"', 'inventory', 'นโยบายการอนุมัติแบบ All-or-Nothing'),
  ('smtp_config', '{"host":"","port":587,"secure":false,"user":"","sender_email":"","sender_name":"StockFlow Notification","password_set":false}'::jsonb, 'notifications', 'การตั้งค่าระบบส่งอีเมล SMTP'),
  ('notification_events', '{"withdrawal_submitted":{"enabled":true,"roles":["ADMIN","SUPERVISOR"]},"withdrawal_approved":{"enabled":true,"roles":["STAFF"]},"withdrawal_rejected":{"enabled":true,"roles":["STAFF"]},"withdrawal_completed":{"enabled":true,"roles":["ADMIN"]},"low_stock_alert":{"enabled":true,"roles":["ADMIN","SUPERVISOR"]}}'::jsonb, 'notifications', 'การตั้งค่าการแจ้งเตือนตามเหตุการณ์')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_get_system_settings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'settings.view') THEN
    RAISE EXCEPTION 'Access Denied: Requires settings.view permission.';
  END IF;

  SELECT jsonb_object_agg(key, value) INTO v_result
  FROM public.system_settings;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

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
  IF NOT public.has_permission(auth.uid(), 'settings.update') THEN
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
    jsonb_build_object(
      'category', p_category,
      'keys_updated', (SELECT jsonb_agg(key) FROM jsonb_each(p_settings)),
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'System settings updated successfully.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_system_settings() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_system_settings(JSONB, TEXT) TO authenticated, service_role;

-- ==============================================================================
-- 2. SYSTEM SECRETS VAULT & DEFAULT PASSWORD
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.system_secrets (
  key TEXT PRIMARY KEY,
  secret_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.system_secrets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.admin_get_default_password_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_secret_rec RECORD;
  v_result JSONB;
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'settings.view') OR public.has_permission(auth.uid(), 'users.manage')) THEN
    RAISE EXCEPTION 'Permission denied to view password configuration status.';
  END IF;

  SELECT updated_at INTO v_secret_rec
  FROM public.system_secrets
  WHERE key = 'default_reset_password';

  IF FOUND THEN
    v_result := jsonb_build_object(
      'configured', true,
      'updated_at', v_secret_rec.updated_at
    );
  ELSE
    v_result := jsonb_build_object(
      'configured', false,
      'updated_at', NULL
    );
  END IF;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_default_password(p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'settings.update') THEN
    RAISE EXCEPTION 'Permission denied to update default password configuration.';
  END IF;

  IF p_password IS NULL OR length(p_password) < 12 THEN
    RAISE EXCEPTION 'Invalid password: Minimum 12 characters required.';
  END IF;

  IF p_password != trim(p_password) THEN
    RAISE EXCEPTION 'Invalid password: Leading or trailing whitespace is not allowed.';
  END IF;

  IF NOT (p_password ~ '[A-Z]') THEN
    RAISE EXCEPTION 'Invalid password: Must contain at least one uppercase letter (A-Z).';
  END IF;

  IF NOT (p_password ~ '[a-z]') THEN
    RAISE EXCEPTION 'Invalid password: Must contain at least one lowercase letter (a-z).';
  END IF;

  IF NOT (p_password ~ '[0-9]') THEN
    RAISE EXCEPTION 'Invalid password: Must contain at least one digit (0-9).';
  END IF;

  IF NOT (p_password ~ '[!@#$%^&*()_+\-=\[\]{};'':"\\|,.<>\/?]') THEN
    RAISE EXCEPTION 'Invalid password: Must contain at least one special character.';
  END IF;

  INSERT INTO public.system_secrets (key, secret_value, updated_at, updated_by)
  VALUES ('default_reset_password', p_password, NOW(), auth.uid())
  ON CONFLICT (key) DO UPDATE
  SET secret_value = EXCLUDED.secret_value,
      updated_at = NOW(),
      updated_by = EXCLUDED.updated_by;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'DEFAULT_PASSWORD_UPDATED',
    jsonb_build_object(
      'success', true,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'configured', true,
    'updated_at', NOW()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_default_password_for_reset()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'users.manage') THEN
    RAISE EXCEPTION 'Permission denied to access reset password configuration.';
  END IF;

  SELECT secret_value INTO v_secret
  FROM public.system_secrets
  WHERE key = 'default_reset_password';

  RETURN v_secret;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_default_password_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_default_password(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_default_password_for_reset() TO authenticated, service_role;

-- ==============================================================================
-- 3. SMTP PASSWORD VAULT
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_update_smtp_password(p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'settings.update') THEN
    RAISE EXCEPTION 'Permission denied: Requires settings.update permission.';
  END IF;

  IF p_password IS NULL OR length(trim(p_password)) = 0 THEN
    DELETE FROM public.system_secrets WHERE key = 'smtp_password';
  ELSE
    INSERT INTO public.system_secrets (key, secret_value, updated_at, updated_by)
    VALUES ('smtp_password', p_password, NOW(), auth.uid())
    ON CONFLICT (key) DO UPDATE
    SET secret_value = EXCLUDED.secret_value,
        updated_at = NOW(),
        updated_by = auth.uid();
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'SMTP_PASSWORD_UPDATED',
    jsonb_build_object(
      'has_password', (p_password IS NOT NULL AND length(trim(p_password)) > 0),
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'SMTP password saved to secure vault.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_smtp_password(TEXT) TO authenticated, service_role;

-- ==============================================================================
-- 4. RBAC ROLE CREATION
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_create_role(
  p_code TEXT,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_badge_background TEXT DEFAULT 'bg-purple-100 dark:bg-purple-950',
  p_badge_text_color TEXT DEFAULT 'text-purple-700 dark:text-purple-300'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_normalized_code TEXT;
  v_new_id UUID := gen_random_uuid();
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.create') THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.create permission.';
  END IF;

  IF p_code IS NULL OR TRIM(p_code) = '' THEN
    RAISE EXCEPTION 'Invalid Input: Role code is required.';
  END IF;

  v_normalized_code := UPPER(TRIM(p_code));

  IF v_normalized_code ~ '[^A-Z0-9_]' THEN
    RAISE EXCEPTION 'Invalid Input: Role code must contain only uppercase letters, numbers, and underscores (e.g. SITE_MANAGER).';
  END IF;

  IF EXISTS (SELECT 1 FROM public.roles WHERE code = v_normalized_code) THEN
    RAISE EXCEPTION 'Duplicate Error: Role code % already exists.', v_normalized_code;
  END IF;

  INSERT INTO public.roles (
    id, code, name, description, badge_background, badge_text_color, is_system, is_active
  ) VALUES (
    v_new_id, v_normalized_code, TRIM(p_name), TRIM(p_description), p_badge_background, p_badge_text_color, FALSE, TRUE
  );

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'ROLE_CREATED',
    jsonb_build_object(
      'role_id', v_new_id,
      'code', v_normalized_code,
      'name', TRIM(p_name),
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Role created successfully.',
    'role', jsonb_build_object('id', v_new_id, 'code', v_normalized_code, 'name', TRIM(p_name))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_role(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ==============================================================================
-- 5. USER MANAGEMENT RPCS (Exact Parameter Matching)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  p_target_id UUID,
  p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'users.manage') THEN
    RAISE EXCEPTION 'Unauthorized: Requires users.manage permission.';
  END IF;

  IF p_new_password IS NULL OR length(trim(p_new_password)) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters.';
  END IF;

  UPDATE auth.users
  SET 
    encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
    updated_at = NOW()
  WHERE id = p_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found in auth.users.';
  END IF;

  UPDATE public.profiles
  SET 
    must_change_password = TRUE,
    updated_at = NOW()
  WHERE id = p_target_id;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'USER_PASSWORD_RESET',
    jsonb_build_object('target_user_id', p_target_id, 'timestamp', NOW())
  );

  RETURN jsonb_build_object('success', true, 'message', 'Password reset successfully.');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_user_status(
  p_target_id UUID,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'users.manage') THEN
    RAISE EXCEPTION 'Unauthorized: Requires users.manage permission.';
  END IF;

  IF p_status NOT IN ('active', 'inactive', 'suspended') THEN
    RAISE EXCEPTION 'Invalid status. Allowed values: active, inactive, suspended.';
  END IF;

  UPDATE public.profiles
  SET 
    status = p_status,
    updated_at = NOW()
  WHERE id = p_target_id;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'USER_STATUS_TOGGLED',
    jsonb_build_object('target_user_id', p_target_id, 'new_status', p_status, 'timestamp', NOW())
  );

  RETURN jsonb_build_object('success', true, 'message', 'User status updated successfully.');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_target_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_target_email TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT public.has_permission(v_caller_id, 'users.delete') THEN
    RAISE EXCEPTION 'Unauthorized: Requires users.delete permission.';
  END IF;

  IF v_caller_id = p_target_id THEN
    RAISE EXCEPTION 'Self-deletion is prohibited.';
  END IF;

  SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_id;

  DELETE FROM public.user_notifications WHERE user_id = p_target_id;
  DELETE FROM public.user_project_assignments WHERE user_id = p_target_id;
  DELETE FROM auth.identities WHERE user_id = p_target_id;
  DELETE FROM public.profiles WHERE id = p_target_id;
  DELETE FROM auth.users WHERE id = p_target_id;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    v_caller_id,
    'USER_DELETED',
    jsonb_build_object('target_user_id', p_target_id, 'target_email', v_target_email, 'timestamp', NOW())
  );

  RETURN jsonb_build_object('success', true, 'message', 'User deleted successfully.');
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_force_password_change()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  UPDATE public.profiles
  SET must_change_password = FALSE,
      updated_at = NOW()
  WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true, 'updated_at', NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_toggle_user_status(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_force_password_change() TO authenticated, service_role;

-- ==============================================================================
-- 6. STOCK IN RPCS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_stock_in(
  p_project_id UUID,
  p_supplier TEXT DEFAULT NULL,
  p_po_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_project RECORD;
  v_order_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_qty NUMERIC;
  v_unit_price NUMERIC;
  v_model TEXT;
  v_part_number TEXT;
  v_delivery_to TEXT;
  v_serial_number TEXT;
  v_item_notes TEXT;
  v_parent_id UUID;
  v_parent_sku TEXT;
  v_item_type TEXT;
  v_seq_no INTEGER;
  v_item_exists BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_user_id, 'stock_in.create') OR public.is_super_admin(v_user_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires stock_in.create permission.';
  END IF;

  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'Invalid project: Project ID cannot be empty.';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found: %', p_project_id;
  END IF;

  IF v_project.status != 'active' THEN
    RAISE EXCEPTION 'Invalid project: Project "%" is currently % (only active projects can receive stock).', v_project.name, v_project.status;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Invalid items: At least one item is required for stock in.';
  END IF;

  INSERT INTO public.stock_in_orders (
    project_id, supplier, po_number, notes, received_date, created_by
  ) VALUES (
    p_project_id, p_supplier, p_po_number, p_notes, CURRENT_DATE, v_user_id
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_delivery_to := v_item->>'delivery_to';
    v_serial_number := v_item->>'serial_number';
    v_part_number := v_item->>'part_number';
    v_model := v_item->>'model';
    v_item_type := UPPER(COALESCE(NULLIF(TRIM(v_item->>'item_type'), ''), 'PARENT'));
    v_parent_sku := NULLIF(TRIM(v_item->>'parent_sku'), '');
    v_seq_no := (v_item->>'seq_no')::INTEGER;
    v_item_notes := v_item->>'notes';
    v_parent_id := (v_item->>'parent_id')::UUID;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity: % for item %', v_qty, v_item_id;
    END IF;

    IF v_item_id IS NULL THEN
      IF (v_item->>'sku') IS NOT NULL AND TRIM(v_item->>'sku') != '' THEN
        SELECT id INTO v_item_id FROM public.items WHERE LOWER(sku) = LOWER(TRIM(v_item->>'sku')) LIMIT 1;
      END IF;
      IF v_item_id IS NULL AND (v_item->>'name') IS NOT NULL AND TRIM(v_item->>'name') != '' THEN
        SELECT id INTO v_item_id FROM public.items WHERE LOWER(name) = LOWER(TRIM(v_item->>'name')) LIMIT 1;
      END IF;
      IF v_item_id IS NULL THEN
        INSERT INTO public.items (name, model, sku, unit)
        VALUES (
          COALESCE(NULLIF(TRIM(v_item->>'name'), ''), COALESCE(NULLIF(TRIM(v_item->>'sku'), ''), 'วัสดุทั่วไป')),
          NULLIF(TRIM(v_item->>'model'), ''),
          NULLIF(TRIM(v_item->>'sku'), ''),
          COALESCE(NULLIF(TRIM(v_item->>'unit'), ''), 'ชิ้น')
        )
        RETURNING id INTO v_item_id;
      END IF;
    ELSE
      SELECT EXISTS (SELECT 1 FROM public.items WHERE id = v_item_id) INTO v_item_exists;
      IF NOT v_item_exists THEN
        RAISE EXCEPTION 'Item not found: %', v_item_id;
      END IF;
    END IF;

    IF v_parent_id IS NULL AND v_parent_sku IS NOT NULL THEN
      SELECT id INTO v_parent_id FROM public.items WHERE LOWER(sku) = LOWER(v_parent_sku) LIMIT 1;
    END IF;

    IF v_model IS NOT NULL AND TRIM(v_model) != '' THEN
      UPDATE public.items 
      SET model = TRIM(v_model), updated_at = NOW() 
      WHERE id = v_item_id AND (model IS NULL OR model = '' OR model = '-');
    END IF;

    INSERT INTO public.stock_in_items (
      order_id, item_id, quantity, unit_price, delivery_to, serial_number,
      part_number, model, item_type, parent_id, parent_sku, seq_no, notes
    ) VALUES (
      v_order_id, v_item_id, v_qty, v_unit_price, v_delivery_to, v_serial_number,
      v_part_number, v_model, v_item_type, v_parent_id, v_parent_sku, v_seq_no, v_item_notes
    );

    INSERT INTO public.stock_transactions (
      project_id, item_id, quantity, transaction_type, reference_type,
      reference_id, notes, created_by
    ) VALUES (
      p_project_id, v_item_id, v_qty, 'stock_in', 'stock_in_order',
      v_order_id, v_item_notes, v_user_id
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_stock_in(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- ==============================================================================
-- 7. WITHDRAWAL & APPROVAL RPCS
-- ==============================================================================

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
  v_user_id UUID;
  v_order RECORD;
  v_item RECORD;
  v_available NUMERIC;
  v_deduct NUMERIC;
  v_shortage NUMERIC;
  v_has_any_shortage BOOLEAN := FALSE;
  v_shortage_list JSONB := '[]'::jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_user_id, 'inventory.approve') OR public.has_permission(v_user_id, 'inventory.manage')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires inventory.approve permission.';
  END IF;

  SELECT * INTO v_order FROM public.withdrawal_orders WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found: %', p_request_id;
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending approval (current status: %)', v_order.status;
  END IF;

  FOR v_item IN 
    SELECT wi.*, i.name as item_name, i.sku, COALESCE(i.current_stock, 0) as stock_balance
    FROM public.withdrawal_items wi
    JOIN public.items i ON i.id = wi.item_id
    WHERE wi.order_id = p_request_id
    FOR UPDATE OF i
  LOOP
    v_available := v_item.stock_balance;

    IF v_available < v_item.requested_quantity THEN
      IF NOT p_allow_shortage THEN
        RAISE EXCEPTION 'Insufficient stock for item "%" (Available: %, Requested: %). Shortage approval not enabled.',
          v_item.item_name, v_available, v_item.requested_quantity;
      END IF;
      v_has_any_shortage := TRUE;
      v_deduct := GREATEST(0, v_available);
      v_shortage := v_item.requested_quantity - v_deduct;
      v_shortage_list := v_shortage_list || jsonb_build_object(
        'item_id', v_item.item_id,
        'item_name', v_item.item_name,
        'requested', v_item.requested_quantity,
        'available', v_available,
        'shortage', v_shortage
      );
    ELSE
      v_deduct := v_item.requested_quantity;
      v_shortage := 0;
    END IF;

    UPDATE public.withdrawal_items
    SET approved_quantity = v_deduct,
        available_at_approval = v_available,
        deducted_quantity = v_deduct,
        shortage_quantity = v_shortage
    WHERE id = v_item.id;

    IF v_deduct > 0 THEN
      UPDATE public.items
      SET current_stock = GREATEST(0, current_stock - v_deduct),
          updated_at = NOW()
      WHERE id = v_item.item_id;

      INSERT INTO public.stock_transactions (
        item_id, project_id, transaction_type, quantity, storage_location_id,
        created_by, reference_type, reference_id, notes
      ) VALUES (
        v_item.item_id, v_order.project_id, 'OUT', v_deduct, v_order.storage_location_id,
        v_user_id, 'withdrawal_order', p_request_id, p_override_reason
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

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    v_user_id,
    'WITHDRAWAL_APPROVED',
    jsonb_build_object('order_id', p_request_id, 'has_shortage', v_has_any_shortage, 'timestamp', NOW())
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_request_id,
    'has_shortage', v_has_any_shortage,
    'shortages', v_shortage_list
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_inventory_request(
  p_request_id UUID,
  p_reject_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_user_id, 'inventory.approve') OR public.has_permission(v_user_id, 'inventory.manage')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires inventory.approve permission.';
  END IF;

  UPDATE public.withdrawal_orders
  SET status = 'rejected',
      rejected_by = v_user_id,
      rejected_at = NOW(),
      reject_reason = p_reject_reason,
      updated_at = NOW()
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not in pending status.';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    v_user_id,
    'WITHDRAWAL_REJECTED',
    jsonb_build_object('order_id', p_request_id, 'reason', p_reject_reason, 'timestamp', NOW())
  );

  RETURN jsonb_build_object('success', true, 'request_id', p_request_id);
END;
$$;

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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  UPDATE public.withdrawal_orders
  SET status = 'completed',
      remarks = COALESCE(p_remarks, remarks),
      updated_at = NOW()
  WHERE id = p_request_id AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not in approved status.';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    v_user_id,
    'WITHDRAWAL_COMPLETED',
    jsonb_build_object('order_id', p_request_id, 'timestamp', NOW())
  );

  RETURN jsonb_build_object('success', true, 'order_id', p_request_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_inventory_request(UUID, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_inventory_request(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_inventory_request(UUID, TEXT) TO authenticated, service_role;

-- ==============================================================================
-- 8. INVENTORY ITEMS FORCE DELETE & WAREHOUSE TRANSFER
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_force_delete_item(p_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_item_name TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_user_id, 'items.delete') OR public.has_permission(v_user_id, 'items.manage')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires items.delete permission.';
  END IF;

  SELECT name INTO v_item_name FROM public.items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found: %', p_item_id;
  END IF;

  DELETE FROM public.stock_transactions WHERE item_id = p_item_id;
  DELETE FROM public.stock_in_items WHERE item_id = p_item_id;
  DELETE FROM public.withdrawal_items WHERE item_id = p_item_id;
  DELETE FROM public.pos_order_items WHERE item_id = p_item_id;
  DELETE FROM public.items WHERE id = p_item_id;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    v_user_id,
    'ITEM_FORCE_DELETED',
    jsonb_build_object('item_id', p_item_id, 'item_name', v_item_name, 'timestamp', NOW())
  );

  RETURN jsonb_build_object('success', true, 'message', 'Item and related records deleted successfully.');
END;
$$;

CREATE OR REPLACE FUNCTION public.process_item_transfer(
  p_source_project_id UUID,
  p_dest_project_id UUID,
  p_item_id UUID,
  p_quantity INTEGER,
  p_notes TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := COALESCE(p_actor_id, auth.uid());
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
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
  v_actor UUID;
  v_source_id UUID;
BEGIN
  v_actor := COALESCE(p_actor_id, auth.uid());
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  FOREACH v_source_id IN ARRAY p_source_project_ids LOOP
    IF p_dest_project_id IS NOT NULL THEN
      UPDATE public.stock_transactions SET project_id = p_dest_project_id WHERE project_id = v_source_id;
      UPDATE public.withdrawal_orders SET project_id = p_dest_project_id WHERE project_id = v_source_id;
      UPDATE public.pos_orders SET project_id = p_dest_project_id WHERE project_id = v_source_id;
    END IF;
    DELETE FROM public.user_project_assignments WHERE project_id = v_source_id;
    DELETE FROM public.projects WHERE id = v_source_id;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'message', 'Project transferred and deleted.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_force_delete_item(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, INTEGER, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_and_delete_project(UUID[], UUID, UUID) TO authenticated, service_role;

-- ==============================================================================
-- 9. POS / MATERIAL CHECKOUT & RETURN SYSTEM
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_checkout_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_order_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_qty NUMERIC;
  v_project_id UUID;
  v_location_id UUID;
  v_borrower_name TEXT;
  v_borrower_phone TEXT;
  v_due_date DATE;
  v_notes TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  v_project_id := (p_payload->>'project_id')::UUID;
  v_location_id := (p_payload->>'storage_location_id')::UUID;
  v_borrower_name := p_payload->>'borrower_name';
  v_borrower_phone := p_payload->>'borrower_phone';
  v_due_date := (p_payload->>'due_date')::DATE;
  v_notes := p_payload->>'notes';

  INSERT INTO public.pos_orders (
    project_id, storage_location_id, borrower_name, borrower_phone,
    due_date, notes, created_by, order_type, status
  ) VALUES (
    v_project_id, v_location_id, v_borrower_name, v_borrower_phone,
    v_due_date, v_notes, v_user_id, 'checkout', 'active'
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;

    INSERT INTO public.pos_order_items (
      order_id, item_id, quantity, returned_quantity
    ) VALUES (
      v_order_id, v_item_id, v_qty, 0
    );

    UPDATE public.items
    SET current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_qty),
        updated_at = NOW()
    WHERE id = v_item_id;

    INSERT INTO public.stock_transactions (
      item_id, project_id, transaction_type, quantity, storage_location_id,
      notes, created_by, reference_type, reference_id
    ) VALUES (
      v_item_id, v_project_id, 'CHECKOUT', -v_qty, v_location_id,
      'POS Checkout to ' || COALESCE(v_borrower_name, 'Staff'),
      v_user_id, 'pos_order', v_order_id
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_return_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_order_id UUID;
  v_item JSONB;
  v_order_item_id UUID;
  v_item_id UUID;
  v_qty NUMERIC;
  v_location_id UUID;
  v_all_returned BOOLEAN := TRUE;
  v_rec RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  v_order_id := (p_payload->>'order_id')::UUID;
  v_location_id := (p_payload->>'storage_location_id')::UUID;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
    v_order_item_id := (v_item->>'order_item_id')::UUID;
    v_item_id := (v_item->>'item_id')::UUID;
    v_qty := (v_item->>'return_quantity')::NUMERIC;

    IF v_qty > 0 THEN
      UPDATE public.pos_order_items
      SET returned_quantity = COALESCE(returned_quantity, 0) + v_qty
      WHERE id = v_order_item_id;

      UPDATE public.items
      SET current_stock = COALESCE(current_stock, 0) + v_qty,
          updated_at = NOW()
      WHERE id = v_item_id;

      INSERT INTO public.stock_transactions (
        item_id, transaction_type, quantity, storage_location_id,
        notes, created_by, reference_type, reference_id
      ) VALUES (
        v_item_id, 'RETURN', v_qty, v_location_id,
        'POS Return item', v_user_id, 'pos_order', v_order_id
      );
    END IF;
  END LOOP;

  FOR v_rec IN SELECT quantity, returned_quantity FROM public.pos_order_items WHERE order_id = v_order_id LOOP
    IF COALESCE(v_rec.returned_quantity, 0) < v_rec.quantity THEN
      v_all_returned := FALSE;
    END IF;
  END LOOP;

  IF v_all_returned THEN
    UPDATE public.pos_orders SET status = 'returned', updated_at = NOW() WHERE id = v_order_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'all_returned', v_all_returned);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_checkout_order(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_return_order(JSONB) TO authenticated, service_role;

-- ==============================================================================
-- 10. SITE INSTALLATION KITS REPORTING RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_site_installation_kits_availability(p_project_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'category_id', c.id,
      'category_name', c.name,
      'category_code', c.code,
      'templates_count', (SELECT COUNT(*) FROM public.site_bom_templates t WHERE t.category_id = c.id)
    )
  ) INTO v_result
  FROM public.categories c;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_site_installation_kits_availability(UUID) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
`;

// Save to a new migration 62 so supabase db push applies it cleanly!
fs.writeFileSync('supabase/migrations/62_align_all_rpc_parameter_signatures.sql', migration61Sql, 'utf8');
fs.writeFileSync('backups/04_all_system_rpcs_and_functions.sql', migration61Sql, 'utf8');
console.log('Saved 62_align_all_rpc_parameter_signatures.sql and backups/04_all_system_rpcs_and_functions.sql');
