// Static verification for Phase 1 of the Multi-Warehouse / Multi-Project
// Requisition feature (migration 80 + RPC approve_inventory_request).
//
// Plain Node script (no DB, no child processes) so it runs under the DSH sandbox:
//   npm run verify:multi-warehouse
//
// It proves the migration still contains every structural guarantee the design
// depends on, so a later edit cannot silently drop backward compatibility, the
// per-line source warehouse, or the deadlock-safe locking order.
import { readFileSync, existsSync } from 'node:fs';

const MIGRATION = new URL('../supabase/migrations/80_multi_warehouse_withdrawal_support.sql', import.meta.url);
const APPLY_SCRIPT = new URL('./apply-migration-80.mjs', import.meta.url);

let failures = 0;
const rows = [];
const check = (label, pass, detail = '') => {
  if (!pass) failures += 1;
  rows.push({ status: pass ? 'PASS' : 'FAIL', label, detail: pass ? '' : detail });
};

if (!existsSync(MIGRATION)) {
  console.error('[FAIL] Migration file not found: supabase/migrations/80_multi_warehouse_withdrawal_support.sql');
  process.exit(1);
}

const sql = readFileSync(MIGRATION, 'utf8');
const applyScript = readFileSync(APPLY_SCRIPT, 'utf8');

const has = (needle) => sql.includes(needle);

// Extract a function body: from "FUNCTION public.<name>(" to the terminating "$$;"
function functionBody(name) {
  const start = sql.indexOf('FUNCTION public.' + name + '(');
  if (start === -1) return '';
  const end = sql.indexOf('$$;', start);
  if (end === -1) return '';
  return sql.slice(start, end);
}

const approveBody = functionBody('approve_inventory_request');
const triggerFnBody = functionBody('set_withdrawal_item_source_project');

// --- 1. schema columns -------------------------------------------------------
check('adds withdrawal_items.project_id (FK projects)',
  /ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public\.projects\(id\)/.test(sql));
check('adds withdrawal_items.storage_location_id (FK storage_locations)',
  /ADD COLUMN IF NOT EXISTS storage_location_id UUID REFERENCES public\.storage_locations\(id\)/.test(sql));

// --- 2. backfill + orphan guard ---------------------------------------------
check('backfills project_id from the parent withdrawal_order',
  /UPDATE public\.withdrawal_items wi[\s\S]*?SET project_id = wo\.project_id[\s\S]*?FROM public\.withdrawal_orders wo[\s\S]*?WHERE wi\.order_id = wo\.id/.test(sql));
check('fails loudly when a legacy row cannot resolve a source warehouse',
  /RAISE EXCEPTION[\s\S]*?'Migration 80:[\s\S]*?project_id/.test(sql));

// --- 3. backward-compatible trigger -----------------------------------------
check('defines trigger function set_withdrawal_item_source_project',
  triggerFnBody.length > 0);
check('trigger function is SECURITY DEFINER with hardened search_path',
  /SECURITY DEFINER/.test(triggerFnBody) && /SET search_path = public, auth, pg_temp/.test(triggerFnBody));
check('trigger inherits project_id from the parent order when NULL',
  /IF NEW\.project_id IS NULL THEN[\s\S]*?SELECT wo\.project_id INTO NEW\.project_id/.test(triggerFnBody));
check('trigger attaches BEFORE INSERT OR UPDATE on withdrawal_items',
  /CREATE TRIGGER trg_withdrawal_items_source_project[\s\S]*?BEFORE INSERT OR UPDATE OF project_id, order_id ON public\.withdrawal_items/.test(sql));

// --- 4. invariant + index ----------------------------------------------------
check('enforces project_id NOT NULL after backfill',
  /ALTER TABLE public\.withdrawal_items ALTER COLUMN project_id SET NOT NULL/.test(sql));
check('creates (project_id, item_id) index',
  /CREATE INDEX IF NOT EXISTS idx_withdrawal_items_project_item\s+ON public\.withdrawal_items \(project_id, item_id\)/.test(sql));

// --- 5. approve_inventory_request -------------------------------------------
check('RPC keeps the same signature',
  /FUNCTION public\.approve_inventory_request\(\s*p_request_id UUID,\s*p_allow_shortage BOOLEAN DEFAULT FALSE,\s*p_override_reason TEXT DEFAULT NULL\s*\)/.test(sql));
check('RPC is SECURITY DEFINER with hardened search_path',
  /SECURITY DEFINER/.test(approveBody) && /SET search_path = public, auth, pg_temp/.test(approveBody));
check('RPC reads the source warehouse from the LINE item (wi.project_id)',
  /wi\.project_id AS source_project_id/.test(approveBody));
check('RPC checks stock_balance per line source warehouse',
  /FROM public\.stock_balance[\s\S]*?WHERE project_id = v_item\.source_project_id AND item_id = v_item\.item_id/.test(approveBody));
check('RPC writes the stock OUT ledger against the line source warehouse',
  /v_item\.item_id,\s*v_item\.source_project_id,\s*'OUT',\s*v_deduct/.test(approveBody));
check('RPC no longer deducts from the order header project',
  !/WHERE project_id = v_order\.project_id/.test(approveBody) && !/v_order\.project_id, 'OUT'/.test(approveBody));
check('RPC locks public.items ordered by item_id (deadlock-safe mutex)',
  /FROM public\.items i[\s\S]*?ORDER BY i\.id[\s\S]*?FOR UPDATE/.test(approveBody));
check('RPC locks the line rows ordered by id',
  /FROM public\.withdrawal_items wi[\s\S]*?ORDER BY wi\.id[\s\S]*?FOR UPDATE/.test(approveBody));
check('shortage payload carries project_id + warehouse_name',
  /'project_id', v_item\.source_project_id/.test(approveBody) && /'warehouse_name', v_item\.source_project_name/.test(approveBody));
check('RPC raises SHORTAGE_DETECTED unless override is allowed',
  /SHORTAGE_DETECTED/.test(approveBody) && /p_allow_shortage/.test(approveBody));
check('RPC keeps the same return shape',
  /'success', true/.test(approveBody) && /'has_shortage', v_has_any_shortage/.test(approveBody) && /'message', 'อนุมัติคำขอเบิกจ่ายสำเร็จ'/.test(approveBody));
check('RPC still requires inventory.approve / withdrawals.approve',
  /has_permission\(v_user_id, 'inventory\.approve'\)/.test(approveBody) && /has_permission\(v_user_id, 'withdrawals\.approve'\)/.test(approveBody));
check('RPC stays single-transaction (no COMMIT inside the function)',
  !/\bCOMMIT;/.test(approveBody));

// --- 6. grants ---------------------------------------------------------------
check('revokes PUBLIC/anon and grants authenticated/service_role',
  /REVOKE ALL ON FUNCTION public\.approve_inventory_request\(UUID, BOOLEAN, TEXT\) FROM PUBLIC, anon;/.test(sql) &&
  /GRANT EXECUTE ON FUNCTION public\.approve_inventory_request\(UUID, BOOLEAN, TEXT\) TO authenticated, service_role;/.test(sql));

// --- 7. transaction shape ----------------------------------------------------
const standaloneCommit = sql.split(/\r?\n/).filter((line) => line.trim() === 'COMMIT;').length;
const standaloneBegin = sql.split(/\r?\n/).filter((line) => line.trim() === 'BEGIN;').length;
check('exactly one standalone BEGIN;/COMMIT; pair', standaloneBegin === 1 && standaloneCommit === 1);
check('dollar-quote delimiters are balanced', (sql.match(/\$\$/g) || []).length % 2 === 0);
check('rollback block is present and commented out',
  /-- BEGIN;/.test(sql) && /-- COMMIT;/.test(sql));

// --- 8. apply tooling --------------------------------------------------------
check('apply script supports --dry-run', applyScript.includes("'--dry-run'") || applyScript.includes('--dry-run'));
check('apply script requires --yes before touching production', applyScript.includes("'--yes'") && applyScript.includes('process.exit(2)'));
check('apply script rewrites only the standalone COMMIT; to ROLLBACK;',
  applyScript.includes("=== 'COMMIT;'") && applyScript.includes("'ROLLBACK;'"));

// --- report -----------------------------------------------------------------
console.log('============================================================');
console.log('   Multi-Warehouse Phase 1 verification (migration 80)      ');
console.log('============================================================');
for (const row of rows) {
  console.log('[' + row.status + '] ' + row.label + (row.detail ? ' - ' + row.detail : ''));
}
console.log('------------------------------------------------------------');
console.log('Total: ' + rows.length + ' cases, failed: ' + failures);

if (failures > 0) {
  console.error('[FAIL] Multi-Warehouse Phase 1 verification failed.');
  process.exit(1);
}
console.log('[PASS] All multi-warehouse migration invariants hold.');
