'use strict';
/* Home teaser: a few recent public roadbooks. The full searchable list lives at /roadbooks.
 * A roadbook with no photo gets a lightweight static SVG of its route shape (no basemap, no
 * interaction) instead of a generic icon — its track is fetched lazily, only for those cards. */
(function () {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;
    const esc = RBesc, t = RBt; // shared helpers (app.js / i18n.js)
    const ROOT = RBChallenges.ROOT;
    const TEASER = 6; // show only a handful here; "See all" links to the Public Roadbooks page
    let cards = null;          // cached list so a language switch re-renders without refetching
    const routeCache = {};     // slug → route SVG (or '' once fetched and empty), so we fetch once

    // A static SVG of the route polyline, fit to a 16:10 box (equirectangular, lon scaled by
    // cos(lat) so the shape isn't stretched). No tiles, no zoom — just the recognisable shape.
    function routeSvg(track) {
        if (!Array.isArray(track) || track.length < 2) return '';
        let pts = track;
        if (pts.length > 240) { const step = Math.ceil(pts.length / 240); pts = track.filter((_, i) => i % step === 0 || i === track.length - 1); }
        const W = 320, H = 200, pad = 16;
        const latM = pts.reduce((s, p) => s + (+p.lat), 0) / pts.length;
        const k = Math.cos(latM * Math.PI / 180) || 1;
        const X = pts.map((p) => (+p.lon) * k), Y = pts.map((p) => -(+p.lat));
        const minX = Math.min(...X), maxX = Math.max(...X), minY = Math.min(...Y), maxY = Math.max(...Y);
        const sX = (maxX - minX) || 1e-9, sY = (maxY - minY) || 1e-9;
        const sc = Math.min((W - 2 * pad) / sX, (H - 2 * pad) / sY);
        const oX = (W - sX * sc) / 2, oY = (H - sY * sc) / 2;
        const d = pts.map((p, i) => `${((X[i] - minX) * sc + oX).toFixed(1)},${((Y[i] - minY) * sc + oY).toFixed(1)}`).join(' ');
        return `<svg class="thumb thumb-route" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(t('route map'))}"><rect width="${W}" height="${H}" fill="#10151c"/><polyline points="${d}" fill="none" stroke="#e8b059" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
    }

    const render = () => {
        if (!cards) return;
        if (!cards.length) { grid.innerHTML = `<p class="gallery-empty">${t('gallery.empty')}</p>`; return; }
        grid.innerHTML = cards.slice(0, TEASER).map((r) => RBGalleryCard({
            href: `${ROOT}challenge/${encodeURIComponent(r.slug)}`, thumb: r.thumb, title: r.title,
            meta: `@${esc(r.username)} · ${RBSummary(r.total_distance, r.note_count)}`,
            // photo-less cards start with a marked placeholder that fillRoutes swaps for the route SVG
            placeholder: routeCache[r.slug] || `<div class="thumb thumb-placeholder" data-route="${esc(r.slug)}"><i class="fa-solid fa-map-location-dot"></i></div>`,
        })).join('');
        fillRoutes();
    };

    // For each photo-less card, fetch the roadbook once and swap the placeholder for its route SVG.
    function fillRoutes() {
        grid.querySelectorAll('.thumb-placeholder[data-route]').forEach((el) => {
            const slug = el.getAttribute('data-route');
            if (routeCache[slug] != null) { if (routeCache[slug]) el.outerHTML = routeCache[slug]; return; }
            routeCache[slug] = ''; // mark in-flight so we don't fetch twice
            RBChallenges.loadPublic(slug).then((j) => {
                const m = j.roadbook && j.roadbook.meta;
                // a public roadbook may still hide its map (map_access:false) — don't reveal its
                // route shape; fall back to the icon in that case.
                const svg = (m && m.map_access === false) ? '' : routeSvg(j.roadbook && j.roadbook.track);
                routeCache[slug] = svg;
                if (svg) { const cur = grid.querySelector(`.thumb-placeholder[data-route="${CSS.escape(slug)}"]`); if (cur) cur.outerHTML = svg; }
            }).catch(() => {});
        });
    }

    window.addEventListener('rb-lang', render);
    RBChallenges.listPublic().then((rbs) => {
        if (rbs === null) { grid.innerHTML = `<p class="gallery-empty">${t('Could not load.')}</p>`; return; } // failed ≠ empty (#218)
        cards = rbs; render();
    });
})();
