'use strict';
/* Public event presentation page (#6): /event/<slug>. Shows the event (title, dates,
 * organizer, description), a join-with-code form for signed-in users (#123) and the
 * roadbooks it gathers — the public ones for everyone, plus the READY ones for
 * participants (#25). Joining or leaving re-fetches, so the list follows the access. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast;
    const parts = location.pathname.split('/').filter(Boolean);
    const slug = new URLSearchParams(location.search).get('s') || parts[parts.length - 1];
    if (!slug || slug === 'event') { $('evLoading').textContent = t('Not found.'); return; }
    const meta = (e) => '@' + (e.organizer || '') + (RBDateRange(e.starts_on, e.ends_on) ? ' · ' + RBDateRange(e.starts_on, e.ends_on) : '');
    let ev = null; // the loaded event — kept for the language-switch re-render
    const whoami = RBApi('config').catch(() => ({})); // fetched once; renderJoin awaits it on every re-render

    function render(j) {
        const e = ev = j.event;
        $('evLoading').hidden = true; $('evContent').hidden = false;
        $('evTitle').textContent = e.title;
        if (e.logo) { $('evLogo').src = RBMediaSrc(e.logo); $('evLogo').hidden = false; }
        RBSetMeta({ title: e.title + ' · RDBK.app', description: e.description || undefined, canonical: location.origin + '/event/' + encodeURIComponent(slug) });
        $('evMeta').textContent = meta(e);
        $('evDesc').textContent = e.description || '';
        const w = $('evWebsite');
        if (e.organizer_website) { w.hidden = false; w.innerHTML = `<a href="${esc(e.organizer_website)}" target="_blank" rel="noopener"><i class="fa-solid fa-globe"></i> ${esc(e.organizer_website.replace(/^https?:\/\//, ''))}</a>`; } else w.hidden = true;
        const mapEl = $('evHqMap');
        if (e.hq_lat != null && e.hq_lon != null) {
            mapEl.hidden = false;
            const hqMap = new RBMap('evHqMap', { zoom: 13, center: [e.hq_lon, e.hq_lat] });
            if (hqMap.map) new maplibregl.Marker({ color: '#e8b059' }).setLngLat([e.hq_lon, e.hq_lat]).addTo(hqMap.map);
        } else mapEl.hidden = true;
        const card = (r) => RBGalleryCard({
            href: `/challenge/${encodeURIComponent(r.slug)}?event=${encodeURIComponent(slug)}`, thumb: r.thumb, title: r.title,
            meta: `${r.category ? `<span class="u-badge">${esc(r.category)}</span> ` : ''}@${esc(r.username)} · ${RBSummary(r.total_distance, r.note_count)}`,
            body: r.status === 'ready' ? `<div class="ev-rb-reserved"><i class="fa-solid fa-lock"></i> ${esc(t('Participants only'))}</div>` : '',
        });
        $('evRoadbooks').innerHTML = j.roadbooks.length
            ? j.roadbooks.map(card).join('')
            : `<p class="gallery-empty">${esc(t('No roadbooks yet.'))}</p>`;
        renderJoin(e);
    }
    // Joining changes what the server returns (the READY roadbooks appear), so join/leave
    // always re-fetch the whole page payload instead of patching the local state.
    const load = () => RBApi('event_get', { slug })
        .then((j) => { if (j.ok) render(j); else $('evLoading').textContent = t('Not found.'); })
        .catch(() => { $('evLoading').textContent = t('Not found.'); });
    window.addEventListener('rb-lang', () => { if (ev) $('evMeta').textContent = meta(ev); });
    load();

    // Join with code (#123): shown when the organizer enabled joining. Signed-in users enter
    // the shared code; a participant sees their state and can leave.
    async function renderJoin(e) {
        const box = $('evJoin');
        if (!e.can_join && !e.joined) { box.hidden = true; return; }
        box.hidden = false;
        const cfg = await whoami; // resolved once at page load
        if (!cfg.user) {
            box.innerHTML = `<span class="grow">${esc(t('Sign in to join this event with the organizer’s code.'))}</span>
                <a class="btn btn-primary" href="/account/?next=${encodeURIComponent(location.pathname)}">${esc(t('Sign in'))}</a>`;
            return;
        }
        if (e.joined) {
            box.innerHTML = `<span class="grow"><i class="fa-solid fa-flag-checkered icon-accent"></i> ${esc(t('You are participating in this event.'))}</span>
                <button class="btn btn-ghost" id="evLeave">${esc(t('Leave event'))}</button>`;
            box.querySelector('#evLeave').onclick = async () => {
                if (!(await RBConfirmDanger(t('Leave event') + ' “' + esc(e.title) + '”?', t('Leave event')))) return;
                const x = await RBApi('event_leave', { slug: e.slug });
                if (x.ok) load(); else toast(x.error || 'Could not save.'); // the reserved roadbooks drop out
            };
            return;
        }
        box.innerHTML = `<span class="grow">${esc(t('Have a join code from the organizer?'))}</span>
            <input id="evCode" class="field" data-i18n-ph="Join code" placeholder="${esc(t('Join code'))}" autocomplete="off" maxlength="16">
            <button class="btn btn-primary" id="evJoinBtn"><i class="fa-solid fa-flag-checkered"></i> ${esc(t('Join'))}</button>`;
        const join = async () => {
            const code = box.querySelector('#evCode').value.trim();
            if (!code) return;
            const x = await RBApi('event_join', { code, slug: e.slug });
            if (x.ok) { toast('You are participating in this event.'); load(); } // the reserved roadbooks appear
            else toast(x.error || 'Wrong join code.');
        };
        box.querySelector('#evJoinBtn').onclick = join;
        box.querySelector('#evCode').addEventListener('keydown', (ev2) => { if (ev2.key === 'Enter') join(); });
    }
})();
