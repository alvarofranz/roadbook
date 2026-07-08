'use strict';
/* RBChallenges — public, DB-backed challenges (roadbooks shared by users).
 * App root is derived from this script's URL (works on the home and tool subfolders). */
(function () {
    const here = (document.currentScript && document.currentScript.src) || location.href;
    const ROOT = here.replace(/assets\/js\/challenges\.js.*$/, '');

    async function listPublic(opts) {
        const q = opts && opts.reusable ? '&reusable=1' : ''; // #106: the Editor fork search asks for reusable-only
        // null = the call FAILED (offline/network): callers show an error, never "no roadbooks yet" (#218)
        try { return (await (await fetch((window.RB_API_ROOT || ROOT) + 'api/index.php?action=public_list' + q)).json()).roadbooks || []; }
        catch (e) { return null; }
    }
    async function loadPublic(slug) {
        const j = await (await fetch((window.RB_API_ROOT || ROOT) + 'api/index.php?action=public_get&slug=' + encodeURIComponent(slug))).json();
        if (!j.ok) throw new Error(j.error || 'Not found');
        return j; // { slug, roadbook, photos, owner }
    }
    // Slug from a friendly URL: /reader/<slug> or /editor/<slug>.
    const publicFromUrl = () => {
        const m = location.pathname.match(/\/(?:reader|editor)\/([A-Za-z0-9_-]+)\/?$/);
        return m ? m[1] : null;
    };

    // Picker: choose a public roadbook to open in the current tool.
    async function pick(onPick, opts) {
        const d = RBModal(`<h2>${RBt('Public Roadbooks')}</h2><p class="muted">${RBt('Loading…')}</p>`, 'wide');
        const rbs = await listPublic(opts);
        const rows = rbs === null
            ? `<p class="muted"><i class="fa-solid fa-triangle-exclamation"></i> ${RBt('Could not load.')}</p>`
            : (rbs.length ? rbs.map((r) => `<button class="challenge-row" data-s="${RBesc(r.slug)}">
                ${r.thumb ? `<img src="${RBesc(RBMediaSrc(r.thumb))}" alt="" loading="lazy">` : `<span class="challenge-row-placeholder"><i class="fa-solid fa-map-location-dot"></i></span>`}
                <span><b>${RBesc(r.title)}</b><small>@${RBesc(r.username)} · ${RBSummary(r.total_distance, r.note_count)}</small></span>
            </button>`).join('') : `<p class="muted">${RBt('No public roadbooks yet.')}</p>`);
        d.el.querySelector('.modal-card').innerHTML = `<h2>${RBt('Public Roadbooks')}</h2>
            ${rows}
            <div class="btnrow spaced"><button class="btn btn-ghost" id="chCancel">${RBt('Close')}</button></div>`;
        d.q('#chCancel').onclick = d.close;
        d.el.querySelectorAll('.challenge-row').forEach((b) => b.onclick = async () => {
            d.close();
            try { const j = await loadPublic(b.dataset.s); onPick(j.roadbook, b.dataset.s); } catch (e) { console.error(e); }
        });
    }

    window.RBChallenges = { listPublic, loadPublic, publicFromUrl, pick, ROOT };
})();
