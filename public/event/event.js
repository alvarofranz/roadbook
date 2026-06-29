'use strict';
/* Public event presentation page (#6): /event/<slug>. Shows the event (title, dates,
 * organizer, description) and the public roadbooks it gathers, each linking to /challenge/<slug>. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;
    const parts = location.pathname.split('/').filter(Boolean);
    const slug = new URLSearchParams(location.search).get('s') || parts[parts.length - 1];
    if (!slug || slug === 'event') { $('evLoading').textContent = t('Not found.'); return; }
    const dates = (e) => e.starts_on ? (e.ends_on && e.ends_on !== e.starts_on ? `${e.starts_on} – ${e.ends_on}` : e.starts_on) : '';

    RBApi('event_get', { slug }).then((j) => {
        if (!j.ok) { $('evLoading').textContent = t('Not found.'); return; }
        const e = j.event;
        $('evLoading').hidden = true; $('evContent').hidden = false;
        $('evTitle').textContent = e.title;
        document.title = e.title + ' · RDBK.app';
        $('evMeta').textContent = '@' + (e.organizer || '') + (dates(e) ? ' · ' + dates(e) : '');
        $('evDesc').textContent = e.description || '';
        const card = (r) => `<a class="gallery-card" href="/challenge/${encodeURIComponent(r.slug)}">${
            r.thumb ? `<img class="thumb" src="${esc(r.thumb)}" alt="${esc(r.title)}" loading="lazy">`
                    : `<div class="thumb thumb-placeholder"><i class="fa-solid fa-map-location-dot"></i></div>`}
            <div class="gallery-body"><h3>${esc(r.title)}</h3>
            <div class="gallery-meta">@${esc(r.username)} · ${RBSummary(r.total_distance, r.note_count)}</div></div></a>`;
        $('evRoadbooks').innerHTML = j.roadbooks.length
            ? j.roadbooks.map(card).join('')
            : `<p class="gallery-empty">${esc(t('No roadbooks yet.'))}</p>`;
    }).catch(() => { $('evLoading').textContent = t('Not found.'); });
})();
