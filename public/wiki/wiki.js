'use strict';
/* RDBK Wiki — the user guide: one Markdown page per tool (docs/wiki/<lang>/NN-<name>.md), served by
 * md.php in the UI language (English when a translation is missing) and rendered with marked. In the
 * app it is fetched from the server (RB_API_ROOT), like every other server call. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;
    // page key (the #hash) → Markdown file
    const PAGES = {
        welcome: '01-getting-started',
        recorder: '02-recorder',
        editor: '03-editor',
        reader: '04-reader',
        tripmaster: '05-tripmaster',
        events: '06-event-management',
    };
    let current = 'welcome';

    async function load() {
        const lang = RBi18n.current();
        try {
            const res = await fetch(RB_API_ROOT + 'wiki/md.php?page=' + encodeURIComponent(PAGES[current]) + '&lang=' + encodeURIComponent(lang));
            if (!res.ok) throw new Error(res.status);
            $('wikiContent').innerHTML = marked.parse(await res.text());
        } catch (e) {
            $('wikiContent').innerHTML = `<p class="muted">${esc(t(navigator.onLine === false ? 'You are offline — reconnect to load this page.' : 'Could not load.'))}</p>`
                + `<a href="#welcome" data-page="welcome" class="btn btn-ghost"><i class="fa-solid fa-arrow-left"></i> ${esc(t('wiki.nav.welcome'))}</a>`;
        }
        document.documentElement.lang = lang;
        document.title = t('wiki.title.' + current) + ' · RDBK.app';
    }

    function show(page) {
        current = PAGES[page] ? page : 'welcome';
        try { sessionStorage.setItem('wiki_page', current); } catch (e) {}
        if (current === 'welcome') { if (location.hash) history.replaceState(null, '', location.pathname); }
        else if (location.hash !== '#' + current) history.replaceState(null, '', '#' + current);
        document.querySelectorAll('.wiki-nav [data-page]').forEach((a) => a.classList.toggle('active', a.dataset.page === current));
        load();
    }

    // The nav and the links between guide pages (`02-recorder.md`) — one delegated listener
    // (inline handlers are blocked by the CSP).
    document.addEventListener('click', (e) => {
        const nav = e.target.closest('[data-page]');
        if (nav) { e.preventDefault(); show(nav.dataset.page); return; }
        const link = e.target.closest('.wiki-content a');
        const href = link && link.getAttribute('href');
        if (!href || !href.endsWith('.md')) return;
        e.preventDefault();
        const file = href.split('/').pop().replace(/\.md$/, '');
        show(Object.keys(PAGES).find((k) => PAGES[k] === file) || 'welcome');
    });
    window.addEventListener('hashchange', () => show(location.hash.slice(1)));
    window.addEventListener('rb-lang', load); // the nav re-translates itself; the page is reloaded in the new language

    let start = location.hash.slice(1);
    if (!PAGES[start]) { try { start = sessionStorage.getItem('wiki_page') || ''; } catch (e) {} }
    show(start);
})();
