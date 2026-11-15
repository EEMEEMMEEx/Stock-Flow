// ==============================================================================
// Verification sandbox for Migration 106 (Cancel Pending Checkout Order RPC)
//   node scripts/verify-migration-106-sandbox.mjs
// ==============================================================================

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
  console.log((pass ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' :: ' + detail : ''));
};

const migration106 = read('supabase/migrations/106_cancel_pending_checkout_rpc.sql');

// 1. Static SQL checks
check(
  'migration 106 is wrapped in BEGIN/COMMIT and ends with NOTIFY pgrst',
  /\bBEGIN;/.test(migration106) &&
    /\bCOMMIT;/.test(migration106) &&
    /NOTIFY\s+pgrst\s*,\s*'reload schema'\s*;\s*$/i.test(migration106)
);

check(
  'migration 106 idempotently adds cancellation and updated_at columns on checkout_orders',
  migration106.includes('ADD COLUMN IF NOT EXISTS cancelled_by UUID') &&
    migration106.includes('ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ') &&
    migration106.includes('ADD COLUMN IF NOT EXISTS cancellation_reason TEXT') &&
    migration106.includes('ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()')
);

check(
  'migration 106 defines SECURITY DEFINER cancel_pending_checkout_order with pinned search_path and FOR UPDATE',
  migration106.includes('CREATE OR REPLACE FUNCTION public.cancel_pending_checkout_order(') &&
    migration106.includes('p_order_id UUID') &&
    migration106.includes('p_reason TEXT DEFAULT NULL') &&
    migration106.includes('RETURNS JSONB') &&
    migration106.includes('SECURITY DEFINER') &&
    migration106.includes('SET search_path = public, auth, pg_temp') &&
    migration106.includes('FOR UPDATE')
);

check(
  'migration 106 revokes PUBLIC/anon and grants authenticated/service_role',
  migration106.includes('REVOKE ALL ON FUNCTION public.cancel_pending_checkout_order(UUID, TEXT) FROM PUBLIC, anon;') &&
    migration106.includes('GRANT EXECUTE ON FUNCTION public.cancel_pending_checkout_order(UUID, TEXT) TO authenticated, service_role;')
);

// 2. Migration version prefix uniqueness
const migrationFiles = readdirSync(path.join(root, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();
const seenVersions = new Map();
const duplicates = [];
for (const file of migrationFiles) {
  const version = file.split('_')[0];
  if (seenVersions.has(version)) {
    duplicates.push(`${version}: ${seenVersions.get(version)} vs ${file}`);
  } else {
    seenVersions.set(version, file);
  }
}
check(
  'all migrations have unique numeric prefix version',
  duplicates.length === 0,
  duplicates.join(', ') || 'all unique'
);

const SANDBOX_DIR = path.resolve('test-results/pglite-env');
const PGLITE_ENTRY = path.join(SANDBOX_DIR, 'node_modules/@electric-sql/pglite/dist/index.js');

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

async function runSandbox() {
  const PGlite = await loadPGlite();
  if (!PGlite) {
    console.error('[SKIP] PGlite is not installed. Run:');
    console.error('       npm install --prefix test-results/pglite-env @electric-sql/pglite');
    process.exit(2);
  }

  console.log('\nRunning PGlite SQL Sandbox for Migration 106...');
  const db = new PGlite();

  const FIXTURE_SCHEMA = read('supabase/tests/fixtures/super_revert_schema.sql');
  await db.exec(FIXTURE_SCHEMA);

  // Add production status check constraints from migration 74 and schema_migrations table
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version TEXT PRIMARY KEY);

    ALTER TABLE public.checkout_orders
      DROP CONSTRAINT IF EXISTS checkout_orders_status_check;
    ALTER TABLE public.checkout_orders
      ADD CONSTRAINT checkout_orders_status_check
      CHECK (status IN ('pending', 'active', 'partial_returned', 'completed', 'overdue', 'cancelled', 'rejected'));

    ALTER TABLE public.checkout_items
      DROP CONSTRAINT IF EXISTS checkout_items_status_check;
    ALTER TABLE public.checkout_items
      ADD CONSTRAINT checkout_items_status_check
      CHECK (status IN ('pending', 'borrowed', 'returned', 'damaged', 'lost', 'rejected'));
  `);

  const SUPER_USER = '11111111-1111-1111-1111-111111111111';
  const ADMIN_USER = '22222222-2222-2222-2222-222222222222';
  const STAFF_1 = '33333333-3333-3333-3333-333333333333';
  const STAFF_2 = '44444444-4444-4444-4444-444444444444';
  const OUTSIDER_USER = '55555555-5555-5555-5555-555555555555';
  const PROJECT_1 = 'bbbbbbbb-0000-0000-0000-000000000001';
  const ITEM_A = 'dddddddd-0000-0000-0000-000000000001';
  const ITEM_B = 'dddddddd-0000-0000-0000-000000000002';

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

  // Seed baseline users, project, items
  await db.query(
    `
    INSERT INTO auth.users (id, email) VALUES
      ($1, 'super@company.com'),
      ($2, 'admin@company.com'),
      ($3, 'staff1@company.com'),
      ($4, 'staff2@company.com'),
      ($5, 'outsider@company.com')
    ON CONFLICT (id) DO NOTHING;
  `,
    [SUPER_USER, ADMIN_USER, STAFF_1, STAFF_2, OUTSIDER_USER]
  );

  await db.query(
    `
    INSERT INTO public.profiles (id, status, role, full_name) VALUES
      ($1, 'active', 'SUPER', 'Super Admin'),
      ($2, 'active', 'admin', 'Admin User'),
      ($3, 'active', 'staff', 'Staff One'),
      ($4, 'active', 'staff', 'Staff Two'),
      ($5, 'active', 'staff', 'Outsider Staff')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;
  `,
    [SUPER_USER, ADMIN_USER, STAFF_1, STAFF_2, OUTSIDER_USER]
  );

  await db.query(
    `
    INSERT INTO public.projects (id, name, project_code) VALUES
      ($1, 'Project Alpha', 'PRJ-A')
    ON CONFLICT (id) DO NOTHING;
  `,
    [PROJECT_1]
  );

  await db.query(
    `
    INSERT INTO public.items (id, name, unit) VALUES
      ($1, 'Fiber Tester', 'เครื่อง'),
      ($2, 'OTDR Meter', 'เครื่อง')
    ON CONFLICT (id) DO NOTHING;
  `,
    [ITEM_A, ITEM_B]
  );

  // 3. Idempotent double-apply
  await db.exec(migration106);
  await db.exec(migration106);
  check('PGlite: migration 106 applies cleanly and idempotently (double-apply)', true);

  const migRecord = await db.query(
    `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '106'`
  );
  check('PGlite: migration 106 recorded in schema_migrations', migRecord.rows.length === 1);

  const colCheck = await db.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'checkout_orders'
      AND column_name IN ('cancelled_by', 'cancelled_at', 'cancellation_reason', 'updated_at')
    ORDER BY column_name;
  `);
  check(
    'PGlite: checkout_orders has cancelled_by, cancelled_at, cancellation_reason, updated_at',
    colCheck.rows.length === 4,
    colCheck.rows.map((r) => r.column_name).join(', ')
  );

  // 4. Function privileges & security attributes
  const privCheck = await db.query(`
    SELECT
      p.prosecdef,
      p.proconfig,
      has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cancel_pending_checkout_order';
  `);
  const privRow = privCheck.rows[0];
  check(
    'PGlite: function is SECURITY DEFINER with pinned search_path and revokes PUBLIC/anon EXECUTE',
    privCheck.rows.length === 1 &&
      privRow.prosecdef === true &&
      Array.isArray(privRow.proconfig) &&
      privRow.proconfig.includes('search_path=public, auth, pg_temp') &&
      privRow.public_exec === false &&
      privRow.anon_exec === false &&
      privRow.auth_exec === true &&
      privRow.service_exec === true,
    JSON.stringify(privRow)
  );

  let anonRoleBlocked = false;
  await db.query('BEGIN');
  try {
    await db.query('SET LOCAL ROLE anon');
    await db.query(`SELECT public.cancel_pending_checkout_order($1, NULL)`, [
      'aaaaaaaa-0000-0000-0000-000000000000',
    ]);
  } catch (err) {
    anonRoleBlocked = /permission denied/i.test(err.message);
  } finally {
    await db.query('ROLLBACK');
  }
  check('PGlite: SET LOCAL ROLE anon cannot execute cancel_pending_checkout_order', anonRoleBlocked);

  // 5. Test data setup
  const ORDER_OWNER_REASON = 'aaaaaaaa-1060-0000-0000-000000000001';
  const ORDER_OWNER_BLANK = 'aaaaaaaa-1060-0000-0000-000000000002';
  const ORDER_BORROWER_ONLY = 'aaaaaaaa-1060-0000-0000-000000000003';
  const ORDER_ACTIVE = 'aaaaaaaa-1060-0000-0000-000000000004';
  const ORDER_REJECTED = 'aaaaaaaa-1060-0000-0000-000000000005';
  const ORDER_CANCELLED = 'aaaaaaaa-1060-0000-0000-000000000006';

  await db.query(
    `
    INSERT INTO public.checkout_orders (id, order_number, project_id, status, borrower_id, borrower_name, created_by)
    VALUES
      ($1, 'CHK-202611-0101', $7, 'pending', $8, 'Staff One', $8),
      ($2, 'CHK-202611-0102', $7, 'pending', NULL, 'External Contractor', $8),
      ($3, 'CHK-202611-0103', $7, 'pending', $9, 'Staff Two', $10),
      ($4, 'CHK-202611-0104', $7, 'active', $8, 'Staff One', $8),
      ($5, 'CHK-202611-0105', $7, 'rejected', $8, 'Staff One', $8),
      ($6, 'CHK-202611-0106', $7, 'cancelled', $8, 'Staff One', $8);
  `,
    [
      ORDER_OWNER_REASON,
      ORDER_OWNER_BLANK,
      ORDER_BORROWER_ONLY,
      ORDER_ACTIVE,
      ORDER_REJECTED,
      ORDER_CANCELLED,
      PROJECT_1,
      STAFF_1,
      STAFF_2,
      ADMIN_USER,
    ]
  );

  await db.query(
    `
    INSERT INTO public.checkout_items (checkout_order_id, item_id, quantity_borrowed, status)
    VALUES
      ($1, $5, 2, 'pending'),
      ($1, $6, 1, 'pending'),
      ($2, $5, 3, 'pending'),
      ($3, $6, 4, 'pending'),
      ($4, $5, 1, 'borrowed');
  `,
    [ORDER_OWNER_REASON, ORDER_OWNER_BLANK, ORDER_BORROWER_ONLY, ORDER_ACTIVE, ITEM_A, ITEM_B]
  );

  // 6. Security rejections BEFORE mutating pending orders
  await asUser(null);
  const unauthErr = await expectError(
    `SELECT public.cancel_pending_checkout_order($1, 'test')`,
    [ORDER_OWNER_REASON]
  );
  check(
    'PGlite: unauthenticated call rejected',
    unauthErr.failed && /not authenticated/i.test(unauthErr.error.message),
    unauthErr.error?.message
  );

  await asUser(STAFF_1);
  const nullOrderErr = await expectError(`SELECT public.cancel_pending_checkout_order(NULL, 'test')`);
  check(
    'PGlite: NULL order_id rejected',
    nullOrderErr.failed && /Order ID is required/i.test(nullOrderErr.error.message),
    nullOrderErr.error?.message
  );

  const notFoundErr = await expectError(
    `SELECT public.cancel_pending_checkout_order($1, 'test')`,
    ['ffffffff-ffff-ffff-ffff-ffffffffffff']
  );
  check(
    'PGlite: non-existent order_id rejected',
    notFoundErr.failed && /Checkout order not found/i.test(notFoundErr.error.message),
    notFoundErr.error?.message
  );

  // Non-owner (other staff) rejected on order with borrower_id set AND order with borrower_id = NULL
  await asUser(OUTSIDER_USER);
  const outsiderErr1 = await expectError(
    `SELECT public.cancel_pending_checkout_order($1, 'steal')`,
    [ORDER_OWNER_REASON]
  );
  const outsiderErrNullBorrower = await expectError(
    `SELECT public.cancel_pending_checkout_order($1, 'steal external')`,
    [ORDER_OWNER_BLANK]
  );
  check(
    'PGlite: non-owner staff rejected (both normal and NULL borrower_id orders)',
    outsiderErr1.failed &&
      /Only the request owner/i.test(outsiderErr1.error.message) &&
      outsiderErrNullBorrower.failed &&
      /Only the request owner/i.test(outsiderErrNullBorrower.error.message),
    `${outsiderErr1.error?.message} | ${outsiderErrNullBorrower.error?.message}`
  );

  // Non-owner ADMIN rejected on order owned by STAFF_1
  await asUser(ADMIN_USER);
  const adminNonOwnerErr = await expectError(
    `SELECT public.cancel_pending_checkout_order($1, 'admin override')`,
    [ORDER_OWNER_REASON]
  );
  check(
    'PGlite: non-owner ADMIN rejected by owner-only RPC',
    adminNonOwnerErr.failed && /Only the request owner/i.test(adminNonOwnerErr.error.message),
    adminNonOwnerErr.error?.message
  );

  // Non-pending statuses rejected even for owner
  await asUser(STAFF_1);
  const activeErr = await expectError(`SELECT public.cancel_pending_checkout_order($1, 'nope')`, [ORDER_ACTIVE]);
  const rejectedErr = await expectError(`SELECT public.cancel_pending_checkout_order($1, 'nope')`, [ORDER_REJECTED]);
  const cancelledErr = await expectError(`SELECT public.cancel_pending_checkout_order($1, 'nope')`, [ORDER_CANCELLED]);
  check(
    'PGlite: non-pending statuses (active, rejected, cancelled) rejected',
    activeErr.failed &&
      /must be pending/i.test(activeErr.error.message) &&
      rejectedErr.failed &&
      /must be pending/i.test(rejectedErr.error.message) &&
      cancelledErr.failed &&
      /must be pending/i.test(cancelledErr.error.message),
    `${activeErr.error?.message} | ${rejectedErr.error?.message} | ${cancelledErr.error?.message}`
  );

  // 7. Happy path 1: Owner (created_by) cancels pending order with reason (trimmed)
  await asUser(STAFF_1);
  const res1 = await db.query(
    `SELECT public.cancel_pending_checkout_order($1, $2) AS result`,
    [ORDER_OWNER_REASON, '  เปลี่ยนแผนติดตั้งหน้างาน  ']
  );
  const json1 = res1.rows[0].result;
  const order1Row = (
    await db.query(
      `SELECT status, cancelled_by, cancelled_at, cancellation_reason, updated_at FROM public.checkout_orders WHERE id = $1`,
      [ORDER_OWNER_REASON]
    )
  ).rows[0];
  const items1Rows = (
    await db.query(`SELECT status FROM public.checkout_items WHERE checkout_order_id = $1`, [ORDER_OWNER_REASON])
  ).rows;
  const audit1Rows = (
    await db.query(`SELECT actor_id, action, details FROM public.audit_logs WHERE details->>'order_id' = $1`, [
      ORDER_OWNER_REASON,
    ])
  ).rows;

  check(
    'PGlite: owner (created_by) cancels pending order with trimmed reason',
    json1.success === true &&
      json1.order_id === ORDER_OWNER_REASON &&
      json1.order_number === 'CHK-202611-0101' &&
      json1.status === 'cancelled' &&
      json1.cancelled_by === STAFF_1 &&
      Boolean(json1.cancelled_at) &&
      json1.message.includes('CHK-202611-0101') &&
      order1Row.status === 'cancelled' &&
      order1Row.cancelled_by === STAFF_1 &&
      order1Row.cancelled_at !== null &&
      order1Row.updated_at !== null &&
      order1Row.cancellation_reason === 'เปลี่ยนแผนติดตั้งหน้างาน',
    JSON.stringify({ json1, order1Row })
  );

  check(
    'PGlite: checkout_items updated to rejected on cancel',
    items1Rows.length === 2 && items1Rows.every((r) => r.status === 'rejected'),
    JSON.stringify(items1Rows)
  );

  check(
    'PGlite: audit_logs recorded CHECKOUT_CANCELLED_BY_REQUESTER with reason',
    audit1Rows.length === 1 &&
      audit1Rows[0].actor_id === STAFF_1 &&
      audit1Rows[0].action === 'CHECKOUT_CANCELLED_BY_REQUESTER' &&
      audit1Rows[0].details.order_number === 'CHK-202611-0101' &&
      audit1Rows[0].details.previous_status === 'pending' &&
      audit1Rows[0].details.reason === 'เปลี่ยนแผนติดตั้งหน้างาน',
    JSON.stringify(audit1Rows[0])
  );

  // 8. Happy path 2: Owner cancels pending order with blank/whitespace reason -> stored as NULL
  await asUser(STAFF_1);
  const res2 = await db.query(
    `SELECT public.cancel_pending_checkout_order($1, $2) AS result`,
    [ORDER_OWNER_BLANK, '   ']
  );
  const order2Row = (
    await db.query(`SELECT status, cancellation_reason FROM public.checkout_orders WHERE id = $1`, [ORDER_OWNER_BLANK])
  ).rows[0];
  const items2Rows = (
    await db.query(`SELECT status FROM public.checkout_items WHERE checkout_order_id = $1`, [ORDER_OWNER_BLANK])
  ).rows;
  const audit2Rows = (
    await db.query(`SELECT details FROM public.audit_logs WHERE details->>'order_id' = $1`, [ORDER_OWNER_BLANK])
  ).rows;
  check(
    'PGlite: owner cancels pending order with blank reason (stored as NULL)',
    res2.rows[0].result.status === 'cancelled' &&
      order2Row.status === 'cancelled' &&
      order2Row.cancellation_reason === null &&
      items2Rows.length === 1 &&
      items2Rows[0].status === 'rejected' &&
      audit2Rows.length === 1 &&
      audit2Rows[0].details.reason === null,
    JSON.stringify({ order2Row, audit2: audit2Rows[0] })
  );

  // 9. Happy path 3: Owner via borrower_id only (created_by is someone else) cancels pending order
  await asUser(STAFF_2);
  const res3 = await db.query(`SELECT public.cancel_pending_checkout_order($1) AS result`, [ORDER_BORROWER_ONLY]);
  const order3Row = (
    await db.query(
      `SELECT status, cancelled_by, cancellation_reason FROM public.checkout_orders WHERE id = $1`,
      [ORDER_BORROWER_ONLY]
    )
  ).rows[0];
  const items3Rows = (
    await db.query(`SELECT status FROM public.checkout_items WHERE checkout_order_id = $1`, [ORDER_BORROWER_ONLY])
  ).rows;
  const audit3Rows = (
    await db.query(`SELECT actor_id, action FROM public.audit_logs WHERE details->>'order_id' = $1`, [
      ORDER_BORROWER_ONLY,
    ])
  ).rows;
  check(
    'PGlite: owner (borrower_id only) cancels pending order cleanly',
    res3.rows[0].result.success === true &&
      res3.rows[0].result.cancelled_by === STAFF_2 &&
      order3Row.status === 'cancelled' &&
      order3Row.cancelled_by === STAFF_2 &&
      order3Row.cancellation_reason === null &&
      items3Rows.length === 1 &&
      items3Rows[0].status === 'rejected' &&
      audit3Rows.length === 1 &&
      audit3Rows[0].actor_id === STAFF_2 &&
      audit3Rows[0].action === 'CHECKOUT_CANCELLED_BY_REQUESTER',
    JSON.stringify({ order3Row, audit3: audit3Rows[0] })
  );

  // 10. Zero stock_transactions created
  const txCount = await db.query(`SELECT COUNT(*)::int AS cnt FROM public.stock_transactions`);
  check(
    'PGlite: zero stock_transactions created for pending requisition cancellations',
    txCount.rows[0].cnt === 0,
    `stock_transactions count = ${txCount.rows[0].cnt}`
  );

  // 11. Re-cancelling just-cancelled order is rejected
  await asUser(STAFF_1);
  const reCancelErr = await expectError(`SELECT public.cancel_pending_checkout_order($1, 'again')`, [ORDER_OWNER_REASON]);
  check(
    'PGlite: cancelling already-cancelled pending order is rejected on second attempt',
    reCancelErr.failed && /must be pending/i.test(reCancelErr.error.message),
    reCancelErr.error?.message
  );

  // 12. Verify idempotent column addition on a bare checkout_orders table missing all 4 columns
  const bareDb = new PGlite();
  await bareDb.exec(`
    DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid; $$;
    CREATE TABLE public.checkout_orders (
      id uuid PRIMARY KEY,
      order_number text,
      status text,
      borrower_id uuid,
      created_by uuid
    );
    CREATE TABLE public.checkout_items (
      id uuid PRIMARY KEY,
      checkout_order_id uuid,
      status text
    );
  `);
  await bareDb.exec(migration106);
  const bareCols = await bareDb.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'checkout_orders'
      AND column_name IN ('cancelled_by', 'cancelled_at', 'cancellation_reason', 'updated_at')
    ORDER BY column_name;
  `);
  check(
    'PGlite: migration 106 creates all 4 cancellation/updated_at columns on bare checkout_orders without audit_logs',
    bareCols.rows.length === 4,
    bareCols.rows.map((r) => r.column_name).join(', ')
  );

  console.log('\n============================================================');
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(`MIGRATION 106 VERIFICATION: ${passed}/${total} PASS`);
  if (passed !== total) {
    process.exit(1);
  }
}

runSandbox().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
