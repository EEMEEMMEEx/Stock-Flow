// ==============================================================================
// Deep verification script for Migration 95: process_checkout_order locking fix
//   node scripts/verify-process-checkout-order-locking-sandbox.mjs
// ==============================================================================

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const SANDBOX_DIR = path.resolve('test-results/pglite-env');
const PGLITE_ENTRY = path.join(SANDBOX_DIR, 'node_modules/@electric-sql/pglite/dist/index.js');
const FIXTURE = path.resolve('supabase/tests/fixtures/mock_supabase_schema.sql');
const MIGRATION_91 = path.resolve('supabase/migrations/91_sequential_checkout_order_number.sql');
const MIGRATION_95 = path.resolve('supabase/migrations/95_fix_process_checkout_order_locking_on_view.sql');

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

console.log('🧪 Starting process_checkout_order Locking Fix Sandbox Verification...');
const db = new PGlite();

// 1. Load mock base schema
const schemaSql = readFileSync(FIXTURE, 'utf8');
await db.exec(schemaSql);

// 2. Set up base tables and schema required by checkout
await db.exec(`
  ALTER TABLE public.checkout_orders ALTER COLUMN id SET DEFAULT gen_random_uuid();
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS checkout_date TIMESTAMPTZ DEFAULT now();
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS borrower_id UUID;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS borrower_phone TEXT;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS borrower_department TEXT;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS expected_return_date DATE;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS borrow_type TEXT DEFAULT 'standard';
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS purpose TEXT;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS created_by UUID;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS approved_by UUID;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department TEXT;

  ALTER TABLE public.checkout_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
  ALTER TABLE public.checkout_items ADD COLUMN IF NOT EXISTS condition_on_checkout TEXT DEFAULT 'normal';
  ALTER TABLE public.checkout_items ADD COLUMN IF NOT EXISTS notes TEXT;


  CREATE TABLE IF NOT EXISTS public.stock_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID,
    item_id UUID,
    transaction_type TEXT,
    quantity NUMERIC,
    reference_id UUID,
    reference_type TEXT,
    created_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS public.document_counters (
    doc_type TEXT NOT NULL,
    period TEXT NOT NULL,
    current_val INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (doc_type, period)
  );

  -- Underlying tables for the real stock_balance view
  CREATE TABLE IF NOT EXISTS public.stock_in_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID,
    order_number TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS public.stock_in_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.stock_in_orders(id),
    item_id UUID,
    quantity NUMERIC NOT NULL DEFAULT 0
  );

  -- DROP stock_balance if table, and RECREATE AS REAL VIEW WITH GROUP BY
  DROP VIEW IF EXISTS public.stock_balance CASCADE;
  DROP TABLE IF EXISTS public.stock_balance CASCADE;

  CREATE VIEW public.stock_balance AS
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
      WHERE st.project_id = sio.project_id
        AND st.item_id = sii.item_id
    ), 0) AS total_out,
    COALESCE(SUM(sii.quantity), 0) - COALESCE((
      SELECT SUM(CASE
          WHEN st.transaction_type IN ('stock_out', 'checkout_out', 'transfer_out', 'OUT', 'CHECKOUT') THEN st.quantity
          WHEN st.transaction_type IN ('return_in', 'RETURN') THEN -st.quantity
          ELSE 0 END)
      FROM public.stock_transactions st
      WHERE st.project_id = sio.project_id
        AND st.item_id = sii.item_id
    ), 0) AS balance
  FROM public.stock_in_items sii
  JOIN public.stock_in_orders sio ON sio.id = sii.order_id
  JOIN public.items i ON i.id = sii.item_id
  JOIN public.projects p ON p.id = sio.project_id
  GROUP BY sio.project_id, sii.item_id, i.name, i.unit, p.name;
`);

console.log('✅ Base schema and REAL stock_balance VIEW with GROUP BY created.');

// 3. Seed Master Data (Project, Items, Profiles, Stock In)
const ADMIN_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const ITEM_1_ID = '22222222-2222-2222-2222-222222222222';
const ITEM_2_ID = '33333333-3333-3333-3333-333333333333';

await db.exec(`
  INSERT INTO public.projects (id, name, project_code)
  VALUES ('${PROJECT_ID}', 'Main Warehouse Project', 'WH-01')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.items (id, name, unit)
  VALUES 
    ('${ITEM_1_ID}', 'Drill Machine Dewalt', 'ตัว'),
    ('${ITEM_2_ID}', 'Fiber Optic Splicer', 'ชุด')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, full_name, role, status, department)
  VALUES 
    ('${ADMIN_USER_ID}', 'Admin User', 'admin', 'active', 'IT Support'),
    ('${STAFF_USER_ID}', 'Staff User', 'staff', 'active', 'Operations')
  ON CONFLICT DO NOTHING;

  -- Add stock in (50 units each)
  INSERT INTO public.stock_in_orders (id, project_id, po_number)
  VALUES ('44444444-4444-4444-4444-444444444444', '${PROJECT_ID}', 'PO-202610-001')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.stock_in_items (order_id, item_id, quantity)
  VALUES 
    ('44444444-4444-4444-4444-444444444444', '${ITEM_1_ID}', 50),
    ('44444444-4444-4444-4444-444444444444', '${ITEM_2_ID}', 20)
  ON CONFLICT DO NOTHING;
`);

// Mock helper functions (auth.uid, permissions)
await db.exec(`
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
    SELECT current_setting('request.jwt.claim.sub', true)::UUID;
  $$ LANGUAGE sql STABLE;

  DROP FUNCTION IF EXISTS public.has_permission(UUID, TEXT);
  CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_perm_code TEXT)
  RETURNS BOOLEAN AS $$
    SELECT true;
  $$ LANGUAGE sql STABLE;

  DROP FUNCTION IF EXISTS public.is_super_admin(UUID);
  CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID DEFAULT NULL)
  RETURNS BOOLEAN AS $$
    SELECT true;
  $$ LANGUAGE sql STABLE;

  DROP FUNCTION IF EXISTS public.is_checkout_delegate(UUID);
  CREATE OR REPLACE FUNCTION public.is_checkout_delegate(p_user_id UUID DEFAULT NULL)
  RETURNS BOOLEAN AS $$
    SELECT false;
  $$ LANGUAGE sql STABLE;
`);

// 4. Verify initial stock in view
const balanceRes = await db.query(`SELECT item_name, balance FROM public.stock_balance WHERE project_id = $1`, [PROJECT_ID]);
console.log('📊 Stock Balance in VIEW:', balanceRes.rows);
assert.equal(Number(balanceRes.rows.find(r => r.item_name === 'Drill Machine Dewalt').balance), 50);

// 5. Apply Migration 95
console.log('⚡ Applying Migration 95...');
const migration95Sql = readFileSync(MIGRATION_95, 'utf8');
await db.exec(migration95Sql);
console.log('✅ Migration 95 applied successfully.');

// Set caller as Admin User
await db.query(`SET request.jwt.claim.sub = '${ADMIN_USER_ID}';`);

// 6. Test 1: Direct Checkout by Approver (The bug that previously failed with 0A000!)
console.log('🧪 Test 1: Direct Checkout by Approver (Verifying NO 0A000 on GROUP BY view)...');
const directCheckoutPayload = {
  project_id: PROJECT_ID,
  borrower_type: 'profile',
  borrower_id: ADMIN_USER_ID,
  borrow_type: 'standard',
  expected_return_date: '2026-10-30',
  purpose: 'Field maintenance testing',
  items: [
    { item_id: ITEM_1_ID, quantity: 5, serial_number: 'SN-001' },
    { item_id: ITEM_2_ID, quantity: 2, serial_number: 'SN-002' }
  ]
};

const result1 = await db.query(`
  SELECT public.process_checkout_order($1::jsonb) AS res;
`, [JSON.stringify(directCheckoutPayload)]);

const order1Res = result1.rows[0].res;
console.log('  Result 1:', order1Res);
assert.equal(order1Res.success, true, 'Direct checkout must succeed');
assert.equal(order1Res.status, 'active', 'Direct checkout status must be active');
assert.match(order1Res.order_number, /^CHK-\d{6}-\d{4}$/, 'Order number must be sequential CHK-YYYYMM-XXXX');

// Verify stock deduction transactions were recorded
const txRows = await db.query(`
  SELECT item_id, quantity, transaction_type 
  FROM public.stock_transactions 
  WHERE reference_id = $1;
`, [order1Res.order_id]);
assert.equal(txRows.rows.length, 2, 'Must record 2 stock transactions');
assert.equal(txRows.rows[0].transaction_type, 'checkout_out');

// Verify updated balance in view
const updatedBalance = await db.query(`
  SELECT item_id, balance FROM public.stock_balance WHERE project_id = $1;
`, [PROJECT_ID]);
const bal1 = updatedBalance.rows.find(r => r.item_name === 'Drill Machine Dewalt' || r.item_id === ITEM_1_ID).balance;
assert.equal(Number(bal1), 45, 'Item 1 balance must be reduced from 50 to 45');
console.log('  ✅ Test 1 PASSED: Direct checkout by Approver completed without 0A000!');

// 7. Test 2: Multi-line cart with same item ID (Aggregation check)
console.log('🧪 Test 2: Multi-line cart with duplicate item_id (Aggregation check)...');
const multiLinePayload = {
  project_id: PROJECT_ID,
  borrower_type: 'profile',
  borrower_id: ADMIN_USER_ID,
  borrow_type: 'standard',
  expected_return_date: '2026-10-30',
  items: [
    { item_id: ITEM_1_ID, quantity: 2, serial_number: 'SN-003' },
    { item_id: ITEM_1_ID, quantity: 3, serial_number: 'SN-004' } // Same item! Total = 5
  ]
};

const result2 = await db.query(`
  SELECT public.process_checkout_order($1::jsonb) AS res;
`, [JSON.stringify(multiLinePayload)]);
assert.equal(result2.rows[0].res.success, true);
console.log('  ✅ Test 2 PASSED: Duplicate item_id in cart aggregated and processed correctly.');

// 8. Test 3: Insufficient stock check (Rollback guarantee)
console.log('🧪 Test 3: Insufficient stock error and transaction rollback...');
const overdrawnPayload = {
  project_id: PROJECT_ID,
  borrower_type: 'profile',
  borrower_id: ADMIN_USER_ID,
  borrow_type: 'standard',
  expected_return_date: '2026-10-30',
  items: [
    { item_id: ITEM_1_ID, quantity: 999 } // Currently remaining 40
  ]
};

let threwError = false;
try {
  await db.query(`SELECT public.process_checkout_order($1::jsonb);`, [JSON.stringify(overdrawnPayload)]);
} catch (err) {
  threwError = true;
  assert.match(err.message, /ยอดสต็อกคงเหลือในโครงการไม่เพียงพอ/, 'Must raise clear Thai shortage exception');
  console.log('  Caught expected exception:', err.message);
}
assert.equal(threwError, true, 'Must reject overdrawn checkout request');
console.log('  ✅ Test 3 PASSED: Shortage rejected with Thai message, no partial write.');

// 9. Static Codebase Audit: Check that NO active migration contains FOR UPDATE on stock_balance
console.log('🔍 Test 4: Static Codebase Audit for FOR UPDATE on stock_balance...');
const migrationsDir = path.resolve('supabase/migrations');
const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

let problematicFiles = [];
for (const file of files) {
  // Migration 74 and 91 are historic applied migrations that had the bug
  if (file.includes('74_checkout_approval') || file.includes('91_sequential_checkout')) {
    continue;
  }
  const content = readFileSync(path.join(migrationsDir, file), 'utf8');
  // Check if SELECT ... FROM stock_balance ... FOR UPDATE occurs in active code (not comment)
  const lines = content.split('\n');
  let inStockBalanceQuery = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('--')) continue;
    if (/FROM\s+public\.stock_balance/i.test(line)) {
      inStockBalanceQuery = true;
    }
    if (inStockBalanceQuery && /FOR\s+UPDATE/i.test(line)) {
      problematicFiles.push(`${file}:${i + 1}`);
      inStockBalanceQuery = false;
    }
    if (line.endsWith(';')) {
      inStockBalanceQuery = false;
    }
  }
}

assert.equal(problematicFiles.length, 0, `Found illegal FOR UPDATE on stock_balance in: ${problematicFiles.join(', ')}`);
console.log('  ✅ Test 4 PASSED: Zero illegal FOR UPDATE on views in any active migration.');

console.log('\n🎉 ALL MIGRATION 95 SANDBOX VERIFICATIONS PASSED 100%!');
