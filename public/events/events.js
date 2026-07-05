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

    // The header claim points newcomers to the guide (learn / request the role); once the
    // visitor already manages events (admin, organiser, or a co-organiser), it becomes a direct
    // "Organise an event" shortcut into Event management.
    RBApi('config').then((c) => {
        const u = c && c.user, link = $('evOrganise'), txt = $('evOrganiseTxt');
        if (!link || !u || !(u.is_admin || u.is_organizer || u.manages_events)) return;
        link.href = '../admin/events/';
        txt.removeAttribute('data-i18n'); // set directly, don't let a later i18n pass revert it
        txt.textContent = t('Organise an event');
    }).catch(() => {});

    RBApi('events_list').then((r) => {
        all = (r.ok && r.events) || [];
        render();
    }).catch(() => { grid.innerHTML = `<p class="gallery-empty">${esc(t('Could not load.'))}</p>`; });
})();
