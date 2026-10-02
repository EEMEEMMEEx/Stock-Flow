// Behavioural verification for the PDF party/document-number resolvers.
// Plain Node script (no JSX, no child processes) so it runs under the DSH sandbox:
//   npm run verify:pdf
import {
  resolveWithdrawalRequester,
  resolveCheckoutBorrower,
  resolveDocumentNumber,
} from '../src/lib/pdf-signatures.js';

const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const BORROWER_SIG = 'data:image/png;base64,BORROWER_SIGNATURE_IMAGE';
const DOTS = '...................................................';

let failures = 0;
const rows = [];

const short = (value) => {
  const text = value === null ? 'null' : String(value);
  return text.length > 32 ? text.slice(0, 29) + '...' : text;
};

const check = (label, actual, expected) => {
  const pass = actual === expected;
  if (!pass) failures += 1;
  rows.push({
    status: pass ? 'PASS' : 'FAIL',
    label,
    detail: pass ? '' : `got=${short(actual)} expected=${short(expected)}`,
  });
};

// ---------------------------------------------------------------------------
// Case A + B: borrower signature for /checkouts (audit ISSUE 1)
// ---------------------------------------------------------------------------
const checkoutOrder = {
  id: 'ord-test-001',
  order_number: 'CHK-202610-0001',
  borrower_id: 'user-borrower',
  borrower_name: 'สมชาย ช่างเทคนิค',
};

const withBorrower = { ...checkoutOrder, borrower: { id: 'user-borrower', full_name: 'สมชาย ช่างเทคนิค', signature_url: BORROWER_SIG } };
check('checkout: borrower object -> signature', resolveCheckoutBorrower(withBorrower).signatureUrl, BORROWER_SIG);
check('checkout: borrower object -> name', resolveCheckoutBorrower(withBorrower).name, 'สมชาย ช่างเทคนิค');

const withBorrowerArray = { ...checkoutOrder, borrower: [{ id: 'user-borrower', full_name: 'สมชาย ช่างเทคนิค', signature_url: BORROWER_SIG }] };
check('checkout: borrower array -> signature', resolveCheckoutBorrower(withBorrowerArray).signatureUrl, BORROWER_SIG);

const legacySignature = { ...checkoutOrder, signature_url: BORROWER_SIG };
check('checkout: legacy order.signature_url -> signature', resolveCheckoutBorrower(legacySignature).signatureUrl, BORROWER_SIG);

check('checkout: no signature anywhere -> null', resolveCheckoutBorrower(checkoutOrder).signatureUrl, null);
check('checkout: no signature -> name still shown', resolveCheckoutBorrower(checkoutOrder).name, 'สมชาย ช่างเทคนิค');
check('checkout: anonymous order -> dotted line', resolveCheckoutBorrower({ id: 'x' }).name, DOTS);

// ---------------------------------------------------------------------------
// Case C: requester signature for /withdrawals (audit ISSUE 2)
// ---------------------------------------------------------------------------
const viewer = { id: 'user-viewer', full_name: 'ผู้พิมพ์', signature_url: SIG };

const withdrawalOrder = {
  id: 'abcdef12-3456-7890-abcd-ef1234567890',
  work_order_no: 'WO-2026-0001',
  requested_by: 'user-requester',
  profiles: { id: 'user-requester', full_name: 'สมเกียรติ วิศวกร', signature_url: BORROWER_SIG },
};

check('withdrawal: profiles object -> signature', resolveWithdrawalRequester(withdrawalOrder, viewer).signatureUrl, BORROWER_SIG);
check('withdrawal: profiles object -> name', resolveWithdrawalRequester(withdrawalOrder, viewer).name, 'สมเกียรติ วิศวกร');

const withdrawalArray = { ...withdrawalOrder, profiles: [withdrawalOrder.profiles] };
check('withdrawal: profiles array -> signature', resolveWithdrawalRequester(withdrawalArray, viewer).signatureUrl, BORROWER_SIG);
check('withdrawal: profiles array -> name', resolveWithdrawalRequester(withdrawalArray, viewer).name, 'สมเกียรติ วิศวกร');

const noEmbedSelf = { ...withdrawalOrder, profiles: null };
check('withdrawal: no embed + self -> profile signature', resolveWithdrawalRequester(noEmbedSelf, viewer).signatureUrl, null);
check('withdrawal: no embed + self (requested_by=viewer) -> profile signature',
  resolveWithdrawalRequester({ ...noEmbedSelf, requested_by: viewer.id }, viewer).signatureUrl, SIG);
check('withdrawal: no embed + other requester -> must stay null',
  resolveWithdrawalRequester(noEmbedSelf, viewer).signatureUrl, null);
check('withdrawal: no profile -> dotted line', resolveWithdrawalRequester({ id: 'x' }, null).name, DOTS);
check('withdrawal: requester without signature -> null',
  resolveWithdrawalRequester({ ...withdrawalOrder, profiles: { full_name: 'ไม่มีลายเซ็น', signature_url: null } }, null).signatureUrl, null);

// ---------------------------------------------------------------------------
// Document number (audit ISSUE 3)
// ---------------------------------------------------------------------------
check('docno: withdrawal uses work_order_no', resolveDocumentNumber(withdrawalOrder), 'WO-2026-0001');
check('docno: withdrawal fallback to #id', resolveDocumentNumber({ id: 'abcdef12-3456' }), '#abcdef12');
check('docno: checkout uses order_number', resolveDocumentNumber(checkoutOrder, 'checkout'), 'CHK-202610-0001');
check('docno: missing values -> dash', resolveDocumentNumber({}), '—');

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log('====================================================');
console.log('     PDF signature / document number verification    ');
console.log('====================================================');
for (const row of rows) {
  console.log(`[${row.status}] ${row.label}${row.detail ? ' — ' + row.detail : ''}`);
}
console.log('----------------------------------------------------');
console.log(`Total: ${rows.length} cases, failed: ${failures}`);

if (failures > 0) {
  console.error('[FAIL] PDF signature verification failed.');
  process.exit(1);
}
console.log('[PASS] All PDF signature/document-number cases passed.');
