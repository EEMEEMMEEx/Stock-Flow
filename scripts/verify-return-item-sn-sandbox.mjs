// ==============================================================================
// Verification script for Migration 103 (Returned Serial Number Support & RPCs)
// Run: node scripts/verify-return-item-sn-sandbox.mjs
// ==============================================================================

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve('.');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
  console.log((pass ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' :: ' + detail : ''));
};

const migration101 = read('supabase/migrations/101_photo_return_verification_workflow.sql');
const migration102 = read('supabase/migrations/102_fix_scrap_caim_state_machine_and_constraints.sql');
const migration103 = read('supabase/migrations/103_add_return_serial_number_support.sql');

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

const PGlite = await loadPGlite();
if (!PGlite) {
  console.error('[SKIP] PGlite is not installed.');
  process.exit(2);
}

console.log('Running PGlite SQL Sandbox for Migration 103...');
const db = new PGlite();

// 1. Mock base schema
const fixtureSql = read('supabase/tests/fixtures/mock_supabase_schema.sql');
await db.exec(fixtureSql);

await db.exec(`
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
  ALTER TABLE public.checkout_orders ALTER COLUMN id SET DEFAULT gen_random_uuid();
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS borrower_id UUID;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS created_by UUID;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS actual_returned_date TIMESTAMPTZ;
  ALTER TABLE public.checkout_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

  ALTER TABLE public.checkout_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
  ALTER TABLE public.checkout_items ADD COLUMN IF NOT EXISTS quantity_consumed NUMERIC NOT NULL DEFAULT 0;
  ALTER TABLE public.checkout_items ADD COLUMN IF NOT EXISTS replaced_serial_number TEXT;
  ALTER TABLE public.checkout_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

  ALTER TABLE public.checkout_return_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS replaced_serial_number TEXT;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS is_reverted BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_sync_status TEXT;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_ticket_id TEXT;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_ticket_url TEXT;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_repair_result TEXT;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_closed_at TIMESTAMPTZ;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_inbound_status TEXT DEFAULT 'none';
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_inbound_payload JSONB;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_inbound_processed_at TIMESTAMPTZ;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_stock_in_order_id UUID;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_scrap_disposal_id UUID;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS repair_resolution_status TEXT DEFAULT 'unresolved';
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS repair_resolved_at TIMESTAMPTZ;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS repair_resolved_by UUID;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS repair_notes TEXT;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS repair_stock_in_order_id UUID;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS repair_scrap_disposal_id UUID;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS spare_part_item_id UUID;
  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS spare_part_quantity NUMERIC;

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

  CREATE TABLE IF NOT EXISTS public.scrap_disposal_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkout_return_log_id UUID,
    checkout_order_id UUID,
    project_id UUID,
    item_id UUID,
    quantity NUMERIC,
    serial_number TEXT,
    reason TEXT,
    disposal_method TEXT,
    caim_ticket_id TEXT,
    caim_closed_at TIMESTAMPTZ,
    closed_by TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS public.stock_in_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID,
    supplier TEXT,
    notes TEXT,
    received_date DATE,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS public.stock_in_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID,
    item_id UUID,
    quantity NUMERIC,
    serial_number TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT
  );

  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_id UUID;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;

  CREATE TABLE IF NOT EXISTS public.caim_webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,
    ticket_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    repair_result TEXT,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS public.checkout_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkout_order_id UUID,
    action TEXT,
    actor_id UUID,
    actor_role TEXT,
    details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE VIEW public.v_current_stock AS
  SELECT project_id, item_id, 100::NUMERIC AS current_stock
  FROM public.stock_transactions
  GROUP BY project_id, item_id;

  CREATE OR REPLACE FUNCTION public.request_header(header_name TEXT)
  RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT NULL::TEXT;
  $$;

  CREATE OR REPLACE FUNCTION public.push_notifications(
    p_recipients UUID[],
    p_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_link TEXT,
    p_ref_id UUID,
    p_project_id UUID,
    p_metadata JSONB
  ) RETURNS VOID LANGUAGE sql AS $$ SELECT NULL; $$;

  CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_perm_code TEXT)
  RETURNS BOOLEAN
  LANGUAGE sql
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_user_id AND UPPER(role) IN ('ADMIN', 'SUPER', 'SUPERADMIN')
    );
  $$;

  CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID DEFAULT auth.uid())
  RETURNS BOOLEAN
  LANGUAGE sql
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_user_id AND UPPER(role) IN ('SUPER', 'SUPERADMIN')
    );
  $$;
`);

// Apply migration 101, 102, then 103
await db.exec(migration101);
await db.exec(migration102);

// Test migration 103 idempotent execution
await db.exec(migration103);
await db.exec(migration103);
check('PGlite: migration 103 executes idempotently across repeated runs', true);

// Check column and index exist
const colRes = await db.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'checkout_return_logs' AND column_name = 'returned_serial_number'
`);
check('checkout_return_logs has returned_serial_number column', colRes.rows.length === 1);

const idxRes = await db.query(`
  SELECT indexname 
  FROM pg_indexes 
  WHERE tablename = 'checkout_return_logs' AND indexname = 'idx_checkout_return_logs_returned_serial'
`);
check('idx_checkout_return_logs_returned_serial index exists', idxRes.rows.length === 1);

// Seed test users, projects, items, orders
const adminId = '00000000-0000-0000-0000-000000000001';
const borrowerId = '00000000-0000-0000-0000-000000000002';
const projectAId = '00000000-0000-0000-0000-000000000010';
const projectBId = '00000000-0000-0000-0000-000000000011';
const itemId = '00000000-0000-0000-0000-000000000020';

await db.exec(`
  INSERT INTO auth.users (id, email) VALUES
    ('${adminId}', 'admin@stockflow.test'),
    ('${borrowerId}', 'borrower@stockflow.test');

  INSERT INTO public.profiles (id, role, status) VALUES
    ('${adminId}', 'ADMIN', 'active'),
    ('${borrowerId}', 'USER', 'active');

  INSERT INTO public.projects (id, name, project_code, status) VALUES
    ('${projectAId}', 'Warehouse A', 'WH-A', 'active'),
    ('${projectBId}', 'Warehouse B', 'WH-B', 'active');

  INSERT INTO public.items (id, name, unit) VALUES
    ('${itemId}', 'Optical Power Meter', 'pcs');
`);

async function setAuth(userId) {
  if (!userId) {
    await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  } else {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
  }
}

// ----------------------------------------------------------------------------
// Test 1: Zero-lock return (return without S/N)
// ----------------------------------------------------------------------------
const order1Id = '00000000-0000-0000-0000-000000000031';
const item1Id = '00000000-0000-0000-0000-000000000041';

await db.exec(`
  INSERT INTO public.checkout_orders (id, order_number, project_id, borrower_id, borrower_name, status, created_by) VALUES
    ('${order1Id}', 'CO-ZERO-LOCK', '${projectAId}', '${borrowerId}', 'Borrower User', 'active', '${borrowerId}');
  INSERT INTO public.checkout_items (id, checkout_order_id, item_id, quantity_borrowed, quantity_returned, serial_number, status) VALUES
    ('${item1Id}', '${order1Id}', '${itemId}', 1, 0, NULL, 'borrowed');
`);

await setAuth(borrowerId);
const ret1 = await db.query(`
  SELECT public.process_return_order($1::JSONB) AS result;
`, [JSON.stringify({
  order_id: order1Id,
  returns: [{
    checkout_item_id: item1Id,
    returned_quantity: 1,
    condition: 'normal',
    returned_serial_number: '', // Empty -> zero lock
    evidence_photo_url: 'https://r2.stockflow.test/proof1.jpg'
  }]
})]);

const log1 = await db.query(`SELECT * FROM public.checkout_return_logs WHERE checkout_order_id = $1`, [order1Id]);
check('Zero-lock: process_return_order succeeds without S/N and stores NULL', log1.rows[0].returned_serial_number === null);

// ----------------------------------------------------------------------------
// Test 2: Return WITH S/N -> trimmed, uppercased, and auto-backfill on confirm
// ----------------------------------------------------------------------------
const order2Id = '00000000-0000-0000-0000-000000000032';
const item2Id = '00000000-0000-0000-0000-000000000042';

await db.exec(`
  INSERT INTO public.checkout_orders (id, order_number, project_id, borrower_id, borrower_name, status, created_by) VALUES
    ('${order2Id}', 'CO-WITH-SN', '${projectAId}', '${borrowerId}', 'Borrower User', 'active', '${borrowerId}');
  INSERT INTO public.checkout_items (id, checkout_order_id, item_id, quantity_borrowed, quantity_returned, serial_number, status) VALUES
    ('${item2Id}', '${order2Id}', '${itemId}', 1, 0, NULL, 'borrowed');
`);

await setAuth(borrowerId);
await db.query(`
  SELECT public.process_return_order($1::JSONB) AS result;
`, [JSON.stringify({
  order_id: order2Id,
  returns: [{
    checkout_item_id: item2Id,
    returned_quantity: 1,
    condition: 'normal',
    returned_serial_number: '  sn-test-12345  ', // mixed case & spaces
    evidence_photo_url: 'https://r2.stockflow.test/proof2.jpg'
  }]
})]);

const log2 = await db.query(`SELECT * FROM public.checkout_return_logs WHERE checkout_order_id = $1`, [order2Id]);
check(
  'Returned S/N is trimmed and uppercased',
  log2.rows[0].returned_serial_number === 'SN-TEST-12345'
);

// Admin confirms return -> verify auto-backfill into checkout_items.serial_number
await setAuth(adminId);
await db.query(`
  SELECT public.confirm_checkout_return($1::JSONB) AS result;
`, [JSON.stringify({ order_id: order2Id })]);

const item2After = await db.query(`SELECT serial_number, status FROM public.checkout_items WHERE id = $1`, [item2Id]);
check(
  'Auto-backfill: checkout_items.serial_number is populated on admin confirmation when quantity=1 and originally empty',
  item2After.rows[0].serial_number === 'SN-TEST-12345' && item2After.rows[0].status === 'returned'
);

// ----------------------------------------------------------------------------
// Test 3: Multi-quantity line (quantity_borrowed > 1) -> does NOT auto-backfill checkout_items.serial_number
// ----------------------------------------------------------------------------
const order3Id = '00000000-0000-0000-0000-000000000033';
const item3Id = '00000000-0000-0000-0000-000000000043';

await db.exec(`
  INSERT INTO public.checkout_orders (id, order_number, project_id, borrower_id, borrower_name, status, created_by) VALUES
    ('${order3Id}', 'CO-MULTI-QTY', '${projectAId}', '${borrowerId}', 'Borrower User', 'active', '${borrowerId}');
  INSERT INTO public.checkout_items (id, checkout_order_id, item_id, quantity_borrowed, quantity_returned, serial_number, status) VALUES
    ('${item3Id}', '${order3Id}', '${itemId}', 3, 0, NULL, 'borrowed');
`);

await setAuth(borrowerId);
await db.query(`
  SELECT public.process_return_order($1::JSONB) AS result;
`, [JSON.stringify({
  order_id: order3Id,
  returns: [{
    checkout_item_id: item3Id,
    returned_quantity: 1,
    condition: 'normal',
    returned_serial_number: 'MULTI-SN-001',
    evidence_photo_url: 'https://r2.stockflow.test/proof3.jpg'
  }]
})]);

await setAuth(adminId);
await db.query(`
  SELECT public.confirm_checkout_return($1::JSONB) AS result;
`, [JSON.stringify({ order_id: order3Id })]);

const item3After = await db.query(`SELECT serial_number FROM public.checkout_items WHERE id = $1`, [item3Id]);
check(
  'Multi-quantity line: checkout_items.serial_number is NOT overwritten when quantity_borrowed > 1',
  item3After.rows[0].serial_number === null
);

// ----------------------------------------------------------------------------
// Test 4: Cross-project return -> propagates returned_serial_number into stock_in_items
// ----------------------------------------------------------------------------
const order4Id = '00000000-0000-0000-0000-000000000034';
const item4Id = '00000000-0000-0000-0000-000000000044';

await db.exec(`
  INSERT INTO public.checkout_orders (id, order_number, project_id, borrower_id, borrower_name, status, created_by) VALUES
    ('${order4Id}', 'CO-CROSS-PROJECT', '${projectAId}', '${borrowerId}', 'Borrower User', 'active', '${borrowerId}');
  INSERT INTO public.checkout_items (id, checkout_order_id, item_id, quantity_borrowed, quantity_returned, serial_number, status) VALUES
    ('${item4Id}', '${order4Id}', '${itemId}', 1, 0, NULL, 'borrowed');
`);

await setAuth(borrowerId);
await db.query(`
  SELECT public.process_return_order($1::JSONB) AS result;
`, [JSON.stringify({
  order_id: order4Id,
  returns: [{
    checkout_item_id: item4Id,
    returned_quantity: 1,
    condition: 'normal',
    destination_project_id: projectBId, // Cross-project to Warehouse B
    returned_serial_number: 'CROSS-SN-999',
    evidence_photo_url: 'https://r2.stockflow.test/proof4.jpg'
  }]
})]);

await setAuth(adminId);
await db.query(`
  SELECT public.confirm_checkout_return($1::JSONB) AS result;
`, [JSON.stringify({ order_id: order4Id })]);

const stockInItem = await db.query(`
  SELECT sii.serial_number, sio.project_id 
  FROM public.stock_in_items sii
  JOIN public.stock_in_orders sio ON sio.id = sii.order_id
  WHERE sio.project_id = $1
  ORDER BY sio.created_at DESC LIMIT 1
`, [projectBId]);

check(
  'Cross-project return: stock_in_items.serial_number receives returned_serial_number',
  stockInItem.rows[0]?.serial_number === 'CROSS-SN-999'
);

// ----------------------------------------------------------------------------
// Test 5: Length validation (> 100 characters)
// ----------------------------------------------------------------------------
let lengthError = false;
try {
  await setAuth(borrowerId);
  await db.query(`
    SELECT public.process_return_order($1::JSONB) AS result;
  `, [JSON.stringify({
    order_id: order1Id,
    returns: [{
      checkout_item_id: item1Id,
      returned_quantity: 1,
      condition: 'normal',
      returned_serial_number: 'X'.repeat(101),
      evidence_photo_url: 'https://r2.stockflow.test/proof5.jpg'
    }]
  })]);
} catch (err) {
  lengthError = /หมายเลขเครื่อง \(S\/N\) ที่ส่งคืนยาวเกิน 100 ตัวอักษร/.test(err.message);
}
check('Length validation: S/N > 100 chars raises descriptive error', lengthError);

// ----------------------------------------------------------------------------
// Test 6: update_checkout_item_serial connects with returned_serial_number
// ----------------------------------------------------------------------------
const order6Id = '00000000-0000-0000-0000-000000000036';
const item6Id = '00000000-0000-0000-0000-000000000046';

await db.exec(`
  INSERT INTO public.checkout_orders (id, order_number, project_id, borrower_id, borrower_name, status, created_by) VALUES
    ('${order6Id}', 'CO-UPDATE-SN', '${projectAId}', '${borrowerId}', 'Borrower User', 'active', '${borrowerId}');
  INSERT INTO public.checkout_items (id, checkout_order_id, item_id, quantity_borrowed, quantity_returned, serial_number, status) VALUES
    ('${item6Id}', '${order6Id}', '${itemId}', 1, 0, NULL, 'borrowed');
`);

await setAuth(borrowerId);
const ret6Res = await db.query(`
  SELECT public.process_return_order($1::JSONB) AS result;
`, [JSON.stringify({
  order_id: order6Id,
  returns: [{
    checkout_item_id: item6Id,
    returned_quantity: 1,
    condition: 'damaged',
    returned_serial_number: 'ORIG-RETURN-SN',
    evidence_photo_url: 'https://r2.stockflow.test/proof6.jpg'
  }]
})]);

const log6Id = ret6Res.rows[0].result.returns[0].return_log_id;

// Admin confirms return
await setAuth(adminId);
await db.query(`
  SELECT public.confirm_checkout_return($1::JSONB) AS result;
`, [JSON.stringify({ order_id: order6Id })]);

// Call update_checkout_item_serial to fix/edit the serial
await db.query(`
  SELECT public.update_checkout_item_serial($1, $2, $3, $4) AS result;
`, [item6Id, 'CORRECTED-RETURN-SN', 'Fix scanned serial typo', log6Id]);

const log6After = await db.query(`SELECT returned_serial_number, replaced_serial_number FROM public.checkout_return_logs WHERE id = $1`, [log6Id]);
const item6After = await db.query(`SELECT serial_number FROM public.checkout_items WHERE id = $1`, [item6Id]);
check(
  'update_checkout_item_serial: updates returned_serial_number and checkout_items.serial_number for damaged return',
  log6After.rows[0].returned_serial_number === 'CORRECTED-RETURN-SN' &&
  item6After.rows[0].serial_number === 'CORRECTED-RETURN-SN'
);

// ----------------------------------------------------------------------------
// Test 7: resolve_damaged_return_item links returned_serial_number
// ----------------------------------------------------------------------------
await db.query(`
  SELECT public.resolve_damaged_return_item($1::JSONB) AS result;
`, [JSON.stringify({
  return_log_id: log6Id,
  resolution: 'restored_to_stock',
  project_id: projectAId,
  repair_notes: 'Replaced cracked casing'
})]);

const restoredItem = await db.query(`
  SELECT sii.serial_number 
  FROM public.stock_in_items sii
  JOIN public.stock_in_orders sio ON sio.id = sii.order_id
  WHERE sio.project_id = $1
  ORDER BY sio.created_at DESC LIMIT 1
`, [projectAId]);

check(
  'resolve_damaged_return_item: restored_to_stock propagates returned_serial_number into stock_in_items',
  restoredItem.rows[0]?.serial_number === 'CORRECTED-RETURN-SN'
);

// ----------------------------------------------------------------------------
// Summary
// ----------------------------------------------------------------------------
const failures = results.filter((r) => !r.pass);
console.log('\n============================================================');
console.log(`MIGRATION 103 VERIFICATION CHECKS: ${results.length - failures.length}/${results.length} PASS`);
if (failures.length > 0) {
  for (const f of failures) console.error(` - [FAIL] ${f.name} :: ${f.detail}`);
  process.exit(1);
}
console.log('All Migration 103 database checks passed successfully!');

