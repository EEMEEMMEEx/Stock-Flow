-- Fixture: จำลอง schema ของ Supabase เท่าที่ migration 82 ต้องใช้\n-- ใช้กับ scripts/verify-damaged-repair-sql-sandbox.mjs (PGlite/WASM Postgres) และกับ\n-- smoke test supabase/tests/82_damaged_repair_resolution.smoke.sql — ไม่ใช่ migration ของโปรเจกต์\n-- Minimal mirror of the production schema slice touched by migration 82.
-- ใช้สำหรับ sandbox test เท่านั้น (PGlite/WASM Postgres) — ไม่ใช่ migration ของโปรเจกต์
-- Supabase มี role เหล่านี้เสมอ (migration ใช้ REVOKE/GRANT กับ anon/authenticated/service_role)
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$fn$;

CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  status text DEFAULT 'active',
  role text,
  role_id uuid
);

CREATE TABLE public.projects (id uuid PRIMARY KEY, name text, project_code text);
CREATE TABLE public.storage_locations (id uuid PRIMARY KEY, name text);
CREATE TABLE public.items (id uuid PRIMARY KEY, name text, unit text);

CREATE TABLE public.checkout_orders (
  id uuid PRIMARY KEY,
  order_number text,
  project_id uuid,
  status text,
  borrower_name text
);

CREATE TABLE public.checkout_items (
  id uuid PRIMARY KEY,
  checkout_order_id uuid,
  item_id uuid,
  serial_number text,
  quantity_borrowed numeric DEFAULT 1,
  quantity_returned numeric DEFAULT 0,
  quantity_damaged numeric DEFAULT 0,
  quantity_lost numeric DEFAULT 0,
  quantity_consumed numeric DEFAULT 0,
  status text
);

CREATE TABLE public.checkout_return_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_order_id uuid,
  checkout_item_id uuid,
  returned_quantity numeric,
  item_condition text,
  destination_project_id uuid,
  received_by uuid,
  returned_at timestamptz DEFAULT now(),
  damage_notes text,
  replaced_serial_number text,
  caim_ticket_id text,
  caim_ticket_url text,
  caim_sync_status text DEFAULT 'not_applicable',
  caim_synced_at timestamptz,
  caim_sync_error text,
  caim_repair_result text,
  caim_closed_at timestamptz,
  caim_inbound_processed_at timestamptz,
  caim_stock_in_order_id uuid,
  caim_scrap_disposal_id uuid
);

CREATE TABLE public.stock_in_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  storage_location_id uuid,
  supplier text,
  po_number text,
  notes text,
  received_date date,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.stock_in_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  item_id uuid,
  quantity integer,
  serial_number text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.stock_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  storage_location_id uuid,
  item_id uuid,
  quantity integer,
  transaction_type text,
  reference_type text,
  reference_id uuid,
  created_by uuid,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.scrap_disposal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_return_log_id uuid,
  checkout_order_id uuid,
  project_id uuid,
  item_id uuid,
  quantity integer DEFAULT 1,
  serial_number text,
  reason text,
  disposal_method text,
  caim_ticket_id text,
  caim_closed_at timestamptz,
  closed_by text,
  disposed_at timestamptz DEFAULT now(),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- นิยามเดียวกับ production (archive/46_material_checkout_and_return_system)
CREATE OR REPLACE VIEW public.stock_balance AS
SELECT
  sio.project_id,
  sii.item_id,
  i.name AS item_name,
  i.unit,
  p.name AS project_name,
  COALESCE(SUM(sii.quantity), 0) AS total_in,
  COALESCE((
    SELECT SUM(CASE
        WHEN st.transaction_type IN ('stock_out', 'checkout_out', 'transfer_out') THEN st.quantity
        WHEN st.transaction_type IN ('return_in') THEN -st.quantity
        ELSE 0 END)
    FROM public.stock_transactions st
    WHERE st.project_id = sio.project_id AND st.item_id = sii.item_id
  ), 0) AS total_out,
  COALESCE(SUM(sii.quantity), 0) - COALESCE((
    SELECT SUM(CASE
        WHEN st.transaction_type IN ('stock_out', 'checkout_out', 'transfer_out') THEN st.quantity
        WHEN st.transaction_type IN ('return_in') THEN -st.quantity
        ELSE 0 END)
    FROM public.stock_transactions st
    WHERE st.project_id = sio.project_id AND st.item_id = sii.item_id
  ), 0) AS balance
FROM public.stock_in_items sii
JOIN public.stock_in_orders sio ON sio.id = sii.order_id
JOIN public.items i ON i.id = sii.item_id
JOIN public.projects p ON p.id = sio.project_id
GROUP BY sio.project_id, sii.item_id, i.name, i.unit, p.name;

-- stubs: production ตรวจสิทธิ์ผ่าน role_permissions/auth.users — ที่นี่ตรวจเพียง "ผู้ใช้ active"
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id uuid, p_perm_code text)
RETURNS boolean LANGUAGE sql STABLE AS $fn$
  SELECT p_user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id AND p.status = 'active')
$fn$;

CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE AS $fn$
  SELECT p_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = p_user_id AND p.status = 'active' AND UPPER(COALESCE(p.role, '')) = 'SUPER'
     )
$fn$;
