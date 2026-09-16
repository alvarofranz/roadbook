'use strict';
/* RBChallenges — public, DB-backed challenges (roadbooks shared by users).
 * App root is derived from this script's URL (works on the home and tool subfolders). */
(function () {
    const ROOT = window.RB_ROOT || '../'; // set by app.js; fallback for isolated loads

    /* Both calls go through RBApi, which is what carries WHO IS ASKING. A raw fetch() only ever
       worked in the browser, where the same-origin session cookie tags along by itself: inside
       the app the WebView calls https://rdbk.app cross-origin with no cookie, and the Bearer
       token RBApi attaches is the only proof of identity. Without it the server saw an anonymous
       visitor — and a READY event roadbook is invisible to one, so it answered "private" and the
       app could not open a roadbook the same user opened fine on the web (#426). */
    async function listPublic(opts) {
        // null = the call FAILED (offline/network/refused): callers show an error, never
        // "no roadbooks yet" (#218). RBApi never throws — it reports {ok:false} instead.
        const j = await RBApi('public_list', opts && opts.reusable ? { reusable: 1 } : {});
        return (j && j.ok === false) ? null : (j.roadbooks || []);
    }
    async function loadPublic(slug) {
        const j = await RBApi('public_get', { slug });
        if (!j.ok) throw new Error(j.error || 'Not found');
        return j; // { slug, roadbook, photos, owner }
    }
    // Slug from a friendly URL: /reader/<slug> or /editor/<slug>.
    const publicFromUrl = () => {
        const m = location.pathname.match(/\/(?:reader|editor)\/([A-Za-z0-9_-]+)\/?$/);
        return m ? m[1] : null;
    };

    // Picker: choose a public roadbook to open in the current tool.
    /* The public-roadbook picker (the Editor's "start from a public roadbook"): the shared row
       picker draws it, so it gets the same rows and the same search box as the Reader's. */
    async function pick(onPick, opts) {
        const loading = RBModal(`<h2>${RBt('Public Roadbooks')}</h2><p class="muted">${RBt('Loading…')}</p>`, 'wide');
        const rbs = await listPublic(opts);
        loading.close();
        if (rbs === null) { RBToast('Could not load.'); return; } // a failed call is not an empty list (#218)
        RBRowPicker({
            title: 'Public Roadbooks', icon: 'fa-globe', items: rbs, fields: ['title', 'username'],
            empty: 'No public roadbooks yet.',
            rowHTML: (r, i) => `<button class="challenge-row" data-pick="${i}">
                ${r.thumb ? `<img src="${RBesc(RBMediaSrc(r.thumb))}" alt="" loading="lazy">` : `<span class="challenge-row-placeholder"><i class="fa-solid fa-map-location-dot"></i></span>`}
                <span><b>${RBesc(r.title)}</b><small>@${RBesc(r.username)} · ${RBSummary(r.total_distance, r.note_count)}</small></span>
            </button>`,
            onPick: async (r, modal) => {
                modal.close();
                try { const j = await loadPublic(r.slug); onPick(j.roadbook, r.slug); } catch (e) { console.error(e); RBToast('Could not load the roadbook.'); }
            },
        });
    }

    window.RBChallenges = { listPublic, loadPublic, publicFromUrl, pick, ROOT };
})();
