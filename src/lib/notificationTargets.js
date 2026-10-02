// Deep-link target for a bell notification click.
// Kept as plain JS (no JSX) so it can be verified with `npm run verify:notifications`.

// Database producers store these modules without a query string, so the event
// type decides which tab must open.
const BARE_MODULE_PATHS = new Set(['/checkouts', '/withdrawals']);

const withReferenceId = (path, referenceId) =>
  (referenceId ? `${path}&id=${encodeURIComponent(referenceId)}` : path);

export function resolveNotificationTarget(notification) {
  const target = notification?.target_path;
  if (target && !BARE_MODULE_PATHS.has(target)) return target;

  const event = notification?.event_type || '';
  const referenceId = notification?.reference_id || notification?.metadata?.request_no || null;

  if (event.includes('checkout')) {
    if (event.includes('submitted')) return withReferenceId('/checkouts?tab=pending', referenceId);
    if (event.includes('rejected')) return withReferenceId('/checkouts?tab=history', referenceId);
    if (event.includes('completed')) return withReferenceId('/checkouts?tab=history', referenceId);
    if (event.includes('approved') || event.includes('overdue')) return withReferenceId('/checkouts?tab=active', referenceId);
    return '/checkouts?tab=pending';
  }

  if (event.includes('withdrawal')) {
    return withReferenceId('/withdrawals?tab=orders', referenceId);
  }

  // Unknown event without an explicit target: keep the previous behaviour of not navigating.
  return target || null;
}
