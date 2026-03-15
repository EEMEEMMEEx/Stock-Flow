/* eslint-disable no-unused-vars */
/* eslint-env serviceworker */
/* global clients caches fetch Request Response */

// Service Worker for FORTH StockFlow PWA
const CACHE_VERSION = 'v2';
const STATIC_CACHE = `stockflow-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `stockflow-dynamic-${CACHE_VERSION}`;
const OFFLINE_QUEUE_KEY = 'stockflow-offline-queue';

// Assets to pre-cache for offline mode
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/forth-stockflow-logo.png',
    '/scan',
    '/cart'
];

// Install event - pre-cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker...');

    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] Pre-caching static assets');
                return cache.addAll(PRECACHE_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch(err => {
                console.log('[SW] Pre-cache failed:', err);
                return self.skipWaiting();
            })
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker...');

    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name.startsWith('stockflow-') &&
                            name !== STATIC_CACHE &&
                            name !== DYNAMIC_CACHE)
                        .map(name => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => clients.claim())
    );
});

// Fetch event - network first with cache fallback
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip external requests
    if (!url.origin.includes(self.location.origin)) return;

    // Skip Supabase API requests (always need fresh data)
    if (url.hostname.includes('supabase')) return;

    // For navigation requests (HTML pages)
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    // Cache the page for offline
                    const responseClone = response.clone();
                    caches.open(DYNAMIC_CACHE)
                        .then(cache => cache.put(request, responseClone));
                    return response;
                })
                .catch(() => {
                    // Return cached page or offline page
                    return caches.match(request)
                        .then(cached => cached || caches.match('/'));
                })
        );
        return;
    }

    // For static assets (JS, CSS, images)
    if (request.destination === 'script' ||
        request.destination === 'style' ||
        request.destination === 'image' ||
        request.destination === 'font') {
        event.respondWith(
            caches.match(request)
                .then(cached => {
                    if (cached) return cached;

                    return fetch(request)
                        .then(response => {
                            const responseClone = response.clone();
                            caches.open(DYNAMIC_CACHE)
                                .then(cache => cache.put(request, responseClone));
                            return response;
                        });
                })
        );
        return;
    }
});

// Push notification handler
self.addEventListener('push', (event) => {
    console.log('[SW] Push received');

    let data = {
        title: 'StockFlow',
        body: 'มีการแจ้งเตือนใหม่',
        icon: '/forth-stockflow-logo.png',
        badge: '/forth-stockflow-logo.png'
    };

    if (event.data) {
        try {
            data = { ...data, ...event.data.json() };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/forth-stockflow-logo.png',
        badge: data.badge || '/forth-stockflow-logo.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/',
            dateOfArrival: Date.now()
        },
        actions: [
            { action: 'view', title: 'ดูรายละเอียด' },
            { action: 'close', title: 'ปิด' }
        ],
        tag: data.tag || 'stockflow-notification',
        renotify: true
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');

    event.notification.close();

    if (event.action === 'close') return;

    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.navigate(urlToOpen);
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Message handler for showing notifications from main app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const { title, body, options } = event.data;

        self.registration.showNotification(title, {
            body,
            icon: '/forth-stockflow-logo.png',
            badge: '/forth-stockflow-logo.png',
            vibrate: [200, 100, 200],
            tag: 'stockflow-notification',
            ...options
        });
    }

    // Handle offline scan queue
    if (event.data && event.data.type === 'QUEUE_OFFLINE_SCAN') {
        // Store scan data for later sync
        console.log('[SW] Queuing offline scan:', event.data.scanData);
    }

    // Skip waiting message
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Background sync for offline scans
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-offline-scans') {
        console.log('[SW] Syncing offline scans...');
        // Could process queued scans here when back online
    }

    if (event.tag === 'sync-notifications') {
        console.log('[SW] Syncing notifications...');
    }
});
