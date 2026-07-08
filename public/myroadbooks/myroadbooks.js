'use strict';
/* My roadbooks — the signed-in user's saved roadbooks. The list itself (render +
 * duplicate/delete) is the shared RBRoadbookList helper in app.js, reused by the
 * Editor landing too. Below it, the personal trash (#238): the user's soft-deleted
 * roadbooks with their days left, restorable to draft. Requires a session. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;

    async function loadTrash() {
        const r = await RBApi('rb_trash_list');
        const wrap = $('rbTrash'), list = $('rbTrashList');
        if (!r.ok || !r.roadbooks.length) { wrap.hidden = true; return; }
        wrap.hidden = false;
        list.innerHTML = r.roadbooks.map((rb) => `<div class="roadbook-row">
            <div class="meta"><b>${esc(rb.title)}</b><small>${RBSummary(rb.total_distance, rb.note_count)} · <i class="fa-solid fa-hourglass-half"></i> ${rb.days_left} ${esc(t('days left'))}</small></div>
            <button class="btn btn-ghost" data-restore="${rb.id}"><i class="fa-solid fa-rotate-left"></i> ${esc(t('Restore'))}</button>
        </div>`).join('');
        list.querySelectorAll('[data-restore]').forEach((b) => b.onclick = async () => {
            const x = await RBApi('rb_restore', { id: +b.dataset.restore });
            if (x.ok) { RBToast('Restored as a draft.'); RBRoadbookList($('rbList'), loadTrash); loadTrash(); }
            else RBToast(x.error || 'Could not restore.');
        });
    }

    (async function init() {
        const cfg = await RBApi('config');
        if (!cfg.user) { location.href = RBLoginUrl(); return; } // sign in first, then come back here
        RBRoadbookList($('rbList'), loadTrash); // a delete from the list surfaces straight in the trash below
        loadTrash();
    })();
})();
