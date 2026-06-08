/* Service worker de RDBK.app.
   - Shell (html/css/js): NETWORK-FIRST → cada deploy llega fresco; caché solo
     como respaldo offline.
   - FontAwesome (fuentes/CSS, inmutable): CACHE-FIRST, versionado por CACHE.
   Sube el número de CACHE solo si cambias los vendor/fuentes. */
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

    // Inmutable: FontAwesome (CSS + webfonts) → cache-first.
    if (url.pathname.includes('/fontawesome/')) {
        e.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
        })));
        return;
    }

    // Shell → network-first, con respaldo en caché (offline).
    e.respondWith(
        fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
        }).catch(() => caches.match(request))
    );
});
