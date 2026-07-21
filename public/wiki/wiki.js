const pageKey = {
    '01-getting-started': 'welcome',
    '02-recorder': 'recorder',
    '03-editor': 'editor',
    '04-reader': 'reader',
    '05-tripmaster': 'tripmaster',
    '06-event-management': 'events',
};

const pageFile = {
    'welcome': '01-getting-started',
    'recorder': '02-recorder',
    'editor': '03-editor',
    'reader': '04-reader',
    'tripmaster': '05-tripmaster',
    'events': '06-event-management',
};

function currentLang() {
    return (window.RBi18n && RBi18n.current()) || 'it';
}

async function loadWikiPage(pageName) {
    try {
        const response = await fetch('md.php?page=' + encodeURIComponent(pageName) + '&lang=' + encodeURIComponent(currentLang()));
        if (!response.ok) throw new Error('Wiki page not found');
        const md = await response.text();
        document.getElementById('wikiContent').innerHTML = marked.parse(md);
    } catch (error) {
        document.getElementById('wikiContent').innerHTML =
            '<h1>Page Not Found</h1>' +
            '<p>The wiki page "' + pageName + '" could not be found.</p>' +
            '<a href="#welcome" data-page="welcome" class="back-link"><i class="fa-solid fa-arrow-left"></i> Return to Wiki Home</a>';
    }
}

let currentPage = 'welcome';

function showPage(pageName) {
    if (!pageFile[pageName]) pageName = 'welcome';
    currentPage = pageName;
    const file = pageFile[pageName];
    try { sessionStorage.setItem('wiki_page', pageName); } catch (e) {}
    if (pageName === 'welcome') {
        if (location.hash) history.replaceState(null, '', window.location.pathname);
    } else if (location.hash !== '#' + pageName) {
        location.hash = pageName;
    }
    document.title = (window.RBi18n ? RBi18n.t('wiki.title.' + pageName) : 'Wiki') + ' · RDBK.app';
    loadWikiPage(file);
}

// Navigation + markdown link interception via a single delegated listener
// (inline onclick / javascript: handlers are blocked by the CSP).
document.addEventListener('click', function (e) {
    const navLink = e.target.closest('[data-page]');
    if (navLink) {
        e.preventDefault();
        showPage(navLink.getAttribute('data-page'));
        return;
    }
    const mdLink = e.target.closest('.wiki-content a');
    if (!mdLink) return;
    const href = mdLink.getAttribute('href');
    if (!href || !href.endsWith('.md')) return;
    e.preventDefault();
    const key = Object.keys(pageKey).find((k) => href.includes(k.replace(/^\d+-/, '')) || k === href.replace('.md', ''));
    if (key) { showPage(pageKey[key]); return; }
    showPage(href.replace('.md', ''));
});

function initWiki() {
    let page = location.hash.replace('#', '') || '';
    if (!page || !pageFile[page]) {
        try { page = sessionStorage.getItem('wiki_page') || ''; } catch (e) {}
    }
    showPage(page && pageFile[page] ? page : 'welcome');
}

// The wiki follows the app's shared language (RBi18n). Nav labels are
// re-translated automatically by RBi18n on language change; here we reload
// the markdown in the new language and update the document title.
window.addEventListener('rb-lang', function () {
    document.documentElement.lang = currentLang();
    showPage(currentPage);
});

window.addEventListener('hashchange', function () {
    const page = location.hash.replace('#', '') || 'welcome';
    if (pageFile[page]) showPage(page);
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initWiki); else initWiki();
