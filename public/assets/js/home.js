'use strict';
/* Home teaser: a few recent public roadbooks, as the shared roadbook cards (RBRoadbookCard). The
 * full searchable list lives at /roadbooks. */
(function () {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;
    const esc = RBesc, t = RBt; // shared helpers (app.js / i18n.js)
    const ROOT = RBChallenges.ROOT;
    const TEASER = 6; // show only a handful here; "See all" links to the Public Roadbooks page
    let cards = null;          // cached list so a language switch re-renders without refetching

    const render = () => {
        if (!cards) return;
        if (!cards.length) { grid.innerHTML = `<p class="gallery-empty">${t('gallery.empty')}</p>`; return; }
        grid.innerHTML = cards.slice(0, TEASER).map((r) => RBRoadbookCard(r, { href: `${ROOT}challenge/${encodeURIComponent(r.slug)}` })).join('');
        RBFillRoutes(grid);
    };

    window.addEventListener('rb-lang', render);

    /* ---------- the app home (#720, native only): who you are and your own roadbooks ---------- */
    if (RBIsNativeApp()) RBConfig().then(async (cfg) => {
        if (!cfg.user) { const s = document.getElementById('appSignIn'); s.href = RBLoginUrl(); s.hidden = false; return; }
        const hello = document.getElementById('appHello');
        hello.textContent = t('Hi') + ', @' + cfg.user.username; hello.hidden = false;
        const r = await RBApi('rb_list');
        const mine = (r.ok && r.roadbooks) || [];
        const list = document.getElementById('appMineList');
        document.getElementById('appMine').hidden = false;
        // the last few, each with the two things you do with your own roadbook: navigate it, edit it
        list.innerHTML = mine.length ? mine.slice(0, 4).map((rb) => `<div class="roadbook-row">
                <div class="meta"><b>${esc(rb.title)}</b><small>${RBSummary(rb.total_distance, rb.note_count)}</small></div>
                <div class="btnrow end">
                    <a class="btn btn-primary btn-sm" href="${ROOT}reader/?rb=${rb.id}" aria-label="${esc(t('Navigate'))}"><i class="fa-solid fa-compass"></i> ${esc(t('Navigate'))}</a>
                    <a class="btn btn-ghost btn-sm" href="${ROOT}editor/?rb=${rb.id}" aria-label="${esc(t('Edit'))}" title="${esc(t('Edit'))}"><i class="fa-solid fa-pen"></i></a>
                </div>
            </div>`).join('')
            : `<p class="muted small">${esc(t(r.ok ? 'No roadbooks yet — record a route or draw one in the Editor.' : 'Could not load.'))}</p>`;
    });
    RBChallenges.listPublic().then((rbs) => {
        if (rbs === null) { grid.innerHTML = `<p class="gallery-empty">${t('Could not load.')}</p>`; return; } // failed ≠ empty (#218)
        cards = rbs; render();
    });
})();
