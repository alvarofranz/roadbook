'use strict';
/* Home gallery: public roadbooks (challenges) from the database. */
(function () {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;
    const esc = RBesc, t = RBt; // shared helpers (app.js / i18n.js)
    const ROOT = RBChallenges.ROOT;
    let cards = null; // cached list so a language switch re-renders without refetching

    const render = () => {
        if (!cards) return;
        if (!cards.length) { grid.innerHTML = `<p class="gallery-empty">${t('gallery.empty')}</p>`; return; }
        grid.innerHTML = cards.map((r) => `
            <a class="gallery-card" href="${ROOT}challenge/${encodeURIComponent(r.slug)}">
                ${r.thumb ? `<img class="thumb" src="${esc(r.thumb)}" alt="${esc(r.title)}" loading="lazy">`
                    : `<div class="thumb thumb-placeholder"><i class="fa-solid fa-map-location-dot"></i></div>`}
                <div class="gallery-body">
                    <h3>${esc(r.title)}</h3>
                    <div class="gallery-meta">@${esc(r.username)} · ${RBSummary(r.total_distance, r.note_count)}</div>
                </div>
            </a>`).join('');
    };

    window.addEventListener('rb-lang', render);
    RBChallenges.listPublic().then((rbs) => { cards = rbs; render(); })
        .catch(() => { grid.innerHTML = `<p class="gallery-empty">${t('gallery.empty')}</p>`; });
})();
