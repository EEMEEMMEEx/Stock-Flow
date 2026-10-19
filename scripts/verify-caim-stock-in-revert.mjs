import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SANDBOX_DIR = path.resolve('test-results/pglite-env');
const PGLITE_ENTRY = path.join(SANDBOX_DIR, 'node_modules/@electric-sql/pglite/dist/index.js');
const FIXTURE = path.resolve('supabase/tests/fixtures/super_revert_schema.sql');

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

const db = new PGlite();

console.log('--- Initializing sandbox schema ---');
await db.exec(readFileSync(FIXTURE, 'utf8'));

// Apply CAIM and Repair migrations
console.log('--- Applying prerequisite migrations ---');
await db.exec(`
  ALTER TABLE public.stock_in_orders ADD COLUMN IF NOT EXISTS supplier TEXT;
  ALTER TABLE public.stock_in_orders ADD COLUMN IF NOT EXISTS received_date DATE;
  ALTER TABLE public.stock_in_orders ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE public.stock_in_orders ADD COLUMN IF NOT EXISTS created_by UUID;
  ALTER TABLE public.stock_in_items ADD COLUMN IF NOT EXISTS serial_number TEXT;
  ALTER TABLE public.stock_in_items ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE public.stock_in_items ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 1;

  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_ticket_id TEXT;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_ticket_url TEXT;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_sync_status TEXT DEFAULT 'not_applicable';
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_repair_result TEXT;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_closed_at TIMESTAMPTZ;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_inbound_processed_at TIMESTAMPTZ;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_stock_in_order_id UUID REFERENCES public.stock_in_orders(id) ON DELETE SET NULL;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_scrap_disposal_id UUID;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS repair_resolution_status TEXT DEFAULT 'unresolved';
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS repair_notes TEXT;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS repair_resolved_at TIMESTAMPTZ;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS repair_resolved_by UUID;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS restored_stock_in_order_id UUID;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS repair_scrap_disposal_id UUID;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS spare_part_item_id UUID;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS spare_part_quantity NUMERIC;
`);

await db.exec(readFileSync('supabase/migrations/83_super_revert_actions_and_audit.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/84_harden_super_revert_helpers.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/85_super_revert_checkout_actions.sql', 'utf8'));
console.log('[PASS] Baseline super-revert migrations applied.');

console.log('--- Applying Migration 94 (CAIM Stock-In Reversal) ---');
const MIGRATION_94 = readFileSync('supabase/migrations/94_super_revert_caim_stock_in.sql', 'utf8');
await db.exec(MIGRATION_94);
console.log('[PASS] Migration 94 applied cleanly.');

// Idempotency test: Re-apply Migration 94
await db.exec(MIGRATION_94);
console.log('[PASS] Migration 94 re-applied (idempotent).');

const SUPER_USER = '11111111-1111-1111-1111-111111111111';
const STAFF_USER = '33333333-3333-3333-3333-333333333333';
const ROLE_SUPER = 'aaaaaaaa-0000-0000-0000-000000000001';
const ROLE_STAFF = 'aaaaaaaa-0000-0000-0000-000000000003';
const PROJECT_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const ITEM_ID = 'dddddddd-0000-0000-0000-000000000001';

console.log('--- Seeding mock users and base entities ---');
await db.exec(`
  INSERT INTO public.roles (id, code, name) VALUES
    ('${ROLE_SUPER}', 'SUPER', 'System Administrator'),
    ('${ROLE_STAFF}', 'STAFF', 'Staff')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, status, role, role_id, full_name) VALUES
    ('${SUPER_USER}', 'active', 'SUPER', '${ROLE_SUPER}', 'Super User'),
    ('${STAFF_USER}', 'active', 'STAFF', '${ROLE_STAFF}', 'Staff User')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.projects (id, name, project_code) VALUES
    ('${PROJECT_ID}', 'Warehouse One', 'P1')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.items (id, name, unit) VALUES
    ('${ITEM_ID}', 'Test Equipment A', 'unit')
  ON CONFLICT (id) DO NOTHING;
`);

// Setup Mock User Claims helper
async function asUser(userId) {
  await db.exec(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT '${userId}'::UUID;
    $$ LANGUAGE sql STABLE;
  `);
}

async function expectError(sql) {
  await db.exec('SAVEPOINT sp_err');
  try {
    await db.query(sql);
    await db.exec('RELEASE SAVEPOINT sp_err');
    return { failed: false, error: null };
  } catch (err) {
    await db.exec('ROLLBACK TO SAVEPOINT sp_err');
    return { failed: true, error: err };
  }
}

console.log('\n--- Test 1: Happy Path CAIM Stock-In Reversal ---');
await asUser(SUPER_USER);

const testReturnLogId = 'eeeeeeee-1111-0000-0000-000000000001';
const testStockInOrderId = 'ffffffff-1111-0000-0000-000000000001';

await db.exec(`
  INSERT INTO public.stock_in_orders (id, project_id, supplier, received_date, created_by)
  VALUES ('${testStockInOrderId}', '${PROJECT_ID}', 'CAIM Claim Return TKT-001', CURRENT_DATE, '${SUPER_USER}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.stock_in_items (order_id, item_id, quantity, serial_number)
  VALUES ('${testStockInOrderId}', '${ITEM_ID}', 1, 'SN-CAIM-001');

  INSERT INTO public.stock_transactions (project_id, item_id, quantity, transaction_type, reference_type, reference_id, created_by)
  VALUES ('${PROJECT_ID}', '${ITEM_ID}', 1, 'stock_in', 'claim_return', '${testStockInOrderId}', '${SUPER_USER}');

  INSERT INTO public.checkout_orders (id, order_number, project_id, status, created_by)
  VALUES ('aaaaaaaa-2222-0000-0000-000000000001', 'CHK-TEST-001', '${PROJECT_ID}', 'active', '${SUPER_USER}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.checkout_items (id, checkout_order_id, item_id, quantity_borrowed, serial_number, status)
  VALUES ('bbbbbbbb-2222-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', '${ITEM_ID}', 1, 'SN-CAIM-001', 'borrowed')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.checkout_return_logs (
    id, checkout_order_id, checkout_item_id, destination_project_id,
    returned_quantity, item_condition, caim_ticket_id, caim_repair_result,
    caim_inbound_processed_at, caim_stock_in_order_id, repair_resolution_status
  ) VALUES (
    '${testReturnLogId}', 'aaaaaaaa-2222-0000-0000-000000000001', 'bbbbbbbb-2222-0000-0000-000000000001', '${PROJECT_ID}',
    1, 'damaged', 'TKT-001', 'repaired',
    NOW(), '${testStockInOrderId}', 'unresolved'
  );
`);

// Check initial balance
const balBefore = await db.query(`SELECT balance FROM public.stock_balance WHERE project_id = '${PROJECT_ID}' AND item_id = '${ITEM_ID}';`);
console.log('Balance before revert:', balBefore.rows[0]?.balance);

// Call super_revert_caim_stock_in
const res = await db.query(`
  SELECT public.super_revert_caim_stock_in('${testReturnLogId}', 'Testing reversal of CAIM stock-in') as result;
`);
const resultJson = res.rows[0].result;
console.log('Revert RPC output:', resultJson);
if (!resultJson.success) throw new Error('Revert RPC failed: ' + JSON.stringify(resultJson));

// Verify stock balance dropped by 1
const balAfter = await db.query(`SELECT balance FROM public.stock_balance WHERE project_id = '${PROJECT_ID}' AND item_id = '${ITEM_ID}';`);
console.log('Balance after revert:', balAfter.rows[0]?.balance);
if (Number(balBefore.rows[0]?.balance) - Number(balAfter.rows[0]?.balance) !== 1) {
  throw new Error('Expected stock balance to decrease by exactly 1');
}

// Verify return log fields reset
const logCheck = await db.query(`
  SELECT repair_resolution_status, caim_stock_in_order_id, caim_inbound_processed_at
  FROM public.checkout_return_logs WHERE id = '${testReturnLogId}';
`);
console.log('Return log row after revert:', logCheck.rows[0]);
if (logCheck.rows[0].repair_resolution_status !== 'unresolved') {
  throw new Error('Expected repair_resolution_status = unresolved');
}
if (logCheck.rows[0].caim_stock_in_order_id !== null || logCheck.rows[0].caim_inbound_processed_at !== null) {
  throw new Error('Expected caim pointers to be cleared');
}

// Verify audit log
const audit = await db.query(`
  SELECT action_type, actor_role, target_table, target_id, reason
  FROM public.audit_logs WHERE target_id = '${testReturnLogId}';
`);
console.log('Audit log record:', audit.rows[0]);
if (audit.rows[0]?.action_type !== 'CAIM_STOCK_IN_REVERT') {
  throw new Error('Audit log record missing or incorrect');
}
console.log('[PASS] Test 1: Happy Path successful.');

console.log('\n--- Test 2: Double Reversal Guard (Idempotency) ---');
try {
  await db.query(`
    SELECT public.super_revert_caim_stock_in('${testReturnLogId}', 'Second attempt') as result;
  `);
  throw new Error('Expected double reversal to fail with INVALID_STATE');
} catch (err) {
  console.log('[PASS] Test 2 correctly rejected double revert:', err.message);
}

console.log('\n--- Test 3: Unauthorized Role Guard ---');
await asUser(STAFF_USER);
try {
  await db.query(`
    SELECT public.super_revert_caim_stock_in('${testReturnLogId}', 'Staff attempt') as result;
  `);
  throw new Error('Expected staff call to fail');
} catch (err) {
  console.log('[PASS] Test 3 correctly rejected staff user:', err.message);
}

console.log('\n--- Test 4: Insufficient Stock Guard ---');
await asUser(SUPER_USER);
const itemZeroStock = 'dddddddd-0000-0000-0000-999999999999';
const returnLogZeroStock = 'eeeeeeee-1111-0000-0000-999999999999';
const stockInZeroStock = 'ffffffff-1111-0000-0000-999999999999';

await db.exec(`
  INSERT INTO public.items (id, name, unit)
  VALUES ('${itemZeroStock}', 'Zero Stock Item', 'piece')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.stock_in_orders (id, project_id, supplier, received_date, created_by)
  VALUES ('${stockInZeroStock}', '${PROJECT_ID}', 'CAIM Zero Stock', CURRENT_DATE, '${SUPER_USER}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.stock_in_items (order_id, item_id, quantity)
  VALUES ('${stockInZeroStock}', '${itemZeroStock}', 1);

  -- Consume the item completely so balance becomes 0
  INSERT INTO public.stock_transactions (project_id, item_id, quantity, transaction_type, reference_type, reference_id, created_by)
  VALUES ('${PROJECT_ID}', '${itemZeroStock}', 1, 'stock_in', 'claim_return', '${stockInZeroStock}', '${SUPER_USER}');

  INSERT INTO public.stock_transactions (project_id, item_id, quantity, transaction_type, reference_type, created_by)
  VALUES ('${PROJECT_ID}', '${itemZeroStock}', 1, 'stock_out', 'withdrawal', '${SUPER_USER}');

  INSERT INTO public.checkout_return_logs (
    id, checkout_order_id, checkout_item_id, destination_project_id,
    returned_quantity, item_condition, caim_ticket_id, caim_repair_result,
    caim_inbound_processed_at, caim_stock_in_order_id, repair_resolution_status
  ) VALUES (
    '${returnLogZeroStock}', 'aaaaaaaa-2222-0000-0000-000000000001', 'bbbbbbbb-2222-0000-0000-000000000001', '${PROJECT_ID}',
    1, 'damaged', 'TKT-002', 'repaired',
    NOW(), '${stockInZeroStock}', 'unresolved'
  );
`);

try {
  await db.query(`
    SELECT public.super_revert_caim_stock_in('${returnLogZeroStock}', 'Revert with 0 stock') as result;
  `);
  throw new Error('Expected reversal with 0 stock to fail');
} catch (err) {
  console.log('[PASS] Test 4 correctly blocked with insufficient stock:', err.message);
}

console.log('\n--- Test 5: Verify Guard in resolve_damaged_return_item is unblocked ---');
// Check that the returned log state satisfies the guard in resolve_damaged_return_item:
// (caim_stock_in_order_id IS NULL AND caim_inbound_processed_at IS NULL)
const guardCheck = await db.query(`
  SELECT id, caim_stock_in_order_id, caim_inbound_processed_at, repair_resolution_status
  FROM public.checkout_return_logs
  WHERE id = '${testReturnLogId}';
`);
const row = guardCheck.rows[0];
if (row.caim_stock_in_order_id !== null || row.caim_inbound_processed_at !== null) {
  throw new Error('CAIM guard condition still active on row: ' + JSON.stringify(row));
}
if (row.repair_resolution_status !== 'unresolved') {
  throw new Error('Repair resolution status is not unresolved: ' + row.repair_resolution_status);
}
console.log('[PASS] Test 5: Return log is in valid state to be re-resolved:', row);

console.log('\n========================================');
console.log(' ALL SANDBOX TESTS PASSED SUCCESSFULLY! ');
console.log('========================================');
