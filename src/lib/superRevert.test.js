import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REVERT_KINDS,
  parseRevertErrorKey,
  remainingStatusAfterReturnRevert,
  resolveRevertRequest,
  summarizeRevertStockImpact,
} from './superRevert.js';

const order = {
  id: 'order-1',
  status: 'completed',
  project_id: 'p1',
  withdrawal_items: [
    { deducted_quantity: 3, project_id: 'p1' },
    { deducted_quantity: 4, project_id: 'p2' },
  ],
  checkout_items: [
    { item_id: 'i1', quantity_borrowed: 2, quantity_returned: 2, items: { unit: 'pcs' } },
    { item_id: 'i2', quantity_borrowed: 1, quantity_returned: 0, items: { unit: 'pcs' } },
  ],
};

test('maps every withdrawal revert kind to the authoritative RPC and target action', () => {
  const completion = resolveRevertRequest(REVERT_KINDS.WITHDRAWAL_COMPLETION, { order });
  assert.equal(completion.rpc, 'super_revert_withdrawal_action');
  assert.equal(completion.params.p_target_action, 'revert_completion');
  assert.equal(completion.fromStatus, 'completed');
  assert.equal(completion.toStatus, 'approved');

  const approval = resolveRevertRequest(REVERT_KINDS.WITHDRAWAL_APPROVAL, { order: { ...order, status: 'approved' } });
  assert.equal(approval.params.p_target_action, 'revert_approval');
  assert.equal(approval.toStatus, 'pending');

  const rejection = resolveRevertRequest(REVERT_KINDS.WITHDRAWAL_REJECTION, { order: { ...order, status: 'rejected' } });
  assert.equal(rejection.params.p_target_action, 'revert_rejection');
  assert.equal(rejection.toStatus, 'pending');
});

test('maps checkout approval and return reverts to their own RPCs', () => {
  const approval = resolveRevertRequest(REVERT_KINDS.CHECKOUT_APPROVAL, { order: { ...order, status: 'overdue' } });
  assert.equal(approval.rpc, 'super_revert_checkout_approval');
  assert.equal(approval.fromStatus, 'overdue');
  assert.equal(approval.toStatus, 'pending');

  const returnLog = { id: 'log-1', returned_quantity: 2, item_condition: 'normal' };
  const returned = resolveRevertRequest(REVERT_KINDS.CHECKOUT_RETURN, { order, returnLog });
  assert.equal(returned.rpc, 'super_revert_checkout_return');
  assert.equal(returned.params.p_return_log_id, 'log-1');
  assert.equal(returned.toStatus, 'active');
});

test('maps checkout rejection, all-returns and repair reverts to their RPCs', () => {
  const rejection = resolveRevertRequest(REVERT_KINDS.CHECKOUT_REJECTION, { order: { ...order, status: 'rejected' } });
  assert.equal(rejection.rpc, 'super_revert_checkout_rejection');
  assert.equal(rejection.params.p_order_id, 'order-1');
  assert.equal(rejection.toStatus, 'pending');
  assert.equal(rejection.auditAction, 'CHECKOUT_REJECT_REVERT');

  const allReturns = resolveRevertRequest(REVERT_KINDS.CHECKOUT_RETURNS, { order });
  assert.equal(allReturns.rpc, 'super_revert_checkout_order_returns');
  assert.equal(allReturns.toStatus, 'active');

  const repair = resolveRevertRequest(REVERT_KINDS.CHECKOUT_REPAIR, {
    returnLog: { id: 'log-9', repair_resolution_status: 'restored_to_stock' },
  });
  assert.equal(repair.rpc, 'super_revert_damaged_repair');
  assert.equal(repair.params.p_return_log_id, 'log-9');
  assert.equal(repair.fromStatus, 'restored_to_stock');
  assert.equal(repair.toStatus, 'unresolved');
  assert.equal(repair.auditAction, 'CHECKOUT_REPAIR_REVERT');

  assert.equal(resolveRevertRequest(REVERT_KINDS.CHECKOUT_RETURNS, { order: null }), null);
  assert.equal(resolveRevertRequest(REVERT_KINDS.CHECKOUT_REPAIR, { returnLog: null }), null);
});

test('summarizes the all-returns stock impact from the normal-return counters', () => {
  const impact = summarizeRevertStockImpact(REVERT_KINDS.CHECKOUT_RETURNS, { order });
  assert.deepEqual(impact, { type: 'deduct_returns_all', qty: 2, unit: 'pcs' });

  const none = summarizeRevertStockImpact(REVERT_KINDS.CHECKOUT_REJECTION, { order: { ...order, checkout_items: [] } });
  assert.deepEqual(none, { type: 'none' });
});

test('maps the S/N re-loan guard to its own error key', () => {
  assert.equal(parseRevertErrorKey({ message: 'EQUIPMENT_ALREADY_RELOANED: Serial SN-1 is already on loan' }), 'superRevert.errEquipmentReloaned');
});

test('recomputes active when the reverted return was the last accounted quantity', () => {
  const single = {
    ...order,
    checkout_items: [{ quantity_returned: 1, quantity_damaged: 0, quantity_lost: 0, quantity_consumed: 0 }],
  };
  assert.equal(remainingStatusAfterReturnRevert(single, { returned_quantity: 1 }), 'active');
  assert.equal(remainingStatusAfterReturnRevert(order, { returned_quantity: 1 }), 'partial_returned');
});

test('summarizes the stock impact of each revert kind', () => {
  const withdrawal = summarizeRevertStockImpact(REVERT_KINDS.WITHDRAWAL_APPROVAL, { order });
  assert.deepEqual(withdrawal, { type: 'restore_withdrawal', qty: 7, lines: 2 });

  const checkout = summarizeRevertStockImpact(REVERT_KINDS.CHECKOUT_APPROVAL, { order });
  assert.deepEqual(checkout, { type: 'restore_checkout', qty: 3, unit: 'pcs' });

  const normalReturn = summarizeRevertStockImpact(REVERT_KINDS.CHECKOUT_RETURN, {
    order,
    returnLog: { returned_quantity: 2, item_condition: 'normal', checkout_items: { items: { unit: 'pcs' } } },
  });
  assert.deepEqual(normalReturn, { type: 'deduct_return', qty: 2, unit: 'pcs' });

  const damagedReturn = summarizeRevertStockImpact(REVERT_KINDS.CHECKOUT_RETURN, {
    order,
    returnLog: { returned_quantity: 1, item_condition: 'damaged' },
  });
  assert.deepEqual(damagedReturn, { type: 'none' });
});

test('maps database errors to actionable i18n keys', () => {
  assert.equal(parseRevertErrorKey({ code: '28000', message: 'x' }), 'superRevert.errUnauthorized');
  assert.equal(parseRevertErrorKey({ code: '42501', message: 'x' }), 'superRevert.errForbidden');
  assert.equal(parseRevertErrorKey({ code: '22023', message: 'x' }), 'superRevert.errReasonRequired');
  assert.equal(parseRevertErrorKey({ message: 'INVALID_STATE: nope' }), 'superRevert.errInvalidState');
  assert.equal(parseRevertErrorKey({ message: 'CASCADE_BLOCKED: later step' }), 'superRevert.errCascadeBlocked');
  assert.equal(parseRevertErrorKey({ message: 'LEGACY_STOCK_UNKNOWN: 2 lines' }), 'superRevert.errLegacyStock');
  assert.equal(parseRevertErrorKey({ message: 'INSUFFICIENT_STOCK: 1 < 2' }), 'superRevert.errInsufficientStock');
  assert.equal(parseRevertErrorKey({ code: 'P0002', message: 'NOT_FOUND' }), 'superRevert.errNotFound');
  assert.equal(parseRevertErrorKey({ code: 'PGRST202', message: 'Could not find the function' }), 'superRevert.errSchema');
  assert.equal(parseRevertErrorKey({ message: 'something else' }), null);
});
