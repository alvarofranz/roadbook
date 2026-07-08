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
        const r = await RBApi('admin_rb_restore', { id: rb.id });
        if (!r.ok) return toast(r.error || 'Error');
        toast(t('Restored as a draft.')); load();
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
