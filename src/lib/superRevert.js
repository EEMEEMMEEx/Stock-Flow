import { isSchemaMismatchError } from './rpcErrors.js';

// Reverse transitions exposed by migration 83.
export const REVERT_KINDS = {
  WITHDRAWAL_COMPLETION: 'withdrawal_completion',
  WITHDRAWAL_APPROVAL: 'withdrawal_approval',
  WITHDRAWAL_REJECTION: 'withdrawal_rejection',
  CHECKOUT_APPROVAL: 'checkout_approval',
  CHECKOUT_RETURN: 'checkout_return',
  CHECKOUT_RETURNS: 'checkout_returns',
  CHECKOUT_REJECTION: 'checkout_rejection',
  CHECKOUT_REPAIR: 'checkout_repair',
  CAIM_STOCK_IN: 'caim_stock_in',
};

export const REVERT_AUDIT_ACTION_TYPES = [
  'WITHDRAWAL_COMPLETE_REVERT',
  'WITHDRAWAL_APPROVAL_REVERT',
  'WITHDRAWAL_REJECT_REVERT',
  'CHECKOUT_APPROVAL_REVERT',
  'CHECKOUT_RETURN_REVERT',
  'CHECKOUT_REJECT_REVERT',
  'CHECKOUT_REPAIR_REVERT',
  'CAIM_STOCK_IN_REVERT',
];

export const REVERT_ACTION_LABEL_KEYS = {
  WITHDRAWAL_COMPLETE_REVERT: 'superRevert.actionWithdrawalCompletion',
  WITHDRAWAL_APPROVAL_REVERT: 'superRevert.actionWithdrawalApproval',
  WITHDRAWAL_REJECT_REVERT: 'superRevert.actionWithdrawalRejection',
  CHECKOUT_APPROVAL_REVERT: 'superRevert.actionCheckoutApproval',
  CHECKOUT_RETURN_REVERT: 'superRevert.actionCheckoutReturn',
  CHECKOUT_REJECT_REVERT: 'superRevert.actionCheckoutRejection',
  CHECKOUT_REPAIR_REVERT: 'superRevert.actionCheckoutRepair',
  CAIM_STOCK_IN_REVERT: 'superRevert.actionCaimStockIn',
};

const REVERT_RPC_BY_KIND = {
  [REVERT_KINDS.WITHDRAWAL_COMPLETION]: 'super_revert_withdrawal_action',
  [REVERT_KINDS.WITHDRAWAL_APPROVAL]: 'super_revert_withdrawal_action',
  [REVERT_KINDS.WITHDRAWAL_REJECTION]: 'super_revert_withdrawal_action',
  [REVERT_KINDS.CHECKOUT_APPROVAL]: 'super_revert_checkout_approval',
  [REVERT_KINDS.CHECKOUT_RETURN]: 'super_revert_checkout_return',
  [REVERT_KINDS.CHECKOUT_RETURNS]: 'super_revert_checkout_order_returns',
  [REVERT_KINDS.CHECKOUT_REJECTION]: 'super_revert_checkout_rejection',
  [REVERT_KINDS.CHECKOUT_REPAIR]: 'super_revert_damaged_repair',
  [REVERT_KINDS.CAIM_STOCK_IN]: 'super_revert_caim_stock_in',
};

const TARGET_ACTION_BY_KIND = {
  [REVERT_KINDS.WITHDRAWAL_COMPLETION]: 'revert_completion',
  [REVERT_KINDS.WITHDRAWAL_APPROVAL]: 'revert_approval',
  [REVERT_KINDS.WITHDRAWAL_REJECTION]: 'revert_rejection',
};

export const resolveRevertRequest = (kind, { order = null, returnLog = null } = {}) => {
  const rpc = REVERT_RPC_BY_KIND[kind];
  if (!rpc) return null;

  if (kind === REVERT_KINDS.CHECKOUT_RETURN) {
    if (!returnLog?.id) return null;
    return {
      rpc,
      params: { p_return_log_id: returnLog.id, p_reason: null },
      fromStatus: order?.status || 'completed',
      toStatus: remainingStatusAfterReturnRevert(order, returnLog),
      auditAction: 'CHECKOUT_RETURN_REVERT',
    };
  }

  if (kind === REVERT_KINDS.CHECKOUT_RETURNS) {
    if (!order?.id) return null;
    return {
      rpc,
      params: { p_order_id: order.id, p_reason: null },
      fromStatus: order.status,
      toStatus: 'active',
      auditAction: 'CHECKOUT_RETURN_REVERT',
    };
  }

  if (kind === REVERT_KINDS.CHECKOUT_REJECTION) {
    if (!order?.id) return null;
    return {
      rpc,
      params: { p_order_id: order.id, p_reason: null },
      fromStatus: order.status,
      toStatus: 'pending',
      auditAction: 'CHECKOUT_REJECT_REVERT',
    };
  }

  if (kind === REVERT_KINDS.CHECKOUT_REPAIR) {
    if (!returnLog?.id) return null;
    return {
      rpc,
      params: { p_return_log_id: returnLog.id, p_reason: null },
      fromStatus: returnLog.repair_resolution_status || 'resolved',
      toStatus: 'unresolved',
      auditAction: 'CHECKOUT_REPAIR_REVERT',
    };
  }

  if (kind === REVERT_KINDS.CAIM_STOCK_IN) {
    if (!returnLog?.id) return null;
    return {
      rpc,
      params: { p_return_log_id: returnLog.id, p_reason: null },
      fromStatus: returnLog.repair_resolution_status || 'restored_to_stock',
      toStatus: 'unresolved',
      auditAction: 'CAIM_STOCK_IN_REVERT',
    };
  }

  if (!order?.id) return null;

  if (kind === REVERT_KINDS.CHECKOUT_APPROVAL) {
    return {
      rpc,
      params: { p_order_id: order.id, p_reason: null },
      fromStatus: order.status,
      toStatus: 'pending',
      auditAction: 'CHECKOUT_APPROVAL_REVERT',
    };
  }

  return {
    rpc,
    params: {
      p_order_id: order.id,
      p_target_action: TARGET_ACTION_BY_KIND[kind],
      p_reason: null,
    },
    fromStatus: order.status,
    toStatus: kind === REVERT_KINDS.WITHDRAWAL_COMPLETION ? 'approved' : 'pending',
    auditAction: {
      [REVERT_KINDS.WITHDRAWAL_COMPLETION]: 'WITHDRAWAL_COMPLETE_REVERT',
      [REVERT_KINDS.WITHDRAWAL_APPROVAL]: 'WITHDRAWAL_APPROVAL_REVERT',
      [REVERT_KINDS.WITHDRAWAL_REJECTION]: 'WITHDRAWAL_REJECT_REVERT',
    }[kind],
  };
};

export const remainingStatusAfterReturnRevert = (order, returnLog) => {
  const qty = Number(returnLog?.returned_quantity || 0);
  const accounted = (order?.checkout_items || []).reduce(
    (sum, item) => sum + Number(item.quantity_returned || 0) + Number(item.quantity_damaged || 0)
      + Number(item.quantity_lost || 0) + Number(item.quantity_consumed || 0),
    0
  );
  return accounted - qty > 0 ? 'partial_returned' : 'active';
};

export const summarizeRevertStockImpact = (kind, { order = null, returnLog = null } = {}) => {
  if (kind === REVERT_KINDS.WITHDRAWAL_APPROVAL) {
    const items = order?.withdrawal_items || [];
    const qty = items.reduce((sum, item) => sum + Number(item.deducted_quantity || 0), 0);
    const lines = items.filter((item) => Number(item.deducted_quantity || 0) > 0).length;
    return qty > 0 ? { type: 'restore_withdrawal', qty, lines } : { type: 'none' };
  }

  if (kind === REVERT_KINDS.CHECKOUT_APPROVAL) {
    const items = order?.checkout_items || [];
    const qty = items.reduce((sum, item) => sum + Number(item.quantity_borrowed || 0), 0);
    const unit = items[0]?.items?.unit || '';
    return qty > 0 ? { type: 'restore_checkout', qty, unit } : { type: 'none' };
  }

  if (kind === REVERT_KINDS.CHECKOUT_RETURNS) {
    const items = order?.checkout_items || [];
    const qty = items.reduce((sum, item) => sum + Number(item.quantity_returned || 0), 0);
    const unit = items[0]?.items?.unit || '';
    return qty > 0 ? { type: 'deduct_returns_all', qty, unit } : { type: 'none' };
  }

  // Rejection and repair reverts only move statuses / ledger offsets: the modal
  // description carries the exact wording, so no quantity is shown here.
  if (kind === REVERT_KINDS.CHECKOUT_REJECTION || kind === REVERT_KINDS.CHECKOUT_REPAIR) {
    return { type: 'none' };
  }

  if (kind === REVERT_KINDS.CHECKOUT_RETURN && returnLog?.item_condition === 'normal') {
    return {
      type: 'deduct_return',
      qty: Number(returnLog.returned_quantity || 0),
      unit: returnLog?.checkout_items?.items?.unit || order?.checkout_items?.[0]?.items?.unit || '',
    };
  }

  if (kind === REVERT_KINDS.CAIM_STOCK_IN) {
    const unit = returnLog?.checkout_items?.items?.unit || order?.checkout_items?.[0]?.items?.unit || '';
    return {
      type: 'deduct_caim_stock_in',
      qty: 1,
      unit,
    };
  }

  return { type: 'none' };
};

export const parseRevertErrorKey = (error) => {
  if (!error) return null;
  const message = String(error.message || '');
  const code = String(error.code || '');

  if (isSchemaMismatchError(error)) return 'superRevert.errSchema';
  if (code === '28000') return 'superRevert.errUnauthorized';
  if (code === '42501') return 'superRevert.errForbidden';
  if (code === '22023' || /reason is required/i.test(message)) return 'superRevert.errReasonRequired';
  if (/LEGACY_STOCK_UNKNOWN/.test(message)) return 'superRevert.errLegacyStock';
  if (/EQUIPMENT_ALREADY_RELOANED/.test(message)) return 'superRevert.errEquipmentReloaned';
  if (/INSUFFICIENT_STOCK/.test(message)) return 'superRevert.errInsufficientStock';
  if (/CASCADE_BLOCKED/.test(message)) return 'superRevert.errCascadeBlocked';
  if (/INVALID_STATE/.test(message)) return 'superRevert.errInvalidState';
  if (/NOT_FOUND/.test(message) || code === 'P0002') return 'superRevert.errNotFound';
  return null;
};

export const formatRevertDate = (value, lang = 'th') => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  try {
    return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
};
