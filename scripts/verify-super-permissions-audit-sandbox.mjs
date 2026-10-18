// Verification of Migration 88 (Complete SUPER Permissions RBAC Audit & Safeguards)
// on a real Postgres sandbox (PGlite/WASM). Never touches production.
//
//   node scripts/verify-super-permissions-audit-sandbox.mjs
//
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SANDBOX_DIR = path.resolve('test-results/pglite-env');
const PGLITE_ENTRY = path.join(SANDBOX_DIR, 'node_modules/@electric-sql/pglite/dist/index.js');
const FIXTURE_PATH = path.resolve('supabase/tests/fixtures/super_revert_schema.sql');
const MIGRATION_88_PATH = path.resolve('supabase/migrations/88_super_permissions_complete_audit.sql');

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
  console.error('[SKIP] PGlite is not installed. Run:');
  console.error('       npm install --prefix test-results/pglite-env @electric-sql/pglite');
  process.exit(2);
}

const FIXTURE_SCHEMA = readFileSync(FIXTURE_PATH, 'utf8');
const MIGRATION_88 = readFileSync(MIGRATION_88_PATH, 'utf8');

const SUPER_USER = '11111111-1111-1111-1111-111111111111';
const ADMIN_USER = '22222222-2222-2222-2222-222222222222';
const STAFF_USER = '33333333-3333-3333-3333-333333333333';
const SUPER_ROLE = 'aaaaaaaa-0000-0000-0000-000000000001';
const ADMIN_ROLE = 'aaaaaaaa-0000-0000-0000-000000000002';
const STAFF_ROLE = 'aaaaaaaa-0000-0000-0000-000000000003';
const PROJECT_1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const PROJECT_2 = 'bbbbbbbb-0000-0000-0000-000000000002';
const ITEM_A = 'dddddddd-0000-0000-0000-000000000001';

const results = [];
const record = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
  console.log((pass ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' :: ' + detail : ''));
};

const db = new PGlite();

async function asUser(userId) {
  if (!userId) {
    await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  } else {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
  }
}

try {
  console.log('--- Initializing Baseline Fixture ---');
  await db.exec(FIXTURE_SCHEMA);

  // Additional tables needed for operational RPCs
  await db.exec(`
    CREATE TABLE IF NOT EXISTS public.categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      code TEXT
    );
    CREATE TABLE IF NOT EXISTS public.site_bom_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id UUID REFERENCES public.categories(id)
    );
  `);

  // Seed roles
  await db.exec(`
    INSERT INTO public.roles (id, code, name) VALUES
      ('${SUPER_ROLE}', 'SUPER', 'System Administrator'),
      ('${ADMIN_ROLE}', 'ADMIN', 'Administrator'),
      ('${STAFF_ROLE}', 'STAFF', 'Staff')
    ON CONFLICT DO NOTHING;
  `);

  // Seed users & profiles
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${SUPER_USER}', 'super@stockflow.com'),
      ('${ADMIN_USER}', 'admin@stockflow.com'),
      ('${STAFF_USER}', 'staff@stockflow.com')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.profiles (id, role, role_id, status, full_name) VALUES
      ('${SUPER_USER}', 'super', '${SUPER_ROLE}', 'active', 'Super Admin'),
      ('${ADMIN_USER}', 'admin', '${ADMIN_ROLE}', 'active', 'Admin User'),
      ('${STAFF_USER}', 'staff', '${STAFF_ROLE}', 'active', 'Staff User')
    ON CONFLICT DO NOTHING;
  `);

  // Seed initial 42 permissions
  const initial42Codes = [
    'dashboard.view', 'projects.view', 'projects.create', 'projects.update', 'projects.delete',
    'items.view', 'items.create', 'items.update', 'items.delete', 'items.transfer', 'items.adjust_stock', 'items.manage',
    'inventory.transfer', 'inventory.manage',
    'stock_in.view', 'stock_in.create',
    'withdrawals.view', 'withdrawals.create', 'withdrawals.approve', 'withdrawals.reject', 'withdrawals.complete',
    'checkouts.view', 'checkouts.create', 'checkouts.return', 'checkouts.extend', 'checkouts.approve',
    'history.view', 'reports.view', 'reports.export',
    'users.view', 'users.create', 'users.update', 'users.deactivate', 'users.reset_password',
    'roles.view', 'roles.create', 'roles.update', 'roles.delete', 'roles.manage_permissions',
    'system.revert_actions',
    'settings.view', 'settings.update'
  ];

  for (const code of initial42Codes) {
    const parts = code.split('.');
    await db.query(
      `INSERT INTO public.permissions (code, name, description, resource, action, category)
       VALUES ($1, $1, $1, $2, $3, 'Initial')
       ON CONFLICT (code) DO NOTHING`,
      [code, parts[0], parts[1] || 'action']
    );
  }

  // Pre-seed role_permissions for SUPER with 41 permissions (excluding items.transfer to simulate legacy bug)
  await db.query(`
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT '${SUPER_ROLE}', p.id
    FROM public.permissions p
    WHERE p.code <> 'items.transfer'
    ON CONFLICT DO NOTHING;
  `);

  const initialSuperPerms = await db.query(
    `SELECT COUNT(*) as count FROM public.role_permissions WHERE role_id = '${SUPER_ROLE}'`
  );
  record('Initial state: SUPER has 41 pre-seeded permissions', Number(initialSuperPerms.rows[0].count) === 41);

  // Pre-seed Migration 86 version of process_item_transfer to simulate existing DB
  await db.exec(`
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
    BEGIN
      RETURN jsonb_build_object('success', true);
    END;
    $$;
  `);

  // ---------------------------------------------------------------------------
  // STEP 1: Apply Migration 88
  // ---------------------------------------------------------------------------
  console.log('--- Step 1: Applying Migration 88 (Idempotency Check) ---');
  await db.exec(MIGRATION_88);
  record('Migration 88 applied cleanly on first run', true);

  // Idempotency: Run migration 88 a second time
  await db.exec(MIGRATION_88);
  record('Migration 88 applied cleanly on second run (idempotent)', true);

  // ---------------------------------------------------------------------------
  // STEP 2: Assert Catalog & SUPER Bound Permissions
  // ---------------------------------------------------------------------------
  console.log('--- Step 2: Assert Catalog & SUPER Permissions ---');
  const catalogCountRes = await db.query(`SELECT COUNT(*) as count FROM public.permissions`);
  const catalogCount = Number(catalogCountRes.rows[0].count);
  record('Catalog has exactly 59 permissions (42 initial + 17 new)', catalogCount === 59, `count=${catalogCount}`);

  const superBoundCountRes = await db.query(
    `SELECT COUNT(*) as count FROM public.role_permissions WHERE role_id = '${SUPER_ROLE}'`
  );
  const superBoundCount = Number(superBoundCountRes.rows[0].count);
  record('SUPER role has all 59 permissions bound in role_permissions', superBoundCount === 59, `count=${superBoundCount}`);

  // Assert items.transfer restored for SUPER
  const itemsTransferRes = await db.query(`
    SELECT EXISTS (
      SELECT 1 FROM public.role_permissions rp
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = '${SUPER_ROLE}' AND p.code = 'items.transfer'
    ) as exists
  `);
  record('SUPER role has items.transfer restored', itemsTransferRes.rows[0].exists === true);

  // Assert all 17 new permissions are bound to SUPER
  const new17Codes = [
    'users.delete', 'users.manage', 'checkouts.reject', 'checkouts.cancel', 'checkouts.update',
    'checkouts.delete', 'checkouts.resolve_repair', 'withdrawals.cancel', 'withdrawals.update',
    'withdrawals.delete', 'stock_in.update', 'stock_in.cancel', 'stock_in.delete',
    'inventory.view', 'system.audit_log.view', 'system.backup', 'system.import_export'
  ];

  const boundNewPermsRes = await db.query(`
    SELECT p.code
    FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = '${SUPER_ROLE}' AND p.code = ANY($1)
  `, [new17Codes]);

  record('All 17 new permissions are bound to SUPER', boundNewPermsRes.rows.length === 17, `found=${boundNewPermsRes.rows.length}/17`);

  // ---------------------------------------------------------------------------
  // STEP 3: Test Trigger trg_auto_grant_permission_to_super
  // ---------------------------------------------------------------------------
  console.log('--- Step 3: Test Auto-Grant Trigger ---');
  await db.query(`
    INSERT INTO public.permissions (code, name, description, resource, action, category)
    VALUES ('future_module.action', 'สิทธิ์ทดสอบอนาคต', 'ทดสอบ Auto Grant', 'future_module', 'action', 'Future')
  `);

  const autoGrantRes = await db.query(`
    SELECT EXISTS (
      SELECT 1 FROM public.role_permissions rp
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = '${SUPER_ROLE}' AND p.code = 'future_module.action'
    ) as exists
  `);
  record('trg_auto_grant_permission_to_super automatically binds new permission to SUPER', autoGrantRes.rows[0].exists === true);

  // ---------------------------------------------------------------------------
  // STEP 4: Test Trigger trg_prevent_super_permission_removal
  // ---------------------------------------------------------------------------
  console.log('--- Step 4: Test Removal Prevention Trigger ---');
  let deleteBlocked = false;
  try {
    const permIdRes = await db.query(`SELECT id FROM public.permissions WHERE code = 'future_module.action'`);
    const permId = permIdRes.rows[0].id;
    await db.query(`DELETE FROM public.role_permissions WHERE role_id = '${SUPER_ROLE}' AND permission_id = '${permId}'`);
  } catch (err) {
    deleteBlocked = err.message.includes('Restricted: Cannot remove permissions from the SUPER');
  }
  record('trg_prevent_super_permission_removal blocks deleting permission from SUPER', deleteBlocked);

  // ---------------------------------------------------------------------------
  // STEP 5: Test admin_save_role_permissions Safeguards
  // ---------------------------------------------------------------------------
  console.log('--- Step 5: Test admin_save_role_permissions RPC ---');
  await asUser(SUPER_USER);

  // Call admin_save_role_permissions for SUPER with an empty array
  const saveSuperRes = await db.query(`SELECT public.admin_save_role_permissions('${SUPER_ROLE}', ARRAY[]::UUID[]) as result`);
  const superCountAfterSaveRes = await db.query(`SELECT COUNT(*) as count FROM public.role_permissions WHERE role_id = '${SUPER_ROLE}'`);
  const superCountAfterSave = Number(superCountAfterSaveRes.rows[0].count);
  record(
    'admin_save_role_permissions for SUPER does NOT strip permissions (retains 100%)',
    superCountAfterSave === 60, // 59 initial + 1 future_module.action
    `count=${superCountAfterSave}`
  );

  // Call admin_save_role_permissions for STAFF attempting to give system.revert_actions
  const revertPermRes = await db.query(`SELECT id FROM public.permissions WHERE code = 'system.revert_actions'`);
  const revertPermId = revertPermRes.rows[0].id;
  await db.query(`SELECT public.admin_save_role_permissions('${STAFF_ROLE}', ARRAY['${revertPermId}']::UUID[])`);

  const staffHasRevertRes = await db.query(`
    SELECT EXISTS (
      SELECT 1 FROM public.role_permissions
      WHERE role_id = '${STAFF_ROLE}' AND permission_id = '${revertPermId}'
    ) as exists
  `);
  record('admin_save_role_permissions strips system.revert_actions from non-SUPER roles', staffHasRevertRes.rows[0].exists === false);

  // ---------------------------------------------------------------------------
  // STEP 6: Test Operational RPCs with New Permissions
  // ---------------------------------------------------------------------------
  console.log('--- Step 6: Test Operational RPCs ---');

  // Test process_item_transfer with inventory.transfer
  await db.query(`INSERT INTO public.projects (id, name, project_code) VALUES ('${PROJECT_1}', 'P1', 'PRJ1'), ('${PROJECT_2}', 'P2', 'PRJ2') ON CONFLICT DO NOTHING;`);
  await db.query(`INSERT INTO public.items (id, name, unit) VALUES ('${ITEM_A}', 'Item A', 'pcs') ON CONFLICT DO NOTHING;`);

  // Give STAFF inventory.transfer
  const invTransferPermRes = await db.query(`SELECT id FROM public.permissions WHERE code = 'inventory.transfer'`);
  await db.query(`INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('${STAFF_ROLE}', '${invTransferPermRes.rows[0].id}') ON CONFLICT DO NOTHING;`);

  await asUser(STAFF_USER);
  const transferRes = await db.query(`
    SELECT public.process_item_transfer('${PROJECT_1}', '${PROJECT_2}', '${ITEM_A}', 5, 'Staff transfer test', '${STAFF_USER}') as res
  `);
  record('process_item_transfer succeeds for caller with inventory.transfer', transferRes.rows[0].res.success === true);

  // Test super_cancel_checkout_order requires checkouts.cancel
  await asUser(STAFF_USER);
  let staffCancelBlocked = false;
  try {
    await db.query(`SELECT public.super_cancel_checkout_order(gen_random_uuid(), 'Staff try cancel')`);
  } catch (err) {
    staffCancelBlocked = err.message.includes('Unauthorized');
  }
  record('super_cancel_checkout_order blocks user without checkouts.cancel', staffCancelBlocked);

  await asUser(SUPER_USER);
  let superCancelExecuted = false;
  try {
    // Should fail with order not found, which proves authorization passed!
    await db.query(`SELECT public.super_cancel_checkout_order(gen_random_uuid(), 'Super cancel')`);
  } catch (err) {
    if (err.message.includes('Checkout order not found')) {
      superCancelExecuted = true;
    }
  }
  record('super_cancel_checkout_order authorizes SUPER user', superCancelExecuted);

  // Summary
  console.log('\n============================================================');
  const allPassed = results.every(r => r.pass);
  console.log(`MIGRATION 88 SANDBOX VERIFICATION: ${results.filter(r => r.pass).length}/${results.length} PASS`);
  console.log('============================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
} catch (error) {
  console.error('[FATAL] Sandbox verification crashed:', error);
  process.exit(1);
}
