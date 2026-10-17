-- Fixture for migration 83 (SUPER revert actions).
-- Mirrors the production slice touched by 83_super_revert_actions_and_audit.sql.
-- Sandbox only (PGlite/WASM). Not a migration.
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
  role_id uuid,
  full_name text
);

CREATE TABLE public.projects (id uuid PRIMARY KEY, name text, project_code text);
CREATE TABLE public.storage_locations (id uuid PRIMARY KEY, name text);
CREATE TABLE public.items (id uuid PRIMARY KEY, name text, unit text);

CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text
);

CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  resource text NOT NULL,
  action text NOT NULL,
  category text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL,
  permission_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (role_id, permission_id)
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.withdrawal_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  storage_location_id uuid,
  status text DEFAULT 'pending',
  requested_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  reject_reason text,
  completed_by uuid,
  completed_at timestamptz,
  has_shortage boolean DEFAULT false,
  is_shortage_override boolean DEFAULT false,
  override_reason text,
  remarks text,
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancellation_reason text,
  requested_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.withdrawal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  item_id uuid,
  quantity integer DEFAULT 1,
  requested_qty integer,
  project_id uuid,
  storage_location_id uuid,
  available_at_approval integer,
  deducted_quantity integer DEFAULT 0,
  fulfilled_qty integer DEFAULT 0,
  shortage_quantity integer DEFAULT 0,
  is_shortage boolean DEFAULT false
);

CREATE TABLE public.checkout_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text,
  project_id uuid,
  status text DEFAULT 'active',
  borrower_id uuid,
  borrower_name text,
  created_by uuid,
  notes text,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  actual_returned_date timestamptz,
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancellation_reason text,
  checkout_date timestamptz DEFAULT now(),
  expected_return_date date
);

CREATE TABLE public.checkout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_order_id uuid,
  item_id uuid,
  serial_number text,
  quantity_borrowed numeric DEFAULT 1,
  quantity_returned numeric DEFAULT 0,
  quantity_damaged numeric DEFAULT 0,
  quantity_lost numeric DEFAULT 0,
  quantity_consumed numeric DEFAULT 0,
  status text DEFAULT 'borrowed'
);

CREATE TABLE public.checkout_return_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_order_id uuid,
  checkout_item_id uuid,
  returned_quantity numeric,
  item_condition text DEFAULT 'normal',
  destination_project_id uuid,
  received_by uuid,
  returned_at timestamptz DEFAULT now(),
  damage_notes text,
  repair_resolution_status text NOT NULL DEFAULT 'unresolved',
  caim_inbound_processed_at timestamptz,
  caim_stock_in_order_id uuid,
  caim_scrap_disposal_id uuid
);

CREATE TABLE public.stock_in_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  storage_location_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.stock_in_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  item_id uuid,
  quantity integer,
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

-- Production view semantics: OUT/CHECKOUT/stock_out/checkout_out/transfer_out
-- decrease the balance; RETURN/return_in subtract from total_out (increase it).
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
        WHEN st.transaction_type IN ('stock_out', 'checkout_out', 'transfer_out', 'OUT', 'CHECKOUT') THEN st.quantity
        WHEN st.transaction_type IN ('return_in', 'RETURN') THEN -st.quantity
        ELSE 0 END)
    FROM public.stock_transactions st
    WHERE st.project_id = sio.project_id AND st.item_id = sii.item_id
  ), 0) AS total_out,
  COALESCE(SUM(sii.quantity), 0) - COALESCE((
    SELECT SUM(CASE
        WHEN st.transaction_type IN ('stock_out', 'checkout_out', 'transfer_out', 'OUT', 'CHECKOUT') THEN st.quantity
        WHEN st.transaction_type IN ('return_in', 'RETURN') THEN -st.quantity
        ELSE 0 END)
    FROM public.stock_transactions st
    WHERE st.project_id = sio.project_id AND st.item_id = sii.item_id
  ), 0) AS balance
FROM public.stock_in_items sii
JOIN public.stock_in_orders sio ON sio.id = sii.order_id
JOIN public.items i ON i.id = sii.item_id
JOIN public.projects p ON p.id = sio.project_id
GROUP BY sio.project_id, sii.item_id, i.name, i.unit, p.name;

CREATE OR REPLACE FUNCTION public.has_permission(p_user_id uuid, p_perm_code text)
RETURNS boolean LANGUAGE sql STABLE AS $fn$
  SELECT p_user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id AND p.status = 'active')
     AND (
       EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id AND UPPER(COALESCE(p.role, '')) = 'SUPER')
       OR EXISTS (
         SELECT 1 FROM public.profiles p
         JOIN public.role_permissions rp ON rp.role_id = p.role_id
         JOIN public.permissions perm ON perm.id = rp.permission_id
         WHERE p.id = p_user_id AND perm.code = p_perm_code
       )
     )
$fn$;

CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE AS $fn$
  SELECT p_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = p_user_id AND p.status = 'active' AND UPPER(COALESCE(p.role, '')) = 'SUPER'
     )
$fn$;
