'use strict';
/* Admin · Roadbook trash (#187). Lists every soft-deleted roadbook (any owner) and lets an admin
 * restore it (→ draft) or delete it permanently now. Deleted roadbooks are auto-purged after the
 * retention window by the cron. Gated to admins. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast;
    const km = (m) => (m / 1000).toFixed(1) + ' km';
    const PER = 25;
    let allRows = [], query = '', page = 1, trashDays = 30;

    async function load() {
        const r = await RBApi('admin_trash_list');
        if (!r.ok) { $('adminMsg').hidden = false; $('adminMsg').textContent = t(r.error || 'Could not load the trash.'); return; }
        allRows = r.roadbooks || [];
        trashDays = r.trash_days || 30;
        render(allRows, trashDays);
    }

    function render(list, days) {
        const box = $('trashList');
        $('adminMsg').hidden = true; box.hidden = false;
        const filtered = (window.RB && RB.filterByText) ? RB.filterByText(list, query, ['title', 'username']) : list;
        const pages = Math.max(1, Math.ceil(filtered.length / PER));
        if (page > pages) page = pages;
        if (!filtered.length) { box.innerHTML = `<p class="muted">${esc(t(query ? 'No matching roadbooks.' : 'The trash is empty.'))}</p>`; RBPager($('trashPager'), 1, 1, () => {}); return; }
        const slice = filtered.slice((page - 1) * PER, page * PER);
        const expired = filtered.filter((rb) => (rb.days_left || 0) <= 0).length;
        box.innerHTML = `<p class="muted small">${esc(t('Deleted roadbooks are kept for a while, then permanently removed.'))}</p>`
            + (expired > 0 ? `<div class="btnrow end"><button class="btn btn-danger" id="trashPurgeExpired"><i class="fa-solid fa-trash"></i> ${esc(t('Delete expired'))} (${expired})</button></div>` : '')
            + '<div class="trash-rows">' + slice.map(rowHtml).join('') + '</div>';
        RBPager($('trashPager'), page, pages, (p) => { page = p; render(list, days); }, filtered.length ? `${filtered.length} ${esc(t('roadbooks'))}` : '');
        if (expired > 0) $('trashPurgeExpired').onclick = async (e) => {
            if (!(await RBConfirmDanger(expired + ' ' + t('roadbooks past retention will be permanently deleted. Continue?')))) return;
            const busy = RBBusy(e.currentTarget);
            const x = await RBApi('admin_trash_purge_expired', {});
            busy.reset();
            if (!x.ok) return toast(x.error || 'Could not delete.');
            toast(t('Permanently deleted.') + ' ' + (x.deleted || 0) + (x.remaining > 0 ? ' · ' + x.remaining + ' ' + t('remaining — run again.') : ''));
            load();
        };
        slice.forEach((rb) => {
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
        RBRowPicker({
            title: 'Restore', icon: 'fa-rotate-left', card: 'narrow',
            lead: 'Pick the user who gets this roadbook back (as a draft).',
            items: allUsers.filter((u) => u.username !== rb.username), // never back to the graveyard itself
            fields: ['username', 'name', 'email'], limit: 50, empty: 'No users yet.',
            rowHTML: (u, i) => `<button class="mv-opt" data-pick="${i}"><b>@${esc(u.username)}</b> <span class="muted small">${esc(u.email)}</span></button>`,
            onPick: async (u, modal) => {
                if (!(await RBConfirm(t('Move this roadbook to') + ' @' + u.username + '?'))) return;
                modal.close();
                const r = await RBApi('admin_rb_restore', { id: rb.id });
                if (!r.ok) { toast(r.error || 'Error'); load(); return; }
                const m = await RBApi('admin_move_roadbook', { id: rb.id, user_id: +u.id });
                toast(m.ok ? t('Restored as a draft.') + ' \u2192 @' + u.username : (m.error || 'Could not move.'));
                load();
            },
        });
    }

    async function purge(rb) {
        const title = rb.title || t('Untitled');
        // deletion confirm names the object being removed (CLAUDE.md); this is irreversible
        if (!(await RBConfirm(t('Permanently delete') + ' “' + esc(title) + '”? ' + t('This cannot be undone.'), true))) return;
        const r = await RBApi('admin_rb_purge', { id: rb.id });
        if (!r.ok) return toast(r.error || 'Error');
        toast(t('Permanently deleted.')); load();
    }

    (async function init() {
        if (!(await RBRequireUser($('adminMsg'), { admin: true }))) return;
        $('trashSearch').oninput = () => { query = $('trashSearch').value; page = 1; render(allRows, trashDays); };
        load();
    })();
})();
