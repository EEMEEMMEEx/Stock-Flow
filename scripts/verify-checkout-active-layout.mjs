// Static guards for the equipment borrow/return row layout.
//
//   npm run verify:checkout-layout
//
// Proves the long-term/no-due-date row keeps the same structure as normal rows:
// badges never shrink, the left column has a responsive minimum, actions wrap,
// truncated text exposes a title, and empty org/location blocks are hidden.
import { readFileSync } from 'node:fs';
import en from '../src/i18n/locales/en.js';
import th from '../src/i18n/locales/th.js';
import { formatProjectLocation, resolveCheckoutMeta } from '../src/lib/checkoutDisplay.js';

const read = (path) => readFileSync(path, 'utf8');
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
  console.log((pass ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' :: ' + detail : ''));
};

const active = read('src/components/checkouts/CheckoutActiveList.jsx');
const history = read('src/components/checkouts/CheckoutHistoryList.jsx');
const pending = read('src/components/checkouts/CheckoutPendingList.jsx');
const detail = read('src/components/checkouts/CheckoutDetailModal.jsx');
const extend = read('src/components/checkouts/CheckoutExtendModal.jsx');

check('active row uses the shared checkout meta helper', /resolveCheckoutMeta\(order\)/.test(active));
check('history row uses the shared checkout meta helper', /resolveCheckoutMeta\(order\)/.test(history));
check('pending list uses the shared project formatter', /formatProjectLocation\(order\.projects\)/.test(pending));
check('detail and extend views use the shared project formatter',
  /formatProjectLocation\(order\.projects\)/.test(detail) && /formatProjectLocation\(order\.projects\)/.test(extend));

check('order number and badges cannot shrink or wrap per character',
  /whitespace-nowrap shrink-0/.test(active) && (active.match(/whitespace-nowrap/g) || []).length >= 4);
check('left column keeps a responsive minimum width', /xl:min-w-\[320px\]/.test(active));
check('row switches to two columns only at xl', /flex flex-col xl:flex-row xl:items-center/.test(active));
check('actions wrap instead of squeezing the content', /flex flex-wrap items-center justify-end gap-2/.test(active) && /w-full xl:w-auto/.test(active));
check('equipment chips are single-line and ellipsized',
  /inline-block max-w-full truncate align-middle whitespace-nowrap/.test(active));
check('equipment chips expose the full value through title', /title=\{\`/.test(active));
check('borrower and location expose the full value through title',
  /title=\{order\.borrower_name\}/.test(active) && /title=\{location\}/.test(active));
check('empty location is not rendered in the active list', /\{location && \(/.test(active) && !/projectDisplay/.test(active));
check('empty location is not rendered in history', /\{location && \(/.test(history) && !/projectDisplay/.test(history));
check('overdue logic excludes indefinite/no-due-date rows', /if \(!isIndefinite && order\.expected_return_date\)/.test(active));
check('row does not use inline absolute positioning', !/position:\s*absolute/.test(active));
check('due-date line is visible from sm and never wraps', /hidden sm:block whitespace-nowrap/.test(active));

check('indefinite loan label exists in Thai', /"indefiniteLoan":\s*"ยืมระยะยาว \/ ไม่ระบุกำหนดคืน"/.test(read('src/i18n/locales/th.js')));
check('indefinite loan label exists in English', Boolean(en.checkouts?.indefiniteLoan) || Boolean(th.checkouts?.indefiniteLoan));

check('helper returns null for missing project', formatProjectLocation(null) === null && formatProjectLocation({}) === null);
check('helper returns null department for blank input', resolveCheckoutMeta({ borrower_department: '  ' }).department === null);
check('helper reports no meta when both values are missing', resolveCheckoutMeta({}).hasAny === false);

const failed = results.filter((entry) => !entry.pass);
console.log('\n' + '='.repeat(60));
console.log('CHECKOUT ACTIVE LAYOUT GUARDS: ' + (results.length - failed.length) + '/' + results.length + ' PASS');
if (failed.length) {
  console.log('Failed checks:');
  failed.forEach((entry) => console.log(' - ' + entry.name + (entry.detail ? ' :: ' + entry.detail : '')));
}
process.exit(failed.length === 0 ? 0 : 1);
