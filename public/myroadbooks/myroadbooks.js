'use strict';
/* My roadbooks — the signed-in user's saved roadbooks: list, open, duplicate,
 * delete. Requires a session; redirects to the account page to sign in otherwise. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, api = RBApi; // shared helpers (app.js / i18n.js)
    // MySQL DATETIME ("YYYY-MM-DD HH:MM:SS") → the visitor's locale date
    const fmtDate = (s) => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? '' : d.toLocaleDateString(); };

    async function loadRoadbooks() {
        const r = await api('rb_list');
        const list = $('rbList');
        if (!r.ok || !r.roadbooks || !r.roadbooks.length) { list.innerHTML = `<p class="muted small">${t('No roadbooks yet. Create one in the Editor.')}</p>`; return; }
        list.innerHTML = r.roadbooks.map((rb) => `<div class="roadbook-row">
            <div class="meta"><b>${esc(rb.title)}</b><small>${RBSummary(rb.total_distance, rb.note_count)} · <i class="fa-solid fa-clock-rotate-left"></i> ${fmtDate(rb.updated_at)}</small></div>
            <span class="rb-badge ${rb.is_public ? 'public' : 'private'}"><i class="fa-solid fa-${rb.is_public ? 'globe' : 'lock'}"></i> ${esc(t(rb.is_public ? 'Public' : 'Private'))}</span>
            <a class="btn btn-ghost" href="../challenge/${rb.slug || ''}" title="${esc(t('View'))}" aria-label="${esc(t('View'))}"><i class="fa-solid fa-eye"></i></a>
            <a class="btn btn-ghost" href="../editor/?rb=${rb.id}" title="${esc(t('Edit'))}" aria-label="${esc(t('Edit'))}"><i class="fa-solid fa-pen"></i></a>
            <button class="btn btn-ghost" data-dup="${rb.id}" title="${esc(t('Save as'))}" aria-label="${esc(t('Save as'))}"><i class="fa-solid fa-clone"></i></button>
            <button class="btn btn-ghost" data-del="${rb.id}" title="${esc(t('Delete'))}" aria-label="${esc(t('Delete'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button>
        </div>`).join('');
        list.querySelectorAll('[data-dup]').forEach((b) => b.onclick = async () => {
            const r = await api('rb_duplicate', { id: +b.dataset.dup });
            if (r.ok) { RBToast('Roadbook duplicated.'); loadRoadbooks(); } else RBToast(r.error || 'Could not duplicate.');
        });
        list.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
            if (await RBConfirm('Delete this roadbook?', 'Delete')) { await api('rb_delete', { id: +b.dataset.del }); loadRoadbooks(); }
        });
    }

    (async function init() {
        const cfg = await api('config');
        if (!cfg.user) { location.href = '../account/'; return; } // sign in first
        loadRoadbooks();
    })();
})();
