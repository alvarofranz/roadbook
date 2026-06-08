'use strict';
/* Home gallery: public roadbooks (challenges) from the database. */
(function () {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const t = (k, d) => (window.RBi18n ? RBi18n.t(k) : d);
    const ROOT = (window.RBChallenges && RBChallenges.ROOT) || '/';

    fetch(ROOT + 'api/index.php?action=public_list').then((r) => r.json()).then((j) => {
        const rbs = (j && j.roadbooks) || [];
        if (!rbs.length) { grid.innerHTML = `<p class="gempty">${t('gallery.empty', 'No public challenges yet.')}</p>`; return; }
        grid.innerHTML = rbs.map((r) => `
            <a class="gcard" href="${ROOT}challenge/${encodeURIComponent(r.slug)}">
                ${r.thumb ? `<img class="thumb" src="${r.thumb}" alt="${esc(r.title)}" loading="lazy">`
                    : `<div class="thumb thumb-ph"><i class="fa-solid fa-map-location-dot"></i></div>`}
                <div class="gbody">
                    <h3>${esc(r.title)}</h3>
                    <div class="gmeta">@${esc(r.username)} · ${(r.total_distance / 1000).toFixed(1)} km · ${r.note_count} ${t('gallery.notes', 'notes')}</div>
                </div>
            </a>`).join('');
    }).catch(() => { grid.innerHTML = `<p class="gempty">${t('gallery.empty', 'No public challenges yet.')}</p>`; });
})();
