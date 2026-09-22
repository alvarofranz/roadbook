'use strict';
/* Public roadbooks page: every public roadbook, searchable and paged — the shared gallery
 * (RBChallenges.gallery, #636). Cards open the public view (/challenge/<slug>); an admin also gets
 * a make-private control on each card. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;
    RBConfig().then((cfg) => {
        const isAdmin = !!(cfg.user && cfg.user.is_admin);
        const gallery = RBChallenges.gallery({
            grid: $('rbGrid'), pager: $('rbPager'), search: $('rbSearch'), vehicles: $('rbVehicles'),
            href: (r) => `/challenge/${encodeURIComponent(r.slug)}`,
            overlays: (r) => (isAdmin ? `<button type="button" class="card-btn card-unpub" data-unpub="${r.id}" data-title="${esc(r.title)}" title="${esc(t('Make private'))}" aria-label="${esc(t('Make private'))}"><i class="fa-solid fa-globe"></i></button>` : ''),
        });
        // the admin control lives inside the card link → it must not navigate
        $('rbGrid').addEventListener('click', async (e) => {
            const up = e.target.closest('.card-unpub');
            if (!up) return;
            e.preventDefault(); e.stopPropagation();
            if (!(await RBConfirm(t('Make this roadbook private?') + '<br><b>' + esc(up.dataset.title || '') + '</b>'))) return;
            const x = await RBApi('admin_unpublish', { id: +up.dataset.unpub });
            if (x.ok) { RBToast('Roadbook is now private.'); gallery.remove(up.dataset.unpub); }
            else RBToast(x.error || 'Could not change visibility.');
        });
    });
})();
