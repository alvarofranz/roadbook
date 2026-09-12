'use strict';
/* Public Roadbooks page: the full list of public roadbooks with client-side search +
 * pagination. Cards link to the public view (/challenge/<slug>). Reuses RBChallenges.listPublic
 * (server returns the most recent public roadbooks); RB.filterByText drives the search. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;
    const PER = 12;
    let all = [], q = '', isAdmin = false;
    const grid = $('rbGrid'), pager = $('rbPager'), search = $('rbSearch');

    const card = (r) => RBGalleryCard({
        href: `/challenge/${encodeURIComponent(r.slug)}`, thumb: r.thumb, title: r.title,
        meta: `@${esc(r.username)} · ${RBSummary(r.total_distance, r.note_count)}`,
        overlays: `<button type="button" class="card-btn card-copy" data-copy="${esc(r.slug)}" title="${esc(t('Copy link'))}" aria-label="${esc(t('Copy link'))}"><i class="fa-solid fa-link"></i></button>`
            + (isAdmin ? `<button type="button" class="card-btn card-unpub" data-unpub="${r.id}" data-title="${esc(r.title)}" title="${esc(t('Make private'))}" aria-label="${esc(t('Make private'))}"><i class="fa-solid fa-lock"></i></button>` : ''),
    });

    // the overlay buttons live inside the card link → don't let their click navigate
    grid.addEventListener('click', async (e) => {
        const cp = e.target.closest('.card-copy');
        if (cp) { e.preventDefault(); e.stopPropagation(); RBCopy(RBReaderLink(cp.dataset.copy)); return; }
        const up = e.target.closest('.card-unpub');
        if (up) {
            e.preventDefault(); e.stopPropagation();
            if (!(await RBConfirm(t('Make this roadbook private?') + ' “' + esc(up.dataset.title || '') + '”'))) return;
            const x = await RBApi('admin_unpublish', { id: +up.dataset.unpub });
            if (x.ok) { RBToast('Roadbook is now private.'); all = all.filter((r) => String(r.id) !== up.dataset.unpub); list.render(); }
            else RBToast(x.error || 'Could not change visibility.');
        }
    });

    const list = RBPagedList({
        pager, per: PER, source: () => all,
        filter: (items) => RB.filterByText(items, q, ['title', 'username']),
        draw: (slice) => { grid.innerHTML = slice.length ? slice.map(card).join('') : `<p class="gallery-empty">${esc(t('No matching roadbooks.'))}</p>`; },
    });

    if (search) search.oninput = () => { q = search.value; list.reset(); };
    window.addEventListener('rb-lang', () => { if (all.length) list.render(); }); // re-render labels on language switch

    Promise.all([RBChallenges.listPublic(), RBApi('config').catch(() => ({}))]).then(([roadbooks, cfg]) => {
        isAdmin = !!(cfg && cfg.user && cfg.user.is_admin); // admins get a force-private control per card
        if (roadbooks === null) { grid.innerHTML = `<p class="gallery-empty">${esc(t('Could not load roadbooks.'))}</p>`; if (search) search.closest('.rb-toolbar').hidden = true; return; } // failed ≠ empty (#218)
        all = roadbooks;
        if (!all.length) { grid.innerHTML = `<p class="gallery-empty">${esc(t('No public roadbooks yet.'))}</p>`; if (search) search.closest('.rb-toolbar').hidden = true; return; }
        list.render();
    }).catch(() => { grid.innerHTML = `<p class="gallery-empty">${esc(t('Could not load roadbooks.'))}</p>`; });
})();
