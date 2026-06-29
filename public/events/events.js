'use strict';
/* Public Events page (#6): the list of public events with client-side search + pagination.
 * Cards link to the event presentation page (/event/<slug>). */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;
    const PER = 12;
    let all = [], page = 1, q = '';
    const grid = $('evGrid'), pager = $('evPager'), search = $('evSearch');

    const dates = (e) => e.starts_on ? (e.ends_on && e.ends_on !== e.starts_on ? `${e.starts_on} – ${e.ends_on}` : e.starts_on) : '';
    const card = (e) => `<a class="gallery-card" href="/event/${encodeURIComponent(e.slug)}">
        <div class="thumb thumb-placeholder"><i class="fa-solid fa-flag-checkered"></i></div>
        <div class="gallery-body"><h3>${esc(e.title)}</h3>
        <div class="gallery-meta">@${esc(e.organizer)}${dates(e) ? ' · ' + esc(dates(e)) : ''} · ${e.roadbooks} ${esc(t('roadbooks'))}</div></div></a>`;

    function render() {
        const filtered = (window.RB && RB.filterByText) ? RB.filterByText(all, q, ['title', 'organizer']) : all;
        const pages = Math.max(1, Math.ceil(filtered.length / PER));
        if (page > pages) page = pages;
        const slice = filtered.slice((page - 1) * PER, page * PER);
        grid.innerHTML = slice.length ? slice.map(card).join('') : `<p class="gallery-empty">${esc(t('No events yet.'))}</p>`;
        pager.innerHTML = pages > 1
            ? `<button class="btn btn-ghost" id="evPrev"${page <= 1 ? ' disabled' : ''} aria-label="${esc(t('Previous'))}"><i class="fa-solid fa-chevron-left"></i></button><span class="muted small">${page} / ${pages}</span><button class="btn btn-ghost" id="evNext"${page >= pages ? ' disabled' : ''} aria-label="${esc(t('Next'))}"><i class="fa-solid fa-chevron-right"></i></button>`
            : '';
        if ($('evPrev')) $('evPrev').onclick = () => { if (page > 1) { page--; render(); } };
        if ($('evNext')) $('evNext').onclick = () => { if (page < pages) { page++; render(); } };
    }

    if (search) search.oninput = () => { q = search.value; page = 1; render(); };
    window.addEventListener('rb-lang', () => { if (all.length) render(); });

    RBApi('events_list').then((r) => {
        all = (r.ok && r.events) || [];
        render();
    }).catch(() => { grid.innerHTML = `<p class="gallery-empty">${esc(t('Could not load.'))}</p>`; });
})();
