// ==============================================================================
// Deep verification script for Migration 92 (PGlite / WASM PostgreSQL Sandbox)
//   node scripts/verify-force-delete-item-sandbox.mjs
// ==============================================================================

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const SANDBOX_DIR = path.resolve('test-results/pglite-env');
const PGLITE_ENTRY = path.join(SANDBOX_DIR, 'node_modules/@electric-sql/pglite/dist/index.js');
const FIXTURE = path.resolve('supabase/tests/fixtures/mock_supabase_schema.sql');
const MIGRATION_FILE = path.resolve('supabase/migrations/92_fix_admin_force_delete_item_rpc.sql');

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

console.log('🧪 Starting Force Delete Item Sandbox Verification (Migration 92)...');
const db = new PGlite();

// 1. Load mock base schema
const schemaSql = readFileSync(FIXTURE, 'utf8');
await db.exec(schemaSql);

// 2. Setup full schema context matching production
await db.exec(`
  ALTER TABLE public.items ADD COLUMN IF NOT EXISTS sku TEXT;
  ALTER TABLE public.items ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.items(id) ON DELETE SET NULL;

  CREATE TABLE IF NOT EXISTS public.stock_in_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT
  );

  CREATE TABLE IF NOT EXISTS public.stock_in_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_in_order_id UUID,
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
    parent_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
    quantity NUMERIC DEFAULT 1
  );
  ALTER TABLE public.stock_in_items ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.items(id) ON DELETE SET NULL;

  CREATE TABLE IF NOT EXISTS public.withdrawal_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT
  );

  CREATE TABLE IF NOT EXISTS public.withdrawal_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID,
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
    quantity NUMERIC DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS public.scrap_disposal_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
    quantity NUMERIC DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS public.site_bom_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    item_id UUID REFERENCES public.items(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS public.stock_adjustment_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    previous_quantity NUMERIC,
    new_quantity NUMERIC
  );

  CREATE TABLE IF NOT EXISTS public.stock_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
    transaction_type TEXT,
    quantity NUMERIC
  );

  ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS spare_part_item_id UUID REFERENCES public.items(id) ON DELETE SET NULL;

  CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID,
    action TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  DROP FUNCTION IF EXISTS public.has_permission(uuid, text);
  CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_perm_code TEXT)
  RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = p_user_id AND role IN ('admin', 'super_admin')
    );
  $$;
`);

// Verify that pos_order_items is NOT present in sandbox (matches production)
const checkPos = await db.query(`SELECT to_regclass('public.pos_order_items') as tbl;`);
assert.equal(checkPos.rows[0].tbl, null, 'pos_order_items should NOT exist in sandbox');

// 3. Apply Migration 92
console.log('📦 Applying Migration 92 DDL into sandbox...');
const migrationSql = readFileSync(MIGRATION_FILE, 'utf8');
await db.exec(migrationSql);

// 4. Seed test users
const adminUserId = 'a0000000-0000-0000-0000-000000000001';
const regularUserId = 'b0000000-0000-0000-0000-000000000002';
await db.exec(`
  INSERT INTO public.profiles (id, role, status) VALUES
    ('${adminUserId}', 'admin', 'active'),
    ('${regularUserId}', 'technician', 'active')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
`);

// 5. Seed test items & dependent records
const itemToDeleteId = '11111111-1111-1111-1111-111111111111';
const childItemId = '22222222-2222-2222-2222-222222222222';
const otherItemId = '33333333-3333-3333-3333-333333333333';
const checkoutOrderId = '44444444-4444-4444-4444-444444444444';
const checkoutItemId = '55555555-5555-5555-5555-555555555555';

await db.exec(`
  -- Insert Master Items
  INSERT INTO public.items (id, name, sku) VALUES
    ('${itemToDeleteId}', 'Target Item For Deletion', 'SKU-DEL-001'),
    ('${childItemId}', 'Child Item Referencing Target', 'SKU-CHILD-002'),
    ('${otherItemId}', 'Safe Unrelated Item', 'SKU-SAFE-003');

  -- Self reference in items (parent_id)
  UPDATE public.items SET parent_id = '${itemToDeleteId}' WHERE id = '${childItemId}';

  -- Dependent records across all tables for itemToDeleteId
  INSERT INTO public.stock_in_items (item_id, parent_id, quantity) VALUES
    ('${itemToDeleteId}', '${itemToDeleteId}', 50);

  INSERT INTO public.withdrawal_items (item_id, quantity) VALUES
    ('${itemToDeleteId}', 10);

  INSERT INTO public.checkout_orders (id, order_number, borrower_name, status) VALUES
    ('${checkoutOrderId}', 'CHK-TEST-001', 'Borrower A', 'active');

  INSERT INTO public.checkout_items (id, checkout_order_id, item_id, quantity_borrowed) VALUES
    ('${checkoutItemId}', '${checkoutOrderId}', '${itemToDeleteId}', 5);

  INSERT INTO public.checkout_return_logs (checkout_order_id, checkout_item_id, spare_part_item_id, returned_quantity) VALUES
    ('${checkoutOrderId}', '${checkoutItemId}', '${itemToDeleteId}', 2);

  INSERT INTO public.scrap_disposal_items (item_id, quantity) VALUES
    ('${itemToDeleteId}', 3);

  INSERT INTO public.site_bom_templates (name, item_id) VALUES
    ('Standard CCTV Kit', '${itemToDeleteId}');

  INSERT INTO public.stock_adjustment_logs (item_id, previous_quantity, new_quantity) VALUES
    ('${itemToDeleteId}', 50, 45);

  INSERT INTO public.stock_transactions (item_id, transaction_type, quantity) VALUES
    ('${itemToDeleteId}', 'IN', 50),
    ('${itemToDeleteId}', 'OUT', -10);

  -- Other item records that must be preserved
  INSERT INTO public.stock_transactions (item_id, transaction_type, quantity) VALUES
    ('${otherItemId}', 'IN', 100);
`);

console.log('🔒 Testing Authorization Gate...');
// Set auth to regular user (unauthorized)
await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [regularUserId]);
try {
  await db.query(`SELECT public.admin_force_delete_item('${itemToDeleteId}'::uuid);`);
  assert.fail('Should fail when called by unauthorized user');
} catch (err) {
  assert(err.message.includes('Unauthorized'), `Expected Unauthorized error, got: ${err.message}`);
  console.log('  ✅ Non-admin caller correctly rejected: Unauthorized');
}

console.log('⚡ Executing admin_force_delete_item as admin...');
await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [adminUserId]);
const res = await db.query(`SELECT public.admin_force_delete_item('${itemToDeleteId}'::uuid) as result;`);
const resultJson = res.rows[0].result;
console.log('  Result:', resultJson);
assert.equal(resultJson.success, true, 'Force delete should return success=true');

console.log('🔍 Verifying cascading deletion and isolation...');

// 1. Target item is gone
const itemCheck = await db.query(`SELECT * FROM public.items WHERE id = '${itemToDeleteId}';`);
assert.equal(itemCheck.rows.length, 0, 'Target item must be deleted');

// 2. Child item parent_id set to NULL
const childCheck = await db.query(`SELECT parent_id FROM public.items WHERE id = '${childItemId}';`);
assert.equal(childCheck.rows[0].parent_id, null, 'Child item parent_id must be NULL');

// 3. stock_in_items cleared
const stockInCheck = await db.query(`SELECT * FROM public.stock_in_items WHERE item_id = '${itemToDeleteId}';`);
assert.equal(stockInCheck.rows.length, 0, 'stock_in_items must be deleted');

// 4. withdrawal_items cleared
const withCheck = await db.query(`SELECT * FROM public.withdrawal_items WHERE item_id = '${itemToDeleteId}';`);
assert.equal(withCheck.rows.length, 0, 'withdrawal_items must be deleted');

// 5. checkout_return_logs cleared
const retCheck = await db.query(`SELECT * FROM public.checkout_return_logs WHERE checkout_item_id = '${checkoutItemId}';`);
assert.equal(retCheck.rows.length, 0, 'checkout_return_logs must be deleted');

// 6. checkout_items cleared
const coCheck = await db.query(`SELECT * FROM public.checkout_items WHERE item_id = '${itemToDeleteId}';`);
assert.equal(coCheck.rows.length, 0, 'checkout_items must be deleted');

// 7. scrap_disposal_items cleared
const scrapCheck = await db.query(`SELECT * FROM public.scrap_disposal_items WHERE item_id = '${itemToDeleteId}';`);
assert.equal(scrapCheck.rows.length, 0, 'scrap_disposal_items must be deleted');

// 8. site_bom_templates item_id nullified
const bomCheck = await db.query(`SELECT item_id FROM public.site_bom_templates WHERE name = 'Standard CCTV Kit';`);
assert.equal(bomCheck.rows[0].item_id, null, 'site_bom_templates item_id must be nullified');

// 9. stock_transactions cleared
const txCheck = await db.query(`SELECT * FROM public.stock_transactions WHERE item_id = '${itemToDeleteId}';`);
assert.equal(txCheck.rows.length, 0, 'stock_transactions must be deleted');

// 10. stock_adjustment_logs cleared
const adjCheck = await db.query(`SELECT * FROM public.stock_adjustment_logs WHERE item_id = '${itemToDeleteId}';`);
assert.equal(adjCheck.rows.length, 0, 'stock_adjustment_logs must be deleted');

// 11. Audit log recorded
const auditCheck = await db.query(`SELECT * FROM public.audit_logs WHERE action = 'ITEM_FORCE_DELETED';`);
assert.equal(auditCheck.rows.length, 1, 'Audit log must be created');
assert.equal(auditCheck.rows[0].details.item_id, itemToDeleteId);
console.log('  ✅ Audit log recorded:', auditCheck.rows[0].details);

// 12. Safe unrelated item remains completely untouched!
const safeItemCheck = await db.query(`SELECT * FROM public.items WHERE id = '${otherItemId}';`);
assert.equal(safeItemCheck.rows.length, 1, 'Safe item must exist');
const safeTxCheck = await db.query(`SELECT * FROM public.stock_transactions WHERE item_id = '${otherItemId}';`);
assert.equal(safeTxCheck.rows.length, 1, 'Safe item transactions must remain untouched');
console.log('  ✅ Unrelated item preserved (Isolation verified)');

console.log('⚡ Testing admin_bulk_force_delete_items...');
const bulkRes = await db.query(`SELECT public.admin_bulk_force_delete_items(ARRAY['${childItemId}'::uuid, '${otherItemId}'::uuid]) as result;`);
assert.equal(bulkRes.rows[0].result.success, true);
assert.equal(bulkRes.rows[0].result.deleted_count, 2);

const remainingItems = await db.query(`SELECT count(*) as cnt FROM public.items;`);
assert.equal(Number(remainingItems.rows[0].cnt), 0, 'All target items deleted');
console.log('  ✅ Bulk delete verified: 2 items deleted atomically');

console.log('\n🎉 ALL MIGRATION 92 SANDBOX CHECKS PASSED!\n');
process.exit(0);
