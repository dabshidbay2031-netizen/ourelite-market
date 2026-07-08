/* Mogarenta service worker — Web Push only.
 *
 * Deliberately NOT a caching/offline worker: the app already has its own
 * localStorage stale-while-revalidate layer (AppContext), and a fetch-
 * intercepting SW would fight Next.js dev/HMR. This worker exists so the
 * browser can receive push messages when the site is closed and route
 * notification clicks back into the right hash route.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* non-JSON push */ }

  const title = data.title || 'Mogarenta';
  const options = {
    body:  data.body || '',
    icon:  data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag:   data.tag || undefined,       // same tag replaces instead of stacking
    data:  { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      // Focus an existing tab and deep-link it (hash routing = just set the hash)
      for (const tab of tabs) {
        if ('focus' in tab) {
          tab.focus();
          if ('navigate' in tab && url !== '/') return tab.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
