// Behavioural + source-audit verification for the /checkouts PDF guards.
// Plain Node script (no browser, no child processes) so it runs under the DSH sandbox:
//   npm run verify:checkout-pdf-guards
//
// It proves two things that cannot be checked by lint/build:
//   1) the shared status constant used by the guards excludes pending/rejected/cancelled
//   2) the "print checkout slip" button and its handler are actually status-guarded in
//      CheckoutDetailModal.jsx (and that the neighbouring dispatch button stayed guarded)
import { readFileSync } from 'node:fs';
import { CHECKOUT_DISPATCH_STATUSES } from '../src/lib/utils.js';

const modal = readFileSync(new URL('../src/components/checkouts/CheckoutDetailModal.jsx', import.meta.url), 'utf8');

let failures = 0;
const rows = [];

const check = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  rows.push({
    status: pass ? 'PASS' : 'FAIL',
    label,
    detail: pass ? '' : 'got=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected),
  });
};

// --- 1) status matrix used by both guards ----------------------------------
const ALLOWED = ['active', 'partial_returned', 'overdue', 'completed'];

check('CHECKOUT_DISPATCH_STATUSES equals the approved four statuses',
  [...CHECKOUT_DISPATCH_STATUSES].slice().sort(),
  [...ALLOWED].slice().sort());

for (const blocked of ['pending', 'rejected', 'cancelled']) {
  check('status "' + blocked + '" is not printable', CHECKOUT_DISPATCH_STATUSES.includes(blocked), false);
}

// --- 2) source audit: is a call site wrapped by the status guard? -----------
const wrapperBefore = (source, needle) => {
  const at = source.indexOf(needle);
  if (at === -1) return 'call site not found';

  const guard = /CHECKOUT_DISPATCH_STATUSES\.includes\(order\.status\)\s*&&\s*\(/g;
  let match;
  let lastGuard = -1;
  while ((match = guard.exec(source)) !== null) {
    if (match.index < at) lastGuard = match.index;
    else break;
  }
  if (lastGuard === -1) return 'no guard wrapper before the call site';

  const between = source.slice(lastGuard, at);
  if (between.includes(')}')) return 'the guard wrapper closes before the call site';
  if (!between.includes('<Button')) return 'no <Button> inside the guard wrapper';
  return 'guarded';
};

check('handleDownloadCheckoutPDF starts with the status guard',
  /const handleDownloadCheckoutPDF = async \(\) => \{\s*if \(!CHECKOUT_DISPATCH_STATUSES\.includes\(order\.status\)\) \{/.test(modal),
  true);

check('checkout slip button is wrapped in the status guard',
  wrapperBefore(modal, 'onClick={handleDownloadCheckoutPDF}'), 'guarded');

check('dispatch note button is still wrapped in the status guard',
  wrapperBefore(modal, 'onClick={handleDownloadDispatchPDF}'), 'guarded');

check('checkout slip guard shows a toast before returning',
  /if \(!CHECKOUT_DISPATCH_STATUSES\.includes\(order\.status\)\) \{\s*toast\.error\(/.test(modal),
  true);

// --- report -----------------------------------------------------------------
console.log('====================================================');
console.log('   Checkout PDF guard verification (/checkouts)       ');
console.log('====================================================');
for (const row of rows) {
  console.log('[' + row.status + '] ' + row.label + (row.detail ? ' - ' + row.detail : ''));
}
console.log('----------------------------------------------------');
console.log('Total: ' + rows.length + ' cases, failed: ' + failures);

if (failures > 0) {
  console.error('[FAIL] Checkout PDF guard verification failed.');
  process.exit(1);
}
console.log('[PASS] All checkout PDF guard cases passed.');
