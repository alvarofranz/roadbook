'use strict';
/* User management (#910): every user at a glance — who they are, their roadbooks, runs, disk and
 * last activity — sortable, searchable and filtered with one tap; a tap on a user opens their sheet,
 * where every action on them lives. Gated to admins (the API enforces it too). */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast, api = RBApi; // shared helpers (app.js / i18n.js)
    const fmtSize = RBFmtSize; // shared byte formatter (app.js)
    const PER = 25; // users per page
    let me = 0, meSuper = false, allUsers = [], byId = {}, query = '';
    // the quick filters (icons with a tooltip, #805): each one narrows the list, several combine
    const QUICK = {
        roadbooks: (u) => (u.roadbooks || 0) > 0,
        events: (u) => !!u.manages_events,
        unverified: (u) => !u.verified && !u.system,
        blocked: (u) => !!u.blocked,
        admins: (u) => !!u.is_admin,
    };
    const quick = new Set();
    // the sort: a column header toggles it; newest activity first by default
    let sortKey = 'last_active', sortDir = -1;
    const SORT = {
        name: (u) => (u.name || u.username || '').toLowerCase(),
        roadbooks: (u) => u.roadbooks || 0,
        runs: (u) => u.runs || 0,
        bytes: (u) => u.bytes || 0,
        last_active: (u) => u.last_active || '',
        created_at: (u) => u.created_at || '',
    };
    let everyone = null; // the unfiltered user list, fetched once for the pickers (the table may be filtered)
    async function allPickable() {
        if (!everyone) {
            const r = await api('admin_users');
            if (!r.ok) { toast(r.error || 'Could not load.'); return null; }
            everyone = r.users || [];
        }
        return everyone.filter((u) => !u.system); // never the deleted-user system account
    }

    // Who a user is: the badges, one style — and the actions the server accepts from this admin
    // (#702): nothing on the system account, and another admin is changed only by a superuser.
    function badgesHtml(u) {
        const badge = (cls, label, tip) => `<span class="u-badge ${cls}"${tip ? ` title="${esc(t(tip))}"` : ''}>${esc(t(label))}</span> `;
        return (u.system ? badge('u-unverified', 'System account', 'Keeps the roadbooks of deleted users. It never signs in.') : '')
            + (u.locked ? badge('u-admin', 'Superuser', 'Configured in .env') : (u.is_admin ? badge('u-admin', 'Admin') : ''))
            + (u.is_organizer ? badge('u-organizer', 'Organizer') : '')
            + (u.blocked ? badge('u-blocked', 'Blocked') : '')
            + (u.mustchange ? badge('u-unverified', 'Must change password') : '')
            + (u.verified || u.system ? '' : badge('u-unverified', 'Unverified'));
    }
    const canManage = (u) => !u.system && (u.id === me || !u.is_admin || meSuper);
    const avatarHtml = (u, cls) => `<img class="avatar ${cls}" src="${u.avatar ? esc(RBMediaSrc(u.avatar)) : '../assets/icon.svg'}" alt="" loading="lazy">`;
    // "today", "yesterday", or the date — when a user was last active
    function whenText(ts) {
        if (!ts) return t('Never');
        const day = String(ts).slice(0, 10), today = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
        return day === today ? t('Today') : day === yesterday ? t('Yesterday') : RBFmtDate(day);
    }
    const diskHtml = (u) => `<meter class="u-disk" min="0" max="${u.quota || 1}" value="${u.bytes || 0}" high="${(u.quota || 1) * 0.85}"></meter><div class="u-quota">${fmtSize(u.bytes)} / ${fmtSize(u.quota)}</div>`;
    // One row per user: who they are and their figures; the whole row opens the user's sheet
    function rowHtml(u) {
        return `<tr class="u-row" data-user="${u.id}" tabindex="0">
            <td><div class="u-who">${avatarHtml(u, 'avatar-xs')}<div class="u-id"><b>${esc(u.name || u.username)}</b> ${badgesHtml(u)}<div class="u-handle">@${esc(u.username)} · ${esc(u.email)}${u.id === me ? ' · ' + esc(t('you')) : ''}</div></div></div></td>
            <td class="num" data-label="${esc(t('Roadbooks'))}">${u.roadbooks || 0}</td>
            <td class="num" data-label="${esc(t('Runs'))}">${u.runs || 0}</td>
            <td class="u-disk-cell" data-label="${esc(t('Disk'))}">${diskHtml(u)}</td>
            <td class="u-when" data-label="${esc(t('Last active'))}">${esc(whenText(u.last_active))}</td>
            <td class="u-go"><i class="fa-solid fa-chevron-right"></i></td>
        </tr>`;
    }

    // The user's sheet: who they are, their figures, and every action on them in one place
    function openUser(u) {
        const manage = canManage(u), self = u.id === me;
        const action = (id, icon, label, cls = 'btn-ghost') => `<button class="btn ${cls}" type="button" data-act="${id}"><i class="fa-solid ${icon}"></i> ${esc(t(label))}</button>`;
        const acts = [
            manage ? action('edit', 'fa-pen', 'Edit') : '',
            action('roadbooks', 'fa-book', 'Roadbooks'),
            action('runs', 'fa-flag-checkered', 'Runs'),
            action('activity', 'fa-clock-rotate-left', 'Activity'),
            manage && !u.verified ? action('verify', 'fa-circle-check', 'Activate') : '',
            manage && !u.locked && !self ? action('block', u.blocked ? 'fa-lock-open' : 'fa-ban', u.blocked ? 'Unblock' : 'Block') : '',
        ].join('');
        const figure = (label, value) => `<div class="stat"><b>${value}</b><span>${esc(t(label))}</span></div>`;
        const m = RBModal(`<div class="u-sheet-head">${avatarHtml(u, 'avatar-sm')}<div class="u-id"><h2>${esc(u.name || u.username)}</h2>
                <div class="u-handle">@${esc(u.username)} · ${esc(u.email)}${u.organization ? ' · ' + esc(u.organization) : ''}</div><div>${badgesHtml(u)}</div></div></div>
            <div class="stat-grid u-sheet-stats">
                ${figure('Roadbooks', u.roadbooks || 0)}${figure('Runs', u.runs || 0)}
                ${figure('Disk', `${fmtSize(u.bytes)}<small>/ ${fmtSize(u.quota)}</small>`)}
            </div>
            <p class="muted small u-sheet-dates"><i class="fa-regular fa-calendar"></i> ${esc(t('Joined'))} ${esc(RBFmtDate(String(u.created_at).slice(0, 10)))} · <i class="fa-regular fa-clock"></i> ${esc(t('Last active'))}: ${esc(whenText(u.last_active))}</p>
            ${u.location ? '<div class="u-sheet-map" id="uSheetMap"></div>' : ''}
            <div class="u-sheet-actions">${acts}</div>
            ${manage && !u.locked && !self ? `<div class="btnrow start u-sheet-foot">${action('delete', 'fa-trash-can', 'Delete user', 'btn-danger')}</div>` : ''}`, 'wide u-sheet');
        // where they usually ride (their default location), when they gave one — no location, no map
        if (u.location && window.maplibregl) {
            const at = [u.location.lon, u.location.lat], sheetMap = new RBMap('uSheetMap', { zoom: 10, center: at });
            const pin = () => new maplibregl.Marker({ color: RBCssVar('--info') }).setLngLat(at).addTo(sheetMap.map);
            if (sheetMap.map) { if (sheetMap.ready) pin(); else sheetMap.map.on('load', pin); }
        }
        const on = (id, fn) => { const b = m.q(`[data-act="${id}"]`); if (b) b.onclick = () => fn(b); };
        on('edit', () => { m.close(); editUser(u); });
        on('roadbooks', () => { m.close(); viewRoadbooks(u); });
        on('runs', () => { m.close(); viewRuns(u); });
        on('activity', () => { m.close(); RBActivityLog({ user: u }); }); // the one activity viewer (#665)
        on('verify', async (b) => {
            const busy = RBBusy(b);
            const x = await api('admin_verify', { id: u.id });
            if (!x.ok) { busy.reset(); return toast(x.error || 'Could not save.'); }
            m.close(); load();
        });
        on('block', async (b) => {
            if (!u.blocked && !(await RBConfirmDanger(t('Block') + ' @' + esc(u.username) + '?'))) return;
            const busy = RBBusy(b);
            const x = await api('admin_block', { id: u.id, blocked: u.blocked ? 0 : 1 });
            if (!x.ok) { busy.reset(); return toast(x.error || 'Could not save.'); }
            m.close(); load();
        });
        on('delete', async (b) => {
            if (!(await RBConfirmDanger(t('Delete this user and all their data?') + ' (@' + esc(u.username) + ')'))) return;
            const busy = RBBusy(b);
            const x = await api('admin_delete', { id: u.id });
            if (!x.ok) { busy.reset(); return toast(x.error || 'Could not delete.'); }
            m.close(); load();
        });
    }

    // Edit a user's identity; optionally set a temporary password they must change at next login.
    // Two-column layout for the form fields (#244).
    function editUser(u) {
        const m = RBModal(`<h2>${esc(t('Edit user'))}</h2>
            <div class="row2">
                <div><label class="field-label" for="euFirst">${esc(t('First name'))}</label>
                <input id="euFirst" class="field" autocomplete="off"></div>
                <div><label class="field-label" for="euLast">${esc(t('Last name'))}</label>
                <input id="euLast" class="field" autocomplete="off"></div>
            </div>
            <div class="row2">
                <div><label class="field-label" for="euUser">${esc(t('Username'))}</label>
                <input id="euUser" class="field" autocomplete="off"></div>
                <div><label class="field-label" for="euEmail">${esc(t('Email'))}</label>
                <input id="euEmail" type="email" class="field" autocomplete="off"></div>
            </div>
            <label class="field-label" for="euOrg">${esc(t('Organization'))}</label>
            <input id="euOrg" class="field" autocomplete="off" maxlength="120" list="euOrgSuggest">
            <datalist id="euOrgSuggest"></datalist>
            <div class="row2">
                <div><label class="field-label" for="euPass">${esc(t('New password (optional)'))}</label>
                <input id="euPass" type="text" class="field" autocomplete="off" placeholder="${esc(t('Leave blank to keep current'))}">
                <p class="hint">${esc(t('If you set a password, the user must change it at next login.'))}</p></div>
                <div><label class="field-label" for="euQuota">${esc(t('Storage quota (MB)'))}</label>
                <input id="euQuota" type="number" min="0" step="1" class="field" autocomplete="off" placeholder="${esc(t('Default'))}">
                <p class="hint">${esc(t('Blank uses the default. Raise it for a trusted user.'))}</p></div>
            </div>
            <label class="checkbox-row"><input type="checkbox" id="euOrganizer"> <span>${esc(t('Organizer'))}</span></label>
            <p class="hint">${esc(t('Can create and manage their own events.'))}</p>
            <label class="checkbox-row"><input type="checkbox" id="euAdmin"> <span>${esc(t('Admin'))}</span></label>
            <p class="hint">${esc(t('Full access to users, settings and every event.'))}</p>
            <span class="field-label">${esc(t('Default map location'))}</span>
            ${u.location ? '<div id="euLocMap" class="loc-picker-map"></div>' : `<p class="muted small">${esc(t('Not set'))}</p>`}
            <div class="btnrow end"><button class="btn btn-primary" id="euSave">${esc(t('Save'))}</button></div>`, 'wide', null, { dismissable: false, corner: true }); // a form: left from its corner, never by a stray tap
        m.q('#euFirst').value = u.first_name || '';
        m.q('#euLast').value = u.last_name || '';
        m.q('#euUser').value = u.username || '';
        m.q('#euEmail').value = u.email || '';
        m.q('#euOrg').value = u.organization || '';
        RBOrgDatalist(m.q('#euOrgSuggest'));
        m.q('#euQuota').value = u.quota_bytes != null ? Math.round(u.quota_bytes / 1048576) : '';
        m.q('#euOrganizer').checked = !!u.is_organizer;
        m.q('#euAdmin').checked = !!u.is_admin;
        m.q('#euAdmin').disabled = u.locked || u.id === me;
        // where the user's maps start (#939): the location they set in their profile, shown, not edited
        if (u.location && window.maplibregl) {
            const map = new RBMap('euLocMap', { style: RBMap.STYLE_TOPO, zoom: 11, center: [u.location.lon, u.location.lat] });
            if (map.map) new maplibregl.Marker({ color: RBCssVar('--sand') }).setLngLat([u.location.lon, u.location.lat]).addTo(map.map);
        }
        m.q('#euSave').onclick = async () => {
            const busy = RBBusy(m.q('#euSave'));
            const x = await api('admin_update', {
                id: u.id,
                first_name: m.q('#euFirst').value.trim(),
                last_name: m.q('#euLast').value.trim(),
                username: m.q('#euUser').value.trim(),
                email: m.q('#euEmail').value.trim(),
                organization: m.q('#euOrg').value.trim(),
                password: m.q('#euPass').value,
                quota_bytes: m.q('#euQuota').value.trim() === '' ? '' : Math.max(0, Math.round(parseFloat(m.q('#euQuota').value) * 1048576)),
                is_organizer: m.q('#euOrganizer').checked ? 1 : 0,
            });
            if (!x.ok) { busy.reset(); return toast(x.error || 'Could not save.'); }
            const wantAdmin = m.q('#euAdmin').checked ? 1 : 0;
            if (!m.q('#euAdmin').disabled && wantAdmin !== (u.is_admin ? 1 : 0)) {
                const r2 = await api('admin_set_role', { id: u.id, is_admin: wantAdmin });
                if (!r2.ok) { busy.reset(); toast(r2.error || 'Could not save.'); load(); return; }
            }
            busy.ok(); m.close(); load();
        };
    }

    // A user's runs, as only an admin sees them (#870): the device each one was made on, public or private
    async function viewRuns(u) {
        const m = RBModal(`<h2>${esc(t('Runs'))} · @${esc(u.username)}</h2><div id="runsBody" class="muted small">${esc(t('Loading…'))}</div>`, 'wide');
        const r = await api('admin_user_runs', { user_id: u.id });
        const box = m.q('#runsBody');
        if (!r.ok) { box.textContent = t(r.error || 'Could not load.'); return; }
        if (!r.runs.length) { box.textContent = t('No runs yet.'); return; }
        box.classList.remove('muted', 'small');
        // the activity log's compact table: it fits the dialog (the users table is 700 px wide) and
        // scrolls inside itself on a phone, keeping its column heads
        box.innerHTML = `<table class="act-table"><thead><tr>
                <th>${esc(t('Date'))}</th><th>${esc(t('Roadbook'))}</th><th class="num">${esc(t('Notes'))}</th><th>${esc(t('Device'))}</th></tr></thead><tbody>
            ${r.runs.map((x) => `<tr>
                <td class="small">${esc(RBFmtDateTime(x.ended_at))}</td>
                <td class="cell-wrap"><b>${esc(x.title)}</b><div class="u-handle">${esc(RBKm(x.distance_m, 1))}${x.completed ? '' : ' · ' + esc(t('Not finished'))}${x.is_public ? '' : ' · <i class="fa-solid fa-lock"></i> ' + esc(t('Private'))}${x.mode === 'competition' ? ' · ' + esc(t('Competition')) : ''}</div></td>
                <td class="num">${x.notes_reached}/${x.notes_total}</td>
                <td class="small cell-wrap">${esc(x.device || '—')}</td>
            </tr>`).join('')}</tbody></table>`;
    }
    // A user's roadbooks (any status) with an admin status control, owner reassignment (#126),
    // a per-row view in the Reader (admin-authenticated, works for draft/ready/public) and a
    // .rdbk export (media-less, like the Editor without "Include photos & audio").
    // Pagination + search (#244).
    function viewRoadbooks(u) {
        let rbMap = null, previewId = 0, changed = false; // a change refreshes the user list's count on close (#705)
        const finish = () => { if (rbMap) { rbMap.destroy(); rbMap = null; } if (changed) load(); };
        const m = RBModal(`<h2>${esc(t('Roadbooks'))} \u00b7 @${esc(u.username)}</h2>
            <div class="rb-split">
            <div class="rb-split-list">
            <div class="rb-toolbar"><i class="fa-solid fa-magnifying-glass"></i><input type="search" class="rb-search" id="rbsSearch" placeholder="${esc(t('Search roadbooks\u2026'))}" autocomplete="off" spellcheck="false" aria-label="${esc(t('Search roadbooks\u2026'))}"></div>
            <div id="rbsBody" class="muted small">${esc(t('Loading\u2026'))}</div>
            <div id="rbsPager" class="pager"></div>
            </div>
            <div class="rb-map-pane"><div id="rbsMap"><p class="muted small">${esc(t('Select a roadbook to preview it on the map.'))}</p></div><p id="rbsMapTitle" class="muted small"></p></div>
            </div>`, 'wide rb-list-map', finish);
        let rbPage = 1, rbQuery = '', rbSeq = 0; // only the latest request paints: a slow answer to an older search is dropped
        const render = () => { const seq = ++rbSeq; return api('admin_user_roadbooks', { user_id: u.id, page: rbPage, q: rbQuery }).then((r) => {
            if (seq !== rbSeq) return;
            const body = m.q('#rbsBody');
            if (!r.ok) { body.textContent = t(r.error || 'Could not load.'); return; }
            if (!r.roadbooks.length) { body.textContent = t('No roadbooks yet.'); return; }
            body.innerHTML = `<table class="act-table"><tbody>${r.roadbooks.map((rb) => `<tr data-row="${rb.id}">
                <td><button class="btn btn-ghost" data-view="${rb.id}" data-title="${esc(rb.title)}" title="${esc(t('View on map'))}"><b>${esc(rb.title)}</b></button><div class="u-handle">${esc(RBSummary(rb.total_distance, rb.note_count))}</div></td>
                <td>${RBStatusSelectHTML(rb, 'data-st')}</td>
                <td><button class="btn btn-ghost" data-mv="${rb.id}" data-title="${esc(rb.title)}" title="${esc(t('Move'))}" aria-label="${esc(t('Move'))}"><i class="fa-solid fa-right-left"></i></button></td>
                <td><button class="btn btn-ghost" data-trash="${rb.id}" data-title="${esc(rb.title)}" title="${esc(t('Move to trash'))}" aria-label="${esc(t('Move to trash'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button></td>
                <td><a class="btn btn-ghost" href="/reader/?admin_rb=${rb.id}" target="_blank" rel="noopener" title="${esc(t('Open in Reader'))}" aria-label="${esc(t('Open in Reader'))}"><i class="fa-solid fa-compass"></i></a></td>
                <td><button class="btn btn-ghost" data-rbexp="${rb.id}" title="${esc(t('Export'))}" aria-label="${esc(t('Export'))}"><i class="fa-solid fa-file-export"></i></button></td>
            </tr>`).join('')}</tbody></table>`;
            body.querySelectorAll('[data-view]').forEach((b) => b.onclick = (e) => { e.preventDefault(); preview(+b.dataset.view, b.dataset.title || ''); });
            body.querySelectorAll('[data-st]').forEach((sel) => sel.onchange = async () => {
                sel.disabled = true;
                const x = await api('admin_set_status', { id: +sel.dataset.st, status: sel.value });
                sel.disabled = false;
                if (!x.ok) toast(x.error || 'Could not save.'); else changed = true;
                render();
            });
            body.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => movePicker(b.dataset.mv, b.dataset.title));
            body.querySelectorAll('[data-trash]').forEach((b) => b.onclick = async () => {
                if (!(await RBConfirmTrash(b.dataset.title))) return;
                const busy = RBBusy(b); // the re-render below is the success feedback
                const x = await api('admin_rb_trash', { id: +b.dataset.trash });
                busy.reset();
                if (!x.ok) toast(x.error || 'Could not delete.'); else changed = true;
                render();
            });
            body.querySelectorAll('[data-rbexp]').forEach((b) => b.onclick = async () => {
                const busy = RBBusy(b); // no double clicks while the payload is fetched and zipped
                try {
                    const j = await api('admin_rb_get', { id: +b.dataset.rbexp });
                    if (!j.ok || !j.roadbook) { busy.reset(); return toast(j.error || 'Could not export.'); }
                    const d = new Date(), p = RB.pad2;
                    const base = RB.slug((j.roadbook.meta && j.roadbook.meta.title) || j.title)
                        + '_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
                    await RBDownload(await RBZip.write({ 'roadbook.json': JSON.stringify(RB.roadbookForExport(j.roadbook)) }), base + '.rdbk');
                    busy.ok();
                } catch (e) { busy.reset(); toast('Could not export.'); }
            });
            const pages = Math.max(1, Math.ceil((r.total || 0) / (r.per_page || 25)));
            RBPager(m.q('#rbsPager'), rbPage, pages, (p) => { rbPage = p; render(); });
        }); };
        // In-popup route preview (#552): the roadbook opens on the map beside the
        // list, inside the same dialog — no new tab. Rows stay mounted so paging,
        // search and the admin actions keep working.
        const preview = async (id, title) => {
            const body = m.q('#rbsBody');
            body.querySelectorAll('tr').forEach((tr) => tr.classList.toggle('rb-row-sel', +tr.dataset.row === id));
            const mapBox = m.q('#rbsMap'), mapTitle = m.q('#rbsMapTitle');
            if (mapTitle) mapTitle.textContent = title || '';
            if (!window.maplibregl || !window.RBMap) { if (mapBox) mapBox.innerHTML = `<p class="muted small">${esc(t('Map not configured.'))}</p>`; return; }
            const my = ++previewId;
            if (mapBox && !rbMap) {
                mapBox.innerHTML = '';
                rbMap = new RBMap(mapBox.id, { style: RBMap.STYLE_TOPO, layerToggle: true, geolocate: false });
            }
            if (mapTitle) mapTitle.textContent = `${t('Loading…')} ${title || ''}`.trim();
            let j = null;
            try { j = await api('admin_rb_get', { id }); } catch (e) { j = null; }
            if (my !== previewId) return; // a newer preview won the race
            if (!j || !j.ok || !j.roadbook) { if (mapTitle) mapTitle.textContent = (j && j.error) || t('Could not load.'); return; }
            const rb = j.roadbook;
            if (!rb.track || !rb.track.length) { if (mapTitle) mapTitle.textContent = `${title || ''} — ${t('No route yet.')}`.trim(); return; }
            rbMap.showRoadbook(rb);
            if (rbMap.map) setTimeout(() => rbMap.map.resize(), 50); // the dialog just laid out: force the GL canvas to its box
            if (mapTitle) mapTitle.textContent = `${title || ''} · ${RBSummary(rb.meta.total_distance || 0, rb.notes.length)}`; // the payload's distance lives in meta
        };
        m.q('#rbsSearch').oninput = RBDebounce((e) => { rbQuery = e.target.value; rbPage = 1; render(); });
        // Reassign owner: a searchable user picker (the user base can be large) + confirm.
        const movePicker = async (rbId, rbTitle) => {
            const users = await allPickable(); // everyone, not just the users the table is filtered to (#705)
            if (!users) return;
            RBRowPicker({
                title: 'Move', icon: 'fa-right-left', card: 'narrow', lead: rbTitle,
                items: users.filter((au) => au.id !== u.id),
                fields: ['username', 'name', 'email'], limit: 50, empty: 'No users yet.',
                rowHTML: (au, i) => `<button class="mv-opt" data-pick="${i}"><b>@${esc(au.username)}</b> <span class="muted small">${esc(au.email)}</span></button>`,
                onPick: async (au, modal) => {
                    if (!(await RBConfirm(t('Move this roadbook to') + ' @' + esc(au.username) + '?'))) return;
                    modal.close();
                    const x = await api('admin_move_roadbook', { id: +rbId, user_id: +au.id });
                    toast(x.ok ? t('Roadbook moved.') : (x.error || 'Could not move.'));
                    if (x.ok) changed = true;
                    render();
                },
            });
        };
        render();
    }

    // A tap — or Enter — on a row opens that user's sheet
    function wireRows() {
        $('usersBody').querySelectorAll('[data-user]').forEach((row) => {
            row.onclick = () => openUser(byId[+row.dataset.user]);
            row.onkeydown = (e) => { if (e.key === 'Enter') openUser(byId[+row.dataset.user]); };
        });
    }
    // the summary over the table: how many, and what needs a look
    function renderSummary() {
        const n = (f) => allUsers.filter(f).length;
        const part = (count, label) => (count ? ` · <b>${count}</b> ${esc(t(label))}` : '');
        $('usersSummary').innerHTML = `<b>${allUsers.filter((u) => !u.system).length}</b> ${esc(t('users'))}`
            + part(n(QUICK.unverified), 'unverified') + part(n(QUICK.blocked), 'blocked') + part(n(QUICK.admins), 'admins');
    }
    function syncSortHeads() {
        document.querySelectorAll('.users-table th[data-sort]').forEach((th) => {
            const on = th.dataset.sort === sortKey;
            th.classList.toggle('sorted', on);
            th.setAttribute('aria-sort', on ? (sortDir > 0 ? 'ascending' : 'descending') : 'none');
        });
    }

    // Filter (by username/email/name) → quick toggles → the shared paged list (#664).
    const list = RBPagedList({
        pager: $('usersPager'), per: PER, source: () => allUsers,
        filter: (items) => {
            let filtered = RB.filterByText(items, query, ['username', 'email', 'first_name', 'last_name', 'name', 'organization']);
            for (const key of quick) filtered = filtered.filter(QUICK[key]);
            const val = SORT[sortKey];
            return filtered.slice().sort((a, b) => { const x = val(a), y = val(b); return x < y ? -sortDir : x > y ? sortDir : 0; });
        },
        draw: (slice) => {
            $('usersBody').innerHTML = slice.length
                ? slice.map(rowHtml).join('')
                : `<tr><td colspan="6" class="muted">${esc(t('Nothing matches that search.'))}</td></tr>`;
            wireRows();
        },
        label: (n) => (n ? `${n} ${esc(t('users'))}` : ''),
    });
    const render = () => list.render();

    let loadSeq = 0; // only the latest request paints: a slow answer to an older filter is dropped
    async function load() {
        const seq = ++loadSeq;
        const eventId = +($('userEventFilter').value || 0);
        const params = {};
        if (eventId) params.event_id = eventId;
        const org = ($('userOrgFilter').value || '').trim();
        if (org) params.organization = org;
        const r = await api('admin_users', params);
        if (seq !== loadSeq) return;
        if (!r.ok) { $('adminMsg').hidden = false; $('usersBox').hidden = true; $('adminMsg').textContent = t(r.error || 'Admins only.'); return; }
        me = r.me; meSuper = !!r.me_super;
        allUsers = r.users || []; everyone = null; // the next picker re-reads the full list
        byId = {}; allUsers.forEach((u) => byId[u.id] = u);
        $('adminMsg').hidden = true; $('usersBox').hidden = false; $('usersHeadActions').hidden = false;
        renderSummary(); render();
    }

    // Event filter: narrow the list to one event's people (participants + organizers).
    async function loadEventFilter() {
        const r = await api('events_manage');
        const sel = $('userEventFilter');
        const events = ((r.ok && r.events) || []).slice().sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));
        sel.innerHTML = `<option value="">${esc(t('All events'))}</option>`
            + events.map((e) => `<option value="${e.id}">${esc(e.title)}</option>`).join('');
        sel.onchange = () => { list.reset(); load(); };
    }

    // Create a user directly (#242). The account is born verified with a temporary
    // password — the user replaces it at the first sign-in.
    function createUser() {
        const m = RBModal(`<h2>${esc(t('Create user'))}</h2>
            <label class="field-label" for="cuFirst">${esc(t('First name'))}</label>
            <input id="cuFirst" class="field" autocomplete="off">
            <label class="field-label" for="cuLast">${esc(t('Last name'))}</label>
            <input id="cuLast" class="field" autocomplete="off">
            <label class="field-label" for="cuUser">${esc(t('Username'))}</label>
            <input id="cuUser" class="field" autocomplete="off">
            <label class="field-label" for="cuEmail">${esc(t('Email'))}</label>
            <input id="cuEmail" type="email" class="field" autocomplete="off">
            <label class="field-label" for="cuOrg">${esc(t('Organization'))}</label>
            <input id="cuOrg" class="field" autocomplete="off" maxlength="120" list="cuOrgSuggest">
            <datalist id="cuOrgSuggest"></datalist>
            <label class="field-label" for="cuPass">${esc(t('Password'))}</label>
            <input id="cuPass" type="text" class="field" autocomplete="off" placeholder="${esc(t('Temporary password'))}">
            <p class="hint">${esc(t('The user must change this at first login.'))}</p>
            <div class="btnrow end"><button class="btn btn-primary" id="cuSave">${esc(t('Create'))}</button></div>`, 'narrow', null, { dismissable: false, corner: true }); // a form: left from its corner, never by a stray tap
        RBOrgDatalist(m.q('#cuOrgSuggest'));
        m.q('#cuSave').onclick = async () => {
            const first = m.q('#cuFirst').value.trim();
            const last = m.q('#cuLast').value.trim();
            const username = m.q('#cuUser').value.trim();
            const email = m.q('#cuEmail').value.trim();
            const pass = m.q('#cuPass').value;
            if (!first || !last || !username || !email || !pass) { toast(t('All fields are required.')); return; }
            const busy = RBBusy(m.q('#cuSave'));
            const x = await api('admin_create', { first_name: first, last_name: last, username, email, organization: m.q('#cuOrg').value.trim(), password: pass }); // the club typed is kept (#663)
            if (!x.ok) { busy.reset(); return toast(x.error || t('Could not create user.')); }
            busy.ok(); m.close();
            load();
        };
        setTimeout(() => m.q('#cuFirst').focus(), 50);
    }

    async function init() {
        if (!(await RBRequireUser($('adminMsg'), { admin: true }))) return;
        $('userSearch').oninput = () => { query = $('userSearch').value; list.reset(); };
        document.querySelectorAll('[data-quick]').forEach((b) => b.onclick = () => {
            const key = b.dataset.quick, on = !quick.has(key);
            if (on) quick.add(key); else quick.delete(key);
            b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
            list.reset();
        });
        document.querySelectorAll('.users-table th[data-sort]').forEach((th) => th.onclick = () => {
            if (sortKey === th.dataset.sort) sortDir = -sortDir; else { sortKey = th.dataset.sort; sortDir = th.dataset.sort === 'name' ? 1 : -1; }
            syncSortHeads(); list.reset();
        });
        syncSortHeads();
        $('userCreate').onclick = createUser;
        // the organization filter asks the server: debounced, not a call per keystroke (#664)
        $('userOrgFilter').oninput = RBDebounce(() => { list.reset(); load(); });
        loadEventFilter();
        load().then(() => {
            // deep link from the locations map (#499): open the user's sheet directly
            const deepId = +(new URLSearchParams(location.search).get('user') || 0);
            if (deepId && byId[deepId]) openUser(byId[deepId]);
        });
    }
    init();
})();
