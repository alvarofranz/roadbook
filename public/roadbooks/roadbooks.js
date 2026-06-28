'use strict';
/* Public Roadbooks page: the full list of public roadbooks with client-side search +
 * pagination. Cards link to the public view (/challenge/<slug>). Reuses RBChallenges.listPublic
 * (server returns the most recent public roadbooks); RB.filterByText drives the search. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;
    const PER = 12;
    let all = [], page = 1, q = '';
    const grid = $('rbGrid'), pager = $('rbPager'), search = $('rbSearch');

    const card = (r) => `<a class="gallery-card" href="/challenge/${encodeURIComponent(r.slug)}">${
        r.thumb ? `<img class="thumb" src="${esc(r.thumb)}" alt="${esc(r.title)}" loading="lazy">`
                : `<div class="thumb thumb-placeholder"><i class="fa-solid fa-map-location-dot"></i></div>`}
        <button type="button" class="card-copy" data-copy="${esc(r.slug)}" title="${esc(t('Copy link'))}" aria-label="${esc(t('Copy link'))}"><i class="fa-solid fa-link"></i></button>
        <div class="gallery-body"><h3>${esc(r.title)}</h3>
        <div class="gallery-meta">@${esc(r.username)} · ${RBSummary(r.total_distance, r.note_count)}</div></div></a>`;

    // the copy button lives inside the card link → don't let its click navigate
    grid.addEventListener('click', (e) => {
        const b = e.target.closest('.card-copy'); if (!b) return;
        e.preventDefault(); e.stopPropagation();
        RBCopy(RBReaderLink(b.dataset.copy));
    });

    function render() {
        const filtered = (window.RB && RB.filterByText) ? RB.filterByText(all, q, ['title', 'username']) : all;
        const pages = Math.max(1, Math.ceil(filtered.length / PER));
        if (page > pages) page = pages;
        const slice = filtered.slice((page - 1) * PER, page * PER);
        grid.innerHTML = slice.length ? slice.map(card).join('') : `<p class="gallery-empty">${esc(t('No matching roadbooks.'))}</p>`;
        pager.innerHTML = pages > 1
            ? `<button class="btn btn-ghost" id="rbPrev"${page <= 1 ? ' disabled' : ''} aria-label="${esc(t('Previous'))}"><i class="fa-solid fa-chevron-left"></i></button><span class="muted small">${page} / ${pages}</span><button class="btn btn-ghost" id="rbNext"${page >= pages ? ' disabled' : ''} aria-label="${esc(t('Next'))}"><i class="fa-solid fa-chevron-right"></i></button>`
            : '';
        if ($('rbPrev')) $('rbPrev').onclick = () => { if (page > 1) { page--; render(); } };
        if ($('rbNext')) $('rbNext').onclick = () => { if (page < pages) { page++; render(); } };
    }

    if (search) search.oninput = () => { q = search.value; page = 1; render(); };
    window.addEventListener('rb-lang', () => { if (all.length) render(); }); // re-render labels on language switch

    RBChallenges.listPublic().then((list) => {
        all = list || [];
        if (!all.length) { grid.innerHTML = `<p class="gallery-empty">${esc(t('No public roadbooks yet.'))}</p>`; if (search) search.closest('.rbp-toolbar').hidden = true; return; }
        render();
    }).catch(() => { grid.innerHTML = `<p class="gallery-empty">${esc(t('Could not load roadbooks.'))}</p>`; });
})();
