-- ==============================================================================
-- BASELINE 05: System Settings, Secrets Vault, Notifications & Audit Triggers
-- ==============================================================================

-- 1. System Settings Table
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. System Secrets Table (Restricted Vault for sensitive credentials)
CREATE TABLE IF NOT EXISTS public.system_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  secret_value TEXT NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. User Notifications Table
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error', 'stock_in', 'withdrawal', 'approval')),
  link_url TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_lookup ON public.user_notifications (user_id, is_read, created_at DESC);

-- 4. Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- 5. Policies
DROP POLICY IF EXISTS "system_settings_read" ON public.system_settings;
CREATE POLICY "system_settings_read" ON public.system_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "system_settings_admin_write" ON public.system_settings;
CREATE POLICY "system_settings_admin_write" ON public.system_settings FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "system_secrets_admin_all" ON public.system_secrets;
CREATE POLICY "system_secrets_admin_all" ON public.system_secrets FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "user_notifications_self_read" ON public.user_notifications;
CREATE POLICY "user_notifications_self_read" ON public.user_notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_notifications_self_update" ON public.user_notifications;
CREATE POLICY "user_notifications_self_update" ON public.user_notifications FOR UPDATE USING (auth.uid() = user_id);

-- 6. Initial System Settings Seeds
INSERT INTO public.system_settings (key, value, description)
VALUES 
  ('allow_item_deletion', '{"enabled": true}'::jsonb, 'ควบคุมการอนุญาตให้ลบรายการวัสดุ/สินค้าในหน้า Items Master'),
  ('smtp_config', '{"host": "smtp.gmail.com", "port": 465, "secure": true, "user": "stockflow.noreply.app@gmail.com", "sender_name": "StockFlow Notification"}'::jsonb, 'การตั้งค่า SMTP Server สำหรับระบบส่งอีเมล')
ON CONFLICT (key) DO NOTHING;
