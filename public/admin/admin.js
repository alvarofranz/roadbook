'use strict';
/* Admin panel: list users with disk usage, promote/demote, delete. Gated to admins
 * (the API enforces it too). Talks to /api (same-origin session). */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast, api = RBApi; // shared helpers (app.js / i18n.js)
    const fmtSize = RBFmtSize; // shared byte formatter (app.js)
    const PER = 25; // users per page
    let me = 0, allUsers = [], byId = {}, page = 1, query = '';

    function rowHtml(u) {
        const isMe = u.id === me;
        const badges = (u.is_admin ? `<span class="u-badge u-admin">admin</span> ` : '')
            + (u.is_organizer ? `<span class="u-badge u-organizer">${esc(t('organizer'))}</span> ` : '')
            + (u.blocked ? `<span class="u-badge u-blocked">${esc(t('blocked'))}</span> ` : '')
            + (u.mustchange ? `<span class="u-badge u-unverified">${esc(t('must change password'))}</span> ` : '')
            + (u.verified ? '' : `<span class="u-badge u-unverified">${esc(t('unverified'))}</span>`);
        // quick event-organizer toggle; the admin role moved into the Edit dialog. An admin
        // already runs every event, so the toggle only shows for non-admin users.
        const role = u.locked
            ? `<span class="u-badge u-admin" title="${esc(t('Configured in .env'))}">superuser</span>`
            : (u.is_admin ? '' : `<button class="btn btn-ghost" data-org="${u.id}" data-make="${u.is_organizer ? 0 : 1}">${esc(t(u.is_organizer ? 'Remove event organizer' : 'Make event organizer'))}</button>`);
        const activate = u.verified ? '' : `<button class="btn btn-ghost" data-verify="${u.id}">${esc(t('Activate'))}</button>`;
        const edit = `<button class="btn btn-ghost" data-edit="${u.id}">${esc(t('Edit'))}</button>`;
        const activity = `<button class="btn btn-ghost" data-activity="${u.id}">${esc(t('Activity'))}</button>`;
        const block = (u.locked || isMe) ? '' : `<button class="btn btn-ghost" data-block="${u.id}" data-on="${u.blocked ? 0 : 1}">${esc(t(u.blocked ? 'Unblock' : 'Block'))}</button>`;
        const del = (u.locked || isMe) ? '' : `<button class="btn btn-danger" data-del="${u.id}" data-name="${esc(u.username)}">${esc(t('Delete'))}</button>`;
        const roadbooks = `<button class="btn btn-ghost" data-rbs="${u.id}">${esc(t('Roadbooks'))} (${u.roadbooks})</button>`;
        return `<tr>
            <td><b>${esc(u.name || u.username)}</b> ${badges}<div class="u-handle">@${esc(u.username)} · ${esc(u.email)}${isMe ? ' · ' + esc(t('you')) : ''}</div></td>
            <td class="num">${fmtSize(u.bytes)}<div class="u-quota">/ ${fmtSize(u.quota)}</div></td>
            <td><div class="u-actions">${activate}${edit}${activity}${roadbooks}${role}${block}${del}</div></td>
        </tr>`;
    }

    // Edit a user's identity; optionally set a temporary password they must change at next login.
    function editUser(u) {
        const m = RBModal(`<h2>${esc(t('Edit user'))}</h2>
            <label class="field-label" for="euFirst">${esc(t('First name'))}</label>
            <input id="euFirst" class="field" autocomplete="off">
            <label class="field-label" for="euLast">${esc(t('Last name'))}</label>
            <input id="euLast" class="field" autocomplete="off">
            <label class="field-label" for="euUser">${esc(t('Username'))}</label>
            <input id="euUser" class="field" autocomplete="off">
            <label class="field-label" for="euEmail">${esc(t('Email'))}</label>
            <input id="euEmail" type="email" class="field" autocomplete="off">
            <label class="field-label" for="euOrg">${esc(t('Organization'))}</label>
            <input id="euOrg" class="field" autocomplete="off" maxlength="120">
            <label class="field-label" for="euPass">${esc(t('New password (optional)'))}</label>
            <input id="euPass" type="text" class="field" autocomplete="off" placeholder="${esc(t('Leave blank to keep current'))}">
            <p class="hint">${esc(t('If you set a password, the user must change it at next login.'))}</p>
            <label class="field-label" for="euQuota">${esc(t('Storage quota (MB)'))}</label>
            <input id="euQuota" type="number" min="0" step="1" class="field" autocomplete="off" placeholder="${esc(t('Default'))}">
            <p class="hint">${esc(t('Blank uses the default. Raise it for a trusted user.'))}</p>
            <label class="checkbox-row"><input type="checkbox" id="euOrganizer"> <span>${esc(t('Organizer'))}</span></label>
            <p class="hint">${esc(t('Can create and manage their own events.'))}</p>
            <label class="checkbox-row"><input type="checkbox" id="euAdmin"> <span>${esc(t('Admin'))}</span></label>
            <p class="hint">${esc(t('Full access to users, settings and every event.'))}</p>
            <div class="btnrow end"><button class="btn btn-ghost" data-cancel>${esc(t('Cancel'))}</button><button class="btn btn-primary" id="euSave">${esc(t('Save'))}</button></div>`, 'narrow', null, { dismissable: false });
        m.q('#euFirst').value = u.first_name || '';
        m.q('#euLast').value = u.last_name || '';
        m.q('#euUser').value = u.username || '';
        m.q('#euEmail').value = u.email || '';
        m.q('#euOrg').value = u.organization || '';
        m.q('#euQuota').value = u.quota_bytes != null ? Math.round(u.quota_bytes / 1048576) : '';
        m.q('#euOrganizer').checked = !!u.is_organizer;
        m.q('#euAdmin').checked = !!u.is_admin;
        m.q('#euAdmin').disabled = u.locked || u.id === me; // superuser (.env) and yourself can't be toggled
        m.q('[data-cancel]').onclick = m.close;
        m.q('#euSave').onclick = async () => {
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
            if (!x.ok) return toast(x.error || 'Could not save.');
            // the admin role rides admin_set_role (it owns the self/superuser guards)
            const wantAdmin = m.q('#euAdmin').checked ? 1 : 0;
            if (!m.q('#euAdmin').disabled && wantAdmin !== (u.is_admin ? 1 : 0)) {
                const r2 = await api('admin_set_role', { id: u.id, is_admin: wantAdmin });
                if (!r2.ok) { toast(r2.error || 'Could not save.'); load(); return; }
            }
            m.close(); load();
        };
    }

    // Read-only inspection (#86): a user's stats + recent activity timeline (IPs are anonymised).
    function viewActivity(u) {
        const m = RBModal(`<h2>${esc(t('Activity'))} · @${esc(u.username)}</h2>
            <div id="actBody" class="muted small">${esc(t('Loading…'))}</div>
            <div class="btnrow end"><button class="btn btn-ghost" data-cancel>${esc(t('Close'))}</button></div>`, 'wide');
        m.q('[data-cancel]').onclick = m.close;
        api('admin_activity', { id: u.id }).then((r) => {
            const body = m.q('#actBody');
            if (!r.ok) { body.textContent = r.error || t('Could not load.'); return; }
            const stats = `<p class="hint">${r.stats.roadbooks} ${esc(t('roadbooks'))} · ${fmtSize(r.stats.bytes)}</p>`;
            const rows = r.events.length
                ? r.events.map((e) => `<tr><td class="small">${esc(e.created_at)}</td><td>${esc(e.action.replace(/_/g, ' '))}</td><td class="muted small">${esc(e.detail || '')}</td><td class="muted small">${esc(e.ip || '')}</td></tr>`).join('')
                : `<tr><td colspan="4" class="muted small">${esc(t('No activity yet.'))}</td></tr>`;
            body.innerHTML = stats + `<table class="act-table"><tbody>${rows}</tbody></table>`;
        });
    }

    // A user's roadbooks (any status) with an admin status control + owner reassignment (#126).
    function viewRoadbooks(u) {
        const LABEL = { draft: 'Draft', ready: 'Ready', public: 'Public' };
        const m = RBModal(`<h2>${esc(t('Roadbooks'))} · @${esc(u.username)}</h2>
            <div id="rbsBody" class="muted small">${esc(t('Loading…'))}</div>
            <div class="btnrow end"><button class="btn btn-ghost" data-cancel>${esc(t('Close'))}</button></div>`, 'wide rb-list');
        m.q('[data-cancel]').onclick = m.close;
        const render = () => api('admin_user_roadbooks', { user_id: u.id }).then((r) => {
            const body = m.q('#rbsBody');
            if (!r.ok) { body.textContent = r.error || t('Could not load.'); return; }
            if (!r.roadbooks.length) { body.textContent = t('No roadbooks yet.'); return; }
            body.innerHTML = `<table class="act-table"><tbody>${r.roadbooks.map((rb) => `<tr>
                <td><b>${esc(rb.title)}</b><div class="u-handle">${esc(RBSummary(rb.total_distance, rb.note_count))}</div></td>
                <td><select class="rb-status rb-status-${rb.status}" data-st="${rb.id}" aria-label="${esc(t('Status'))}">${RB.ROADBOOK_STATUSES.map((s) => `<option value="${s}"${rb.status === s ? ' selected' : ''}>${esc(t(LABEL[s]))}</option>`).join('')}</select></td>
                <td><button class="btn btn-ghost" data-mv="${rb.id}" data-title="${esc(rb.title)}" title="${esc(t('Move'))}" aria-label="${esc(t('Move'))}"><i class="fa-solid fa-right-left"></i></button></td>
                <td>${rb.status === 'public' && rb.slug ? `<a class="btn btn-ghost" href="/challenge/${esc(rb.slug)}" target="_blank" rel="noopener" title="${esc(t('View'))}" aria-label="${esc(t('View'))}"><i class="fa-solid fa-eye"></i></a>` : ''}</td>
            </tr>`).join('')}</tbody></table>`;
            body.querySelectorAll('[data-st]').forEach((sel) => sel.onchange = async () => {
                const x = await api('admin_set_status', { id: +sel.dataset.st, status: sel.value });
                if (!x.ok) toast(x.error || 'Could not save.');
                render(); // re-render from server truth (also resets the select on error)
            });
            body.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => movePicker(b.dataset.mv, b.dataset.title));
        });
        // Reassign owner: a searchable user picker (the user base can be large) + confirm.
        const movePicker = (rbId, rbTitle) => {
            const m2 = RBModal(`<h2>${esc(t('Move'))} · ${esc(rbTitle)}</h2>
                <input id="mvSearch" class="field" type="search" placeholder="${esc(t('Search users…'))}" autocomplete="off">
                <div id="mvList" class="mv-list"></div>
                <div class="btnrow end"><button class="btn btn-ghost" data-cancel>${esc(t('Cancel'))}</button></div>`, 'narrow');
            m2.q('[data-cancel]').onclick = m2.close;
            const listEl = m2.q('#mvList');
            const draw = (q) => {
                const matches = ((window.RB && RB.filterByText) ? RB.filterByText(allUsers, q, ['username', 'name', 'email']) : allUsers)
                    .filter((au) => au.id !== u.id).slice(0, 50);
                listEl.innerHTML = matches.length
                    ? matches.map((au) => `<button class="mv-opt" data-pick="${au.id}" data-name="${esc(au.username)}"><b>@${esc(au.username)}</b> <span class="muted small">${esc(au.email)}</span></button>`).join('')
                    : `<p class="muted small">${esc(t('No matching users.'))}</p>`;
                listEl.querySelectorAll('[data-pick]').forEach((b) => b.onclick = async () => {
                    if (!(await RBConfirm(t('Move this roadbook to') + ' @' + b.dataset.name + '?', t('Move')))) return;
                    const x = await api('admin_move_roadbook', { id: +rbId, user_id: +b.dataset.pick });
                    toast(x.ok ? t('Roadbook moved.') : (x.error || 'Could not move.'));
                    m2.close(); render(); // the moved roadbook drops out of this user's list
                });
            };
            m2.q('#mvSearch').oninput = (e) => draw(e.target.value);
            draw('');
            setTimeout(() => m2.q('#mvSearch').focus(), 50);
        };
        render();
    }

    // Re-bind the per-row action buttons (called after every render of #usersBody). Each
    // mutating action re-fetches via load(); the current search + page are preserved.
    function wireRows() {
        const body = $('usersBody');
        body.querySelectorAll('[data-org]').forEach((b) => b.onclick = async () => {
            const x = await api('admin_set_role', { id: +b.dataset.org, is_organizer: +b.dataset.make });
            x.ok ? load() : toast(x.error || 'Could not save.');
        });
        body.querySelectorAll('[data-verify]').forEach((b) => b.onclick = async () => {
            const x = await api('admin_verify', { id: +b.dataset.verify });
            x.ok ? load() : toast(x.error || 'Could not save.');
        });
        body.querySelectorAll('[data-block]').forEach((b) => b.onclick = async () => {
            const x = await api('admin_block', { id: +b.dataset.block, blocked: +b.dataset.on });
            x.ok ? load() : toast(x.error || 'Could not save.');
        });
        body.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editUser(byId[+b.dataset.edit]));
        body.querySelectorAll('[data-activity]').forEach((b) => b.onclick = () => viewActivity(byId[+b.dataset.activity]));
        body.querySelectorAll('[data-rbs]').forEach((b) => b.onclick = () => viewRoadbooks(byId[+b.dataset.rbs]));
        body.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
            if (!(await RBConfirmDanger(t('Delete this user and all their data?') + ' (@' + b.dataset.name + ')', t('Delete')))) return;
            const x = await api('admin_delete', { id: +b.dataset.del });
            x.ok ? load() : toast(x.error || 'Could not delete.');
        });
    }

    // Filter (by username/email/name) → paginate (25/page) → draw the visible rows + pager.
    function render() {
        const filtered = (window.RB && RB.filterByText)
            ? RB.filterByText(allUsers, query, ['username', 'email', 'first_name', 'last_name', 'name'])
            : allUsers;
        const pages = Math.max(1, Math.ceil(filtered.length / PER));
        if (page > pages) page = pages;
        const slice = filtered.slice((page - 1) * PER, page * PER);
        $('usersBody').innerHTML = slice.length
            ? slice.map(rowHtml).join('')
            : `<tr><td colspan="3" class="muted">${esc(t('No matching users.'))}</td></tr>`;
        wireRows();
        RBPager($('usersPager'), page, pages, (p) => { page = p; render(); }, filtered.length ? `${filtered.length} ${esc(t('users'))}` : '');
    }

    async function load() {
        const eventId = +($('userEventFilter').value || 0);
        const r = await api('admin_users', eventId ? { event_id: eventId } : {});
        if (!r.ok) { $('adminMsg').hidden = false; $('usersBox').hidden = true; $('adminMsg').textContent = t(r.error || 'Admins only.'); return; }
        me = r.me;
        allUsers = r.users || [];
        byId = {}; allUsers.forEach((u) => byId[u.id] = u);
        $('adminMsg').hidden = true; $('usersBox').hidden = false;
        render(); // keeps the current search + page across reloads
    }

    // Event filter: narrow the list to one event's people (participants + organizers).
    async function loadEventFilter() {
        const r = await api('events_manage'); // an admin sees every event
        const sel = $('userEventFilter');
        sel.innerHTML = `<option value="">${esc(t('All events'))}</option>`
            + ((r.ok && r.events) || []).map((e) => `<option value="${e.id}">${esc(e.title)}</option>`).join('');
        sel.onchange = () => { page = 1; load(); };
    }

    async function init() {
        if (!(await RBRequireUser($('adminMsg'), { admin: true, account: '../account/' }))) return;
        $('userSearch').oninput = () => { query = $('userSearch').value; page = 1; render(); };
        loadEventFilter();
        load();
    }
    init();
})();
