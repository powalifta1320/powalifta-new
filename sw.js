// POWALIFTA service worker.
//
// Two jobs:
//   1. Offline resilience — a NETWORK-FIRST cache. Online always wins (so a fresh
//      deploy is picked up immediately, never stale), but every successful same-origin
//      GET is mirrored into the cache so the app still opens with no connection.
//   2. Web Push — receives pushes from the `send-push` edge function and opens the
//      right page when the user taps the notification.
//
// Why network-first and not cache-first: the old worker was a pure passthrough
// specifically to avoid serving stale code after a deploy. Network-first preserves
// that guarantee — the cache is only ever read when the network actually fails.

const CACHE = 'powa-v2';

// The app shell: enough to boot the dashboards offline. User DATA is never precached
// (it comes from Supabase, cross-origin, and is left to pass straight through).
const PRECACHE = [
  '/',
  '/index.html',
  '/athlete.html',
  '/coach.html',
  '/app.js',
  '/db.js',
  '/styles.css',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', event => {
  self.skipWaiting();
  // Best-effort precache: one missing file must not abort the whole install.
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(PRECACHE.map(url => cache.add(url)))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await clients.claim();
    // Drop caches from prior versions so an old shell can't linger.
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
  })());
});

// Network-first for same-origin GETs; cross-origin (Supabase, Plausible, fonts)
// passes straight through and is never cached.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      // Mirror good, cacheable responses. Opaque/error responses are left alone.
      if (fresh && fresh.ok && fresh.type === 'basic') {
        const copy = fresh.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
      }
      return fresh;
    } catch (err) {
      // Offline: serve the cached copy if we have one.
      const cached = await caches.match(req);
      if (cached) return cached;
      // For navigations with no cached match, fall back to the app shell.
      if (req.mode === 'navigate') {
        const shell = await caches.match('/index.html') || await caches.match('/');
        if (shell) return shell;
      }
      return new Response('You are offline.', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  })());
});

// ---- Web Push ----------------------------------------------------------------

// A push arrives as JSON: { title, body, url, tag }. We render a notification and
// stash the target URL so the click handler knows where to go.
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) { payload = {}; }

  const title = payload.title || 'POWALIFTA';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'powa',
    renotify: true,
    vibrate: [120, 60, 120],
    data: { url: payload.url || '/athlete.html' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping the notification focuses an existing tab on that URL, or opens a new one.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/athlete.html';

  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      // Already have the app open somewhere — focus it.
      if ('focus' in client) {
        try {
          const u = new URL(client.url);
          if (u.pathname === target || u.pathname + u.search === target) {
            return client.focus();
          }
        } catch (_) { /* ignore */ }
      }
    }
    // Otherwise focus any open window and navigate it, or open fresh.
    if (all.length && 'navigate' in all[0]) {
      try { await all[0].navigate(target); return all[0].focus(); } catch (_) { /* fall through */ }
    }
    if (clients.openWindow) return clients.openWindow(target);
  })());
});
