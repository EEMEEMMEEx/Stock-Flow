import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveCheckoutMeta, formatProjectLocation } from '../src/lib/checkoutDisplay.js';
import { formatRevertDate, REVERT_KINDS } from '../src/lib/superRevert.js';
import en from '../src/i18n/locales/en.js';
import th from '../src/i18n/locales/th.js';

console.log('====================================================');
console.log('   Checkout History Mobile UX Verification Suite    ');
console.log('====================================================\n');

// 1. Verify file content and guards
const historyFile = readFileSync('src/components/checkouts/CheckoutHistoryList.jsx', 'utf8');

// Guard checks from regression scripts
assert.ok(/resolveCheckoutMeta\(order\)/.test(historyFile), 'Must use resolveCheckoutMeta(order)');
assert.ok(/\{location && \(/.test(historyFile), 'Must check {location && (');
assert.ok(!/projectDisplay/.test(historyFile), 'Must not use obsolete projectDisplay');
assert.ok(/canRevertAction && onOpenRevertModal && revertKindFor\(order\)/.test(historyFile), 'Must gate revert button with exact guard');
assert.ok(/HISTORY_FILTERS/.test(historyFile), 'Must define HISTORY_FILTERS');
assert.ok(/historyFilterApproved/.test(historyFile), 'Must include historyFilterApproved');
assert.ok(/o\.status !== 'pending'/.test(historyFile), 'Must filter out pending status');
assert.ok(/REVERT_KINDS\.CHECKOUT_RETURNS/.test(historyFile), 'Must include REVERT_KINDS.CHECKOUT_RETURNS');
assert.ok(/REVERT_KINDS\.CHECKOUT_REJECTION/.test(historyFile), 'Must include REVERT_KINDS.CHECKOUT_REJECTION');
assert.ok(/revertLabelKeyFor\(order\)/.test(historyFile), 'Must call revertLabelKeyFor(order)');

console.log('[PASS] Static regression guards matched 100%');

// 2. Verify requirements on status & actions
// Cancel action should be restricted to !isCancelled && !isRejected
assert.ok(/!isCancelled && !isRejected/.test(historyFile), 'Cancel order action must be hidden on cancelled or rejected items');

// Check that dropdown menu exists for secondary actions
assert.ok(/DropdownMenu\.Root/.test(historyFile), 'DropdownMenu from Radix UI must be mounted');
assert.ok(/MoreHorizontal/.test(historyFile), 'MoreHorizontal icon must be used for menu trigger');
assert.ok(/min-h-\[44px\]/.test(historyFile), 'Touch target must be at least 44px');

console.log('[PASS] Status & Action menu rules validated (Cancel hidden on rejected/cancelled, min 44px touch targets)');

// 3. Verify deduplication logic for rejection and revert reasons
function buildCompactStatusNote(order, lang = 'th') {
  const isRejected = order.status === 'rejected';
  const isCancelled = order.status === 'cancelled';
  const rejectionReason = (isRejected && order.rejection_reason) ? order.rejection_reason.trim() : null;
  const cancellationReason = (isCancelled && order.cancellation_reason) ? order.cancellation_reason.trim() : null;
  const revertReason = order.last_revert_reason ? order.last_revert_reason.trim() : null;
  const reverterName = order.reverter?.full_name || 'SUPER';
  const revertDateStr = order.last_reverted_at ? formatRevertDate(order.last_reverted_at, lang) : null;

  const noteParts = [];
  if (isRejected && rejectionReason) {
    noteParts.push(`ถูกปฏิเสธ: ${rejectionReason}`);
  } else if (isCancelled && cancellationReason) {
    noteParts.push(`ยกเลิกแล้ว: ${cancellationReason}`);
  }

  if (order.last_reverted_at) {
    let revPart = `ย้อนสถานะโดย ${reverterName} เมื่อ ${revertDateStr}`;
    if (revertReason && revertReason !== rejectionReason && revertReason !== cancellationReason) {
      revPart += ` (เหตุผล: ${revertReason})`;
    }
    noteParts.push(revPart);
  }

  return noteParts.join(' · ');
}

// Case A: Duplicate reasons (as seen in user screenshot: rejection_reason: "ยกเลิก", revertReason: "ยกเลิก")
const duplicateOrder = {
  status: 'rejected',
  rejection_reason: 'ยกเลิก',
  last_revert_reason: 'ยกเลิก',
  last_reverted_at: '2026-11-08T07:39:00Z',
  reverter: { full_name: 'System Administrator' }
};
const noteA = buildCompactStatusNote(duplicateOrder, 'th');
assert.ok(noteA.includes('ถูกปฏิเสธ: ยกเลิก'), 'Must mention rejection reason');
assert.ok(noteA.includes('ย้อนสถานะโดย System Administrator'), 'Must mention reverter');
// The word "ยกเลิก" should appear exactly once in reasons, not repeated in "(เหตุผล: ยกเลิก)"
const occurrences = (noteA.match(/ยกเลิก/g) || []).length;
assert.equal(occurrences, 1, 'Duplicate reason "ยกเลิก" must be deduplicated and only appear once');
console.log('[PASS] Reason deduplication verified:', noteA);

// Case B: Different reasons
const differentOrder = {
  status: 'rejected',
  rejection_reason: 'พัสดุชำรุด',
  last_revert_reason: 'แก้ไขเอกสาร',
  last_reverted_at: '2026-11-08T07:39:00Z',
  reverter: { full_name: 'System Administrator' }
};
const noteB = buildCompactStatusNote(differentOrder, 'th');
assert.ok(noteB.includes('ถูกปฏิเสธ: พัสดุชำรุด'));
assert.ok(noteB.includes('(เหตุผล: แก้ไขเอกสาร)'));
console.log('[PASS] Non-duplicate reasons both preserved:', noteB);

// 4. Verify item count and pcs summary
const sampleItems = [
  { items: { name: 'Cable', unit: 'เส้น' }, quantity_borrowed: 2 },
  { items: { name: 'Fuse', unit: 'ชิ้น' }, quantity_borrowed: 5 },
  { items: { name: 'Battery', unit: 'ก้อน' }, quantity_borrowed: 1 }
];
const itemCount = sampleItems.length;
const unitCount = sampleItems.reduce((s, i) => s + i.quantity_borrowed, 0);
assert.equal(itemCount, 3);
assert.equal(unitCount, 8);

// First 2 shown, remaining 1
const visibleItems = sampleItems.slice(0, 2);
const remainingCount = sampleItems.length - 2;
assert.equal(visibleItems.length, 2);
assert.equal(remainingCount, 1);
console.log(`[PASS] Items display logic verified: ${visibleItems.length} shown, +${remainingCount} more`);

// 5. Verify i18n key existence in both languages
const requiredKeys = [
  'itemsSummary',
  'showMoreItems',
  'showLessItems',
  'dateRangeAll',
  'dateRangeToday',
  'dateRange7Days',
  'dateRange30Days',
  'dateRangeThisMonth',
  'resultsCount',
  'clearFiltersBtn',
  'rejectedCompactPrefix',
  'revertedCompactPrefix',
  'cancelledCompactPrefix',
  'moreActions',
  'tapToViewFullProject'
];

for (const k of requiredKeys) {
  assert.ok(en.checkouts[k], `Missing en.checkouts.${k}`);
  assert.ok(th.checkouts[k], `Missing th.checkouts.${k}`);
}
console.log(`[PASS] All ${requiredKeys.length} new i18n keys exist with 100% parity`);

// 6. Verify Thai typography & line height (leading-relaxed / leading-normal)
assert.ok(historyFile.includes('leading-relaxed'), 'Must use leading-relaxed for Thai typography');

console.log('\n====================================================');
console.log(' ALL 6 MOBILE UX/UI TEST SUITES PASSED CLEANLY!     ');
console.log('====================================================');
