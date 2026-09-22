'use strict';
/* Event management page (#123): one full page to edit one event, opened as edit/?id=<id>
 * (?id=0 or none creates it on the first save).
 *
 * Two kinds of change, never mixed:
 *  · the FORM — the event's own parameters and its registration settings — is saved by Save, with
 *    the registration confirms (#415). It is filled from the server on first load and after a
 *    save only, and leaving with unsaved edits asks first (#591);
 *  · the immediate actions — organizers, roadbooks, participation modes, the join code, the logo —
 *    act at once and refresh only their own section, so they never overwrite what is being typed
 *    in the form (#591) and never save it behind the organizer's back (#592). */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast, api = RBApi;
    let id = +(new URLSearchParams(location.search).get('id') || 0);
    let me = null, ev = null;

    // Participation modes for an associated roadbook (#6). 'fia' is shown but disabled (not
    // implemented); the API refuses it and falls back to 'free'.
    const MODES = [['free', 'No race (free)'], ['roadbook_suite', 'Roadbook-suite rules'], ['fia', 'FIA rules (unavailable)']];
    const modeOptions = (sel) => MODES.map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}${v === 'fia' ? ' disabled' : ''}>${esc(t(l))}</option>`).join('');
    const GATES = [['closed', 'Closed — nobody can join'], ['code', 'Invite code only'], ['open', 'Open — anyone can join']];
    // the documented defaults for a new event: invite code + organizer activation (#595)
    const NEW_EVENT = { join_gate: 'code', require_activation: 1 };

    const isOwner = () => me && ev && (me.is_admin || ev.owner_id === me.id);
    function fillGateOptions(value) {
        $('evJoinGate').innerHTML = GATES.map(([v, l]) => `<option value="${v}">${esc(t(l))}</option>`).join('');
        $('evJoinGate').value = value;
    }

    /* ---------- the form: filled on load/save, compared to know whether it is dirty ---------- */
    const FORM = ['evTitleIn', 'evStart', 'evEnd', 'evPublic', 'evDescIn', 'evWebsiteIn', 'evHqLat', 'evHqLon', 'evJoinGate', 'evRequireActivation'];
    const formState = () => FORM.map((f) => { const el = $(f); return el.type === 'checkbox' ? el.checked : el.value; }).join('\u0001');
    let savedState = '';
    const isDirty = () => savedState !== '' && formState() !== savedState;
    function fillForm() {
        const e = ev || NEW_EVENT;
        $('evTitleIn').value = e.title || '';
        $('evStart').value = e.starts_on || '';
        $('evEnd').value = e.ends_on || '';
        $('evPublic').checked = !!e.is_public;
        $('evDescIn').value = e.description || '';
        $('evWebsiteIn').value = e.organizer_website || '';
        $('evHqLat').value = e.hq_lat != null ? (+e.hq_lat).toFixed(6) : '';
        $('evHqLon').value = e.hq_lon != null ? (+e.hq_lon).toFixed(6) : '';
        fillGateOptions(e.join_gate);
        $('evRequireActivation').checked = !!e.require_activation;
        savedState = formState();
        syncHqPin();
        renderRegistration();
    }
    // Leaving with unsaved edits asks first — the page is the only copy of them.
    window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
    $('backLink').onclick = async (e) => {
        if (!isDirty()) return;
        e.preventDefault();
        if (await RBConfirm(t('Leave without saving your changes?'))) { savedState = ''; location.href = $('backLink').href; }
    };
    $('evJoinGate').onchange = renderRegistration;
    $('evRequireActivation').onchange = renderRegistration;

    /* ---------- save (the form, with the registration confirms) ---------- */
    // Enabling activation with active participants already in: keep them (grandfathered) or send
    // them back to pending for the QR. Resolves 'keep' | 'reset' | null (No = the save is aborted).
    function confirmEnableActivation(n) {
        return new Promise((resolve) => {
            const d = RBModal(`<p class="modal-text">${n} ${esc(t('participants are already active. Keep them active, or send them back to pending for the QR code?'))}</p>
                <div class="btnrow end">
                    <button class="btn btn-ghost" data-x="cancel">${esc(t('Cancel'))}</button>
                    <button class="btn btn-danger" data-x="reset">${esc(t('Require QR code'))}</button>
                    <button class="btn btn-primary" data-x="keep">${esc(t('Keep active'))}</button>
                </div>`, 'narrow', () => resolve(null));
            const done = (v) => { d.close(); resolve(v); };
            d.q('[data-x="cancel"]').onclick = () => done(null);
            d.q('[data-x="reset"]').onclick = () => done('reset');
            d.q('[data-x="keep"]').onclick = () => done('keep');
        });
    }
    async function save(btn) {
        const needAct = $('evRequireActivation').checked ? 1 : 0;
        const extra = {};
        if (ev) {
            const pending = ev.pending_count || 0, active = Math.max(0, (ev.participant_count || 0) - pending);
            const hadAct = !!ev.require_activation;
            if (!needAct && hadAct && pending > 0) {
                // removing the activation requirement strands nobody: admit them now (#415)
                if (!(await RBConfirm(pending + ' ' + t('participants are waiting for activation. Switching will admit all of them. Continue?')))) return;
                extra.admit_pending = 1;
            } else if (needAct && !hadAct && active > 0) {
                const choice = await confirmEnableActivation(active);
                if (!choice) return;
                if (choice === 'reset') extra.reset_active = 1;
            }
        }
        const busy = RBBusy(btn);
        const x = await api('event_save', {
            id, title: $('evTitleIn').value.trim(), description: $('evDescIn').value.trim(),
            organizer_website: $('evWebsiteIn').value.trim(),
            hq_lat: $('evHqLat').value || null, hq_lon: $('evHqLon').value || null,
            starts_on: $('evStart').value, ends_on: $('evEnd').value,
            is_public: $('evPublic').checked ? 1 : 0,
            join_gate: $('evJoinGate').value, require_activation: needAct,
            ...extra,
        });
        if (!x.ok) { busy.reset(); return toast(x.error || 'Could not save.'); }
        busy.ok();
        toast('Saved.');
        if (!id) { id = x.id; history.replaceState(null, '', '?id=' + id); } // the new event now exists: pin it to the URL
        await load();
        fillForm(); // the saved values, as the server now holds them
    }
    $('evSave').onclick = (e) => save(e.currentTarget);
    $('evSaveBottom').onclick = (e) => save(e.currentTarget); // a long page never forces a scroll back up (#179)

    /* ---------- header: the event's name + its actions (#597) ---------- */
    function renderHead() {
        $('evHead').hidden = false;
        $('evHeading').textContent = ev ? ev.title : t('New event');
        $('evView').hidden = !ev;
        if (ev) $('evView').href = '/event/' + ev.slug;
        $('evDelete').hidden = !(ev && isOwner()); // deleting stays with the owner (or an admin)
    }
    $('evDelete').onclick = async () => {
        if (await RBEventDelete({ id, title: ev.title, participants: ev.participant_count })) { savedState = ''; location.href = '../'; }
    };

    /* ---------- the event logo (#151) — immediate ---------- */
    function renderLogo() {
        $('logoRow').hidden = !ev; // uploading needs the event to exist
        if (!ev) return;
        $('evLogoImg').hidden = !ev.logo;
        if (ev.logo) $('evLogoImg').src = RBMediaSrc(ev.logo); // the stored URL carries its upload version (#588)
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
        if (!(await RBConfirmDanger(t('Remove the event logo?')))) return;
        const x = await api('event_logo_remove', { event_id: id });
        if (x.ok) { ev.logo = null; renderLogo(); } else toast(x.error || 'Could not remove.');
    };

    /* ---------- registration: the saved settings drive the code tools ---------- */
    function renderRegistration() {
        const saved = ev || NEW_EVENT;
        const changed = $('evJoinGate').value !== saved.join_gate || $('evRequireActivation').checked !== !!saved.require_activation;
        $('regPending').hidden = !(ev && changed);
        $('ppPageLink').hidden = !ev;
        if (ev) { $('ppPageLink').href = '../participants/?id=' + id; $('ppCount').textContent = ev.participant_count ? `(${ev.participant_count})` : ''; }
        // the code, its link and QR belong to a SAVED invite-code registration (a code gate always has one)
        const showCode = !!(ev && ev.join_gate === 'code' && ev.join_code && !changed);
        $('codeBox').hidden = !showCode;
        if (!showCode) return;
        $('joinCodeOut').textContent = ev.join_code;
        const url = RB.eventLink(ev.join_code);
        $('evLinkUrl').textContent = url; $('evLinkUrl').href = url;
        try { RBQr.draw($('evQrCode'), url); } catch (e) { $('evQrCode').hidden = true; }
    }
    $('evLinkCopy').onclick = () => RBCopy($('evLinkUrl').textContent, 'Copied.');
    async function setCode(btn, payload) {
        const busy = RBBusy(btn);
        const x = await api('event_join_code', { event_id: id, ...payload });
        if (!x.ok) { busy.reset(); return toast(x.error || 'Could not save.'); }
        busy.ok();
        ev.join_code = x.join_code;
        $('joinCodeIn').value = '';
        renderRegistration();
    }
    $('joinRotate').onclick = async (e) => {
        const btn = e.currentTarget;
        // rotating invalidates the link and QR already shared, so it is asked first
        if (await RBConfirm(t('Generate a new join code? The current one stops working.'))) setCode(btn, {});
    };
    $('joinSetBtn').onclick = (e) => {
        const code = $('joinCodeIn').value.trim().toUpperCase();
        if (!code) return;
        if (!/^[A-Z0-9]{4,16}$/.test(code)) return toast('A join code is 4–16 letters (A–Z) or digits.'); // it becomes the /go/ link (#576)
        setCode(e.currentTarget, { code });
    };
    $('joinCodeIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinSetBtn').click(); });

    /* ---------- organizers (#123 · #598) — immediate, owner-edited ---------- */
    function renderOrgs() {
        $('orgSection').hidden = !ev;
        if (!ev) return;
        $('orgAddRow').hidden = !isOwner();
        $('orgList').innerHTML = ev.organizers.map((o) => `<div class="ev-line">
            <span class="meta"><i class="fa-solid fa-user icon-accent"></i> ${esc(o.username)}${o.id === ev.owner_id ? ` <span class="u-badge">${esc(t('owner'))}</span>` : ''}${o.organization ? ` <span class="muted small">· ${esc(o.organization)}</span>` : ''}</span>
            ${isOwner() && o.id !== ev.owner_id ? `<button class="btn btn-ghost" data-orgdel="${o.id}" data-name="${esc(o.username)}" title="${esc(t('Remove'))}" aria-label="${esc(t('Remove'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button>` : ''}
        </div>`).join('');
        $('orgList').querySelectorAll('[data-orgdel]').forEach((b) => b.onclick = async () => {
            if (!(await RBConfirmDanger(t('Remove organizer') + ' “' + esc(b.dataset.name) + '”?'))) return;
            const x = await api('event_org_remove', { event_id: id, user_id: +b.dataset.orgdel });
            if (x.ok) refresh(); else toast(x.error || 'Could not remove.');
        });
    }
    let orgSearchSeq = 0;
    $('orgAddBtn').onclick = () => {
        const m = RBModal(`<h2>${esc(t('Add organizer'))}</h2>
            <div class="ev-add-row">
                <input id="orgSearchIn" class="field" placeholder="${esc(t('Search users…'))}" aria-label="${esc(t('Search users…'))}" autocomplete="off">
                <input id="orgOrgIn" class="field" placeholder="${esc(t('Organization'))}" aria-label="${esc(t('Organization'))}" autocomplete="off" list="orgSuggest">
                <datalist id="orgSuggest"></datalist>
            </div>
            <div id="orgListModal" class="ev-pick-list"></div>
            <div class="pager" id="orgPager"></div>
            <div class="btnrow end"><button class="btn btn-ghost" data-cancel>${esc(t('Close'))}</button></div>`, 'wide');
        RBOrgDatalist(m.q('#orgSuggest'));
        let q = '', org = '';
        const render = async (page) => {
            const seq = ++orgSearchSeq;
            if (q.length < 2 && org.length < 2) { m.q('#orgListModal').innerHTML = `<p class="muted small">${esc(t('Type at least 2 characters to search.'))}</p>`; m.q('#orgPager').innerHTML = ''; return; }
            const r = await api('user_search', { q, organization: org, page, per_page: 10 });
            if (seq !== orgSearchSeq) return;
            if (!r.ok) { m.q('#orgListModal').innerHTML = `<p class="muted small">${esc(r.error || t('Could not load.'))}</p>`; return; }
            const have = new Set(ev.organizers.map((o) => o.id));
            m.q('#orgListModal').innerHTML = (r.users || []).length
                ? r.users.map((u) => `<div class="ev-line"><span class="meta"><i class="fa-solid fa-user"></i> ${esc(u.username)} <span class="muted small">${esc((u.first_name + ' ' + u.last_name).trim())}${u.organization ? ' · ' + esc(u.organization) : ''}</span></span>
                    ${have.has(u.id) ? `<span class="u-badge">${esc(t('Organizer'))}</span>` : `<button class="btn btn-ghost" data-orgadd="${esc(u.username)}" type="button"><i class="fa-solid fa-user-plus"></i> ${esc(t('Add'))}</button>`}
                </div>`).join('')
                : `<p class="muted small">${esc(t('Nothing matches that search.'))}</p>`;
            m.q('#orgListModal').querySelectorAll('[data-orgadd]').forEach((b) => b.onclick = async () => {
                const busy = RBBusy(b);
                const x = await api('event_org_add', { event_id: id, username: b.dataset.orgadd });
                if (!x.ok) { busy.reset(); return toast(x.error || 'Could not add.'); }
                m.close(); refresh();
            });
            const pages = Math.ceil((r.total || 0) / 10);
            RBPager(m.q('#orgPager'), page, pages, render, pages > 1 ? `${r.total}` : '');
        };
        m.q('#orgSearchIn').oninput = () => { q = m.q('#orgSearchIn').value.trim(); render(1); };
        m.q('#orgOrgIn').oninput = () => { org = m.q('#orgOrgIn').value.trim(); render(1); };
        m.q('[data-cancel]').onclick = m.close;
        render(1);
        m.q('#orgSearchIn').focus();
    };

    /* ---------- associated roadbooks — immediate ---------- */
    // The real status (#596): a READY roadbook is exactly what participants receive; a draft is
    // invisible to them, and says so.
    const STATUS = { draft: 'Draft', ready: 'Ready', public: 'Public' };
    const statusBadge = (s) => `<span class="u-badge">${esc(t(STATUS[s] || s))}</span>`;
    function renderRbs() {
        $('rbSection').hidden = !ev;
        if (!ev) return;
        $('rbList').innerHTML = ev.roadbooks.length ? ev.roadbooks.map((r) => `<div class="ev-rb-row">
            <span class="meta"><b>${esc(r.title)}</b> ${statusBadge(r.status)} <span class="muted small">@${esc(r.username)}</span>
                ${r.status === 'draft' ? `<br><span class="muted small"><i class="fa-solid fa-eye-slash"></i> ${esc(t('Participants cannot see a draft — set it to Ready or Public in the Editor.'))}</span>` : ''}</span>
            <select class="field" data-rbmode="${r.id}" aria-label="${esc(t('Participation mode'))}">${modeOptions(r.scoring_mode || 'free')}</select>
            <a class="btn btn-ghost" href="/editor/?rb=${r.id}" title="${esc(t('Edit'))}" aria-label="${esc(t('Edit'))}"><i class="fa-solid fa-pen"></i></a>
            <button class="btn btn-ghost" data-rbdel="${r.id}" data-title="${esc(r.title)}" title="${esc(t('Remove from event'))}" aria-label="${esc(t('Remove from event'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button>
        </div>`).join('') : `<p class="muted small">${esc(t('No roadbooks attached yet.'))}</p>`;
        $('rbList').querySelectorAll('[data-rbmode]').forEach((s) => s.onchange = async () => {
            const x = await api('event_rb_mode', { event_id: id, roadbook_id: +s.dataset.rbmode, scoring_mode: s.value });
            if (x.ok) toast('Saved.'); else { toast(x.error || 'Could not save.'); refresh(); }
        });
        $('rbList').querySelectorAll('[data-rbdel]').forEach((b) => b.onclick = async () => {
            // removing only detaches it from the event — the roadbook itself is never deleted
            if (!(await RBConfirmDanger(t('Remove from event') + ' “' + esc(b.dataset.title) + '”?'))) return;
            const x = await api('event_rb_remove', { event_id: id, roadbook_id: +b.dataset.rbdel });
            if (x.ok) refresh(); else toast(x.error || 'Could not remove.');
        });
    }
    // "Add roadbook": a picker over YOUR roadbooks only (#140) — not public ones, not other users'.
    $('rbAdd').onclick = async () => {
        const r = await api('rb_list');
        const attached = new Set(ev.roadbooks.map((x) => x.id));
        const mine = ((r.ok && r.roadbooks) || []).filter((x) => !attached.has(+x.id));
        const m = RBModal(`<h2>${esc(t('Add roadbook'))}</h2>
            <p class="muted small">${esc(t('Pick one of your roadbooks to attach to this event.'))}</p>
            <input id="pickSearch" class="field" type="search" placeholder="${esc(t('Filter roadbooks…'))}" aria-label="${esc(t('Filter roadbooks…'))}" autocomplete="off">
            <div class="ev-pick-list" id="pickList"></div>
            <div class="btnrow end"><button class="btn btn-ghost" data-cancel>${esc(t('Close'))}</button></div>`, 'wide');
        const renderPick = (q) => {
            const list = RB.filterByText(mine, q, ['title']);
            m.q('#pickList').innerHTML = list.length ? list.map((x) => `<div class="ev-line">
                <span class="meta"><b>${esc(x.title)}</b> ${statusBadge(x.status)}</span>
                <button class="btn btn-ghost" data-pick="${x.id}" type="button"><i class="fa-solid fa-plus"></i> ${esc(t('Add'))}</button>
            </div>`).join('') : `<p class="muted small">${esc(t(mine.length ? 'Nothing matches that search.' : 'No roadbooks yet. Create one in the Editor.'))}</p>`;
            m.q('#pickList').querySelectorAll('[data-pick]').forEach((b) => b.onclick = async () => {
                const busy = RBBusy(b);
                const x = await api('event_rb_add', { event_id: id, roadbook_id: +b.dataset.pick });
                if (!x.ok) { busy.reset(); return toast(x.error || 'Could not add.'); }
                m.close(); refresh();
            });
        };
        renderPick('');
        m.q('#pickSearch').oninput = (e) => renderPick(e.target.value);
        m.q('[data-cancel]').onclick = m.close;
    };

    /* ---------- headquarters map (#249): built once per page (#594) ---------- */
    let hqMap = null, hqMarker = null;
    function placeHqMarker(lat, lon) {
        if (!hqMap || !hqMap.map) return;
        if (!hqMarker) hqMarker = new maplibregl.Marker({ color: '#dc3545' }).setLngLat([lon, lat]).addTo(hqMap.map);
        else hqMarker.setLngLat([lon, lat]);
    }
    // the coordinate inputs are the form's truth; the map follows them
    function syncHqPin() {
        const lat = parseFloat($('evHqLat').value), lon = parseFloat($('evHqLon').value);
        if (isNaN(lat) || isNaN(lon)) { if (hqMarker) { hqMarker.remove(); hqMarker = null; } return; }
        placeHqMarker(lat, lon);
        if (hqMap && hqMap.map) hqMap.map.jumpTo({ center: [lon, lat], zoom: Math.max(hqMap.map.getZoom(), 10) });
    }
    function initHqMap() {
        const lat = parseFloat($('evHqLat').value), lon = parseFloat($('evHqLon').value);
        const has = !isNaN(lat) && !isNaN(lon);
        // no HQ yet: the organizer's own default location, else a Europe-wide view (#599)
        const home = me.default_lat != null && me.default_lon != null ? [+me.default_lon, +me.default_lat] : null;
        hqMap = new RBMap('evHqMap', { zoom: has ? 11 : (home ? 9 : 3.5), center: has ? [lon, lat] : (home || [10, 48]), style: RBMap.STYLE_TOPO });
        if (!hqMap.map) return;
        hqMap.map.on('click', (e) => {
            $('evHqLat').value = e.lngLat.lat.toFixed(6); $('evHqLon').value = e.lngLat.lng.toFixed(6); // ~0.1 m (#291)
            placeHqMarker(e.lngLat.lat, e.lngLat.lng);
        });
        if (has) placeHqMarker(lat, lon);
    }
    $('evHqLat').oninput = syncHqPin;
    $('evHqLon').oninput = syncHqPin;

    /* ---------- load / refresh ---------- */
    async function load() {
        const r = await api('event_manage_get', { id });
        if (!r.ok) { $('adminMsg').textContent = r.error || t('Not found.'); $('adminMsg').hidden = false; $('evBody').hidden = true; return false; }
        ev = r.event;
        renderSections();
        return true;
    }
    function renderSections() { renderHead(); renderLogo(); renderOrgs(); renderRbs(); renderRegistration(); }
    // after an immediate action: fresh server data for the sections — the form is left as typed
    const refresh = () => load();
    // a language switch re-labels the page; what is typed in the form stays as it is
    window.addEventListener('rb-lang', () => {
        if ($('evBody').hidden) return;
        fillGateOptions($('evJoinGate').value);
        renderSections();
    });

    (async function init() {
        me = await RBRequireUser($('adminMsg'));
        if (!me) return;
        if (!id && !me.is_admin && !me.is_organizer) { $('adminMsg').textContent = t('Organizers only.'); return; }
        if (id && !(await load())) return;
        $('adminMsg').hidden = true; $('evBody').hidden = false;
        if (!id) renderSections();
        fillForm();
        initHqMap();
    })();
})();
