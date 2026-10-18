// Verification of Migration 87 (Fix super_cancel_checkout_order schema alignment)
// on a real Postgres sandbox (PGlite/WASM). Never touches production.
//
//   npm run verify:super-cancel-sql
//
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SANDBOX_DIR = path.resolve('test-results/pglite-env');
const PGLITE_ENTRY = path.join(SANDBOX_DIR, 'node_modules/@electric-sql/pglite/dist/index.js');
const FIXTURE_PATH = path.resolve('supabase/tests/fixtures/super_revert_schema.sql');
const MIGRATION_87_PATH = path.resolve('supabase/migrations/87_fix_super_cancel_checkout_order_schema_alignment.sql');

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

const SCHEMA = readFileSync(FIXTURE_PATH, 'utf8');
const MIGRATION_87 = readFileSync(MIGRATION_87_PATH, 'utf8');

const SUPER_USER = '11111111-1111-1111-1111-111111111111';
const ADMIN_USER = '22222222-2222-2222-2222-222222222222';
const STAFF_USER = '33333333-3333-3333-3333-333333333333';
const PROJECT_1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const ITEM_A = 'dddddddd-0000-0000-0000-000000000001';
const ITEM_B = 'dddddddd-0000-0000-0000-000000000002';

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

async function expectError(sql, params = []) {
  try {
    await db.query(sql, params);
    return { failed: false, error: null };
  } catch (err) {
    return { failed: true, error: err };
  }
}

async function run() {
  console.log('--- Initializing Postgres Schema Fixture ---');
  await db.exec(SCHEMA);

  // Seed baseline users
  await db.query(`
    INSERT INTO auth.users (id, email) VALUES
      ($1, 'super@company.com'),
      ($2, 'admin@company.com'),
      ($3, 'staff@company.com')
    ON CONFLICT (id) DO NOTHING;
  `, [SUPER_USER, ADMIN_USER, STAFF_USER]);

  await db.query(`
    INSERT INTO public.profiles (id, status, role, full_name) VALUES
      ($1, 'active', 'SUPER', 'Super Admin'),
      ($2, 'active', 'admin', 'Admin User'),
      ($3, 'active', 'staff', 'Staff User')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;
  `, [SUPER_USER, ADMIN_USER, STAFF_USER]);

  await db.query(`
    INSERT INTO public.projects (id, name, project_code) VALUES
      ($1, 'Project Alpha', 'PRJ-A')
    ON CONFLICT (id) DO NOTHING;
  `, [PROJECT_1]);

  await db.query(`
    INSERT INTO public.items (id, name, unit) VALUES
      ($1, 'Fiber Tester', 'เครื่อง'),
      ($2, 'Splicer Unit', 'เครื่อง')
    ON CONFLICT (id) DO NOTHING;
  `, [ITEM_A, ITEM_B]);

  console.log('--- Step 1: Applying Migration 87 (Idempotency Check) ---');
  await db.exec(MIGRATION_87);
  record('migration 87 applied successfully first time', true);

  await db.exec(MIGRATION_87);
  record('migration 87 applied successfully second time (idempotent)', true);

  // Check updated_at column exists on checkout_orders
  const colRes = await db.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'checkout_orders' AND column_name = 'updated_at';
  `);
  record(
    'checkout_orders.updated_at column exists and is timestamptz',
    colRes.rows.length === 1,
    JSON.stringify(colRes.rows[0])
  );

  console.log('--- Step 2: Testing super_cancel_checkout_order Logic ---');

  // Case 1: Cancel active order with 2 items (one partial, one unreturned)
  const order1Id = 'aaaaaaaa-1111-0000-0000-000000000001';
  const item1Id = 'aaaaaaaa-2222-0000-0000-000000000001';
  const item2Id = 'aaaaaaaa-2222-0000-0000-000000000002';

  await db.query(`
    INSERT INTO public.checkout_orders (id, order_number, project_id, status, borrower_name, created_by)
    VALUES ($1, 'CHK-202610-001', $2, 'active', 'John Doe', $3);
  `, [order1Id, PROJECT_1, STAFF_USER]);

  await db.query(`
    INSERT INTO public.checkout_items (id, checkout_order_id, item_id, quantity_borrowed, quantity_returned, status)
    VALUES
      ($1, $2, $3, 5, 2, 'borrowed'),
      ($4, $2, $5, 2, 0, 'borrowed');
  `, [item1Id, order1Id, ITEM_A, item2Id, ITEM_B]);

  // Execute cancel as SUPER
  await asUser(SUPER_USER);
  const cancelRes = await db.query(`
    SELECT public.super_cancel_checkout_order($1, 'Cancelled by test') AS result;
  `, [order1Id]);

  const resJson = cancelRes.rows[0].result;
  record(
    'RPC super_cancel_checkout_order succeeds for active order',
    resJson.success === true && resJson.status === 'cancelled',
    JSON.stringify(resJson)
  );

  // Verify order header
  const orderCheck = await db.query(`
    SELECT status, cancelled_by, cancelled_at IS NOT NULL as has_at, cancellation_reason, updated_at IS NOT NULL as has_updated
    FROM public.checkout_orders WHERE id = $1;
  `, [order1Id]);
  const o = orderCheck.rows[0];
  record(
    'checkout_order header updated to cancelled with audit fields',
    o.status === 'cancelled' && o.cancelled_by === SUPER_USER && o.has_at && o.has_updated && o.cancellation_reason === 'Cancelled by test',
    JSON.stringify(o)
  );

  // Verify checkout items status
  const itemsCheck = await db.query(`
    SELECT id, status FROM public.checkout_items WHERE checkout_order_id = $1 ORDER BY id;
  `, [order1Id]);
  const allRejected = itemsCheck.rows.every(r => r.status === 'rejected');
  record(
    'checkout_items statuses updated to rejected',
    allRejected && itemsCheck.rows.length === 2,
    JSON.stringify(itemsCheck.rows)
  );

  // Verify stock transactions (unreturned qty: item1=3, item2=2)
  const txCheck = await db.query(`
    SELECT item_id, transaction_type, quantity, reference_type, reference_id, notes
    FROM public.stock_transactions
    WHERE reference_id = $1
    ORDER BY item_id;
  `, [order1Id]);
  const txValid = txCheck.rows.length === 2
    && txCheck.rows.every(r => r.transaction_type === 'RETURN' && r.reference_type === 'checkout_cancellation');
  const qtyMap = Object.fromEntries(txCheck.rows.map(r => [r.item_id, Number(r.quantity)]));
  record(
    'stock_transactions recorded RETURN for unreturned quantities (3 for Item A, 2 for Item B)',
    txValid && qtyMap[ITEM_A] === 3 && qtyMap[ITEM_B] === 2,
    JSON.stringify(txCheck.rows)
  );

  // Verify audit log
  const auditCheck = await db.query(`
    SELECT actor_id, action, details
    FROM public.audit_logs
    WHERE details->>'order_id' = $1;
  `, [order1Id]);
  record(
    'audit_logs recorded CHECKOUT_CANCELLED_BY_SUPER',
    auditCheck.rows.length === 1 && auditCheck.rows[0].action === 'CHECKOUT_CANCELLED_BY_SUPER',
    JSON.stringify(auditCheck.rows[0])
  );

  // Case 2: Cancel partial_returned order
  const order2Id = 'aaaaaaaa-1111-0000-0000-000000000002';
  const item3Id = 'aaaaaaaa-2222-0000-0000-000000000003';

  await db.query(`
    INSERT INTO public.checkout_orders (id, order_number, project_id, status, borrower_name, created_by)
    VALUES ($1, 'CHK-202610-002', $2, 'partial_returned', 'Jane Doe', $3);
  `, [order2Id, PROJECT_1, STAFF_USER]);

  await db.query(`
    INSERT INTO public.checkout_items (id, checkout_order_id, item_id, quantity_borrowed, quantity_returned, status)
    VALUES ($1, $2, $3, 10, 4, 'borrowed');
  `, [item3Id, order2Id, ITEM_A]);

  const cancelRes2 = await db.query(`
    SELECT public.super_cancel_checkout_order($1, 'Cancel partial return') AS result;
  `, [order2Id]);
  record(
    'RPC super_cancel_checkout_order succeeds for partial_returned order',
    cancelRes2.rows[0].result.success === true,
    JSON.stringify(cancelRes2.rows[0].result)
  );

  const txCheck2 = await db.query(`
    SELECT item_id, transaction_type, quantity
    FROM public.stock_transactions
    WHERE reference_id = $1;
  `, [order2Id]);
  record(
    'stock_transactions recorded RETURN for remaining 6 units (10 - 4)',
    txCheck2.rows.length === 1 && Number(txCheck2.rows[0].quantity) === 6,
    JSON.stringify(txCheck2.rows)
  );

  // Case 3: Cancelling already cancelled order throws error
  const errRepeat = await expectError(`SELECT public.super_cancel_checkout_order($1)`, [order1Id]);
  record(
    'cancelling already cancelled order throws exception',
    errRepeat.failed && /already cancelled/i.test(errRepeat.error.message),
    errRepeat.error?.message
  );

  // Case 4: Cancelling non-existent order throws error
  const randomId = 'ffffffff-9999-0000-0000-000000000000';
  const errNotFound = await expectError(`SELECT public.super_cancel_checkout_order($1)`, [randomId]);
  record(
    'cancelling non-existent order throws not found exception',
    errNotFound.failed && /not found/i.test(errNotFound.error.message),
    errNotFound.error?.message
  );

  // Case 5: Non-SUPER role (ADMIN) throws Unauthorized
  await asUser(ADMIN_USER);
  const order3Id = 'aaaaaaaa-1111-0000-0000-000000000003';
  await db.query(`
    INSERT INTO public.checkout_orders (id, order_number, project_id, status, created_by)
    VALUES ($1, 'CHK-202610-003', $2, 'active', $3);
  `, [order3Id, PROJECT_1, STAFF_USER]);

  const errAdmin = await expectError(`SELECT public.super_cancel_checkout_order($1)`, [order3Id]);
  record(
    'ADMIN user is blocked with Requires SUPER role exception',
    errAdmin.failed && /Requires SUPER/i.test(errAdmin.error.message),
    errAdmin.error?.message
  );

  // Case 6: Staff role throws Unauthorized
  await asUser(STAFF_USER);
  const errStaff = await expectError(`SELECT public.super_cancel_checkout_order($1)`, [order3Id]);
  record(
    'STAFF user is blocked with Requires SUPER role exception',
    errStaff.failed && /Requires SUPER/i.test(errStaff.error.message),
    errStaff.error?.message
  );

  // Case 7: Unauthenticated caller throws Unauthorized
  await asUser(null);
  const errUnauth = await expectError(`SELECT public.super_cancel_checkout_order($1)`, [order3Id]);
  record(
    'Unauthenticated caller is blocked with not authenticated exception',
    errUnauth.failed && /not authenticated/i.test(errUnauth.error.message),
    errUnauth.error?.message
  );

  console.log('\n============================================================');
  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;
  console.log(`SUPER CANCEL CHECKOUT ORDER SANDBOX: ${passed}/${total} PASS`);
  if (failed > 0) {
    console.error(`FAILED: ${failed} assertions`);
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
