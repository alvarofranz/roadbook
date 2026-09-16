'use strict';
/* Event participants page (#144): the roster lives on its own page — an event can have
 * hundreds of entrants, so it is searched and paged server-side (event_participants_list).
 * Opened as participants/?id=<event id>; management rights are enforced by the API. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast, api = RBApi;
    const id = +(new URLSearchParams(location.search).get('id') || 0);
    let q = '', page = 1, status = 'pending', searchTimer = null, refreshTimer = null, eventTitle = '', pendingTotal = 0;

    function renderActivateAll() {
        const b = $('ppActivateAll');
        b.hidden = pendingTotal < 1;
        b.querySelector('span').textContent = t('Activate all') + (pendingTotal > 0 ? ` (${pendingTotal})` : '');
    }
    $('ppActivateAll').onclick = async (e) => {
        if (pendingTotal < 1) return;
        if (!(await RBConfirm(pendingTotal + ' ' + t('participants are waiting for activation. Admit all of them?')))) return;
        const busy = RBBusy(e.currentTarget);
        const x = await api('event_participants_activate_pending', { event_id: id });
        busy.reset();
        if (x.ok) { toast((x.admitted || 0) + ' ' + t('participants activated.')); page = 1; load(); }
        else toast(x.error || 'Could not activate.');
    };

    async function load() {
        const r = await api('event_participants_list', { event_id: id, q, status, page });
        if (!r.ok) { $('adminMsg').textContent = r.error || t('Not found.'); $('adminMsg').hidden = false; $('ppBody').hidden = true; return; }
        $('adminMsg').hidden = true; $('ppBody').hidden = false;
        if (status === 'pending' && !q) pendingTotal = r.total; // the unfiltered pending count drives Activate all
        if (status !== 'pending' || q) {
            const c = await api('event_participants_list', { event_id: id, status: 'pending', page: 1, per_page: 1 });
            if (c.ok) pendingTotal = c.total;
        }
        renderActivateAll();
        const pages = Math.max(1, Math.ceil(r.total / r.per_page));
        if (page > pages) { page = pages; return load(); } // e.g. the last row of the last page was removed
        if (!q) $('ppHeadCount').textContent = r.total ? `(${r.total})` : '';
        $('ppList').innerHTML = r.participants.length ? r.participants.map((p) => `<div class="ev-line">
            <span class="meta"><i class="fa-solid fa-${p.status === 'active' ? 'circle-check icon-ok' : 'hourglass-half'}"></i> ${esc(p.username)}
                <span class="muted small">· ${esc((p.first_name + ' ' + p.last_name).trim())} · ${esc(p.email)} · ${esc(RBFmtDate(p.joined))}</span></span>
            ${p.status === 'pending' ? `<button class="btn btn-ghost" data-ppact="${p.id}" title="${esc(t('Activate'))}" aria-label="${esc(t('Activate'))}"><i class="fa-solid fa-check icon-ok"></i> ${esc(t('Activate'))}</button>` : ''}
            <button class="btn btn-ghost" data-ppdel="${p.id}" data-name="${esc(p.username)}" title="${esc(t('Remove'))}" aria-label="${esc(t('Remove'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button>
        </div>`).join('') : `<p class="muted small">${esc(t(q ? 'Nothing matches that search.' : 'No participants yet.'))}</p>`;
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

    $('ppSearchIn').oninput = () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { q = $('ppSearchIn').value.trim(); page = 1; load(); }, 300);
    };
    window.addEventListener('rb-lang', () => load());

    // Pending-only filter toggle (#311) — active by default
    $('ppPendingFilter').classList.add('active');
    $('ppPendingFilter').onclick = () => {
        status = status === 'pending' ? '' : 'pending';
        $('ppPendingFilter').classList.toggle('active', status === 'pending');
        page = 1;
        load();
    };

    // Auto-refresh every 10 s when pending filter is on (#311)
    function startRefresh() {
        clearInterval(refreshTimer);
        refreshTimer = setInterval(() => {
            if (!document.hidden && status === 'pending') load();
        }, 10000);
    }
    startRefresh();
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && status === 'pending') load();
    });

    $('ppActivate').onclick = async (e) => {
        const code = $('ppActivateIn').value.trim().toUpperCase();
        if (!code) return;
        if (!/^[A-Z2-9]{6}$/.test(code)) { toast('Invalid activation code.'); return; }
        const busy = RBBusy(e.currentTarget);
        const x = await api('event_activate_by_code', { code });
        busy.reset();
        if (x.ok) { $('ppActivateIn').value = ''; toast('Participant activated.'); load(); }
        else toast(x.error || 'Could not activate.');
    };
    $('ppActivateIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('ppActivate').click(); });

    $('ppScanQr').onclick = async () => {
        let stream = null;
        const stopStream = () => { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } };
        // onDismiss covers the backdrop/Escape paths (they call the internal close closure
        // directly); the wrapped close() below covers the buttons. stopStream is idempotent,
        // so every path ends the camera exactly once.
        const modal = RBModal(`<div class="pp-scanner"><p class="muted small">${esc(t('Point the camera at the participant\'s QR code.'))}</p>
            <video id="ppScannerVideo" class="pp-scan-video" autoplay playsinline></video>
            <p class="muted small" id="ppScanStatus">${esc(t('Waiting for QR code…'))}</p>
            <div class="btnrow"><button class="btn btn-ghost modal-close">${esc(t('Cancel'))}</button></div></div>`, '', () => stopStream());
        const origClose = modal.close;
        modal.close = function() { stopStream(); origClose(); };
        modal.q('.modal-close').onclick = () => modal.close();
        const video = modal.q('#ppScannerVideo');
        const status = modal.q('#ppScanStatus');
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } });
            video.srcObject = stream; await video.play();
            (function scan() {
                if (!document.body.contains(modal.el)) return; // closed by any path: stop polling
                RBQrScan.detect(video).then((raw) => {
                    if (raw) {
                        const code = raw.trim().toUpperCase();
                        if (/^[A-Z2-9]{6}$/.test(code)) {
                            stopStream();
                            modal.close();
                            $('ppActivateIn').value = code;
                            $('ppActivate').click();
                            return;
                        }
                    }
                    if (document.body.contains(modal.el)) status.textContent = esc(t('Scanning…'));
                    requestAnimationFrame(scan);
                }).catch(() => { requestAnimationFrame(scan); });
            })();
        } catch (e) { toast('Could not access camera.'); modal.close(); return; }
    };

    let addSearchTimer = null;
    $('ppAdd').onclick = () => {
        const modal = RBModal(`<div>
            <div class="toolbar pp-add-search">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input class="field" id="ppAddSearch" data-i18n-ph="Search users…" placeholder="${esc(t('Search users…'))}" aria-label="${esc(t('Search users…'))}" autocomplete="off">
            </div>
            <div id="ppAddResults"></div>
        </div>`, 'slim', () => { clearTimeout(addSearchTimer); });
        const search = (q) => {
            modal.q('#ppAddResults').innerHTML = `<p class="muted small">${esc(t('Search users…'))}</p>`;
            if (!q) return;
            api('user_search', { q }).then((r) => {
                if (!r.ok || !r.users) return;
                modal.q('#ppAddResults').innerHTML = r.users.length
                    ? r.users.map((u) => `<div class="ev-line"><span class="meta clickable" data-pu="${u.id}" data-pun="${esc(u.username)}">
                        <b>${esc(u.username)}</b> <span class="muted small">${esc((u.first_name + ' ' + u.last_name).trim())} · ${esc(u.email)}</span></span></div>`).join('')
                    : `<p class="muted small">${esc(t('Nothing matches that search.'))}</p>`;
                modal.el.querySelectorAll('[data-pu]').forEach((el) => el.onclick = async () => {
                    const busy = RBBusy(el);
                    const x = await api('event_participant_add', { event_id: id, user_id: +el.dataset.pu });
                    busy.reset();
                    if (x.ok) { toast(el.dataset.pun + ' ' + esc(t('added.'))); page = 1; await load(); modal.close(); }
                    else toast(x.error || 'Could not add.');
                });
            });
        };
        const inp = modal.q('#ppAddSearch');
        inp.oninput = () => { clearTimeout(addSearchTimer); addSearchTimer = setTimeout(() => search(inp.value.trim()), 300); };
        inp.focus();
    };

    // CSV export (first name, last name, email) of the whole roster — or of the current search
    // when one is active. Collected page by page (100 at a time), quoted RFC-4180 style.
    async function exportCSV(e) {
        const busy = e && e.currentTarget ? RBBusy(e.currentTarget) : null;
        const cell = (v) => /[",\n]/.test(v = String(v ?? '')) ? '"' + v.replace(/"/g, '""') + '"' : v;
        const rows = [];
        for (let p = 1; ; p++) {
            const r = await api('event_participants_list', { event_id: id, q, page: p, per_page: 100 });
            if (!r.ok) { if (busy) busy.reset(); return toast(r.error || 'Could not load.'); }
            rows.push(...r.participants);
            if (p * r.per_page >= r.total) break;
        }
        if (busy) busy.ok();
        if (!rows.length) return toast(q ? 'Nothing matches that search.' : 'No participants yet.');
        const lines = ['first_name,last_name,email', ...rows.map((p) => [cell(p.first_name), cell(p.last_name), cell(p.email)].join(','))];
        // the file is named after the event (filesystem-hostile characters stripped)
        const name = (eventTitle || 'rdbk-participants').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
        RBDownload(new Blob([lines.join('\n')], { type: 'text/csv' }), name + '.csv');
    }
    $('ppExportBottom').onclick = exportCSV;

    (async function init() {
        if (!(await RBRequireUser($('adminMsg')))) return;
        const r = await api('event_manage_get', { id }); // the heading: event title + a link back to its management page
        if (r.ok) {
            eventTitle = r.event.title; // also names the CSV export
            $('ppEventTitle').innerHTML = `${esc(eventTitle)} · <a href="../edit/?id=${id}">${esc(t('Edit event'))}</a>`;
        }
        load();
    })();
})();
