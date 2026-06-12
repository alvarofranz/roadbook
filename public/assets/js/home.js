'use strict';
/* Home gallery: public roadbooks (challenges) from the database. */
(function () {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;
    const esc = RBesc, t = RBt; // shared helpers (app.js / i18n.js)
    const ROOT = RBChallenges.ROOT;

    RBChallenges.listPublic().then((rbs) => {
        if (!rbs.length) { grid.innerHTML = `<p class="gallery-empty">${t('gallery.empty')}</p>`; return; }
        grid.innerHTML = rbs.map((r) => `
            <a class="gallery-card" href="${ROOT}challenge/${encodeURIComponent(r.slug)}">
                ${r.thumb ? `<img class="thumb" src="${r.thumb}" alt="${esc(r.title)}" loading="lazy">`
                    : `<div class="thumb thumb-placeholder"><i class="fa-solid fa-map-location-dot"></i></div>`}
                <div class="gallery-body">
                    <h3>${esc(r.title)}</h3>
                    <div class="gallery-meta">@${esc(r.username)} · ${(r.total_distance / 1000).toFixed(1)} km · ${r.note_count} ${t('gallery.notes')}</div>
                </div>
            </a>`).join('');
    }).catch(() => { grid.innerHTML = `<p class="gallery-empty">${t('gallery.empty')}</p>`; });
})();
