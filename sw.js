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

const CACHE = 'powa-v3';

// The app shell: enough to boot the dashboards offline. User DATA is never precached
// (it comes from Supabase, cross-origin, and is left to pass straight through).
const PRECACHE = [
  '/',
  '/index.html',
  '/athlete.html',
  '/coach.html',
  '/desk.js',
  '/desk-season.js',  // the desk's season: Teams, the roster calendar, Plan a meet       // the coach's laptop desk (coach.html, html.desk only)
  '/desk.css',
  '/meetday.js',    // the attempt planner + meet-day board (works offline at the venue)
  '/meetday.css',
  '/app.js',
  '/voice.js',
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
//
// One bar of signal (a gym basement) is the case that matters: a request that neither
// succeeds nor fails would hang the app on a blank page. So a PAGE with a cached copy
// gives the network SLOW_NETWORK_MS, then the copy is served while the fetch carries on
// and refreshes the cache for next time. Scripts and styles always wait for the network
// (or fail over to the cache when it errors), so a page never runs with a stale app.js.
// With nothing cached we wait for the network however long it takes.
const SLOW_NETWORK_MS = 1500;

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(networkFirst(event));
});

async function networkFirst(event) {
  const req = event.request;
  const cached = await caches.match(req).catch(() => undefined);
  let stored = Promise.resolve();
  const net = fetch(req).then(fresh => {
    // Mirror good, cacheable responses. Opaque/error responses are left alone.
    if (fresh && fresh.ok && fresh.type === 'basic') {
      const copy = fresh.clone();
      stored = caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
    }
    return fresh;
  });
  // Keep the worker alive until the fetch AND the cache write settle, even after we've
  // answered from the cache.
  event.waitUntil(net.then(() => stored, () => {}));

  if (cached && req.mode === 'navigate') {
    const slow = new Promise(resolve => setTimeout(() => resolve(null), SLOW_NETWORK_MS));
    try {
      const fresh = await Promise.race([net, slow]);
      if (fresh) return fresh;
    } catch (err) { /* offline: the copy below */ }
    return cached;
  }

  try {
    return await net;
  } catch (err) {
    if (cached) return cached;
    // Offline with nothing cached: for navigations, fall back to the app shell.
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
}

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
  // Same-origin paths only, whatever the payload said (a linked coach writes the url).
  let target = '/athlete.html';
  try {
    const u = new URL((event.notification.data && event.notification.data.url) || target, self.location.origin);
    // "/..//evil.com" is same-origin but its path is "//evil.com", which a window would open
    // protocol-relative: never a path that starts with two slashes.
    if (u.origin === self.location.origin && !u.pathname.startsWith('//')) target = u.pathname + u.search;
  } catch (_) { /* keep the default */ }

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
