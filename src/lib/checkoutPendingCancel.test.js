import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCheckoutRequestOwner,
  canRequesterCancelPendingOrder,
} from './checkoutPendingCancel.js';

const OWNER_ID = 'a1b2c3d4-e5f6-4789-abcd-000000000001';
const BORROWER_ID = 'b2c3d4e5-f6a7-4890-bcde-000000000002';
const OTHER_USER_ID = 'c3d4e5f6-a7b8-4901-cdef-000000000003';

test('isCheckoutRequestOwner matches created_by or borrower_id', () => {
  const createdByOrder = {
    id: 'ord-1',
    status: 'pending',
    created_by: OWNER_ID,
    borrower_id: null,
  };
  assert.equal(isCheckoutRequestOwner(createdByOrder, OWNER_ID), true);
  assert.equal(isCheckoutRequestOwner(createdByOrder, OTHER_USER_ID), false);

  const borrowerOrder = {
    id: 'ord-2',
    status: 'pending',
    created_by: OTHER_USER_ID,
    borrower_id: BORROWER_ID,
  };
  assert.equal(isCheckoutRequestOwner(borrowerOrder, BORROWER_ID), true);
  assert.equal(isCheckoutRequestOwner(borrowerOrder, OTHER_USER_ID), true);
  assert.equal(isCheckoutRequestOwner(borrowerOrder, OWNER_ID), false);
});

test('isCheckoutRequestOwner performs case-insensitive and whitespace-trimmed UUID matching', () => {
  const order = {
    id: 'ord-3',
    status: 'pending',
    created_by: OWNER_ID.toUpperCase(),
    borrower_id: `  ${BORROWER_ID.toUpperCase()}  `,
  };

  assert.equal(isCheckoutRequestOwner(order, OWNER_ID.toLowerCase()), true);
  assert.equal(isCheckoutRequestOwner(order, `  ${OWNER_ID}  `), true);
  assert.equal(isCheckoutRequestOwner(order, BORROWER_ID.toLowerCase()), true);
});

test('isCheckoutRequestOwner denies non-owners, missing IDs, and missing orders', () => {
  const order = {
    id: 'ord-4',
    status: 'pending',
    created_by: OWNER_ID,
    borrower_id: BORROWER_ID,
    borrower_name: 'Some User',
  };

  assert.equal(isCheckoutRequestOwner(order, OTHER_USER_ID), false);
  assert.equal(isCheckoutRequestOwner(order, null), false);
  assert.equal(isCheckoutRequestOwner(order, undefined), false);
  assert.equal(isCheckoutRequestOwner(order, ''), false);
  assert.equal(isCheckoutRequestOwner(order, '   '), false);
  assert.equal(isCheckoutRequestOwner(null, OWNER_ID), false);
  assert.equal(isCheckoutRequestOwner(undefined, OWNER_ID), false);
  assert.equal(
    isCheckoutRequestOwner({ id: 'ord-empty', status: 'pending', created_by: null, borrower_id: null }, OWNER_ID),
    false
  );
  assert.equal(
    isCheckoutRequestOwner({ id: 'ord-ws', status: 'pending', created_by: '   ', borrower_id: '   ' }, '   '),
    false
  );
});

test('canRequesterCancelPendingOrder allows pending orders for created_by or borrower_id owners', () => {
  const creatorPending = {
    id: 'ord-5',
    status: 'pending',
    created_by: OWNER_ID,
    borrower_id: null,
  };
  const borrowerPending = {
    id: 'ord-6',
    status: 'pending',
    created_by: OTHER_USER_ID,
    borrower_id: BORROWER_ID.toUpperCase(),
  };

  assert.equal(canRequesterCancelPendingOrder(creatorPending, OWNER_ID), true);
  assert.equal(canRequesterCancelPendingOrder(creatorPending, ` ${OWNER_ID.toUpperCase()} `), true);
  assert.equal(canRequesterCancelPendingOrder(borrowerPending, BORROWER_ID), true);
});

test('canRequesterCancelPendingOrder denies non-owners and null/missing userId even when pending', () => {
  const pendingOrder = {
    id: 'ord-7',
    status: 'pending',
    created_by: OWNER_ID,
    borrower_id: BORROWER_ID,
  };

  assert.equal(canRequesterCancelPendingOrder(pendingOrder, OTHER_USER_ID), false);
  assert.equal(canRequesterCancelPendingOrder(pendingOrder, null), false);
  assert.equal(canRequesterCancelPendingOrder(pendingOrder, undefined), false);
  assert.equal(canRequesterCancelPendingOrder(pendingOrder, ''), false);
  assert.equal(canRequesterCancelPendingOrder(null, OWNER_ID), false);
});

test('canRequesterCancelPendingOrder denies all non-pending statuses even for the owner', () => {
  const nonPendingStatuses = [
    'active',
    'rejected',
    'cancelled',
    'completed',
    'partial_returned',
    'overdue',
    '',
    null,
    undefined,
  ];

  for (const status of nonPendingStatuses) {
    const order = {
      id: `ord-${String(status)}`,
      status,
      created_by: OWNER_ID,
      borrower_id: BORROWER_ID,
    };
    assert.equal(
      canRequesterCancelPendingOrder(order, OWNER_ID),
      false,
      `Expected status=${String(status)} to be denied for creator`
    );
    assert.equal(
      canRequesterCancelPendingOrder(order, BORROWER_ID),
      false,
      `Expected status=${String(status)} to be denied for borrower`
    );
  }
});
