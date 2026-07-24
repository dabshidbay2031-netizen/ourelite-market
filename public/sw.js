/* Hamar Mall service worker — Web Push + offline app shell.  (v2)
 *
 * OFFLINE: caches the app shell and its static bundles so the app OPENS and the
 * POS works with no connection — the cashier sees already-downloaded products,
 * rings up sales, and prints receipts; the sales are queued (lib/offlineQueue)
 * and uploaded by <SyncManager> when the connection returns.
 *
 * The caching fetch handler runs in PRODUCTION ONLY. In dev (localhost) it is
 * disabled so it can't fight Next.js / Turbopack HMR — the original reason this
 * worker avoided caching. API + Supabase requests are always network-only; the
 * app keeps its own localStorage data cache for offline reads.
 */

const CACHE = 'hamarmall-shell-v2';
const PRECACHE = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];
const OFFLINE_URL = '/';

const host = self.location.hostname;
const CACHING_ENABLED = host !== 'localhost' && host !== '127.0.0.1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  if (!CACHING_ENABLED) return;
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Best-effort: don't fail the install if one asset 404s.
      Promise.allSettled(PRECACHE.map((u) => cache.add(u)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop old shell caches from previous versions.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('hamarmall-shell-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* ── Offline caching ───────────────────────────────────────────── */
function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/')
    || url.pathname.startsWith('/icons/')
    || /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  if (!CACHING_ENABLED) return;                // dev: let the network handle everything
  const req = event.request;
  if (req.method !== 'GET') return;            // never cache POST/PATCH/DELETE (orders, auth…)

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase, maps, images on other hosts
  if (url.pathname.startsWith('/api/')) return;       // dynamic data — always network

  // Navigations (opening the app / a route): network-first, fall back to the
  // cached shell so the SPA still boots offline (hash routing does the rest).
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(OFFLINE_URL, fresh.clone());   // keep the shell fresh
        return fresh;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match(OFFLINE_URL)) || (await cache.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Immutable static bundles/assets: cache-first (this is what lets the app
  // actually RUN offline after one online visit).
  if (isStaticAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return hit || Response.error();
      }
    })());
  }
});

/* ── Web Push (unchanged) ──────────────────────────────────────── */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* non-JSON push */ }

  const title = data.title || 'Hamar Mall';
  const options = {
    body:  data.body || '',
    icon:  data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag:   data.tag || undefined,
    data:  { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
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
