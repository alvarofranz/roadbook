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
        // the last few as the ONE roadbook card every gallery draws (#895): a tap opens its page, where
        // Navigate / Edit live; one still private says so on the card, a draft with no page opens the Editor
        list.innerHTML = mine.length ? mine.slice(0, 6).map((rb) => RBRoadbookCard(rb, {
                href: rb.slug ? `${ROOT}challenge/${encodeURIComponent(rb.slug)}` : `${ROOT}editor/?rb=${rb.id}`,
                category: rb.status === 'public' ? '' : t(RBStatusLabel[rb.status]),
            })).join('')
            : `<p class="muted small">${esc(t(r.ok ? 'No roadbooks yet — record a route or draw one in the Editor.' : 'Could not load.'))}</p>`;
        RBFillRoutes(list);
    });
    RBChallenges.listPublic().then((rbs) => {
        if (rbs === null) { grid.innerHTML = `<p class="gallery-empty">${t('Could not load.')}</p>`; return; } // failed ≠ empty (#218)
        cards = rbs; render();
    });
})();
