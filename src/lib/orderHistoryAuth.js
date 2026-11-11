import {
  normalizeRoleCode,
  isAdminRole,
  isSuperRole,
  isSupervisorRole
} from './roleUtils.js';

export const ORDER_HISTORY_SUPERVISOR_PERMISSIONS = [
  'withdrawals.approve',
  'checkouts.approve',
  'withdrawals.update',
  'withdrawals.reject',
  'withdrawals.complete',
  'checkouts.update',
  'checkouts.reject'
];

/**
 * Case-insensitive, whitespace-trimmed ID comparison for UUIDs and DB keys.
 */
export const isSameId = (a, b) => {
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
};

/**
 * Checks if the user has supervisor/admin privileges for order history view.
 * Per policy: ADMIN, SUPER, and SUPERVISOR / APPROVER (or anyone with approval permissions)
 * are permitted to view all order history across all users.
 * Regular users (STAFF, REQUESTER, VIEWER) only see their own records.
 *
 * @param {object} authContext
 * @returns {boolean}
 */
export const isOrderHistoryAdmin = (authContext) => {
  if (!authContext) return false;

  // 1. Direct flags from AuthContext
  if (authContext.isSuperAdmin || authContext.isAdmin) return true;

  // 2. Email root override
  const email = (
    authContext.user?.email ||
    authContext.profile?.email ||
    ''
  ).toLowerCase().trim();
  if (email === 'admin@stockflow.com') return true;

  // 3. Role code inspection
  const roleCodeInput =
    (Array.isArray(authContext.profile?.roles) ? authContext.profile.roles[0]?.code : authContext.profile?.roles?.code) ||
    authContext.profile?.role ||
    authContext.profile?.role_name ||
    authContext.roles?.code ||
    authContext.role ||
    authContext.user?.role ||
    authContext.user?.user_metadata?.role;
  const roleCode = normalizeRoleCode(roleCodeInput);

  if (isSuperRole(roleCode) || isAdminRole(roleCode) || isSupervisorRole(roleCode)) {
    return true;
  }

  // 4. Permission inspection
  if (typeof authContext.can === 'function') {
    if (ORDER_HISTORY_SUPERVISOR_PERMISSIONS.some(perm => authContext.can(perm))) {
      return true;
    }
  }

  if (typeof authContext.canAny === 'function') {
    if (authContext.canAny(ORDER_HISTORY_SUPERVISOR_PERMISSIONS)) {
      return true;
    }
  }

  const perms = Array.isArray(authContext.permissions)
    ? authContext.permissions
    : (Array.isArray(authContext.profile?.permissions) ? authContext.profile.permissions : null);
  if (perms) {
    if (perms.some(p => ORDER_HISTORY_SUPERVISOR_PERMISSIONS.includes(p))) {
      return true;
    }
  }

  if (authContext.permissions instanceof Set) {
    if (ORDER_HISTORY_SUPERVISOR_PERMISSIONS.some(p => authContext.permissions.has(p))) {
      return true;
    }
  }

  return false;
};

// Backward-compatible alias
export const canViewAllOrderHistory = isOrderHistoryAdmin;

/**
 * Resolves the authenticated user ID from various authContext shapes.
 */
export const getAuthUserId = (authContext) => {
  if (!authContext) return null;
  if (typeof authContext === 'string') return authContext.trim() || null;
  const raw =
    authContext.profile?.id ||
    authContext.user?.id ||
    authContext.userId ||
    authContext.id ||
    null;
  return raw ? String(raw).trim() : null;
};

/**
 * Applies RBAC scope to a Supabase withdrawal_orders query.
 * ADMIN / SUPER / SUPERVISOR / APPROVER: no filter (view all).
 * Regular users: .eq('requested_by', userId).
 */
export const applyWithdrawalOrdersScope = (query, authContext) => {
  if (!query || typeof query.eq !== 'function') return query;
  if (isOrderHistoryAdmin(authContext)) {
    return query;
  }
  const userId = getAuthUserId(authContext);
  if (!userId) {
    return query.eq('requested_by', '00000000-0000-0000-0000-000000000000');
  }
  return query.eq('requested_by', userId);
};

/**
 * Applies RBAC scope to a Supabase checkout_orders query.
 * ADMIN / SUPER / SUPERVISOR / APPROVER: no filter (view all).
 * Regular users: .or('borrower_id.eq.${userId},created_by.eq.${userId}').
 */
export const applyCheckoutOrdersScope = (query, authContext) => {
  if (!query || typeof query.or !== 'function') return query;
  if (isOrderHistoryAdmin(authContext)) {
    return query;
  }
  const userId = getAuthUserId(authContext);
  if (!userId) {
    return query.or('borrower_id.eq.00000000-0000-0000-0000-000000000000,created_by.eq.00000000-0000-0000-0000-000000000000');
  }
  return query.or(`borrower_id.eq.${userId},created_by.eq.${userId}`);
};

/**
 * Validates whether the given authContext can access a single withdrawal order
 * for viewing details or exporting/downloading PDF documents.
 */
export const canAccessWithdrawalRecord = (order, authContext) => {
  if (!order) return false;
  if (isOrderHistoryAdmin(authContext)) return true;

  const userId = getAuthUserId(authContext);
  if (!userId) return false;

  const rawRequester =
    order.requested_by ||
    order.requester_id ||
    (Array.isArray(order.profiles) ? order.profiles[0]?.id : order.profiles?.id) ||
    order.requested_by_id ||
    null;

  const orderRequesterId = (typeof rawRequester === 'object' && rawRequester !== null ? rawRequester.id : rawRequester);

  return isSameId(orderRequesterId, userId);
};

/**
 * Validates whether the given authContext can access a single checkout order
 * for viewing details or exporting/downloading PDF documents.
 */
export const canAccessCheckoutRecord = (order, authContext) => {
  if (!order) return false;
  if (isOrderHistoryAdmin(authContext)) return true;

  const userId = getAuthUserId(authContext);
  if (!userId) return false;

  const rawBorrower = order.borrower_id || order.borrower;
  const borrowerId = (typeof rawBorrower === 'object' && rawBorrower !== null ? rawBorrower.id : rawBorrower);

  const rawCreator = order.created_by || (Array.isArray(order.profiles) ? order.profiles[0] : order.profiles);
  const creatorId = (typeof rawCreator === 'object' && rawCreator !== null ? rawCreator.id : rawCreator);

  return isSameId(borrowerId, userId) || isSameId(creatorId, userId);
};

/**
 * Client-side safeguard to filter withdrawal orders array.
 */
export const filterWithdrawalOrders = (orders, authContext) => {
  if (!Array.isArray(orders)) return [];
  if (isOrderHistoryAdmin(authContext)) return orders;
  return orders.filter(order => canAccessWithdrawalRecord(order, authContext));
};

/**
 * Client-side safeguard to filter checkout orders array.
 */
export const filterCheckoutOrders = (orders, authContext) => {
  if (!Array.isArray(orders)) return [];
  if (isOrderHistoryAdmin(authContext)) return orders;
  return orders.filter(order => canAccessCheckoutRecord(order, authContext));
};
