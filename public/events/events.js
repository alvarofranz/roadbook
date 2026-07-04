'use strict';
/* Public Events page (#6): the list of public events with client-side search + pagination.
 * Cards link to the event presentation page (/event/<slug>). */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;
    const PER = 12;
    let all = [], page = 1, q = '';
    const grid = $('evGrid'), pager = $('evPager'), search = $('evSearch');

    const card = (e) => RBGalleryCard({
        href: `/event/${encodeURIComponent(e.slug)}`, thumb: e.logo, title: e.title, icon: 'fa-flag-checkered',
        meta: `@${esc(e.organizer)}${RBDateRange(e.starts_on, e.ends_on) ? ' · ' + esc(RBDateRange(e.starts_on, e.ends_on)) : ''} · ${e.roadbooks} ${esc(t('roadbooks'))}`,
    });

    function render() {
        const filtered = (window.RB && RB.filterByText) ? RB.filterByText(all, q, ['title', 'organizer']) : all;
        const pages = Math.max(1, Math.ceil(filtered.length / PER));
        if (page > pages) page = pages;
        const slice = filtered.slice((page - 1) * PER, page * PER);
        grid.innerHTML = slice.length ? slice.map(card).join('') : `<p class="gallery-empty">${esc(t('No events yet.'))}</p>`;
        RBPager(pager, page, pages, (p) => { page = p; render(); });
    }

    if (search) search.oninput = () => { q = search.value; page = 1; render(); };
    window.addEventListener('rb-lang', () => { if (all.length) render(); });

    RBApi('events_list').then((r) => {
        all = (r.ok && r.events) || [];
        render();
    }).catch(() => { grid.innerHTML = `<p class="gallery-empty">${esc(t('Could not load.'))}</p>`; });
})();
