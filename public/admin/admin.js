'use strict';
/* Admin panel: list users with disk usage, promote/demote, delete. Gated to admins
 * (the API enforces it too). Talks to /api (same-origin session). */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast, api = RBApi; // shared helpers (app.js / i18n.js)
    const fmtSize = (b) => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
    let me = 0;

    function rowHtml(u) {
        const isMe = u.id === me;
        const badges = (u.is_admin ? `<span class="u-badge u-admin">admin</span> ` : '')
            + (u.blocked ? `<span class="u-badge u-blocked">${esc(t('blocked'))}</span> ` : '')
            + (u.mustchange ? `<span class="u-badge u-unverified">${esc(t('must change password'))}</span> ` : '')
            + (u.verified ? '' : `<span class="u-badge u-unverified">${esc(t('unverified'))}</span>`);
        const role = u.locked
            ? `<span class="u-badge u-admin" title="${esc(t('Configured in .env'))}">superuser</span>`
            : (isMe ? '' : `<button class="btn btn-ghost" data-role="${u.id}" data-make="${u.is_admin ? 0 : 1}">${esc(t(u.is_admin ? 'Remove admin' : 'Make admin'))}</button>`);
        const activate = u.verified ? '' : `<button class="btn btn-ghost" data-verify="${u.id}">${esc(t('Activate'))}</button>`;
        const edit = `<button class="btn btn-ghost" data-edit="${u.id}">${esc(t('Edit'))}</button>`;
        const block = (u.locked || isMe) ? '' : `<button class="btn btn-ghost" data-block="${u.id}" data-on="${u.blocked ? 0 : 1}">${esc(t(u.blocked ? 'Unblock' : 'Block'))}</button>`;
        const del = (u.locked || isMe) ? '' : `<button class="btn btn-danger" data-del="${u.id}" data-name="${esc(u.username)}">${esc(t('Delete'))}</button>`;
        return `<tr>
            <td><b>${esc(u.name || u.username)}</b> ${badges}<div class="u-handle">@${esc(u.username)}${isMe ? ' · ' + esc(t('you')) : ''}</div></td>
            <td>${esc(u.email)}</td>
            <td class="num">${u.roadbooks}</td>
            <td class="num">${fmtSize(u.bytes)}</td>
            <td><div class="u-actions">${activate}${edit}${role}${block}${del}</div></td>
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
            <label class="field-label" for="euPass">${esc(t('New password (optional)'))}</label>
            <input id="euPass" type="text" class="field" autocomplete="off" placeholder="${esc(t('Leave blank to keep current'))}">
            <p class="hint">${esc(t('If you set a password, the user must change it at next login.'))}</p>
            <div class="btnrow end"><button class="btn btn-ghost" data-cancel>${esc(t('Cancel'))}</button><button class="btn btn-primary" id="euSave">${esc(t('Save'))}</button></div>`, 'narrow');
        m.q('#euFirst').value = u.first_name || '';
        m.q('#euLast').value = u.last_name || '';
        m.q('#euUser').value = u.username || '';
        m.q('#euEmail').value = u.email || '';
        m.q('[data-cancel]').onclick = m.close;
        m.q('#euSave').onclick = async () => {
            const x = await api('admin_update', {
                id: u.id,
                first_name: m.q('#euFirst').value.trim(),
                last_name: m.q('#euLast').value.trim(),
                username: m.q('#euUser').value.trim(),
                email: m.q('#euEmail').value.trim(),
                password: m.q('#euPass').value,
            });
            if (x.ok) { m.close(); load(); } else toast(x.error || 'Could not save.');
        };
    }

    async function load() {
        const r = await api('admin_users');
        if (!r.ok) { $('adminMsg').hidden = false; $('usersBox').hidden = true; $('adminMsg').textContent = t(r.error || 'Admins only.'); return; }
        me = r.me;
        const byId = {};
        r.users.forEach((u) => byId[u.id] = u);
        $('adminMsg').hidden = true; $('usersBox').hidden = false;
        $('usersBody').innerHTML = r.users.map(rowHtml).join('');
        $('usersBody').querySelectorAll('[data-role]').forEach((b) => b.onclick = async () => {
            const x = await api('admin_set_role', { id: +b.dataset.role, is_admin: +b.dataset.make });
            x.ok ? load() : toast(x.error || 'Could not save.');
        });
        $('usersBody').querySelectorAll('[data-verify]').forEach((b) => b.onclick = async () => {
            const x = await api('admin_verify', { id: +b.dataset.verify });
            x.ok ? load() : toast(x.error || 'Could not save.');
        });
        $('usersBody').querySelectorAll('[data-block]').forEach((b) => b.onclick = async () => {
            const x = await api('admin_block', { id: +b.dataset.block, blocked: +b.dataset.on });
            x.ok ? load() : toast(x.error || 'Could not save.');
        });
        $('usersBody').querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editUser(byId[+b.dataset.edit]));
        $('usersBody').querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
            if (!(await RBConfirm(t('Delete this user and all their data?') + ' (@' + b.dataset.name + ')', t('Delete')))) return;
            const x = await api('admin_delete', { id: +b.dataset.del });
            x.ok ? load() : toast(x.error || 'Could not delete.');
        });
    }

    async function init() {
        const cfg = await api('config');
        if (!cfg.user) { $('adminMsg').innerHTML = `${esc(t('Sign in to continue.'))} <a href="../account/">${esc(t('Sign in'))}</a>`; return; }
        if (!cfg.user.is_admin) { $('adminMsg').textContent = t('Admins only.'); return; }
        load();
    }
    init();
})();
