'use strict';
/* Event management page (#123): a full page (not a popup) to edit one event — its parameters on
 * top, then the organizers who co-manage it, the associated roadbooks (with per-roadbook
 * participation mode, #6) and the participants with their join code. Opened as edit/?id=<id>;
 * ?id=0 (or none) creates a new event on the first save. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast, api = RBApi;
    let id = +(new URLSearchParams(location.search).get('id') || 0);
    let me = null, ev = null;

    // Participation modes for an associated roadbook (#6). 'fia' is shown but disabled (not
    // implemented); the API refuses it and falls back to 'free'.
    const MODES = [['free', 'No race (free)'], ['roadbook_suite', 'Roadbook-suite rules'], ['fia', 'FIA rules (unavailable)']];
    const modeOptions = (sel) => MODES.map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}${v === 'fia' ? ' disabled' : ''}>${esc(t(l))}</option>`).join('');

    const isOwner = () => me && ev && (me.is_admin || ev.owner_id === me.id);

    /* ---------- 1 · parameters ---------- */
    function renderParams() {
        $('evHeading').textContent = ev ? ev.title : t('New event');
        $('evTitleIn').value = ev ? ev.title : '';
        $('evDescIn').value = (ev && ev.description) || '';
        $('evWebsiteIn').value = (ev && ev.organizer_website) || '';
        $('evStart').value = (ev && ev.starts_on) || '';
        $('evEnd').value = (ev && ev.ends_on) || '';
        $('evPublic').checked = !!(ev && ev.is_public);
        const view = $('evView');
        view.hidden = !(ev && ev.is_public);
        if (ev) view.href = '/event/' + ev.slug;
        // HQ map: place the pin if coordinates exist, otherwise default to Italy centre
        const lat = (ev && ev.hq_lat != null) ? ev.hq_lat : 43.7, lon = (ev && ev.hq_lon != null) ? ev.hq_lon : 12.5;
        if (ev && ev.hq_lat != null) setHqPin(ev.hq_lat, ev.hq_lon);
        else if (hqMap && hqMap.map) hqMap.map.jumpTo({ center: [lon, lat], zoom: 5 });
    }

    async function save() {
        const x = await api('event_save', {
            id, title: $('evTitleIn').value.trim(), description: $('evDescIn').value.trim(),
            organizer_website: $('evWebsiteIn').value.trim(),
            hq_lat: $('evHqLat').value || null, hq_lon: $('evHqLon').value || null,
            starts_on: $('evStart').value, ends_on: $('evEnd').value,
            is_public: $('evPublic').checked ? 1 : 0,
        });
        if (!x.ok) return toast(x.error || 'Could not save.');
        toast('Saved.');
        if (!id) { id = x.id; history.replaceState(null, '', '?id=' + id); } // a new event now exists: pin it to the URL
        load();
    }
    // Save is offered at both the top (in the heading row) and the foot of the form, so a long
    // event page never forces a scroll back up to save (#179).
    $('evSave').onclick = save;
    $('evSaveBottom').onclick = save;

    /* ---------- the event logo (#151): preview + upload + remove ---------- */
    function renderLogo() {
        $('logoRow').hidden = false;
        const img = $('evLogoImg');
        img.hidden = !ev.logo;
        if (ev.logo) img.src = ev.logo + '?v=' + Date.now(); // bust caches after a re-upload
        $('evLogoRemove').hidden = !ev.logo;
    }
    $('evLogoUpload').onclick = () => $('evLogoFile').click();
    $('evLogoFile').onchange = async () => {
        const f = $('evLogoFile').files[0];
        $('evLogoFile').value = '';
        if (!f) return;
        const r = await RBUpload({ type: 'event_logo', event: id }, f, 'logo.jpg');
        if (r.ok) { ev.logo = r.logo; renderLogo(); toast('Saved.'); } else toast(r.error || 'Could not save.');
    };
    $('evLogoRemove').onclick = async () => {
        if (!(await RBConfirmDanger(t('Remove the event logo?'), t('Remove')))) return;
        const x = await api('event_logo_remove', { event_id: id });
        if (x.ok) { ev.logo = null; renderLogo(); } else toast(x.error || 'Could not remove.');
    };

    /* ---------- 2 · organizers ---------- */
    function renderOrgs() {
        $('orgSection').hidden = false;
        $('orgAddRow').hidden = !isOwner(); // only the owner (or an admin) edits who co-manages
        $('orgResults').hidden = !isOwner();
        $('orgList').innerHTML = ev.organizers.map((o) => `<div class="ev-line">
            <span class="meta"><i class="fa-solid fa-user icon-accent"></i> ${esc(o.username)}${o.id === ev.owner_id ? ` <span class="muted small">(${esc(t('owner'))})</span>` : ''}
                <span class="muted small">· ${esc(o.email)}${o.organization ? ' · ' + esc(o.organization) : ''}</span></span>
            ${isOwner() && o.id !== ev.owner_id ? `<button class="btn btn-ghost" data-orgdel="${o.id}" data-name="${esc(o.username)}" title="${esc(t('Remove'))}" aria-label="${esc(t('Remove'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button>` : ''}
        </div>`).join('');
        $('orgList').querySelectorAll('[data-orgdel]').forEach((b) => b.onclick = async () => {
            if (!(await RBConfirmDanger(t('Remove organizer') + ' “' + esc(b.dataset.name) + '”?', t('Remove')))) return;
            const x = await api('event_org_remove', { event_id: id, user_id: +b.dataset.orgdel });
            if (x.ok) load(); else toast(x.error || 'Could not remove.');
        });
    }
    // Live user search (debounced) to pick a co-organizer; the organization filter narrows it
    // and defaults to YOUR organization (set once in init).
    let orgSearchTimer = null, orgSearchSeq = 0;
    function orgSearch() {
        clearTimeout(orgSearchTimer);
        orgSearchTimer = setTimeout(async () => {
            const q = $('orgSearchIn').value.trim(), organization = $('orgOrgIn').value.trim();
            if (!q && !organization) { $('orgResults').innerHTML = ''; return; }
            const seq = ++orgSearchSeq;
            const r = await api('user_search', { q, organization });
            if (seq !== orgSearchSeq) return; // a newer search is in flight — never paint stale results (#220)
            const have = new Set(ev ? ev.organizers.map((o) => o.username) : []);
            const list = ((r.ok && r.users) || []).filter((u) => !have.has(u.username));
            $('orgResults').innerHTML = list.length ? list.map((u) => `<div class="ev-line">
                <span class="meta"><i class="fa-solid fa-user"></i> ${esc(u.username)}${u.organization ? ` <span class="muted small">· ${esc(u.organization)}</span>` : ''}</span>
                <button class="btn btn-ghost" data-orgadd="${esc(u.username)}" title="${esc(t('Add organizer'))}" aria-label="${esc(t('Add organizer'))}"><i class="fa-solid fa-user-plus"></i> ${esc(t('Add'))}</button>
            </div>`).join('') : `<p class="muted small">${esc(t('No matching users.'))}</p>`;
            $('orgResults').querySelectorAll('[data-orgadd]').forEach((b) => b.onclick = async () => {
                const x = await api('event_org_add', { event_id: id, username: b.dataset.orgadd });
                if (x.ok) { $('orgResults').innerHTML = ''; $('orgSearchIn').value = ''; load(); } else toast(x.error || 'Could not add.');
            });
        }, 300);
    }
    $('orgSearchIn').oninput = orgSearch;
    $('orgOrgIn').oninput = orgSearch;

    /* ---------- 3 · associated roadbooks ---------- */
    function renderRbs() {
        $('rbSection').hidden = false;
        $('rbList').innerHTML = ev.roadbooks.length ? ev.roadbooks.map((r) => `<div class="ev-rb-row">
            <span class="meta"><b>${esc(r.title)}</b> <span class="muted small">@${esc(r.username)}${r.status === 'public' ? '' : ' · ' + esc(t('Draft'))}</span></span>
            <select class="field" data-rbmode="${r.id}">${modeOptions(r.scoring_mode || 'free')}</select>
            <a class="btn btn-ghost" href="/editor/?rb=${r.id}" title="${esc(t('Edit'))}" aria-label="${esc(t('Edit'))}"><i class="fa-solid fa-pen"></i></a>
            <button class="btn btn-ghost" data-rbdel="${r.id}" data-title="${esc(r.title)}" title="${esc(t('Remove from event'))}" aria-label="${esc(t('Remove from event'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button>
        </div>`).join('') : `<p class="muted small">${esc(t('No roadbooks attached yet.'))}</p>`;
        $('rbList').querySelectorAll('[data-rbmode]').forEach((s) => s.onchange = async () => {
            const x = await api('event_rb_mode', { event_id: id, roadbook_id: +s.dataset.rbmode, scoring_mode: s.value });
            if (!x.ok) { toast(x.error || 'Could not save.'); load(); }
        });
        $('rbList').querySelectorAll('[data-rbdel]').forEach((b) => b.onclick = async () => {
            // removing only detaches it from the event — the roadbook itself is never deleted
            if (!(await RBConfirmDanger(t('Remove from event') + ' “' + esc(b.dataset.title) + '”?', t('Remove')))) return;
            const x = await api('event_rb_remove', { event_id: id, roadbook_id: +b.dataset.rbdel });
            if (x.ok) load(); else toast(x.error || 'Could not remove.');
        });
    }
    // "Add roadbook": a picker over YOUR roadbooks only (#140) — not public ones, not other users'.
    $('rbAdd').onclick = async () => {
        const r = await api('rb_list');
        const attached = new Set(ev.roadbooks.map((x) => x.id));
        const mine = ((r.ok && r.roadbooks) || []).filter((x) => !attached.has(+x.id));
        const m = RBModal(`<h2>${esc(t('Add roadbook'))}</h2>
            <p class="muted small">${esc(t('Pick one of your roadbooks to attach to this event.'))}</p>
            <input id="pickSearch" class="field" type="search" placeholder="${esc(t('Filter roadbooks…'))}" autocomplete="off">
            <div class="ev-pick-list" id="pickList"></div>
            <div class="btnrow end"><button class="btn btn-ghost" data-cancel>${esc(t('Cancel'))}</button></div>`, 'wide');
        const renderPick = (q) => {
            const list = (window.RB && RB.filterByText) ? RB.filterByText(mine, q, ['title']) : mine;
            m.q('#pickList').innerHTML = list.length ? list.map((x) => `<div class="ev-line">
                <span class="meta"><b>${esc(x.title)}</b> <span class="muted small">${x.status === 'public' ? esc(t('Public')) : esc(t('Draft'))}</span></span>
                <button class="btn btn-ghost" data-pick="${x.id}"><i class="fa-solid fa-plus"></i> ${esc(t('Add'))}</button>
            </div>`).join('') : `<p class="muted small">${esc(t('No matching roadbooks.'))}</p>`;
            m.q('#pickList').querySelectorAll('[data-pick]').forEach((b) => b.onclick = async () => {
                const x = await api('event_rb_add', { event_id: id, roadbook_id: +b.dataset.pick });
                if (x.ok) { m.close(); load(); } else toast(x.error || 'Could not add.');
            });
        };
        renderPick('');
        m.q('#pickSearch').oninput = (e) => renderPick(e.target.value);
        m.q('[data-cancel]').onclick = m.close;
    };

    /* ---------- 4 · join code (the roster lives on participants/, #144) ---------- */
    function renderJoinCode() {
        $('ppSection').hidden = false;
        $('ppHeadCount').textContent = ev.participant_count ? `(${ev.participant_count})` : '';
        $('ppPageLink').href = '../participants/?id=' + id;
        const code = ev.join_code;
        $('joinCodeOut').innerHTML = code
            ? `${esc(t('Join code'))}: <span class="ev-join-code">${esc(code)}</span>`
            : `<span class="muted small">${esc(t('Joining with a code is disabled.'))}</span>`;
        $('joinCopy').hidden = !code;
        $('joinClear').hidden = !code;
        renderLink();
    }
    $('joinCopy').onclick = async () => { try { await navigator.clipboard.writeText(ev.join_code); toast('Copied.'); } catch (e) { toast('Could not copy.'); } };
    function renderLink() {
        if (!ev.join_code) { $('evLink').hidden = true; return; }
        $('evLink').hidden = false;
        var url = location.origin + '/go/' + ev.join_code;
        $('evLinkUrl').textContent = url; $('evLinkUrl').href = url;
        $('evLinkCopy').hidden = false;
    }
    $('evLinkCopy').onclick = async () => {
        try { await navigator.clipboard.writeText($('evLinkUrl').textContent); toast('Copied.'); } catch (e) { toast('Could not copy.'); }
    };
    $('joinRotate').onclick = async () => {
        // rotating invalidates the currently shared code, so it must be confirmed
        if (ev.join_code && !(await RBConfirm(t('Generate a new join code? The current one stops working.'), t('New join code')))) return;
        const x = await api('event_join_code', { event_id: id });
        if (x.ok) load(); else toast(x.error || 'Could not save.');
    };
    $('joinClear').onclick = async () => {
        if (!(await RBConfirm(t('Disable joining? The current code stops working.'), t('Disable joining')))) return;
        const x = await api('event_join_code', { event_id: id, clear: 1 });
        if (x.ok) load(); else toast(x.error || 'Could not save.');
    };

    /* ---------- headquarters map (#249) ---------- */
    let hqMap = null, hqMarker = null, settingHq = false;
    function setHqPin(lat, lon) {
        if (settingHq) return;
        settingHq = true;
        $('evHqLat').value = lat; $('evHqLon').value = lon;
        if (hqMap && hqMap.map) {
            if (hqMarker) hqMarker.remove();
            hqMarker = new maplibregl.Marker({ color: '#e8b059' }).setLngLat([lon, lat]).addTo(hqMap.map);
            hqMap.map.jumpTo({ center: [lon, lat] });
        }
        settingHq = false;
    }
    function hqInput() {
        const lat = parseFloat($('evHqLat').value), lon = parseFloat($('evHqLon').value);
        if (isNaN(lat) || isNaN(lon)) return;
        if (hqMap && hqMap.map) {
            if (settingHq) return;
            settingHq = true;
            if (hqMarker) hqMarker.remove();
            hqMarker = new maplibregl.Marker({ color: '#e8b059' }).setLngLat([lon, lat]).addTo(hqMap.map);
            hqMap.map.jumpTo({ center: [lon, lat], zoom: Math.max(hqMap.map.getZoom(), 8) });
            settingHq = false;
        }
    }
    function initHqMap() {
        const hasCoords = ev && ev.hq_lat != null && ev.hq_lon != null;
        const center = hasCoords ? [ev.hq_lon, ev.hq_lat] : [12.5, 43.7];
        hqMap = new RBMap('evHqMap', { zoom: hasCoords ? 10 : 5, center,
            style: { version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
                sources: { osm: { type: 'raster', tileSize: 256, maxzoom: 20,
                    tiles: ['https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
                        'https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
                        'https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png'] } },
                layers: [{ id: 'osm', type: 'raster', source: 'osm' }] } });
        if (!hqMap.map) return;
        hqMap.map.on('click', (e) => setHqPin(e.lngLat.lat, e.lngLat.lng));
        if (hasCoords) setHqPin(ev.hq_lat, ev.hq_lon);
        else if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => hqMap.map.jumpTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 10 }),
                () => {},
                { enableHighAccuracy: false, timeout: 5000 }
            );
        }
    }
    $('evHqLat').oninput = hqInput;
    $('evHqLon').oninput = hqInput;

    /* ---------- load ---------- */
    async function load() {
        const r = await api('event_manage_get', { id });
        if (!r.ok) { $('adminMsg').textContent = r.error || t('Not found.'); $('adminMsg').hidden = false; return; }
        ev = r.event;
        $('adminMsg').hidden = true; $('evBody').hidden = false; $('evActions').hidden = false;
        renderParams(); renderLogo(); renderOrgs(); renderRbs(); renderJoinCode();
        initHqMap();
    }

    (async function init() {
        me = await RBRequireUser($('adminMsg'));
        if (!me) return;
        $('orgOrgIn').value = ''; // the organizer search defaults to no org filter (#253)
        RBOrgDatalist($('orgSuggest')); // suggest the clubs already in use, so spellings stay consistent (#116)
        if (id > 0) return load();
        // new event: only the parameters section until the first save creates it
        if (!me.is_admin && !me.is_organizer) { $('adminMsg').textContent = t('Organizers only.'); return; }
        $('adminMsg').hidden = true; $('evBody').hidden = false; $('evActions').hidden = false;
        renderParams();
        initHqMap();
    })();
})();
