// AuthorScrolls Service Worker — Push Notification Handler
'use strict';

const CACHE_NAME = 'authorscrolls-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

// Handle push events
self.addEventListener('push', e => {
  let data = { title: 'AuthorScrolls', body: 'Your manuscript is waiting.', manuscriptId: null };
  if (e.data) {
    try { data = { ...data, ...e.data.json() }; } catch (_) {}
  }

  const opts = {
    body: data.body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'authorscrolls-reengage',
    renotify: false,
    requireInteraction: false,
    data: { manuscriptId: data.manuscriptId, url: data.url || '/app.html' }
  };

  e.waitUntil(self.registration.showNotification(data.title, opts));
});

// Handle notification click — open/focus the app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/app.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if (c.url.includes('/app.html')) { c.focus(); return; }
      }
      return self.clients.openWindow(target);
    })
  );
});
