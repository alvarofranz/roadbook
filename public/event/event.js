'use strict';
/* Public event presentation page (#6): /event/<slug>. Shows the event (title, dates,
 * organizer, description), its registration — join, the pending participant's activation QR,
 * leave (#582) — and the roadbooks it gathers: the public ones for everyone, plus the READY ones
 * for participants (#25). Listed or not, the link opens it (#573).
 *
 * Two phases: what is built ONCE per page (the HQ map, the gallery's copy-link listener) and
 * render(), which paints everything from the loaded payload and runs again after a join/leave
 * (the server's answer changes: READY roadbooks appear) and on a language switch — so a re-render
 * never stacks a second map or a second listener (#584), and never leaves text in the previous
 * language (#586). */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast;
    const parts = location.pathname.split('/').filter(Boolean);
    const slug = new URLSearchParams(location.search).get('s') || parts[parts.length - 1];
    if (!slug || slug === 'event') { $('evLoading').textContent = t('Not found.'); return; }
    const whoami = RBApi('config').catch(() => ({})); // fetched once; the join box awaits it
    let data = null;     // the last event_get payload, re-rendered on a language switch
    let hqMap = null;    // built once, on the first payload that has headquarters

    /* ---------- built once ---------- */
    // The copy control floats over a card link: one listener for the gallery's whole life.
    $('evRoadbooks').addEventListener('click', (e) => {
        const b = e.target.closest('.card-copy');
        if (!b) return;
        e.preventDefault(); e.stopPropagation();
        RBCopy(RBReaderLink(b.dataset.copy));
    });
    function showHq(e) {
        const mapEl = $('evHqMap');
        const has = e.hq_lat != null && e.hq_lon != null && !RBIsParticipant();
        mapEl.hidden = !has;
        if (!has || hqMap) return;
        hqMap = new RBMap('evHqMap', { zoom: 13, center: [e.hq_lon, e.hq_lat], style: RBMap.STYLE_TOPO });
        if (hqMap.map) new maplibregl.Marker({ color: '#dc3545' }).setLngLat([e.hq_lon, e.hq_lat]).addTo(hqMap.map);
    }

    /* ---------- render (repeatable) ---------- */
    const statusBadge = (r, e) => {
        if (r.status === 'public') return `<div class="ev-rb-status public"><i class="fa-solid fa-globe"></i> ${esc(t('Public'))}</div>`;
        if (r.status === 'draft') return `<div class="ev-rb-status reserved"><i class="fa-solid fa-lock"></i> ${esc(t('In preparation'))}</div>`;
        if (r.status === 'ready') {
            if (e.active_participant || e.org_read) return `<div class="ev-rb-status ready"><i class="fa-solid fa-check"></i> ${esc(t('Ready'))}</div>`;
            return `<div class="ev-rb-status reserved"><i class="fa-solid fa-lock"></i> ${esc(t('Active participants only'))}</div>`;
        }
        return '';
    };
    const card = (r, e) => {
        const canOpen = r.status !== 'ready' || e.active_participant || e.org_read;
        return RBGalleryCard({
            href: canOpen ? '/challenge/' + encodeURIComponent(r.slug) + '?event=' + encodeURIComponent(slug) : null,
            thumb: r.thumb, title: r.title,
            meta: (r.category ? '<span class="u-badge">' + esc(r.category) + '</span> ' : '') + '@' + esc(r.username) + ' · ' + RBSummary(r.total_distance, r.note_count),
            body: statusBadge(r, e),
            overlays: r.status === 'public' ? RBCopyLinkOverlay(r.slug) : '', // public ones are shareable (#493)
        });
    };
    function render() {
        const e = data.event, roadbooks = data.roadbooks;
        $('evLoading').hidden = true; $('evContent').hidden = false;
        $('evTitle').textContent = e.title;
        $('evLogo').hidden = !e.logo;
        if (e.logo) { $('evLogo').src = RBMediaSrc(e.logo); $('evLogo').onerror = () => { $('evLogo').hidden = true; }; }
        // an unlisted event is shared by link, not advertised: keep it out of search engines (#573)
        RBSetMeta({ title: e.title + ' · RDBK.app', description: e.description || undefined, canonical: location.origin + '/event/' + encodeURIComponent(slug), robots: e.is_public ? 'index, follow' : 'noindex' });
        const range = RBDateRange(e.starts_on, e.ends_on);
        $('evMeta').innerHTML = `<a href="${RBProfileLink(e.organizer)}">@${esc(e.organizer || '')}</a>` + (range ? ' · ' + esc(range) : '')
            + (e.ended ? ` <span class="u-badge u-blocked">${esc(t('Ended'))}</span>` : '');
        // organizers get the way back to managing it (#585), and are told when it is unlisted
        $('evManage').hidden = !e.org_read;
        $('evManage').href = '/admin/events/edit/?id=' + e.id;
        $('evUnlisted').hidden = !(e.org_read && !e.is_public);
        $('evDesc').textContent = e.description || '';
        const w = $('evWebsite');
        if (e.organizer_website && !RBIsParticipant()) {
            const href = /^https?:\/\//i.test(e.organizer_website) ? e.organizer_website : 'https://' + e.organizer_website;
            w.hidden = false;
            w.innerHTML = `<a href="${esc(href)}" target="_blank" rel="noopener"><i class="fa-solid fa-globe"></i> ${esc(href.replace(/^https?:\/\//, ''))}</a>`;
        } else w.hidden = true;
        showHq(e);
        $('evRoadbooks').innerHTML = roadbooks.length
            ? roadbooks.map((r) => card(r, e)).join('')
            : `<p class="gallery-empty">${esc(t('No roadbooks yet.'))}</p>`;
        const compRbs = roadbooks.filter((r) => r.scoring_mode && r.scoring_mode !== 'free');
        $('evRanking').hidden = !(compRbs.length && (e.active_participant || e.org_read));
        $('evRankingLinks').innerHTML = compRbs.map((r) => `<a class="btn btn-primary btn-sm" href="/ranking/?event=${encodeURIComponent(slug)}&rb=${encodeURIComponent(r.slug)}"><i class="fa-solid fa-ranking-star"></i> ${esc(r.title || r.slug)}</a>`).join(' ');
        renderRegistration(e);
    }

    // Joining changes what the server returns (the READY roadbooks appear), so join/leave
    // always re-fetch the whole page payload instead of patching the local state.
    const load = () => RBApi('event_get', { slug })
        .then((j) => { if (j.ok) { data = j; render(); } else $('evLoading').textContent = t('Not found.'); })
        .catch(() => { $('evLoading').textContent = t('Not found.'); });
    window.addEventListener('rb-lang', () => { if (data) render(); });
    load();

    /* ---------- registration: join · activation QR · leave ---------- */
    // The gate decides HOW you get in (invite code or open one-click), require_activation whether
    // you land pending with a personal QR or active at once. Signed-out visitors get the prompt
    // matching the event's gate — asking for a code the event does not use only confuses (#367).
    const leaveBtn = () => `<button class="btn btn-ghost" data-leave type="button"><i class="fa-solid fa-right-from-bracket icon-danger"></i> ${esc(t('Leave event'))}</button>`;
    async function renderRegistration(e) {
        const box = $('evJoin'), act = $('evActivate');
        act.hidden = true; box.hidden = true;
        if (e.joined && e.participant_status === 'pending') { renderActivateQr(e); return; }
        if (e.joined) {
            box.hidden = false;
            box.innerHTML = `<span class="grow"><i class="fa-solid fa-flag-checkered icon-accent"></i> ${esc(t('You are participating in this event.'))}</span>${leaveBtn()}`;
            wireLeave(box, e);
            return;
        }
        // nothing to join: registration is shut, the visitor organizes it, or already in participant mode
        if (!e.can_join || e.org_read || RBIsParticipant()) return;
        const cfg = await whoami;
        box.hidden = false;
        if (!cfg.user) {
            const prompt = e.join_gate === 'code' ? t('Sign in to join this event with the organizer\'s code.') : t('Sign in to join this event.');
            box.innerHTML = `<span class="grow">${esc(prompt)}</span><a class="btn btn-primary" href="/account/?next=${encodeURIComponent(location.pathname)}">${esc(t('Sign in'))}</a>`;
            return;
        }
        if (e.join_gate === 'open') {
            box.innerHTML = `<span class="grow"><i class="fa-solid fa-flag-checkered"></i> ${esc(t('Join this event as a participant.'))}</span><button class="btn btn-primary" data-join type="button"><i class="fa-solid fa-right-to-bracket"></i> ${esc(t('Join'))}</button>`;
            box.querySelector('[data-join]').onclick = (click) => join(click.currentTarget, {});
        } else {
            box.innerHTML = `<span class="grow">${esc(t('Have a join code from the organizer?'))}</span><input id="evCode" class="field" placeholder="${esc(t('Join code'))}" aria-label="${esc(t('Join code'))}" autocomplete="off" maxlength="16"><button class="btn btn-primary" data-join type="button"><i class="fa-solid fa-flag-checkered"></i> ${esc(t('Join'))}</button>`;
            const code = box.querySelector('#evCode');
            box.querySelector('[data-join]').onclick = (click) => { if (code.value.trim()) join(click.currentTarget, { code: code.value.trim() }); };
            code.addEventListener('keydown', (k) => { if (k.key === 'Enter') box.querySelector('[data-join]').click(); });
        }
    }
    async function join(btn, extra) {
        const busy = RBBusy(btn);
        const x = await RBApi('event_join', { slug, ...extra });
        busy.reset();
        if (!x.ok) return toast(x.error || 'Could not join.');
        toast(x.status === 'pending' ? 'Joined — show your QR to the organizer to be activated.' : 'You are participating in this event.');
        load();
    }
    function renderActivateQr(e) {
        $('evActivate').hidden = false;
        $('evQrToken').textContent = e.activation_code;
        const c = $('evQrCode');
        try { c.hidden = false; RBQr.draw(c, e.activation_code); } catch (er) { c.hidden = true; }
        $('evActivateLeave').innerHTML = leaveBtn();
        wireLeave($('evActivateLeave'), e);
    }
    $('evQrCopy').onclick = () => RBCopy($('evQrToken').textContent, 'Copied.');
    // Leaving drops the reserved roadbooks at once and, when the event requires activation, the
    // next join needs a new one — so it is asked first, naming the event (#582).
    function wireLeave(root, e) {
        root.querySelector('[data-leave]').onclick = async (click) => {
            let msg = t('Leave this event?') + '<br><b>' + esc(e.title) + '</b><br>' + t('You lose access to the roadbooks reserved to participants.');
            if (e.require_activation) msg += ' ' + t('Joining again will need a new activation by the organizer.');
            if (!(await RBConfirm(msg))) return;
            const busy = RBBusy(click.currentTarget);
            const x = await RBApi('event_leave', { slug });
            busy.reset();
            if (!x.ok) return toast(x.error || 'Could not leave.');
            RBLeaveParticipantMode(); // the reduced event-only surface belonged to this event
            toast('You left the event.');
            load();
        };
    }
})();
