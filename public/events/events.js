'use strict';
/* Public Events page (#6): the public events with client-side search + pagination, in the order
 * the server gives them — upcoming first, the soonest on top, the ended ones at the bottom (#745).
 * Each card shows the vehicles its roadbooks suit. Cards link to the event page (/event/<slug>). */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;
    const PER = 12;
    let all = [], q = '';
    const grid = $('evGrid'), pager = $('evPager'), search = $('evSearch');

    // the logo URL carries its upload version (#588): cached normally, fresh after a re-upload
    const card = (e) => RBGalleryCard({
        href: `/event/${encodeURIComponent(e.slug)}`, thumb: e.logo, title: e.title, icon: 'fa-flag-checkered',
        meta: `@${esc(e.organizer)}${RBDateRange(e.starts_on, e.ends_on) ? ' · ' + esc(RBDateRange(e.starts_on, e.ends_on)) : ''} · ${e.roadbooks} ${esc(t('roadbooks'))}`
            + RBVehicleIcons(e.vehicles)
            + (e.ended ? ` <span class="u-badge u-blocked">${esc(t('Ended'))}</span>` : ''),
    });

    const list = RBPagedList({
        pager, per: PER, source: () => all,
        filter: (items) => RB.filterByText(items, q, ['title', 'organizer']),
        draw: (slice) => { grid.innerHTML = slice.length ? slice.map(card).join('') : `<p class="gallery-empty">${esc(t(q ? 'Nothing matches that search.' : 'No events yet.'))}</p>`; },
    });

    // Where a /go/ event link that leads nowhere lands (#579): say why, in the visitor's language.
    const LINK_NOTICE = {
        invalid: 'This event link is not valid. Ask the organizer for a new one.',
        closed: 'Registration for this event is closed.',
        ended: 'This event has ended.',
    };
    const linkWhy = LINK_NOTICE[new URLSearchParams(location.search).get('link')];
    const showLinkNotice = () => { if (!linkWhy) return; $('evLinkNoticeText').textContent = t(linkWhy); $('evLinkNotice').hidden = false; };
    showLinkNotice();
    window.addEventListener('rb-lang', showLinkNotice);

    if (search) search.oninput = () => { q = search.value; list.reset(); };
    window.addEventListener('rb-lang', () => { if (all.length) list.render(); });

    // Route the "Create" CTA by rights: signed out → LOGIN first, then Event management (#233); an
    // organiser (admin / organiser / co-organiser) → straight into Event management; a signed-in
    // visitor without rights keeps the guide (learn / request it).
    RBConfig().then((c) => {
        const u = c && c.user, link = $('evOrganise');
        if (!link) return;
        if (!u) link.href = '../account/?next=' + encodeURIComponent('/admin/events/');
        else if (u.is_admin || u.is_organizer || u.manages_events) link.href = '../admin/events/';
    }).catch(() => {});

    RBApi('events_list').then((r) => {
        if (!r.ok) { grid.innerHTML = `<p class="gallery-empty">${esc(t(r.error === 'Network error.' ? 'You are offline — reconnect to load this page.' : 'Could not load.'))}</p>`; return; } // failed ≠ empty
        all = r.events;
        list.render();
    });
})();
