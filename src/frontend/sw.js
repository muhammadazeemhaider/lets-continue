/* Service worker: receives Web Push messages (even when the app is closed) and opens the right book on tap.
 * Deliberately no offline caching, so there are never stale assets during development. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data && event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Toward the Light', {
      body: data.body || 'Your story is waiting.',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: data.tag || 'toward-the-light', // one notification per book; a newer reminder replaces the older
      data: { url: data.url || '/#/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/#/', self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => new URL(w.url).origin === target.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: 'navigate', hash: target.hash || '#/' }); // the app switches book without a reload
        return;
      }
      return self.clients.openWindow(target.href);
    })
  );
});
