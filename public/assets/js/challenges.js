'use strict';
/* RBChallenges — galería de challenges (roadbooks predefinidos autocontenidos).
 * Lee public/challenges/index.json. La raíz de la app se deduce de la URL de
 * este script (funciona en la home y en las subcarpetas de herramientas). */
(function () {
    const here = (document.currentScript && document.currentScript.src) || location.href;
    const ROOT = here.replace(/assets\/js\/challenges\.js.*$/, '');
    let cache = null;

    async function list() {
        if (cache) return cache;
        try { cache = (await (await fetch(ROOT + 'challenges/index.json', { cache: 'no-store' })).json()).tracks || []; }
        catch (e) { cache = []; }
        return cache;
    }
    async function load(slug) {
        const r = await fetch(ROOT + 'challenges/' + slug + '/roadbook.rdbk', { cache: 'no-store' });
        if (!r.ok) throw new Error('No encuentro el challenge ' + slug);
        return r.json();
    }
    const thumb = (slug, file) => ROOT + 'challenges/' + slug + '/' + (file || 'thumb.jpg');
    const fromUrl = () => new URLSearchParams(location.search).get('track');

    // Public roadbooks (DB-backed challenges).
    async function listPublic() {
        try { return (await (await fetch(ROOT + 'api/index.php?action=public_list')).json()).roadbooks || []; }
        catch (e) { return []; }
    }
    async function loadPublic(slug) {
        const j = await (await fetch(ROOT + 'api/index.php?action=public_get&slug=' + encodeURIComponent(slug))).json();
        if (!j.ok) throw new Error(j.error || 'Not found');
        return j; // { slug, roadbook, photos, owner }
    }
    const publicFromUrl = () => {
        const q = new URLSearchParams(location.search).get('challenge');
        if (q) return q;
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

    window.RBChallenges = { list, load, thumb, fromUrl, listPublic, loadPublic, publicFromUrl, pick, ROOT };
})();
