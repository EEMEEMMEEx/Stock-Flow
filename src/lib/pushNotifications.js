import { supabase } from '@/lib/supabase';
import { resolveNotificationTarget } from '@/lib/notificationTargets';

const SW_READY_TIMEOUT_MS = 5000;
const DISPATCH_DEBOUNCE_MS = 1500;

let dispatchTimerId = null;
let latestDispatchToken = null;

/**
 * Convert a base64url-encoded VAPID public key into a Uint8Array
 * suitable for `PushManager.subscribe({ applicationServerKey })`.
 */
export function urlBase64ToUint8Array(base64String) {
  if (typeof base64String !== 'string' || base64String.trim() === '') {
    throw new Error('Missing VAPID public key');
  }

  const trimmed = base64String.trim();
  const padding = '='.repeat((4 - (trimmed.length % 4)) % 4);
  const base64 = (trimmed + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Inspect browser, security context, and iOS PWA install state for Web Push support.
 */
export function getPushSupportStatus() {
  const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';
  const isSecureContext = isBrowser ? Boolean(window.isSecureContext) : false;
  const hasServiceWorker = isBrowser && 'serviceWorker' in navigator;
  const hasPushManager = isBrowser && 'PushManager' in window;
  const hasNotification = isBrowser && 'Notification' in window;
  const userAgent = isBrowser ? (navigator.userAgent || '') : '';
  const isIos = /iPad|iPhone|iPod/.test(userAgent);
  const isStandalone = isBrowser && (
    Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches)
    || navigator.standalone === true
  );
  const isIosRequiresInstall = isIos && !isStandalone;
  const permission = hasNotification ? Notification.permission : 'unsupported';

  return {
    supported: isSecureContext && hasServiceWorker && hasPushManager && hasNotification,
    isSecureContext,
    hasServiceWorker,
    hasPushManager,
    hasNotification,
    isIos,
    isStandalone,
    isIosRequiresInstall,
    permission
  };
}

async function getReadyServiceWorkerRegistration(timeoutMs = SW_READY_TIMEOUT_MS) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  let timeoutId = null;
  try {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs);
      })
    ]);
    return registration || null;
  } catch {
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function resolveAccessToken(explicitToken) {
  if (explicitToken) return explicitToken;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

function getDeviceLabel() {
  if (typeof navigator === 'undefined') return 'Unknown Device';
  const ua = navigator.userAgent || '';

  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Device';

  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';

  const isStandalone = typeof window !== 'undefined' && (
    Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches)
    || navigator.standalone === true
  );

  return isStandalone ? `${os} PWA (${browser})` : `${os} ${browser}`;
}

function uint8ArraysEqual(left, right) {
  if (!left || !right || left.byteLength !== right.byteLength) return false;
  for (let i = 0; i < left.byteLength; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

/**
 * Retrieve the active PushSubscription for this browser/device if any.
 */
export async function getCurrentPushSubscription() {
  try {
    const registration = await getReadyServiceWorkerRegistration();
    if (!registration?.pushManager) return null;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function fetchVapidPublicKey(accessToken) {
  const headers = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch('/api/web-push?action=public-key', {
    method: 'GET',
    headers
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.publicKey) {
    throw new Error(payload?.message || payload?.error || 'Failed to fetch VAPID public key');
  }
  return payload.publicKey;
}

/**
 * Request Notification permission, subscribe via PushManager, and persist to DB/API.
 */
export async function subscribeUserToPush(accessToken) {
  const support = getPushSupportStatus();
  if (support.isIosRequiresInstall) {
    return { success: false, permission: support.permission, reason: 'ios-install-required' };
  }
  if (!support.supported) {
    return { success: false, permission: support.permission, reason: 'unsupported' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { success: false, permission };
  }

  const token = await resolveAccessToken(accessToken);
  const registration = await getReadyServiceWorkerRegistration();
  if (!registration?.pushManager) {
    return { success: false, permission, reason: 'sw-not-ready', error: 'Service worker is not ready' };
  }

  const publicKey = await fetchVapidPublicKey(token);
  const expectedKeyBytes = urlBase64ToUint8Array(publicKey);

  let subscription = await registration.pushManager.getSubscription();
  if (subscription?.options?.applicationServerKey) {
    const existingKeyBytes = new Uint8Array(subscription.options.applicationServerKey);
    if (!uint8ArraysEqual(existingKeyBytes, expectedKeyBytes)) {
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: expectedKeyBytes
    });
  }

  const subJson = subscription.toJSON();
  const endpoint = subscription.endpoint;
  const p256dh = subJson?.keys?.p256dh || '';
  const auth = subJson?.keys?.auth || '';
  const deviceLabel = getDeviceLabel();

  const [rpcResult, apiResult] = await Promise.allSettled([
    supabase.rpc('upsert_push_subscription', {
      p_endpoint: endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
      p_user_agent: navigator.userAgent || '',
      p_device_label: deviceLabel
    }),
    fetch('/api/web-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        action: 'subscribe',
        subscription: subJson,
        deviceLabel
      })
    }).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
      return body;
    })
  ]);

  const rpcOk = rpcResult.status === 'fulfilled' && !rpcResult.value?.error;
  const apiOk = apiResult.status === 'fulfilled';

  if (!rpcOk && !apiOk) {
    const rpcErrMsg = rpcResult.status === 'fulfilled'
      ? rpcResult.value?.error?.message
      : rpcResult.reason?.message;
    const apiErrMsg = apiResult.status === 'rejected' ? apiResult.reason?.message : null;
    return {
      success: false,
      permission,
      error: apiErrMsg || rpcErrMsg || 'Failed to persist push subscription'
    };
  }

  return { success: true, permission, subscription };
}

/**
 * Unsubscribe the active browser PushSubscription and remove it from DB/API.
 */
export async function unsubscribeUserFromPush(accessToken) {
  const token = await resolveAccessToken(accessToken);
  const subscription = await getCurrentPushSubscription();
  const endpoint = subscription?.endpoint || null;

  if (subscription) {
    await subscription.unsubscribe();
  }

  if (endpoint) {
    await Promise.allSettled([
      supabase.rpc('remove_push_subscription', { p_endpoint: endpoint }),
      fetch('/api/web-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ action: 'unsubscribe', endpoint })
      })
    ]);
  }

  return { success: true, endpoint };
}

/**
 * Display a local Service Worker notification when the browser is active and granted.
 */
export async function showLocalServiceWorkerNotification(notification) {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission !== 'granted') return false;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;

    const registration = await getReadyServiceWorkerRegistration(3000);
    if (!registration) return false;

    const notifId = notification?.id || Date.now();
    await registration.showNotification(notification?.title || 'Stock Flow', {
      body: notification?.message || '',
      badge: '/favicon.svg',
      tag: `stockflow-notif-${notifId}`,
      renotify: false,
      data: {
        url: resolveNotificationTarget(notification) || '/dashboard',
        id: notification?.id || null
      }
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Send a test Web Push via API, falling back to local Service Worker notification if needed.
 */
export async function sendTestPushNotification(accessToken, fallbackNotification = null) {
  const token = await resolveAccessToken(accessToken);
  let apiError = null;
  let totalSubscriptions = 0;

  try {
    const response = await fetch('/api/web-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ action: 'test' })
    });
    const data = await response.json().catch(() => ({}));
    totalSubscriptions = Number(data?.totalSubscriptions || 0);

    if (response.ok && Number(data?.sentCount || 0) > 0) {
      return {
        success: true,
        mode: 'web-push',
        sentCount: Number(data.sentCount),
        totalSubscriptions
      };
    }

    if (!response.ok) {
      apiError = data?.message || data?.error || `HTTP ${response.status}`;
    }
  } catch (err) {
    apiError = err?.message || 'Push API unavailable';
  }

  const localShown = await showLocalServiceWorkerNotification({
    id: `test-${Date.now()}`,
    title: fallbackNotification?.title || 'Stock Flow',
    message: fallbackNotification?.message || 'Test push notification on this device.',
    target_path: '/dashboard'
  });

  if (localShown) {
    return {
      success: true,
      mode: 'local-sw',
      sentCount: 0,
      totalSubscriptions,
      apiError
    };
  }

  return {
    success: false,
    mode: 'none',
    sentCount: 0,
    totalSubscriptions,
    error: apiError || 'Notification permission is not granted or Service Worker is unavailable'
  };
}

/**
 * Trigger background Web Push dispatch for pending notifications (debounced, non-blocking).
 */
export function triggerPendingWebPushDispatch(accessToken) {
  if (accessToken) {
    latestDispatchToken = accessToken;
  }

  if (dispatchTimerId) {
    clearTimeout(dispatchTimerId);
  }

  dispatchTimerId = setTimeout(async () => {
    dispatchTimerId = null;
    try {
      const token = await resolveAccessToken(latestDispatchToken);
      if (!token) return;

      await fetch('/api/web-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'dispatch-pending' })
      });
    } catch {
      // Background dispatch must never disrupt foreground UX.
    }
  }, DISPATCH_DEBOUNCE_MS);
}

/**
 * Sync the PWA app icon unread badge count when supported by the host OS/browser.
 */
export function syncAppBadge(unreadCount) {
  try {
    if (typeof navigator === 'undefined') return;
    const count = Number(unreadCount) || 0;
    if (count > 0 && typeof navigator.setAppBadge === 'function') {
      Promise.resolve(navigator.setAppBadge(count)).catch(() => {});
    } else if (count <= 0 && typeof navigator.clearAppBadge === 'function') {
      Promise.resolve(navigator.clearAppBadge()).catch(() => {});
    }
  } catch {
    // Ignore Badging API errors on unsupported platforms.
  }
}
