// Behavioural verification for the notification deep-link resolver.
// Plain Node script (no JSX, no child processes) so it runs under the DSH sandbox:
//   npm run verify:notifications
import { resolveNotificationTarget } from '../src/lib/notificationTargets.js';

const ORDER_ID = '11111111-2222-3333-4444-555555555555';

let failures = 0;
const rows = [];

const check = (label, actual, expected) => {
  const pass = actual === expected;
  if (!pass) failures += 1;
  rows.push({ status: pass ? 'PASS' : 'FAIL', label, detail: pass ? '' : `got=${actual} expected=${expected}` });
};

// --- checkout events --------------------------------------------------------
check('checkout.submitted -> pending + id',
  resolveNotificationTarget({ event_type: 'checkout.submitted', target_path: '/checkouts', reference_id: ORDER_ID }),
  `/checkouts?tab=pending&id=${ORDER_ID}`);

check('checkout.submitted without reference_id -> pending',
  resolveNotificationTarget({ event_type: 'checkout.submitted', target_path: '/checkouts' }),
  '/checkouts?tab=pending');

check('checkout_submitted (underscore) -> pending + id',
  resolveNotificationTarget({ event_type: 'checkout_submitted', target_path: '/checkouts', reference_id: ORDER_ID }),
  `/checkouts?tab=pending&id=${ORDER_ID}`);

check('checkout.approved -> active + id',
  resolveNotificationTarget({ event_type: 'checkout.approved', target_path: '/checkouts', reference_id: ORDER_ID }),
  `/checkouts?tab=active&id=${ORDER_ID}`);

check('checkout.overdue -> active + id',
  resolveNotificationTarget({ event_type: 'checkout.overdue', target_path: '/checkouts', reference_id: ORDER_ID }),
  `/checkouts?tab=active&id=${ORDER_ID}`);

check('checkout.completed -> history + id',
  resolveNotificationTarget({ event_type: 'checkout.completed', target_path: '/checkouts', reference_id: ORDER_ID }),
  `/checkouts?tab=history&id=${ORDER_ID}`);

check('checkout.rejected -> history + id (rejected orders live in the history tab)',
  resolveNotificationTarget({ event_type: 'checkout.rejected', target_path: '/checkouts', reference_id: ORDER_ID }),
  `/checkouts?tab=history&id=${ORDER_ID}`);

check('unknown checkout event -> approval queue',
  resolveNotificationTarget({ event_type: 'checkout.whatever', target_path: '/checkouts' }),
  '/checkouts?tab=pending');

check('reference_id missing -> metadata.request_no fallback',
  resolveNotificationTarget({ event_type: 'checkout.submitted', target_path: '/checkouts', metadata: { request_no: 'CHK-202610-4403' } }),
  '/checkouts?tab=pending&id=CHK-202610-4403');

check('reference id is URL-encoded',
  resolveNotificationTarget({ event_type: 'checkout.submitted', reference_id: 'A B/C' }),
  '/checkouts?tab=pending&id=A%20B%2FC');

// --- withdrawal events ------------------------------------------------------
check('withdrawal.submitted -> orders + id',
  resolveNotificationTarget({ event_type: 'withdrawal.submitted', target_path: '/withdrawals', reference_id: ORDER_ID }),
  `/withdrawals?tab=orders&id=${ORDER_ID}`);

check('withdrawal_approved (underscore) -> orders',
  resolveNotificationTarget({ event_type: 'withdrawal_approved', target_path: '/withdrawals' }),
  '/withdrawals?tab=orders');

check('withdrawal.completed -> orders + id (never the POS tab)',
  resolveNotificationTarget({ event_type: 'withdrawal.completed', target_path: '/withdrawals', reference_id: ORDER_ID }),
  `/withdrawals?tab=orders&id=${ORDER_ID}`);

// --- pass-through / fallbacks ----------------------------------------------
check('stock.received target_path is preserved',
  resolveNotificationTarget({ event_type: 'stock.received', target_path: '/stock-in', reference_id: ORDER_ID }),
  '/stock-in');

check('target_path with its own query is preserved',
  resolveNotificationTarget({ event_type: 'stock.low_stock', target_path: '/items?filter=low' }),
  '/items?filter=low');

check('unknown event without target_path -> null (no navigation)',
  resolveNotificationTarget({ event_type: 'unknown.event' }),
  null);

check('missing notification -> null', resolveNotificationTarget(undefined), null);

console.log('====================================================');
console.log('   Notification deep-link target verification        ');
console.log('====================================================');
for (const row of rows) {
  console.log(`[${row.status}] ${row.label}${row.detail ? ' — ' + row.detail : ''}`);
}
console.log('----------------------------------------------------');
console.log(`Total: ${rows.length} cases, failed: ${failures}`);

if (failures > 0) {
  console.error('[FAIL] Notification target verification failed.');
  process.exit(1);
}
console.log('[PASS] All notification deep-link cases passed.');
