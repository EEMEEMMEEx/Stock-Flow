/**
 * Automated Full Database Backup Engine for Stock-Flow
 * 
 * Exports the entire database including:
 * 1. Comprehensive DDL Schema (Extensions, Schemas, Tables, Constraints, Indexes, Views, RPCs, Triggers, RLS, Grants)
 * 2. Auth Schema & User Accounts (`auth.users`, `auth.identities`, user metadata, and profiles sync)
 * 3. Complete Application Data (All 24+ tables in strict dependency order)
 * 4. Master Single-File Disaster Recovery SQL Script (`03_supabase_full_disaster_recovery.sql`)
 * 5. Full JSON dataset (`data_all_tables.json`) and Manifest (`metadata.json`)
 * 
 * Run with: npm run db:backup
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Error: Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// All application tables in strict Foreign Key dependency order for clean insertion
const TABLES_IN_DEPENDENCY_ORDER = [
  'system_settings',
  'system_secrets',
  'roles',
  'permissions',
  'role_permissions',
  'profiles',
  'storage_locations',
  'projects',
  'project_locations',
  'categories',
  'items',
  'site_bom_templates',
  'stock_in_orders',
  'stock_in_items',
  'withdrawal_orders',
  'withdrawal_items',
  'checkout_orders',
  'checkout_items',
  'checkout_return_logs',
  'checkout_extension_logs',
  'email_dispatch_logs',
  'stock_transactions',
  'stock_adjustment_logs',
  'user_project_assignments',
  'notifications',
  'audit_logs',
];

/**
 * Generate Master DDL SQL string containing complete Schema, Types, Tables, Views, Functions, Triggers & RLS
 */
function getMasterSchemaDDL() {
  return `-- ==============================================================================
-- 00_full_schema_ddl.sql
-- Stock-Flow Enterprise Database Schema Definition (PostgreSQL 15 / Supabase)
-- Full DDL: Extensions, Schemas, Tables, Constraints, Indexes, Views, Functions, Triggers & RLS
-- ==============================================================================

-- 1. Required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 2. Ensure Schemas Exist
CREATE SCHEMA IF NOT EXISTS public;

-- ==============================================================================
-- 3. Core Tables Definition
-- ==============================================================================

-- 3.1 System Settings & Vault
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  category TEXT DEFAULT 'general',
  description TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.system_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  secret_value TEXT NOT NULL,
  description TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.2 Dynamic RBAC (Roles & Permissions)
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  badge_background TEXT DEFAULT 'bg-purple-100 dark:bg-purple-950',
  badge_text_color TEXT DEFAULT 'text-purple-700 dark:text-purple-300',
  is_system BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT role_permission_unique UNIQUE (role_id, permission_id)
);

-- 3.3 User Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL DEFAULT 'User',
  role TEXT NOT NULL DEFAULT 'operator',
  role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  phone TEXT,
  department TEXT,
  "position" TEXT,
  avatar_url TEXT,
  signature_url TEXT,
  all_projects BOOLEAN DEFAULT TRUE,
  must_change_password BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT profiles_role_check CHECK (role IS NOT NULL AND length(trim(role)) > 0)
);

-- 3.4 Storage Locations & Projects
CREATE TABLE IF NOT EXISTS public.storage_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  description TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_code TEXT,
  description TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'inactive')),
  owner_id UUID,
  created_by UUID,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_location_id UUID NOT NULL REFERENCES public.storage_locations(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, storage_location_id)
);

CREATE TABLE IF NOT EXISTS public.user_project_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, project_id)
);

-- 3.5 Categories & Items Master
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  unit TEXT NOT NULL DEFAULT 'ชิ้น',
  description TEXT,
  notes TEXT,
  image_url TEXT,
  model TEXT,
  item_type TEXT,
  parent_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  parent_sku TEXT,
  seq_no INTEGER,
  min_stock INTEGER DEFAULT 0,
  max_stock INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.6 Site Installation Kits BOM Templates
CREATE TABLE IF NOT EXISTS public.site_bom_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  po_seq INT DEFAULT 1,
  part_number VARCHAR(100),
  item_name VARCHAR(255) NOT NULL,
  qty_per_site NUMERIC NOT NULL DEFAULT 1,
  unit VARCHAR(50) DEFAULT 'ชิ้น',
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.7 Stock In Orders & Items
CREATE TABLE IF NOT EXISTS public.stock_in_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  supplier TEXT,
  po_number TEXT,
  notes TEXT,
  received_date DATE DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_in_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.stock_in_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) DEFAULT 0,
  delivery_to TEXT,
  serial_number TEXT,
  part_number TEXT,
  model TEXT,
  item_type TEXT,
  parent_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  parent_sku TEXT,
  seq_no INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.8 Withdrawal Orders & Line Items (POS)
CREATE TABLE IF NOT EXISTS public.withdrawal_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  purpose TEXT,
  notes TEXT,
  delivery_address TEXT,
  reject_reason TEXT,
  work_order_no TEXT,
  is_shortage_override BOOLEAN DEFAULT FALSE,
  override_reason TEXT,
  has_shortage BOOLEAN DEFAULT FALSE,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.withdrawal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.withdrawal_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  delivery_to TEXT,
  serial_number TEXT,
  part_number TEXT,
  available_at_approval INTEGER,
  deducted_quantity INTEGER,
  shortage_quantity INTEGER DEFAULT 0,
  is_shortage BOOLEAN DEFAULT FALSE,
  requested_qty INTEGER,
  fulfilled_qty INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.9 Material Checkouts, Loans & Returns
CREATE TABLE IF NOT EXISTS public.checkout_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  borrower_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  borrower_name TEXT NOT NULL,
  borrower_phone TEXT,
  borrower_department TEXT,
  checkout_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_return_date DATE,
  borrow_type TEXT NOT NULL DEFAULT 'standard' CHECK (borrow_type IN ('standard', 'indefinite')),
  actual_returned_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'partial_returned', 'completed', 'overdue', 'cancelled')),
  purpose TEXT,
  signature_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.checkout_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_order_id UUID NOT NULL REFERENCES public.checkout_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  serial_number TEXT,
  quantity_borrowed NUMERIC NOT NULL CHECK (quantity_borrowed > 0),
  quantity_returned NUMERIC NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
  quantity_damaged NUMERIC NOT NULL DEFAULT 0 CHECK (quantity_damaged >= 0),
  quantity_lost NUMERIC NOT NULL DEFAULT 0 CHECK (quantity_lost >= 0),
  condition_on_checkout TEXT DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'borrowed' CHECK (status IN ('borrowed', 'returned', 'damaged', 'lost')),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS public.checkout_return_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_order_id UUID NOT NULL REFERENCES public.checkout_orders(id) ON DELETE CASCADE,
  checkout_item_id UUID NOT NULL REFERENCES public.checkout_items(id) ON DELETE CASCADE,
  returned_quantity NUMERIC NOT NULL CHECK (returned_quantity > 0),
  item_condition TEXT NOT NULL DEFAULT 'normal' CHECK (item_condition IN ('normal', 'damaged', 'lost', 'needs_repair')),
  destination_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  received_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  returned_at TIMESTAMPTZ DEFAULT now(),
  damage_notes TEXT,
  evidence_photo_url TEXT
);

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

-- Idempotency ledger for scheduled checkout reminder emails (cron)
CREATE TABLE IF NOT EXISTS public.email_dispatch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.checkout_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  dispatched_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recipient_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_email_dispatch_daily UNIQUE (order_id, event_type, dispatched_date, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_email_dispatch_logs_lookup
  ON public.email_dispatch_logs (order_id, event_type, dispatched_date);

-- 3.10 Stock Transactions Ledger & Adjustment Logs
CREATE TABLE IF NOT EXISTS public.stock_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('IN', 'OUT', 'ADJUST', 'RETURN', 'TRANSFER', 'CHECKOUT', 'stock_in', 'stock_out', 'checkout_out', 'return_in', 'transfer_in', 'transfer_out', 'adjustment')),
  reference_type TEXT,
  reference_id UUID,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_adjustment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  previous_quantity INTEGER NOT NULL DEFAULT 0,
  new_quantity INTEGER NOT NULL DEFAULT 0,
  difference INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.11 Notifications & System Audit Logs
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_path TEXT,
  reference_id UUID,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 4. High-Performance B-Tree & Composite Indexes
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_stock_transactions_lookup ON public.stock_transactions (project_id, item_id, storage_location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_created ON public.stock_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_category_name ON public.items (category_id, name);
CREATE INDEX IF NOT EXISTS idx_items_sku ON public.items (sku);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles (role_id);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles (status);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions (role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON public.role_permissions (permission_id);
CREATE INDEX IF NOT EXISTS idx_site_bom_templates_cat ON public.site_bom_templates (category_id);
CREATE INDEX IF NOT EXISTS idx_site_bom_templates_item ON public.site_bom_templates (item_id);
CREATE INDEX IF NOT EXISTS idx_stock_in_items_order ON public.stock_in_items (order_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_items_order ON public.withdrawal_items (order_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_orders_status ON public.withdrawal_orders (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkout_orders_project ON public.checkout_orders (project_id);
CREATE INDEX IF NOT EXISTS idx_checkout_orders_status ON public.checkout_orders (status);
CREATE INDEX IF NOT EXISTS idx_checkout_orders_due ON public.checkout_orders (expected_return_date);
CREATE INDEX IF NOT EXISTS idx_checkout_orders_borrow_type ON public.checkout_orders (borrow_type);
CREATE INDEX IF NOT EXISTS idx_checkout_items_order ON public.checkout_items (checkout_order_id);
CREATE INDEX IF NOT EXISTS idx_checkout_items_item ON public.checkout_items (item_id);
CREATE INDEX IF NOT EXISTS idx_checkout_ext_order ON public.checkout_extension_logs (checkout_order_id);
CREATE INDEX IF NOT EXISTS idx_stock_adj_item ON public.stock_adjustment_logs (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_adj_project ON public.stock_adjustment_logs (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs (actor_id, created_at DESC);

-- ==============================================================================
-- 5. Views Definition
-- ==============================================================================

CREATE OR REPLACE VIEW public.stock_balance AS
SELECT 
  sio.project_id,
  sii.item_id,
  i.name AS item_name,
  i.unit,
  p.name AS project_name,
  COALESCE(SUM(sii.quantity), 0) AS total_in,
  COALESCE((
    SELECT SUM(
      CASE 
        WHEN st.transaction_type IN ('OUT', 'stock_out', 'checkout_out', 'transfer_out') THEN st.quantity
        WHEN st.transaction_type IN ('RETURN', 'return_in') THEN -st.quantity
        ELSE 0
      END
    )
    FROM public.stock_transactions st
    WHERE st.project_id = sio.project_id 
    AND st.item_id = sii.item_id 
  ), 0) AS total_out,
  COALESCE(SUM(sii.quantity), 0) - COALESCE((
    SELECT SUM(
      CASE 
        WHEN st.transaction_type IN ('OUT', 'stock_out', 'checkout_out', 'transfer_out') THEN st.quantity
        WHEN st.transaction_type IN ('RETURN', 'return_in') THEN -st.quantity
        ELSE 0
      END
    )
    FROM public.stock_transactions st
    WHERE st.project_id = sio.project_id 
    AND st.item_id = sii.item_id 
  ), 0) AS balance
FROM public.stock_in_items sii
JOIN public.stock_in_orders sio ON sio.id = sii.order_id
JOIN public.items i ON i.id = sii.item_id
JOIN public.projects p ON p.id = sio.project_id
GROUP BY sio.project_id, sii.item_id, i.name, i.unit, p.name;

-- ==============================================================================
-- 6. Stored Procedures & Atomic RPC Functions
-- ==============================================================================

-- 6.1 Profile Role Synchronization Trigger Function
CREATE OR REPLACE FUNCTION public.sync_profile_role_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_rec RECORD;
BEGIN
  IF NEW.role_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.role_id IS DISTINCT FROM OLD.role_id) THEN
    SELECT id, code INTO v_role_rec FROM public.roles WHERE id = NEW.role_id;
    IF FOUND THEN
      NEW.role := LOWER(v_role_rec.code);
    END IF;
  ELSIF NEW.role IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role OR NEW.role_id IS NULL) THEN
    SELECT id, code INTO v_role_rec FROM public.roles 
    WHERE code = UPPER(TRIM(NEW.role)) OR LOWER(TRIM(name)) = LOWER(TRIM(NEW.role))
    LIMIT 1;

    IF FOUND THEN
      NEW.role_id := v_role_rec.id;
      NEW.role := LOWER(v_role_rec.code);
    ELSE
      SELECT id, code INTO v_role_rec FROM public.roles WHERE code = 'STAFF';
      IF FOUND THEN
        NEW.role_id := v_role_rec.id;
        NEW.role := 'staff';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_role ON public.profiles;
CREATE TRIGGER trg_sync_profile_role
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_role_function();

-- 6.2 Core Permission Checkers
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_perm_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_role_code TEXT;
  v_role_id UUID;
BEGIN
  IF p_user_id IS NULL OR p_perm_code IS NULL THEN
    RETURN FALSE;
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

  IF v_role_code = 'ADMIN' THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 
    FROM public.role_permissions rp
    JOIN public.permissions perm ON perm.id = rp.permission_id
    WHERE rp.role_id = v_role_id 
      AND perm.code = p_perm_code
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (permission_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_role_code TEXT;
  v_role_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT p.status, 
         COALESCE(r.code, UPPER(p.role)), 
         COALESCE(p.role_id, r.id)
  INTO v_status, v_role_code, v_role_id
  FROM public.profiles p
  LEFT JOIN public.roles r ON (r.id = p.role_id OR r.code = UPPER(TRIM(p.role)))
  WHERE p.id = p_user_id;

  IF v_status IS NULL OR v_status != 'active' THEN
    RETURN;
  END IF;

  IF v_role_code = 'ADMIN' THEN
    RETURN QUERY SELECT code FROM public.permissions ORDER BY code;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT perm.code
  FROM public.role_permissions rp
  JOIN public.permissions perm ON perm.id = rp.permission_id
  WHERE rp.role_id = v_role_id
  ORDER BY perm.code;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE (permission_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT p.permission_code
  FROM public.get_user_permissions(auth.uid()) p;
END;
$$;

-- 6.3 Admin User Management RPCs
CREATE OR REPLACE FUNCTION public.admin_get_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  status TEXT,
  phone TEXT,
  department TEXT,
  "position" TEXT,
  avatar_url TEXT,
  must_change_password BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  assigned_project_ids UUID[],
  all_projects BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    COALESCE(u.email::TEXT, '') AS email,
    COALESCE(p.full_name, 'User') AS full_name,
    COALESCE(p.role, 'operator') AS role,
    COALESCE(p.status, 'active') AS status,
    p.phone,
    p.department,
    p."position",
    p.avatar_url,
    COALESCE(p.must_change_password, FALSE) AS must_change_password,
    p.created_at,
    p.updated_at,
    COALESCE(ARRAY_AGG(upa.project_id) FILTER (WHERE upa.project_id IS NOT NULL), ARRAY[]::UUID[]) AS assigned_project_ids,
    COALESCE(p.all_projects, p.role = 'admin', TRUE) AS all_projects
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_project_assignments upa ON upa.user_id = p.id
  GROUP BY p.id, u.email, p.full_name, p.role, p.status, p.phone, p.department, p."position", p.avatar_url, p.must_change_password, p.created_at, p.updated_at, p.all_projects
  ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT DEFAULT NULL,
  p_full_name TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'staff',
  p_phone TEXT DEFAULT NULL,
  p_position TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_all_projects BOOLEAN DEFAULT TRUE,
  p_project_ids UUID[] DEFAULT ARRAY[]::UUID[],
  p_avatar_url TEXT DEFAULT NULL,
  p_role_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_calling_user_id UUID;
  v_new_user_id UUID;
  v_effective_role_id UUID;
  v_new_role_code TEXT;
  v_is_caller_super BOOLEAN := FALSE;
  v_effective_password TEXT;
  v_encrypted_pw TEXT;
BEGIN
  -- A. Authentication & Permission Verification
  v_calling_user_id := auth.uid();
  IF v_calling_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
  END IF;

  v_is_caller_super := public.is_super_admin(v_calling_user_id);

  IF NOT (
    v_is_caller_super OR 
    public.has_permission(v_calling_user_id, 'users.create') OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = v_calling_user_id AND LOWER(role) IN ('admin', 'super_admin', 'super'))
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission denied. users.create permission required.');
  END IF;

  -- B. Input Validation
  IF p_email IS NULL OR TRIM(p_email) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Email is required.');
  END IF;

  IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Full name is required.');
  END IF;

  -- C. Resolve effective role_id and normalized code
  v_effective_role_id := p_role_id;
  IF v_effective_role_id IS NULL AND p_role IS NOT NULL THEN
    SELECT id, code INTO v_effective_role_id, v_new_role_code
    FROM public.roles
    WHERE UPPER(code) = UPPER(TRIM(p_role))
       OR (UPPER(TRIM(p_role)) IN ('STAFF', 'OPERATOR', 'REQUESTER') AND code = 'STAFF')
       OR (UPPER(TRIM(p_role)) IN ('SUPERVISOR', 'APPROVER', 'MANAGER') AND code = 'SUPERVISOR')
       OR (UPPER(TRIM(p_role)) IN ('ADMIN', 'ADMINISTRATOR') AND code = 'ADMIN')
       OR (UPPER(TRIM(p_role)) IN ('SUPER', 'SUPERADMIN') AND code = 'SUPER')
    LIMIT 1;
  ELSEIF v_effective_role_id IS NOT NULL THEN
    SELECT code INTO v_new_role_code FROM public.roles WHERE id = v_effective_role_id;
  END IF;

  IF v_new_role_code IS NULL THEN
    v_new_role_code := COALESCE(NULLIF(LOWER(TRIM(p_role)), ''), 'staff');
  END IF;

  -- Security Hierarchy Protection
  IF (UPPER(COALESCE(p_role, '')) IN ('SUPER', 'SUPERADMIN') OR v_new_role_code = 'SUPER') AND NOT v_is_caller_super THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission Denied: Only Super Admin can create Super Admin accounts.');
  END IF;

  -- D. Check for existing email
  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_email))) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Email address is already in use.');
  END IF;

  -- E. Determine Effective Password
  IF p_password IS NOT NULL AND TRIM(p_password) != '' THEN
    v_effective_password := TRIM(p_password);
  ELSE
    SELECT secret_value INTO v_effective_password
    FROM public.system_secrets
    WHERE key = 'default_reset_password';

    IF v_effective_password IS NULL OR TRIM(v_effective_password) = '' THEN
      v_effective_password := 'F0rth2026@dtrs';
    END IF;
  END IF;

  v_new_user_id := gen_random_uuid();
  v_encrypted_pw := extensions.crypt(v_effective_password, extensions.gen_salt('bf'));

  -- F. Insert into auth.users
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, reauthentication_token, email_change,
    raw_app_meta_data, raw_user_meta_data, aud, role, is_sso_user, is_anonymous, is_super_admin, created_at, updated_at
  ) VALUES (
    v_new_user_id, '00000000-0000-0000-0000-000000000000', LOWER(TRIM(p_email)), v_encrypted_pw, NOW(),
    '', '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', TRIM(p_full_name), 'role', LOWER(v_new_role_code)),
    'authenticated', 'authenticated', FALSE, FALSE, FALSE, NOW(), NOW()
  );

  -- G. Insert into auth.identities
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_new_user_id, v_new_user_id, jsonb_build_object('sub', v_new_user_id::text, 'email', LOWER(TRIM(p_email))),
    'email', v_new_user_id::text, NOW(), NOW(), NOW()
  ) ON CONFLICT (provider, provider_id) DO NOTHING;

  -- H. Create or Update Profile
  INSERT INTO public.profiles (
    id, full_name, role, role_id, status, phone, department, "position", avatar_url, all_projects, created_at, updated_at
  ) VALUES (
    v_new_user_id, TRIM(p_full_name), LOWER(TRIM(v_new_role_code)), v_effective_role_id, 'active',
    NULLIF(TRIM(p_phone), ''), NULLIF(TRIM(p_department), ''), NULLIF(TRIM(p_position), ''),
    p_avatar_url, COALESCE(p_all_projects, TRUE), NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    role_id = EXCLUDED.role_id,
    status = EXCLUDED.status,
    phone = EXCLUDED.phone,
    department = EXCLUDED.department,
    "position" = EXCLUDED."position",
    avatar_url = EXCLUDED.avatar_url,
    all_projects = EXCLUDED.all_projects,
    updated_at = NOW();

  -- I. Project Assignments
  IF NOT COALESCE(p_all_projects, TRUE) AND p_project_ids IS NOT NULL AND ARRAY_LENGTH(p_project_ids, 1) > 0 THEN
    INSERT INTO public.user_project_assignments (user_id, project_id)
    SELECT v_new_user_id, UNNEST(p_project_ids);
  END IF;

  -- J. Record Audit Log
  INSERT INTO public.audit_logs (actor_id, target_user_id, action, details)
  VALUES (
    v_calling_user_id, v_new_user_id, 'USER_CREATED',
    jsonb_build_object(
      'email', LOWER(TRIM(p_email)), 'full_name', TRIM(p_full_name),
      'role', v_new_role_code, 'role_id', v_effective_role_id,
      'all_projects', COALESCE(p_all_projects, TRUE), 'project_ids', p_project_ids,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object('success', true, 'user_id', v_new_user_id, 'message', 'User created successfully.');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 6.4 RBAC Catalog & Management RPCs
CREATE OR REPLACE FUNCTION public.admin_get_roles_with_stats()
RETURNS TABLE (
  id UUID,
  code TEXT,
  name TEXT,
  description TEXT,
  badge_background TEXT,
  badge_text_color TEXT,
  is_system BOOLEAN,
  is_active BOOLEAN,
  user_count BIGINT,
  permission_count BIGINT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.view') THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.view permission.';
  END IF;

  RETURN QUERY
  SELECT 
    r.id,
    r.code,
    r.name,
    r.description,
    r.badge_background,
    r.badge_text_color,
    r.is_system,
    r.is_active,
    COUNT(DISTINCT p.id)::BIGINT AS user_count,
    COUNT(DISTINCT rp.permission_id)::BIGINT AS permission_count,
    r.created_at,
    r.updated_at
  FROM public.roles r
  LEFT JOIN public.profiles p ON (p.role_id = r.id OR UPPER(TRIM(p.role)) = r.code)
  LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
  GROUP BY r.id, r.code, r.name, r.description, r.badge_background, r.badge_text_color, r.is_system, r.is_active, r.created_at, r.updated_at
  ORDER BY r.is_system DESC, r.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_permissions_catalog()
RETURNS TABLE (
  id UUID,
  code TEXT,
  name TEXT,
  description TEXT,
  resource TEXT,
  action TEXT,
  category TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.view') THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.view permission.';
  END IF;

  RETURN QUERY
  SELECT p.id, p.code, p.name, p.description, p.resource, p.action, p.category
  FROM public.permissions p
  ORDER BY p.category ASC, p.code ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_role_permissions(p_role_id UUID)
RETURNS TABLE (permission_id UUID, permission_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.view') THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.view permission.';
  END IF;

  RETURN QUERY
  SELECT perm.id AS permission_id, perm.code AS permission_code
  FROM public.role_permissions rp
  JOIN public.permissions perm ON perm.id = rp.permission_id
  WHERE rp.role_id = p_role_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_role_permissions(
  p_role_id UUID,
  p_permission_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_pid UUID;
  v_role_code TEXT;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.manage_permissions') THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.manage_permissions permission.';
  END IF;

  SELECT code INTO v_role_code FROM public.roles WHERE id = p_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not Found: Target role does not exist.';
  END IF;

  DELETE FROM public.role_permissions WHERE role_id = p_role_id;

  IF p_permission_ids IS NOT NULL AND ARRAY_LENGTH(p_permission_ids, 1) > 0 THEN
    FOREACH v_pid IN ARRAY p_permission_ids LOOP
      INSERT INTO public.role_permissions (role_id, permission_id)
      VALUES (p_role_id, v_pid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Role permissions updated successfully.');
END;
$$;

-- 6.5 Withdrawal Order Operations (Approve, Reject, Complete)
CREATE OR REPLACE FUNCTION public.approve_withdrawal_order(
  p_order_id UUID,
  p_approver_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := COALESCE(auth.uid(), p_approver_id);
  v_order RECORD;
  v_item RECORD;
BEGIN
  IF NOT public.has_permission(v_caller_id, 'withdrawals.approve') THEN
    RAISE EXCEPTION 'Unauthorized: Requires withdrawals.approve permission.';
  END IF;

  SELECT * INTO v_order FROM public.withdrawal_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Order is not in pending status (Current: %)', v_order.status;
  END IF;

  FOR v_item IN SELECT * FROM public.withdrawal_items WHERE order_id = p_order_id LOOP
    INSERT INTO public.stock_transactions (
      project_id, item_id, transaction_type, quantity, reference_id, reference_type, created_by, notes
    ) VALUES (
      v_order.project_id, v_item.item_id, 'OUT', -v_item.quantity, p_order_id, 'withdrawal_order', v_caller_id,
      'Withdrawal Approved: Order #' || SUBSTRING(p_order_id::TEXT, 1, 8)
    );
  END LOOP;

  UPDATE public.withdrawal_orders
  SET status = 'approved', approved_by = v_caller_id, approved_at = NOW(), updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'approved', 'message', 'Withdrawal order approved and stock deducted successfully');
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_withdrawal_order(
  p_order_id UUID,
  p_reason TEXT DEFAULT 'Rejected by approver',
  p_rejecter_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := COALESCE(auth.uid(), p_rejecter_id);
  v_order RECORD;
BEGIN
  IF NOT public.has_permission(v_caller_id, 'withdrawals.reject') THEN
    RAISE EXCEPTION 'Unauthorized: Requires withdrawals.reject permission.';
  END IF;

  SELECT * INTO v_order FROM public.withdrawal_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Order is not in pending status (Current: %)', v_order.status;
  END IF;

  UPDATE public.withdrawal_orders
  SET status = 'rejected', reject_reason = p_reason, rejected_by = v_caller_id, rejected_at = NOW(), updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'rejected', 'message', 'Withdrawal order rejected');
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_withdrawal_order(
  p_order_id UUID,
  p_completer_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := COALESCE(auth.uid(), p_completer_id);
  v_order RECORD;
BEGIN
  IF NOT public.has_permission(v_caller_id, 'withdrawals.complete') THEN
    RAISE EXCEPTION 'Unauthorized: Requires withdrawals.complete permission.';
  END IF;

  SELECT * INTO v_order FROM public.withdrawal_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF v_order.status != 'approved' THEN
    RAISE EXCEPTION 'Order must be in approved status before completion (Current: %)', v_order.status;
  END IF;

  UPDATE public.withdrawal_orders
  SET status = 'completed', completed_by = v_caller_id, completed_at = NOW(), updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'completed', 'message', 'Withdrawal receipt confirmed');
END;
$$;

-- 6.6 Material Checkout & Return RPCs
CREATE OR REPLACE FUNCTION public.process_checkout_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id UUID;
  v_borrower_name TEXT;
  v_borrower_phone TEXT;
  v_borrower_department TEXT;
  v_borrower_id UUID;
  v_borrow_type TEXT;
  v_expected_return_date DATE;
  v_purpose TEXT;
  v_notes TEXT;
  v_created_by UUID;
  v_items JSONB;
  v_order_number TEXT;
  v_order_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_qty NUMERIC;
  v_serial TEXT;
  v_condition TEXT;
BEGIN
  v_project_id := (p_payload->>'project_id')::UUID;
  v_borrower_name := TRIM(p_payload->>'borrower_name');
  v_borrower_phone := p_payload->>'borrower_phone';
  v_borrower_department := p_payload->>'borrower_department';
  v_borrow_type := COALESCE(p_payload->>'borrow_type', 'standard');
  v_purpose := p_payload->>'purpose';
  v_notes := p_payload->>'notes';
  v_created_by := NULLIF(p_payload->>'created_by', '')::UUID;
  v_items := p_payload->'items';

  IF v_borrower_name IS NULL OR v_borrower_name = '' THEN
    RAISE EXCEPTION 'กรุณาระบุชื่อผู้ยืมพัสดุ';
  END IF;

  IF v_borrow_type = 'standard' THEN
    v_expected_return_date := (p_payload->>'expected_return_date')::DATE;
    IF v_expected_return_date IS NULL THEN
      RAISE EXCEPTION 'กรุณาระบุกำหนดวันส่งคืนสำหรับการยืมแบบระบุวันส่งคืน';
    END IF;
  ELSIF v_borrow_type = 'indefinite' THEN
    v_expected_return_date := NULL;
  ELSE
    RAISE EXCEPTION 'ประเภทการยืมไม่ถูกต้อง (ต้องเป็น standard หรือ indefinite)';
  END IF;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'ต้องมีรายการวัสดุ/เครื่องมืออย่างน้อย 1 รายการ';
  END IF;

  v_order_number := 'CHK-' || to_char(now(), 'YYYYMM') || '-' || lpad(floor(random()*9000 + 1000)::text, 4, '0');

  INSERT INTO public.checkout_orders (
    order_number, project_id, borrower_id, borrower_name, borrower_phone,
    borrower_department, checkout_date, expected_return_date, borrow_type, status,
    purpose, notes, created_by
  ) VALUES (
    v_order_number, v_project_id, v_borrower_id, v_borrower_name, v_borrower_phone,
    v_borrower_department, now(), v_expected_return_date, v_borrow_type, 'active',
    v_purpose, v_notes, v_created_by
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_serial := NULLIF(v_item->>'serial_number', '');
    v_condition := COALESCE(v_item->>'condition', 'normal');

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'จำนวนที่ขอยืมต้องมากกว่า 0';
    END IF;

    INSERT INTO public.checkout_items (
      checkout_order_id, item_id, serial_number, quantity_borrowed,
      quantity_returned, condition_on_checkout, status, notes
    ) VALUES (
      v_order_id, v_item_id, v_serial, v_qty, 0, v_condition, 'borrowed', v_item->>'notes'
    );

    INSERT INTO public.stock_transactions (
      project_id, item_id, transaction_type, quantity, created_by
    ) VALUES (
      v_project_id, v_item_id, 'checkout_out', v_qty, v_created_by
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'order_number', v_order_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_return_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id UUID;
  v_received_by UUID;
  v_returns JSONB;
  v_ret JSONB;
  v_checkout_item_id UUID;
  v_return_qty NUMERIC;
  v_condition TEXT;
  v_dest_project_id UUID;
  v_damage_notes TEXT;
  v_checkout_item RECORD;
  v_order_project_id UUID;
  v_all_returned BOOLEAN := true;
  v_new_returned_total NUMERIC;
  v_new_damaged_total NUMERIC;
  v_new_lost_total NUMERIC;
BEGIN
  v_order_id := (p_payload->>'order_id')::UUID;
  v_received_by := NULLIF(p_payload->>'received_by', '')::UUID;
  v_returns := p_payload->'returns';

  SELECT project_id INTO v_order_project_id FROM public.checkout_orders WHERE id = v_order_id;
  IF v_order_project_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคำสั่งยืมพัสดุ';
  END IF;

  FOR v_ret IN SELECT * FROM jsonb_array_elements(v_returns)
  LOOP
    v_checkout_item_id := (v_ret->>'checkout_item_id')::UUID;
    v_return_qty := (v_ret->>'returned_quantity')::NUMERIC;
    v_condition := COALESCE(v_ret->>'condition', 'normal');
    v_dest_project_id := COALESCE(NULLIF(v_ret->>'destination_project_id', '')::UUID, v_order_project_id);
    v_damage_notes := v_ret->>'damage_notes';

    SELECT * INTO v_checkout_item FROM public.checkout_items WHERE id = v_checkout_item_id;
    IF v_checkout_item.id IS NULL THEN
      RAISE EXCEPTION 'ไม่พบรายการอุปกรณ์ที่ยืม ID: %', v_checkout_item_id;
    END IF;

    IF v_return_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF (v_checkout_item.quantity_returned + v_checkout_item.quantity_damaged + v_checkout_item.quantity_lost + v_return_qty) > v_checkout_item.quantity_borrowed THEN
      RAISE EXCEPTION 'จำนวนที่รับคืนรวมเกินกว่าจำนวนที่ยืมไป';
    END IF;

    INSERT INTO public.checkout_return_logs (
      checkout_order_id, checkout_item_id, returned_quantity,
      item_condition, destination_project_id, received_by, returned_at, damage_notes
    ) VALUES (
      v_order_id, v_checkout_item_id, v_return_qty, v_condition, v_dest_project_id, v_received_by, now(), v_damage_notes
    );

    IF v_condition = 'normal' THEN
      v_new_returned_total := v_checkout_item.quantity_returned + v_return_qty;
      v_new_damaged_total := v_checkout_item.quantity_damaged;
      v_new_lost_total := v_checkout_item.quantity_lost;
      
      INSERT INTO public.stock_transactions (
        project_id, item_id, transaction_type, quantity, created_by
      ) VALUES (
        v_dest_project_id, v_checkout_item.item_id, 'return_in', v_return_qty, v_received_by
      );
    ELSIF v_condition = 'damaged' OR v_condition = 'needs_repair' THEN
      v_new_returned_total := v_checkout_item.quantity_returned;
      v_new_damaged_total := v_checkout_item.quantity_damaged + v_return_qty;
      v_new_lost_total := v_checkout_item.quantity_lost;
    ELSIF v_condition = 'lost' THEN
      v_new_returned_total := v_checkout_item.quantity_returned;
      v_new_damaged_total := v_checkout_item.quantity_damaged;
      v_new_lost_total := v_checkout_item.quantity_lost + v_return_qty;
    END IF;

    UPDATE public.checkout_items SET
      quantity_returned = v_new_returned_total,
      quantity_damaged = v_new_damaged_total,
      quantity_lost = v_new_lost_total,
      status = CASE 
        WHEN (v_new_returned_total + v_new_damaged_total + v_new_lost_total) >= quantity_borrowed THEN 'returned'
        ELSE 'borrowed'
      END
    WHERE id = v_checkout_item_id;
  END LOOP;

  FOR v_checkout_item IN SELECT * FROM public.checkout_items WHERE checkout_order_id = v_order_id
  LOOP
    IF (v_checkout_item.quantity_returned + v_checkout_item.quantity_damaged + v_checkout_item.quantity_lost) < v_checkout_item.quantity_borrowed THEN
      v_all_returned := false;
    END IF;
  END LOOP;

  IF v_all_returned THEN
    UPDATE public.checkout_orders SET status = 'completed', actual_returned_date = now() WHERE id = v_order_id;
  ELSE
    UPDATE public.checkout_orders SET status = 'partial_returned' WHERE id = v_order_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'completed', v_all_returned);
END;
$$;

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
  v_effective_user_id UUID;
  v_order RECORD;
  v_prev_due_date DATE;
  v_new_status TEXT;
  v_log_id UUID;
BEGIN
  IF v_caller_id IS NOT NULL THEN
    IF NOT (public.has_permission(v_caller_id, 'checkouts.extend') OR public.has_permission(v_caller_id, 'checkouts.update')) THEN
      RAISE EXCEPTION 'Unauthorized: Requires checkouts.extend permission.';
    END IF;
    v_effective_user_id := v_caller_id;
  ELSE
    v_effective_user_id := p_extended_by;
  END IF;

  SELECT * INTO v_order FROM public.checkout_orders WHERE id = p_order_id FOR UPDATE;
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
        CASE WHEN EXISTS (SELECT 1 FROM public.checkout_items WHERE checkout_order_id = p_order_id AND (quantity_returned > 0 OR quantity_damaged > 0 OR quantity_lost > 0)) THEN 'partial_returned' ELSE 'active' END
      ELSE v_order.status 
    END;

    UPDATE public.checkout_orders SET borrow_type = 'indefinite', expected_return_date = NULL, status = v_new_status WHERE id = p_order_id;

    INSERT INTO public.checkout_extension_logs (checkout_order_id, previous_due_date, new_due_date, extension_reason, extended_by, extended_at)
    VALUES (p_order_id, v_prev_due_date, NULL, COALESCE(TRIM(p_reason), 'เปลี่ยนประเภทเป็นไม่มีกำหนดคืน (Indefinite Borrow)'), v_effective_user_id, now())
    RETURNING id INTO v_log_id;

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'order_number', v_order.order_number, 'previous_due_date', v_prev_due_date, 'new_due_date', NULL, 'new_status', v_new_status, 'borrow_type', 'indefinite', 'log_id', v_log_id);
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
      IF EXISTS (SELECT 1 FROM public.checkout_items WHERE checkout_order_id = p_order_id AND (quantity_returned > 0 OR quantity_damaged > 0 OR quantity_lost > 0)) THEN
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

  UPDATE public.checkout_orders SET expected_return_date = p_new_due_date, status = v_new_status WHERE id = p_order_id;

  INSERT INTO public.checkout_extension_logs (
    checkout_order_id, previous_due_date, new_due_date, extension_reason, extended_by, extended_at
  ) VALUES (
    p_order_id, v_prev_due_date, p_new_due_date, TRIM(p_reason), v_effective_user_id, now()
  ) RETURNING id INTO v_log_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'order_number', v_order.order_number, 'previous_due_date', v_prev_due_date, 'new_due_date', p_new_due_date, 'new_status', v_new_status, 'log_id', v_log_id);
END;
$$;

-- 6.7 Warehouse Transfer & Stock Adjustment RPCs
CREATE OR REPLACE FUNCTION public.transfer_item_warehouse(
  p_item_id UUID,
  p_source_project_id UUID,
  p_source_location_id UUID,
  p_dest_project_id UUID,
  p_dest_location_id UUID,
  p_quantity INTEGER,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_calling_user_id UUID;
  v_current_stock INTEGER;
  v_transfer_id UUID;
BEGIN
  v_calling_user_id := auth.uid();
  IF v_calling_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
  END IF;

  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Quantity must be greater than 0.');
  END IF;

  IF p_source_project_id = p_dest_project_id AND p_source_location_id = p_dest_location_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Source and destination locations cannot be identical.');
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_current_stock
  FROM public.stock_transactions
  WHERE item_id = p_item_id
    AND project_id = p_source_project_id
    AND (storage_location_id = p_source_location_id OR (storage_location_id IS NULL AND p_source_location_id IS NULL));

  IF v_current_stock < p_quantity THEN
    RETURN jsonb_build_object('success', false, 'message', format('Insufficient stock. Available: %s, Requested: %s', v_current_stock, p_quantity));
  END IF;

  v_transfer_id := gen_random_uuid();

  INSERT INTO public.stock_transactions (
    project_id, storage_location_id, item_id, quantity, transaction_type, reference_type, reference_id, created_by, notes
  ) VALUES (
    p_source_project_id, p_source_location_id, p_item_id, -p_quantity, 'TRANSFER', 'WAREHOUSE_TRANSFER_OUT', v_transfer_id, v_calling_user_id, COALESCE(p_notes, 'โอนย้ายออกไปยังคลังปลายทาง')
  );

  INSERT INTO public.stock_transactions (
    project_id, storage_location_id, item_id, quantity, transaction_type, reference_type, reference_id, created_by, notes
  ) VALUES (
    p_dest_project_id, p_dest_location_id, p_item_id, p_quantity, 'TRANSFER', 'WAREHOUSE_TRANSFER_IN', v_transfer_id, v_calling_user_id, COALESCE(p_notes, 'รับโอนย้ายเข้าจากคลังต้นทาง')
  );

  RETURN jsonb_build_object('success', true, 'transfer_id', v_transfer_id, 'message', 'โอนย้ายสินค้าข้ามคลังสำเร็จ');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_item_current_stock(
  p_item_id UUID,
  p_project_id UUID,
  p_new_quantity INTEGER,
  p_reason TEXT,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
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
  v_caller_id := COALESCE(auth.uid(), p_actor_id);

  SELECT value INTO v_setting_val FROM public.system_settings WHERE key = 'allow_direct_stock_adjustment';
  IF v_setting_val IS NOT NULL THEN
    v_allow_editing := (v_setting_val::text = 'true' OR v_setting_val = '"true"'::jsonb);
  ELSE
    v_allow_editing := false;
  END IF;

  IF NOT v_allow_editing THEN
    RAISE EXCEPTION 'ระบบถูกปิดการแก้ไขยอดสต็อกคงเหลือปัจจุบัน กรุณาเปิดใช้งานในการตั้งค่าระบบ (Settings) ก่อนทำรายการ';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR (v_caller_role != 'admin' AND NOT public.has_permission(v_caller_id, 'items.adjust_stock')) THEN
    IF NOT public.has_permission(v_caller_id, 'items.update') THEN
      RAISE EXCEPTION 'Unauthorized: คุณไม่มีสิทธิ์ปรับยอดสต็อกคงเหลือ (ต้องการสิทธิ์ items.adjust_stock)';
    END IF;
  END IF;

  IF p_item_id IS NULL THEN RAISE EXCEPTION 'กรุณาระบุรายการวัสดุ (Item ID)'; END IF;
  IF p_project_id IS NULL THEN RAISE EXCEPTION 'กรุณาระบุโครงการ/คลังสินค้า (Project ID)'; END IF;
  IF p_new_quantity IS NULL OR p_new_quantity < 0 THEN RAISE EXCEPTION 'จำนวนสต็อกใหม่ต้องเป็นตัวเลขที่ไม่ติดลบ (>= 0)'; END IF;
  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN RAISE EXCEPTION 'กรุณาระบุเหตุผลในการปรับปรุงยอดสต็อก (Reason is required)'; END IF;

  SELECT name, sku, unit INTO v_item_name, v_item_sku, v_item_unit FROM public.items WHERE id = p_item_id;
  IF v_item_name IS NULL THEN RAISE EXCEPTION 'ไม่พบข้อมูลรายการวัสดุในระบบ (ID: %)', p_item_id; END IF;

  SELECT name, location INTO v_project_name, v_project_loc FROM public.projects WHERE id = p_project_id AND status = 'active';
  IF v_project_name IS NULL THEN RAISE EXCEPTION 'ไม่พบโครงการ/คลังสินค้า หรือโครงการไม่ได้อยู่ในสถานะใช้งาน'; END IF;

  v_project_display := v_project_name || (CASE WHEN v_project_loc IS NOT NULL AND v_project_loc != '' THEN ' (' || v_project_loc || ')' ELSE '' END);

  SELECT balance INTO v_current_balance FROM public.stock_balance WHERE project_id = p_project_id AND item_id = p_item_id;
  v_current_balance := COALESCE(v_current_balance, 0);
  v_diff := p_new_quantity - v_current_balance;

  IF v_diff = 0 THEN
    RETURN jsonb_build_object('success', true, 'changed', false, 'item_name', v_item_name, 'previous_quantity', v_current_balance, 'new_quantity', p_new_quantity, 'difference', 0, 'message', 'ยอดสต็อกคงเหลือเท่าเดิม ไม่มีการปรับปรุงยอด');
  END IF;

  IF v_diff > 0 THEN
    INSERT INTO public.stock_in_orders (project_id, created_by, received_date, notes)
    VALUES (p_project_id, v_caller_id, CURRENT_DATE, 'ปรับยอดสต็อกคงเหลือ (+ ' || v_diff || ' ' || v_item_unit || ') | เหตุผล: ' || TRIM(p_reason))
    RETURNING id INTO v_order_id;

    INSERT INTO public.stock_in_items (order_id, item_id, quantity, notes)
    VALUES (v_order_id, p_item_id, v_diff, 'ปรับยอดสต็อกคงเหลือเพิ่ม | เหตุผล: ' || TRIM(p_reason));

    INSERT INTO public.stock_transactions (project_id, item_id, quantity, transaction_type, notes, created_by)
    VALUES (p_project_id, p_item_id, v_diff, 'stock_in', 'ปรับยอดสต็อกคงเหลือเพิ่ม (+ ' || v_diff || ' ' || v_item_unit || ') | เหตุผล: ' || TRIM(p_reason), v_caller_id);
  ELSE
    v_abs_diff := ABS(v_diff);
    INSERT INTO public.stock_transactions (project_id, item_id, quantity, transaction_type, notes, created_by)
    VALUES (p_project_id, p_item_id, v_abs_diff, 'stock_out', 'ปรับยอดสต็อกคงเหลือลดลง (- ' || v_abs_diff || ' ' || v_item_unit || ') | เหตุผล: ' || TRIM(p_reason), v_caller_id);
  END IF;

  INSERT INTO public.stock_adjustment_logs (item_id, project_id, previous_quantity, new_quantity, difference, reason, created_by, created_at)
  VALUES (p_item_id, p_project_id, v_current_balance, p_new_quantity, v_diff, TRIM(p_reason), v_caller_id, NOW())
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object('success', true, 'changed', true, 'log_id', v_log_id, 'item_name', v_item_name, 'sku', v_item_sku, 'unit', v_item_unit, 'project_name', v_project_display, 'previous_quantity', v_current_balance, 'new_quantity', p_new_quantity, 'difference', v_diff, 'reason', TRIM(p_reason), 'message', 'ปรับยอดสต็อกสำเร็จ');
END;
$$;

-- 6.8 Site Kit BOM RPCs
CREATE OR REPLACE FUNCTION public.admin_save_category_bom(p_category_id UUID, p_bom_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_is_admin BOOLEAN := FALSE;
  v_item JSONB;
  v_count INT := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Unauthorized: User is not authenticated'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND (LOWER(role) = 'admin' OR role_id IN (SELECT id FROM public.roles WHERE code = 'ADMIN' OR LOWER(name) = 'admin'))) INTO v_is_admin;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'Forbidden: Only administrators can modify Site Kit BOM templates'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id) THEN RAISE EXCEPTION 'Category not found with ID: %', p_category_id; END IF;

  DELETE FROM public.site_bom_templates WHERE category_id = p_category_id;

  IF p_bom_items IS NOT NULL AND jsonb_array_length(p_bom_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_bom_items) LOOP
      INSERT INTO public.site_bom_templates (
        category_id, item_id, po_seq, part_number, item_name, qty_per_site, unit, is_mandatory, notes, created_at, updated_at
      ) VALUES (
        p_category_id,
        CASE WHEN (v_item->>'item_id') IS NOT NULL AND (v_item->>'item_id') <> '' THEN (v_item->>'item_id')::UUID ELSE NULL END,
        COALESCE((v_item->>'po_seq')::INT, v_count + 1),
        NULLIF(TRIM(v_item->>'part_number'), ''),
        COALESCE(NULLIF(TRIM(v_item->>'item_name'), ''), 'Unnamed BOM Item'),
        COALESCE((v_item->>'qty_per_site')::NUMERIC, 1),
        COALESCE(NULLIF(TRIM(v_item->>'unit'), ''), 'ชิ้น'),
        COALESCE((v_item->>'is_mandatory')::BOOLEAN, TRUE),
        NULLIF(TRIM(v_item->>'notes'), ''),
        NOW(), NOW()
      );
      v_count := v_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'category_id', p_category_id, 'inserted_count', v_count, 'message', 'Category BOM updated successfully');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_site_installation_kits_availability(p_project_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_categories RECORD;
    v_category_list JSONB := '[]'::JSONB;
    v_cat_obj JSONB;
    v_items JSONB;
    v_min_sets INT;
    v_bottlenecks JSONB;
    v_bottleneck_details JSONB;
    v_bom_row RECORD;
    v_stock NUMERIC;
    v_possible INT;
BEGIN
    FOR v_categories IN 
        SELECT c.id, c.name, c.description
        FROM public.categories c
        WHERE c.id IN (
            '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba', -- MW
            '793d55c3-4750-42e1-a82e-438e7be131c8', -- BS
            '3fb47021-6c65-4a4f-bca4-595280d9ba97', -- AGW
            '823af00d-99b0-4d9a-943b-0ae29bc83ff0'  -- Fixed Radio
        )
        ORDER BY 
            CASE c.id
                WHEN '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba' THEN 1
                WHEN '793d55c3-4750-42e1-a82e-438e7be131c8' THEN 2
                WHEN '3fb47021-6c65-4a4f-bca4-595280d9ba97' THEN 3
                WHEN '823af00d-99b0-4d9a-943b-0ae29bc83ff0' THEN 4
                ELSE 5
            END
    LOOP
        v_min_sets := 999999;
        v_items := '[]'::JSONB;
        v_bottlenecks := '[]'::JSONB;
        v_bottleneck_details := '[]'::JSONB;

        FOR v_bom_row IN 
            SELECT b.*,
                   i.id AS matched_item_id,
                   i.name AS matched_item_name
            FROM public.site_bom_templates b
            LEFT JOIN LATERAL (
                SELECT id, name
                FROM public.items it
                WHERE it.category_id = v_categories.id
                  AND (
                      LOWER(it.name) LIKE '%' || LOWER(b.item_name) || '%'
                      OR LOWER(b.item_name) LIKE '%' || LOWER(it.name) || '%'
                      OR (b.part_number IS NOT NULL AND it.name LIKE '%' || b.part_number || '%')
                  )
                LIMIT 1
            ) i ON true
            WHERE b.category_id = v_categories.id
            ORDER BY b.po_seq
        LOOP
            IF v_bom_row.matched_item_id IS NOT NULL THEN
                IF p_project_id IS NOT NULL THEN
                    SELECT COALESCE(SUM(quantity), 0)
                    INTO v_stock
                    FROM public.stock_transactions
                    WHERE item_id = v_bom_row.matched_item_id
                      AND project_id = p_project_id;
                ELSE
                    SELECT COALESCE(SUM(quantity), 0)
                    INTO v_stock
                    FROM public.stock_transactions
                    WHERE item_id = v_bom_row.matched_item_id;
                END IF;
            ELSE
                v_stock := 0;
            END IF;

            v_possible := FLOOR(COALESCE(v_stock, 0) / v_bom_row.qty_per_site);
            IF v_bom_row.is_mandatory AND v_possible < v_min_sets THEN
                v_min_sets := v_possible;
            END IF;

            v_items := v_items || jsonb_build_object(
                'po_seq', v_bom_row.po_seq,
                'part_number', v_bom_row.part_number,
                'bom_name', v_bom_row.item_name,
                'db_matched_name', COALESCE(v_bom_row.matched_item_name, '(ยังไม่พบในระบบ)'),
                'qty_per_site', v_bom_row.qty_per_site,
                'unit', v_bom_row.unit,
                'total_stock', v_stock,
                'sets_possible', v_possible,
                'is_mandatory', v_bom_row.is_mandatory
            );
        END LOOP;

        IF v_min_sets = 999999 THEN v_min_sets := 0; END IF;

        SELECT 
            jsonb_agg(elem->>'bom_name'),
            jsonb_agg((elem->>'bom_name') || ' (คงเหลือ: ' || (elem->>'total_stock') || ', ใช้: ' || (elem->>'qty_per_site') || ' ' || (elem->>'unit') || '/ไซต์)')
        INTO v_bottlenecks, v_bottleneck_details
        FROM jsonb_array_elements(v_items) elem
        WHERE (elem->>'sets_possible')::INT = v_min_sets AND (elem->>'is_mandatory')::BOOLEAN = true;

        v_cat_obj := jsonb_build_object(
            'category_id', v_categories.id,
            'category_name', 
                CASE v_categories.id
                    WHEN '1d2b2e5d-f8a6-4b73-ad66-bbeb16483dba' THEN 'MW (Microwave)'
                    WHEN '793d55c3-4750-42e1-a82e-438e7be131c8' THEN 'BS (Base Station)'
                    WHEN '3fb47021-6c65-4a4f-bca4-595280d9ba97' THEN 'AGW (Analog Gateway)'
                    WHEN '823af00d-99b0-4d9a-943b-0ae29bc83ff0' THEN 'Fixed Radio (ลูกข่ายประจำที่)'
                    ELSE v_categories.name
                END,
            'complete_sets', v_min_sets,
            'bottlenecks', COALESCE(v_bottlenecks, '[]'::JSONB),
            'bottleneck_details', COALESCE(v_bottleneck_details, '[]'::JSONB),
            'total_items_in_bom', jsonb_array_length(v_items),
            'items', v_items
        );

        v_category_list := v_category_list || v_cat_obj;
    END LOOP;

    RETURN jsonb_build_object('summary_kpi', v_category_list);
END;
$$;

-- ==============================================================================
-- 7. Row Level Security (RLS) Policies & Permissions
-- ==============================================================================

-- Enable RLS across all tables
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_bom_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_in_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_in_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_return_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_extension_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_dispatch_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_project_assignments ENABLE ROW LEVEL SECURITY;

-- 7.1 Read Policies
DROP POLICY IF EXISTS "Allow select categories" ON public.categories;
CREATE POLICY "Allow select categories" ON public.categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select storage_locations" ON public.storage_locations;
CREATE POLICY "Allow select storage_locations" ON public.storage_locations FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select projects" ON public.projects;
CREATE POLICY "Allow select projects" ON public.projects FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select items" ON public.items;
CREATE POLICY "Allow select items" ON public.items FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select roles" ON public.roles;
CREATE POLICY "Allow select roles" ON public.roles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select permissions" ON public.permissions;
CREATE POLICY "Allow select permissions" ON public.permissions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select role_permissions" ON public.role_permissions;
CREATE POLICY "Allow select role_permissions" ON public.role_permissions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select profiles" ON public.profiles;
CREATE POLICY "Allow select profiles" ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select site_bom_templates" ON public.site_bom_templates;
CREATE POLICY "Allow select site_bom_templates" ON public.site_bom_templates FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select stock_in_orders" ON public.stock_in_orders;
CREATE POLICY "Allow select stock_in_orders" ON public.stock_in_orders FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select stock_in_items" ON public.stock_in_items;
CREATE POLICY "Allow select stock_in_items" ON public.stock_in_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select withdrawal_orders" ON public.withdrawal_orders;
CREATE POLICY "Allow select withdrawal_orders" ON public.withdrawal_orders FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select withdrawal_items" ON public.withdrawal_items;
CREATE POLICY "Allow select withdrawal_items" ON public.withdrawal_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select checkout_orders" ON public.checkout_orders;
CREATE POLICY "Allow select checkout_orders" ON public.checkout_orders FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select checkout_items" ON public.checkout_items;
CREATE POLICY "Allow select checkout_items" ON public.checkout_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select stock_transactions" ON public.stock_transactions;
CREATE POLICY "Allow select stock_transactions" ON public.stock_transactions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select stock_adjustment_logs" ON public.stock_adjustment_logs;
CREATE POLICY "Allow select stock_adjustment_logs" ON public.stock_adjustment_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select system_settings" ON public.system_settings;
CREATE POLICY "Allow select system_settings" ON public.system_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select notifications" ON public.notifications;
CREATE POLICY "Allow select notifications" ON public.notifications FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select user_notifications" ON public.user_notifications;
CREATE POLICY "Allow select user_notifications" ON public.user_notifications FOR SELECT USING (true);

-- 7.2 Mutation Policies (Authenticated Operations)
DROP POLICY IF EXISTS "Allow auth mutate categories" ON public.categories;
CREATE POLICY "Allow auth mutate categories" ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth mutate storage_locations" ON public.storage_locations;
CREATE POLICY "Allow auth mutate storage_locations" ON public.storage_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth mutate projects" ON public.projects;
CREATE POLICY "Allow auth mutate projects" ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth mutate items" ON public.items;
CREATE POLICY "Allow auth mutate items" ON public.items FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth mutate stock_in_orders" ON public.stock_in_orders;
CREATE POLICY "Allow auth mutate stock_in_orders" ON public.stock_in_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth mutate stock_in_items" ON public.stock_in_items;
CREATE POLICY "Allow auth mutate stock_in_items" ON public.stock_in_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth mutate withdrawal_orders" ON public.withdrawal_orders;
CREATE POLICY "Allow auth mutate withdrawal_orders" ON public.withdrawal_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth mutate withdrawal_items" ON public.withdrawal_items;
CREATE POLICY "Allow auth mutate withdrawal_items" ON public.withdrawal_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth mutate checkout_orders" ON public.checkout_orders;
CREATE POLICY "Allow auth mutate checkout_orders" ON public.checkout_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth mutate checkout_items" ON public.checkout_items;
CREATE POLICY "Allow auth mutate checkout_items" ON public.checkout_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth mutate checkout_return_logs" ON public.checkout_return_logs;
CREATE POLICY "Allow auth mutate checkout_return_logs" ON public.checkout_return_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth mutate checkout_extension_logs" ON public.checkout_extension_logs;
CREATE POLICY "Allow auth mutate checkout_extension_logs" ON public.checkout_extension_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth mutate stock_transactions" ON public.stock_transactions;
CREATE POLICY "Allow auth mutate stock_transactions" ON public.stock_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7.3 Function Grants
GRANT EXECUTE ON FUNCTION public.has_permission(UUID, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[], TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_roles_with_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_permissions_catalog() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_role_permissions(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_role_permissions(UUID, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_withdrawal_order(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_withdrawal_order(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_withdrawal_order(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_checkout_order(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_return_order(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.extend_checkout_due_date(UUID, DATE, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_item_warehouse(UUID, UUID, UUID, UUID, UUID, INTEGER, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_item_current_stock(UUID, UUID, INTEGER, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_category_bom(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_site_installation_kits_availability(UUID) TO authenticated, anon, service_role;
-- ==============================================================================
-- 8. Reconciliation delta — migrations 52-77 (generated to match production)
--    Regenerate from supabase/migrations/*.sql whenever migrations change.
--    The baseline above predates migrations 52-77. Everything below is replayed
--    from those migrations, so a restored database equals production.
-- ==============================================================================

-- 8.1 Table changes (columns, constraints, RLS enablement)
ALTER TABLE public.stock_transactions ADD COLUMN IF NOT EXISTS storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL;
ALTER TABLE public.stock_transactions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.stock_transactions ADD COLUMN IF NOT EXISTS reference_type TEXT;
ALTER TABLE public.stock_transactions ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE public.stock_in_orders ADD COLUMN IF NOT EXISTS storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL;
ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL;
ALTER TABLE public.stock_transactions DROP CONSTRAINT IF EXISTS stock_transactions_transaction_type_check;
ALTER TABLE public.stock_transactions DROP CONSTRAINT IF EXISTS stock_transactions_transaction_type_check;
ALTER TABLE public.stock_transactions ADD CONSTRAINT stock_transactions_transaction_type_check
CHECK (transaction_type IN ('IN', 'OUT', 'ADJUST', 'RETURN', 'TRANSFER', 'CHECKOUT', 'stock_in', 'stock_out', 'checkout_out', 'return_in'));
ALTER TABLE public.site_bom_templates ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES public.items(id) ON DELETE SET NULL;
ALTER TABLE public.site_bom_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.site_bom_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_extension_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_orders
ADD COLUMN IF NOT EXISTS borrow_type TEXT NOT NULL DEFAULT 'standard'
CHECK (borrow_type IN ('standard', 'indefinite'));
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS vendor TEXT;
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS signature_url TEXT;
ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE public.checkout_orders
DROP CONSTRAINT IF EXISTS checkout_orders_status_check;
ALTER TABLE public.checkout_orders DROP CONSTRAINT IF EXISTS checkout_orders_status_check;
ALTER TABLE public.checkout_orders
ADD CONSTRAINT checkout_orders_status_check
CHECK (status IN ('pending', 'active', 'partial_returned', 'completed', 'overdue', 'cancelled', 'rejected'));
ALTER TABLE public.checkout_orders
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.checkout_items
DROP CONSTRAINT IF EXISTS checkout_items_status_check;
ALTER TABLE public.checkout_items DROP CONSTRAINT IF EXISTS checkout_items_status_check;
ALTER TABLE public.checkout_items
ADD CONSTRAINT checkout_items_status_check
CHECK (status IN ('pending', 'borrowed', 'returned', 'damaged', 'lost', 'rejected'));
ALTER TABLE public.checkout_items
ADD COLUMN IF NOT EXISTS quantity_consumed NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.checkout_items DROP CONSTRAINT IF EXISTS checkout_items_quantity_consumed_check;
ALTER TABLE public.checkout_items
ADD CONSTRAINT checkout_items_quantity_consumed_check
CHECK (quantity_consumed >= 0) NOT VALID;
ALTER TABLE public.checkout_items
VALIDATE CONSTRAINT checkout_items_quantity_consumed_check;
ALTER TABLE public.checkout_return_logs
ADD COLUMN IF NOT EXISTS replaced_serial_number TEXT;
ALTER TABLE public.checkout_return_logs DROP CONSTRAINT IF EXISTS checkout_return_logs_item_condition_check;
ALTER TABLE public.checkout_return_logs
ADD CONSTRAINT checkout_return_logs_item_condition_check
CHECK (
item_condition IN ('normal', 'damaged', 'lost', 'needs_repair', 'consumed')
) NOT VALID;
ALTER TABLE public.checkout_return_logs
VALIDATE CONSTRAINT checkout_return_logs_item_condition_check;
ALTER TABLE public.stock_transactions
DROP CONSTRAINT IF EXISTS stock_transactions_transaction_type_check;
ALTER TABLE public.stock_transactions DROP CONSTRAINT IF EXISTS stock_transactions_transaction_type_check;
ALTER TABLE public.stock_transactions
ADD CONSTRAINT stock_transactions_transaction_type_check
CHECK (
transaction_type IN (
'IN', 'OUT', 'ADJUST', 'RETURN', 'TRANSFER', 'CHECKOUT',
'stock_in', 'stock_out', 'checkout_out', 'return_in',
'transfer_in', 'transfer_out', 'adjustment'
)
) NOT VALID;
ALTER TABLE public.stock_transactions
VALIDATE CONSTRAINT stock_transactions_transaction_type_check;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_dispatch_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions
DROP CONSTRAINT IF EXISTS stock_transactions_transaction_type_check;
ALTER TABLE public.stock_transactions DROP CONSTRAINT IF EXISTS stock_transactions_transaction_type_check;
ALTER TABLE public.stock_transactions
ADD CONSTRAINT stock_transactions_transaction_type_check
CHECK (
transaction_type IN (
'IN', 'OUT', 'ADJUST', 'RETURN', 'TRANSFER', 'CHECKOUT',
'stock_in', 'stock_out', 'checkout_out', 'return_in',
'transfer_in', 'transfer_out', 'adjustment'
)
) NOT VALID;
ALTER TABLE public.stock_transactions
VALIDATE CONSTRAINT stock_transactions_transaction_type_check;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- 8.2 Latest definition of every migrated RPC (identity = argument types)
CREATE OR REPLACE FUNCTION public.adjust_item_current_stock(
  p_item_id UUID,
  p_project_id UUID,
  p_new_quantity INTEGER,
  p_reason TEXT,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
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
  -- A. Identify caller
  v_caller_id := COALESCE(auth.uid(), p_actor_id);

  -- B. Check Global Setting
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

  -- C. Authorization Check
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR (v_caller_role != 'admin' AND NOT public.has_permission(v_caller_id, 'items.adjust_stock')) THEN
    IF NOT public.has_permission(v_caller_id, 'items.update') THEN
      RAISE EXCEPTION 'Unauthorized: คุณไม่มีสิทธิ์ปรับยอดสต็อกคงเหลือ (ต้องการสิทธิ์ items.adjust_stock)';
    END IF;
  END IF;

  -- D. Parameter Validation
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

  -- E. Validate Item and Project
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
    RAISE EXCEPTION 'ไม่พบโครงการ/คลังสินค้า หรือโครงการไม่ได้อยู่ในสถานะใช้งาน';
  END IF;

  v_project_display := v_project_name || (CASE WHEN v_project_loc IS NOT NULL AND v_project_loc != '' THEN ' (' || v_project_loc || ')' ELSE '' END);

  -- F. Get current balance from stock_balance view
  SELECT balance INTO v_current_balance
  FROM public.stock_balance
  WHERE project_id = p_project_id AND item_id = p_item_id;

  v_current_balance := COALESCE(v_current_balance, 0);
  v_diff := p_new_quantity - v_current_balance;

  IF v_diff = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'changed', false,
      'item_name', v_item_name,
      'previous_quantity', v_current_balance,
      'new_quantity', p_new_quantity,
      'difference', 0,
      'message', 'ยอดสต็อกคงเหลือเท่าเดิม ไม่มีการปรับปรุงยอด'
    );
  END IF;

  -- G. Apply Stock Adjustment Transactions (Non-destructive)
  IF v_diff > 0 THEN
    -- Stock Increase: Create stock_in_orders + stock_in_items
    INSERT INTO public.stock_in_orders (
      project_id,
      created_by,
      received_date,
      notes
    ) VALUES (
      p_project_id,
      v_caller_id,
      CURRENT_DATE,
      'ปรับยอดสต็อกคงเหลือ (+ ' || v_diff || ' ' || v_item_unit || ') | เหตุผล: ' || TRIM(p_reason)
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.stock_in_items (
      order_id,
      item_id,
      quantity,
      notes
    ) VALUES (
      v_order_id,
      p_item_id,
      v_diff,
      'ปรับยอดสต็อกคงเหลือเพิ่ม | เหตุผล: ' || TRIM(p_reason)
    );

    -- Also record in stock_transactions
    INSERT INTO public.stock_transactions (
      project_id,
      item_id,
      quantity,
      transaction_type,
      notes,
      created_by
    ) VALUES (
      p_project_id,
      p_item_id,
      v_diff,
      'stock_in',
      'ปรับยอดสต็อกคงเหลือเพิ่ม (+ ' || v_diff || ' ' || v_item_unit || ') | เหตุผล: ' || TRIM(p_reason),
      v_caller_id
    );

  ELSE
    -- Stock Decrease: Record in stock_transactions
    v_abs_diff := ABS(v_diff);

    INSERT INTO public.stock_transactions (
      project_id,
      item_id,
      quantity,
      transaction_type,
      notes,
      created_by
    ) VALUES (
      p_project_id,
      p_item_id,
      v_abs_diff,
      'stock_out',
      'ปรับยอดสต็อกคงเหลือลดลง (- ' || v_abs_diff || ' ' || v_item_unit || ') | เหตุผล: ' || TRIM(p_reason),
      v_caller_id
    );
  END IF;

  -- H. Insert into stock_adjustment_logs
  INSERT INTO public.stock_adjustment_logs (
    item_id,
    project_id,
    previous_quantity,
    new_quantity,
    difference,
    reason,
    created_by,
    created_at
  ) VALUES (
    p_item_id,
    p_project_id,
    v_current_balance,
    p_new_quantity,
    v_diff,
    TRIM(p_reason),
    v_caller_id,
    NOW()
  ) RETURNING id INTO v_log_id;

  -- I. Insert into system audit_logs
  INSERT INTO public.audit_logs (
    actor_id,
    action,
    details
  ) VALUES (
    v_caller_id,
    'stock.adjust',
    jsonb_build_object(
      'log_id', v_log_id,
      'item_id', p_item_id,
      'item_name', v_item_name,
      'sku', v_item_sku,
      'project_id', p_project_id,
      'project_name', v_project_display,
      'previous_quantity', v_current_balance,
      'new_quantity', p_new_quantity,
      'difference', v_diff,
      'unit', v_item_unit,
      'reason', TRIM(p_reason)
    )
  );

  -- J. Return Result
  RETURN jsonb_build_object(
    'success', true,
    'changed', true,
    'log_id', v_log_id,
    'item_name', v_item_name,
    'sku', v_item_sku,
    'unit', v_item_unit,
    'project_name', v_project_display,
    'previous_quantity', v_current_balance,
    'new_quantity', p_new_quantity,
    'difference', v_diff,
    'reason', TRIM(p_reason),
    'message', 'ปรับยอดสต็อก ' || v_item_name || ' จาก ' || v_current_balance || ' เป็น ' || p_new_quantity || ' ' || v_item_unit || ' (' || (CASE WHEN v_diff > 0 THEN '+' || v_diff ELSE '' || v_diff END) || ') สำเร็จ'
  );
END;
$$;

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

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT DEFAULT NULL,
  p_full_name TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'staff',
  p_phone TEXT DEFAULT NULL,
  p_position TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_all_projects BOOLEAN DEFAULT TRUE,
  p_project_ids UUID[] DEFAULT ARRAY[]::UUID[],
  p_avatar_url TEXT DEFAULT NULL,
  p_role_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_calling_user_id UUID;
  v_new_user_id UUID;
  v_effective_role_id UUID;
  v_new_role_code TEXT;
  v_is_caller_super BOOLEAN := FALSE;
  v_effective_password TEXT;
  v_encrypted_pw TEXT;
  v_calling_role TEXT;
BEGIN
  -- A. Authentication & Permission Verification
  v_calling_user_id := auth.uid();
  IF v_calling_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
  END IF;

  -- Check Super Admin status
  v_is_caller_super := public.is_super_admin(v_calling_user_id);

  -- Caller must be Super Admin, have users.create permission, or have admin role in profiles
  IF NOT (
    v_is_caller_super OR 
    public.has_permission(v_calling_user_id, 'users.create') OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = v_calling_user_id AND LOWER(role) IN ('admin', 'super_admin', 'super'))
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission denied. users.create permission required.');
  END IF;

  -- B. Input Validation
  IF p_email IS NULL OR TRIM(p_email) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Email is required.');
  END IF;

  IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Full name is required.');
  END IF;

  -- C. Resolve effective role_id and normalized code
  v_effective_role_id := p_role_id;
  IF v_effective_role_id IS NULL AND p_role IS NOT NULL THEN
    SELECT id, code INTO v_effective_role_id, v_new_role_code
    FROM public.roles
    WHERE UPPER(code) = UPPER(TRIM(p_role))
       OR (UPPER(TRIM(p_role)) IN ('STAFF', 'OPERATOR', 'REQUESTER') AND code = 'STAFF')
       OR (UPPER(TRIM(p_role)) IN ('SUPERVISOR', 'APPROVER', 'MANAGER') AND code = 'SUPERVISOR')
       OR (UPPER(TRIM(p_role)) IN ('ADMIN', 'ADMINISTRATOR') AND code = 'ADMIN')
       OR (UPPER(TRIM(p_role)) IN ('SUPER', 'SUPERADMIN') AND code = 'SUPER')
    LIMIT 1;
  ELSEIF v_effective_role_id IS NOT NULL THEN
    SELECT code INTO v_new_role_code FROM public.roles WHERE id = v_effective_role_id;
  END IF;

  -- Fallback if no matching role found
  IF v_new_role_code IS NULL THEN
    v_new_role_code := COALESCE(NULLIF(LOWER(TRIM(p_role)), ''), 'staff');
  END IF;

  -- Security Hierarchy Protection: Only Super Admin can create Super Admin accounts
  IF (UPPER(COALESCE(p_role, '')) IN ('SUPER', 'SUPERADMIN') OR v_new_role_code = 'SUPER') AND NOT v_is_caller_super THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission Denied: Only Super Admin can create Super Admin accounts.');
  END IF;

  -- D. Check for existing email in auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_email))) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Email address is already in use.');
  END IF;

  -- E. Determine Effective Password
  IF p_password IS NOT NULL AND TRIM(p_password) != '' THEN
    v_effective_password := TRIM(p_password);
  ELSE
    SELECT secret_value INTO v_effective_password
    FROM public.system_secrets
    WHERE key = 'default_reset_password';

    IF v_effective_password IS NULL OR TRIM(v_effective_password) = '' THEN
      v_effective_password := 'F0rth2026@dtrs';
    END IF;
  END IF;

  v_new_user_id := gen_random_uuid();
  v_encrypted_pw := extensions.crypt(v_effective_password, extensions.gen_salt('bf'));

  -- F. Insert into auth.users (With explicit GoTrue tokens and metadata)
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    reauthentication_token,
    email_change,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    is_sso_user,
    is_anonymous,
    is_super_admin,
    created_at,
    updated_at
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000',
    LOWER(TRIM(p_email)),
    v_encrypted_pw,
    NOW(),
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', TRIM(p_full_name), 'role', LOWER(v_new_role_code)),
    'authenticated',
    'authenticated',
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

  -- G. Insert into auth.identities (Required for GoTrue Email Auth)
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_new_user_id,
    v_new_user_id,
    jsonb_build_object('sub', v_new_user_id::text, 'email', LOWER(TRIM(p_email))),
    'email',
    v_new_user_id::text,
    NOW(),
    NOW(),
    NOW()
  ) ON CONFLICT (provider, provider_id) DO NOTHING;

  -- H. Create or Update Profile
  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    role_id,
    status,
    phone,
    department,
    "position",
    avatar_url,
    all_projects,
    created_at,
    updated_at
  )
  VALUES (
    v_new_user_id,
    TRIM(p_full_name),
    LOWER(TRIM(v_new_role_code)),
    v_effective_role_id,
    'active',
    NULLIF(TRIM(p_phone), ''),
    NULLIF(TRIM(p_department), ''),
    NULLIF(TRIM(p_position), ''),
    p_avatar_url,
    COALESCE(p_all_projects, TRUE),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    role_id = EXCLUDED.role_id,
    status = EXCLUDED.status,
    phone = EXCLUDED.phone,
    department = EXCLUDED.department,
    "position" = EXCLUDED."position",
    avatar_url = EXCLUDED.avatar_url,
    all_projects = EXCLUDED.all_projects,
    updated_at = NOW();

  -- I. Project Assignments
  IF NOT COALESCE(p_all_projects, TRUE) AND p_project_ids IS NOT NULL AND ARRAY_LENGTH(p_project_ids, 1) > 0 THEN
    INSERT INTO public.user_project_assignments (user_id, project_id)
    SELECT v_new_user_id, UNNEST(p_project_ids);
  END IF;

  -- J. Record Audit Log
  INSERT INTO public.audit_logs (actor_id, target_user_id, action, details)
  VALUES (
    v_calling_user_id,
    v_new_user_id,
    'USER_CREATED',
    jsonb_build_object(
      'email', LOWER(TRIM(p_email)),
      'full_name', TRIM(p_full_name),
      'role', v_new_role_code,
      'role_id', v_effective_role_id,
      'all_projects', COALESCE(p_all_projects, TRUE),
      'project_ids', p_project_ids,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true, 
    'user_id', v_new_user_id, 
    'message', 'User created successfully.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_role(
  p_role_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_role_code TEXT;
  v_is_system BOOLEAN;
  v_user_count INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT (public.is_super_admin(v_caller_id) OR public.has_permission(v_caller_id, 'roles.delete')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.delete permission.';
  END IF;

  SELECT code, is_system INTO v_role_code, v_is_system FROM public.roles WHERE id = p_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not Found: Target role does not exist.';
  END IF;

  IF v_is_system OR v_role_code IN ('SUPER', 'ADMIN', 'SUPERVISOR', 'STAFF') THEN
    RAISE EXCEPTION 'Permission Denied: System roles cannot be deleted.';
  END IF;

  SELECT COUNT(*) INTO v_user_count FROM public.profiles WHERE role_id = p_role_id;
  IF v_user_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete role assigned to active users.';
  END IF;

  DELETE FROM public.role_permissions WHERE role_id = p_role_id;
  DELETE FROM public.roles WHERE id = p_role_id;

  RETURN jsonb_build_object('success', true, 'message', 'Role deleted successfully.');
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

CREATE OR REPLACE FUNCTION public.admin_get_permissions_catalog()
RETURNS TABLE (
  id UUID,
  code TEXT,
  name TEXT,
  description TEXT,
  resource TEXT,
  action TEXT,
  category TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.view') THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.view permission.';
  END IF;

  RETURN QUERY
  SELECT p.id, p.code, p.name, p.description, p.resource, p.action, p.category
  FROM public.permissions p
  ORDER BY p.category ASC, p.code ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_role_permissions(p_role_id UUID)
RETURNS TABLE (permission_id UUID, permission_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.view') THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.view permission.';
  END IF;

  RETURN QUERY
  SELECT perm.id AS permission_id, perm.code AS permission_code
  FROM public.role_permissions rp
  JOIN public.permissions perm ON perm.id = rp.permission_id
  WHERE rp.role_id = p_role_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_roles_with_stats()
RETURNS TABLE (
  id UUID,
  code TEXT,
  name TEXT,
  description TEXT,
  badge_background TEXT,
  badge_text_color TEXT,
  is_system BOOLEAN,
  is_active BOOLEAN,
  user_count BIGINT,
  permission_count BIGINT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.view') THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.view permission.';
  END IF;

  RETURN QUERY
  SELECT 
    r.id,
    r.code,
    r.name,
    r.description,
    r.badge_background,
    r.badge_text_color,
    r.is_system,
    r.is_active,
    COUNT(DISTINCT p.id)::BIGINT AS user_count,
    COUNT(DISTINCT rp.permission_id)::BIGINT AS permission_count,
    r.created_at,
    r.updated_at
  FROM public.roles r
  LEFT JOIN public.profiles p ON (
    p.role_id = r.id 
    OR UPPER(TRIM(p.role)) = r.code
    OR (r.code = 'STAFF' AND UPPER(TRIM(p.role)) IN ('STAFF', 'OPERATOR', 'REQUESTER'))
    OR (r.code = 'SUPERVISOR' AND UPPER(TRIM(p.role)) IN ('SUPERVISOR', 'APPROVER', 'MANAGER'))
    OR (r.code = 'ADMIN' AND UPPER(TRIM(p.role)) IN ('ADMIN', 'ADMINISTRATOR'))
  )
  LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
  GROUP BY r.id, r.code, r.name, r.description, r.badge_background, r.badge_text_color, r.is_system, r.is_active, r.created_at, r.updated_at
  ORDER BY r.is_system DESC, r.created_at ASC;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.admin_get_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  status TEXT,
  phone TEXT,
  department TEXT,
  "position" TEXT,
  avatar_url TEXT,
  must_change_password BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  assigned_project_ids UUID[],
  all_projects BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    COALESCE(u.email::TEXT, '') AS email,
    COALESCE(p.full_name, 'User') AS full_name,
    COALESCE(p.role, 'operator') AS role,
    COALESCE(p.status, 'active') AS status,
    p.phone,
    p.department,
    p."position",
    p.avatar_url,
    COALESCE(p.must_change_password, FALSE) AS must_change_password,
    p.created_at,
    p.updated_at,
    COALESCE(ARRAY_AGG(upa.project_id) FILTER (WHERE upa.project_id IS NOT NULL), ARRAY[]::UUID[]) AS assigned_project_ids,
    COALESCE(p.all_projects, p.role = 'admin', TRUE) AS all_projects
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_project_assignments upa ON upa.user_id = p.id
  GROUP BY p.id, u.email, p.full_name, p.role, p.status, p.phone, p.department, p."position", p.avatar_url, p.must_change_password, p.created_at, p.updated_at, p.all_projects
  ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  p_target_id UUID,
  p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
BEGIN
  -- Permission check: super_admin, users.reset_password, users.update, or users.manage
  IF NOT (
    public.is_super_admin(auth.uid()) OR 
    public.has_permission(auth.uid(), 'users.reset_password') OR 
    public.has_permission(auth.uid(), 'users.update') OR 
    public.has_permission(auth.uid(), 'users.manage')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires users.reset_password or users.update permission.';
  END IF;

  -- Security: Protect Super Admin accounts from non-super admin
  IF (SELECT (UPPER(role) IN ('SUPER', 'SUPERADMIN') OR LOWER(COALESCE((SELECT email FROM auth.users WHERE id = p_target_id), '')) = 'admin@stockflow.com') FROM public.profiles WHERE id = p_target_id)
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Permission Denied: Only Super Admin can reset password of Super Admin accounts.';
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

CREATE OR REPLACE FUNCTION public.admin_save_category_bom(
  p_category_id UUID,
  p_bom_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_item JSONB;
  v_count INT := 0;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated';
  END IF;

  IF NOT public.can_manage_site_bom() THEN
    RAISE EXCEPTION 'Forbidden: Only authorized administrators can modify Site Kit BOM templates';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.categories WHERE id = p_category_id
  ) THEN
    RAISE EXCEPTION 'Category not found with ID: %', p_category_id;
  END IF;

  DELETE FROM public.site_bom_templates
  WHERE category_id = p_category_id;

  IF p_bom_items IS NOT NULL AND jsonb_typeof(p_bom_items) = 'array'
     AND jsonb_array_length(p_bom_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_bom_items)
    LOOP
      INSERT INTO public.site_bom_templates (
        category_id,
        item_id,
        po_seq,
        part_number,
        item_name,
        qty_per_site,
        unit,
        is_mandatory,
        notes,
        created_at,
        updated_at
      ) VALUES (
        p_category_id,
        CASE
          WHEN NULLIF(v_item->>'item_id', '') IS NOT NULL
            THEN (v_item->>'item_id')::UUID
          ELSE NULL
        END,
        COALESCE((v_item->>'po_seq')::INT, v_count + 1),
        NULLIF(TRIM(v_item->>'part_number'), ''),
        COALESCE(NULLIF(TRIM(v_item->>'item_name'), ''), 'Unnamed BOM Item'),
        COALESCE((v_item->>'qty_per_site')::NUMERIC, 1),
        COALESCE(NULLIF(TRIM(v_item->>'unit'), ''), 'ชิ้น'),
        COALESCE((v_item->>'is_mandatory')::BOOLEAN, TRUE),
        NULLIF(TRIM(v_item->>'notes'), ''),
        NOW(),
        NOW()
      );
      v_count := v_count + 1;
    END LOOP;
  ELSIF p_bom_items IS NOT NULL AND jsonb_typeof(p_bom_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid BOM items: expected a JSON array';
  END IF;

  BEGIN
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
      INSERT INTO public.audit_logs (actor_id, action, details)
      VALUES (
        v_caller_id,
        'update_category_bom',
        jsonb_build_object(
          'category_id', p_category_id,
          'item_count', v_count,
          'timestamp', NOW()
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Audit logging must not make an authorized BOM replacement fail.
  END;

  RETURN jsonb_build_object(
    'success', TRUE,
    'category_id', p_category_id,
    'inserted_count', v_count,
    'message', 'Category BOM updated successfully'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_role_permissions(
  p_role_id UUID,
  p_permission_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_pid UUID;
  v_role_code TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT (public.is_super_admin(v_caller_id) OR public.has_permission(v_caller_id, 'roles.manage_permissions')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.manage_permissions permission.';
  END IF;

  SELECT code INTO v_role_code FROM public.roles WHERE id = p_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not Found: Target role does not exist.';
  END IF;

  -- Security Hierarchy Restriction: Only Super Admin can modify SUPER role permissions
  IF v_role_code = 'SUPER' AND NOT public.is_super_admin(v_caller_id) THEN
    RAISE EXCEPTION 'Permission Denied: Only Super Admin can modify SUPER role permissions.';
  END IF;

  -- Delete existing permissions for role
  DELETE FROM public.role_permissions WHERE role_id = p_role_id;

  -- Re-insert selected permissions
  IF p_permission_ids IS NOT NULL AND ARRAY_LENGTH(p_permission_ids, 1) > 0 THEN
    FOREACH v_pid IN ARRAY p_permission_ids LOOP
      INSERT INTO public.role_permissions (role_id, permission_id)
      VALUES (p_role_id, v_pid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Audit log
  BEGIN
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
      INSERT INTO public.audit_logs (actor_id, action, details)
      VALUES (
        v_caller_id,
        'ROLE_PERMISSION_CHANGED',
        jsonb_build_object(
          'role_id', p_role_id,
          'role_code', v_role_code,
          'permissions_count', COALESCE(ARRAY_LENGTH(p_permission_ids, 1), 0)
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN END;

  RETURN jsonb_build_object('success', true, 'message', 'Role permissions updated successfully.');
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
  -- Permission check: super_admin, users.deactivate, users.update, or users.manage
  IF NOT (
    public.is_super_admin(auth.uid()) OR 
    public.has_permission(auth.uid(), 'users.deactivate') OR 
    public.has_permission(auth.uid(), 'users.update') OR 
    public.has_permission(auth.uid(), 'users.manage')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires users.deactivate or users.update permission.';
  END IF;

  IF p_status NOT IN ('active', 'inactive', 'suspended') THEN
    RAISE EXCEPTION 'Invalid status. Allowed values: active, inactive, suspended.';
  END IF;

  -- Protect Super Admin
  IF (SELECT (UPPER(role) IN ('SUPER', 'SUPERADMIN') OR LOWER(COALESCE((SELECT email FROM auth.users WHERE id = p_target_id), '')) = 'admin@stockflow.com') FROM public.profiles WHERE id = p_target_id)
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Permission Denied: Only Super Admin can change status of Super Admin accounts.';
  END IF;

  -- Protect Last Admin
  IF p_status != 'active' AND (SELECT LOWER(role) = 'admin' FROM public.profiles WHERE id = p_target_id) THEN
    IF (SELECT COUNT(*) FROM public.profiles WHERE LOWER(role) = 'admin' AND status = 'active') <= 1 AND NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Security Protection: Cannot deactivate the last remaining active Administrator account.';
    END IF;
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

  IF NOT (p_password ~ '[!@#$%^&*()_+-=[]{};'':"\\|,.<>/?]') THEN
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

CREATE OR REPLACE FUNCTION public.admin_update_role(
  p_role_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_badge_background TEXT,
  p_badge_text_color TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_role_code TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT (public.is_super_admin(v_caller_id) OR public.has_permission(v_caller_id, 'roles.update')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires roles.update permission.';
  END IF;

  SELECT code INTO v_role_code FROM public.roles WHERE id = p_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not Found: Target role does not exist.';
  END IF;

  -- Security Hierarchy Restriction: Only Super Admin can modify SUPER role metadata
  IF v_role_code = 'SUPER' AND NOT public.is_super_admin(v_caller_id) THEN
    RAISE EXCEPTION 'Permission Denied: Only Super Admin can edit Super Admin role.';
  END IF;

  UPDATE public.roles
  SET 
    name = TRIM(p_name),
    description = TRIM(p_description),
    badge_background = p_badge_background,
    badge_text_color = p_badge_text_color,
    updated_at = NOW()
  WHERE id = p_role_id;

  RETURN jsonb_build_object('success', true, 'message', 'Role updated successfully.');
END;
$$;

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

CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_target_id UUID,
  p_full_name TEXT,
  p_role TEXT,
  p_status TEXT,
  p_phone TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_position TEXT DEFAULT NULL,
  p_all_projects BOOLEAN DEFAULT TRUE,
  p_project_ids UUID[] DEFAULT ARRAY[]::UUID[],
  p_avatar_url TEXT DEFAULT NULL,
  p_must_change_password BOOLEAN DEFAULT FALSE,
  p_role_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_calling_user_id UUID;
  v_admin_count INTEGER;
  v_old_role TEXT;
  v_old_role_id UUID;
  v_old_status TEXT;
  v_old_email TEXT;
  v_effective_role_id UUID;
  v_new_role_code TEXT;
  v_is_caller_super BOOLEAN;
  v_is_target_super BOOLEAN;
BEGIN
  v_calling_user_id := auth.uid();
  IF v_calling_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
  END IF;

  v_is_caller_super := public.is_super_admin(v_calling_user_id);

  -- 1. Permission check: caller must have users.update or be admin
  IF NOT (v_is_caller_super OR public.has_permission(v_calling_user_id, 'users.update')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission denied. users.update permission required.');
  END IF;

  -- 2. Verify target user exists
  SELECT role, role_id, status INTO v_old_role, v_old_role_id, v_old_status
  FROM public.profiles
  WHERE id = p_target_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Target user profile does not exist.');
  END IF;

  BEGIN
    SELECT email INTO v_old_email FROM auth.users WHERE id = p_target_id;
  EXCEPTION WHEN OTHERS THEN
    v_old_email := NULL;
  END;

  v_is_target_super := (UPPER(v_old_role) IN ('SUPER', 'SUPERADMIN', 'SUPER_ADMIN') OR LOWER(COALESCE(v_old_email, '')) = 'admin@stockflow.com');
  IF NOT v_is_target_super AND v_old_role_id IS NOT NULL THEN
    SELECT (code = 'SUPER') INTO v_is_target_super FROM public.roles WHERE id = v_old_role_id;
  END IF;

  -- Security Hierarchy Protection: Only Super Admin can modify a Super Admin user
  IF v_is_target_super AND NOT v_is_caller_super THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission Denied: Only Super Admin can manage or modify Super Admin accounts.');
  END IF;

  -- 3. Resolve effective role_id
  v_effective_role_id := p_role_id;
  IF v_effective_role_id IS NULL AND p_role IS NOT NULL THEN
    SELECT id, code INTO v_effective_role_id, v_new_role_code
    FROM public.roles
    WHERE UPPER(code) = UPPER(TRIM(p_role))
       OR (UPPER(TRIM(p_role)) IN ('STAFF', 'OPERATOR', 'REQUESTER') AND code = 'STAFF')
       OR (UPPER(TRIM(p_role)) IN ('SUPERVISOR', 'APPROVER', 'MANAGER') AND code = 'SUPERVISOR')
       OR (UPPER(TRIM(p_role)) IN ('ADMIN', 'ADMINISTRATOR') AND code = 'ADMIN')
       OR (UPPER(TRIM(p_role)) IN ('SUPER', 'SUPERADMIN') AND code = 'SUPER')
    LIMIT 1;
  ELSEIF v_effective_role_id IS NOT NULL THEN
    SELECT code INTO v_new_role_code FROM public.roles WHERE id = v_effective_role_id;
  END IF;

  -- Security Hierarchy Protection: Only Super Admin can grant/assign the SUPER role to any user
  IF (UPPER(p_role) IN ('SUPER', 'SUPERADMIN') OR v_new_role_code = 'SUPER') AND NOT v_is_caller_super THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permission Denied: Only Super Admin can assign the Super Admin role.');
  END IF;

  -- 4. Security Protection: Prevent demoting or deactivating the last active Admin
  IF (LOWER(v_old_role) = 'admin' AND (LOWER(p_role) != 'admin' OR p_status != 'active')) THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM public.profiles
    WHERE LOWER(role) = 'admin' AND status = 'active';

    IF v_admin_count <= 1 AND NOT v_is_caller_super THEN
      RETURN jsonb_build_object('success', false, 'message', 'Security Protection: Cannot demote or deactivate the last remaining active Administrator account.');
    END IF;
  END IF;

  -- 5. Update profiles table
  UPDATE public.profiles
  SET 
    full_name = TRIM(p_full_name),
    role = LOWER(TRIM(p_role)),
    role_id = v_effective_role_id,
    status = p_status,
    phone = NULLIF(TRIM(p_phone), ''),
    department = NULLIF(TRIM(p_department), ''),
    "position" = NULLIF(TRIM(p_position), ''),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    must_change_password = COALESCE(p_must_change_password, FALSE),
    all_projects = COALESCE(p_all_projects, TRUE),
    updated_at = NOW()
  WHERE id = p_target_id;

  -- 6. Synchronize project assignments
  DELETE FROM public.user_project_assignments WHERE user_id = p_target_id;

  IF NOT COALESCE(p_all_projects, TRUE) AND p_project_ids IS NOT NULL AND ARRAY_LENGTH(p_project_ids, 1) > 0 THEN
    INSERT INTO public.user_project_assignments (user_id, project_id)
    SELECT p_target_id, UNNEST(p_project_ids);
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'User updated successfully.');
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_checkout_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_order_id UUID;
  v_order RECORD;
  v_item RECORD;
  v_available NUMERIC;
  v_item_name TEXT;
  v_notes TEXT;
BEGIN
  -- ----------------------------------------------------------------
  -- All business rules raise ERRCODE P0001 (business_error) so the
  -- message stays Thai and reaches the client as HTTP 400.
  -- ----------------------------------------------------------------
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.approve')
    OR public.is_super_admin(v_caller_id)
    OR public.is_checkout_delegate(v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.approve permission.';
  END IF;

  v_order_id := NULLIF(p_payload->>'order_id', '')::UUID;
  v_notes := NULLIF(TRIM(COALESCE(p_payload->>'notes', '')), '');

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุรหัสคำขอยืม (order_id is required)';
  END IF;

  -- =================================================================
  -- STEP A: lock base-table rows only (never the stock_balance view)
  -- =================================================================

  -- A-1. Row lock the checkout order: serializes double-approval attempts.
  SELECT * INTO v_order
  FROM public.checkout_orders
  WHERE id = v_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลคำขอยืมพัสดุ ID: %', v_order_id;
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติ (สถานะปัจจุบัน: %)', v_order.status;
  END IF;

  -- A-2. Lock the checkout line rows that will be flipped to 'borrowed'.
  PERFORM 1
  FROM public.checkout_items ci
  WHERE ci.checkout_order_id = v_order_id
  ORDER BY ci.id
  FOR UPDATE;

  -- A-3. Lock the item master rows in deterministic order to prevent deadlock.
  --      This is the same per-item mutex used by approve_withdrawal_order and
  --      process_item_transfer, so concurrent stock movements on the same item
  --      are serialized against this approval.
  PERFORM 1
  FROM public.items i
  WHERE i.id IN (
    SELECT ci.item_id
    FROM public.checkout_items ci
    WHERE ci.checkout_order_id = v_order_id
  )
  ORDER BY i.id
  FOR UPDATE;

  -- =================================================================
  -- STEP B: aggregate read — stock_balance is a GROUP BY view, so it
  -- must be read with NO locking clause (see header comment).
  -- =================================================================

  -- Validate stock sufficiency and deduct stock for each checkout item
  FOR v_item IN
    SELECT ci.id AS item_row_id, ci.item_id, ci.quantity_borrowed, ci.serial_number, i.name AS item_name
    FROM public.checkout_items ci
    JOIN public.items i ON i.id = ci.item_id
    WHERE ci.checkout_order_id = v_order_id
    ORDER BY ci.id
  LOOP
    SELECT balance INTO v_available
    FROM public.stock_balance
    WHERE project_id = v_order.project_id AND item_id = v_item.item_id;

    IF COALESCE(v_available, 0) < v_item.quantity_borrowed THEN
      RAISE EXCEPTION 'ยอดสต็อกคงเหลือไม่เพียงพอสำหรับ "%" (คงเหลือ % ชิ้น, ต้องการจ่าย % ชิ้น)',
        v_item.item_name, COALESCE(v_available, 0), v_item.quantity_borrowed;
    END IF;

    -- Record stock deduction transaction
    INSERT INTO public.stock_transactions (
      project_id,
      item_id,
      transaction_type,
      quantity,
      reference_id,
      reference_type,
      created_by,
      notes
    ) VALUES (
      v_order.project_id,
      v_item.item_id,
      'checkout_out',
      v_item.quantity_borrowed,
      v_order.id,
      'checkout_order',
      v_caller_id,
      'อนุมัติและจ่ายอุปกรณ์: คำสั่งยืม ' || v_order.order_number
    );

    -- Update line item status to 'borrowed'
    UPDATE public.checkout_items
    SET status = 'borrowed'
    WHERE id = v_item.item_row_id;
  END LOOP;

  -- Update order status to active with approver identity
  UPDATE public.checkout_orders
  SET
    status = 'active',
    approved_by = v_caller_id,
    approved_at = now(),
    notes = CASE
      WHEN v_notes IS NOT NULL AND v_order.notes IS NOT NULL THEN v_order.notes || E'\\n[อนุมัติโดยเจ้าหน้าที่]: ' || v_notes
      WHEN v_notes IS NOT NULL THEN '[อนุมัติโดยเจ้าหน้าที่]: ' || v_notes
      ELSE v_order.notes
    END
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order.order_number,
    'status', 'active',
    'approved_by', v_caller_id,
    'approved_at', now(),
    'message', 'อนุมัติและจ่ายพัสดุสำหรับคำขอยืม ' || v_order.order_number || ' สำเร็จเรียบร้อย'
  );
EXCEPTION
  -- Business rule violations already carry a Thai, user-facing message.
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  -- Anything else is surfaced as a typed business error instead of a raw
  -- PostgreSQL error; the original SQLSTATE/message stays in DETAIL for logs.
  WHEN OTHERS THEN
    RAISE EXCEPTION 'อนุมัติคำขอยืมไม่สำเร็จ: ระบบฐานข้อมูลขัดข้อง กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบ'
      USING ERRCODE = 'P0001',
            DETAIL = 'SQLSTATE ' || SQLSTATE || ': ' || SQLERRM;
END;
$$;

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
  v_user_id UUID := auth.uid();
  v_order RECORD;
  v_item RECORD;
  v_available NUMERIC;
  v_requested NUMERIC;
  v_deduct NUMERIC;
  v_shortage NUMERIC;
  v_has_any_shortage BOOLEAN := FALSE;
  v_shortage_list JSONB := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_user_id, 'inventory.approve') OR 
          public.has_permission(v_user_id, 'withdrawals.approve') OR 
          public.is_super_admin(v_user_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires inventory.approve or withdrawals.approve permission.';
  END IF;

  SELECT * INTO v_order FROM public.withdrawal_orders WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found: %', p_request_id;
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending approval (current status: %)', v_order.status;
  END IF;

  -- Deadlock-free item row locking ordered by item_id
  PERFORM 1 FROM public.items i
  WHERE i.id IN (SELECT wi.item_id FROM public.withdrawal_items wi WHERE wi.order_id = p_request_id)
  ORDER BY i.id
  FOR UPDATE;

  -- Evaluate each requested item against current project stock_balance
  FOR v_item IN 
    SELECT wi.id as wi_id, wi.item_id, COALESCE(wi.requested_qty, wi.quantity) as requested_qty,
           i.name as item_name, i.sku, i.unit
    FROM public.withdrawal_items wi
    JOIN public.items i ON i.id = wi.item_id
    WHERE wi.order_id = p_request_id
    ORDER BY wi.id
  LOOP
    v_requested := v_item.requested_qty;

    SELECT balance INTO v_available
    FROM public.stock_balance
    WHERE project_id = v_order.project_id AND item_id = v_item.item_id;
    v_available := COALESCE(v_available, 0);

    IF v_available < v_requested THEN
      v_has_any_shortage := TRUE;
      v_shortage := v_requested - GREATEST(0, v_available);
      v_shortage_list := v_shortage_list || jsonb_build_object(
        'item_id', v_item.item_id,
        'item_name', v_item.item_name,
        'requested', v_requested,
        'available', v_available,
        'shortage', v_shortage
      );
    END IF;
  END LOOP;

  -- If shortages detected and shortage override was not granted, raise SHORTAGE_DETECTED
  IF v_has_any_shortage AND NOT p_allow_shortage THEN
    RAISE EXCEPTION 'SHORTAGE_DETECTED: %', jsonb_build_object('shortages', v_shortage_list)::text;
  END IF;

  -- Process deductions and line updates
  FOR v_item IN 
    SELECT wi.id as wi_id, wi.item_id, COALESCE(wi.requested_qty, wi.quantity) as requested_qty,
           i.name as item_name, i.sku, i.unit
    FROM public.withdrawal_items wi
    JOIN public.items i ON i.id = wi.item_id
    WHERE wi.order_id = p_request_id
    ORDER BY wi.id
  LOOP
    v_requested := v_item.requested_qty;

    SELECT balance INTO v_available
    FROM public.stock_balance
    WHERE project_id = v_order.project_id AND item_id = v_item.item_id;
    v_available := COALESCE(v_available, 0);

    IF v_available < v_requested THEN
      v_deduct := GREATEST(0, v_available);
      v_shortage := v_requested - v_deduct;
    ELSE
      v_deduct := v_requested;
      v_shortage := 0;
    END IF;

    -- NOTE: "approved_quantity" intentionally removed. The approved amount is
    -- persisted as deducted_quantity below; available_at_approval and
    -- shortage_quantity describe the same approval event.
    UPDATE public.withdrawal_items
    SET available_at_approval = v_available,
        deducted_quantity = v_deduct,
        shortage_quantity = v_shortage,
        is_shortage = (v_shortage > 0)
    WHERE id = v_item.wi_id;

    IF v_deduct > 0 THEN
      INSERT INTO public.stock_transactions (
        item_id, project_id, transaction_type, quantity, storage_location_id,
        created_by, reference_type, reference_id, notes
      ) VALUES (
        v_item.item_id, v_order.project_id, 'OUT', v_deduct, v_order.storage_location_id,
        v_user_id, 'withdrawal_order', p_request_id,
        COALESCE(p_override_reason, 'อนุมัติเบิกจ่าย Order #' || SUBSTRING(p_request_id::TEXT, 1, 8))
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

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_request_id,
    'status', 'approved',
    'has_shortage', v_has_any_shortage,
    'message', 'อนุมัติคำขอเบิกจ่ายสำเร็จ'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_withdrawal_order(
  p_order_id UUID,
  p_approver_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN public.approve_inventory_request(p_order_id, FALSE, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_site_bom()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN public.is_super_admin(v_caller_id)
    OR public.has_permission(v_caller_id, 'roles.manage_permissions')
    OR public.has_permission(v_caller_id, 'items.update');
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

CREATE OR REPLACE FUNCTION public.complete_withdrawal_order(
  p_order_id UUID,
  p_completer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN public.complete_inventory_request(p_order_id);
END;
$$;

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

  -- 3. Check for transition to Indefinite Borrow
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
      v_effective_user_id,
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

  -- Standard Date Extension validation
  IF v_order.borrow_type = 'indefinite' OR v_order.expected_return_date IS NULL THEN
    RAISE EXCEPTION 'Cannot extend return date for an indefinite borrow order.';
  END IF;

  IF p_new_due_date IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุกำหนดส่งคืนใหม่';
  END IF;

  IF p_new_due_date <= v_prev_due_date THEN
    RAISE EXCEPTION 'New return due date (%) must be later than the current due date (%).', p_new_due_date, v_prev_due_date;
  END IF;

  -- 4. Recalculate status for date extension
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
  ) VALUES (
    p_order_id,
    v_prev_due_date,
    p_new_due_date,
    p_reason,
    v_effective_user_id,
    now()
  ) RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'previous_due_date', v_prev_due_date,
    'new_due_date', p_new_due_date,
    'status', v_new_status,
    'log_id', v_log_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_checkout_borrowers()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  phone TEXT,
  department TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_checkout_delegate(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: only ADMIN or SUPER can choose another checkout user.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    COALESCE(NULLIF(TRIM(p.full_name), ''), 'User')::TEXT,
    NULLIF(TRIM(COALESCE(p.phone, '')), '')::TEXT,
    NULLIF(TRIM(COALESCE(p.department, '')), '')::TEXT
  FROM public.profiles p
  WHERE p.status = 'active'
  ORDER BY COALESCE(NULLIF(TRIM(p.full_name), ''), 'User'), p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_checkout_consumed_usage(
  p_project_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  return_log_id UUID,
  returned_at TIMESTAMPTZ,
  project_id UUID,
  project_name TEXT,
  project_code TEXT,
  project_location TEXT,
  project_description TEXT,
  order_number TEXT,
  borrower_name TEXT,
  item_name TEXT,
  unit TEXT,
  quantity NUMERIC,
  replaced_serial_number TEXT,
  damage_notes TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_caller_id, 'reports.view') OR public.is_super_admin(v_caller_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires reports.view permission.';
  END IF;

  RETURN QUERY
  SELECT cl.id,
         cl.returned_at,
         p.id,
         p.name,
         p.project_code,
         p.location,
         p.description,
         co.order_number,
         co.borrower_name,
         i.name,
         i.unit,
         cl.returned_quantity,
         cl.replaced_serial_number,
         cl.damage_notes
  FROM public.checkout_return_logs cl
  JOIN public.checkout_orders co ON co.id = cl.checkout_order_id
  JOIN public.checkout_items ci ON ci.id = cl.checkout_item_id
  JOIN public.items i ON i.id = ci.item_id
  LEFT JOIN public.projects p ON p.id = co.project_id
  WHERE cl.item_condition = 'consumed'
    AND (p_project_id IS NULL OR co.project_id = p_project_id)
    AND (p_start_date IS NULL OR cl.returned_at::date >= p_start_date)
    AND (p_end_date IS NULL OR cl.returned_at::date <= p_end_date)
  ORDER BY cl.returned_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE (permission_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT p.permission_code
  FROM public.get_user_permissions(auth.uid()) p;
END;
$$;

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
  -- Two independent, service-role-only signals are accepted: whether PostgREST
  -- exposes the role through the JWT claim (auth.role()) or through the
  -- database role. \`authenticated\` JWT sessions satisfy neither, so client
  -- callers keep the original "must be authenticated" behaviour.
  v_is_service_role BOOLEAN := (
    auth.role() = 'service_role'
    OR current_setting('role', true) = 'service_role'
  );
BEGIN
  IF NOT v_is_service_role AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
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

CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (permission_code TEXT)
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
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Lookup user status, role code, and role_id from public.profiles
  SELECT p.status, 
         COALESCE(r.code, UPPER(p.role)), 
         COALESCE(p.role_id, r.id)
  INTO v_status, v_role_code, v_role_id
  FROM public.profiles p
  LEFT JOIN public.roles r ON (r.id = p.role_id OR r.code = UPPER(TRIM(p.role)))
  WHERE p.id = p_user_id;

  IF v_status IS NULL OR v_status != 'active' THEN
    RETURN;
  END IF;

  -- Lookup email safely from auth.users (public.profiles does not have email column)
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  -- Super Admin receives all catalog permissions
  IF v_role_code = 'SUPER' OR LOWER(COALESCE(v_email, '')) = 'admin@stockflow.com' THEN
    RETURN QUERY SELECT code FROM public.permissions ORDER BY code;
    RETURN;
  END IF;

  -- Regular, Admin, Supervisor, Staff and customized roles receive exactly what is configured in role_permissions
  RETURN QUERY
  SELECT DISTINCT perm.code
  FROM public.role_permissions rp
  JOIN public.permissions perm ON perm.id = rp.permission_id
  WHERE rp.role_id = v_role_id
  ORDER BY perm.code;
END;
$$;

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

  -- Lookup user status, role code, and role_id from public.profiles
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

  -- Lookup email safely from auth.users (public.profiles does not have email column)
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  -- Super Admin or master system admin bypass
  IF v_role_code = 'SUPER' OR LOWER(COALESCE(v_email, '')) = 'admin@stockflow.com' THEN
    RETURN TRUE;
  END IF;

  -- Check role_permissions table dynamically for all roles (including ADMIN, SUPERVISOR, STAFF)
  RETURN EXISTS (
    SELECT 1 
    FROM public.role_permissions rp
    JOIN public.permissions perm ON perm.id = rp.permission_id
    WHERE rp.role_id = v_role_id 
      AND perm.code = p_perm_code
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_checkout_delegate(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_is_admin_or_super BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    LEFT JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = p_user_id
      AND p.status = 'active'
      AND (
        UPPER(TRIM(COALESCE(p.role, ''))) IN ('ADMIN', 'SUPER')
        OR UPPER(TRIM(COALESCE(r.code, ''))) IN ('ADMIN', 'SUPER')
      )
  ) OR public.is_super_admin(p_user_id)
  INTO v_is_admin_or_super;

  RETURN COALESCE(v_is_admin_or_super, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_role_code TEXT;
  v_email TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT COALESCE(r.code, UPPER(p.role))
  INTO v_role_code
  FROM public.profiles p
  LEFT JOIN public.roles r ON (r.id = p.role_id OR r.code = UPPER(TRIM(p.role)))
  WHERE p.id = p_user_id AND p.status = 'active';

  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  RETURN (v_role_code = 'SUPER' OR LOWER(COALESCE(v_email, '')) = 'admin@stockflow.com');
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_checkout_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_event_type TEXT;
  v_title TEXT;
  v_message TEXT;
  v_item_count INTEGER := 0;
  v_recipients UUID[];
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
    INTO v_item_count
  FROM public.checkout_items
  WHERE checkout_order_id = NEW.id;

  IF NEW.status = 'active' AND OLD.status = 'pending' THEN
    v_event_type := 'checkout.approved';
    v_title := 'คำขอยืมได้รับการอนุมัติ';
    v_message := 'คำขอยืม ' || NEW.order_number || ' ได้รับการอนุมัติและจ่ายพัสดุแล้ว';
  ELSIF NEW.status = 'rejected' THEN
    v_event_type := 'checkout.rejected';
    v_title := 'คำขอยืมไม่ได้รับการอนุมัติ';
    v_message := 'คำขอยืม ' || NEW.order_number || ' ถูกปฏิเสธ' || CASE WHEN COALESCE(NEW.rejection_reason, '') <> '' THEN ': ' || NEW.rejection_reason ELSE '' END;
  ELSIF NEW.status = 'completed' THEN
    v_event_type := 'checkout.completed';
    v_title := 'คืนพัสดุครบถ้วนแล้ว';
    v_message := 'คำขอยืม ' || NEW.order_number || ' ได้รับการคืนพัสดุครบถ้วนแล้ว';
  ELSIF NEW.status = 'overdue' THEN
    v_event_type := 'checkout.overdue';
    v_title := 'คำขอยืมเกินกำหนดส่งคืน';
    v_message := 'คำขอยืม ' || NEW.order_number || ' เกินกำหนดส่งคืนแล้ว กรุณาดำเนินการรับคืนพัสดุ';
  ELSE
    RETURN NEW;
  END IF;

  SELECT array_agg(DISTINCT u.user_id)
    INTO v_recipients
  FROM unnest(ARRAY[NEW.created_by, NEW.borrower_id]) AS u(user_id)
  WHERE u.user_id IS NOT NULL;

  PERFORM public.push_notifications(
    v_recipients,
    v_event_type,
    v_title,
    v_message,
    '/checkouts',
    NEW.id,
    NEW.project_id,
    jsonb_build_object('request_no', NEW.order_number, 'item_count', v_item_count)
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_checkout_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_requester_id UUID;
  v_requester_name TEXT;
  v_item_count INTEGER;
  v_recipients UUID[];
BEGIN
  FOR v_order IN
    SELECT o.id, o.order_number, o.project_id, o.created_by, o.borrower_id, o.borrower_name,
           p.name AS project_name, p.project_code
    FROM public.checkout_orders o
    JOIN (SELECT DISTINCT checkout_order_id FROM inserted_items) i ON i.checkout_order_id = o.id
    LEFT JOIN public.projects p ON p.id = o.project_id
    WHERE o.status = 'pending'
  LOOP
    v_requester_id := COALESCE(v_order.created_by, v_order.borrower_id);

    SELECT COALESCE(full_name, 'ผู้ขอยืม')
      INTO v_requester_name
    FROM public.profiles
    WHERE id = v_requester_id;
    v_requester_name := COALESCE(v_requester_name, v_order.borrower_name, 'ผู้ขอยืม');

    SELECT COUNT(*)
      INTO v_item_count
    FROM public.checkout_items
    WHERE checkout_order_id = v_order.id;

    SELECT array_agg(pr.id)
      INTO v_recipients
    FROM public.profiles pr
    WHERE pr.status = 'active'
      AND (v_requester_id IS NULL OR pr.id <> v_requester_id)
      AND (public.has_permission(pr.id, 'checkouts.approve') OR public.is_checkout_delegate(pr.id));

    PERFORM public.push_notifications(
      v_recipients,
      'checkout.submitted',
      'คำขอยืมใหม่',
      v_requester_name || ' ส่งคำขอยืม ' || v_order.order_number || ' จำนวน ' || v_item_count || ' รายการ รอการอนุมัติ',
      '/checkouts',
      v_order.id,
      v_order.project_id,
      jsonb_build_object(
        'request_no', v_order.order_number,
        'project_name', COALESCE(v_order.project_name, ''),
        'project_code', COALESCE(v_order.project_code, ''),
        'item_count', v_item_count
      )
    );
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_stock_in_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_item_count INTEGER;
  v_total_qty INTEGER;
  v_recipients UUID[];
BEGIN
  FOR v_order IN
    SELECT o.id, o.project_id, o.created_by, o.supplier,
           p.name AS project_name, p.project_code
    FROM public.stock_in_orders o
    JOIN (SELECT DISTINCT order_id FROM inserted_items) i ON i.order_id = o.id
    LEFT JOIN public.projects p ON p.id = o.project_id
  LOOP
    SELECT COUNT(*), COALESCE(SUM(quantity), 0)
      INTO v_item_count, v_total_qty
    FROM public.stock_in_items
    WHERE order_id = v_order.id;

    SELECT array_agg(pr.id)
      INTO v_recipients
    FROM public.profiles pr
    WHERE pr.status = 'active'
      AND (v_order.created_by IS NULL OR pr.id <> v_order.created_by)
      AND (public.has_permission(pr.id, 'inventory.manage') OR public.has_permission(pr.id, 'stock_in.create'));

    PERFORM public.push_notifications(
      v_recipients,
      'stock.received',
      'รับพัสดุเข้าคลัง',
      'รับพัสดุ ' || v_item_count || ' รายการ (รวม ' || v_total_qty || ' ชิ้น) เข้าโครงการ ' || COALESCE(NULLIF(v_order.project_name, ''), '-'),
      '/stock-in',
      v_order.id,
      v_order.project_id,
      jsonb_build_object(
        'item_count', v_item_count,
        'total_qty', v_total_qty,
        'project_name', COALESCE(v_order.project_name, ''),
        'project_code', COALESCE(v_order.project_code, ''),
        'supplier', COALESCE(v_order.supplier, '')
      )
    );
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_withdrawal_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_project_name TEXT := '';
  v_request_no TEXT;
  v_event_type TEXT;
  v_title TEXT;
  v_message TEXT;
  v_item_count INTEGER := 0;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.requested_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(name, '')
    INTO v_project_name
  FROM public.projects
  WHERE id = NEW.project_id;

  SELECT COUNT(*)
    INTO v_item_count
  FROM public.withdrawal_items
  WHERE order_id = NEW.id;

  v_request_no := COALESCE(NULLIF(BTRIM(NEW.work_order_no), ''), 'WO-' || UPPER(LEFT(NEW.id::TEXT, 8)));

  CASE NEW.status
    WHEN 'approved' THEN
      v_event_type := 'withdrawal.approved';
      v_title := 'คำขอเบิกได้รับการอนุมัติ';
      v_message := 'คำขอ ' || v_request_no || ' สำหรับโครงการ ' || COALESCE(NULLIF(v_project_name, ''), '-') || ' กำลังรอจ่ายวัสดุ';
    WHEN 'rejected' THEN
      v_event_type := 'withdrawal.rejected';
      v_title := 'คำขอเบิกไม่ได้รับการอนุมัติ';
      v_message := 'คำขอ ' || v_request_no || ' ถูกปฏิเสธ' || CASE WHEN COALESCE(NEW.reject_reason, '') <> '' THEN ': ' || NEW.reject_reason ELSE '' END;
    WHEN 'completed' THEN
      v_event_type := 'withdrawal.completed';
      v_title := 'จ่ายวัสดุเรียบร้อยแล้ว';
      v_message := 'คำขอ ' || v_request_no || ' สำหรับโครงการ ' || COALESCE(NULLIF(v_project_name, ''), '-') || ' ได้รับการจ่ายวัสดุแล้ว';
    ELSE
      RETURN NEW;
  END CASE;

  PERFORM public.push_notifications(
    ARRAY[NEW.requested_by],
    v_event_type,
    v_title,
    v_message,
    '/withdrawals',
    NEW.id,
    NEW.project_id,
    jsonb_build_object(
      'request_no', v_request_no,
      'project_name', v_project_name,
      'item_count', v_item_count
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_withdrawal_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_requester_name TEXT;
  v_item_count INTEGER;
  v_request_no TEXT;
  v_recipients UUID[];
BEGIN
  FOR v_order IN
    SELECT o.id, o.project_id, o.requested_by, o.work_order_no,
           p.name AS project_name, p.project_code
    FROM public.withdrawal_orders o
    JOIN (SELECT DISTINCT order_id FROM inserted_items) i ON i.order_id = o.id
    LEFT JOIN public.projects p ON p.id = o.project_id
    WHERE o.status = 'pending'
  LOOP
    SELECT COALESCE(full_name, 'ผู้ขอเบิก')
      INTO v_requester_name
    FROM public.profiles
    WHERE id = v_order.requested_by;

    SELECT COUNT(*)
      INTO v_item_count
    FROM public.withdrawal_items
    WHERE order_id = v_order.id;

    v_request_no := COALESCE(NULLIF(BTRIM(v_order.work_order_no), ''), 'WO-' || UPPER(LEFT(v_order.id::TEXT, 8)));

    SELECT array_agg(pr.id)
      INTO v_recipients
    FROM public.profiles pr
    WHERE pr.status = 'active'
      AND (v_order.requested_by IS NULL OR pr.id <> v_order.requested_by)
      AND public.has_permission(pr.id, 'withdrawals.approve');

    PERFORM public.push_notifications(
      v_recipients,
      'withdrawal.submitted',
      'คำขอเบิกใหม่',
      COALESCE(v_requester_name, 'ผู้ขอเบิก') || ' ส่งคำขอเบิก ' || v_request_no || ' จำนวน ' || v_item_count || ' รายการ',
      '/withdrawals',
      v_order.id,
      v_order.project_id,
      jsonb_build_object(
        'request_no', v_request_no,
        'project_name', COALESCE(v_order.project_name, ''),
        'project_code', COALESCE(v_order.project_code, ''),
        'item_count', v_item_count
      )
    );
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_checkout_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_project_id UUID;
  v_borrower_id UUID;
  v_borrower_type TEXT;
  v_borrower_name TEXT;
  v_borrower_phone TEXT;
  v_borrower_department TEXT;
  v_borrow_type TEXT;
  v_expected_return_date DATE;
  v_purpose TEXT;
  v_notes TEXT;
  v_items JSONB;
  v_order_number TEXT;
  v_order_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_qty NUMERIC;
  v_serial TEXT;
  v_condition TEXT;
  v_avail NUMERIC;
  v_item_name TEXT;
  v_borrower_profile RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.create')
    OR public.is_super_admin(v_caller_id)
    OR public.is_checkout_delegate(v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.create permission.';
  END IF;

  v_project_id := NULLIF(p_payload->>'project_id', '')::UUID;
  v_borrower_type := COALESCE(NULLIF(TRIM(p_payload->>'borrower_type'), ''), 'profile');
  v_borrow_type := COALESCE(NULLIF(TRIM(p_payload->>'borrow_type'), ''), 'standard');
  v_expected_return_date := NULLIF(p_payload->>'expected_return_date', '')::DATE;
  v_purpose := NULLIF(TRIM(COALESCE(p_payload->>'purpose', '')), '');
  v_notes := NULLIF(TRIM(COALESCE(p_payload->>'notes', '')), '');
  v_items := p_payload->'items';

  IF v_borrower_type NOT IN ('profile', 'external') THEN
    RAISE EXCEPTION 'ประเภทผู้ยืมไม่ถูกต้อง (ต้องเป็น profile หรือ external)';
  END IF;

  IF v_borrower_type = 'external' THEN
    IF NOT public.is_checkout_delegate(v_caller_id) THEN
      RAISE EXCEPTION 'Permission denied: only ADMIN or SUPER can checkout for a person outside the system.';
    END IF;

    v_borrower_id := NULL;
    v_borrower_name := TRIM(COALESCE(p_payload->>'borrower_name', ''));
    v_borrower_phone := NULLIF(TRIM(COALESCE(p_payload->>'borrower_phone', '')), '');
    v_borrower_department := NULLIF(TRIM(COALESCE(p_payload->>'borrower_department', '')), '');
  ELSE
    v_borrower_id := NULLIF(p_payload->>'borrower_id', '')::UUID;
    v_borrower_id := COALESCE(v_borrower_id, v_caller_id);

    IF v_borrower_id <> v_caller_id AND NOT public.is_checkout_delegate(v_caller_id) THEN
      RAISE EXCEPTION 'Permission denied: regular users may only checkout for their own account.';
    END IF;

    SELECT
      p.id,
      p.full_name,
      p.phone,
      p.department,
      p.status
    INTO v_borrower_profile
    FROM public.profiles p
    WHERE p.id = v_borrower_id;

    IF NOT FOUND OR v_borrower_profile.status <> 'active' THEN
      RAISE EXCEPTION 'The selected checkout user is not an active user.';
    END IF;

    -- Never trust client-provided name/phone; use the selected profile as source of truth.
    v_borrower_name := TRIM(COALESCE(v_borrower_profile.full_name, ''));
    v_borrower_phone := NULLIF(TRIM(COALESCE(v_borrower_profile.phone, '')), '');
    v_borrower_department := NULLIF(
      TRIM(COALESCE(NULLIF(TRIM(p_payload->>'borrower_department'), ''), v_borrower_profile.department, '')),
      ''
    );
  END IF;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุโครงการหรือคลังสินค้าต้นทาง';
  END IF;

  IF v_borrower_name = '' THEN
    IF v_borrower_type = 'external' THEN
      RAISE EXCEPTION 'กรุณาระบุชื่อบุคคลภายนอกระบบ';
    ELSE
      RAISE EXCEPTION 'ไม่พบชื่อผู้ยืมในข้อมูลบัญชี';
    END IF;
  END IF;

  IF v_borrow_type = 'standard' THEN
    IF v_expected_return_date IS NULL THEN
      RAISE EXCEPTION 'กรุณาระบุกำหนดวันส่งคืน';
    END IF;
  ELSIF v_borrow_type = 'indefinite' THEN
    v_expected_return_date := NULL;
  ELSE
    RAISE EXCEPTION 'ประเภทการยืมไม่ถูกต้อง (ต้องเป็น standard หรือ indefinite)';
  END IF;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'ต้องมีรายการวัสดุ/เครื่องมืออย่างน้อย 1 รายการ';
  END IF;

  -- Validate the current balance before any order rows or ledger entries are written.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_item_id := NULLIF(v_item->>'item_id', '')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;

    IF v_item_id IS NULL THEN
      RAISE EXCEPTION 'พบรายการที่ไม่ระบุรหัสวัสดุ (Item ID is missing)';
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'จำนวนที่ขอยืมต้องมากกว่า 0';
    END IF;

    SELECT name INTO v_item_name
    FROM public.items
    WHERE id = v_item_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ไม่พบข้อมูลรายการวัสดุ ID: %', v_item_id;
    END IF;

    SELECT balance INTO v_avail
    FROM public.stock_balance
    WHERE project_id = v_project_id AND item_id = v_item_id;

    IF COALESCE(v_avail, 0) < v_qty THEN
      RAISE EXCEPTION 'ยอดสต็อกคงเหลือในโครงการไม่เพียงพอสำหรับ "%" (คงเหลือ % ชิ้น, ต้องการยืม % ชิ้น)',
        v_item_name, COALESCE(v_avail, 0), v_qty;
    END IF;
  END LOOP;

  v_order_number := 'CHK-' || to_char(now(), 'YYYYMM') || '-' || lpad(floor(random() * 9000 + 1000)::TEXT, 4, '0');

  INSERT INTO public.checkout_orders (
    order_number,
    project_id,
    borrower_id,
    borrower_name,
    borrower_phone,
    borrower_department,
    checkout_date,
    expected_return_date,
    borrow_type,
    status,
    purpose,
    notes,
    created_by
  ) VALUES (
    v_order_number,
    v_project_id,
    v_borrower_id,
    v_borrower_name,
    v_borrower_phone,
    v_borrower_department,
    now(),
    v_expected_return_date,
    v_borrow_type,
    'active',
    v_purpose,
    v_notes,
    v_caller_id
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_serial := NULLIF(TRIM(COALESCE(v_item->>'serial_number', '')), '');
    v_condition := COALESCE(NULLIF(TRIM(v_item->>'condition'), ''), 'normal');

    INSERT INTO public.checkout_items (
      checkout_order_id,
      item_id,
      serial_number,
      quantity_borrowed,
      quantity_returned,
      condition_on_checkout,
      status,
      notes
    ) VALUES (
      v_order_id,
      v_item_id,
      v_serial,
      v_qty,
      0,
      v_condition,
      'borrowed',
      NULLIF(TRIM(COALESCE(v_item->>'notes', '')), '')
    );

    INSERT INTO public.stock_transactions (
      project_id,
      item_id,
      transaction_type,
      quantity,
      reference_id,
      reference_type,
      created_by,
      notes
    ) VALUES (
      v_project_id,
      v_item_id,
      'checkout_out',
      v_qty,
      v_order_id,
      'checkout_order',
      v_caller_id,
      'ยืมอุปกรณ์: คำสั่งยืม ' || v_order_number
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'borrower_type', v_borrower_type,
    'borrower_id', v_borrower_id,
    'borrow_type', v_borrow_type,
    'message', 'สร้างคำสั่งยืม ' || v_order_number || ' สำเร็จเรียบร้อย'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_item_transfer(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN public.process_item_transfer(
    (p_payload->>'source_project_id')::UUID,
    (p_payload->>'dest_project_id')::UUID,
    (p_payload->>'item_id')::UUID,
    (p_payload->>'quantity')::NUMERIC,
    p_payload->>'notes',
    NULLIF(p_payload->>'actor_id', '')::UUID
  );
END;
$$;

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
  v_caller_id UUID := auth.uid();
  v_item RECORD;
  v_source_project RECORD;
  v_dest_project RECORD;
  v_source_balance NUMERIC;
  v_transfer_order_id UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'items.transfer') OR
    public.has_permission(v_caller_id, 'inventory.transfer') OR
    public.has_permission(v_caller_id, 'inventory.manage') OR
    public.is_super_admin(v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires item transfer permission.';
  END IF;

  IF p_source_project_id IS NULL OR p_dest_project_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุคลังต้นทางและคลังปลายทางให้ครบถ้วน';
  END IF;

  IF p_source_project_id = p_dest_project_id THEN
    RAISE EXCEPTION 'คลังต้นทางและคลังปลายทางต้องไม่เป็นสถานที่เดียวกัน';
  END IF;

  IF p_item_id IS NULL OR p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'รายการวัสดุและจำนวนที่โอนต้องถูกต้อง';
  END IF;

  -- Lock and validate the canonical master. No INSERT/UPDATE is performed on
  -- public.items, so the item id and its Parent/Child relationship survive.
  SELECT * INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND OR NULLIF(BTRIM(v_item.name), '') IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลรายการวัสดุในระบบ (ID: %)', p_item_id;
  END IF;

  SELECT * INTO v_source_project
  FROM public.projects
  WHERE id = p_source_project_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคลัง/โครงการต้นทาง หรือไม่ได้อยู่ในสถานะใช้งาน';
  END IF;

  SELECT * INTO v_dest_project
  FROM public.projects
  WHERE id = p_dest_project_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคลัง/โครงการปลายทาง หรือไม่ได้อยู่ในสถานะใช้งาน';
  END IF;

  SELECT COALESCE(balance, 0) INTO v_source_balance
  FROM public.stock_balance
  WHERE project_id = p_source_project_id AND item_id = p_item_id;

  IF v_source_balance < p_quantity THEN
    RAISE EXCEPTION 'ยอดคงเหลือที่คลังต้นทางไม่เพียงพอ (คงเหลือ %, ต้องการโอน %)',
      v_source_balance, p_quantity;
  END IF;

  -- Outbound ledger entry. The quantity remains positive because stock_balance
  -- interprets transfer_out as an outbound movement.
  INSERT INTO public.stock_transactions (
    project_id, item_id, quantity, transaction_type,
    reference_type, reference_id, notes, created_by
  ) VALUES (
    p_source_project_id, p_item_id, p_quantity, 'transfer_out',
    'warehouse_transfer', NULL,
    'โอนย้ายไปยัง: ' || v_dest_project.name || COALESCE(' | ' || NULLIF(BTRIM(p_notes), ''), ''),
    v_caller_id
  );

  -- Create one destination allocation using the same item_id. The copied
  -- fields are transaction-line metadata only; the master remains authoritative.
  INSERT INTO public.stock_in_orders (
    project_id, supplier, notes, received_date, created_by
  ) VALUES (
    p_dest_project_id,
    'Warehouse Transfer',
    'รับโอนจาก: ' || v_source_project.name || COALESCE(' | ' || NULLIF(BTRIM(p_notes), ''), ''),
    CURRENT_DATE,
    v_caller_id
  ) RETURNING id INTO v_transfer_order_id;

  INSERT INTO public.stock_in_items (
    order_id, item_id, quantity, model, item_type,
    parent_id, parent_sku, seq_no, notes
  ) VALUES (
    v_transfer_order_id,
    v_item.id,
    p_quantity,
    v_item.model,
    v_item.item_type,
    v_item.parent_id,
    v_item.parent_sku,
    v_item.seq_no,
    'รับโอนจาก: ' || v_source_project.name
  );

  RETURN jsonb_build_object(
    'success', true,
    'item_id', v_item.id,
    'item_name', v_item.name,
    'item_type', v_item.item_type,
    'parent_id', v_item.parent_id,
    'parent_sku', v_item.parent_sku,
    'transferred_quantity', p_quantity,
    'source_project', v_source_project.name,
    'destination_project', v_dest_project.name,
    'transfer_order_id', v_transfer_order_id,
    'message', 'โอนย้าย ' || v_item.name || ' สำเร็จ'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_return_order(p_payload JSONB) ... ;
--       -- คืนนิยามเวอร์ชัน 65_security_and_reliability_remediation.sql (บรรทัด 347-517)
--     ALTER TABLE public.checkout_return_logs
--       DROP CONSTRAINT IF EXISTS checkout_return_logs_item_condition_check;
--     ALTER TABLE public.checkout_return_logs
--       ADD CONSTRAINT checkout_return_logs_item_condition_check
--       CHECK (item_condition IN ('normal','damaged','lost','needs_repair'));
--   COMMIT;
--   หมายเหตุ: คอลัมน์ quantity_consumed / replaced_serial_number เป็น additive
--   ห้าม DROP หากมีข้อมูล 'consumed' ถูกบันทึกแล้ว

BEGIN;

-- ---------------------------------------------------------------------------
-- 1.1 checkout_items.quantity_consumed
-- ---------------------------------------------------------------------------
ALTER TABLE public.checkout_items
  ADD COLUMN IF NOT EXISTS quantity_consumed NUMERIC NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.checkout_items'::regclass
      AND conname = 'checkout_items_quantity_consumed_check'
  ) THEN
    ALTER TABLE public.checkout_items
      ADD CONSTRAINT checkout_items_quantity_consumed_check
      CHECK (quantity_consumed >= 0) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.checkout_items
  VALIDATE CONSTRAINT checkout_items_quantity_consumed_check;

-- ---------------------------------------------------------------------------
-- 1.2 checkout_return_logs.replaced_serial_number
-- ---------------------------------------------------------------------------
ALTER TABLE public.checkout_return_logs
  ADD COLUMN IF NOT EXISTS replaced_serial_number TEXT;

-- ---------------------------------------------------------------------------
-- 1.3 ขยาย CHECK item_condition ให้รวม 'consumed'
--     ชื่อ constraint ถูกค้นจาก pg_constraint แทนการเดา (DDL เดิมอยู่แค่ archive/44)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_connames TEXT[];
BEGIN
  -- เลือกเฉพาะ CHECK constraint ที่อ้างคอลัมน์ item_condition จริง (ไม่เดาจากชื่อ)
  SELECT array_agg(c.conname ORDER BY c.conname) INTO v_connames
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'public.checkout_return_logs'::regclass
    AND c.contype = 'c'
    AND a.attname = 'item_condition';

  IF v_connames IS NULL OR array_length(v_connames, 1) = 0 THEN
    RAISE EXCEPTION
      'Expected CHECK constraint on public.checkout_return_logs.item_condition was not found';
  END IF;

  IF array_length(v_connames, 1) > 1 THEN
    RAISE EXCEPTION
      'Multiple CHECK constraints reference checkout_return_logs.item_condition (%): review manually before applying',
      array_to_string(v_connames, ', ');
  END IF;

  EXECUTE format('ALTER TABLE public.checkout_return_logs DROP CONSTRAINT %I', v_connames[1]);
END;
$$;

ALTER TABLE public.checkout_return_logs
  ADD CONSTRAINT checkout_return_logs_item_condition_check
  CHECK (
    item_condition IN ('normal', 'damaged', 'lost', 'needs_repair', 'consumed')
  ) NOT VALID;

ALTER TABLE public.checkout_return_logs
  VALIDATE CONSTRAINT checkout_return_logs_item_condition_check;

-- ---------------------------------------------------------------------------
-- 1.4 process_return_order รองรับ 'consumed'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_return_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_order_id UUID;
  v_returns JSONB;
  v_ret JSONB;
  v_checkout_item_id UUID;
  v_return_qty NUMERIC;
  v_condition TEXT;
  v_dest_project_id UUID;
  v_damage_notes TEXT;
  v_replaced_serial TEXT;
  v_checkout_item RECORD;
  v_order RECORD;
  v_all_returned BOOLEAN := true;
  v_new_returned_total NUMERIC;
  v_new_damaged_total NUMERIC;
  v_new_lost_total NUMERIC;
  v_new_consumed_total NUMERIC;
  v_transfer_order_id UUID;
  v_dest_project_name TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_caller_id, 'checkouts.return') OR public.is_super_admin(v_caller_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.return permission.';
  END IF;

  v_order_id := (p_payload->>'order_id')::UUID;
  v_returns := p_payload->'returns';

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรหัสคำสั่งยืมพัสดุ';
  END IF;

  IF v_returns IS NULL OR jsonb_array_length(v_returns) = 0 THEN
    RAISE EXCEPTION 'กรุณาระบุรายการอุปกรณ์ที่ต้องการรับคืน';
  END IF;

  SELECT * INTO v_order FROM public.checkout_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคำสั่งยืมพัสดุ ID: %', v_order_id;
  END IF;

  IF v_order.status NOT IN ('active', 'partial_returned', 'overdue') THEN
    RAISE EXCEPTION 'ไม่สามารถรับคืนได้: คำสั่งยืมอยู่ในสถานะ %', v_order.status;
  END IF;

  FOR v_ret IN SELECT * FROM jsonb_array_elements(v_returns)
  LOOP
    v_checkout_item_id := (v_ret->>'checkout_item_id')::UUID;
    v_return_qty := (v_ret->>'returned_quantity')::NUMERIC;
    v_condition := COALESCE(NULLIF(TRIM(v_ret->>'condition'), ''), 'normal');
    v_dest_project_id := COALESCE(NULLIF(v_ret->>'destination_project_id', '')::UUID, v_order.project_id);
    v_damage_notes := NULLIF(TRIM(COALESCE(v_ret->>'damage_notes', '')), '');
    v_replaced_serial := NULLIF(TRIM(COALESCE(v_ret->>'replaced_serial_number', '')), '');

    IF v_condition NOT IN ('normal', 'damaged', 'lost', 'needs_repair', 'consumed') THEN
      RAISE EXCEPTION 'สภาพรับคืนไม่ถูกต้อง: %', v_condition;
    END IF;

    SELECT * INTO v_checkout_item 
    FROM public.checkout_items 
    WHERE id = v_checkout_item_id AND checkout_order_id = v_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ไม่พบรายการอุปกรณ์ที่ยืม ID: % ในคำสั่งยืมนี้', v_checkout_item_id;
    END IF;

    IF v_return_qty IS NULL OR v_return_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_condition = 'consumed' THEN
      -- ต้องมีเหตุผล/จุดติดตั้งเสมอ เพื่อให้ตรวจสอบย้อนหลังได้
      IF v_damage_notes IS NULL THEN
        RAISE EXCEPTION 'กรุณาระบุเหตุผล/จุดติดตั้งที่นำไปใช้งานทดแทน';
      END IF;

      IF v_replaced_serial IS NOT NULL AND char_length(v_replaced_serial) > 100 THEN
        RAISE EXCEPTION 'หมายเลขเครื่อง (S/N) ที่ถูกทดแทนยาวเกิน 100 ตัวอักษร';
      END IF;
    ELSE
      v_replaced_serial := NULL;
    END IF;

    IF (v_checkout_item.quantity_returned + v_checkout_item.quantity_damaged + v_checkout_item.quantity_lost + v_checkout_item.quantity_consumed + v_return_qty) > v_checkout_item.quantity_borrowed THEN
      RAISE EXCEPTION 'จำนวนที่รับคืนรวมเกินกว่าจำนวนที่ยืมไป (ยืม: %, รับคืนแล้ว: %, ต้องการคืนเพิ่ม: %)',
        v_checkout_item.quantity_borrowed,
        (v_checkout_item.quantity_returned + v_checkout_item.quantity_damaged + v_checkout_item.quantity_lost + v_checkout_item.quantity_consumed),
        v_return_qty;
    END IF;

    -- Insert Return Log
    INSERT INTO public.checkout_return_logs (
      checkout_order_id, checkout_item_id, returned_quantity,
      item_condition, destination_project_id, received_by, returned_at,
      damage_notes, replaced_serial_number
    ) VALUES (
      v_order_id, v_checkout_item_id, v_return_qty, v_condition, v_dest_project_id, v_caller_id, now(),
      v_damage_notes, v_replaced_serial
    );

    IF v_condition = 'normal' THEN
      v_new_returned_total := v_checkout_item.quantity_returned + v_return_qty;
      v_new_damaged_total := v_checkout_item.quantity_damaged;
      v_new_lost_total := v_checkout_item.quantity_lost;
      v_new_consumed_total := v_checkout_item.quantity_consumed;

      IF v_dest_project_id = v_order.project_id THEN
        -- Return to the same project
        INSERT INTO public.stock_transactions (
          project_id, item_id, transaction_type, quantity, reference_id, reference_type, created_by, notes
        ) VALUES (
          v_dest_project_id, v_checkout_item.item_id, 'return_in', v_return_qty, v_order_id, 'checkout_return', v_caller_id,
          'รับคืนอุปกรณ์จากการยืม: คำสั่งยืม ' || v_order.order_number
        );
      ELSE
        -- Returned to a different project: credit dest project via stock_in so view reflects accurately
        SELECT name INTO v_dest_project_name FROM public.projects WHERE id = v_dest_project_id;

        INSERT INTO public.stock_in_orders (
          project_id, supplier, notes, received_date, created_by
        ) VALUES (
          v_dest_project_id, 'Checkout Return from ' || v_order.order_number,
          'รับคืนอุปกรณ์จากการยืม ' || v_order.order_number || ' (ข้ามโครงการ)',
          CURRENT_DATE, v_caller_id
        ) RETURNING id INTO v_transfer_order_id;

        INSERT INTO public.stock_in_items (
          order_id, item_id, quantity, notes
        ) VALUES (
          v_transfer_order_id, v_checkout_item.item_id, v_return_qty,
          'รับคืนอุปกรณ์จากการยืม ' || v_order.order_number
        );

        INSERT INTO public.stock_transactions (
          project_id, item_id, transaction_type, quantity, reference_id, reference_type, created_by, notes
        ) VALUES (
          v_dest_project_id, v_checkout_item.item_id, 'stock_in', v_return_qty, v_order_id, 'checkout_return', v_caller_id,
          'รับคืนอุปกรณ์จากการยืม ' || v_order.order_number || ' สู่โครงการ ' || COALESCE(v_dest_project_name, '')
        );
      END IF;
    ELSIF v_condition IN ('damaged', 'needs_repair') THEN
      v_new_returned_total := v_checkout_item.quantity_returned;
      v_new_damaged_total := v_checkout_item.quantity_damaged + v_return_qty;
      v_new_lost_total := v_checkout_item.quantity_lost;
      v_new_consumed_total := v_checkout_item.quantity_consumed;
    ELSIF v_condition = 'lost' THEN
      v_new_returned_total := v_checkout_item.quantity_returned;
      v_new_damaged_total := v_checkout_item.quantity_damaged;
      v_new_lost_total := v_checkout_item.quantity_lost + v_return_qty;
      v_new_consumed_total := v_checkout_item.quantity_consumed;
    ELSIF v_condition = 'consumed' THEN
      -- นำไปใช้งานทดแทน: สต็อกถูกตัดไปแล้วตอนอนุมัติยืม จึงไม่ต้องมี stock movement
      v_new_returned_total := v_checkout_item.quantity_returned;
      v_new_damaged_total := v_checkout_item.quantity_damaged;
      v_new_lost_total := v_checkout_item.quantity_lost;
      v_new_consumed_total := v_checkout_item.quantity_consumed + v_return_qty;
    END IF;

    UPDATE public.checkout_items SET
      quantity_returned = v_new_returned_total,
      quantity_damaged = v_new_damaged_total,
      quantity_lost = v_new_lost_total,
      quantity_consumed = v_new_consumed_total,
      status = CASE 
        WHEN (v_new_returned_total + v_new_damaged_total + v_new_lost_total + v_new_consumed_total) >= quantity_borrowed THEN 'returned'
        ELSE 'borrowed'
      END
    WHERE id = v_checkout_item_id;
  END LOOP;

  -- Check if all items in the order have been returned/accounted for
  FOR v_checkout_item IN SELECT * FROM public.checkout_items WHERE checkout_order_id = v_order_id
  LOOP
    IF (v_checkout_item.quantity_returned + v_checkout_item.quantity_damaged + v_checkout_item.quantity_lost + v_checkout_item.quantity_consumed) < v_checkout_item.quantity_borrowed THEN
      v_all_returned := false;
    END IF;
  END LOOP;

  IF v_all_returned THEN
    UPDATE public.checkout_orders 
    SET status = 'completed', actual_returned_date = now() 
    WHERE id = v_order_id;
  ELSE
    UPDATE public.checkout_orders 
    SET status = 'partial_returned' 
    WHERE id = v_order_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'completed', v_all_returned,
    'message', CASE WHEN v_all_returned THEN 'รับคืนอุปกรณ์ครบถ้วนเรียบร้อยแล้ว' ELSE 'บันทึกการรับคืนบางส่วนสำเร็จ' END
  );
END;
$$;

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

  -- 1. Insert order record
  INSERT INTO public.stock_in_orders (
    project_id, supplier, po_number, notes, received_date, created_by
  ) VALUES (
    p_project_id, p_supplier, p_po_number, p_notes, CURRENT_DATE, v_user_id
  ) RETURNING id INTO v_order_id;

  -- 2. Process each item
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

    -- Auto-resolve item_id by SKU or Name if null
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

    -- Resolve parent_id from parent_sku if needed
    IF v_parent_id IS NULL AND v_parent_sku IS NOT NULL THEN
      SELECT id INTO v_parent_id FROM public.items WHERE LOWER(sku) = LOWER(v_parent_sku) LIMIT 1;
    END IF;

    -- Sync model to items table if needed
    IF v_model IS NOT NULL AND TRIM(v_model) != '' THEN
      UPDATE public.items 
      SET model = TRIM(v_model), updated_at = NOW() 
      WHERE id = v_item_id AND (model IS NULL OR model = '' OR model = '-');
    END IF;

    -- Insert into stock_in_items (matching exact active schema)
    INSERT INTO public.stock_in_items (
      order_id,
      item_id,
      quantity,
      unit_price,
      delivery_to,
      serial_number,
      part_number,
      model,
      item_type,
      parent_id,
      parent_sku,
      seq_no,
      notes
    ) VALUES (
      v_order_id,
      v_item_id,
      v_qty,
      v_unit_price,
      v_delivery_to,
      v_serial_number,
      v_part_number,
      v_model,
      v_item_type,
      v_parent_id,
      v_parent_sku,
      v_seq_no,
      v_item_notes
    );

    -- Insert into stock_transactions (matching exact active schema)
    INSERT INTO public.stock_transactions (
      project_id,
      item_id,
      quantity,
      transaction_type,
      reference_type,
      reference_id,
      notes,
      created_by
    ) VALUES (
      p_project_id,
      v_item_id,
      v_qty,
      'stock_in',
      'stock_in_order',
      v_order_id,
      v_item_notes,
      v_user_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Stock in recorded successfully with hierarchy support.',
    'order_id', v_order_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.push_notifications(
  p_user_ids UUID[],
  p_event_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_target_path TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Notifications are a side effect: a failure here must never abort the
  -- business transaction that fired the trigger (stock movement, approval...).
  -- Failures are surfaced as a greppable WARNING in the database log instead.
  BEGIN
    INSERT INTO public.notifications (
      user_id, event_type, title, message, target_path, reference_id, project_id, metadata
    )
    SELECT DISTINCT
      u.user_id,
      p_event_type,
      p_title,
      p_message,
      p_target_path,
      p_reference_id,
      p_project_id,
      COALESCE(p_metadata, '{}'::jsonb)
    FROM unnest(p_user_ids) AS u(user_id)
    JOIN public.profiles pr
      ON pr.id = u.user_id
     AND pr.status = 'active'
    ON CONFLICT (user_id, event_type, reference_id) DO UPDATE SET
      title = EXCLUDED.title,
      message = EXCLUDED.message,
      target_path = EXCLUDED.target_path,
      project_id = EXCLUDED.project_id,
      metadata = EXCLUDED.metadata,
      created_at = EXCLUDED.created_at,
      read_at = NULL;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[notifications] push_notifications skipped event % reference % -> SQLSTATE % / %',
        p_event_type, p_reference_id, SQLSTATE, SQLERRM;
      RETURN -1;
  END;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_checkout_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_order_id UUID;
  v_order RECORD;
  v_reason TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (
    public.has_permission(v_caller_id, 'checkouts.approve')
    OR public.is_super_admin(v_caller_id)
    OR public.is_checkout_delegate(v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Requires checkouts.approve permission.';
  END IF;

  v_order_id := NULLIF(p_payload->>'order_id', '')::UUID;
  v_reason := NULLIF(TRIM(COALESCE(p_payload->>'rejection_reason', '')), '');

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุรหัสคำขอยืม (order_id is required)';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุเหตุผลในการปฏิเสธคำขอยืม';
  END IF;

  -- Lock order row
  SELECT * INTO v_order 
  FROM public.checkout_orders 
  WHERE id = v_order_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลคำขอยืมพัสดุ ID: %', v_order_id;
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติ (สถานะปัจจุบัน: %)', v_order.status;
  END IF;

  -- Update checkout_orders status to rejected
  UPDATE public.checkout_orders
  SET 
    status = 'rejected',
    rejected_by = v_caller_id,
    rejected_at = now(),
    rejection_reason = v_reason
  WHERE id = v_order_id;

  -- Update line items status to rejected
  UPDATE public.checkout_items
  SET status = 'rejected'
  WHERE checkout_order_id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order.order_number,
    'status', 'rejected',
    'rejected_by', v_caller_id,
    'rejected_at', now(),
    'message', 'ปฏิเสธคำขอยืม ' || v_order.order_number || ' เรียบร้อยแล้ว'
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
  v_user_id UUID := auth.uid();
  v_order RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
  END IF;

  IF NOT (public.has_permission(v_user_id, 'withdrawals.reject') OR 
          public.has_permission(v_user_id, 'inventory.approve') OR 
          public.is_super_admin(v_user_id)) THEN
    RAISE EXCEPTION 'Unauthorized: Requires withdrawals.reject permission.';
  END IF;

  SELECT * INTO v_order FROM public.withdrawal_orders WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found: %', p_request_id;
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (current status: %)', v_order.status;
  END IF;

  UPDATE public.withdrawal_orders
  SET status = 'rejected',
      reject_reason = p_reject_reason,
      rejected_by = v_user_id,
      rejected_at = NOW(),
      updated_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_request_id,
    'status', 'rejected',
    'message', 'ปฏิเสธคำขอเรียบร้อยแล้ว'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_withdrawal_order(
  p_order_id UUID,
  p_reason TEXT DEFAULT 'Rejected by approver',
  p_rejecter_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN public.reject_inventory_request(p_order_id, p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_role_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_rec RECORD;
BEGIN
  -- If role_id is provided or changed, sync role string
  IF NEW.role_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.role_id IS DISTINCT FROM OLD.role_id) THEN
    SELECT id, code INTO v_role_rec FROM public.roles WHERE id = NEW.role_id;
    IF FOUND THEN
      NEW.role := LOWER(v_role_rec.code);
    END IF;
  -- If role string is provided or changed, sync role_id
  ELSIF NEW.role IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role OR NEW.role_id IS NULL) THEN
    SELECT id, code INTO v_role_rec FROM public.roles 
    WHERE code = UPPER(TRIM(NEW.role)) OR LOWER(TRIM(name)) = LOWER(TRIM(NEW.role))
    LIMIT 1;

    IF FOUND THEN
      NEW.role_id := v_role_rec.id;
      NEW.role := LOWER(v_role_rec.code);
    ELSE
      -- Fallback to STAFF role if unmatched
      SELECT id, code INTO v_role_rec FROM public.roles WHERE code = 'STAFF';
      IF FOUND THEN
        NEW.role_id := v_role_rec.id;
        NEW.role := 'staff';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
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

CREATE OR REPLACE FUNCTION public.transfer_item_warehouse(
  p_item_id UUID,
  p_source_project_id UUID,
  p_source_location_id UUID,
  p_dest_project_id UUID,
  p_dest_location_id UUID,
  p_quantity INTEGER,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_calling_user_id UUID;
  v_current_stock INTEGER;
  v_transfer_id UUID;
BEGIN
  v_calling_user_id := auth.uid();
  IF v_calling_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Authentication required.');
  END IF;

  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Quantity must be greater than 0.');
  END IF;

  IF p_source_project_id = p_dest_project_id AND p_source_location_id = p_dest_location_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Source and destination locations cannot be identical.');
  END IF;

  -- 1. Check Available Stock at Source
  SELECT COALESCE(SUM(quantity), 0) INTO v_current_stock
  FROM public.stock_transactions
  WHERE item_id = p_item_id
    AND project_id = p_source_project_id
    AND (storage_location_id = p_source_location_id OR (storage_location_id IS NULL AND p_source_location_id IS NULL));

  IF v_current_stock < p_quantity THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', format('Insufficient stock. Available: %s, Requested: %s', v_current_stock, p_quantity)
    );
  END IF;

  v_transfer_id := gen_random_uuid();

  -- 2. Deduct from Source
  INSERT INTO public.stock_transactions (
    project_id, storage_location_id, item_id, quantity, transaction_type,
    reference_type, reference_id, created_by, notes
  ) VALUES (
    p_source_project_id, p_source_location_id, p_item_id, -p_quantity, 'TRANSFER',
    'WAREHOUSE_TRANSFER_OUT', v_transfer_id, v_calling_user_id,
    COALESCE(p_notes, 'โอนย้ายออกไปยังคลังปลายทาง')
  );

  -- 3. Add to Destination
  INSERT INTO public.stock_transactions (
    project_id, storage_location_id, item_id, quantity, transaction_type,
    reference_type, reference_id, created_by, notes
  ) VALUES (
    p_dest_project_id, p_dest_location_id, p_item_id, p_quantity, 'TRANSFER',
    'WAREHOUSE_TRANSFER_IN', v_transfer_id, v_calling_user_id,
    COALESCE(p_notes, 'รับโอนย้ายเข้าจากคลังต้นทาง')
  );

  RETURN jsonb_build_object(
    'success', true,
    'transfer_id', v_transfer_id,
    'message', 'โอนย้ายสินค้าข้ามคลังสำเร็จ'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_check_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  -- Allow direct database migrations, background jobs, or service_role without JWT session
  IF auth.uid() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Check role/role_id modification: requires super_admin, users.update, or users.manage
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.role_id IS DISTINCT FROM OLD.role_id) THEN
    IF NOT (
      public.is_super_admin(auth.uid()) OR 
      public.has_permission(auth.uid(), 'users.update') OR 
      public.has_permission(auth.uid(), 'users.manage')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can modify user role or role_id.';
    END IF;
  END IF;

  -- Check status modification: requires super_admin, users.deactivate, users.update, or users.manage
  IF (NEW.status IS DISTINCT FROM OLD.status) THEN
    IF NOT (
      public.is_super_admin(auth.uid()) OR 
      public.has_permission(auth.uid(), 'users.deactivate') OR 
      public.has_permission(auth.uid(), 'users.update') OR 
      public.has_permission(auth.uid(), 'users.manage')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can modify account status.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- 8.3 Row level security policies
DROP POLICY IF EXISTS "Admin only mutate stock_transactions" ON public.stock_transactions;
DROP POLICY IF EXISTS "Allow admin delete site_bom_templates" ON public.site_bom_templates;
DROP POLICY IF EXISTS "Allow admin insert site_bom_templates" ON public.site_bom_templates;
DROP POLICY IF EXISTS "Allow admin modify role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Allow admin modify roles" ON public.roles;
DROP POLICY IF EXISTS "Allow admin modify site_bom_templates" ON public.site_bom_templates;
DROP POLICY IF EXISTS "Allow admin update site_bom_templates" ON public.site_bom_templates;
DROP POLICY IF EXISTS "Allow auth mutate checkout_extension_logs" ON public.checkout_extension_logs;
DROP POLICY IF EXISTS "Allow auth mutate checkout_items" ON public.checkout_items;
DROP POLICY IF EXISTS "Allow auth mutate checkout_orders" ON public.checkout_orders;
DROP POLICY IF EXISTS "Allow auth mutate checkout_return_logs" ON public.checkout_return_logs;
DROP POLICY IF EXISTS "Allow auth mutate items" ON public.items;
DROP POLICY IF EXISTS "Allow auth mutate profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow auth mutate stock_transactions" ON public.stock_transactions;
DROP POLICY IF EXISTS "Allow auth mutate withdrawal_items" ON public.withdrawal_items;
DROP POLICY IF EXISTS "Allow auth mutate withdrawal_orders" ON public.withdrawal_orders;
DROP POLICY IF EXISTS "Allow authenticated users to insert checkout_extension_logs" ON public.checkout_extension_logs;
DROP POLICY IF EXISTS "Allow authenticated users to read checkout_extension_logs" ON public.checkout_extension_logs;
DROP POLICY IF EXISTS "Allow read access to site_bom_templates" ON public.site_bom_templates;
DROP POLICY IF EXISTS "Allow read permissions" ON public.permissions;
DROP POLICY IF EXISTS "Allow read role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Allow read roles" ON public.roles;
DROP POLICY IF EXISTS "Allow self update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated Read Settings" ON public.system_settings;
DROP POLICY IF EXISTS "Authorized manage checkout_extension_logs" ON public.checkout_extension_logs;
DROP POLICY IF EXISTS "Authorized manage checkout_items" ON public.checkout_items;
DROP POLICY IF EXISTS "Authorized manage checkout_orders" ON public.checkout_orders;
DROP POLICY IF EXISTS "Authorized manage checkout_return_logs" ON public.checkout_return_logs;
DROP POLICY IF EXISTS "Authorized users mutate items" ON public.items;
DROP POLICY IF EXISTS "Managers can update withdrawal_items" ON public.withdrawal_items;
DROP POLICY IF EXISTS "Managers can update withdrawal_orders" ON public.withdrawal_orders;
DROP POLICY IF EXISTS "Update Settings Permission" ON public.system_settings;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert withdrawal_items" ON public.withdrawal_items;
DROP POLICY IF EXISTS "Users can insert withdrawal_orders" ON public.withdrawal_orders;
DROP POLICY IF EXISTS "Users can mark own notifications as read" ON public.notifications;
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "stock_adjustment_logs_insert" ON public.stock_adjustment_logs;
DROP POLICY IF EXISTS "stock_adjustment_logs_read" ON public.stock_adjustment_logs;
DROP POLICY IF EXISTS "Allow read access to site_bom_templates" ON public.site_bom_templates;
CREATE POLICY "Allow read access to site_bom_templates"
ON public.site_bom_templates FOR SELECT
TO authenticated, anon
USING (true);
DROP POLICY IF EXISTS "Allow admin insert site_bom_templates" ON public.site_bom_templates;
CREATE POLICY "Allow admin insert site_bom_templates"
ON public.site_bom_templates FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_site_bom());
DROP POLICY IF EXISTS "Allow admin update site_bom_templates" ON public.site_bom_templates;
CREATE POLICY "Allow admin update site_bom_templates"
ON public.site_bom_templates FOR UPDATE
TO authenticated
USING (public.can_manage_site_bom())
WITH CHECK (public.can_manage_site_bom());
DROP POLICY IF EXISTS "Allow admin delete site_bom_templates" ON public.site_bom_templates;
CREATE POLICY "Allow admin delete site_bom_templates"
ON public.site_bom_templates FOR DELETE
TO authenticated
USING (public.can_manage_site_bom());
DROP POLICY IF EXISTS "Allow read roles" ON public.roles;
CREATE POLICY "Allow read roles" ON public.roles FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "Allow admin modify roles" ON public.roles;
CREATE POLICY "Allow admin modify roles" ON public.roles FOR ALL TO authenticated USING (
public.has_permission(auth.uid(), 'roles.manage_permissions') OR
public.has_permission(auth.uid(), 'roles.update') OR
public.has_permission(auth.uid(), 'roles.create') OR
public.has_permission(auth.uid(), 'roles.delete')
);
DROP POLICY IF EXISTS "Allow read permissions" ON public.permissions;
CREATE POLICY "Allow read permissions" ON public.permissions FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "Allow read role_permissions" ON public.role_permissions;
CREATE POLICY "Allow read role_permissions" ON public.role_permissions FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "Allow admin modify role_permissions" ON public.role_permissions;
CREATE POLICY "Allow admin modify role_permissions" ON public.role_permissions FOR ALL TO authenticated USING (
public.has_permission(auth.uid(), 'roles.manage_permissions')
);
DROP POLICY IF EXISTS "Allow authenticated users to read checkout_extension_logs" ON public.checkout_extension_logs;
CREATE POLICY "Allow authenticated users to read checkout_extension_logs"
ON public.checkout_extension_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Allow authenticated users to insert checkout_extension_logs" ON public.checkout_extension_logs;
CREATE POLICY "Allow authenticated users to insert checkout_extension_logs"
ON public.checkout_extension_logs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "stock_adjustment_logs_read" ON public.stock_adjustment_logs;
CREATE POLICY "stock_adjustment_logs_read" ON public.stock_adjustment_logs
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "stock_adjustment_logs_insert" ON public.stock_adjustment_logs;
CREATE POLICY "stock_adjustment_logs_insert" ON public.stock_adjustment_logs
FOR INSERT TO authenticated
WITH CHECK (
public.has_permission(auth.uid(), 'items.adjust_stock')
OR public.has_permission(auth.uid(), 'items.update')
OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
DROP POLICY IF EXISTS "Authenticated Read Settings" ON public.system_settings;
CREATE POLICY "Authenticated Read Settings" ON public.system_settings
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Update Settings Permission" ON public.system_settings;
CREATE POLICY "Update Settings Permission" ON public.system_settings
FOR ALL TO authenticated
USING (public.has_permission(auth.uid(), 'settings.update'))
WITH CHECK (public.has_permission(auth.uid(), 'settings.update'));
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Admin only mutate stock_transactions" ON public.stock_transactions;
CREATE POLICY "Admin only mutate stock_transactions" ON public.stock_transactions
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "Authorized users mutate items" ON public.items;
CREATE POLICY "Authorized users mutate items" ON public.items
FOR ALL TO authenticated
USING (
public.is_super_admin(auth.uid()) OR
public.has_permission(auth.uid(), 'items.update') OR
public.has_permission(auth.uid(), 'items.create') OR
public.has_permission(auth.uid(), 'items.delete') OR
public.has_permission(auth.uid(), 'items.manage')
)
WITH CHECK (
public.is_super_admin(auth.uid()) OR
public.has_permission(auth.uid(), 'items.update') OR
public.has_permission(auth.uid(), 'items.create') OR
public.has_permission(auth.uid(), 'items.delete') OR
public.has_permission(auth.uid(), 'items.manage')
);
DROP POLICY IF EXISTS "Users can insert withdrawal_orders" ON public.withdrawal_orders;
CREATE POLICY "Users can insert withdrawal_orders" ON public.withdrawal_orders
FOR INSERT TO authenticated
WITH CHECK (
requested_by = auth.uid() OR
public.has_permission(auth.uid(), 'withdrawals.create') OR
public.is_super_admin(auth.uid())
);
DROP POLICY IF EXISTS "Managers can update withdrawal_orders" ON public.withdrawal_orders;
CREATE POLICY "Managers can update withdrawal_orders" ON public.withdrawal_orders
FOR UPDATE TO authenticated
USING (
public.has_permission(auth.uid(), 'withdrawals.update') OR
public.has_permission(auth.uid(), 'inventory.approve') OR
public.is_super_admin(auth.uid())
)
WITH CHECK (
public.has_permission(auth.uid(), 'withdrawals.update') OR
public.has_permission(auth.uid(), 'inventory.approve') OR
public.is_super_admin(auth.uid())
);
DROP POLICY IF EXISTS "Users can insert withdrawal_items" ON public.withdrawal_items;
CREATE POLICY "Users can insert withdrawal_items" ON public.withdrawal_items
FOR INSERT TO authenticated
WITH CHECK (
EXISTS (
SELECT 1 FROM public.withdrawal_orders wo
WHERE wo.id = order_id AND (wo.requested_by = auth.uid() OR public.is_super_admin(auth.uid()))
)
);
DROP POLICY IF EXISTS "Managers can update withdrawal_items" ON public.withdrawal_items;
CREATE POLICY "Managers can update withdrawal_items" ON public.withdrawal_items
FOR UPDATE TO authenticated
USING (
public.has_permission(auth.uid(), 'inventory.approve') OR
public.is_super_admin(auth.uid())
)
WITH CHECK (
public.has_permission(auth.uid(), 'inventory.approve') OR
public.is_super_admin(auth.uid())
);
DROP POLICY IF EXISTS "Authorized manage checkout_orders" ON public.checkout_orders;
CREATE POLICY "Authorized manage checkout_orders" ON public.checkout_orders
FOR ALL TO authenticated
USING (
public.has_permission(auth.uid(), 'checkouts.update') OR
public.has_permission(auth.uid(), 'checkouts.create') OR
public.has_permission(auth.uid(), 'checkouts.view') OR
public.has_permission(auth.uid(), 'checkouts.approve') OR
borrower_id = auth.uid() OR
created_by = auth.uid() OR
public.is_super_admin(auth.uid())
)
WITH CHECK (
public.has_permission(auth.uid(), 'checkouts.update') OR
public.has_permission(auth.uid(), 'checkouts.create') OR
public.has_permission(auth.uid(), 'checkouts.approve') OR
borrower_id = auth.uid() OR
created_by = auth.uid() OR
public.is_super_admin(auth.uid())
);
DROP POLICY IF EXISTS "Authorized manage checkout_items" ON public.checkout_items;
CREATE POLICY "Authorized manage checkout_items" ON public.checkout_items
FOR ALL TO authenticated
USING (
public.has_permission(auth.uid(), 'checkouts.update') OR
public.has_permission(auth.uid(), 'checkouts.create') OR
public.has_permission(auth.uid(), 'checkouts.view') OR
public.has_permission(auth.uid(), 'checkouts.approve') OR
EXISTS (
SELECT 1 FROM public.checkout_orders co
WHERE co.id = checkout_items.checkout_order_id
AND (co.borrower_id = auth.uid() OR co.created_by = auth.uid())
) OR
public.is_super_admin(auth.uid())
)
WITH CHECK (
public.has_permission(auth.uid(), 'checkouts.update') OR
public.has_permission(auth.uid(), 'checkouts.create') OR
public.has_permission(auth.uid(), 'checkouts.approve') OR
public.is_super_admin(auth.uid())
);
DROP POLICY IF EXISTS "Authorized manage checkout_return_logs" ON public.checkout_return_logs;
CREATE POLICY "Authorized manage checkout_return_logs" ON public.checkout_return_logs
FOR ALL TO authenticated
USING (
public.has_permission(auth.uid(), 'checkouts.return') OR
public.is_super_admin(auth.uid())
)
WITH CHECK (
public.has_permission(auth.uid(), 'checkouts.return') OR
public.is_super_admin(auth.uid())
);
DROP POLICY IF EXISTS "Authorized manage checkout_extension_logs" ON public.checkout_extension_logs;
CREATE POLICY "Authorized manage checkout_extension_logs" ON public.checkout_extension_logs
FOR ALL TO authenticated
USING (
public.has_permission(auth.uid(), 'checkouts.extend') OR
public.is_super_admin(auth.uid())
)
WITH CHECK (
public.has_permission(auth.uid(), 'checkouts.extend') OR
public.is_super_admin(auth.uid())
);
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Users can mark own notifications as read" ON public.notifications;
CREATE POLICY "Users can mark own notifications as read"
ON public.notifications
FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (user_id = (SELECT auth.uid()));

-- 8.4 Triggers
DROP TRIGGER IF EXISTS check_profile_privilege_escalation ON public.profiles;
DROP TRIGGER IF EXISTS trg_checkout_status_notifications ON public.checkout_orders;
DROP TRIGGER IF EXISTS trg_checkout_submitted_notifications ON public.checkout_items;
DROP TRIGGER IF EXISTS trg_stock_in_notifications ON public.stock_in_items;
DROP TRIGGER IF EXISTS trg_sync_profile_role ON public.profiles;
DROP TRIGGER IF EXISTS trg_withdrawal_notifications ON public.withdrawal_orders;
DROP TRIGGER IF EXISTS trg_withdrawal_submitted_notifications ON public.withdrawal_items;
DROP TRIGGER IF EXISTS trg_sync_profile_role ON public.profiles;
CREATE TRIGGER trg_sync_profile_role
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_role_function();
DROP TRIGGER IF EXISTS check_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER check_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_check_profile_privilege_escalation();
DROP TRIGGER IF EXISTS trg_withdrawal_submitted_notifications ON public.withdrawal_items;
CREATE TRIGGER trg_withdrawal_submitted_notifications
AFTER INSERT ON public.withdrawal_items
REFERENCING NEW TABLE AS inserted_items
FOR EACH STATEMENT
EXECUTE FUNCTION public.notify_withdrawal_submitted();
DROP TRIGGER IF EXISTS trg_withdrawal_notifications ON public.withdrawal_orders;
CREATE TRIGGER trg_withdrawal_notifications
AFTER UPDATE OF status ON public.withdrawal_orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_withdrawal_status();
DROP TRIGGER IF EXISTS trg_checkout_submitted_notifications ON public.checkout_items;
CREATE TRIGGER trg_checkout_submitted_notifications
AFTER INSERT ON public.checkout_items
REFERENCING NEW TABLE AS inserted_items
FOR EACH STATEMENT
EXECUTE FUNCTION public.notify_checkout_submitted();
DROP TRIGGER IF EXISTS trg_checkout_status_notifications ON public.checkout_orders;
CREATE TRIGGER trg_checkout_status_notifications
AFTER UPDATE OF status ON public.checkout_orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_checkout_status();
DROP TRIGGER IF EXISTS trg_stock_in_notifications ON public.stock_in_items;
CREATE TRIGGER trg_stock_in_notifications
AFTER INSERT ON public.stock_in_items
REFERENCING NEW TABLE AS inserted_items
FOR EACH STATEMENT
EXECUTE FUNCTION public.notify_stock_in_received();

-- 8.5 Indexes
CREATE INDEX IF NOT EXISTS idx_checkout_ext_extended_at ON public.checkout_extension_logs(extended_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkout_ext_order ON public.checkout_extension_logs(checkout_order_id);
CREATE INDEX IF NOT EXISTS idx_checkout_orders_approved_by
ON public.checkout_orders(approved_by);
CREATE INDEX IF NOT EXISTS idx_checkout_orders_borrow_type
ON public.checkout_orders (borrow_type);
CREATE INDEX IF NOT EXISTS idx_checkout_orders_rejected_by
ON public.checkout_orders(rejected_by);
CREATE INDEX IF NOT EXISTS idx_email_dispatch_logs_lookup
ON public.email_dispatch_logs (order_id, event_type, dispatched_date);
CREATE INDEX IF NOT EXISTS idx_items_category_name ON public.items (category_id, name);
CREATE INDEX IF NOT EXISTS idx_items_sku ON public.items (sku);
CREATE INDEX IF NOT EXISTS idx_items_source ON public.items (source);
CREATE INDEX IF NOT EXISTS idx_items_vendor ON public.items (vendor);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at
ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
ON public.notifications (user_id, created_at DESC)
WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON public.role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_roles_code ON public.roles (code);
CREATE INDEX IF NOT EXISTS idx_site_bom_templates_cat ON public.site_bom_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_site_bom_templates_item ON public.site_bom_templates(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_adj_created ON public.stock_adjustment_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_adj_item ON public.stock_adjustment_logs (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_adj_project ON public.stock_adjustment_logs (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_in_items_order ON public.stock_in_items (order_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_created ON public.stock_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_lookup ON public.stock_transactions (project_id, item_id, storage_location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_lookup ON public.user_notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_project_assignments_user ON public.user_project_assignments (user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_items_order ON public.withdrawal_items (order_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_orders_status ON public.withdrawal_orders (status, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_event_reference
ON public.notifications (user_id, event_type, reference_id);

-- 8.6 Views

-- 8.7 Function grants / revokes (final state)
GRANT EXECUTE ON FUNCTION public.admin_get_users() TO public, authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_item_warehouse(UUID, UUID, UUID, UUID, UUID, INTEGER, TEXT) TO public, authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_category_bom(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(UUID, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_roles_with_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_permissions_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_role_permissions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_role_permissions(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_withdrawal_order(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_withdrawal_order(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_withdrawal_order(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extend_checkout_due_date(UUID, DATE, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_item_current_stock(UUID, UUID, INTEGER, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[], TEXT, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(UUID, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_role_permissions(UUID, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_role(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_role(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[], TEXT, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[], TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_system_settings() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_system_settings(JSONB, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_default_password_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_default_password(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_default_password_for_reset() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_smtp_password(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_role(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_toggle_user_status(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_force_password_change() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_inventory_request(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_inventory_request(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_force_delete_item(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_checkout_order(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_return_order(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_site_installation_kits_availability(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_system_settings() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_system_settings(JSONB, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_default_password_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_default_password(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_default_password_for_reset() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_smtp_password(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_role(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_toggle_user_status(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_force_password_change() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_stock_in(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_inventory_request(UUID, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_inventory_request(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_inventory_request(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_force_delete_item(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_and_delete_project(UUID[], UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_checkout_order(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_return_order(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_site_installation_kits_availability(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_manage_site_bom() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_site_bom() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_save_category_bom(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_category_bom(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_stock_in(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_checkout_order(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_return_order(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_inventory_request(UUID, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_withdrawal_order(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_inventory_request(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_withdrawal_order(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_withdrawal_order(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.complete_inventory_request(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID[], TEXT, UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.process_checkout_order(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_checkout_order(JSONB) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_checkout_order(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_checkout_order(JSONB) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.reject_checkout_order(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_checkout_order(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_inventory_request(UUID, BOOLEAN, TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_checkout_consumed_usage(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_checkout_consumed_usage(UUID, DATE, DATE) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_checkout_delegate(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_checkout_delegate(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_checkout_borrowers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_checkout_borrowers() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.process_checkout_order(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_checkout_order(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(JSONB) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_item_transfer(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(JSONB) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_checkout_order(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_checkout_order(JSONB) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.push_notifications(UUID[], TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_withdrawal_submitted() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_withdrawal_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_checkout_submitted() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_checkout_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_stock_in_received() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_emails(UUID[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_emails(UUID[], TEXT[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_user_emails(UUID[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_emails(UUID[], TEXT[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_checkout_delegate(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_checkout_delegate(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_checkout_borrowers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_checkout_borrowers() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.process_checkout_order(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_checkout_order(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(JSONB) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_item_transfer(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(JSONB) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_checkout_order(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_checkout_order(JSONB) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.push_notifications(UUID[], TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_withdrawal_submitted() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_withdrawal_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_checkout_submitted() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_checkout_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_stock_in_received() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_emails(UUID[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_emails(UUID[], TEXT[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_user_emails(UUID[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_emails(UUID[], TEXT[]) TO authenticated, service_role;

`;
}

/**
 * Format a value for safe SQL Insert statement
 */
function formatSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isFinite(val) ? `${val}` : 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (Array.isArray(val)) {
    const arrayElements = val.map((elem) => {
      if (typeof elem === 'string') return `"${elem.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      return String(elem);
    });
    return `'{${arrayElements.join(',').replace(/'/g, "''")}}'`;
  }
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

/**
 * Calculate SHA-256 Checksum for a file
 */
function getFileChecksum(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Main Backup Orchestration Function
 */
async function runCompleteBackup() {
  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'backups', `backup-${timestamp}`);

  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`\n================================================================`);
  console.log(`🛡️  STOCK-FLOW ENTERPRISE DATABASE BACKUP ENGINE`);
  console.log(`================================================================`);
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  console.log(`📁 Destination: ${backupDir}\n`);

  const fullData = {};
  const dataInsertStatements = [];
  const authInsertStatements = [];
  let totalRows = 0;
  const tableStats = {};

  // --------------------------------------------------------------------------
  // Step 1: Backup `auth.users` and `auth.identities`
  // --------------------------------------------------------------------------
  console.log(`🔐 [1/4] Fetching Supabase Authentication Users (auth.users)...`);
  try {
    const { data: usersData, error: userErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (userErr) {
      console.warn(`  ⚠️ Warning: Could not list auth users (${userErr.message})`);
      fullData['auth_users'] = [];
      tableStats['auth.users'] = 0;
    } else {
      const users = usersData.users || [];
      fullData['auth_users'] = users;
      tableStats['auth.users'] = users.length;
      totalRows += users.length;
      console.log(`  ✅ Successfully exported ${users.length} auth user accounts.`);

      authInsertStatements.push(`-- ========================================================`);
      authInsertStatements.push(`-- 01_auth_schema_and_users.sql`);
      authInsertStatements.push(``);

      for (const u of users) {
        const uId = formatSqlValue(u.id);
        const uEmail = formatSqlValue(u.email);
        const uAud = formatSqlValue(u.aud || 'authenticated');
        const uRole = formatSqlValue(u.role || 'authenticated');
        const uAppMeta = formatSqlValue(u.app_metadata || { provider: 'email', providers: ['email'] });
        const uUserMeta = formatSqlValue(u.user_metadata || {});
        const uCreatedAt = formatSqlValue(u.created_at || new Date().toISOString());
        const uUpdatedAt = formatSqlValue(u.updated_at || new Date().toISOString());
        const uEmailConfirmed = formatSqlValue(u.email_confirmed_at || u.created_at || new Date().toISOString());
        const uPhone = (u.phone && String(u.phone).trim() !== '') ? formatSqlValue(u.phone) : 'NULL';

        // Use environment variable for default restore password hash via pgcrypto
        const restorePassword = process.env.DEFAULT_RESTORE_PASSWORD || 'ChangeMeImmediately!';
        const defaultHashExpr = `extensions.crypt('${restorePassword.replace(/'/g, "''")}', extensions.gen_salt('bf'))`;

        authInsertStatements.push(
          `INSERT INTO auth.users (` +
          `id, instance_id, email, encrypted_password, email_confirmed_at, ` +
          `confirmation_token, recovery_token, email_change_token_new, email_change_token_current, ` +
          `email_change, phone_change, phone_change_token, reauthentication_token, ` +
          `raw_app_meta_data, raw_user_meta_data, aud, role, phone, ` +
          `is_super_admin, is_sso_user, is_anonymous, email_change_confirm_status, created_at, updated_at` +
          `) VALUES (` +
          `${uId}, '00000000-0000-0000-0000-000000000000', ${uEmail}, ${defaultHashExpr}, ${uEmailConfirmed}, ` +
          `'', '', '', '', ` +
          `'', '', '', '', ` +
          `${uAppMeta}, ${uUserMeta}, ${uAud}, ${uRole}, ${uPhone}, ` +
          `FALSE, FALSE, FALSE, 0, ${uCreatedAt}, ${uUpdatedAt}` +
          `) ON CONFLICT (id) DO UPDATE SET ` +
          `email = EXCLUDED.email, ` +
          `raw_user_meta_data = EXCLUDED.raw_user_meta_data, ` +
          `confirmation_token = '', ` +
          `recovery_token = '', ` +
          `email_change_token_new = '', ` +
          `email_change_token_current = '', ` +
          `email_change = '', ` +
          `phone_change = '', ` +
          `phone_change_token = '', ` +
          `reauthentication_token = '', ` +
          `email_confirmed_at = COALESCE(auth.users.email_confirmed_at, EXCLUDED.email_confirmed_at), ` +
          `is_super_admin = FALSE, ` +
          `is_sso_user = FALSE, ` +
          `is_anonymous = FALSE, ` +
          `email_change_confirm_status = 0, ` +
          `updated_at = EXCLUDED.updated_at;`
        );

        authInsertStatements.push(
          `INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at) ` +
          `VALUES (${uId}, ${uId}, jsonb_build_object('sub', ${uId}::text, 'email', ${uEmail}), 'email', ${uId}::text, ${uCreatedAt}, ${uCreatedAt}, ${uUpdatedAt}) ` +
          `ON CONFLICT (provider, provider_id) DO UPDATE SET ` +
          `identity_data = EXCLUDED.identity_data, ` +
          `updated_at = EXCLUDED.updated_at;`
        );
      }

      // Add a safety update to guarantee no NULL strings exist in GoTrue columns
      authInsertStatements.push(`\n-- Safety GoTrue Auth Scanner Repair`);
      authInsertStatements.push(`UPDATE auth.users SET ` +
        `confirmation_token = COALESCE(confirmation_token, ''), ` +
        `recovery_token = COALESCE(recovery_token, ''), ` +
        `email_change_token_new = COALESCE(email_change_token_new, ''), ` +
        `email_change_token_current = COALESCE(email_change_token_current, ''), ` +
        `email_change = COALESCE(email_change, ''), ` +
        `phone_change = COALESCE(phone_change, ''), ` +
        `phone_change_token = COALESCE(phone_change_token, ''), ` +
        `reauthentication_token = COALESCE(reauthentication_token, ''), ` +
        `is_super_admin = COALESCE(is_super_admin, FALSE), ` +
        `is_sso_user = COALESCE(is_sso_user, FALSE), ` +
        `is_anonymous = COALESCE(is_anonymous, FALSE), ` +
        `email_change_confirm_status = COALESCE(email_change_confirm_status, 0), ` +
        `email_confirmed_at = COALESCE(email_confirmed_at, NOW()), ` +
        `aud = COALESCE(aud, 'authenticated'), ` +
        `role = COALESCE(role, 'authenticated'), ` +
        `instance_id = COALESCE(instance_id, '00000000-0000-0000-0000-000000000000');`
      );
    }
  } catch (err) {
    console.warn(`  ❌ Error fetching auth users:`, err.message);
  }

  // --------------------------------------------------------------------------
  // Step 2: Backup All Application Tables
  // --------------------------------------------------------------------------
  console.log(`\n📊 [2/4] Fetching All Application Tables in Dependency Order...`);

  dataInsertStatements.push(`-- ========================================================`);
  dataInsertStatements.push(`-- 02_data_inserts.sql`);
  dataInsertStatements.push(`-- Stock-Flow Application Public Data Inserts`);
  dataInsertStatements.push(`-- ========================================================`);

  for (const table of TABLES_IN_DEPENDENCY_ORDER) {
    try {
      process.stdout.write(`  ⏳ Fetching 'public.${table}'... `);
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(50000);

      if (error) {
        console.log(`⚠️ Skipped (${error.message})`);
        tableStats[table] = 0;
        continue;
      }

      fullData[table] = data || [];
      const rowCount = data ? data.length : 0;
      tableStats[table] = rowCount;
      totalRows += rowCount;
      console.log(`✅ ${rowCount} rows`);

      if (rowCount > 0) {
        dataInsertStatements.push(`\n-- --------------------------------------------------------`);
        dataInsertStatements.push(`-- Table: public.${table} (${rowCount} rows)`);
        dataInsertStatements.push(`-- --------------------------------------------------------`);

        for (const row of data) {
          const sanitizedRow = { ...row };
          if (table === 'system_secrets' && process.env.INCLUDE_SECRETS !== 'true') {
            sanitizedRow.secret_value = '[REDACTED_SECRET]';
          }
          if (table === 'system_settings' && sanitizedRow.key === 'smtp_config' && sanitizedRow.value && process.env.INCLUDE_SECRETS !== 'true') {
            try {
              const smtpVal = typeof sanitizedRow.value === 'string' ? JSON.parse(sanitizedRow.value) : sanitizedRow.value;
              if (smtpVal && smtpVal.password) {
                smtpVal.password = '[REDACTED_SECRET]';
                sanitizedRow.value = smtpVal;
              }
            } catch {
              // ignore parse failure
            }
          }

          const columns = Object.keys(sanitizedRow);
          const values = columns.map((col) => {
            if (table === 'system_settings' && col === 'value') {
              return `'${JSON.stringify(sanitizedRow[col]).replace(/'/g, "''")}'::jsonb`;
            }
            return formatSqlValue(sanitizedRow[col]);
          });

          dataInsertStatements.push(
            `INSERT INTO public.${table} (${columns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING;`
          );
        }
      }
    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
      tableStats[table] = 0;
    }
  }

  // --------------------------------------------------------------------------
  // Step 3: Write Output Backup Files
  // --------------------------------------------------------------------------
  console.log(`\n💾 [3/4] Generating Backup Files & Disaster Recovery Packages...`);

  // 1. Schema DDL SQL
  const schemaDdlPath = path.join(backupDir, '00_full_schema_ddl.sql');
  const schemaDdlContent = getMasterSchemaDDL();
  fs.writeFileSync(schemaDdlPath, schemaDdlContent, 'utf8');

  // Also maintain baseline compatibility copy
  fs.writeFileSync(path.join(backupDir, 'schema_baseline.sql'), schemaDdlContent, 'utf8');

  // 2. Auth Schema & Users SQL
  const authSqlPath = path.join(backupDir, '01_auth_schema_and_users.sql');
  const authSqlContent = authInsertStatements.join('\n');
  fs.writeFileSync(authSqlPath, authSqlContent, 'utf8');

  // 3. Application Data SQL Inserts
  const dataSqlPath = path.join(backupDir, '02_data_inserts.sql');
  const dataSqlContent = dataInsertStatements.join('\n');
  fs.writeFileSync(dataSqlPath, dataSqlContent, 'utf8');
  fs.writeFileSync(path.join(backupDir, 'data_inserts.sql'), dataSqlContent, 'utf8');

  // 4. Master Single-File Disaster Recovery SQL
  const masterDrPath = path.join(backupDir, '03_supabase_full_disaster_recovery.sql');
  const masterDrContent = [
    `-- ==============================================================================`,
    `-- STOCK-FLOW ENTERPRISE - MASTER DISASTER RECOVERY & FULL MIGRATION SQL`,
    `-- Generated At: ${new Date().toISOString()}`,
    `-- Total Rows Exported: ${totalRows}`,
    `-- ==============================================================================`,
    ``,
    `BEGIN;`,
    ``,
    `-- 1. Temporarily disable foreign key constraints & triggers for atomic batch restore`,
    `SET session_replication_role = 'replica';`,
    `SET check_function_bodies = false;`,
    ``,
    `-- 2. Create Full Schema DDL (Extensions, Schemas, Tables, Views, RPCs, Triggers, RLS)`,
    schemaDdlContent,
    ``,
    `-- 3. Restore Auth Schema & Users`,
    authSqlContent,
    ``,
    `-- 4. Restore Application Public Data`,
    dataSqlContent,
    ``,
    `-- 5. Re-enable triggers and foreign key validation`,
    `SET session_replication_role = 'origin';`,
    ``,
    `COMMIT;`,
    ``,
    `-- 6. Reload PostgREST schema cache`,
    `NOTIFY pgrst, 'reload schema';`,
    `-- ==============================================================================`,
    `-- DISASTER RECOVERY RESTORATION COMPLETE!`,
    `-- ==============================================================================`,
  ].join('\n');
  fs.writeFileSync(masterDrPath, masterDrContent, 'utf8');

  // 5. Full JSON Dataset
  const jsonPath = path.join(backupDir, 'data_all_tables.json');
  fs.writeFileSync(jsonPath, JSON.stringify(fullData, null, 2), 'utf8');

  // 6. Metadata Manifest & Integrity Checksums
  const metadata = {
    timestamp: new Date().toISOString(),
    version: '1.4.1',
    supabaseUrl: supabaseUrl.replace(/https?:\/\//, '').split('.')[0],
    totalRowsExported: totalRows,
    durationMs: Date.now() - startTime,
    tableRowCounts: tableStats,
    files: {
      '00_full_schema_ddl.sql': {
        description: 'Complete DDL Schema, Extensions, Tables, Views, RPC Functions, Triggers, and RLS',
        sizeBytes: fs.statSync(schemaDdlPath).size,
        sha256: getFileChecksum(schemaDdlPath),
      },
      '01_auth_schema_and_users.sql': {
        description: 'Supabase Auth Schema, User Accounts, and Identity mappings',
        sizeBytes: fs.statSync(authSqlPath).size,
        sha256: getFileChecksum(authSqlPath),
      },
      '02_data_inserts.sql': {
        description: 'Formatted SQL INSERT statements for all application tables in dependency order',
        sizeBytes: fs.statSync(dataSqlPath).size,
        sha256: getFileChecksum(dataSqlPath),
      },
      '03_supabase_full_disaster_recovery.sql': {
        description: 'Master Monolithic All-In-One SQL Script for Single-Command Disaster Recovery',
        sizeBytes: fs.statSync(masterDrPath).size,
        sha256: getFileChecksum(masterDrPath),
      },
      'data_all_tables.json': {
        description: 'Raw structured JSON dataset of all tables and users',
        sizeBytes: fs.statSync(jsonPath).size,
        sha256: getFileChecksum(jsonPath),
      },
    },
  };

  const metadataPath = path.join(backupDir, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

  // --------------------------------------------------------------------------
  // Step 4: Summary Output
  // --------------------------------------------------------------------------
  console.log(`\n🎉 [4/4] Backup Completed Successfully in ${Date.now() - startTime}ms!`);
  console.log(`📊 Summary Statistics:`);
  console.log(`  - Total Rows Exported: ${totalRows} records`);
  console.log(`  - Application Tables: ${Object.keys(tableStats).length} tables`);
  console.log(`  - Auth Users: ${tableStats['auth.users'] || 0} accounts`);
  console.log(`\n📂 Generated Artifacts in ${backupDir}:`);
  console.log(`  ├── 00_full_schema_ddl.sql                   (${Math.round(fs.statSync(schemaDdlPath).size / 1024)} KB)`);
  console.log(`  ├── 01_auth_schema_and_users.sql             (${Math.round(fs.statSync(authSqlPath).size / 1024)} KB)`);
  console.log(`  ├── 02_data_inserts.sql                      (${Math.round(fs.statSync(dataSqlPath).size / 1024)} KB)`);
  console.log(`  ├── 03_supabase_full_disaster_recovery.sql   (${Math.round(fs.statSync(masterDrPath).size / 1024)} KB) [⭐ Single-Command Master]`);
  console.log(`  ├── data_all_tables.json                     (${Math.round(fs.statSync(jsonPath).size / 1024)} KB)`);
  console.log(`  └── metadata.json                            (${Math.round(fs.statSync(metadataPath).size / 1024)} KB)`);
  console.log(`================================================================\n`);
}

runCompleteBackup().catch((err) => {
  console.error('\n❌ Backup process encountered a fatal error:', err);
  process.exit(1);
});
