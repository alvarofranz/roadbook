/* RDBK.app service worker.
   - Shell (html/css/js): NETWORK-FIRST → every deploy arrives fresh; the cache
     is only an offline fallback.
   - FontAwesome (fonts/CSS, immutable): CACHE-FIRST, versioned by CACHE.
   Bump the CACHE number only when the vendored fonts/CSS change. */
const CACHE = 'roadbook-v2';

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});
self.addEventListener('fetch', (e) => {
    const { request } = e;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    // Dynamic endpoints (auth/account, uploads, version) — always network, never cache.
    if (url.pathname.includes('/api/') || url.pathname.endsWith('/version.json')) { e.respondWith(fetch(request)); return; }

    // Immutable: FontAwesome (CSS + webfonts) → cache-first.
    if (url.pathname.includes('/fontawesome/')) {
        e.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
        })));
        return;
    }

    // Shell → network-first, with the cache as offline fallback.
    e.respondWith(
        fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
        }).catch(() => caches.match(request))
    );
});
