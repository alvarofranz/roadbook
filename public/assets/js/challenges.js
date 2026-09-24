'use strict';
/* RBChallenges — public, DB-backed challenges (roadbooks shared by users).
 * ROOT is the app root app.js publishes as window.RB_ROOT ('../' when this loads on its own). */
(function () {
    const ROOT = window.RB_ROOT || '../'; // set by app.js; fallback for isolated loads

    /* Both calls go through RBApi, which is what carries WHO IS ASKING. A raw fetch() only ever
       worked in the browser, where the same-origin session cookie tags along by itself: inside
       the app the WebView calls https://rdbk.app cross-origin with no cookie, and the Bearer
       token RBApi attaches is the only proof of identity. Without it the server saw an anonymous
       visitor — and a READY event roadbook is invisible to one, so it answered "private" and the
       app could not open a roadbook the same user opened fine on the web (#426). */
    async function listPublic() {
        // null = the call FAILED (offline/network/refused): callers show an error, never
        // "no roadbooks yet" (#218). RBApi never throws — it reports {ok:false} instead.
        const j = await RBApi('public_list', {});
        return (j && j.ok === false) ? null : (j.roadbooks || []);
    }
    async function loadPublic(slug) {
        const j = await RBApi('public_get', { slug });
        if (!j.ok) throw new Error(j.error || 'Not found');
        return j; // { slug, roadbook, reusable, vehicles, cover, owner, … }
    }
    // Slug from a friendly URL: /reader/<slug> or /editor/<slug>.
    const publicFromUrl = () => {
        const m = location.pathname.match(/\/(?:reader|editor)\/([A-Za-z0-9_-]+)\/?$/);
        return m ? m[1] : null;
    };

    // One picker row for a roadbook picker (the Reader's "My roadbooks", #639): thumbnail or
    // placeholder, title, then the summary.
    const pickerRow = (r, i) => `<button type="button" class="challenge-row" data-pick="${i}">
                ${r.thumb ? `<img src="${RBesc(RBMediaSrc(r.thumb))}" alt="" loading="lazy">` : `<span class="challenge-row-placeholder"><i class="fa-solid fa-map-location-dot"></i></span>`}
                <span><b>${RBesc(r.title)}</b><small>${RBSummary(r.total_distance, r.note_count)}</small></span>
            </button>`;

    /* The public-roadbook gallery (#636) — ONE for the /roadbooks/ page and the Reader's load
       screen: cards with the copy-link control, search, pager, a failed load told apart from an
       empty one (#218), and a re-render on a language switch. `href(r)` is where a card goes;
       `overlays(r)` adds page-specific card controls. Returns { remove(id) } for those controls. */
    // `vehicles` (optional): a group of [data-vehicle] toggles — the gallery then keeps the roadbooks
    // that suit any of the pressed ones (#713), together with the search.
    function gallery({ grid, pager, search, vehicles, href, overlays = () => '', per = 12 }) {
        let all = [], q = '', picked = [];
        const t = RBt, esc = RBesc;
        const card = (r) => RBRoadbookCard(r, { href: href(r), overlays: RBCopyLinkOverlay(r.slug) + overlays(r) });
        const list = RBPagedList({
            pager, per, source: () => all,
            filter: (items) => RB.filterByVehicles(RB.filterByText(items, q, ['title', 'username']), picked),
            draw: (slice) => { grid.innerHTML = slice.length ? slice.map(card).join('') : `<p class="gallery-empty">${esc(t(picked.length && !q ? 'No public roadbooks for this vehicle yet.' : 'Nothing matches that search.'))}</p>`; RBFillRoutes(grid); },
        });
        const say = (msg) => { grid.innerHTML = `<p class="gallery-empty">${esc(t(msg))}</p>`; if (search) search.closest('.rb-toolbar').hidden = true; if (vehicles) vehicles.hidden = true; };
        if (search) search.oninput = () => { q = search.value; list.reset(); };
        if (vehicles) vehicles.querySelectorAll('[data-vehicle]').forEach((b) => b.onclick = () => {
            const on = b.getAttribute('aria-pressed') !== 'true';
            b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('on', on);
            picked = [...vehicles.querySelectorAll('[data-vehicle][aria-pressed="true"]')].map((x) => x.dataset.vehicle);
            list.reset();
        });
        window.addEventListener('rb-lang', () => { if (all.length) list.render(); });
        listPublic().then((rbs) => {
            if (rbs === null) return say('Could not load roadbooks.');
            if (!rbs.length) return say('No public roadbooks yet.');
            all = rbs; list.render();
        });
        return { remove: (id) => { all = all.filter((r) => String(r.id) !== String(id)); list.render(); } };
    }

    window.RBChallenges = { listPublic, loadPublic, publicFromUrl, gallery, pickerRow, ROOT };
})();
