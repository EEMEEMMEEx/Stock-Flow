import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isOrderHistoryAdmin,
  canViewAllOrderHistory,
  getAuthUserId,
  isSameId,
  applyWithdrawalOrdersScope,
  applyCheckoutOrdersScope,
  canAccessWithdrawalRecord,
  canAccessCheckoutRecord,
  filterWithdrawalOrders,
  filterCheckoutOrders
} from './orderHistoryAuth.js';

test('isSameId performs case-insensitive, whitespace-tolerant string matching', () => {
  assert.equal(isSameId('ABC-123', 'abc-123'), true);
  assert.equal(isSameId('  uid-1  ', 'uid-1'), true);
  assert.equal(isSameId('u1', 'u2'), false);
  assert.equal(isSameId(null, 'u1'), false);
  assert.equal(isSameId('u1', undefined), false);
  assert.equal(isSameId(null, null), false);
});

test('isOrderHistoryAdmin identifies privileged roles and approvals', () => {
  // Direct boolean flags
  assert.equal(isOrderHistoryAdmin({ isAdmin: true }), true);
  assert.equal(isOrderHistoryAdmin({ isSuperAdmin: true }), true);

  // System admin email override
  assert.equal(isOrderHistoryAdmin({ user: { email: 'admin@stockflow.com' } }), true);

  // Privileged role codes
  assert.equal(isOrderHistoryAdmin({ profile: { role: 'SUPER' } }), true);
  assert.equal(isOrderHistoryAdmin({ profile: { role: 'ADMIN' } }), true);
  assert.equal(isOrderHistoryAdmin({ profile: { role: 'SUPERVISOR' } }), true);
  assert.equal(isOrderHistoryAdmin({ profile: { role: 'APPROVER' } }), true);
  assert.equal(isOrderHistoryAdmin({ profile: { role: 'MANAGER' } }), true);
  assert.equal(isOrderHistoryAdmin({ profile: { roles: { code: 'SUPERVISOR' } } }), true);
  assert.equal(isOrderHistoryAdmin({ profile: { roles: [{ code: 'SUPERVISOR' }] } }), true);

  // Legacy & Display role names (Supervisor / Approver, Super Admin, System Administrator)
  assert.equal(isOrderHistoryAdmin({ profile: { role: 'Supervisor / Approver' } }), true);
  assert.equal(isOrderHistoryAdmin({ profile: { role: 'SUPERVISOR / APPROVER' } }), true);
  assert.equal(isOrderHistoryAdmin({ profile: { role: 'Super Admin' } }), true);
  assert.equal(isOrderHistoryAdmin({ profile: { role: 'System Administrator' } }), true);
  assert.equal(isOrderHistoryAdmin({ profile: { role: 'Administrator' } }), true);
  assert.equal(isOrderHistoryAdmin({ user: { user_metadata: { role: 'SUPERVISOR' } } }), true);

  // Regular roles with approval permissions
  assert.equal(isOrderHistoryAdmin({
    profile: { role: 'STAFF' },
    can: (perm) => perm === 'withdrawals.approve'
  }), true);

  assert.equal(isOrderHistoryAdmin({
    profile: { role: 'STAFF' },
    can: (perm) => perm === 'checkouts.approve'
  }), true);

  assert.equal(isOrderHistoryAdmin({
    profile: { role: 'REQUESTER' },
    canAny: (perms) => perms.includes('withdrawals.approve')
  }), true);

  assert.equal(isOrderHistoryAdmin({
    profile: { role: 'STAFF' },
    permissions: ['withdrawals.update']
  }), true);

  assert.equal(isOrderHistoryAdmin({
    profile: { role: 'STAFF' },
    permissions: new Set(['checkouts.approve'])
  }), true);

  assert.equal(isOrderHistoryAdmin({
    profile: { role: 'STAFF', permissions: ['withdrawals.approve'] }
  }), true);

  // Regular roles without approvals
  assert.equal(isOrderHistoryAdmin({ profile: { role: 'STAFF' } }), false);
  assert.equal(isOrderHistoryAdmin({ profile: { role: 'REQUESTER' } }), false);
  assert.equal(isOrderHistoryAdmin({ profile: { role: 'Staff / Requester' } }), false);
  assert.equal(isOrderHistoryAdmin({ profile: { role: 'VIEWER' } }), false);
  assert.equal(isOrderHistoryAdmin({
    profile: { role: 'STAFF' },
    permissions: ['items.view', 'withdrawals.create']
  }), false);

  // Edge cases
  assert.equal(isOrderHistoryAdmin(null), false);
  assert.equal(isOrderHistoryAdmin({}), false);

  // Backward compatible alias
  assert.equal(canViewAllOrderHistory({ isAdmin: true }), true);
  assert.equal(canViewAllOrderHistory({ profile: { role: 'STAFF' } }), false);
});

test('getAuthUserId extracts userId from various structures', () => {
  assert.equal(getAuthUserId({ profile: { id: 'prof-1' } }), 'prof-1');
  assert.equal(getAuthUserId({ user: { id: 'user-1' } }), 'user-1');
  assert.equal(getAuthUserId({ userId: 'uid-1' }), 'uid-1');
  assert.equal(getAuthUserId('direct-id'), 'direct-id');
  assert.equal(getAuthUserId('  whitespace-id  '), 'whitespace-id');
  assert.equal(getAuthUserId(null), null);
});

test('applyWithdrawalOrdersScope scopes queries for regular staff and bypasses for admin/supervisor', () => {
  const createMockQuery = () => {
    const calls = [];
    return {
      calls,
      eq(col, val) {
        calls.push({ method: 'eq', col, val });
        return this;
      }
    };
  };

  // 1. Admin bypass - query untouched
  const adminQuery = createMockQuery();
  const adminRes = applyWithdrawalOrdersScope(adminQuery, { isAdmin: true });
  assert.equal(adminRes, adminQuery);
  assert.equal(adminQuery.calls.length, 0);

  // 2. Supervisor bypass - query untouched
  const supervisorQuery = createMockQuery();
  applyWithdrawalOrdersScope(supervisorQuery, { profile: { role: 'SUPERVISOR' } });
  assert.equal(supervisorQuery.calls.length, 0);

  const approverCombinedQuery = createMockQuery();
  applyWithdrawalOrdersScope(approverCombinedQuery, { profile: { role: 'Supervisor / Approver' } });
  assert.equal(approverCombinedQuery.calls.length, 0);

  // 3. Regular staff - filtered by requested_by
  const staffQuery = createMockQuery();
  applyWithdrawalOrdersScope(staffQuery, {
    profile: { id: 'staff-42', role: 'STAFF' }
  });
  assert.deepEqual(staffQuery.calls, [
    { method: 'eq', col: 'requested_by', val: 'staff-42' }
  ]);

  // 4. Missing user - filtered with zero UUID safeguard
  const emptyQuery = createMockQuery();
  applyWithdrawalOrdersScope(emptyQuery, { profile: null, user: null });
  assert.deepEqual(emptyQuery.calls, [
    { method: 'eq', col: 'requested_by', val: '00000000-0000-0000-0000-000000000000' }
  ]);
});

test('applyCheckoutOrdersScope scopes queries for regular staff and bypasses for admin/supervisor', () => {
  const createMockQuery = () => {
    const calls = [];
    return {
      calls,
      or(clause) {
        calls.push({ method: 'or', clause });
        return this;
      }
    };
  };

  // 1. Admin bypass
  const adminQuery = createMockQuery();
  applyCheckoutOrdersScope(adminQuery, { isAdmin: true });
  assert.equal(adminQuery.calls.length, 0);

  // 2. Approver bypass
  const approverQuery = createMockQuery();
  applyCheckoutOrdersScope(approverQuery, { profile: { role: 'APPROVER' } });
  assert.equal(approverQuery.calls.length, 0);

  // 3. Regular staff - filtered by borrower_id OR created_by
  const staffQuery = createMockQuery();
  applyCheckoutOrdersScope(staffQuery, {
    profile: { id: 'user-99', role: 'STAFF' }
  });
  assert.deepEqual(staffQuery.calls, [
    { method: 'or', clause: 'borrower_id.eq.user-99,created_by.eq.user-99' }
  ]);

  // 4. Missing user - zero UUID fallback
  const emptyQuery = createMockQuery();
  applyCheckoutOrdersScope(emptyQuery, { profile: null });
  assert.deepEqual(emptyQuery.calls, [
    { method: 'or', clause: 'borrower_id.eq.00000000-0000-0000-0000-000000000000,created_by.eq.00000000-0000-0000-0000-000000000000' }
  ]);
});

test('canAccessWithdrawalRecord checks detail/export authorization', () => {
  const staffCtx = { profile: { id: 'staff-1', role: 'STAFF' } };
  const adminCtx = { isAdmin: true };
  const supervisorCtx = { profile: { role: 'SUPERVISOR' } };
  const approverCtx = { profile: { role: 'Supervisor / Approver' } };

  const ownOrder = { id: 'w-1', requested_by: 'staff-1' };
  const ownOrderCaseInsensitive = { id: 'w-1', requested_by: 'STAFF-1' };
  const ownOrderObject = { id: 'w-1', requested_by: { id: 'staff-1' } };
  const otherOrder = { id: 'w-2', requested_by: 'staff-2' };
  const nestedOrder = { id: 'w-3', profiles: { id: 'staff-1' } };
  const arrayNestedOrder = { id: 'w-4', profiles: [{ id: 'staff-1' }] };

  // Admin and Supervisor can access any order
  assert.equal(canAccessWithdrawalRecord(ownOrder, adminCtx), true);
  assert.equal(canAccessWithdrawalRecord(otherOrder, adminCtx), true);
  assert.equal(canAccessWithdrawalRecord(otherOrder, supervisorCtx), true);
  assert.equal(canAccessWithdrawalRecord(otherOrder, approverCtx), true);

  // Staff can only access their own
  assert.equal(canAccessWithdrawalRecord(ownOrder, staffCtx), true);
  assert.equal(canAccessWithdrawalRecord(ownOrderCaseInsensitive, staffCtx), true);
  assert.equal(canAccessWithdrawalRecord(ownOrderObject, staffCtx), true);
  assert.equal(canAccessWithdrawalRecord(nestedOrder, staffCtx), true);
  assert.equal(canAccessWithdrawalRecord(arrayNestedOrder, staffCtx), true);
  assert.equal(canAccessWithdrawalRecord(otherOrder, staffCtx), false);

  // Falsy inputs
  assert.equal(canAccessWithdrawalRecord(null, staffCtx), false);
  assert.equal(canAccessWithdrawalRecord(ownOrder, null), false);
});

test('canAccessCheckoutRecord checks detail/export authorization', () => {
  const staffCtx = { profile: { id: 'staff-1', role: 'STAFF' } };
  const adminCtx = { isAdmin: true };
  const approverCtx = { profile: { role: 'Supervisor / Approver' } };

  const borrowerOrder = { id: 'c-1', borrower_id: 'staff-1', created_by: 'other' };
  const borrowerOrderUpper = { id: 'c-1', borrower_id: 'STAFF-1', created_by: 'other' };
  const borrowerOrderObject = { id: 'c-1', borrower: { id: 'staff-1' } };
  const creatorOrder = { id: 'c-2', borrower_id: 'other', created_by: 'staff-1' };
  const creatorOrderObject = { id: 'c-2', borrower_id: 'other', created_by: { id: 'staff-1' } };
  const nestedBorrowerOrder = { id: 'c-3', borrower: { id: 'staff-1' } };
  const otherOrder = { id: 'c-4', borrower_id: 'other-1', created_by: 'other-2' };

  // Admin & Approver access
  assert.equal(canAccessCheckoutRecord(otherOrder, adminCtx), true);
  assert.equal(canAccessCheckoutRecord(otherOrder, approverCtx), true);

  // Staff access
  assert.equal(canAccessCheckoutRecord(borrowerOrder, staffCtx), true);
  assert.equal(canAccessCheckoutRecord(borrowerOrderUpper, staffCtx), true);
  assert.equal(canAccessCheckoutRecord(borrowerOrderObject, staffCtx), true);
  assert.equal(canAccessCheckoutRecord(creatorOrder, staffCtx), true);
  assert.equal(canAccessCheckoutRecord(creatorOrderObject, staffCtx), true);
  assert.equal(canAccessCheckoutRecord(nestedBorrowerOrder, staffCtx), true);
  assert.equal(canAccessCheckoutRecord(otherOrder, staffCtx), false);

  // Falsy inputs
  assert.equal(canAccessCheckoutRecord(null, staffCtx), false);
  assert.equal(canAccessCheckoutRecord(borrowerOrder, null), false);
});

test('filterWithdrawalOrders and filterCheckoutOrders filter arrays correctly', () => {
  const staffCtx = { profile: { id: 'u1', role: 'STAFF' } };
  const adminCtx = { isAdmin: true };

  const wOrders = [
    { id: 'w1', requested_by: 'u1' },
    { id: 'w2', requested_by: 'u2' }
  ];
  assert.deepEqual(filterWithdrawalOrders(wOrders, staffCtx), [{ id: 'w1', requested_by: 'u1' }]);
  assert.deepEqual(filterWithdrawalOrders(wOrders, adminCtx), wOrders);

  const cOrders = [
    { id: 'c1', borrower_id: 'u1' },
    { id: 'c2', created_by: 'u1' },
    { id: 'c3', borrower_id: 'u2', created_by: 'u3' }
  ];
  assert.deepEqual(filterCheckoutOrders(cOrders, staffCtx), [
    { id: 'c1', borrower_id: 'u1' },
    { id: 'c2', created_by: 'u1' }
  ]);
  assert.deepEqual(filterCheckoutOrders(cOrders, adminCtx), cOrders);
});
