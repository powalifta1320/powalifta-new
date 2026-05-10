// POWALIFTA service worker — minimal.
// Required so the site qualifies as installable. We don't aggressively cache anything
// (would interfere with deploys); instead we use a "network-first" pattern that just
// passes through. The presence of an active service worker + manifest is enough for
// browsers to surface the "Install app" prompt on Android/desktop Chrome.

const CACHE = 'powa-v1';

self.addEventListener('install', event => {
  // Activate immediately on first install — no precaching of stale assets
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Take control of all open clients on first activation
  event.waitUntil(clients.claim());
  // Clean up any old caches from prior versions
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
});

// Pure network passthrough. We don't cache anything because Vercel's CDN already does
// that and offline support would risk serving stale code after a deploy.
self.addEventListener('fetch', event => {
  // Let the browser handle it normally
  return;
});
