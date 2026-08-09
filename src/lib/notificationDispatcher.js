import { supabase } from './supabase';

const PDF_SERVICE_URL = import.meta.env.VITE_PDF_SERVICE_URL || 'http://localhost:3001';
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

  const response = await fetch(`${PDF_SERVICE_URL}/api/notifications/withdrawal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ eventType, orderId, approverName, rejectionReason })
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.success) {
    const error = new Error(result.error || 'ไม่สามารถส่งการแจ้งเตือนคำขอเบิกได้');
    error.code = result.code || 'NOTIFICATION_DELIVERY_FAILED';
    if (import.meta.env.DEV) {
      console.warn('[NotificationDispatcher] Dispatch failed:', { eventType, code: error.code });
    }
    throw error;
  }

  dispatchedEventsCache.add(cacheKey);
  return result;
};
