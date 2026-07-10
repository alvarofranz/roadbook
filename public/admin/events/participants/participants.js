'use strict';
/* Event participants page (#144): the roster lives on its own page — an event can have
 * hundreds of entrants, so it is searched and paged server-side (event_participants_list).
 * Opened as participants/?id=<event id>; management rights are enforced by the API. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast, api = RBApi;
    const id = +(new URLSearchParams(location.search).get('id') || 0);
    let q = '', page = 1, searchTimer = null, eventTitle = '';

    async function load() {
        const r = await api('event_participants_list', { event_id: id, q, page });
        if (!r.ok) { $('adminMsg').textContent = r.error || t('Not found.'); $('adminMsg').hidden = false; $('ppBody').hidden = true; return; }
        $('adminMsg').hidden = true; $('ppBody').hidden = false;
        const pages = Math.max(1, Math.ceil(r.total / r.per_page));
        if (page > pages) { page = pages; return load(); } // e.g. the last row of the last page was removed
        if (!q) $('ppHeadCount').textContent = r.total ? `(${r.total})` : '';
        $('ppList').innerHTML = r.participants.length ? r.participants.map((p) => `<div class="ev-line">
            <span class="meta"><i class="fa-solid fa-${p.status === 'active' ? 'circle-check icon-ok' : 'hourglass-half'}"></i> ${esc(p.username)}
                <span class="muted small">· ${esc((p.first_name + ' ' + p.last_name).trim())} · ${esc(p.email)} · ${esc(RBFmtDate(p.joined))}</span></span>
            <button class="btn btn-ghost" data-ppdel="${p.id}" data-name="${esc(p.username)}" title="${esc(t('Remove'))}" aria-label="${esc(t('Remove'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button>
        </div>`).join('') : `<p class="muted small">${esc(t(q ? 'No matching users.' : 'No participants yet.'))}</p>`;
        RBPager($('ppPager'), page, pages, (p) => { page = p; load(); }, pages > 1 ? `${r.total} ${esc(t('participants'))}` : '');
        $('ppList').querySelectorAll('[data-ppdel]').forEach((b) => b.onclick = async () => {
            if (!(await RBConfirmDanger(t('Remove participant') + ' “' + esc(b.dataset.name) + '”?', t('Remove')))) return;
            const x = await api('event_participant_remove', { event_id: id, user_id: +b.dataset.ppdel });
            if (x.ok) load(); else toast(x.error || 'Could not remove.');
        });
    }

    $('ppSearchIn').oninput = () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { q = $('ppSearchIn').value.trim(); page = 1; load(); }, 300);
    };
    window.addEventListener('rb-lang', () => load());

    $('ppActivate').onclick = async () => {
        const token = $('ppActivateIn').value.trim();
        if (!token) return;
        const key = (window.RB_CONFIG || {}).signKey;
        const r = await RB.verifyMeta(token, key);
        if (!r.valid) { toast('Invalid participant code.'); return; }
        const parts = r.meta.split(':');
        if (parts.length !== 3 || parts[2] !== 'activate') { toast('Invalid participant code.'); return; }
        const evId = +parts[0], uid = +parts[1];
        if (evId !== id) { toast('This code is for a different event.'); return; }
        const x = await api('participant_activate', { event_id: evId, user_id: uid });
        if (x.ok) { $('ppActivateIn').value = ''; toast('Participant activated.'); load(); }
        else toast(x.error || 'Could not activate.');
    };
    $('ppActivateIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('ppActivate').click(); });

    let addSearchTimer = null;
    $('ppAdd').onclick = () => {
        const modal = RBModal(`<div>
            <div class="toolbar" style="margin:0 0 .8rem">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input class="field" id="ppAddSearch" data-i18n-ph="Search users…" placeholder="${esc(t('Search users…'))}" autocomplete="off">
            </div>
            <div id="ppAddResults"></div>
        </div>`, 'slim', () => { clearTimeout(addSearchTimer); });
        const search = (q) => {
            modal.q('#ppAddResults').innerHTML = `<p class="muted small">${esc(t('Search users…'))}</p>`;
            if (!q) return;
            api('user_search', { q }).then((r) => {
                if (!r.ok || !r.users) return;
                modal.q('#ppAddResults').innerHTML = r.users.length
                    ? r.users.map((u) => `<div class="ev-line"><span class="meta" style="cursor:pointer" data-pu="${u.id}" data-pun="${esc(u.username)}">
                        <b>${esc(u.username)}</b> <span class="muted small">${esc((u.first_name + ' ' + u.last_name).trim())} · ${esc(u.email)}</span></span></div>`).join('')
                    : `<p class="muted small">${esc(t('No matching users.'))}</p>`;
                modal.el.querySelectorAll('[data-pu]').forEach((el) => el.onclick = async () => {
                    const x = await api('event_participant_add', { event_id: id, user_id: +el.dataset.pu });
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
    $('ppExport').onclick = async () => {
        const cell = (v) => /[",\n]/.test(v = String(v ?? '')) ? '"' + v.replace(/"/g, '""') + '"' : v;
        const rows = [];
        for (let p = 1; ; p++) {
            const r = await api('event_participants_list', { event_id: id, q, page: p, per_page: 100 });
            if (!r.ok) return toast(r.error || 'Could not load.');
            rows.push(...r.participants);
            if (p * r.per_page >= r.total) break;
        }
        if (!rows.length) return toast(q ? 'No matching users.' : 'No participants yet.');
        const lines = ['first_name,last_name,email', ...rows.map((p) => [cell(p.first_name), cell(p.last_name), cell(p.email)].join(','))];
        // the file is named after the event (filesystem-hostile characters stripped)
        const name = (eventTitle || 'rdbk-participants').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
        RBDownload(new Blob([lines.join('\n')], { type: 'text/csv' }), name + '.csv');
    };

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
