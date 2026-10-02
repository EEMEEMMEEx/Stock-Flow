-- Migration 11: System Settings & Audit Logging
-- Creates public.system_settings table, RLS policies, RPCs, and default settings.

CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id)
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 1. Read Policy: All authenticated users can view system settings if they have settings.view permission
DROP POLICY IF EXISTS "Authenticated Read Settings" ON public.system_settings;
CREATE POLICY "Authenticated Read Settings" ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Write Policy: Only users with settings.update permission can modify settings
DROP POLICY IF EXISTS "Update Settings Permission" ON public.system_settings;
CREATE POLICY "Update Settings Permission" ON public.system_settings
  FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'settings.update'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.update'));

-- Seed Baseline Settings
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
  ('smtp_config', '{"host":"","port":587,"secure":false,"user":"","sender_email":"","sender_name":"StockFlow Notification","password_set":false}', 'notifications', 'การตั้งค่าระบบส่งอีเมล SMTP'),
  ('notification_events', '{"withdrawal_submitted":{"enabled":true,"roles":["ADMIN","SUPERVISOR"]},"withdrawal_approved":{"enabled":true,"roles":["STAFF"]},"withdrawal_rejected":{"enabled":true,"roles":["STAFF"]},"withdrawal_completed":{"enabled":true,"roles":["ADMIN"]},"low_stock_alert":{"enabled":true,"roles":["ADMIN","SUPERVISOR"]}}', 'notifications', 'การตั้งค่าการแจ้งเตือนตามเหตุการณ์')
ON CONFLICT (key) DO NOTHING;

-- 3. RPC: admin_get_system_settings
CREATE OR REPLACE FUNCTION public.admin_get_system_settings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Verify permission
  IF NOT public.has_permission(auth.uid(), 'settings.view') THEN
    RAISE EXCEPTION 'Access Denied: Requires settings.view permission.';
  END IF;

  SELECT jsonb_object_agg(key, value) INTO v_result
  FROM public.system_settings;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- 4. RPC: admin_update_system_settings
CREATE OR REPLACE FUNCTION public.admin_update_system_settings(
  p_settings JSONB,
  p_category TEXT DEFAULT 'general'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
  v_val JSONB;
BEGIN
  -- Verify update permission server-side
  IF NOT public.has_permission(auth.uid(), 'settings.update') THEN
    RAISE EXCEPTION 'Access Denied: Requires settings.update permission to save configuration changes.';
  END IF;

  -- Iterate through input JSONB keys and upsert
  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_settings) LOOP
    -- Do not save plaintext SMTP passwords to normal settings key
    INSERT INTO public.system_settings (key, value, category, updated_at, updated_by)
    VALUES (v_key, v_val, p_category, NOW(), auth.uid())
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      category = EXCLUDED.category,
      updated_at = NOW(),
      updated_by = auth.uid();
  END LOOP;

  -- Audit log
  INSERT INTO public.audit_logs (actor_id, action, details)
  VALUES (
    auth.uid(),
    'SETTINGS_UPDATED',
    jsonb_build_object(
      'category', p_category,
      'keys_updated', (SELECT jsonb_agg(key) FROM jsonb_each(p_settings))
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'System settings saved successfully.');
END;
$$;
