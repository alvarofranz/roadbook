'use strict';
/* Admin · Roadbook trash (#187). Lists every soft-deleted roadbook (any owner) and lets an admin
 * restore it (→ draft) or delete it permanently now. Deleted roadbooks are auto-purged after the
 * retention window by the cron. Gated to admins. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast;
    const km = (m) => (m / 1000).toFixed(1) + ' km';

    async function load() {
        const r = await RBApi('admin_trash_list');
        if (!r.ok) { $('adminMsg').hidden = false; $('adminMsg').textContent = t(r.error || 'Could not load the trash.'); return; }
        render(r.roadbooks, r.trash_days || 30);
    }

    function render(list, days) {
        const box = $('trashList');
        $('adminMsg').hidden = true; box.hidden = false;
        if (!list.length) { box.innerHTML = `<p class="muted">${esc(t('The trash is empty.'))}</p>`; return; }
        box.innerHTML = `<p class="muted small">${esc(t('Deleted roadbooks are kept for a while, then permanently removed.'))}</p>`
            + '<div class="trash-rows">' + list.map(rowHtml).join('') + '</div>';
        list.forEach((rb) => {
            box.querySelector(`[data-restore="${rb.id}"]`).onclick = () => restore(rb);
            box.querySelector(`[data-purge="${rb.id}"]`).onclick = () => purge(rb);
        });
    }

    function rowHtml(rb) {
        const title = rb.title || t('Untitled');
        return `<div class="trash-row">
            <div class="trash-meta">
                <div class="trash-title">${esc(title)}</div>
                <div class="muted small">${esc(rb.username)} · ${km(rb.total_distance)} · ${rb.note_count} ${esc(t('notes'))}
                    · <span class="trash-left">${rb.days_left} ${esc(t('days left'))}</span></div>
            </div>
            <div class="btnrow end">
                <button class="btn btn-ghost" data-restore="${rb.id}"><i class="fa-solid fa-rotate-left"></i> ${esc(t('Restore'))}</button>
                <button class="btn btn-danger" data-purge="${rb.id}"><i class="fa-solid fa-trash"></i> ${esc(t('Delete now'))}</button>
            </div>
        </div>`;
    }

    async function restore(rb) {
        // A graveyard roadbook (its "owner" is the deleted-user account, which can never log
        // in) must be handed to a REAL user right away: restoring asks who gets it, then
        // restores + reassigns in one flow (#234).
        if (rb.graveyard) return restoreToUser(rb);
        const r = await RBApi('admin_rb_restore', { id: rb.id });
        if (!r.ok) return toast(r.error || 'Error');
        toast(t('Restored as a draft.')); load();
    }

    let allUsers = null; // lazy: fetched on the first graveyard restore
    async function restoreToUser(rb) {
        if (!allUsers) { const u = await RBApi('admin_users'); allUsers = (u.ok && u.users) || []; }
        const title = rb.title || t('Untitled');
        const d = RBModal(`<h2>${esc(t('Restore'))} · ${esc(title)}</h2>
            <p class="muted small">${esc(t('Pick the user who gets this roadbook back (as a draft).'))}</p>
            <input id="rtSearch" class="field" type="search" placeholder="${esc(t('Search users…'))}" autocomplete="off">
            <div id="rtList" class="mv-list"></div>
            <div class="btnrow end"><button class="btn btn-ghost" data-cancel>${esc(t('Cancel'))}</button></div>`, 'narrow');
        d.q('[data-cancel]').onclick = d.close;
        const listEl = d.q('#rtList');
        const draw = (q) => {
            const matches = ((window.RB && RB.filterByText) ? RB.filterByText(allUsers, q, ['username', 'name', 'email']) : allUsers)
                .filter((u) => u.username !== rb.username).slice(0, 50); // never back to the graveyard itself
            listEl.innerHTML = matches.length
                ? matches.map((u) => `<button class="mv-opt" data-pick="${u.id}" data-name="${esc(u.username)}"><b>@${esc(u.username)}</b> <span class="muted small">${esc(u.email)}</span></button>`).join('')
                : `<p class="muted small">${esc(t('No matching users.'))}</p>`;
            listEl.querySelectorAll('[data-pick]').forEach((b) => b.onclick = async () => {
                if (!(await RBConfirm(t('Move this roadbook to') + ' @' + b.dataset.name + '?', t('Restore')))) return;
                const r = await RBApi('admin_rb_restore', { id: rb.id });
                if (!r.ok) { toast(r.error || 'Error'); d.close(); load(); return; }
                const m = await RBApi('admin_move_roadbook', { id: rb.id, user_id: +b.dataset.pick });
                toast(m.ok ? t('Restored as a draft.') + ' → @' + b.dataset.name : (m.error || 'Could not move.'));
                d.close(); load();
            });
        };
        d.q('#rtSearch').oninput = (e) => draw(e.target.value);
        draw('');
        setTimeout(() => d.q('#rtSearch').focus(), 50);
    }

    async function purge(rb) {
        const title = rb.title || t('Untitled');
        // deletion confirm names the object being removed (CLAUDE.md); this is irreversible
        if (!(await RBConfirm(t('Permanently delete') + ' “' + esc(title) + '”? ' + t('This cannot be undone.'), t('Delete'), true))) return;
        const r = await RBApi('admin_rb_purge', { id: rb.id });
        if (!r.ok) return toast(r.error || 'Error');
        toast(t('Permanently deleted.')); load();
    }

    (async function init() {
        if (!(await RBRequireUser($('adminMsg'), { admin: true }))) return;
        load();
    })();
})();
