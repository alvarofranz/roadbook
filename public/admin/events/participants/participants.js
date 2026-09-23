'use strict';
/* Event participants page (#144): the roster lives on its own page — an event can have
 * hundreds of entrants, so it is searched and paged server-side (event_participants_list).
 * Opened as participants/?id=<event id>; management rights are enforced by the API.
 *
 * Top: the registration desk — the code a participant shows, typed or scanned, activated for THIS
 * event, and read back by name so the person in front of you is the one admitted (#604).
 * Below: the roster, filtered All · Pending · Active with their counts (#603), with its actions. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast, api = RBApi;
    const id = +(new URLSearchParams(location.search).get('id') || 0);
    let q = '', page = 1, status = null, eventTitle = '', counts = { pending: 0, active: 0 };
    // who an activation admitted, as the desk reads it back: username (full name)
    const whoLabel = (p) => p ? p.username + (p.name ? ' (' + p.name + ')' : '') : '';
    const fullName = (p) => ((p.first_name || '') + ' ' + (p.last_name || '')).trim();

    /* ---------- the roster ---------- */
    function renderFilter() {
        const all = counts.pending + counts.active;
        $('ppHeadCount').textContent = all ? `(${all})` : '';
        $('ppFilter').querySelectorAll('[data-status]').forEach((b) => b.classList.toggle('on', b.dataset.status === status));
        $('ppFilter').querySelector('[data-count="all"]').textContent = all;
        $('ppFilter').querySelector('[data-count="pending"]').textContent = counts.pending;
        $('ppFilter').querySelector('[data-count="active"]').textContent = counts.active;
        $('ppActivateAll').hidden = counts.pending < 1;
        $('ppActivateAllLabel').textContent = t('Activate all') + ` (${counts.pending})`;
    }
    // the empty state names what was asked for, instead of claiming the event has nobody (#603)
    function emptyText() {
        if (q) return t('Nothing matches that search.');
        if (status === 'pending') return t('Nobody is waiting for activation.');
        if (status === 'active') return t('No active participants yet.');
        return t('No participants yet.');
    }
    let loadSeq = 0; // the search, the filter, the pager and the desk refresh all load: only the latest paints
    async function load() {
        const seq = ++loadSeq;
        const r = await api('event_participants_list', { event_id: id, q, status: status || '', page });
        if (seq !== loadSeq) return;
        if (!r.ok) { $('adminMsg').textContent = t(r.error || 'Not found.'); $('adminMsg').hidden = false; $('ppBody').hidden = true; return; }
        counts = r.counts;
        // opening: the waiting list when someone is waiting, else everyone
        if (status === null) { status = counts.pending ? 'pending' : ''; if (status) return load(); }
        $('adminMsg').hidden = true; $('ppBody').hidden = false;
        const pages = Math.max(1, Math.ceil(r.total / r.per_page));
        if (page > pages) { page = pages; return load(); } // e.g. the last row of the last page was removed
        renderFilter();
        $('ppList').innerHTML = r.participants.length ? r.participants.map((p) => `<div class="ev-line">
            <span class="meta"><i class="fa-solid fa-${p.status === 'active' ? 'circle-check icon-ok' : 'hourglass-half'}"></i> ${esc(p.username)}
                <span class="muted small">${fullName(p) ? '· ' + esc(fullName(p)) + ' ' : ''}${p.email ? '· ' + esc(p.email) + ' ' : ''}· ${esc(RBFmtDate(p.joined))}</span></span>
            ${p.status === 'pending' ? `<button class="btn btn-ghost" data-ppact="${p.id}" type="button"><i class="fa-solid fa-check icon-ok"></i> ${esc(t('Activate'))}</button>` : ''}
            <button class="btn btn-ghost" data-ppdel="${p.id}" data-name="${esc(p.username)}" type="button" title="${esc(t('Remove'))}" aria-label="${esc(t('Remove'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button>
        </div>`).join('') : `<p class="muted small">${esc(emptyText())}</p>`;
        RBPager($('ppPager'), page, pages, (p) => { page = p; load(); }, pages > 1 ? `${r.total} ${esc(t('participants'))}` : '');
        $('ppList').querySelectorAll('[data-ppdel]').forEach((b) => b.onclick = async () => {
            if (!(await RBConfirmDanger(t('Remove participant') + ' “' + esc(b.dataset.name) + '”?'))) return;
            const x = await api('event_participant_remove', { event_id: id, user_id: +b.dataset.ppdel });
            if (x.ok) load(); else toast(x.error || 'Could not remove.');
        });
        $('ppList').querySelectorAll('[data-ppact]').forEach((b) => b.onclick = async () => {
            const busy = RBBusy(b);
            const x = await api('participant_activate', { event_id: id, user_id: +b.dataset.ppact });
            busy.reset();
            if (x.ok) load(); else toast(x.error || 'Could not activate.');
        });
    }
    $('ppFilter').querySelectorAll('[data-status]').forEach((b) => b.onclick = () => { status = b.dataset.status; page = 1; load(); });
    $('ppSearchIn').oninput = RBDebounce(() => { q = $('ppSearchIn').value.trim(); page = 1; load(); });
    window.addEventListener('rb-lang', () => { if (status !== null) load(); });
    // while people are waiting, the desk view keeps itself current (#311)
    setInterval(() => { if (!document.hidden && status === 'pending') load(); }, 10000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && status === 'pending') load(); });

    $('ppActivateAll').onclick = async (e) => {
        if (!(await RBConfirm(counts.pending + ' ' + t('participants are waiting for activation. Admit all of them?')))) return;
        const busy = RBBusy(e.currentTarget);
        const x = await api('event_participants_activate_pending', { event_id: id });
        busy.reset();
        if (x.ok) { toast((x.admitted || 0) + ' ' + t('participants activated.')); page = 1; load(); }
        else toast(x.error || 'Could not activate.');
    };

    /* ---------- the desk: activate by code, typed or scanned ---------- */
    async function activateCode(code, btn) {
        if (!/^[A-Z2-9]{6}$/.test(code)) return toast('Invalid activation code.');
        const busy = btn ? RBBusy(btn) : null;
        const x = await api('event_activate_by_code', { event_id: id, code });
        if (busy) busy.reset();
        if (!x.ok) return toast(x.error || 'Could not activate.');
        $('ppActivateIn').value = '';
        toast(t('Activated:') + ' ' + whoLabel(x.participant), 5000);
        load();
    }
    $('ppActivate').onclick = (e) => activateCode($('ppActivateIn').value.trim().toUpperCase(), e.currentTarget);
    $('ppActivateIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('ppActivate').click(); });
    $('ppScanQr').onclick = async () => {
        let stream = null;
        const stopStream = () => { if (stream) { stream.getTracks().forEach((tr) => tr.stop()); stream = null; } };
        // every exit (buttons, backdrop, Escape) ends the camera exactly once
        const modal = RBModal(`<div class="pp-scanner"><p class="muted small">${esc(t('Point the camera at the participant’s QR code.'))}</p>
            <video id="ppScannerVideo" class="pp-scan-video" autoplay playsinline></video>
            <p class="muted small" id="ppScanStatus">${esc(t('Waiting for QR code…'))}</p>
            <div class="btnrow"><button class="btn btn-ghost modal-close" type="button">${esc(t('Close'))}</button></div></div>`, '', () => stopStream());
        const close = () => { stopStream(); modal.close(); };
        modal.q('.modal-close').onclick = close;
        const video = modal.q('#ppScannerVideo');
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } });
            video.srcObject = stream; await video.play();
            (function scan() {
                if (!document.body.contains(modal.el)) return; // closed by any path: stop polling
                RBQrScan.detect(video).then((raw) => {
                    const code = (raw || '').trim().toUpperCase();
                    if (/^[A-Z2-9]{6}$/.test(code)) { close(); activateCode(code); return; }
                    modal.q('#ppScanStatus').textContent = t('Scanning…');
                    requestAnimationFrame(scan);
                }).catch(() => requestAnimationFrame(scan));
            })();
        } catch (e) { close(); toast('Could not access camera.'); }
    };

    /* ---------- add a participant (#605) ---------- */
    let addSeq = 0;
    $('ppAdd').onclick = () => {
        const modal = RBModal(`<h2>${esc(t('Add participant'))}</h2>
            <div class="rb-toolbar"><i class="fa-solid fa-magnifying-glass"></i><input class="rb-search" id="ppAddSearch" placeholder="${esc(t('Search users…'))}" aria-label="${esc(t('Search users…'))}" autocomplete="off"></div>
            <div id="ppAddResults" class="ev-pick-list"><p class="muted small">${esc(t('Type at least 2 characters to search.'))}</p></div>
            <div class="btnrow end"><button class="btn btn-ghost" data-cancel type="button">${esc(t('Close'))}</button></div>`, 'wide', () => searchSoon.cancel());
        const results = modal.q('#ppAddResults');
        const search = async (term) => {
            const seq = ++addSeq;
            if (term.length < 2) { results.innerHTML = `<p class="muted small">${esc(t('Type at least 2 characters to search.'))}</p>`; return; }
            const r = await api('user_search', { q: term, event_id: id });
            if (seq !== addSeq) return;
            if (!r.ok) { results.innerHTML = `<p class="muted small">${esc(r.error || t('Could not load.'))}</p>`; return; }
            results.innerHTML = r.users.length ? r.users.map((u) => `<div class="ev-line">
                <span class="meta"><b>${esc(u.username)}</b> <span class="muted small">${esc(fullName(u))}${u.organization ? ' · ' + esc(u.organization) : ''}</span></span>
                ${u.participant_status ? `<span class="u-badge">${esc(t(u.participant_status === 'active' ? 'Active' : 'Pending'))}</span>`
                    : `<button class="btn btn-ghost" data-pu="${u.id}" data-pun="${esc(u.username)}" type="button"><i class="fa-solid fa-user-plus"></i> ${esc(t('Add'))}</button>`}
            </div>`).join('') : `<p class="muted small">${esc(t('Nothing matches that search.'))}</p>`;
            results.querySelectorAll('[data-pu]').forEach((b) => b.onclick = async () => {
                const busy = RBBusy(b);
                const x = await api('event_participant_add', { event_id: id, user_id: +b.dataset.pu });
                if (!x.ok) { busy.reset(); return toast(x.error || 'Could not add.'); }
                toast(b.dataset.pun + ' ' + t('added.'));
                modal.close(); status = ''; page = 1; load();
            });
        };
        const inp = modal.q('#ppAddSearch');
        const searchSoon = RBDebounce(search);
        inp.oninput = () => searchSoon(inp.value.trim());
        modal.q('[data-cancel]').onclick = modal.close;
        inp.focus();
    };

    /* ---------- import a list (#153) ---------- */
    // A CSV (the export works as it is) or a paste: every email that belongs to an account is enrolled
    // as active; the rest are listed so the organizer can invite those people to register.
    $('ppImport').onclick = () => {
        const modal = RBModal(`<h2><i class="fa-solid fa-file-import icon-accent"></i> ${esc(t('Import list'))}</h2>
            <p class="muted small">${esc(t('A CSV or a pasted list: every email that belongs to an RDBK account is enrolled as active. People without an account are listed — invite them to register, then import again.'))}</p>
            <div class="btnrow"><button class="btn btn-ghost" data-file type="button"><i class="fa-solid fa-file-csv"></i> ${esc(t('Choose a CSV file'))}</button><input type="file" accept=".csv,.txt,text/csv,text/plain" hidden data-input></div>
            <textarea class="field" rows="6" data-text placeholder="${esc(t('…or paste the emails here'))}"></textarea>
            <p class="muted small" data-count></p>
            <div data-report></div>
            <div class="btnrow end"><button class="btn btn-ghost" data-cancel type="button">${esc(t('Close'))}</button><button class="btn btn-primary" data-go type="button" disabled><i class="fa-solid fa-user-plus"></i> ${esc(t('Enrol'))}</button></div>`, 'wide');
        const text = modal.q('[data-text]'), count = modal.q('[data-count]'), go = modal.q('[data-go]');
        let emails = [];
        const scan = () => {
            emails = RB.parseEmailList(text.value);
            count.textContent = emails.length ? emails.length + ' ' + t('email addresses found') : '';
            go.disabled = !emails.length;
        };
        text.oninput = scan;
        modal.q('[data-file]').onclick = () => modal.q('[data-input]').click();
        modal.q('[data-input]').onchange = async (e) => { const f = e.target.files[0]; if (f) { text.value = await f.text(); scan(); } };
        modal.q('[data-cancel]').onclick = modal.close;
        go.onclick = async () => {
            const busy = RBBusy(go);
            const x = await api('event_participants_import', { event_id: id, emails });
            if (!x.ok) { busy.reset(); return toast(x.error || 'Could not import.'); }
            busy.ok();
            modal.q('[data-report]').innerHTML = `<ul class="modal-list">
                    <li><i class="fa-solid fa-circle-check icon-ok"></i> ${x.enrolled} ${esc(t('enrolled'))}</li>
                    <li><i class="fa-solid fa-user-check icon-accent"></i> ${x.already} ${esc(t('were already participants'))}</li>
                    <li><i class="fa-solid fa-user-xmark icon-danger"></i> ${x.not_found.length} ${esc(t('without an RDBK account'))}</li>
                </ul>${x.not_found.length ? `<textarea class="field" rows="3" readonly>${esc(x.not_found.join('\n'))}</textarea>
                <div class="btnrow"><button class="btn btn-ghost btn-sm" data-copy type="button"><i class="fa-regular fa-copy"></i> ${esc(t('Copy these emails'))}</button></div>` : ''}`;
            const copy = modal.q('[data-copy]');
            if (copy) copy.onclick = () => RBCopy(x.not_found.join('\n'), 'Copied.');
            status = ''; page = 1; load();
        };
        text.focus();
    };

    /* ---------- CSV export (#606) ---------- */
    // The whole roster — or the current search — collected 100 at a time, quoted RFC-4180 style.
    $('ppExport').onclick = async (e) => {
        const busy = RBBusy(e.currentTarget);
        const rows = [];
        for (let p = 1; ; p++) {
            const r = await api('event_participants_list', { event_id: id, q, page: p, per_page: 100 });
            if (!r.ok) { busy.reset(); return toast(r.error || 'Could not load.'); }
            rows.push(...r.participants);
            if (p * r.per_page >= r.total) break;
        }
        if (!rows.length) { busy.reset(); return toast(q ? 'Nothing matches that search.' : 'No participants yet.'); }
        busy.ok();
        // the email only reaches a site admin (the server leaves it out for organizers)
        const columns = ['username', 'first_name', 'last_name', ...('email' in rows[0] ? ['email'] : []), 'status', 'joined'];
        const name = (eventTitle || 'rdbk-participants').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim(); // named after the event
        RBDownload(RBCsv([columns, ...rows.map((p) => columns.map((c) => p[c]))]), name + '.csv');
    };

    (async function init() {
        if (!(await RBRequireUser($('adminMsg')))) return;
        const r = await api('event_manage_get', { id }); // the heading: which event, and the way to its editor
        if (r.ok) {
            eventTitle = r.event.title;
            $('ppEventTitle').textContent = eventTitle;
            $('ppEditLink').hidden = false; $('ppEditLink').href = '../edit/?id=' + id;
        }
        load();
    })();
})();
