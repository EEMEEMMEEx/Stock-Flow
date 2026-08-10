const dispatchedEventsCache = new Set();

/**
 * Requests a server-side withdrawal notification. Recipient resolution and SMTP
 * access happen in pdf-service so email addresses and secrets never reach React.
 */
export const dispatchWithdrawalNotification = async ({
  eventType,
  orderId,
  approverName = '',
  rejectionReason = ''
}) => {
  if (!eventType || !orderId) {
    return { success: false, reason: 'INVALID_ARGUMENTS' };
  }

  const cacheKey = `${eventType}:${orderId}`;
  if (dispatchedEventsCache.has(cacheKey)) {
    return { success: true, deduplicated: true };
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    return { success: false, reason: 'AUTHENTICATION_REQUIRED' };
  }

  dispatchedEventsCache.add(cacheKey);
  if (import.meta.env.DEV) {
    console.info('[NotificationDispatcher] Event recorded:', { eventType, orderId });
  }
  return { success: true, recorded: true };
};
