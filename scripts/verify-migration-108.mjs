// Static + optional PGlite / live-schema verification for Migration 108
//   npm run verify:migration-108
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MIGRATION_PATH = path.resolve(
  'supabase/migrations/108_fix_resolve_damaged_return_item_schema_and_ledger.sql'
);
const sql = readFileSync(MIGRATION_PATH, 'utf8').replace(/\r\n/g, '\n');

let failures = 0;
const check = (label, pass, detail = '') => {
  if (!pass) failures += 1;
  console.log((pass ? '[PASS] ' : '[FAIL] ') + label + (detail ? ' :: ' + detail : ''));
};

// 1. Static SQL contract checks
check('runs inside BEGIN/COMMIT + schema reload', /^BEGIN;$/m.test(sql) && /^COMMIT;$/m.test(sql) && /NOTIFY pgrst, 'reload schema';/.test(sql));
check('uses SECURITY DEFINER with pinned search_path', /SECURITY DEFINER/.test(sql) && /SET search_path = public, auth, pg_temp/.test(sql));
check('revokes PUBLIC/anon and grants authenticated/service_role', /REVOKE ALL ON FUNCTION public\.resolve_damaged_return_item\(JSONB\) FROM PUBLIC, anon;/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.resolve_damaged_return_item\(JSONB\) TO authenticated, service_role;/.test(sql));

// 2. Regression checks against bugs from migrations 102/103/107
check('does NOT reference nonexistent repair_stock_in_order_id in UPDATE', !/repair_stock_in_order_id\s*=/.test(sql));
check('does NOT reference nonexistent public.v_current_stock', !/FROM\s+public\.v_current_stock/.test(sql));
check('does NOT insert invalid transaction_type withdrawal', !/'withdrawal'\s*,\s*'spare_part_usage'/.test(sql));

// 3. Canonical schema & workflow alignment
check('updates canonical restored_stock_in_order_id', /restored_stock_in_order_id\s*=/.test(sql));
check('queries public.stock_balance (balance)', /SELECT COALESCE\(balance, 0\) INTO v_available\s+FROM public\.stock_balance/.test(sql));
check('uses stock_out + repair_spare_part with positive quantity', /'stock_out',\s*'repair_spare_part'/.test(sql) && !/-v_spare_qty/.test(sql));
check('uses canonical reference_types (repair_restored, repair_spare_part, parts_harvest)', /'repair_restored'/.test(sql) && /'repair_spare_part'/.test(sql) && /'parts_harvest'/.test(sql));
check('preserves internal_repair & retried_internal support (migration 107)', /COALESCE\(v_log\.caim_inbound_status, 'none'\) NOT IN \('retried_internal', 'internal_repair'\)/.test(sql));
check('preserves returned_serial_number fallback (migration 103)', /COALESCE\(v_serial, v_log\.returned_serial_number, v_log\.replaced_serial_number, v_item_serial\)/.test(sql));
check('preserves closed_by in scrap_disposal_items (migration 102)', /closed_by/.test(sql) && /COALESCE\(v_caller_name, 'In-house Technician'\)/.test(sql));
check('preserves storage_location_id, po_number, and item mutex lock', /storage_location_id/.test(sql) && /po_number/.test(sql) && /ORDER BY id FOR UPDATE/.test(sql));

// 4. Optional PGlite runtime execution if installed
const PGLITE_ENTRY = path.resolve('test-results/pglite-env/node_modules/@electric-sql/pglite/dist/index.js');
if (existsSync(PGLITE_ENTRY)) {
  const mod = await import(pathToFileURL(PGLITE_ENTRY).href);
  const db = new mod.PGlite();
  const schema = readFileSync('supabase/tests/fixtures/mock_supabase_schema.sql', 'utf8');
  await db.exec(schema);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS public.roles (id uuid PRIMARY KEY, code text UNIQUE);
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
    ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS caim_inbound_status text DEFAULT 'none';
    ALTER TABLE public.checkout_return_logs ADD COLUMN IF NOT EXISTS returned_serial_number text;
  `);
  const mig82 = readFileSync('supabase/migrations/82_damaged_return_repair_resolution.sql', 'utf8');
  await db.exec(mig82);
  await db.exec(sql);
  check('PGlite executes Migration 108 cleanly on mock_supabase_schema', true);
  await db.close();
} else {
  console.log('[INFO] PGlite not installed locally — skipped WASM Postgres execution');
}

if (failures > 0) {
  console.error(`[FAIL] Migration 108 verification failed (${failures} checks)`);
  process.exit(1);
}
console.log('[PASS] Migration 108 verification passed');
