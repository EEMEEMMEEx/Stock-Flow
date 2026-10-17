// Deep verification of migration 83 (SUPER revert / undo) on a real Postgres
// (PGlite/WASM). Never touches production.
//
//   npm run verify:super-revert-sql
//
// Applies the schema mirror + migration, re-applies the migration to prove
// idempotency, then exercises every acceptance criterion in
// docs/super-revert-undo-plan.md §5 inside one transaction that is rolled back.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SANDBOX_DIR = path.resolve('test-results/pglite-env');
const PGLITE_ENTRY = path.join(SANDBOX_DIR, 'node_modules/@electric-sql/pglite/dist/index.js');
const FIXTURE = path.resolve('supabase/tests/fixtures/super_revert_schema.sql');
const MIGRATION = readFileSync('supabase/migrations/83_super_revert_actions_and_audit.sql', 'utf8');
const MIGRATION_84 = readFileSync('supabase/migrations/84_harden_super_revert_helpers.sql', 'utf8');
const MIGRATION_85 = readFileSync('supabase/migrations/85_super_revert_checkout_actions.sql', 'utf8');

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

const SCHEMA = readFileSync(FIXTURE, 'utf8');

const SUPER = '11111111-1111-1111-1111-111111111111';
const ADMIN = '22222222-2222-2222-2222-222222222222';
const STAFF = '33333333-3333-3333-3333-333333333333';
const ROLE_SUPER = 'aaaaaaaa-0000-0000-0000-000000000001';
const ROLE_ADMIN = 'aaaaaaaa-0000-0000-0000-000000000002';
const ROLE_STAFF = 'aaaaaaaa-0000-0000-0000-000000000003';
const P1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const P2 = 'bbbbbbbb-0000-0000-0000-000000000002';
const SI1 = 'cccccccc-0000-0000-0000-000000000001';
const SI2 = 'cccccccc-0000-0000-0000-000000000002';
const SI3 = 'cccccccc-0000-0000-0000-000000000003';
const IA = 'dddddddd-0000-0000-0000-000000000001';
const IB = 'dddddddd-0000-0000-0000-000000000002';
const IC = 'dddddddd-0000-0000-0000-000000000003';
const ID = 'dddddddd-0000-0000-0000-000000000004';
const IE = 'dddddddd-0000-0000-0000-000000000005';
const IF = 'dddddddd-0000-0000-0000-000000000006';
const IG = 'dddddddd-0000-0000-0000-000000000007';
const IH = 'dddddddd-0000-0000-0000-000000000008';
const II = 'dddddddd-0000-0000-0000-000000000009';
const IJ = 'dddddddd-0000-0000-0000-000000000012';
const IW2 = 'dddddddd-0000-0000-0000-000000000010';
const IW5 = 'dddddddd-0000-0000-0000-000000000011';
const IW7 = 'dddddddd-0000-0000-0000-000000000013';
const IW8 = 'dddddddd-0000-0000-0000-000000000014';
const IC8 = 'dddddddd-0000-0000-0000-000000000015';
const IC9 = 'dddddddd-0000-0000-0000-000000000016';
const W1 = 'eeeeeeee-0000-0000-0000-000000000001';
const W2 = 'eeeeeeee-0000-0000-0000-000000000002';
const W3 = 'eeeeeeee-0000-0000-0000-000000000003';
const W4 = 'eeeeeeee-0000-0000-0000-000000000004';
const W5 = 'eeeeeeee-0000-0000-0000-000000000005';
const W6 = 'eeeeeeee-0000-0000-0000-000000000006';
const W7 = 'eeeeeeee-0000-0000-0000-000000000007';
const W8 = 'eeeeeeee-0000-0000-0000-000000000008';
const C1 = 'ffffffff-0000-0000-0000-000000000001';
const C3 = 'ffffffff-0000-0000-0000-000000000003';
const C4 = 'ffffffff-0000-0000-0000-000000000004';
const C5 = 'ffffffff-0000-0000-0000-000000000005';
const C6 = 'ffffffff-0000-0000-0000-000000000006';
const C7 = 'ffffffff-0000-0000-0000-000000000007';
const C8 = 'ffffffff-0000-0000-0000-000000000008';
const C9 = 'ffffffff-0000-0000-0000-000000000009';
const CI1A = '99999999-0000-0000-0000-000000000001';
const CI1B = '99999999-0000-0000-0000-000000000002';
const CI3 = '99999999-0000-0000-0000-000000000003';
const CI4 = '99999999-0000-0000-0000-000000000004';
const CI5 = '99999999-0000-0000-0000-000000000005';
const CI6 = '99999999-0000-0000-0000-000000000006';
const CI7A = '99999999-0000-0000-0000-000000000007';
const CI7B = '99999999-0000-0000-0000-000000000008';
const RL3 = '12121212-0000-0000-0000-000000000003';
const RL4 = '12121212-0000-0000-0000-000000000004';
const RL5 = '12121212-0000-0000-0000-000000000005';
const RL6 = '12121212-0000-0000-0000-000000000006';
const RL7A = '12121212-0000-0000-0000-000000000007';
const RL7B = '12121212-0000-0000-0000-000000000008';
const CI8 = '99999999-0000-0000-0000-000000000009';
const CI9 = '99999999-0000-0000-0000-000000000010';
const RL8 = '12121212-0000-0000-0000-000000000009';
const RL9 = '12121212-0000-0000-0000-000000000010';

const results = [];
const record = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
  console.log((pass ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' :: ' + detail : ''));
};

const db = new PGlite();

async function asUser(userId) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId || '']);
}

async function expectError(sql, params = []) {
  // A raised SQL error aborts the whole transaction, so every expected failure
  // runs behind a savepoint that is rolled back before the next assertion.
  await db.exec('SAVEPOINT sp_expect_error');
  try {
    await db.query(sql, params);
    await db.exec('RELEASE SAVEPOINT sp_expect_error');
    return { failed: false, error: null };
  } catch (err) {
    await db.exec('ROLLBACK TO SAVEPOINT sp_expect_error');
    return { failed: true, error: err };
  }
}

async function balance(projectId, itemId) {
  const res = await db.query(
    'SELECT COALESCE(MAX(balance), 0)::int AS b FROM public.stock_balance WHERE project_id = $1 AND item_id = $2',
    [projectId, itemId]
  );
  return Number(res.rows[0].b);
}

async function main() {
  await db.exec(SCHEMA);
  console.log('schema mirror created');

  const seed = [
    "INSERT INTO public.roles (id, code, name) VALUES " +
      "('" + ROLE_SUPER + "', 'SUPER', 'System Administrator')," +
      "('" + ROLE_ADMIN + "', 'ADMIN', 'Administrator')," +
      "('" + ROLE_STAFF + "', 'STAFF', 'Staff');",
    "INSERT INTO public.profiles (id, status, role, role_id, full_name) VALUES " +
      "('" + SUPER + "', 'active', 'SUPER', '" + ROLE_SUPER + "', 'Super User')," +
      "('" + ADMIN + "', 'active', 'ADMIN', '" + ROLE_ADMIN + "', 'Admin User')," +
      "('" + STAFF + "', 'active', 'STAFF', '" + ROLE_STAFF + "', 'Staff User');",
    "INSERT INTO public.projects (id, name, project_code) VALUES " +
      "('" + P1 + "', 'Warehouse One', 'P1'), ('" + P2 + "', 'Warehouse Two', 'P2');",
    "INSERT INTO public.items (id, name, unit) VALUES " +
      "('" + IA + "', 'Item A', 'pcs'), ('" + IB + "', 'Item B', 'pcs'), ('" + IC + "', 'Item C', 'pcs')," +
      "('" + ID + "', 'Item D', 'pcs'), ('" + IE + "', 'Item E', 'pcs'), ('" + IF + "', 'Item F', 'pcs')," +
      "('" + IG + "', 'Item G', 'pcs'), ('" + IH + "', 'Item H', 'pcs'), ('" + II + "', 'Item I', 'pcs'), ('" + IJ + "', 'Item J', 'pcs')," +
      "('" + IW2 + "', 'Item W2', 'pcs'), ('" + IW5 + "', 'Item W5', 'pcs')," +
      "('" + IW7 + "', 'Item W7', 'pcs'), ('" + IW8 + "', 'Item W8', 'pcs')," +
      "('" + IC8 + "', 'Item C8', 'pcs'), ('" + IC9 + "', 'Item C9', 'pcs');",
    "INSERT INTO public.stock_in_orders (id, project_id) VALUES " +
      "('" + SI1 + "', '" + P1 + "'), ('" + SI2 + "', '" + P2 + "'), ('" + SI3 + "', '" + P2 + "');",
    "INSERT INTO public.stock_in_items (order_id, item_id, quantity) VALUES " +
      "('" + SI1 + "', '" + IA + "', 10), ('" + SI1 + "', '" + IB + "', 10), ('" + SI1 + "', '" + IC + "', 10)," +
      "('" + SI1 + "', '" + ID + "', 2), ('" + SI1 + "', '" + IE + "', 5), ('" + SI1 + "', '" + IF + "', 2)," +
      "('" + SI1 + "', '" + IH + "', 5), ('" + SI1 + "', '" + II + "', 5), ('" + SI1 + "', '" + IJ + "', 10)," +
      "('" + SI1 + "', '" + IW2 + "', 5), ('" + SI1 + "', '" + IW5 + "', 1)," +
      "('" + SI1 + "', '" + IW7 + "', 5), ('" + SI1 + "', '" + IW8 + "', 10)," +
      "('" + SI1 + "', '" + IC8 + "', 5), ('" + SI1 + "', '" + IC9 + "', 5)," +
      "('" + SI2 + "', '" + IG + "', 10), ('" + SI3 + "', '" + IF + "', 2);",
    // Ledger that mirrors the pre-revert state.
    "INSERT INTO public.stock_transactions (project_id, item_id, quantity, transaction_type, reference_type, reference_id) VALUES " +
      "('" + P1 + "', '" + IA + "', 3, 'OUT', 'withdrawal_order', '" + W1 + "')," +
      "('" + P2 + "', '" + IG + "', 4, 'OUT', 'withdrawal_order', '" + W1 + "')," +
      "('" + P1 + "', '" + IW2 + "', 2, 'OUT', 'withdrawal_order', '" + W2 + "')," +
      "('" + P1 + "', '" + IW5 + "', 1, 'OUT', 'withdrawal_order', '" + W5 + "')," +
      "('" + P1 + "', '" + IW8 + "', 4, 'OUT', 'withdrawal_order', '" + W8 + "')," +
      "('" + P1 + "', '" + IC8 + "', 2, 'checkout_out', 'checkout_order', '" + C8 + "')," +
      "('" + P1 + "', '" + IC8 + "', 2, 'return_in', 'checkout_return', '" + C8 + "')," +
      "('" + P1 + "', '" + IC9 + "', 2, 'checkout_out', 'checkout_order', '" + C9 + "')," +
      "('" + P1 + "', '" + IC9 + "', 1, 'return_in', 'checkout_return', '" + C9 + "')," +
      "('" + P1 + "', '" + IB + "', 2, 'checkout_out', 'checkout_order', '" + C1 + "')," +
      "('" + P1 + "', '" + IJ + "', 1, 'checkout_out', 'checkout_order', '" + C1 + "')," +
      "('" + P1 + "', '" + IC + "', 2, 'checkout_out', 'checkout_order', '" + C3 + "')," +
      "('" + P1 + "', '" + IC + "', 2, 'return_in', 'checkout_return', '" + C3 + "')," +
      "('" + P1 + "', '" + ID + "', 2, 'checkout_out', 'checkout_order', '" + C4 + "')," +
      "('" + P1 + "', '" + ID + "', 2, 'return_in', 'checkout_return', '" + C4 + "')," +
      "('" + P1 + "', '" + ID + "', 1, 'OUT', 'seed', NULL)," +
      "('" + P1 + "', '" + IE + "', 1, 'checkout_out', 'checkout_order', '" + C5 + "')," +
      "('" + P1 + "', '" + IF + "', 2, 'checkout_out', 'checkout_order', '" + C6 + "')," +
      "('" + P2 + "', '" + IF + "', 2, 'stock_in', 'checkout_return', '" + C6 + "')," +
      "('" + P1 + "', '" + IH + "', 1, 'checkout_out', 'checkout_order', '" + C7 + "')," +
      "('" + P1 + "', '" + II + "', 1, 'checkout_out', 'checkout_order', '" + C7 + "')," +
      "('" + P1 + "', '" + IH + "', 1, 'return_in', 'checkout_return', '" + C7 + "')," +
      "('" + P1 + "', '" + II + "', 1, 'return_in', 'checkout_return', '" + C7 + "');",
    // Withdrawals
    "INSERT INTO public.withdrawal_orders (id, project_id, status, requested_by, approved_by, approved_at, has_shortage, is_shortage_override, override_reason) VALUES " +
      "('" + W1 + "', '" + P1 + "', 'approved', '" + STAFF + "', '" + ADMIN + "', now(), false, false, NULL)," +
      "('" + W2 + "', '" + P1 + "', 'completed', '" + STAFF + "', '" + ADMIN + "', now(), false, false, NULL)," +
      "('" + W3 + "', '" + P1 + "', 'rejected', '" + STAFF + "', NULL, NULL, false, false, NULL)," +
      "('" + W4 + "', '" + P1 + "', 'completed', '" + STAFF + "', '" + ADMIN + "', now(), false, false, NULL)," +
      "('" + W5 + "', '" + P1 + "', 'approved', '" + STAFF + "', '" + ADMIN + "', now(), true, true, 'shortage seed')," +
      "('" + W6 + "', '" + P1 + "', 'rejected', '" + STAFF + "', NULL, NULL, false, false, NULL)," +
      "('" + W7 + "', '" + P1 + "', 'approved', '" + STAFF + "', '" + ADMIN + "', now(), false, false, NULL)," +
      "('" + W8 + "', '" + P1 + "', 'approved', '" + STAFF + "', '" + ADMIN + "', now(), false, false, NULL);",
    "UPDATE public.withdrawal_orders SET rejected_by='" + ADMIN + "', rejected_at=now(), reject_reason='seed reject' WHERE id IN ('" + W3 + "','" + W6 + "');",
    "UPDATE public.withdrawal_orders SET completed_by='" + ADMIN + "', completed_at=now() WHERE id IN ('" + W2 + "','" + W4 + "');",
    "INSERT INTO public.withdrawal_items (order_id, item_id, quantity, requested_qty, project_id, deducted_quantity, shortage_quantity, is_shortage, available_at_approval) VALUES " +
      "('" + W1 + "', '" + IA + "', 3, 3, '" + P1 + "', 3, 0, false, 10)," +
      "('" + W1 + "', '" + IG + "', 4, 4, '" + P2 + "', 4, 0, false, 10)," +
      "('" + W2 + "', '" + IW2 + "', 2, 2, '" + P1 + "', 2, 0, false, 5)," +
      "('" + W3 + "', '" + IA + "', 1, 1, '" + P1 + "', 0, 0, false, NULL)," +
      "('" + W4 + "', '" + IA + "', 1, 1, '" + P1 + "', 1, 0, false, 10)," +
      "('" + W5 + "', '" + IW5 + "', 5, 5, '" + P1 + "', 1, 4, true, 1)," +
      "('" + W7 + "', '" + IW7 + "', 5, 5, '" + P1 + "', 0, 0, false, NULL)," +
      "('" + W8 + "', '" + IW8 + "', 6, 6, '" + P1 + "', 0, 0, false, 4);",
    // Checkouts
    "INSERT INTO public.checkout_orders (id, order_number, project_id, status, borrower_id, borrower_name, created_by, approved_by, approved_at, actual_returned_date) VALUES " +
      "('" + C1 + "', 'CHK-C1', '" + P1 + "', 'active', '" + STAFF + "', 'Borrower', '" + STAFF + "', '" + ADMIN + "', now(), NULL)," +
      "('" + C3 + "', 'CHK-C3', '" + P1 + "', 'completed', '" + STAFF + "', 'Borrower', '" + STAFF + "', '" + ADMIN + "', now(), now())," +
      "('" + C4 + "', 'CHK-C4', '" + P1 + "', 'completed', '" + STAFF + "', 'Borrower', '" + STAFF + "', '" + ADMIN + "', now(), now())," +
      "('" + C5 + "', 'CHK-C5', '" + P1 + "', 'partial_returned', '" + STAFF + "', 'Borrower', '" + STAFF + "', '" + ADMIN + "', now(), NULL)," +
      "('" + C6 + "', 'CHK-C6', '" + P1 + "', 'completed', '" + STAFF + "', 'Borrower', '" + STAFF + "', '" + ADMIN + "', now(), now())," +
      "('" + C7 + "', 'CHK-C7', '" + P1 + "', 'completed', '" + STAFF + "', 'Borrower', '" + STAFF + "', '" + ADMIN + "', now(), now())," +
      "('" + C8 + "', 'CHK-C8', '" + P1 + "', 'cancelled', '" + STAFF + "', 'Borrower', '" + STAFF + "', '" + ADMIN + "', now(), now())," +
      "('" + C9 + "', 'CHK-C9', '" + P1 + "', 'completed', '" + STAFF + "', 'Borrower', '" + STAFF + "', '" + ADMIN + "', now(), now());",
    "INSERT INTO public.checkout_items (id, checkout_order_id, item_id, quantity_borrowed, quantity_returned, quantity_damaged, status) VALUES " +
      "('" + CI1A + "', '" + C1 + "', '" + IB + "', 2, 0, 0, 'borrowed')," +
      "('" + CI1B + "', '" + C1 + "', '" + IJ + "', 1, 0, 0, 'borrowed')," +
      "('" + CI3 + "', '" + C3 + "', '" + IC + "', 2, 2, 0, 'returned')," +
      "('" + CI4 + "', '" + C4 + "', '" + ID + "', 2, 2, 0, 'returned')," +
      "('" + CI5 + "', '" + C5 + "', '" + IE + "', 1, 0, 1, 'returned')," +
      "('" + CI6 + "', '" + C6 + "', '" + IF + "', 2, 2, 0, 'returned')," +
      "('" + CI7A + "', '" + C7 + "', '" + IH + "', 1, 1, 0, 'returned')," +
      "('" + CI7B + "', '" + C7 + "', '" + II + "', 1, 1, 0, 'returned')," +
      "('" + CI8 + "', '" + C8 + "', '" + IC8 + "', 2, 2, 0, 'returned')," +
      "('" + CI9 + "', '" + C9 + "', '" + IC9 + "', 2, 1, 0, 'returned');",
    "INSERT INTO public.checkout_return_logs (id, checkout_order_id, checkout_item_id, returned_quantity, item_condition, destination_project_id, repair_resolution_status) VALUES " +
      "('" + RL3 + "', '" + C3 + "', '" + CI3 + "', 2, 'normal', '" + P1 + "', 'unresolved')," +
      "('" + RL4 + "', '" + C4 + "', '" + CI4 + "', 2, 'normal', '" + P1 + "', 'unresolved')," +
      "('" + RL5 + "', '" + C5 + "', '" + CI5 + "', 1, 'needs_repair', '" + P1 + "', 'restored_to_stock')," +
      "('" + RL6 + "', '" + C6 + "', '" + CI6 + "', 2, 'normal', '" + P2 + "', 'unresolved')," +
      "('" + RL7A + "', '" + C7 + "', '" + CI7A + "', 1, 'normal', '" + P1 + "', 'unresolved')," +
      "('" + RL7B + "', '" + C7 + "', '" + CI7B + "', 1, 'normal', '" + P1 + "', 'unresolved')," +
      "('" + RL8 + "', '" + C8 + "', '" + CI8 + "', 2, 'normal', '" + P1 + "', 'unresolved')," +
      "('" + RL9 + "', '" + C9 + "', '" + CI9 + "', 2, 'normal', '" + P1 + "', 'unresolved');",
  ].join('\n');

  // ---- Fixtures for the migration 85 RPCs ----
  const C10 = 'ffffffff-0000-0000-0000-000000000010';
  const C11 = 'ffffffff-0000-0000-0000-000000000011';
  const C12 = 'ffffffff-0000-0000-0000-000000000012';
  const C13 = 'ffffffff-0000-0000-0000-000000000013';
  const CI10 = '99999999-0000-0000-0000-000000000011';
  const CI11A = '99999999-0000-0000-0000-000000000012';
  const CI11B = '99999999-0000-0000-0000-000000000013';
  const CI12 = '99999999-0000-0000-0000-000000000014';
  const CI13 = '99999999-0000-0000-0000-000000000015';
  const RL11A = '12121212-0000-0000-0000-000000000011';
  const RL11B = '12121212-0000-0000-0000-000000000012';
  const RL13 = '12121212-0000-0000-0000-000000000013';

  await db.exec(`
    INSERT INTO public.checkout_orders (id, order_number, project_id, status, borrower_id, borrower_name, created_by, rejected_by, rejected_at, rejection_reason) VALUES
      ('${C10}', 'CHK-C10', '${P1}', 'rejected', '${STAFF}', 'Borrower', '${STAFF}', '${ADMIN}', now(), 'seed reject');
    INSERT INTO public.checkout_items (id, checkout_order_id, item_id, quantity_borrowed, status) VALUES
      ('${CI10}', '${C10}', '${IA}', 1, 'rejected');
    INSERT INTO public.checkout_orders (id, order_number, project_id, status, borrower_id, borrower_name, created_by, approved_by, approved_at, actual_returned_date) VALUES
      ('${C11}', 'CHK-C11', '${P1}', 'completed', '${STAFF}', 'Borrower', '${STAFF}', '${ADMIN}', now(), now()),
      ('${C12}', 'CHK-C12', '${P1}', 'active', '${STAFF}', 'Borrower', '${STAFF}', '${ADMIN}', now(), NULL),
      ('${C13}', 'CHK-C13', '${P1}', 'completed', '${STAFF}', 'Borrower', '${STAFF}', '${ADMIN}', now(), now());
    INSERT INTO public.checkout_items (id, checkout_order_id, item_id, quantity_borrowed, quantity_returned, status, serial_number) VALUES
      ('${CI11A}', '${C11}', '${IJ}', 1, 1, 'returned', NULL),
      ('${CI11B}', '${C11}', '${II}', 1, 1, 'returned', NULL),
      ('${CI12}', '${C12}', '${IH}', 1, 0, 'borrowed', 'SN-GUARD'),
      ('${CI13}', '${C13}', '${IH}', 1, 1, 'returned', 'SN-GUARD');
    INSERT INTO public.checkout_return_logs (id, checkout_order_id, checkout_item_id, returned_quantity, item_condition, destination_project_id, repair_resolution_status) VALUES
      ('${RL11A}', '${C11}', '${CI11A}', 1, 'normal', '${P1}', 'unresolved'),
      ('${RL11B}', '${C11}', '${CI11B}', 1, 'normal', '${P1}', 'unresolved'),
      ('${RL13}', '${C13}', '${CI13}', 1, 'normal', '${P1}', 'unresolved');
  `);

  await db.exec(seed);

  try {
    await db.exec(MIGRATION);
    record('migration 83 applies on real Postgres without error', true);
  } catch (err) {
    record('migration 83 applies on real Postgres without error', false, err.message);
    throw err;
  }

  try {
    await db.exec(MIGRATION);
    record('migration 83 re-applies (idempotent)', true);
  } catch (err) {
    record('migration 83 re-applies (idempotent)', false, err.message);
  }

  try {
    await db.exec(MIGRATION_84);
    await db.exec(MIGRATION_84);
    record('migration 84 (header hardening) applies twice', true);
  } catch (err) {
    record('migration 84 (header hardening) applies twice', false, err.message);
  }
  try {
    await db.exec(MIGRATION_85);
    await db.exec(MIGRATION_85);
    record('migration 85 (checkout revert completion) applies twice', true);
  } catch (err) {
    record('migration 85 (checkout revert completion) applies twice', false, err.message);
  }

  const headerPrivs = await db.query(
    "SELECT has_function_privilege('anon', 'public.request_header(text)', 'EXECUTE') AS anon_can, " +
    "has_function_privilege('authenticated', 'public.request_header(text)', 'EXECUTE') AS auth_can"
  );
  record('request_header execute is revoked from anon/authenticated',
    headerPrivs.rows[0].anon_can === false && headerPrivs.rows[0].auth_can === false,
    JSON.stringify(headerPrivs.rows[0]));

  const perm = await db.query("SELECT id, category FROM public.permissions WHERE code='system.revert_actions'");
  record('permission system.revert_actions exists', perm.rows.length === 1, JSON.stringify(perm.rows));
  const superPerm = await db.query(
    "SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1 AND p.code='system.revert_actions'",
    [ROLE_SUPER]
  );
  record('SUPER role is granted system.revert_actions', superPerm.rows.length === 1);

  await db.exec('BEGIN');
  try {
    await asUser(SUPER);

    record('seed balances start at the expected values',
      (await balance(P1, IA)) === 7 && (await balance(P2, IG)) === 6 && (await balance(P1, IB)) === 8 &&
      (await balance(P1, IC)) === 10 && (await balance(P1, ID)) === 1 && (await balance(P1, IF)) === 0 &&
      (await balance(P2, IF)) === 2,
      'IA=' + (await balance(P1, IA)) + ' IG=' + (await balance(P2, IG)) + ' IB=' + (await balance(P1, IB)) +
      ' IC=' + (await balance(P1, IC)) + ' ID=' + (await balance(P1, ID)) + ' IF1=' + (await balance(P1, IF)) + ' IF2=' + (await balance(P2, IF)));

    // ---- Authorization / validation ----
    await asUser(ADMIN);
    let e = await expectError("SELECT public.super_revert_withdrawal_action($1::uuid, 'revert_approval', 'x')", [W1]);
    record('ADMIN is rejected with 42501', e.failed && String(e.error.code) === '42501', e.error && (e.error.code + ' ' + e.error.message));

    await asUser('');
    e = await expectError("SELECT public.super_revert_withdrawal_action($1::uuid, 'revert_approval', 'x')", [W1]);
    record('anonymous caller is rejected with 28000', e.failed && String(e.error.code) === '28000', e.error && (e.error.code + ' ' + e.error.message));

    await asUser(SUPER);
    e = await expectError("SELECT public.super_revert_withdrawal_action($1::uuid, 'revert_approval', '   ')", [W1]);
    record('blank reason is rejected with 22023', e.failed && String(e.error.code) === '22023', e.error && (e.error.code + ' ' + e.error.message));

    e = await expectError("SELECT public.super_revert_withdrawal_action($1::uuid, 'revert_approval', 'x')", [W4]);
    record('completed -> revert_approval is blocked with CASCADE_BLOCKED', e.failed && /CASCADE_BLOCKED/.test(e.error.message), e.error && e.error.message);

    e = await expectError("SELECT public.super_revert_withdrawal_action($1::uuid, 'revert_approval', 'x')", ['eeeeeeee-0000-0000-0000-000000000099']);
    record('unknown order is rejected with NOT_FOUND/404', e.failed && /NOT_FOUND/.test(e.error.message), e.error && e.error.message);

    // ---- Withdrawal approval revert ----
    const w1 = await db.query("SELECT public.super_revert_withdrawal_action($1::uuid, 'revert_approval', 'ย้อนอนุมัติ sandbox') AS r", [W1]);
    record('SUPER reverts W1 approval', w1.rows[0].r.success === true && w1.rows[0].r.new_status === 'pending', JSON.stringify(w1.rows[0].r));
    record('W1 restores stock to both source warehouses (IA 10, IG 10)', (await balance(P1, IA)) === 10 && (await balance(P2, IG)) === 10,
      'IA=' + (await balance(P1, IA)) + ' IG=' + (await balance(P2, IG)));
    const w1Order = await db.query("SELECT status, approved_by, approved_at, has_shortage, is_shortage_override, override_reason, last_reverted_by, last_revert_from_status, last_revert_to_status FROM public.withdrawal_orders WHERE id=$1", [W1]);
    record('W1 header is reset with revert metadata',
      w1Order.rows[0].status === 'pending' && w1Order.rows[0].approved_by === null && w1Order.rows[0].approved_at === null &&
      w1Order.rows[0].last_reverted_by === SUPER && w1Order.rows[0].last_revert_from_status === 'approved' && w1Order.rows[0].last_revert_to_status === 'pending',
      JSON.stringify(w1Order.rows[0]));
    const w1Items = await db.query("SELECT available_at_approval, deducted_quantity, shortage_quantity, is_shortage FROM public.withdrawal_items WHERE order_id=$1", [W1]);
    record('W1 lines are reset', w1Items.rows.every(r => r.available_at_approval === null && Number(r.deducted_quantity) === 0 && Number(r.shortage_quantity) === 0 && r.is_shortage === false), JSON.stringify(w1Items.rows));
    const w1Ledger = await db.query("SELECT transaction_type, quantity FROM public.stock_transactions WHERE reference_type='withdrawal_approval_revert' AND reference_id=$1 ORDER BY project_id", [W1]);
    record('W1 ledger has RETURN 3 and RETURN 4 (sum 7)', w1Ledger.rows.length === 2 && w1Ledger.rows.every(r => r.transaction_type === 'RETURN') && w1Ledger.rows.reduce((s, r) => s + Number(r.quantity), 0) === 7, JSON.stringify(w1Ledger.rows));

    // Idempotency / double submit
    const ledgerCountBefore = (await db.query("SELECT COUNT(*)::int AS c FROM public.stock_transactions")).rows[0].c;
    e = await expectError("SELECT public.super_revert_withdrawal_action($1::uuid, 'revert_approval', 'double')", [W1]);
    const ledgerCountAfter = (await db.query("SELECT COUNT(*)::int AS c FROM public.stock_transactions")).rows[0].c;
    record('second revert of W1 is rejected with INVALID_STATE and writes no stock', e.failed && /INVALID_STATE/.test(e.error.message) && ledgerCountBefore === ledgerCountAfter,
      'before=' + ledgerCountBefore + ' after=' + ledgerCountAfter + ' err=' + (e.error && e.error.message));

    // completion revert then approval revert
    const w2c = await db.query("SELECT public.super_revert_withdrawal_action($1::uuid, 'revert_completion', 'ย้อนรับของ') AS r", [W2]);
    record('completed -> approved revert works and keeps stock', w2c.rows[0].r.new_status === 'approved' && (await balance(P1, IW2)) === 3, JSON.stringify(w2c.rows[0].r) + ' balance=' + (await balance(P1, IW2)));
    const w2a = await db.query("SELECT public.super_revert_withdrawal_action($1::uuid, 'revert_approval', 'ย้อนอนุมัติ W2') AS r", [W2]);
    record('approved -> pending revert then restores W2 stock', w2a.rows[0].r.new_status === 'pending' && (await balance(P1, IW2)) === 5, JSON.stringify(w2a.rows[0].r) + ' balance=' + (await balance(P1, IW2)));

    const w3 = await db.query("SELECT public.super_revert_withdrawal_action($1::uuid, 'revert_rejection', 'ย้อนปฏิเสธ') AS r", [W3]);
    const w3row = await db.query('SELECT status, rejected_by, rejected_at, reject_reason FROM public.withdrawal_orders WHERE id=$1', [W3]);
    record('rejected -> pending revert clears rejection fields', w3.rows[0].r.new_status === 'pending' && w3row.rows[0].status === 'pending' && w3row.rows[0].rejected_by === null && w3row.rows[0].reject_reason === null, JSON.stringify(w3row.rows[0]));

    const w5 = await db.query("SELECT public.super_revert_withdrawal_action($1::uuid, 'revert_approval', 'ย้อน shortage') AS r", [W5]);
    const w5item = await db.query('SELECT deducted_quantity, shortage_quantity, is_shortage FROM public.withdrawal_items WHERE order_id=$1', [W5]);
    record('shortage approval revert restores the deducted amount and clears shortage flags',
      w5.rows[0].r.new_status === 'pending' && (await balance(P1, IW5)) === 1 && Number(w5item.rows[0].deducted_quantity) === 0 && Number(w5item.rows[0].shortage_quantity) === 0,
      'balance=' + (await balance(P1, IW5)) + ' item=' + JSON.stringify(w5item.rows[0]));

    // ---- Legacy withdrawal deductions ----
    const beforeIW7 = await balance(P1, IW7);
    const w7 = await expectError("SELECT public.super_revert_withdrawal_action($1::uuid, 'revert_approval', 'legacy unknown')", [W7]);
    const w7row = await db.query('SELECT status FROM public.withdrawal_orders WHERE id=$1', [W7]);
    record('legacy approval with an unknowable deduction is blocked', w7.failed && /LEGACY_STOCK_UNKNOWN/.test(w7.error.message) && w7row.rows[0].status === 'approved' && (await balance(P1, IW7)) === beforeIW7,
      'err=' + (w7.error && w7.error.message) + ' status=' + w7row.rows[0].status);

    const w8 = await db.query("SELECT public.super_revert_withdrawal_action($1::uuid, 'revert_approval', 'legacy derivable') AS r", [W8]);
    record('legacy deduction is derived from available_at_approval', w8.rows[0].r.success === true && Number(w8.rows[0].r.restored_quantity) === 4 && (await balance(P1, IW8)) === 10,
      JSON.stringify(w8.rows[0].r) + ' balance=' + (await balance(P1, IW8)));

    // ---- Checkout approval revert ----
    const c1 = await db.query('SELECT public.super_revert_checkout_approval($1::uuid, $2) AS r', [C1, 'ย้อนอนุมัติใบยืม']);
    record('SUPER reverts C1 approval to pending', c1.rows[0].r.success === true && c1.rows[0].r.new_status === 'pending', JSON.stringify(c1.rows[0].r));
    record('C1 restores stock for every line (IB 10, IJ 10)', (await balance(P1, IB)) === 10 && (await balance(P1, IJ)) === 10,
      'IB=' + (await balance(P1, IB)) + ' IJ=' + (await balance(P1, IJ)));
    const c1items = await db.query('SELECT status FROM public.checkout_items WHERE checkout_order_id=$1', [C1]);
    record('C1 lines return to pending', c1items.rows.every(r => r.status === 'pending'), JSON.stringify(c1items.rows));
    const c1row = await db.query('SELECT status, approved_by, approved_at, last_revert_from_status FROM public.checkout_orders WHERE id=$1', [C1]);
    record('C1 header is reset to pending with metadata', c1row.rows[0].approved_by === null && c1row.rows[0].last_revert_from_status === 'active', JSON.stringify(c1row.rows[0]));

    e = await expectError('SELECT public.super_revert_checkout_approval($1::uuid, $2)', [C1, 'double']);
    record('second checkout approval revert is rejected', e.failed && /INVALID_STATE/.test(e.error.message), e.error && e.error.message);

    // ---- Checkout return revert ----
    const beforeIC = await balance(P1, IC);
    const c3 = await db.query('SELECT public.super_revert_checkout_return($1::uuid, $2) AS r', [RL3, 'ย้อนรับคืน']);
    record('normal return revert works', c3.rows[0].r.success === true && c3.rows[0].r.new_status === 'active', JSON.stringify(c3.rows[0].r));
    record('normal return revert removes the credited stock (10 -> 8)', beforeIC === 10 && (await balance(P1, IC)) === 8, 'before=' + beforeIC + ' after=' + (await balance(P1, IC)));
    const rl3 = await db.query('SELECT is_reverted, reverted_by, reverted_at, revert_reason FROM public.checkout_return_logs WHERE id=$1', [RL3]);
    record('return log is soft-reverted (no delete)', rl3.rows[0].is_reverted === true && rl3.rows[0].reverted_by === SUPER && Boolean(rl3.rows[0].revert_reason), JSON.stringify(rl3.rows[0]));
    const ci3 = await db.query('SELECT quantity_returned, status FROM public.checkout_items WHERE id=$1', [CI3]);
    record('checkout item counters are rolled back', Number(ci3.rows[0].quantity_returned) === 0 && ci3.rows[0].status === 'borrowed', JSON.stringify(ci3.rows[0]));

    e = await expectError('SELECT public.super_revert_checkout_return($1::uuid, $2)', [RL3, 'double']);
    record('second return revert is rejected', e.failed && /INVALID_STATE/.test(e.error.message), e.error && e.error.message);

    const beforeIF2 = await balance(P2, IF);
    const c6 = await db.query('SELECT public.super_revert_checkout_return($1::uuid, $2) AS r', [RL6, 'ย้อนคืนข้ามโครงการ']);
    record('cross-project return revert removes stock from the destination warehouse', c6.rows[0].r.success === true && beforeIF2 === 2 && (await balance(P2, IF)) === 0,
      'before=' + beforeIF2 + ' after=' + (await balance(P2, IF)));

    const c7 = await db.query('SELECT public.super_revert_checkout_return($1::uuid, $2) AS r', [RL7A, 'ย้อนคืนบางส่วน']);
    record('partial return revert sets the order back to partial_returned', c7.rows[0].r.new_status === 'partial_returned' && (await balance(P1, IH)) === 4,
      JSON.stringify(c7.rows[0].r) + ' IH=' + (await balance(P1, IH)));

    const beforeIC8 = await balance(P1, IC8);
    e = await expectError('SELECT public.super_revert_checkout_return($1::uuid, $2)', [RL8, 'cancelled loan']);
    const c8row = await db.query('SELECT status FROM public.checkout_orders WHERE id=$1', [C8]);
    const rl8 = await db.query('SELECT is_reverted FROM public.checkout_return_logs WHERE id=$1', [RL8]);
    record('return on a cancelled loan is rejected without resurrection',
      e.failed && /INVALID_STATE/.test(e.error.message) && c8row.rows[0].status === 'cancelled' && rl8.rows[0].is_reverted === false && (await balance(P1, IC8)) === beforeIC8,
      'err=' + (e.error && e.error.message) + ' status=' + c8row.rows[0].status + ' reverted=' + rl8.rows[0].is_reverted);

    const beforeIC9 = await balance(P1, IC9);
    e = await expectError('SELECT public.super_revert_checkout_return($1::uuid, $2)', [RL9, 'counter mismatch']);
    const mismatchLedger = await db.query("SELECT 1 FROM public.stock_transactions WHERE reference_type='checkout_return_revert' AND reference_id=$1", [RL9]);
    record('counter mismatch is rejected without stock movement',
      e.failed && /INVALID_STATE/.test(e.error.message) && (await balance(P1, IC9)) === beforeIC9 && mismatchLedger.rows.length === 0,
      'err=' + (e.error && e.error.message) + ' balance=' + (await balance(P1, IC9)));

    e = await expectError('SELECT public.super_revert_checkout_return($1::uuid, $2)', [RL5, 'repair']);
    record('damaged return with a repair resolution is blocked', e.failed && /CASCADE_BLOCKED/.test(e.error.message), e.error && e.error.message);

    e = await expectError('SELECT public.super_revert_checkout_return($1::uuid, $2)', [RL4, 'insufficient']);
    record('return revert with insufficient stock is blocked with INSUFFICIENT_STOCK', e.failed && /INSUFFICIENT_STOCK/.test(e.error.message), e.error && e.error.message);

    // ---- Migration 85: checkout rejection revert ----
    const c10 = await db.query('SELECT public.super_revert_checkout_rejection($1::uuid, $2) AS r', [C10, 'ย้อนปฏิเสธใบยืม']);
    const c10row = await db.query('SELECT status, rejected_by, rejection_reason FROM public.checkout_orders WHERE id=$1', [C10]);
    record('checkout rejection revert returns the loan to pending', c10.rows[0].r.success === true && c10.rows[0].r.new_status === 'pending' && c10row.rows[0].status === 'pending' && c10row.rows[0].rejected_by === null && c10row.rows[0].rejection_reason === null, JSON.stringify(c10row.rows[0]));
    const c10items = await db.query('SELECT status FROM public.checkout_items WHERE checkout_order_id=$1', [C10]);
    record('checkout rejection revert flips lines to pending', c10items.rows.every(r => r.status === 'pending'), JSON.stringify(c10items.rows));
    e = await expectError('SELECT public.super_revert_checkout_rejection($1::uuid, $2)', [C10, 'double']);
    record('second rejection revert is rejected', e.failed && /INVALID_STATE/.test(e.error.message), e.error && e.error.message);

    // ---- Migration 85: order-level return revert ----
    const beforeIJ = await balance(P1, IJ);
    const beforeII = await balance(P1, II);
    const c11 = await db.query('SELECT public.super_revert_checkout_order_returns($1::uuid, $2) AS r', [C11, 'ย้อนคืนทั้งใบ']);
    const c11row = await db.query('SELECT status, actual_returned_date FROM public.checkout_orders WHERE id=$1', [C11]);
    const c11logs = await db.query('SELECT is_reverted FROM public.checkout_return_logs WHERE checkout_order_id=$1', [C11]);
    record('order-level revert reverts every live return log', c11.rows[0].r.success === true && Number(c11.rows[0].r.reverted_logs) === 2 && c11logs.rows.every(r => r.is_reverted === true), JSON.stringify(c11.rows[0].r));
    record('order-level revert puts both items back on loan', (await balance(P1, IJ)) === beforeIJ - 1 && (await balance(P1, II)) === beforeII - 1 && c11row.rows[0].status === 'active' && c11row.rows[0].actual_returned_date === null, 'IJ=' + (await balance(P1, IJ)) + ' II=' + (await balance(P1, II)) + ' status=' + c11row.rows[0].status);
    e = await expectError('SELECT public.super_revert_checkout_order_returns($1::uuid, $2)', [C11, 'double']);
    record('second order-level revert is rejected', e.failed && /INVALID_STATE/.test(e.error.message), e.error && e.error.message);

    // ---- Migration 85: damaged repair resolution revert ----
    const rl5repair = await db.query('SELECT public.super_revert_damaged_repair($1::uuid, $2) AS r', [RL5, 'ย้อนผลซ่อม']);
    const rl5row = await db.query('SELECT repair_resolution_status, repair_notes, repair_resolved_at, repair_scrap_disposal_id FROM public.checkout_return_logs WHERE id=$1', [RL5]);
    record('repair resolution revert sets the row back to unresolved', rl5repair.rows[0].r.success === true && rl5repair.rows[0].r.new_status === 'unresolved' && rl5row.rows[0].repair_resolution_status === 'unresolved' && rl5row.rows[0].repair_notes === null && rl5row.rows[0].repair_scrap_disposal_id === null, JSON.stringify(rl5row.rows[0]));
    const rl5return = await db.query('SELECT public.super_revert_checkout_return($1::uuid, $2) AS r', [RL5, 'ย้อนรับคืนหลังย้อนซ่อม']);
    const ci5 = await db.query('SELECT quantity_damaged, status FROM public.checkout_items WHERE id=$1', [CI5]);
    record('return revert works after the repair resolution is reverted', rl5return.rows[0].r.success === true && Number(ci5.rows[0].quantity_damaged) === 0, JSON.stringify(rl5return.rows[0].r));

    // ---- Migration 85: equipment re-loaned guard ----
    const beforeIH = await balance(P1, IH);
    e = await expectError('SELECT public.super_revert_checkout_return($1::uuid, $2)', [RL13, 'SN re-loaned']);
    const rl13 = await db.query('SELECT is_reverted FROM public.checkout_return_logs WHERE id=$1', [RL13]);
    record('return revert is blocked when the S/N is already on loan again', e.failed && /EQUIPMENT_ALREADY_RELOANED/.test(e.error.message) && rl13.rows[0].is_reverted === false && (await balance(P1, IH)) === beforeIH, e.error && e.error.message);
    const guardDef = await db.query("SELECT pg_get_functiondef('public.super_revert_checkout_return(uuid,text)'::regprocedure) AS def");
    record('migration 85 keeps the S/N guard in the final function definition', /EQUIPMENT_ALREADY_RELOANED/.test(guardDef.rows[0].def));

    // ---- Audit trail ----
    const audits = await db.query("SELECT action_type, actor_role, target_table, target_id, previous_status, new_status, reason, ip_address, user_agent FROM public.audit_logs WHERE action_type LIKE '%REVERT%' ORDER BY created_at");
    const byType = new Map(audits.rows.map(r => [r.action_type, r]));
    record('audit rows exist for all five revert action types',
      ['WITHDRAWAL_APPROVAL_REVERT','WITHDRAWAL_COMPLETE_REVERT','WITHDRAWAL_REJECT_REVERT','CHECKOUT_APPROVAL_REVERT','CHECKOUT_RETURN_REVERT'].every(t => byType.has(t)),
      JSON.stringify([...byType.keys()]));
    record('audit rows exist for the migration 85 revert actions',
      ['CHECKOUT_REJECT_REVERT','CHECKOUT_REPAIR_REVERT','CHECKOUT_RETURN_REVERT'].every(t => byType.has(t)),
      JSON.stringify([...byType.keys()]));
    const sample = audits.rows.find(r => r.action_type === 'WITHDRAWAL_APPROVAL_REVERT' && r.target_id === W1);
    record('audit row carries actor role, target, transition and reason',
      sample && sample.actor_role === 'SUPER' && sample.target_table === 'withdrawal_orders' && sample.target_id === W1 &&
      sample.previous_status === 'approved' && sample.new_status === 'pending' && Boolean(sample.reason), JSON.stringify(sample));
    record('audit actor is the SUPER user', (await db.query("SELECT actor_id FROM public.audit_logs WHERE action_type='WITHDRAWAL_APPROVAL_REVERT'")).rows[0].actor_id === SUPER);

    await db.query("SELECT set_config('request.headers', $1, true)", [JSON.stringify({ 'x-forwarded-for': '203.0.113.9', 'user-agent': 'sandbox-agent' })]);
    await db.query("SELECT public.super_revert_withdrawal_action($1::uuid, 'revert_rejection', 'header capture')", [W6]);
    const hdr = await db.query("SELECT ip_address, user_agent FROM public.audit_logs WHERE action_type='WITHDRAWAL_REJECT_REVERT' AND target_id=$1", [W6]);
    record('audit captures x-forwarded-for and user-agent headers', hdr.rows[0].ip_address === '203.0.113.9' && hdr.rows[0].user_agent === 'sandbox-agent', JSON.stringify(hdr.rows[0]));
    await db.query("SELECT set_config('request.headers', '', true)");

    // Append-only
    e = await expectError("UPDATE public.audit_logs SET reason='tampered' WHERE action_type='WITHDRAWAL_APPROVAL_REVERT'");
    record('UPDATE audit_logs is blocked', e.failed && /append-only/.test(e.error.message), e.error && e.error.message);
    e = await expectError("DELETE FROM public.audit_logs WHERE action_type='WITHDRAWAL_APPROVAL_REVERT'");
    record('DELETE audit_logs is blocked', e.failed && /append-only/.test(e.error.message), e.error && e.error.message);

    // FK ON DELETE SET NULL must still work (admin_delete_user compatibility)
    const TEMP = '44444444-4444-4444-4444-444444444444';
    await db.query("INSERT INTO public.profiles (id, status, role, full_name) VALUES ($1, 'active', 'STAFF', 'Temp')", [TEMP]);
    await db.query("INSERT INTO public.audit_logs (actor_id, action) VALUES ($1, 'TEMP_USER_ACTION')", [TEMP]);
    let fkOk = true;
    try {
      await db.query('DELETE FROM public.profiles WHERE id=$1', [TEMP]);
    } catch (err) {
      fkOk = false;
    }
    const tempAudit = await db.query("SELECT actor_id FROM public.audit_logs WHERE action='TEMP_USER_ACTION'");
    record('deleting a profile still nulls audit actor (ON DELETE SET NULL preserved)', fkOk && tempAudit.rows[0] && tempAudit.rows[0].actor_id === null,
      'fkOk=' + fkOk + ' actor=' + (tempAudit.rows[0] && tempAudit.rows[0].actor_id));

    // ---- Permission lock ----
    const revertPermId = perm.rows[0].id;
    await db.query('SELECT public.admin_save_role_permissions($1::uuid, $2::uuid[])', [ROLE_STAFF, '{' + revertPermId + '}']);
    const staffHas = await db.query("SELECT 1 FROM public.role_permissions WHERE role_id=$1 AND permission_id=$2", [ROLE_STAFF, revertPermId]);
    record('assigning system.revert_actions to STAFF is silently stripped', staffHas.rows.length === 0);

    await db.query('SELECT public.admin_save_role_permissions($1::uuid, $2::uuid[])', [ROLE_SUPER, '{}']);
    const superStillHas = await db.query("SELECT 1 FROM public.role_permissions WHERE role_id=$1 AND permission_id=$2", [ROLE_SUPER, revertPermId]);
    record('SUPER always keeps system.revert_actions even when omitted', superStillHas.rows.length === 1);

    const viewDef = await db.query("SELECT pg_get_viewdef('public.stock_balance'::regclass, true) AS def");
    record('stock_balance counts OUT/CHECKOUT and RETURN/return_in',
      /'OUT'/.test(viewDef.rows[0].def) && /'RETURN'/.test(viewDef.rows[0].def) && /'return_in'/.test(viewDef.rows[0].def),
      viewDef.rows[0].def.slice(0, 200));

    const auditPolicy = await db.query(
      "SELECT qual FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='Audit logs admin read'"
    );
    record('audit read policy is SUPER/ADMIN only',
      Boolean(auditPolicy.rows[0]) && /is_super_admin/.test(auditPolicy.rows[0].qual) && !/roles\.view/.test(auditPolicy.rows[0].qual),
      JSON.stringify(auditPolicy.rows[0]));

    const triggerDef = await db.query("SELECT pg_get_functiondef('public.enforce_audit_log_append_only()'::regprocedure) AS def");
    record('append-only exemption is narrowed to FK nulling', /target_user_id/.test(triggerDef.rows[0].def), triggerDef.rows[0].def.slice(0, 160));

    const auditColumns = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name IN ('actor_role','action_type','target_table','target_id','previous_status','new_status','reason','ip_address','user_agent')"
    );
    record('all audit columns exist', auditColumns.rows.length === 9, String(auditColumns.rows.length));

    const triggers = await db.query("SELECT tgname FROM pg_trigger WHERE tgrelid='public.audit_logs'::regclass AND NOT tgisinternal");
    record('append-only trigger exists', triggers.rows.some(r => r.tgname === 'trg_audit_logs_append_only'), JSON.stringify(triggers.rows));

  } finally {
    await db.exec('ROLLBACK');
  }
}

try {
  await main();
} catch (err) {
  console.error('\n[FATAL]', err && err.message ? err.message : err);
  results.push({ name: 'fatal', pass: false, detail: String(err && err.message ? err.message : err) });
}

const failed = results.filter(r => !r.pass);
console.log('\n' + '='.repeat(60));
console.log('SUPER REVERT SQL SANDBOX: ' + (results.length - failed.length) + '/' + results.length + ' PASS');
if (failed.length) {
  console.log('Failed checks:');
  for (const f of failed) console.log(' - ' + f.name + (f.detail ? ' :: ' + f.detail : ''));
}
process.exit(failed.length === 0 ? 0 : 1);
