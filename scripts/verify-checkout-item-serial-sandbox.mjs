// =============================================================================
// Sandbox Verification of Migration 88: Add checkout item serial management
// Runs on a local Postgres sandbox (PGlite/WASM). Never touches production.
// =============================================================================

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SANDBOX_DIR = path.resolve('test-results/pglite-env');
const PGLITE_ENTRY = path.join(SANDBOX_DIR, 'node_modules/@electric-sql/pglite/dist/index.js');
const FIXTURE_PATH = path.resolve('supabase/tests/fixtures/super_revert_schema.sql');
const MIGRATION_89_PATH = path.resolve('supabase/migrations/89_add_checkout_item_serial_management.sql');

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
  console.error('[SKIP] PGlite is not installed.');
  process.exit(2);
}

const SCHEMA = readFileSync(FIXTURE_PATH, 'utf8');
const MIGRATION_89 = readFileSync(MIGRATION_89_PATH, 'utf8');

const SUPER_USER = '11111111-1111-1111-1111-111111111111';
const ADMIN_USER = '22222222-2222-2222-2222-222222222222';
const SUPERVISOR_USER = '33333333-3333-3333-3333-333333333333';
const STAFF_USER = '44444444-4444-4444-4444-444444444444';

const ITEM_1 = 'aaaaaaaa-1111-0000-0000-000000000001';
const ITEM_2 = 'aaaaaaaa-2222-0000-0000-000000000002';
const ORDER_1 = 'bbbbbbbb-1111-0000-0000-000000000001';
const ORDER_2 = 'bbbbbbbb-2222-0000-0000-000000000002';
const CHECKOUT_ITEM_1 = 'cccccccc-1111-0000-0000-000000000001';
const CHECKOUT_ITEM_2 = 'cccccccc-2222-0000-0000-000000000002';
const RETURN_LOG_1 = 'dddddddd-1111-0000-0000-000000000001';

let failures = 0;
const record = (name, pass, detail = '') => {
  if (!pass) failures += 1;
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

async function run() {
  console.log('--- Initializing Postgres Schema Fixture ---');
  await db.exec(SCHEMA);

  // Align audit_logs and checkout_return_logs with production columns from migrations 78 & 83
  await db.exec(`
    ALTER TABLE public.audit_logs
      ADD COLUMN IF NOT EXISTS actor_role TEXT,
      ADD COLUMN IF NOT EXISTS action_type TEXT,
      ADD COLUMN IF NOT EXISTS target_table TEXT,
      ADD COLUMN IF NOT EXISTS target_id UUID,
      ADD COLUMN IF NOT EXISTS previous_status TEXT,
      ADD COLUMN IF NOT EXISTS new_status TEXT,
      ADD COLUMN IF NOT EXISTS reason TEXT,
      ADD COLUMN IF NOT EXISTS user_agent TEXT;

    ALTER TABLE public.checkout_return_logs
      ADD COLUMN IF NOT EXISTS caim_ticket_id TEXT,
      ADD COLUMN IF NOT EXISTS caim_sync_status TEXT DEFAULT 'not_applicable';

    CREATE OR REPLACE FUNCTION public.request_header(header_name TEXT)
    RETURNS TEXT LANGUAGE sql STABLE AS $$
      SELECT NULL::TEXT;
    $$;
  `);

  // Seed roles & profiles
  await db.exec(`
    INSERT INTO public.roles (code, name) VALUES
      ('SUPER', 'System Administrator'),
      ('ADMIN', 'Administrator'),
      ('SUPERVISOR', 'Supervisor'),
      ('STAFF', 'Staff')
    ON CONFLICT (code) DO NOTHING;

    INSERT INTO public.profiles (id, status, role, role_id, full_name) VALUES
      ('${SUPER_USER}', 'active', 'SUPER', (SELECT id FROM public.roles WHERE code = 'SUPER'), 'Super User'),
      ('${ADMIN_USER}', 'active', 'ADMIN', (SELECT id FROM public.roles WHERE code = 'ADMIN'), 'Admin User'),
      ('${SUPERVISOR_USER}', 'active', 'SUPERVISOR', (SELECT id FROM public.roles WHERE code = 'SUPERVISOR'), 'Supervisor User'),
      ('${STAFF_USER}', 'active', 'STAFF', (SELECT id FROM public.roles WHERE code = 'STAFF'), 'Staff User')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, role_id = EXCLUDED.role_id, status = EXCLUDED.status;

    INSERT INTO public.items (id, name, unit) VALUES
      ('${ITEM_1}', 'HEAT EXCHANGER 65W/K', 'ชิ้น'),
      ('${ITEM_2}', 'TETRA DIB-R5', 'ชิ้น')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.checkout_orders (id, order_number, status, borrower_name) VALUES
      ('${ORDER_1}', 'CHK-202610-001', 'active', 'Somchai'),
      ('${ORDER_2}', 'CHK-202610-002', 'active', 'Wichai')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.checkout_items (id, checkout_order_id, item_id, serial_number, quantity_borrowed, quantity_returned, quantity_damaged) VALUES
      ('${CHECKOUT_ITEM_1}', '${ORDER_1}', '${ITEM_1}', NULL, 1, 0, 1),
      ('${CHECKOUT_ITEM_2}', '${ORDER_2}', '${ITEM_2}', 'ACTIVE-SN-999', 1, 0, 0)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.checkout_return_logs (id, checkout_order_id, checkout_item_id, returned_quantity, item_condition, replaced_serial_number, repair_resolution_status) VALUES
      ('${RETURN_LOG_1}', '${ORDER_1}', '${CHECKOUT_ITEM_1}', 1, 'needs_repair', NULL, 'unresolved')
    ON CONFLICT (id) DO NOTHING;
  `);

  console.log('--- Step 1: Applying Migration 89 (Idempotency Check) ---');
  await db.exec(MIGRATION_89);
  record('Migration 89 applied successfully first time', true);

  await db.exec(MIGRATION_89);
  record('Migration 89 applied successfully second time (idempotent)', true);

  // Check permission registered
  const permRes = await db.query(`
    SELECT code, name, category FROM public.permissions WHERE code = 'checkouts.edit_serial';
  `);
  record('Permission checkouts.edit_serial exists', permRes.rows.length === 1 && permRes.rows[0].code === 'checkouts.edit_serial');

  // Check role_permissions assignments
  const rpRes = await db.query(`
    SELECT r.code FROM public.role_permissions rp
    JOIN public.roles r ON rp.role_id = r.id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE p.code = 'checkouts.edit_serial'
    ORDER BY r.code;
  `);
  const assignedRoles = rpRes.rows.map(r => r.code);
  record('Permission granted to SUPER, ADMIN, SUPERVISOR',
    assignedRoles.includes('SUPER') && assignedRoles.includes('ADMIN') && assignedRoles.includes('SUPERVISOR'),
    JSON.stringify(assignedRoles)
  );

  console.log('--- Step 2: Testing update_checkout_item_serial by Authorized User (ADMIN) ---');
  await asUser(ADMIN_USER);

  const updateRes = await db.query(`
    SELECT public.update_checkout_item_serial(
      $1::uuid,
      $2::text,
      $3::text,
      $4::uuid
    ) AS result;
  `, [CHECKOUT_ITEM_1, 'hex-65w-2026-001', 'Adding serial for damaged CAIM claim', RETURN_LOG_1]);

  const result = updateRes.rows[0].result;
  record('RPC returns success JSONB', result.success === true && result.new_serial === 'HEX-65W-2026-001');

  // Verify checkout_items updated with trimmed uppercase serial
  const ciCheck = await db.query(`SELECT serial_number FROM public.checkout_items WHERE id = $1`, [CHECKOUT_ITEM_1]);
  record('checkout_items.serial_number updated to UPPERCASE', ciCheck.rows[0].serial_number === 'HEX-65W-2026-001');

  // Verify checkout_return_logs updated
  const crlCheck = await db.query(`SELECT replaced_serial_number FROM public.checkout_return_logs WHERE id = $1`, [RETURN_LOG_1]);
  record('checkout_return_logs.replaced_serial_number updated', crlCheck.rows[0].replaced_serial_number === 'HEX-65W-2026-001');

  // Verify audit log recorded
  const auditRes = await db.query(`
    SELECT actor_id, actor_role, action_type, target_table, target_id, previous_status, new_status, reason
    FROM public.audit_logs
    WHERE target_id = $1
    ORDER BY created_at DESC LIMIT 1;
  `, [CHECKOUT_ITEM_1]);
  const auditRow = auditRes.rows[0];
  record('audit_logs entry recorded with action_type CHECKOUT_ITEM_SERIAL_UPDATE',
    auditRow && auditRow.action_type === 'CHECKOUT_ITEM_SERIAL_UPDATE' &&
    auditRow.actor_id === ADMIN_USER &&
    auditRow.new_status === 'HEX-65W-2026-001' &&
    auditRow.previous_status === 'NONE'
  );

  console.log('--- Step 3: Duplicate Active Serial Guard ---');
  try {
    // Attempting to set serial already active in ORDER_2 ('ACTIVE-SN-999')
    await db.query(`
      SELECT public.update_checkout_item_serial(
        $1::uuid,
        'active-sn-999',
        'Attempting duplicate',
        NULL
      );
    `, [CHECKOUT_ITEM_1]);
    record('Duplicate active serial blocked', false, 'Expected exception was not thrown');
  } catch (err) {
    record('Duplicate active serial blocked', err.message.includes('DUPLICATE_ACTIVE_SERIAL'), err.message);
  }

  console.log('--- Step 4: CAIM Already-Synced Guard ---');
  // Mark return log as already synced to CAIM
  await db.query(`
    UPDATE public.checkout_return_logs
    SET caim_ticket_id = 'CLM-2026-0099', caim_sync_status = 'synced'
    WHERE id = $1
  `, [RETURN_LOG_1]);

  // Regular ADMIN cannot change serial once CAIM ticket exists
  try {
    await asUser(ADMIN_USER);
    await db.query(`
      SELECT public.update_checkout_item_serial(
        $1::uuid,
        'HEX-NEW-SERIAL',
        'Admin trying to change after synced',
        $2::uuid
      );
    `, [CHECKOUT_ITEM_1, RETURN_LOG_1]);
    record('ADMIN blocked from editing already-synced CAIM serial', false, 'Expected exception was not thrown');
  } catch (err) {
    record('ADMIN blocked from editing already-synced CAIM serial', err.message.includes('CAIM_ALREADY_SYNCED'), err.message);
  }

  // SUPER role CAN override even after CAIM sync
  await asUser(SUPER_USER);
  const superOverrideRes = await db.query(`
    SELECT public.update_checkout_item_serial(
      $1::uuid,
      'HEX-SUPER-OVERRIDE',
      'Super admin correcting CAIM serial with vendor confirmation',
      $2::uuid
    ) AS result;
  `, [CHECKOUT_ITEM_1, RETURN_LOG_1]);
  record('SUPER allowed to override CAIM-synced serial with reason', superOverrideRes.rows[0].result.new_serial === 'HEX-SUPER-OVERRIDE');

  console.log('--- Step 5: Input Validation Guards ---');
  // Empty serial
  try {
    await db.query(`SELECT public.update_checkout_item_serial($1::uuid, '   ', 'valid reason', NULL);`, [CHECKOUT_ITEM_1]);
    record('Empty serial rejected', false);
  } catch (err) {
    record('Empty serial rejected', err.message.includes('Serial number cannot be empty'));
  }

  // Reason too short
  try {
    await db.query(`SELECT public.update_checkout_item_serial($1::uuid, 'VALID-SN', 'x', NULL);`, [CHECKOUT_ITEM_1]);
    record('Short reason rejected (<2 chars)', false);
  } catch (err) {
    record('Short reason rejected (<2 chars)', err.message.includes('A valid reason'));
  }

  console.log('--- Step 6: Authorization & Authentication Guards ---');
  // Unauthenticated caller
  await asUser(null);
  try {
    await db.query(`SELECT public.update_checkout_item_serial($1::uuid, 'VALID-SN', 'valid reason', NULL);`, [CHECKOUT_ITEM_1]);
    record('Unauthenticated caller blocked', false);
  } catch (err) {
    record('Unauthenticated caller blocked', err.message.includes('User is not authenticated'));
  }

  // Unauthorized STAFF caller
  await asUser(STAFF_USER);
  try {
    await db.query(`SELECT public.update_checkout_item_serial($1::uuid, 'VALID-SN', 'valid reason', NULL);`, [CHECKOUT_ITEM_1]);
    record('Unauthorized STAFF caller blocked', false);
  } catch (err) {
    record('Unauthorized STAFF caller blocked', err.message.includes('Requires checkouts.edit_serial permission'));
  }

  console.log('============================================================');
  if (failures === 0) {
    console.log('[ALL PASS] All Migration 89 SQL sandbox invariants hold!');
    process.exit(0);
  } else {
    console.error(`[FAIL] ${failures} tests failed!`);
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
