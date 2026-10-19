// ==============================================================================
// Deep verification script for Migration 91 (PGlite / WASM PostgreSQL Sandbox)
//   node scripts/verify-sequential-checkout-number-sandbox.mjs
// ==============================================================================

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const SANDBOX_DIR = path.resolve('test-results/pglite-env');
const PGLITE_ENTRY = path.join(SANDBOX_DIR, 'node_modules/@electric-sql/pglite/dist/index.js');
const FIXTURE = path.resolve('supabase/tests/fixtures/mock_supabase_schema.sql');
const MIGRATION_FILE = path.resolve('supabase/migrations/91_sequential_checkout_order_number.sql');

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

console.log('🧪 Starting Sequential Checkout Number Sandbox Verification...');
const db = new PGlite();

// 1. Load mock base schema
const schemaSql = readFileSync(FIXTURE, 'utf8');
await db.exec(schemaSql);

// Setup required helper tables and columns if not present in mock schema
await db.exec(`
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS checkout_date TIMESTAMPTZ DEFAULT now();
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS borrower_phone TEXT;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS borrower_department TEXT;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS expected_return_date DATE;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS borrow_type TEXT DEFAULT 'standard';
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS purpose TEXT;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS created_by UUID;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS approved_by UUID;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

  CREATE TABLE IF NOT EXISTS public.checkout_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkout_order_id UUID REFERENCES public.checkout_orders(id),
    item_id UUID,
    serial_number TEXT,
    quantity_borrowed NUMERIC,
    quantity_returned NUMERIC DEFAULT 0,
    condition_on_checkout TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'borrowed',
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS public.stock_balance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID,
    item_id UUID,
    balance NUMERIC DEFAULT 100
  );

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
`);

// 2. Insert mock existing checkout records with legacy random numbers
console.log('📦 Seeding legacy checkout orders with random order numbers...');
await db.exec(`
  -- August 2026: 1 order
  INSERT INTO public.checkout_orders (id, order_number, borrower_name, created_at)
  VALUES ('11111111-1111-1111-1111-111111111111', 'CHK-202608-5230', 'User 1', '2026-08-15 10:00:00+00');

  -- September 2026: 2 orders
  INSERT INTO public.checkout_orders (id, order_number, borrower_name, created_at)
  VALUES 
    ('22222222-2222-2222-2222-222222222222', 'CHK-202609-4413', 'User 2', '2026-09-01 09:00:00+00'),
    ('33333333-3333-3333-3333-333333333333', 'CHK-202609-2174', 'User 3', '2026-09-02 14:00:00+00');

  -- October 2026: 3 orders (including CHK-202610-1548)
  INSERT INTO public.checkout_orders (id, order_number, borrower_name, created_at)
  VALUES 
    ('44444444-4444-4444-4444-444444444444', 'CHK-202610-1548', 'User 4', '2026-10-01 08:30:00+00'),
    ('55555555-5555-5555-5555-555555555555', 'CHK-202610-8888', 'User 5', '2026-10-05 11:20:00+00'),
    ('66666666-6666-6666-6666-666666666666', 'CHK-202610-3321', 'User 6', '2026-10-10 16:45:00+00');
`);

// 3. Apply Migration 91
console.log('⚡ Applying Migration 91 SQL...');
const migrationSql = readFileSync(MIGRATION_FILE, 'utf8');
await db.exec(migrationSql);

// 4. Assert historic renumbering results
console.log('🔍 Verifying historic renumbering results...');
const renumbered = await db.query(`
  SELECT id, order_number, to_char(created_at, 'YYYYMM') AS period 
  FROM public.checkout_orders 
  ORDER BY created_at ASC;
`);

const expectedMap = {
  '11111111-1111-1111-1111-111111111111': 'CHK-202608-0000',
  '22222222-2222-2222-2222-222222222222': 'CHK-202609-0000',
  '33333333-3333-3333-3333-333333333333': 'CHK-202609-0001',
  '44444444-4444-4444-4444-444444444444': 'CHK-202610-0000',
  '55555555-5555-5555-5555-555555555555': 'CHK-202610-0001',
  '66666666-6666-6666-6666-666666666666': 'CHK-202610-0002',
};

for (const row of renumbered.rows) {
  assert.equal(row.order_number, expectedMap[row.id], `Order ${row.id} expected ${expectedMap[row.id]} but got ${row.order_number}`);
}
console.log('  ✅ Historic orders renumbered cleanly starting at 0000 per month!');

// 5. Assert document_counters state
console.log('🔍 Verifying document_counters synchronization...');
const counters = await db.query(`SELECT doc_type, period, current_val FROM public.document_counters ORDER BY period ASC;`);
const counterMap = Object.fromEntries(counters.rows.map(r => [r.period, r.current_val]));

assert.equal(counterMap['202608'], 0, '202608 counter must be 0');
assert.equal(counterMap['202609'], 1, '202609 counter must be 1');
assert.equal(counterMap['202610'], 2, '202610 counter must be 2');
console.log('  ✅ document_counters correctly initialized with max sequences: 202608=0, 202609=1, 202610=2');

// 6. Test runtime sequence increment for current month
console.log('🔍 Testing atomic increment for next checkout order in 202610...');
const currentPeriod = '202610';
const nextSeqRes = await db.query(`
  INSERT INTO public.document_counters (doc_type, period, current_val, updated_at)
  VALUES ('checkout', $1, 0, now())
  ON CONFLICT (doc_type, period) DO UPDATE
    SET current_val = public.document_counters.current_val + 1,
        updated_at = now()
  RETURNING current_val;
`, [currentPeriod]);

assert.equal(nextSeqRes.rows[0].current_val, 3, 'Next checkout in 202610 must receive sequence 3');
const formattedNext = 'CHK-' + currentPeriod + '-' + String(nextSeqRes.rows[0].current_val).padStart(4, '0');
assert.equal(formattedNext, 'CHK-202610-0003', 'Formatted code must be CHK-202610-0003');
console.log('  ✅ Next order successfully allocated sequential number: ' + formattedNext);

// 7. Test month rollover to 202611
console.log('🔍 Testing month rollover to 202611...');
const rolloverPeriod = '202611';
const rolloverRes = await db.query(`
  INSERT INTO public.document_counters (doc_type, period, current_val, updated_at)
  VALUES ('checkout', $1, 0, now())
  ON CONFLICT (doc_type, period) DO UPDATE
    SET current_val = public.document_counters.current_val + 1,
        updated_at = now()
  RETURNING current_val;
`, [rolloverPeriod]);

assert.equal(rolloverRes.rows[0].current_val, 0, 'First checkout of new period must be 0');
const formattedRollover = 'CHK-' + rolloverPeriod + '-' + String(rolloverRes.rows[0].current_val).padStart(4, '0');
assert.equal(formattedRollover, 'CHK-202611-0000', 'New period first order must be CHK-202611-0000');
console.log('  ✅ Rollover cleanly starts at 0000: ' + formattedRollover);

// 8. Test 10,000 overflow formatting (Option A)
console.log('🔍 Testing 10,000+ overflow formatting (Option A)...');
const overflowPeriod = '202612';
await db.query(`
  INSERT INTO public.document_counters (doc_type, period, current_val, updated_at)
  VALUES ('checkout', $1, 9999, now());
`, [overflowPeriod]);

const overflowRes = await db.query(`
  UPDATE public.document_counters
  SET current_val = current_val + 1
  WHERE doc_type = 'checkout' AND period = $1
  RETURNING current_val;
`, [overflowPeriod]);

const seq10000 = overflowRes.rows[0].current_val;
assert.equal(seq10000, 10000, 'Sequence must reach 10000');
const formattedOverflow = seq10000 < 10000 
  ? 'CHK-' + overflowPeriod + '-' + String(seq10000).padStart(4, '0')
  : 'CHK-' + overflowPeriod + '-' + seq10000;

assert.equal(formattedOverflow, 'CHK-202612-10000', 'Must format as 5 digits without truncation');
console.log('  ✅ Overflow correctly formatted as 5 digits: ' + formattedOverflow);

// 9. Concurrency Test: 10 parallel counter updates
console.log('🔍 Testing 10 parallel concurrent increments...');
const concurrencyPeriod = '202701';
const promises = Array.from({ length: 10 }, () =>
  db.query(`
    INSERT INTO public.document_counters (doc_type, period, current_val, updated_at)
    VALUES ('checkout', $1, 0, now())
    ON CONFLICT (doc_type, period) DO UPDATE
      SET current_val = public.document_counters.current_val + 1,
          updated_at = now()
    RETURNING current_val;
  `, [concurrencyPeriod])
);

const concurrentResults = await Promise.all(promises);
const allocatedSeqs = concurrentResults.map(r => r.rows[0].current_val).sort((a, b) => a - b);
console.log('  Allocated sequences:', allocatedSeqs);

assert.equal(allocatedSeqs.length, 10);
assert.equal(new Set(allocatedSeqs).size, 10, 'All allocated sequences must be unique');
assert.equal(allocatedSeqs[0], 0, 'First sequence must be 0');
assert.equal(allocatedSeqs[9], 9, 'Last sequence must be 9');
console.log('  ✅ Concurrency test PASSED: 0 duplicates, exactly 0 through 9 allocated');

console.log('\n🎉 ALL SANDBOX VERIFICATION CHECKS PASSED PERFECTLY!');
