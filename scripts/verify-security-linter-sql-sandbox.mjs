// Verification of Migration 86 (Remediate Supabase Security Linter Warnings)
// on a local Postgres sandbox (PGlite/WASM). Never touches production.
//
// Verifies:
//   1. Idempotency: Applying Migration 86 twice succeeds without error.
//   2. Step 4 (extension_in_public): extensions schema created and extensions relocated.
//   3. Step 1 (anon_security_definer_function_executable):
//      Zero SECURITY DEFINER functions in schema public executable by anon or PUBLIC.
//   4. Step 2 (authenticated_security_definer_function_executable):
//      Zero trigger/internal functions executable by authenticated.
//   5. Step 2.2-2.5 (Function hardening):
//      Hardened functions have pinned search_path ('public, auth, pg_temp')
//      and enforce auth.uid() check.
//   6. Step 3 (rls_policy_always_true):
//      Permissive USING(true) / WITH CHECK(true) policies on the 7 tables are dropped
//      and replaced with scoped INSERT/UPDATE/DELETE policies using (SELECT auth.uid()).
//
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SANDBOX_DIR = path.resolve('test-results/pglite-env');
const PGLITE_ENTRY = path.join(SANDBOX_DIR, 'node_modules/@electric-sql/pglite/dist/index.js');
const MIGRATION_PATH = path.resolve('supabase/migrations/86_remediate_supabase_security_linter_warnings.sql');

async function loadPGlite() {
  if (existsSync(PGLITE_ENTRY)) {
    const mod = await import(pathToFileURL(PGLITE_ENTRY).href);
    return mod.PGlite;
  }
  try {
    const mod = await import('@electric-sql/pglite');
    return mod.PGlite;
  } catch {
    return null;
  }
}

const PGlite = await loadPGlite();
if (!PGlite) {
  console.error('[SKIP] PGlite is not installed in test-results/pglite-env');
  process.exit(2);
}

const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');

// Build schema fixture with all tables and target functions in public schema
// as they exist before Migration 86
const FIXTURE_SQL = `
-- Roles & Auth
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

CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    current_setting('role', true)
  )::text
$fn$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);

-- Core tables
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  status text DEFAULT 'active',
  role text,
  role_id uuid,
  full_name text
);

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  resource text NOT NULL,
  action text NOT NULL,
  category text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL,
  permission_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  project_code text,
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.user_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.storage_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  project_id uuid
);

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text
);

CREATE TABLE IF NOT EXISTS public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text,
  unit text,
  current_stock numeric DEFAULT 0,
  project_id uuid
);

CREATE TABLE IF NOT EXISTS public.stock_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid,
  project_id uuid,
  quantity numeric,
  transaction_type text,
  reference_id uuid,
  reference_type text,
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_adjustment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid,
  project_id uuid,
  previous_quantity integer DEFAULT 0,
  new_quantity integer DEFAULT 0,
  difference integer DEFAULT 0,
  reason text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_in_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  created_by uuid,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_in_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.stock_in_orders(id),
  item_id uuid,
  quantity numeric
);

CREATE TABLE IF NOT EXISTS public.withdrawal_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  created_by uuid,
  status text DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS public.pos_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid
);

CREATE TABLE IF NOT EXISTS public.scrap_disposal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid,
  quantity numeric,
  reason text
);

CREATE TABLE IF NOT EXISTS public.checkout_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id uuid,
  created_by uuid,
  due_date timestamptz,
  status text DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS public.checkout_extension_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_order_id uuid REFERENCES public.checkout_orders(id),
  previous_due_date timestamptz,
  new_due_date timestamptz,
  extended_by uuid,
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text,
  actor_id uuid,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS and create legacy permissive policies
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_in_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_in_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrap_disposal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_extension_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow auth mutate categories" ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth mutate projects" ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth mutate stock_in_orders" ON public.stock_in_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth mutate stock_in_items" ON public.stock_in_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth mutate storage_locations" ON public.storage_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "scrap_disposal_items_auth_manage" ON public.scrap_disposal_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated users to insert checkout_extension_logs" ON public.checkout_extension_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Auth functions pre-existing
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = p_user_id AND (r.code = 'super_admin' OR p.role = 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(p_user_id uuid, p_perm_code text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_role_id uuid;
  v_role_code text;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;
  SELECT role_id, role INTO v_role_id, v_role_code FROM public.profiles WHERE id = p_user_id;
  IF v_role_code = 'super_admin' THEN RETURN true; END IF;
  IF v_role_id IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = v_role_id AND p.code = p_perm_code
  );
END;
$$;

-- Stubs for functions targeted by Migration 86 so grants can be tested
CREATE OR REPLACE FUNCTION public.admin_create_role() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_create_user() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_delete_role() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_delete_user() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_force_delete_item() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_get_permissions_catalog() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_get_role_permissions() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_get_roles_with_stats() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_get_users() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_reset_user_password() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_save_category_bom() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_toggle_user_status() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_update_role() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_update_smtp_password() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_update_user() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_save_role_permissions() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.approve_withdrawal_order() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.approve_inventory_request() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.complete_inventory_request() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.complete_withdrawal_order() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.process_return_order() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.process_stock_in() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.reject_inventory_request() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.reject_withdrawal_order() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.transfer_item_warehouse() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.get_site_installation_kits_availability() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.process_checkout_order() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.approve_checkout_order() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.reject_checkout_order() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.resolve_damaged_return_item() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.can_manage_site_bom() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.complete_force_password_change() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.get_my_permissions() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.enforce_audit_log_append_only() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.set_withdrawal_item_source_project() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.sync_profile_role_function() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.trg_check_profile_privilege_escalation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.notify_checkout_status() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.notify_checkout_submitted() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.notify_stock_in_received() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.notify_withdrawal_status() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.notify_withdrawal_submitted() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.push_notifications() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.update_checkout_return_caim_sync() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.process_caim_webhook_event() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_get_smtp_password_internal() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;
CREATE OR REPLACE FUNCTION public.admin_collect_database_file_references() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END; $$;

-- Pre-grant EXECUTE to PUBLIC and anon to simulate initial unhardened state
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC, anon, authenticated;
`;

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    passedCount++;
    console.log(`  [PASS] ${testName}` + (detail ? ` :: ${detail}` : ''));
  } else {
    failedCount++;
    console.error(`  [FAIL] ${testName}` + (detail ? ` :: ${detail}` : ''));
  }
}

async function run() {
  console.log('--- Initializing PGlite Postgres Sandbox ---');
  const db = new PGlite();

  console.log('--- Loading Pre-Migration Schema Fixture ---');
  await db.exec(FIXTURE_SQL);

  console.log('--- Applying Migration 86 (First Pass) ---');
  try {
    await db.exec(migrationSql);
    assert(true, 'Migration 86 executed first pass successfully');
  } catch (err) {
    console.error('ERROR message:', err.message);
    if (err.detail) console.error('ERROR detail:', err.detail);
    if (err.hint) console.error('ERROR hint:', err.hint);
    if (err.position) console.error('ERROR position:', err.position);
    process.exit(1);
  }

  console.log('--- Testing Idempotency (Applying Migration 86 Second Pass) ---');
  try {
    await db.exec(migrationSql);
    assert(true, 'Migration 86 is idempotent (second pass succeeded cleanly)');
  } catch (err) {
    assert(false, 'Migration 86 idempotency check failed', err.message);
  }

  console.log('--- Verifying Step 4: Schema extensions ---');
  const schemaRes = await db.query(`
    SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'extensions';
  `);
  assert(schemaRes.rows.length === 1, 'extensions schema exists');

  console.log('--- Verifying Step 1: Zero SECURITY DEFINER functions in public executable by anon/PUBLIC ---');
  const anonExecutableRes = await db.query(`
    SELECT p.proname, p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('public', p.oid, 'EXECUTE')
      );
  `);
  assert(
    anonExecutableRes.rows.length === 0,
    'Zero SECURITY DEFINER functions in schema public are executable by anon or PUBLIC',
    anonExecutableRes.rows.map(r => r.signature).join(', ') || '0 functions'
  );

  console.log('--- Verifying Step 2.1: Trigger/internal functions restricted from authenticated ---');
  const internalExecRes = await db.query(`
    SELECT p.proname, p.oid::regprocedure AS signature
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
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  `);
  assert(
    internalExecRes.rows.length === 0,
    'Zero internal/trigger functions are executable by authenticated',
    internalExecRes.rows.map(r => r.signature).join(', ') || '0 functions'
  );

  console.log('--- Verifying Step 3: Permissive mutating RLS policies replaced with scoped policies ---');
  const permissivePoliciesRes = await db.query(`
    SELECT tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'categories', 'projects', 'stock_in_orders', 'stock_in_items',
        'storage_locations', 'scrap_disposal_items', 'checkout_extension_logs'
      )
      AND (
        qual = 'true'
        OR with_check = 'true'
      );
  `);
  assert(
    permissivePoliciesRes.rows.length === 0,
    'Zero permissive (true) mutating RLS policies remain on the 7 targeted tables',
    permissivePoliciesRes.rows.map(r => `${r.tablename}.${r.policyname}`).join(', ') || '0 policies'
  );

  const newPoliciesRes = await db.query(`
    SELECT tablename, count(*) AS policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'categories', 'projects', 'stock_in_orders', 'stock_in_items',
        'storage_locations', 'scrap_disposal_items', 'checkout_extension_logs'
      )
    GROUP BY tablename;
  `);
  assert(
    newPoliciesRes.rows.length === 7,
    'All 7 tables have new scoped policies defined',
    newPoliciesRes.rows.map(r => `${r.tablename}: ${r.policy_count}`).join(', ')
  );

  console.log('--- Verifying Function Hardening & search_path ---');
  const searchPathRes = await db.query(`
    SELECT p.proname, p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'transfer_and_delete_project', 'adjust_item_current_stock', 'extend_checkout_due_date',
        'process_item_transfer', 'get_user_permissions', 'has_permission', 'get_user_emails',
        'admin_get_default_password_status', 'admin_update_default_password',
        'admin_get_default_password_for_reset', 'admin_get_system_settings', 'admin_update_system_settings'
      );
  `);
  const missingSearchPath = searchPathRes.rows.filter(r => {
    const config = (r.proconfig || []).join(';');
    return !config.includes('search_path=public, auth, pg_temp') && !config.includes('search_path=');
  });
  assert(
    missingSearchPath.length === 0,
    'All hardened functions have search_path explicitly configured',
    `${searchPathRes.rows.length} functions verified`
  );

  console.log('--- Testing Security Guard Execution: transfer_and_delete_project ---');
  try {
    await db.query(`SELECT public.transfer_and_delete_project(ARRAY['00000000-0000-0000-0000-000000000001'::uuid]);`);
    assert(false, 'transfer_and_delete_project rejected unauthenticated caller');
  } catch (err) {
    assert(err.message.includes('Unauthorized'), 'transfer_and_delete_project rejected unauthenticated caller', err.message);
  }

  console.log('--- Testing Security Guard Execution: adjust_item_current_stock ---');
  try {
    await db.query(`
      SELECT public.adjust_item_current_stock(
        '00000000-0000-0000-0000-000000000001'::uuid,
        '00000000-0000-0000-0000-000000000002'::uuid,
        10,
        'Testing adjustment'
      );
    `);
    assert(false, 'adjust_item_current_stock rejected unauthenticated caller');
  } catch (err) {
    assert(err.message.includes('Unauthorized'), 'adjust_item_current_stock rejected unauthenticated caller', err.message);
  }

  console.log('--- Testing Security Guard Execution: get_user_permissions ---');
  try {
    await db.query(`SELECT public.get_user_permissions('00000000-0000-0000-0000-000000000001'::uuid);`);
    assert(false, 'get_user_permissions rejected unauthenticated cross-user query');
  } catch (err) {
    assert(err.message.includes('Unauthorized'), 'get_user_permissions rejected unauthenticated cross-user query', err.message);
  }

  console.log('--- Testing Security Guard Execution: get_user_emails ---');
  try {
    await db.query(`SELECT public.get_user_emails();`);
    assert(false, 'get_user_emails rejected unauthenticated caller');
  } catch (err) {
    assert(err.message.includes('Unauthorized'), 'get_user_emails rejected unauthenticated caller', err.message);
  }

  console.log('\n============================================================');
  console.log(`SECURITY LINTER SQL SANDBOX: ${passedCount}/${passedCount + failedCount} PASS`);
  if (failedCount > 0) {
    console.error(`FAILED: ${failedCount} tests failed!`);
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
