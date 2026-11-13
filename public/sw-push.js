/* global clients */

/**
 * Stock Flow Web Push Service Worker extension.
 * Loaded by Workbox-generated sw.js via workbox.importScripts.
 */

function parsePushPayload(event) {
  if (!event.data) {
    return { title: 'Stock Flow', body: '' };
  }

  try {
    const parsed = event.data.json();
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // Fall back to plain text payload when push message is not JSON
  }

  try {
    return { title: 'Stock Flow', body: event.data.text() || '' };
  } catch {
    return { title: 'Stock Flow', body: '' };
  }
}

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  const {
    id = null,
    title,
    body,
    message,
    icon,
    badge,
    tag,
    url,
    event_type = null,
    reference_id = null,
    unreadCount,
  } = payload;

  const notificationTitle = title || 'Stock Flow';
  const notificationOptions = {
    body: body || message || '',
    icon: icon || '/images/logo.png',
    badge: badge || '/favicon.svg',
    tag: tag || (id ? `stockflow-notif-${id}` : 'stockflow-push'),
    renotify: false,
    vibrate: [150, 75, 150],
    data: {
      url: url || '/dashboard',
      id: id || null,
      event_type: event_type || null,
      reference_id: reference_id || null,
    },
  };

  const tasks = [
    self.registration.showNotification(notificationTitle, notificationOptions),
  ];

  if (typeof unreadCount === 'number' && self.navigator?.setAppBadge) {
    try {
      const badgePromise =
        unreadCount > 0
          ? self.navigator.setAppBadge(unreadCount)
          : self.navigator.clearAppBadge?.();
      if (badgePromise && typeof badgePromise.catch === 'function') {
        tasks.push(badgePromise.catch(() => {}));
      }
    } catch {
      // Ignore badge API errors on unsupported platforms
    }
  }

  event.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification?.data || {};
  const targetUrl = data.url || '/dashboard';
  const resolvedUrl = new URL(targetUrl, self.location.origin);
  const relativeTarget = resolvedUrl.pathname + resolvedUrl.search + resolvedUrl.hash;

  event.waitUntil(
    (async () => {
      const windowClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      const matchingClient = windowClients.find((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });

      if (matchingClient) {
        if ('focus' in matchingClient) {
          await matchingClient.focus();
        }
        matchingClient.postMessage({
          type: 'STOCKFLOW_NOTIFICATION_CLICK',
          url: relativeTarget,
          notificationId: data.id || null,
        });

        const currentPath = new URL(matchingClient.url).pathname;
        const needsHardNavigate =
          currentPath === '/' || currentPath === '/login' || currentPath === '/landing';
        if (
          needsHardNavigate &&
          'navigate' in matchingClient &&
          matchingClient.url !== resolvedUrl.href
        ) {
          await matchingClient.navigate(resolvedUrl.href);
        }
        return;
      }

      if (clients.openWindow) {
        await clients.openWindow(resolvedUrl.href);
      }
    })()
  );
});
