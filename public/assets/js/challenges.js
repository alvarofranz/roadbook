'use strict';
/* RBChallenges — public, DB-backed challenges (roadbooks shared by users).
 * App root is derived from this script's URL (works on the home and tool subfolders). */
(function () {
    const here = (document.currentScript && document.currentScript.src) || location.href;
    const ROOT = here.replace(/assets\/js\/challenges\.js.*$/, '');

    async function listPublic() {
        try { return (await (await fetch(ROOT + 'api/index.php?action=public_list')).json()).roadbooks || []; }
        catch (e) { return []; }
    }
    async function loadPublic(slug) {
        const j = await (await fetch(ROOT + 'api/index.php?action=public_get&slug=' + encodeURIComponent(slug))).json();
        if (!j.ok) throw new Error(j.error || 'Not found');
        return j; // { slug, roadbook, photos, owner }
    }
    // Slug from a friendly URL: /reader/<slug> or /editor/<slug>.
    const publicFromUrl = () => {
        const m = location.pathname.match(/\/(?:reader|editor)\/([A-Za-z0-9_-]+)\/?$/);
        return m ? m[1] : null;
    };

    // Picker: choose a public challenge to open in the current tool.
    async function pick(onPick) {
        const rbs = await listPublic();
        const d = RBModal(`<h2 style="margin-top:0">${RBt('Public challenges')}</h2>
            ${rbs.length ? rbs.map((r) => `<button class="demo-row" data-s="${r.slug}">
                ${r.thumb ? `<img src="${r.thumb}" alt="">` : `<span class="demo-ph"><i class="fa-solid fa-map-location-dot"></i></span>`}
                <span><b>${r.title}</b><small>@${r.username} · ${(r.total_distance / 1000).toFixed(1)} km · ${r.note_count} ${RBt('notes')}</small></span>
            </button>`).join('') : `<p class="muted">${RBt('No public challenges yet.')}</p>`}
            <div class="btnrow" style="margin-top:1rem"><button class="btn btn-ghost" id="chCancel">${RBt('Close')}</button></div>`, 'max-width:520px;max-height:80vh;overflow:auto');
        d.q('#chCancel').onclick = d.close;
        d.el.querySelectorAll('.demo-row').forEach((b) => b.onclick = async () => {
            d.close();
            try { const j = await loadPublic(b.dataset.s); onPick(j.roadbook, b.dataset.s); } catch (e) { console.error(e); }
        });
    }

    window.RBChallenges = { listPublic, loadPublic, publicFromUrl, pick, ROOT };
})();
