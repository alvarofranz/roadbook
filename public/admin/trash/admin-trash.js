'use strict';
/* Admin · Roadbook trash (#187). Lists every soft-deleted roadbook (any owner), searchable by title,
 * author and deletion date (#969), and lets an admin restore it (→ draft) or delete it permanently
 * now. A roadbook whose author deleted their account belongs to the graveyard user: restoring it
 * asks who gets it. Deleted roadbooks are auto-purged after the retention window by the cron.
 * Gated to admins. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast;

    let items = [], days = 30, q = '';
    async function load() {
        const r = await RBApi('admin_trash_list');
        if (!r.ok) { $('adminMsg').hidden = false; $('adminMsg').textContent = t(r.error || 'Could not load the trash.'); return; }
        // what the search reads (#969): the title, the author and the day it was deleted, as shown and as ISO
        items = r.roadbooks.map((rb) => Object.assign(rb, { deleted_day: String(rb.deleted_at || '').slice(0, 10) + ' ' + RBFmtDate(String(rb.deleted_at || '').slice(0, 10)) }));
        days = r.trash_days || 30;
        $('adminMsg').hidden = true; $('trashBody').hidden = false;
        paged.reset();
    }
    const paged = RBPagedList({
        pager: $('trashPager'), per: 24,
        source: () => items,
        filter: (list) => (q ? RB.filterByText(list, q, ['title', 'username', 'deleted_day']) : list),
        draw: (page, total) => render(page, total),
    });

    function render(page, total) {
        const box = $('trashList');
        const expired = items.filter((rb) => (rb.days_left || 0) <= 0).length;
        $('trashNote').textContent = RBTrashNote(days);
        $('trashPurgeExpired').hidden = !expired;
        $('trashPurgeExpiredCount').textContent = expired ? `(${expired})` : '';
        if (!items.length) { box.innerHTML = `<p class="muted">${esc(t('The trash is empty.'))}</p>`; return; }
        if (!total) { box.innerHTML = `<p class="muted">${esc(t('Nothing matches that search.'))}</p>`; return; }
        box.innerHTML = '<div class="rb-grid">' + page.map((rb) => RBTrashRowHTML(rb, true)).join('') + '</div>';
        page.forEach((rb) => {
            box.querySelector(`[data-restore="${rb.id}"]`).onclick = (e) => restore(rb, e.currentTarget);
            box.querySelector(`[data-purge="${rb.id}"]`).onclick = (e) => purge(rb, e.currentTarget);
        });
    }
    const searchSoon = RBDebounce(() => { q = $('trashSearch').value.trim(); paged.reset(); }, 200);
    $('trashSearch').oninput = searchSoon;
    $('trashPurgeExpired').onclick = async (e) => {
        const expired = items.filter((rb) => (rb.days_left || 0) <= 0).length;
        if (!(await RBConfirmDanger(expired + ' ' + t('roadbooks past retention will be permanently deleted. Continue?')))) return;
        const busy = RBBusy(e.currentTarget);
        const x = await RBApi('admin_trash_purge_expired', {});
        busy.reset();
        if (!x.ok) return toast(x.error || 'Could not delete.');
        toast(t('Permanently deleted.') + ' ' + (x.deleted || 0) + (x.remaining > 0 ? ' · ' + x.remaining + ' ' + t('remaining — run again.') : ''));
        load();
    };

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
