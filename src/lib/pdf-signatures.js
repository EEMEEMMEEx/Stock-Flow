// Shared field resolvers for the PDF document templates.
// Kept as plain JS (no JSX) so they can be verified with `npm run verify:pdf`.

const firstOf = (value) => (Array.isArray(value) ? value[0] : value) || null;

/**
 * Requester (ผู้ขอเบิก) of a withdrawal order.
 * Tolerates PostgREST returning the embedded profile as an object, an array or null.
 */
export function resolveWithdrawalRequester(order, profile = null) {
  const requester = firstOf(order?.profiles) || firstOf(order?.requester);

  return {
    name: requester?.full_name || order?.requester_name || '...................................................',
    signatureUrl: requester?.signature_url
      || order?.requester_signature_url
      || (order?.requested_by && order.requested_by === profile?.id ? profile?.signature_url : null)
      || null,
  };
}

/**
 * Borrower (ผู้ขอยืม) of a checkout order.
 * `order.borrower` is enriched by Checkouts.jsx from profiles.signature_url of borrower_id.
 */
export function resolveCheckoutBorrower(order) {
  const borrower = firstOf(order?.borrower) || firstOf(order?.borrower_profile);

  return {
    name: order?.borrower_name || borrower?.full_name || '...................................................',
    signatureUrl: order?.borrower_signature_url
      || order?.signature_url
      || borrower?.signature_url
      || null,
  };
}

/**
 * Document number shown in the meta section.
 * withdrawal_orders has no order_number column: work_order_no is the document number.
 */
export function resolveDocumentNumber(order, mode = 'withdrawal') {
  if (mode === 'checkout') return order?.order_number || '—';
  return order?.work_order_no || (order?.id ? `#${order.id.slice(0, 8)}` : '—');
}
