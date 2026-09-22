'use strict';
/* My roadbooks — the signed-in user's saved roadbooks. The list itself (render +
 * duplicate/delete) is the shared RBRoadbookList helper in app.js, reused by the
 * Editor landing too. Below it, the personal trash (#238): the user's soft-deleted
 * roadbooks with their days left, restorable to draft. Requires a session. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;

    // The trash rows, the retention note and both questions are the shared RBTrash* helpers,
    // identical to the admin trash (#704). A failed load says so; an empty trash hides (#705).
    async function loadTrash() {
        const r = await RBApi('rb_trash_list');
        const wrap = $('rbTrash'), list = $('rbTrashList');
        if (!r.ok) { wrap.hidden = false; $('rbTrashNote').textContent = ''; list.innerHTML = `<p class="muted">${esc(t(r.error === 'Network error.' ? 'You are offline — reconnect to load this page.' : 'Could not load the trash.'))}</p>`; return; }
        if (!r.roadbooks.length) { wrap.hidden = true; return; }
        wrap.hidden = false;
        $('rbTrashNote').textContent = RBTrashNote(r.trash_days);
        list.innerHTML = r.roadbooks.map((rb) => RBTrashRowHTML(rb, false)).join('');
        r.roadbooks.forEach((rb) => {
            list.querySelector(`[data-restore="${rb.id}"]`).onclick = async (e) => {
                const busy = RBBusy(e.currentTarget);
                const x = await RBApi('rb_restore', { id: rb.id });
                if (x.ok) { busy.ok(); RBToast('Restored as a draft.'); RBRoadbookList($('rbList'), loadTrash); loadTrash(); }
                else { busy.reset(); RBToast(x.error || 'Could not restore.'); }
            };
            list.querySelector(`[data-purge="${rb.id}"]`).onclick = async (e) => {
                if (!(await RBConfirmPurge(rb.title))) return;
                const busy = RBBusy(e.currentTarget);
                const x = await RBApi('rb_purge', { id: rb.id });
                if (x.ok) { busy.ok(); RBToast('Permanently deleted.'); loadTrash(); }
                else { busy.reset(); RBToast(x.error || 'Could not delete.'); }
            };
        });
    }

    (async function init() {
        const cfg = await RBConfig(); // offline, a signed-in user stays signed in (#705)
        if (!cfg.user) { location.href = RBLoginUrl(); return; } // sign in first, then come back here
        RBRoadbookList($('rbList'), loadTrash); // a delete from the list surfaces straight in the trash below
        loadTrash();
    })();
})();
