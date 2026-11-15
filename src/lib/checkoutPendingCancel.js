import { isSameId } from './orderHistoryAuth.js';

const resolveOwnerId = (raw) => (
  typeof raw === 'object' && raw !== null ? raw.id : raw
);

/**
 * Checks whether the current user owns a checkout requisition via `created_by`
 * or `borrower_id`, matching the `cancel_pending_checkout_order` RPC rule.
 */
export const isCheckoutRequestOwner = (order, currentUserId) => {
  if (!order || !String(currentUserId ?? '').trim()) {
    return false;
  }

  return (
    isSameId(resolveOwnerId(order.created_by), currentUserId) ||
    isSameId(resolveOwnerId(order.borrower_id), currentUserId)
  );
};

/**
 * Returns true only when a checkout requisition is still `pending`
 * and owned by `currentUserId`.
 */
export const canRequesterCancelPendingOrder = (order, currentUserId) => {
  return Boolean(
    order &&
    order.status === 'pending' &&
    isCheckoutRequestOwner(order, currentUserId)
  );
};
