// Static verification for the Partial Damage & Component Repair workflow
// (docs/partial-damage-component-repair-plan.md §5/§6).
//   npm run verify:damaged-repair
//
// The repair/restore path touches inventory balances, so the guard asserts the
// invariants that keep it safe (atomic RPC, row locks, idempotency, permission
// checks, spare-part deduction, scrap register) plus the UI wiring that exposes
// it to the operator.
import { readFileSync } from 'node:fs';

const MIGRATION = new URL('../supabase/migrations/82_damaged_return_repair_resolution.sql', import.meta.url);
const MODAL = new URL('../src/components/checkouts/RepairResolutionModal.jsx', import.meta.url);
const DETAIL = new URL('../src/components/checkouts/CheckoutDetailModal.jsx', import.meta.url);
const TH = new URL('../src/i18n/locales/th.js', import.meta.url);
const EN = new URL('../src/i18n/locales/en.js', import.meta.url);
const PKG = new URL('../package.json', import.meta.url);
const APPLY_SCRIPT = new URL('../scripts/apply-migration-82.mjs', import.meta.url);
const LIVE_SCRIPT = new URL('../scripts/verify-damaged-repair-live-schema.mjs', import.meta.url);
const SMOKE_TEST = new URL('../supabase/tests/82_damaged_repair_resolution.smoke.sql', import.meta.url);
const UI_SCRIPT = new URL('../scripts/verify-damaged-repair-ui.mjs', import.meta.url);
const SQL_SCRIPT = new URL('../scripts/verify-damaged-repair-sql-sandbox.mjs', import.meta.url);
const SQL_FIXTURE = new URL('../supabase/tests/fixtures/mock_supabase_schema.sql', import.meta.url);

let failures = 0;
const rows = [];
const check = (label, pass, detail = '') => {
  if (!pass) failures += 1;
  rows.push({ status: pass ? 'PASS' : 'FAIL', label, detail: pass ? '' : detail });
};

// Repo mixes LF and CRLF files, so normalise before matching multi-line patterns.
const read = (url) => readFileSync(url, 'utf8').replace(/\r\n/g, '\n');
const sql = read(MIGRATION);
const modal = read(MODAL);
const detail = read(DETAIL);
const th = read(TH);
const en = read(EN);
const pkg = JSON.parse(read(PKG));

// --- migration: schema -------------------------------------------------------
check('migration runs inside one transaction', /^BEGIN;$/m.test(sql) && /^COMMIT;$/m.test(sql));
for (const column of [
  'repair_resolution_status',
  'repair_notes',
  'repair_resolved_at',
  'repair_resolved_by',
  'restored_stock_in_order_id',
  'repair_scrap_disposal_id',
  'spare_part_item_id',
  'spare_part_quantity',
]) {
  check('checkout_return_logs gains ' + column, new RegExp('ADD COLUMN IF NOT EXISTS ' + column + '\\b').test(sql));
}
check(
  'repair_resolution_status is constrained to the four documented states',
  /repair_resolution_status IN \('unresolved', 'restored_to_stock', 'parts_harvested', 'scrapped'\)/.test(sql)
);
check('new CHECK constraints are validated', (sql.match(/VALIDATE CONSTRAINT/g) || []).length >= 2);
check('pending repairs get a partial index', /idx_checkout_return_logs_repair_pending/.test(sql));

// --- migration: idempotency / double-count guards ----------------------------
check('CAIM-processed rows are backfilled so stock cannot be credited twice', /caim_inbound_processed_at IS NOT NULL;/.test(sql));
check('RPC locks the return log row', /FROM public\.checkout_return_logs[\s\S]{0,200}?FOR UPDATE/.test(sql));
check('RPC rejects a second resolution', /repair_resolution_status <> 'unresolved'/.test(sql));
check('RPC rejects rows already restored through CAIM', /caim_stock_in_order_id IS NOT NULL/.test(sql));
check('RPC locks public.items in a deterministic order (deadlock mutex)', /ORDER BY id FOR UPDATE/.test(sql));
check('items mutex uses the shared lock order', /ORDER BY id FOR UPDATE/.test(sql) && /array_agg\(DISTINCT x ORDER BY x\)/.test(sql));

// --- migration: security -----------------------------------------------------
check('RPC is SECURITY DEFINER', /SECURITY DEFINER/.test(sql));
check('RPC pins search_path', /SET search_path = public, auth, pg_temp/.test(sql));
check('RPC requires checkouts.return', /has_permission\(v_caller_id, 'checkouts\.return'\)/.test(sql));
check('RPC accepts stock_in.create', /has_permission\(v_caller_id, 'stock_in\.create'\)/.test(sql));
check('RPC allows super admin', /is_super_admin\(v_caller_id\)/.test(sql));
check('RPC rejects anonymous callers', /v_caller_id IS NULL/.test(sql) && /Unauthorized: User is not authenticated/.test(sql));
check('execute is revoked from PUBLIC/anon', /REVOKE ALL ON FUNCTION public\.resolve_damaged_return_item\(JSONB\) FROM PUBLIC, anon;/.test(sql));
check('execute is granted to authenticated/service_role', /GRANT EXECUTE ON FUNCTION public\.resolve_damaged_return_item\(JSONB\) TO authenticated, service_role;/.test(sql));

// --- migration: stock effects ------------------------------------------------
check('restore writes a stock_in ledger row tagged repair_restored', /'repair_restored'/.test(sql));
check('restore writes the stock_in transaction type', /'stock_in',\n\s*'repair_restored'/.test(sql));
check('restore creates a stock_in order + item', /INSERT INTO public\.stock_in_orders/.test(sql) && /INSERT INTO public\.stock_in_items/.test(sql));
check('spare part deduction uses the stock_out ledger type', /'stock_out',\n\s*'repair_spare_part'/.test(sql));
check('spare part availability is re-checked in-transaction', /FROM public\.stock_balance/.test(sql) && /สต็อกอะไหล่ไม่เพียงพอ/.test(sql));
check('harvest/scrap writes the scrap register', /INSERT INTO public\.scrap_disposal_items/.test(sql));
check('harvested parts can be received back as spares', /'parts_harvest'/.test(sql));
check('ledger rows keep a per-item lock before inserting', /FOR UPDATE/.test(sql));
check('quantity is validated as a whole positive number', /v_quantity <> TRUNC\(v_quantity\)/.test(sql));
check('quantity cannot exceed the returned amount', /เกินจำนวนที่รับคืนไว้/.test(sql));
check('quantity defaults to the returned amount', /v_log\.returned_quantity,\n\s*1\n\s*\);/.test(sql));

// --- frontend: modal ---------------------------------------------------------
check('RepairResolutionModal calls the RPC with p_payload', /supabase\.rpc\('resolve_damaged_return_item', \{ p_payload: payload \}\)/.test(modal));
check('modal offers all three resolutions', ['restored_to_stock', 'parts_harvested', 'scrapped'].every((value) => new RegExp("value: '" + value + "'").test(modal)));
check('modal caps the quantity at the returned amount', /max=\{returnedQuantity\}/.test(modal));
check('modal requires an integer quantity', /Number\.isInteger\(qty\)/.test(modal));
check('modal requires repair/disposal notes', /checkouts\.repairNotesRequired/.test(modal));
check('modal warns that harvested/scrapped items do not return to stock', /checkouts\.repairNoStockNote/.test(modal));
check('modal flags a missing migration instead of failing silently', /isSchemaMismatchError\(err\)/.test(modal) && /checkouts\.repairMigrationMissing/.test(modal));
check('modal disables inputs while submitting', /disabled=\{submitting\}/.test(modal));
check('modal uses lucide icons (no emoji in UI)', /from 'lucide-react'/.test(modal) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(modal));

// --- frontend: detail modal wiring ------------------------------------------
check('CheckoutDetailModal imports RepairResolutionModal', /import RepairResolutionModal from '@\/components\/checkouts\/RepairResolutionModal'/.test(detail));
check('detail modal renders the repair row', /<RepairResolutionRow/.test(detail));
check('repair row only appears for damaged/needs_repair returns', /log\.item_condition !== 'damaged' && log\.item_condition !== 'needs_repair'/.test(detail));
check('unresolved rows expose the restore action', /checkouts\.repairAction/.test(detail) && /onOpenRepair\(log\)/.test(detail));
check('resolved rows render a status badge', /checkouts\.repairStatusRestored/.test(detail) && /checkouts\.repairStatusHarvested/.test(detail) && /checkouts\.repairStatusScrapped/.test(detail));
check('action is gated by checkouts.return or stock_in.create', /can\('checkouts\.return'\) \|\| can\('stock_in\.create'\)/.test(detail));
check('CAIM claim button falls back to the checkout S/N', /log\?\.replaced_serial_number \|\| log\?\.checkout_items\?\.serial_number/.test(detail));
check('CAIM button is disabled when no S/N exists', /checkouts\.noSerialForCaim/.test(detail));
check('modal refreshes return logs after resolving', /onResolved=\{\(\) => \{\n\s*if \(order\?\.id\) fetchReturnLogs\(order\.id\);/.test(detail));

// --- i18n parity for the new keys -------------------------------------------
const keysOf = (source) => new Set((source.match(/"(repair[A-Za-z]*|noSerialForCaim)"\s*:/g) || []).map((match) => match.replace(/["\s:]/g, '')));
const thKeys = keysOf(th);
const enKeys = keysOf(en);
const missingInTh = [...enKeys].filter((key) => !thKeys.has(key));
const missingInEn = [...thKeys].filter((key) => !enKeys.has(key));
check('repair i18n keys exist in both locales', thKeys.size > 30 && enKeys.size === thKeys.size,
  'th=' + thKeys.size + ' en=' + enKeys.size);
check('no repair key is missing in th.js', missingInTh.length === 0, missingInTh.join(', '));
check('no repair key is missing in en.js', missingInEn.length === 0, missingInEn.join(', '));
check('no key falls back to a hardcoded default', !/t\('checkouts\.repair[A-Za-z]*',\s*'/.test(modal));

// --- apply / smoke-test tooling ---------------------------------------------
const apply = read(APPLY_SCRIPT);
const live = read(LIVE_SCRIPT);
const smoke = read(SMOKE_TEST);

check('apply script supports --dry-run and --yes', /--dry-run/.test(apply) && /--yes/.test(apply));
check('apply script supports --self-test', /--self-test/.test(apply) && /selfTestFile/.test(apply));
check('apply script refuses to run without an explicit flag', /ต้องรันด้วย --yes/.test(apply));
check('smoke test never commits (BEGIN + ROLLBACK)', /^BEGIN;$/m.test(smoke) && /^ROLLBACK;$/m.test(smoke) && !/^COMMIT;$/m.test(smoke));
check('smoke test simulates an authenticated SUPER caller', /set_config\('request\.jwt\.claims'/.test(smoke) && /is_super_admin/.test(smoke));
check('smoke test asserts stock_balance grows by the resolved quantity', /v_after <> v_before \+ v_qty/.test(smoke));
check('smoke test asserts the repair_restored ledger row', /'repair_restored'/.test(smoke));
check('smoke test asserts spare-part deduction', /'repair_spare_part'/.test(smoke));
check('smoke test asserts idempotency (second call rejected)', /การกดซ้ำต้องถูกปฏิเสธ/.test(smoke));
check('smoke test asserts the scrap register for disposal', /scrap_disposal_items/.test(smoke) && /electronic_waste/.test(smoke));
check('live verifier checks every table the migration touches', /const REQUIRED = \{/.test(live) && /ทุกตารางที่ migration 82 อ้างถึงถูกตรวจ/.test(live));
check('live verifier strips SQL comments before extracting tables', /startsWith\('--'\)/.test(live));
check('live verifier proves the RPC rejects unauthenticated callers', /rpcExists/.test(live) && /Unauthorized/.test(live));
check('live verifier can require the applied state', /requireApplied/.test(live) && /--require-applied/.test(live));
check('live verifier verifies the new FKs after apply', /Foreign Key to/.test(live));

// --- browser (CDP) verifier --------------------------------------------------
const ui = read(UI_SCRIPT);
check('UI verifier drives the installed browser over CDP (no new dependency)', /DevTools Protocol/.test(ui) && /remote-debugging-port/.test(ui));
check('UI verifier never submits once the RPC exists', /rpcExists === true/.test(ui) && /ข้ามการกด submit/.test(ui));
check('UI verifier asserts no write happens on validation/cancel', /rpcCalls\.length === 0/.test(ui));
check('UI verifier scopes the cancel click inside the repair dialog', /const dlg = Array\.from\(document\.querySelectorAll\('\[role=dialog\]'\)\)/.test(ui));
check('UI verifier forces the Thai locale for deterministic assertions', /stockflow\.app\.lang/.test(ui));
check('UI verifier tolerates the expected 404 before apply', /status of 404/.test(ui));
check('UI verifier captures screenshots as artifacts', /Page\.captureScreenshot/.test(ui) && /test-results\/damaged-repair-ui/.test(ui));

// --- Postgres sandbox verifier (PGlite) -------------------------------------
const sqlScript = read(SQL_SCRIPT);
const fixture = read(SQL_FIXTURE);
check('sandbox verifier runs the real migration file on a Postgres engine', /await db\.exec\(MIGRATION\)/.test(sqlScript));
check('sandbox verifier runs the project smoke test verbatim', /await db\.exec\(SMOKE\)/.test(sqlScript));
check('sandbox verifier asserts stock +1 and spare part -1', /stock_balance ของอุปกรณ์หลัก \+1/.test(sqlScript) && /ตัดสต็อกอะไหล่ย่อย -1/.test(sqlScript));
check('sandbox verifier covers all three resolutions', /restored_to_stock/.test(sqlScript) && /parts_harvested/.test(sqlScript) && /scrapped/.test(sqlScript));
check('sandbox verifier skips gracefully without the optional dependency', /\[SKIP\]/.test(sqlScript) && /process\.exit\(2\)/.test(sqlScript));
check('sandbox fixture mirrors the Supabase roles and auth schema', /CREATE ROLE anon NOLOGIN/.test(fixture) && /CREATE SCHEMA IF NOT EXISTS auth/.test(fixture));
check('sandbox fixture reuses the production stock_balance definition', /CREATE OR REPLACE VIEW public\.stock_balance/.test(fixture) && /'stock_out', 'checkout_out', 'transfer_out', 'OUT', 'CHECKOUT'/.test(fixture) && /'return_in', 'RETURN'/.test(fixture));
check('npm script verify:damaged-repair-sql is registered', pkg.scripts['verify:damaged-repair-sql'] === 'node scripts/verify-damaged-repair-sql-sandbox.mjs');

// --- packaging ---------------------------------------------------------------
check('npm script verify:damaged-repair is registered', pkg.scripts['verify:damaged-repair'] === 'node scripts/verify-damaged-repair-resolution.mjs');
check('npm script verify:damaged-repair-live is registered', pkg.scripts['verify:damaged-repair-live'] === 'node scripts/verify-damaged-repair-live-schema.mjs');
check('npm script verify:damaged-repair-ui is registered', pkg.scripts['verify:damaged-repair-ui'] === 'node scripts/verify-damaged-repair-ui.mjs');

// --- report ------------------------------------------------------------------
console.log('==================================================================');
console.log('   Partial damage repair — restore / harvest / scrap guard           ');
console.log('==================================================================');
for (const row of rows) {
  console.log('[' + row.status + '] ' + row.label + (row.detail ? ' - ' + row.detail : ''));
}
console.log('------------------------------------------------------------------');
console.log('Total: ' + rows.length + ' cases, failed: ' + failures);

if (failures > 0) {
  console.error('[FAIL] Damaged-return repair invariants are broken.');
  process.exit(1);
}
console.log('[PASS] All damaged-return repair invariants hold.');
