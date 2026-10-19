// ==============================================================================
// Deep verification script for Migration 96 & admin_delete_user RPC (PGlite Sandbox)
//   node scripts/verify-admin-delete-user-sandbox.mjs
// ==============================================================================

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const SANDBOX_DIR = path.resolve('test-results/pglite-env');
const PGLITE_ENTRY = path.join(SANDBOX_DIR, 'node_modules/@electric-sql/pglite/dist/index.js');
const FIXTURE = path.resolve('supabase/tests/fixtures/mock_supabase_schema.sql');
const MIGRATION_FILE = path.resolve('supabase/migrations/96_fix_admin_delete_user_and_integrity_guard.sql');

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
  console.error('[SKIP] PGlite not installed');
  process.exit(2);
}

console.log('🧪 Starting admin_delete_user Sandbox Verification (Migration 96)...');
const db = new PGlite();

// 1. Load mock base schema
const schemaSql = readFileSync(FIXTURE, 'utf8');
await db.exec(schemaSql);

// 2. Setup mock tables for user_project_assignments, notifications, storage, etc.
await db.exec(`
  CREATE TABLE IF NOT EXISTS auth.identities (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_system BOOLEAN DEFAULT FALSE
  );

  CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    module TEXT,
    action TEXT
  );

  CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
  );

  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT 'User';
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

  CREATE TABLE IF NOT EXISTS public.user_project_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    project_id UUID,
    created_by UUID REFERENCES public.profiles(id)
  );

  CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT,
    message TEXT
  );

  CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT,
    message TEXT
  );

  CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID,
    action TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS public.stock_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
  );
  ALTER TABLE public.stock_transactions ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  ALTER TABLE public.stock_transactions ADD COLUMN IF NOT EXISTS quantity NUMERIC;

  CREATE TABLE IF NOT EXISTS public.withdrawal_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
  );
  ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  ALTER TABLE public.withdrawal_orders ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

  CREATE TABLE IF NOT EXISTS public.checkout_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
  );
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS borrower_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

  CREATE TABLE IF NOT EXISTS public.stock_in_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
  );
  ALTER TABLE public.stock_in_orders ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

  -- Mock is_super_admin and has_permission
  CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID DEFAULT auth.uid())
  RETURNS BOOLEAN
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth, pg_temp
  AS $fn$
  DECLARE
    v_role TEXT;
    v_email TEXT;
  BEGIN
    IF p_user_id IS NULL THEN RETURN FALSE; END IF;
    SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
    RETURN (UPPER(COALESCE(v_role, '')) = 'SUPER' OR LOWER(COALESCE(v_email, '')) = 'admin@stockflow.com');
  END;
  $fn$;

  DROP FUNCTION IF EXISTS public.has_permission(UUID, TEXT);
  CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_perm_code TEXT)
  RETURNS BOOLEAN
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth, pg_temp
  AS $fn$
  DECLARE
    v_role TEXT;
  BEGIN
    IF p_user_id IS NULL THEN RETURN FALSE; END IF;
    IF public.is_super_admin(p_user_id) THEN RETURN TRUE; END IF;
    SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
    RETURN (UPPER(COALESCE(v_role, '')) IN ('ADMIN', 'SUPER'));
  END;
  $fn$;
`);

// 3. Execute Migration 96
console.log('📦 Executing Migration 96...');
const migrationSql = readFileSync(MIGRATION_FILE, 'utf8');
await db.exec(migrationSql);
console.log('✅ Migration 96 executed successfully!');

// Setup Helpers
async function asUser(userId) {
  if (!userId) {
    await db.exec(`
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULL::UUID;
      $$ LANGUAGE sql STABLE;
    `);
  } else {
    await db.exec(`
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT '${userId}'::UUID;
      $$ LANGUAGE sql STABLE;
    `);
  }
}

async function expectError(sql) {
  try {
    await db.query(sql);
    return { failed: false, error: null };
  } catch (err) {
    return { failed: true, error: err };
  }
}

// 4. Setup Seed Data for Testing
const SUPER_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN2_ID = '33333333-3333-3333-3333-333333333333';
const CLEAN_USER_ID = '44444444-4444-4444-4444-444444444444';
const USER_WITH_HISTORY_ID = '55555555-5555-5555-5555-555555555555';

await db.exec(`
  -- Insert auth.users
  INSERT INTO auth.users (id, email) VALUES
    ('${SUPER_ID}', 'admin@stockflow.com'),
    ('${ADMIN_ID}', 'admin1@company.com'),
    ('${ADMIN2_ID}', 'admin2@company.com'),
    ('${CLEAN_USER_ID}', 'clean.user@company.com'),
    ('${USER_WITH_HISTORY_ID}', 'history.user@company.com')
  ON CONFLICT (id) DO NOTHING;

  -- Insert profiles
  INSERT INTO public.profiles (id, full_name, role, status) VALUES
    ('${SUPER_ID}', 'Super Administrator', 'super', 'active'),
    ('${ADMIN_ID}', 'Primary Admin', 'admin', 'active'),
    ('${ADMIN2_ID}', 'Secondary Admin', 'admin', 'active'),
    ('${CLEAN_USER_ID}', 'Clean User Without History', 'staff', 'active'),
    ('${USER_WITH_HISTORY_ID}', 'User With Transactions', 'staff', 'active')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

  -- Insert notifications and project assignment for Clean User
  INSERT INTO public.user_notifications (user_id, title, message) VALUES
    ('${CLEAN_USER_ID}', 'Welcome', 'Welcome to StockFlow');

  INSERT INTO public.user_project_assignments (user_id, project_id, created_by) VALUES
    ('${CLEAN_USER_ID}', gen_random_uuid(), '${SUPER_ID}');

  -- Insert transactions for User With History
  INSERT INTO public.stock_transactions (created_by, quantity) VALUES
    ('${USER_WITH_HISTORY_ID}', 50);
`);

console.log('📋 Running Test Scenarios...');

// Test 1: Authentication Required
console.log('  [1/7] Testing unauthenticated caller...');
await asUser(null);
const res1 = await expectError(`SELECT public.admin_delete_user('${CLEAN_USER_ID}');`);
assert.equal(res1.failed, true);
assert.match(res1.error.message, /Authentication required/i);
console.log('    ✓ Passed: Blocked unauthenticated caller');

// Test 2: Self-Deletion Guard
console.log('  [2/7] Testing self-deletion...');
await asUser(SUPER_ID);
const res2 = await expectError(`SELECT public.admin_delete_user('${SUPER_ID}');`);
assert.equal(res2.failed, true);
assert.match(res2.error.message, /Self-deletion is prohibited/i);
console.log('    ✓ Passed: Blocked self-deletion');

// Test 3: Admin Deleting Super Admin Blocked
console.log('  [3/7] Testing regular Admin attempting to delete Super Admin...');
await asUser(ADMIN_ID);
const res3 = await expectError(`SELECT public.admin_delete_user('${SUPER_ID}');`);
assert.equal(res3.failed, true);
assert.match(res3.error.message, /Only Super Admin can delete Super Admin/i);
console.log('    ✓ Passed: Blocked Admin from deleting Super Admin');

// Test 4: Delete User With History Blocked
console.log('  [4/7] Testing deletion of user with transaction history...');
await asUser(SUPER_ID);
const res4 = await expectError(`SELECT public.admin_delete_user('${USER_WITH_HISTORY_ID}');`);
assert.equal(res4.failed, true);
assert.match(res4.error.message, /Cannot delete user with transaction history/i);
console.log('    ✓ Passed: Blocked deletion of user with transaction history');

// Test 5: Successful Deletion of Clean User
console.log('  [5/7] Testing successful deletion of clean user (Zero history)...');
await asUser(SUPER_ID);
const deleteRes = await db.query(`SELECT public.admin_delete_user('${CLEAN_USER_ID}') as result;`);
const resultJson = deleteRes.rows[0].result;
assert.equal(resultJson.success, true);
assert.equal(resultJson.target_email, 'clean.user@company.com');

// Verify rows purged
const profileCheck = await db.query(`SELECT COUNT(*) as cnt FROM public.profiles WHERE id = '${CLEAN_USER_ID}';`);
assert.equal(Number(profileCheck.rows[0].cnt), 0, 'Profile should be deleted');

const authCheck = await db.query(`SELECT COUNT(*) as cnt FROM auth.users WHERE id = '${CLEAN_USER_ID}';`);
assert.equal(Number(authCheck.rows[0].cnt), 0, 'Auth user should be deleted');

const notifCheck = await db.query(`SELECT COUNT(*) as cnt FROM public.user_notifications WHERE user_id = '${CLEAN_USER_ID}';`);
assert.equal(Number(notifCheck.rows[0].cnt), 0, 'User notifications should be deleted');

const assignCheck = await db.query(`SELECT COUNT(*) as cnt FROM public.user_project_assignments WHERE user_id = '${CLEAN_USER_ID}';`);
assert.equal(Number(assignCheck.rows[0].cnt), 0, 'Project assignments should be deleted');

const auditCheck = await db.query(`
  SELECT details FROM public.audit_logs 
  WHERE action = 'USER_DELETED' 
    AND details->>'target_user_id' = '${CLEAN_USER_ID}';
`);
assert.equal(auditCheck.rows.length, 1, 'Audit log should be recorded');
assert.equal(auditCheck.rows[0].details.target_email, 'clean.user@company.com');
console.log('    ✓ Passed: Clean user deleted atomically with audit log and correct target_email');

// Test 6: Deleting Admin when multiple admins exist vs last admin
console.log('  [6/7] Testing deletion of Admin2 by Super Admin...');
await asUser(SUPER_ID);
await db.exec(`SELECT public.admin_delete_user('${ADMIN2_ID}');`);
const admin2Check = await db.query(`SELECT COUNT(*) as cnt FROM public.profiles WHERE id = '${ADMIN2_ID}';`);
assert.equal(Number(admin2Check.rows[0].cnt), 0);
console.log('    ✓ Passed: Secondary Admin deleted successfully');

// Test 7: Last Admin Deletion Guard
console.log('  [7/7] Testing last active admin guard...');
// Since ADMIN2_ID was deleted in Test 6, ADMIN_ID is now the only active role='admin' left.
// Attempting to delete the last active admin should be rejected!
await asUser(SUPER_ID);
const res7 = await expectError(`SELECT public.admin_delete_user('${ADMIN_ID}');`);
assert.equal(res7.failed, true);
assert.match(res7.error.message, /Cannot delete the last active Administrator/i);
console.log('    ✓ Passed: Last active administrator deletion rejected');

console.log('\n🎉 ALL 7/7 SANDBOX VERIFICATION TESTS PASSED PERFECTLY!');
