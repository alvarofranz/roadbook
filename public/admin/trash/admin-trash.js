'use strict';
/* Admin · Roadbook trash (#187). Lists every soft-deleted roadbook (any owner) and lets an admin
 * restore it (→ draft) or delete it permanently now. Deleted roadbooks are auto-purged after the
 * retention window by the cron. Gated to admins. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast;

    async function load() {
        const r = await RBApi('admin_trash_list');
        if (!r.ok) { $('adminMsg').hidden = false; $('adminMsg').textContent = t(r.error || 'Could not load the trash.'); return; }
        render(r.roadbooks, r.trash_days || 30);
    }

    function render(list, days) {
        const box = $('trashList');
        $('adminMsg').hidden = true; box.hidden = false;
        if (!list.length) { box.innerHTML = `<p class="muted">${esc(t('The trash is empty.'))}</p>`; return; }
        const expired = list.filter((rb) => (rb.days_left || 0) <= 0).length;
        box.innerHTML = `<p class="muted small">${esc(RBTrashNote(days))}</p>`
            + (expired > 0 ? `<div class="btnrow end"><button class="btn btn-danger" id="trashPurgeExpired"><i class="fa-solid fa-trash-can"></i> ${esc(t('Delete expired'))} (${expired})</button></div>` : '')
            + '<div class="rb-grid">' + list.map((rb) => RBTrashRowHTML(rb, true)).join('') + '</div>';
        if (expired > 0) $('trashPurgeExpired').onclick = async (e) => {
            if (!(await RBConfirmDanger(expired + ' ' + t('roadbooks past retention will be permanently deleted. Continue?')))) return;
            const busy = RBBusy(e.currentTarget);
            const x = await RBApi('admin_trash_purge_expired', {});
            busy.reset();
            if (!x.ok) return toast(x.error || 'Could not delete.');
            toast(t('Permanently deleted.') + ' ' + (x.deleted || 0) + (x.remaining > 0 ? ' · ' + x.remaining + ' ' + t('remaining — run again.') : ''));
            load();
        };
        list.forEach((rb) => {
            box.querySelector(`[data-restore="${rb.id}"]`).onclick = (e) => restore(rb, e.currentTarget);
            box.querySelector(`[data-purge="${rb.id}"]`).onclick = (e) => purge(rb, e.currentTarget);
        });
    }

    async function restore(rb, btn) {
        // A graveyard roadbook (its "owner" is the deleted-user account, which can never log
        // in) must be handed to a REAL user right away: restoring asks who gets it, and the
        // server restores + reassigns in one step (#234 · #703).
        if (rb.graveyard) return restoreToUser(rb);
        const busy = RBBusy(btn);
        const r = await RBApi('admin_rb_restore', { id: rb.id });
        if (!r.ok) { busy.reset(); return toast(r.error || 'Could not restore.'); }
        busy.ok(); toast(t('Restored as a draft.')); load();
    }

    let allUsers = null; // lazy: fetched on the first graveyard restore
    async function restoreToUser(rb) {
        if (!allUsers) {
            const u = await RBApi('admin_users');
            if (!u.ok) return toast(u.error || 'Could not load.'); // a failed load is not "No users yet" (#667)
            allUsers = u.users || [];
        }
        RBRowPicker({
            title: 'Restore', icon: 'fa-rotate-left', card: 'narrow',
            lead: 'Pick the user who gets this roadbook back (as a draft).',
            items: allUsers.filter((u) => !u.system), // never back to the graveyard itself
            fields: ['username', 'name', 'email'], limit: 50, empty: 'No users yet.',
            rowHTML: (u, i) => `<button class="mv-opt" data-pick="${i}"><b>@${esc(u.username)}</b> <span class="muted small">${esc(u.email)}</span></button>`,
            onPick: async (u, modal) => {
                if (!(await RBConfirm(t('Move this roadbook to') + ' @' + esc(u.username) + '?'))) return;
                modal.close();
                const r = await RBApi('admin_rb_restore', { id: rb.id, user_id: +u.id }); // restore + hand over, one server step
                toast(r.ok ? t('Restored as a draft.') + ' → @' + u.username : (r.error || 'Could not restore.'));
                load();
            },
        });
    }

    async function purge(rb, btn) {
        if (!(await RBConfirmPurge(rb.title))) return; // names what goes; irreversible
        const busy = RBBusy(btn);
        const r = await RBApi('admin_rb_purge', { id: rb.id });
        if (!r.ok) { busy.reset(); return toast(r.error || 'Could not delete.'); }
        busy.ok(); toast(t('Permanently deleted.')); load();
    }

    (async function init() {
        if (!(await RBRequireUser($('adminMsg'), { admin: true }))) return;
        load();
    })();
})();
