// Static verification for the Requisition Detail dialog overflow fix.
//   npm run verify:withdrawal-detail-modal
//
// Layout regressions are invisible to lint/build, so this guard asserts the
// specific Tailwind invariants that keep every part of the dialog inside its own
// box (grid track minmax(0,1fr), min-w-0 on grid children, wrapping footer and a
// horizontally scrollable items table).
import { readFileSync } from 'node:fs';

const MODAL = new URL('../src/components/withdrawals/WithdrawalDetailModal.jsx', import.meta.url);
const TH = new URL('../src/i18n/locales/th.js', import.meta.url);
const EN = new URL('../src/i18n/locales/en.js', import.meta.url);

let failures = 0;
const rows = [];
const check = (label, pass, detail = '') => {
  if (!pass) failures += 1;
  rows.push({ status: pass ? 'PASS' : 'FAIL', label, detail: pass ? '' : detail });
};

const src = readFileSync(MODAL, 'utf8');
const th = readFileSync(TH, 'utf8');
const en = readFileSync(EN, 'utf8');
const has = (needle) => src.includes(needle);

// --- root DialogContent ------------------------------------------------------
check('DialogContent constrains its grid track (minmax(0,1fr))', has('grid-cols-[minmax(0,1fr)]'));
check('DialogContent clips overflow', /<DialogContent[^>]*overflow-hidden/.test(src));
check('DialogContent caps height at 90vh', has('max-h-[90vh]'));
check('DialogContent keeps a viewport-safe width', has('w-[calc(100%-2rem)]'));

// --- grid children -----------------------------------------------------------
check('DialogHeader is min-w-0', /<DialogHeader className="[^"]*min-w-0/.test(src));
check('scroll body is min-w-0', /className="min-w-0 py-3[^"]*overflow-y-auto/.test(src));
check('DialogFooter is min-w-0', /<DialogFooter className="[^"]*min-w-0/.test(src));
check('DialogFooter wraps its buttons', /<DialogFooter className="[^"]*flex-wrap/.test(src));

// --- items table -------------------------------------------------------------
check('items table has a horizontal min width', /<Table className="min-w-\[640px\]"/.test(src));

// --- stepper -----------------------------------------------------------------
check('stepper steps use truncate', (src.match(/truncate text-\[11px\] sm:text-xs/g) || []).length === 3,
  'found=' + (src.match(/truncate text-\[11px\] sm:text-xs/g) || []).length);
check('stepper connectors keep a minimum width', (src.match(/min-w-3 sm:min-w-6/g) || []).length === 2,
  'found=' + (src.match(/min-w-3 sm:min-w-6/g) || []).length);

// --- footer buttons ----------------------------------------------------------
check('print buttons may shrink on mobile', (src.match(/flex-1 sm:flex-initial/g) || []).length === 2,
  'found=' + (src.match(/flex-1 sm:flex-initial/g) || []).length);
check('danger action is separated by a divider', has('w-px h-6 bg-border/60'));
check('dispatch button uses the Printer icon', has('<Printer className="w-4 h-4 text-sky-600" />'));
check('old FileSpreadsheet icon is gone', !src.includes('FileSpreadsheet'));

// --- i18n parity for the touched labels -------------------------------------
for (const key of ['printDownloadPDF', 'confirmReceiptComplete']) {
  check('th.js has withdrawals.' + key, new RegExp('"' + key + '"\\s*:').test(th));
  check('en.js has withdrawals.' + key, new RegExp('"' + key + '"\\s*:').test(en));
}

// --- report -----------------------------------------------------------------
console.log('==================================================================');
console.log('   Requisition detail modal — overflow / layout guard               ');
console.log('==================================================================');
for (const row of rows) {
  console.log('[' + row.status + '] ' + row.label + (row.detail ? ' - ' + row.detail : ''));
}
console.log('------------------------------------------------------------------');
console.log('Total: ' + rows.length + ' cases, failed: ' + failures);

if (failures > 0) {
  console.error('[FAIL] Requisition detail modal layout invariants are broken.');
  process.exit(1);
}
console.log('[PASS] All requisition detail modal layout invariants hold.');
