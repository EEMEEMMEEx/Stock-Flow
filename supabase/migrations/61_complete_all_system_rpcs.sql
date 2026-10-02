-- ==============================================================================
-- Migration 61: Complete Missing System RPCs & Database Functions
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

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

DROP FUNCTION IF EXISTS public.admin_get_system_settings() CASCADE;
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

DROP FUNCTION IF EXISTS public.admin_update_system_settings(JSONB, TEXT) CASCADE;
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

DROP FUNCTION IF EXISTS public.admin_get_default_password_status() CASCADE;
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

DROP FUNCTION IF EXISTS public.admin_update_default_password(TEXT) CASCADE;
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

  IF NOT (p_password ~ '[!@#$%^&*()_+-=[]{};'':"\|,.<>/?]') THEN
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

DROP FUNCTION IF EXISTS public.admin_get_default_password_for_reset() CASCADE;
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

DROP FUNCTION IF EXISTS public.admin_update_smtp_password(TEXT) CASCADE;
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

DROP FUNCTION IF EXISTS public.admin_create_role(TEXT, TEXT, TEXT, TEXT, TEXT) CASCADE;
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
-- 5. USER MANAGEMENT RPCS
-- ==============================================================================

DROP FUNCTION IF EXISTS public.admin_reset_user_password(UUID, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  p_user_id UUID,
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
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found in auth.users.';
  END IF;

  UPDATE public.profiles
  SET 
    must_change_password = TRUE,
    updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'USER_PASSWORD_RESET',
    jsonb_build_object('target_user_id', p_user_id, 'timestamp', NOW())
  );

  RETURN jsonb_build_object('success', true, 'message', 'Password reset successfully.');
END;
$$;

DROP FUNCTION IF EXISTS public.admin_toggle_user_status(UUID, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.admin_toggle_user_status(
  p_user_id UUID,
  p_new_status TEXT
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

  IF p_new_status NOT IN ('active', 'inactive', 'suspended') THEN
    RAISE EXCEPTION 'Invalid status. Allowed values: active, inactive, suspended.';
  END IF;

  UPDATE public.profiles
  SET 
    status = p_new_status,
    updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'USER_STATUS_TOGGLED',
    jsonb_build_object('target_user_id', p_user_id, 'new_status', p_new_status, 'timestamp', NOW())
  );

  RETURN jsonb_build_object('success', true, 'message', 'User status updated successfully.');
END;
$$;

DROP FUNCTION IF EXISTS public.admin_delete_user(UUID) CASCADE;
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

DROP FUNCTION IF EXISTS public.complete_force_password_change() CASCADE;
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

DROP FUNCTION IF EXISTS public.process_stock_in(JSONB) CASCADE;
CREATE OR REPLACE FUNCTION public.process_stock_in(payload JSONB)
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
  v_location_id UUID;
  v_notes TEXT;
  v_lot_number TEXT;
  v_unit_price NUMERIC;
  v_supplier_id UUID;
  v_po_number TEXT;
  v_invoice_number TEXT;
  v_delivery_note_number TEXT;
  v_received_date DATE;
  v_order_notes TEXT;
  v_model TEXT;
  v_parent_id UUID;
  v_part_number TEXT;
  v_is_parent BOOLEAN;
  v_children JSONB;
  v_child JSONB;
  v_child_id UUID;
  v_child_qty NUMERIC;
  v_child_model TEXT;
  v_child_part_number TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_user_id, 'inventory.stock_in') OR public.has_permission(v_user_id, 'inventory.manage')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires inventory.stock_in permission.';
  END IF;

  v_supplier_id := (payload->>'supplier_id')::UUID;
  v_po_number := payload->>'po_number';
  v_invoice_number := payload->>'invoice_number';
  v_delivery_note_number := payload->>'delivery_note_number';
  v_received_date := COALESCE((payload->>'received_date')::DATE, CURRENT_DATE);
  v_order_notes := payload->>'notes';
  v_location_id := (payload->>'storage_location_id')::UUID;

  INSERT INTO public.stock_in_orders (
    supplier_id, po_number, invoice_number, delivery_note_number,
    received_date, notes, created_by, storage_location_id
  ) VALUES (
    v_supplier_id, v_po_number, v_invoice_number, v_delivery_note_number,
    v_received_date, v_order_notes, v_user_id, v_location_id
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_unit_price := (v_item->>'unit_price')::NUMERIC;
    v_lot_number := v_item->>'lot_number';
    v_notes := v_item->>'notes';
    v_model := v_item->>'model';
    v_part_number := v_item->>'part_number';
    v_is_parent := COALESCE((v_item->>'is_parent')::BOOLEAN, FALSE);
    v_children := v_item->'children';

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity: % for item %', v_qty, v_item_id;
    END IF;

    -- Update item metadata if supplied
    IF v_model IS NOT NULL AND TRIM(v_model) != '' THEN
      UPDATE public.items SET model = TRIM(v_model), updated_at = NOW() WHERE id = v_item_id AND (model IS NULL OR model != TRIM(v_model));
    END IF;
    IF v_part_number IS NOT NULL AND TRIM(v_part_number) != '' THEN
      UPDATE public.items SET part_number = TRIM(v_part_number), updated_at = NOW() WHERE id = v_item_id AND (part_number IS NULL OR part_number != TRIM(v_part_number));
    END IF;

    INSERT INTO public.stock_in_items (
      order_id, item_id, quantity, unit_price, lot_number, notes
    ) VALUES (
      v_order_id, v_item_id, v_qty, v_unit_price, v_lot_number, v_notes
    );

    UPDATE public.items
    SET current_stock = COALESCE(current_stock, 0) + v_qty,
        updated_at = NOW()
    WHERE id = v_item_id;

    INSERT INTO public.stock_transactions (
      item_id, transaction_type, quantity, unit_price, storage_location_id,
      notes, created_by, reference_type, reference_id
    ) VALUES (
      v_item_id, 'IN', v_qty, v_unit_price, v_location_id,
      v_notes, v_user_id, 'stock_in_order', v_order_id
    );

    -- Process children if bundled
    IF v_children IS NOT NULL AND jsonb_array_length(v_children) > 0 THEN
      FOR v_child IN SELECT * FROM jsonb_array_elements(v_children) LOOP
        v_child_id := (v_child->>'item_id')::UUID;
        v_child_qty := (v_child->>'quantity')::NUMERIC;
        v_child_model := v_child->>'model';
        v_child_part_number := v_child->>'part_number';

        IF v_child_qty IS NOT NULL AND v_child_qty > 0 THEN
          IF v_child_model IS NOT NULL AND TRIM(v_child_model) != '' THEN
            UPDATE public.items SET model = TRIM(v_child_model), updated_at = NOW() WHERE id = v_child_id;
          END IF;
          IF v_child_part_number IS NOT NULL AND TRIM(v_child_part_number) != '' THEN
            UPDATE public.items SET part_number = TRIM(v_child_part_number), updated_at = NOW() WHERE id = v_child_id;
          END IF;

          INSERT INTO public.stock_in_items (
            order_id, item_id, quantity, unit_price, notes
          ) VALUES (
            v_order_id, v_child_id, v_child_qty, 0, 'Child component of ' || v_item_id::text
          );

          UPDATE public.items
          SET current_stock = COALESCE(current_stock, 0) + v_child_qty,
              updated_at = NOW()
          WHERE id = v_child_id;

          INSERT INTO public.stock_transactions (
            item_id, transaction_type, quantity, storage_location_id,
            notes, created_by, reference_type, reference_id
          ) VALUES (
            v_child_id, 'IN', v_child_qty, v_location_id,
            'Child component of ' || v_item_id::text, v_user_id, 'stock_in_order', v_order_id
          );
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_stock_in(JSONB) TO authenticated, service_role;

-- ==============================================================================
-- 7. WITHDRAWAL & APPROVAL RPCS
-- ==============================================================================

DROP FUNCTION IF EXISTS public.approve_inventory_request(UUID, JSONB, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_inventory_request(
  p_order_id UUID,
  p_approved_items JSONB DEFAULT NULL,
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
  v_item RECORD;
  v_approved_qty NUMERIC;
  v_app_item JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_user_id, 'inventory.approve') OR public.has_permission(v_user_id, 'inventory.manage')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires inventory.approve permission.';
  END IF;

  SELECT * INTO v_order FROM public.withdrawal_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Order is not pending approval (current status: %)', v_order.status;
  END IF;

  -- Process item quantities and deduct stock
  FOR v_item IN SELECT * FROM public.withdrawal_items WHERE order_id = p_order_id FOR UPDATE LOOP
    v_approved_qty := v_item.requested_quantity;

    IF p_approved_items IS NOT NULL THEN
      FOR v_app_item IN SELECT * FROM jsonb_array_elements(p_approved_items) LOOP
        IF (v_app_item->>'item_id')::UUID = v_item.item_id THEN
          v_approved_qty := (v_app_item->>'approved_quantity')::NUMERIC;
        END IF;
      END LOOP;
    END IF;

    UPDATE public.withdrawal_items
    SET approved_quantity = v_approved_qty
    WHERE id = v_item.id;

    IF v_approved_qty > 0 THEN
      UPDATE public.items
      SET current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_approved_qty),
          updated_at = NOW()
      WHERE id = v_item.item_id;

      INSERT INTO public.stock_transactions (
        item_id, project_id, transaction_type, quantity, storage_location_id,
        created_by, reference_type, reference_id, notes
      ) VALUES (
        v_item.item_id, v_order.project_id, 'OUT', v_approved_qty, v_order.storage_location_id,
        v_user_id, 'withdrawal_order', p_order_id, p_remarks
      );
    END IF;
  END LOOP;

  UPDATE public.withdrawal_orders
  SET status = 'approved',
      approved_by = v_user_id,
      approved_at = NOW(),
      remarks = COALESCE(p_remarks, remarks),
      updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    v_user_id,
    'WITHDRAWAL_APPROVED',
    jsonb_build_object('order_id', p_order_id, 'remarks', p_remarks, 'timestamp', NOW())
  );

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'approved');
END;
$$;

DROP FUNCTION IF EXISTS public.reject_inventory_request(UUID, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.reject_inventory_request(
  p_order_id UUID,
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

  IF NOT (public.has_permission(v_user_id, 'inventory.approve') OR public.has_permission(v_user_id, 'inventory.manage')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires inventory.approve permission.';
  END IF;

  UPDATE public.withdrawal_orders
  SET status = 'rejected',
      approved_by = v_user_id,
      approved_at = NOW(),
      remarks = COALESCE(p_remarks, remarks),
      updated_at = NOW()
  WHERE id = p_order_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not in pending status.';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    v_user_id,
    'WITHDRAWAL_REJECTED',
    jsonb_build_object('order_id', p_order_id, 'remarks', p_remarks, 'timestamp', NOW())
  );

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'rejected');
END;
$$;

DROP FUNCTION IF EXISTS public.complete_inventory_request(UUID, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.complete_inventory_request(
  p_order_id UUID,
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
  WHERE id = p_order_id AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not in approved status.';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    v_user_id,
    'WITHDRAWAL_COMPLETED',
    jsonb_build_object('order_id', p_order_id, 'remarks', p_remarks, 'timestamp', NOW())
  );

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'completed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_inventory_request(UUID, JSONB, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_inventory_request(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_inventory_request(UUID, TEXT) TO authenticated, service_role;

-- ==============================================================================
-- 8. INVENTORY ITEMS FORCE DELETE & WAREHOUSE TRANSFER
-- ==============================================================================

DROP FUNCTION IF EXISTS public.admin_force_delete_item(UUID) CASCADE;
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

DROP FUNCTION IF EXISTS public.process_item_transfer(JSONB) CASCADE;
CREATE OR REPLACE FUNCTION public.process_item_transfer(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_item_id UUID;
  v_source_location_id UUID;
  v_target_location_id UUID;
  v_quantity NUMERIC;
  v_notes TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_user_id, 'inventory.manage') OR public.has_permission(v_user_id, 'inventory.stock_in')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires inventory.manage permission.';
  END IF;

  v_item_id := (payload->>'item_id')::UUID;
  v_source_location_id := (payload->>'source_location_id')::UUID;
  v_target_location_id := (payload->>'target_location_id')::UUID;
  v_quantity := (payload->>'quantity')::NUMERIC;
  v_notes := payload->>'notes';

  IF v_quantity IS NULL OR v_quantity <= 0 THEN
    RAISE EXCEPTION 'Invalid transfer quantity: %', v_quantity;
  END IF;

  -- Transaction Out from source
  INSERT INTO public.stock_transactions (
    item_id, transaction_type, quantity, storage_location_id,
    notes, created_by, reference_type
  ) VALUES (
    v_item_id, 'TRANSFER', -v_quantity, v_source_location_id,
    'Transfer to location: ' || COALESCE(v_target_location_id::text, 'General'),
    v_user_id, 'warehouse_transfer'
  );

  -- Transaction In to target
  INSERT INTO public.stock_transactions (
    item_id, transaction_type, quantity, storage_location_id,
    notes, created_by, reference_type
  ) VALUES (
    v_item_id, 'TRANSFER', v_quantity, v_target_location_id,
    'Transfer from location: ' || COALESCE(v_source_location_id::text, 'General'),
    v_user_id, 'warehouse_transfer'
  );

  RETURN jsonb_build_object('success', true, 'message', 'Warehouse transfer recorded successfully.');
END;
$$;

DROP FUNCTION IF EXISTS public.transfer_and_delete_project(UUID, UUID, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.transfer_and_delete_project(
  p_source_project_id UUID,
  p_target_project_id UUID,
  p_reason TEXT DEFAULT NULL
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

  IF NOT (public.has_permission(v_user_id, 'projects.manage') OR public.has_permission(v_user_id, 'projects.delete')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires projects.delete permission.';
  END IF;

  -- Reassign references
  UPDATE public.stock_transactions SET project_id = p_target_project_id WHERE project_id = p_source_project_id;
  UPDATE public.withdrawal_orders SET project_id = p_target_project_id WHERE project_id = p_source_project_id;
  UPDATE public.pos_orders SET project_id = p_target_project_id WHERE project_id = p_source_project_id;
  DELETE FROM public.user_project_assignments WHERE project_id = p_source_project_id;

  DELETE FROM public.projects WHERE id = p_source_project_id;

  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    v_user_id,
    'PROJECT_TRANSFERRED_AND_DELETED',
    jsonb_build_object(
      'source_project_id', p_source_project_id,
      'target_project_id', p_target_project_id,
      'reason', p_reason,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'Project records transferred and project deleted successfully.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_force_delete_item(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_and_delete_project(UUID, UUID, TEXT) TO authenticated, service_role;

-- ==============================================================================
-- 9. POS / MATERIAL CHECKOUT & RETURN SYSTEM
-- ==============================================================================

DROP FUNCTION IF EXISTS public.process_checkout_order(JSONB) CASCADE;
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

DROP FUNCTION IF EXISTS public.process_return_order(JSONB) CASCADE;
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

  -- Check if all items are fully returned
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

DROP FUNCTION IF EXISTS public.get_site_installation_kits_availability(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.get_site_installation_kits_availability(p_project_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Aggregate BOM items and stock availability
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
