/* Shared app shell (home page and every tool). The app root is derived from
   this script's URL, so it works the same at the domain root and in subfolders.
   - Service worker (network-first) with auto-reload on update.
   - Version system: when version.json changes, refresh EVERYTHING (SW + caches
     + app), installed PWA or plain browser alike.
   - Install button in the header (hidden once installed). On iPhone it opens
     a modal with the Safari instructions. */
(function () {
    'use strict';

    const here = (document.currentScript && document.currentScript.src) || location.href;
    const ROOT = here.replace(/assets\/js\/app\.js.*$/, ''); // .../roadbook/
    window.RB_ROOT = ROOT;
    // Login URL carrying a ?next= return path to the current page (omitted on /account/ itself);
    // after login, account.js sends the user back to that safe same-origin path (#105).
    window.RBLoginUrl = () => ROOT + 'account/' + (/\/account\/?$/.test(location.pathname) ? '' : '?next=' + encodeURIComponent(location.pathname + location.search + location.hash));

    // True only inside a Capacitor native shell (available synchronously at startup).
    const isNativeApp = () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
    // Which shell we are running in: 'ios' · 'android' · 'web' (any browser, PWA included). Also
    // synchronous at startup, so the UI can branch per platform without waiting for RBNative — the
    // Apple sign-in button (#370) is iOS-only.
    window.RBPlatform = () => (isNativeApp() ? Capacitor.getPlatform() : 'web');
    // True when the user entered via an event participant landing page (#163).
    const isParticipant = () => {
        if (document.cookie.includes('rb_participant=1')) return true;
        try { if (localStorage.getItem('rb_participant') === '1') return true; } catch (e) {}
        return false;
    };

    // API + live-version host. On the web it is the same-origin ROOT. The native app serves its
    // bundled UI from a WebView-local origin with no backend, so the PHP API (accounts, public
    // roadbooks, uploads) and the live version.json live on the production domain, reached
    // cross-origin (the server whitelists the app origin — see cors_for_app). Shared globally so
    // every module (challenges.js…) reaches the backend through the same host.
    const PROD_ROOT = 'https://rdbk.app/';
    const API_ROOT = isNativeApp() ? PROD_ROOT : ROOT;
    window.RB_API_ROOT = API_ROOT;
    // The store listings — where an app update comes from, and where the site sends a visitor who
    // wants the native app. Published so the pages that link them never hard-code an id.
    window.RBStore = { ios: 'https://apps.apple.com/app/rdbk/id6787167327', android: 'https://play.google.com/store/apps/details?id=app.rdbk' };
    // API-served media path (/photos/… /audio/… /avatars/… /event-logos/…) → a URL that loads
    // everywhere: same-origin on the web, the backend host inside the native app — whose WebView
    // origin has no backend, so a root-relative src renders a broken image there (#232).
    window.RBMediaSrc = (p) => (typeof p === 'string' && p.startsWith('/') ? API_ROOT.replace(/\/+$/, '') + p : p);

    // Native shell: load the native capability bridge (RBNative) and flag the document
    // for safe-area styling. Never runs in a plain browser — the PWA stays unchanged.
    if (isNativeApp()) {
        document.documentElement.classList.add('native');
        // A service worker's own fetch() bypasses Capacitor's localhost asset server, so a SW
        // breaks asset loading inside the app (blank/unstyled shell on the second launch). The
        // native build ships its assets bundled and is offline without one — so never register a
        // SW here, and tear down any a previous build left controlling this WebView.
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
            if (window.caches) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
        }
        const nativeBridge = document.createElement('script');
        nativeBridge.src = ROOT + 'assets/js/native.bundle.js';
        document.head.appendChild(nativeBridge);
    }

    /* ---------------- Global header + footer (same on every page) ----------------
       ONE section catalog is the single source of truth for navigation. The web renders it as
       the top bar; the native app renders it as a fixed icon-only bottom tab bar (the top bar is
       hidden by CSS there). The Recorder is a top-level entry; Reader + Tripmaster live under a
       single "Navigate" section; in the app, "Events" is also where Ranking lives. */
    // path · i18n label · canonical FontAwesome icon · `covers`: extra route prefixes that light it up.
    const SECTION = {
        recorder:  { path: 'recorder/',  label: 'Recorder',  icon: 'fa-circle-dot' },
        editor:    { path: 'editor/',    label: 'Editor',    icon: 'fa-pen-ruler' },
        navigate:  { path: 'navigate/',  label: 'Navigate',  icon: 'fa-location-arrow', covers: ['tripmaster', 'reader'] },
        reader:    { path: 'reader/',    label: 'Reader',    icon: 'fa-compass' },
        roadbooks: { path: 'roadbooks/', label: 'Roadbooks', icon: 'fa-book-open' },
        events:    { path: 'events/',    label: 'Events',    icon: 'fa-calendar-check', covers: ['event', 'ranking'] },
        ranking:   { path: 'ranking/',   label: 'Ranking',   icon: 'fa-ranking-star' },
        profile:   { path: 'account/',   label: 'Profile',   icon: 'fa-circle-user', covers: ['account'] },
        back:      { label: 'Back',      icon: 'fa-arrow-left' },
    };
    // One order everywhere (#807): the roadbooks first — the heart of the site —, the Recorder in the
    // middle. Web top nav: Reader + Tripmaster collapse into "Navigate", the account control follows.
    // Bottom bar (every mobile-width view): the same sections as icon-only tabs, after Back.
    const WEB_NAV = ['roadbooks', 'editor', 'recorder', 'navigate', 'events'];
    const APP_TABS = ['back', 'roadbooks', 'editor', 'recorder', 'navigate', 'events', 'profile'];
    // Common words are translated; product names stay as-is (RBt falls back to English regardless).
    const NAV_TRANSLATE = { navigate: 1, events: 1, profile: 1, roadbooks: 1 };

    // HTML-escape, defined up here because the chrome below builds markup as soon as this file runs.
    window.RBesc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    /* The site's own links — ONE list, in two groups. The footer shows them by group on desktop;
       the Profile page repeats them all on mobile, where the footer is hidden — from this same
       list, so the two never drift (#496). `data-i18n` on every label, so a language switch
       reaches them (#495). */
    const SITE_LINKS = [
        { group: 'Resources', path: 'wiki/',      icon: 'fa-circle-question', label: 'Help' },
        { group: 'Resources', path: 'install/',   icon: 'fa-circle-down',     label: 'Install' },
        { group: 'Resources', path: 'standard/',  icon: 'fa-file-code',       label: 'The .rdbk standard' },
        { group: 'Resources', path: 'changelog/', icon: 'fa-clock-rotate-left', label: 'What’s new' },
        { group: 'Resources', path: 'about/',     icon: 'fa-circle-info',     label: 'About' },
        { group: 'Legal',     path: 'privacy/',   icon: 'fa-shield-halved',   label: 'Privacy' },
        { group: 'Legal',     path: 'terms/',     icon: 'fa-file-contract',   label: 'Terms of Use' },
        { group: 'Legal',     path: 'contact/',   icon: 'fa-envelope',        label: 'Contact' },
    ];
    const siteLink = (l) => `<a href="${ROOT}${l.path}"><i class="fa-solid ${l.icon}"></i> <span data-i18n="${RBesc(l.label)}">${RBesc(RBt(l.label))}</span></a>`;
    window.RBSiteLinksHTML = () => SITE_LINKS.map(siteLink).join('\n');
    /* Where to get RDBK (#674 · #720): the two stores as official-style badges (from RBStore), and —
       with `computer` — the web app for Windows · Mac · Linux. Drawn into every `[data-get-app]`
       (home hero and install section, About); "stores" draws the badges alone. */
    window.RBGetAppHTML = (computer) => `<div class="store-badges">
            <a class="store-badge" href="${RBesc(RBStore.ios)}" target="_blank" rel="noopener" aria-label="${RBesc(RBt('Download on the App Store'))}"><i class="fa-brands fa-apple"></i><span><small>${RBesc(RBt('Download on the'))}</small><b>App Store</b></span></a>
            <a class="store-badge" href="${RBesc(RBStore.android)}" target="_blank" rel="noopener" aria-label="${RBesc(RBt('Get it on Google Play'))}"><i class="fa-brands fa-google-play"></i><span><small>${RBesc(RBt('Get it on'))}</small><b>Google Play</b></span></a>
        </div>` + (computer ? `<a class="get-app-web" href="${ROOT}install/"><i class="fa-solid fa-desktop"></i> <span>${RBesc(RBt('Windows · Mac · Linux: install the web app'))}</span></a>` : '');

    function renderChrome() {
        const rootPath = new URL(ROOT, location.href).pathname;
        const rel = location.pathname.slice(rootPath.length).replace(/^\/+/, '');
        const seg = rel.split('/')[0] || '';
        // Active entry within a bar: an exact segment match wins, else the entry that "covers" it.
        const activeKey = (keys) => keys.find((k) => k === seg) || keys.find((k) => (SECTION[k].covers || []).includes(seg)) || null;
        const navLabel = (k) => NAV_TRANSLATE[k] ? `<span data-i18n="${SECTION[k].label}">${SECTION[k].label}</span>` : SECTION[k].label;

        const webActive = activeKey(WEB_NAV);
        const navLinks = WEB_NAV.map((k) => {
            const s = SECTION[k];
            return `<a class="nav-link nav-tool${k === webActive ? ' active' : ''}" href="${ROOT}${s.path}"><i class="fa-solid ${s.icon} nav-ico"></i><span>${navLabel(k)}</span></a>`;
        }).join('');
        // Top bar — the desktop-web navigation only. Hidden on every mobile-width view (web · PWA ·
        // native), where the fixed bottom tab bar below takes over — so there is no hamburger and no
        // full-screen menu. The language is browser-detected; it is changed from the Profile page or
        // the desktop footer's picker, never from the nav.
        let header = document.querySelector('header.topbar') || document.querySelector('header');
        if (!header) { header = document.createElement('header'); document.body.prepend(header); }
        header.className = 'topbar';
        header.innerHTML = `<div class="wrap">
            <span class="brand-wrap"><a class="brand" href="${ROOT}"><img class="brand-logo" src="${ROOT}assets/logo.png" alt=""> RDBK.app</a></span>
            <nav class="topnav" id="topnav">${navLinks}</nav>
        </div>`;

        let footer = document.querySelector('footer.foot');
        if (!footer) { footer = document.createElement('footer'); footer.className = 'foot'; document.body.appendChild(footer); }
        // The footer (#729): the brand with its claim and the store badges, the links in three columns
        // (the product's sections, then the site's own), and a bottom line with ©, version and language.
        const column = (title, links) => `<nav class="foot-col" aria-label="${RBesc(RBt(title))}"><h4 data-i18n="${title}">${RBesc(RBt(title))}</h4>${links}</nav>`;
        footer.innerHTML = `<div class="wrap foot-grid">
            <div class="foot-brand">
                <a class="brand" href="${ROOT}"><img class="brand-logo" src="${ROOT}assets/logo.png" alt=""> RDBK.app</a>
                <p data-i18n="foot.claim">${RBt('foot.claim')}</p>
                <div data-get-app="stores"></div>
            </div>
            ${column('Product', WEB_NAV.map((k) => siteLink(SECTION[k])).join(''))}
            ${['Resources', 'Legal'].map((g) => column(g, SITE_LINKS.filter((l) => l.group === g).map(siteLink).join(''))).join('')}
        </div>
        <div class="wrap foot-bottom">
            <span class="lang"></span>
            <span>© ${new Date().getFullYear()} RDBK.app · <span data-i18n="All rights reserved.">${RBt('All rights reserved.')}</span></span>
            <span id="appVersion"></span>
        </div>`;

        // The Profile page repeats the site links where the footer is hidden — same list, filled here.
        const accLinks = document.getElementById('accSiteLinks');
        if (accLinks) accLinks.innerHTML = RBSiteLinksHTML();
        document.querySelectorAll('[data-get-app]').forEach((el) => { el.innerHTML = RBGetAppHTML(el.dataset.getApp !== 'stores'); });

        // Fixed icon-only bottom tab bar (Instagram-style). Always in the DOM; CSS shows it on
        // every mobile-width view — web, installed PWA and the native app — and hides it on desktop
        // (where the top bar is used instead). One catalog, two presentations.
        const appActive = activeKey(APP_TABS);
        let bar = document.querySelector('nav.app-tabbar');
        if (!bar) { bar = document.createElement('nav'); document.body.appendChild(bar); }
        bar.className = 'app-tabbar';
        bar.setAttribute('aria-label', RBt('Sections'));
        // labels are fixed, safe ASCII words; i18n.js localises the aria-label via data-i18n-aria.
        bar.innerHTML = APP_TABS.map((k) => {
            const s = SECTION[k];
            if (k === 'back') {
                return `<button type="button" class="tabbar-link" id="tabBackBtn" aria-label="${s.label}" data-i18n-aria="${s.label}"><i class="fa-solid ${s.icon}"></i></button>`;
            }
            if (k === 'profile') {
                return `<button class="tabbar-link${k === appActive ? ' active' : ''}" id="tabProfileBtn" aria-label="${s.label}" data-i18n-aria="${s.label}"><i class="fa-solid ${s.icon}"></i></button>`;
            }
            return `<a class="tabbar-link${k === appActive ? ' active' : ''}" href="${ROOT}${s.path}" aria-label="${s.label}" data-i18n-aria="${s.label}"><i class="fa-solid ${s.icon}"></i></a>`;
        }).join('');
    }
    try { renderChrome(); } catch (e) { console.warn('chrome', e); }
    // Safety net: if anything raced, ensure the header is filled once the DOM is ready.
    document.addEventListener('DOMContentLoaded', () => {
        const h = document.querySelector('header.topbar');
        if (h && !h.querySelector('.topnav')) { try { renderChrome(); } catch (e) {} }
    });

    /* ---------------- Service Worker ---------------- */
    let swReg = null;
    if (!isNativeApp() && 'serviceWorker' in navigator) {
        const hadController = !!navigator.serviceWorker.controller;
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!hadController || refreshing) return;
            refreshing = true; location.reload();
        });
        navigator.serviceWorker.register(ROOT + 'sw.js', { scope: ROOT, updateViaCache: 'none' })
            .then((reg) => { swReg = reg; reg.update().catch(() => {}); })
            .catch((e) => console.warn('SW:', e));
    }

    /* ---------------- Version system ---------------- */
    let appVer = null, refreshing = false, pendingRefresh = false;
    /* The release a version.json holds, never from a cache — the ONE place that reads one.
       `root` picks which: API_ROOT is the server's live release, ROOT is the copy this page was
       served with (in the app, the web content bundled into the binary). Null when unreachable. */
    window.RBLiveVersion = async (root) => {
        try {
            const j = await (await fetch((root || API_ROOT) + 'version.json', { cache: 'no-store' })).json();
            return j.version ? { version: j.version, build: j.build || 0 } : null;
        } catch (e) { return null; } // offline: the caller shows a dash, never a wrong number
    };
    /* What this copy IS, for the places that report it (About page · App Info): the platform in
       words, and the release actually running — the native binary in the app, which only Capacitor
       knows, or the version.json this web page booted with. */
    window.RBIsNativeApp = isNativeApp;
    window.RBPlatformName = () => isNativeApp()
        ? (RBDevice() === 'ios' ? RBt('iOS app') : RBt('Android app'))
        : (isStandalone() ? RBt('Web app (installed)') : RBt('Web app'));
    // A release in words, the same everywhere it is shown (footer · About · App Info): "v1.9.2 · build 100"
    window.RBReleaseText = (rel) => rel ? 'v' + rel.version + ' · build ' + rel.build : '—';
    window.RBRunningRelease = async () => {
        if (isNativeApp()) {
            try {
                const info = await Capacitor.Plugins.App.getInfo();
                return { version: info.version, build: info.build || 0 };
            } catch (e) { return null; }
        }
        // On the web the running release is the stamp this very document was served with — every
        // page carries it on its asset URLs. Read there, not from the live version.json, so a page
        // still serving yesterday's assets says so instead of claiming to be up to date.
        const stamped = document.querySelector('link[rel="stylesheet"][href*="app.css?v="]');
        const m = /(\d+\.\d+\.\d+)-(\d+)/.exec(stamped ? stamped.getAttribute('href') : (appVer || ''));
        return m ? { version: m[1], build: +m[2] } : null;
    };
    async function checkVersion() {
        // Never reload in the middle of an active session (e.g. a competition run in the Reader):
        // defer until it's free. window.RB_BUSY is set by the tool. The app never hot-refreshes —
        // its code is bundled and updates ship through the store — so this is web-only.
        if (!isNativeApp() && pendingRefresh && !window.RB_BUSY && !refreshing) { refreshing = true; return hardRefresh(); }
        const live = await RBLiveVersion();
        if (!live) return;                                // offline: retried on the next tick, keeps the last shown version
        const rel = live.version + '-' + live.build;      // unique per release (version stays, build always grows)
        const el = document.getElementById('appVersion'); if (el) el.textContent = RBReleaseText(live);
        if (isNativeApp()) return;                        // app: just show the live version; never hot-refresh
        if (appVer == null) { appVer = rel; return; }     // first read: set the reference
        if (rel !== appVer && !refreshing) {
            appVer = rel;
            if (window.RB_BUSY) pendingRefresh = true;    // wait for the session to end
            else { refreshing = true; await hardRefresh(); }
        }
    }
    async function hardRefresh() {
        try { if (swReg) await swReg.update(); } catch (e) {}
        try { if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k))); } catch (e) {}
        location.reload();
    }
    checkVersion();
    setInterval(checkVersion, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });

    /* ---------------- App info pop-up (account menus, #335, #474, #478) ----------------
       What this copy of RDBK.app is and whether it is current, in words a rider understands.
       In the app three numbers exist and each is named for what it is (#515): the VERSION (the one
       semver, the same on every surface), the APP BUILD (the store's own counter — Android's
       versionCode, iOS's build) and the WEB CONTENT bundled into the binary the day it was built.
       The web deploys between store releases without moving the version, so the server's content
       can be ahead of the app's while the store has nothing newer: that is said as it is, never as
       "update from the store". The server row is the backend this copy talks to — in the app the
       page itself is served from a WebView-local origin, which is no environment at all. */
    // Where this copy stands, pure: { kind, text, version? } — kind: ok · pending (web content ahead
    // of the app, arriving with its next store release) · store (a newer version is out) · refresh
    // (the web page is behind the server) · unknown (offline)
    window.RBReleaseStatus = ({ native, running, bundled, live }) => {
        const newer = (a, b) => {
            const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
            for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
            return false;
        };
        if (!live || !running) return { kind: 'unknown', text: 'Could not check for updates. Are you offline?' };
        if (native) {
            if (newer(live.version, running.version)) return { kind: 'store', text: 'Version {v} is available. Update the app from the store.', version: live.version };
            if (bundled && live.build > bundled.build) return { kind: 'pending', text: 'The app is up to date. Some improvements already on the website will reach the app with its next update.' };
            return { kind: 'ok', text: 'The app is up to date.' };
        }
        if (live.version !== running.version || live.build !== running.build) return { kind: 'refresh', text: 'A newer version is available. Refresh to load it.' };
        return { kind: 'ok', text: 'You have the latest version.' };
    };
    // The facts App Info and the About page both show: [label, value] rows and the status above
    window.RBReleaseFacts = async () => {
        const native = isNativeApp();
        const [running, live, bundled] = await Promise.all([RBRunningRelease(), RBLiveVersion(), native ? RBLiveVersion(ROOT) : null]);
        const host = API_ROOT.replace(/^https?:\/\//, '').replace(/\/+$/, '');
        const facts = [['Platform', RBPlatformName()]];
        if (native) facts.push(
            ['Version', running ? 'v' + running.version : '—'],
            ['App build', running ? String(running.build) : '—'],
            ['Web content', bundled ? 'build ' + bundled.build : '—']);
        else facts.push(['Version', RBReleaseText(running)]);
        facts.push(
            ['Latest release', RBReleaseText(live)],
            ['Server', host],
            ['Environment', RBt(API_ROOT === PROD_ROOT ? 'Production' : 'Development')]);
        return { facts, status: RBReleaseStatus({ native, running, bundled, live }) };
    };
    const STATUS_ICON = { ok: 'fa-circle-check', pending: 'fa-circle-info', store: 'fa-circle-arrow-up', refresh: 'fa-circle-arrow-up', unknown: 'fa-wifi' };
    window.RBReleaseStatusHTML = (status) => `<p class="release-status ${status.kind}"><i class="fa-solid ${STATUS_ICON[status.kind]}"></i> <span>${RBesc(RBt(status.text).replace('{v}', status.version || ''))}</span></p>`;
    window.showAppInfo = async function () {
        const { facts, status } = await RBReleaseFacts();
        const storeUrl = status.kind === 'store' ? RBStore[RBDevice() === 'ios' ? 'ios' : 'android'] : null;
        const row = ([label, value]) => `<tr><td>${RBesc(RBt(label))}</td><td>${RBesc(value)}</td></tr>`;
        const modal = RBModal(`<div class="app-info-card">
            <h2><i class="fa-solid fa-circle-info"></i> ${RBt('App Info')}</h2>
            ${RBReleaseStatusHTML(status)}
            <table class="app-info-table">${facts.map(row).join('')}</table>
            <div class="btnrow spaced">
                ${storeUrl ? `<a class="btn btn-primary" href="${storeUrl}" target="_blank" rel="noopener"><i class="fa-solid fa-rotate"></i> ${RBt('Update')}</a>` : ''}
                ${status.kind === 'refresh' ? `<button class="btn btn-primary" id="appInfoUpdate"><i class="fa-solid fa-rotate"></i> ${RBt('Update')}</button>` : ''}
                <a class="btn btn-ghost" href="${ROOT}changelog/"><i class="fa-solid fa-clock-rotate-left"></i> ${RBt('What’s new')}</a>
            </div>
            <div class="muted small app-info-foot"><a href="https://rdbk.app" target="_blank" rel="noopener">rdbk.app</a> · © ${new Date().getFullYear()} RDBK.app</div>
        </div>`, 'narrow');
        const up = modal.q('#appInfoUpdate');
        if (up) up.onclick = () => { modal.close(); hardRefresh(); };
    };

    /* ---------------- Activity log modal (#448): the same timeline for everyone, filtered by
       user type — plain users see only their own rows (activity_mine), admins may also pick
       any user (admin_activity). Opened from the account menus as "My activity". */
    // The activity log — ONE viewer (#665): your own from the account menu, or, for an admin, any
    // user's (a search in the dialog, or opened straight on one with { user } from the user list).
    // Search, pager, dates in the UI language, the admin's stats line and a CSV export.
    window.RBActivityLog = async function (opts) {
        const cfg = await window.RBConfig();
        const me = cfg.user || null;
        if (!me) { window.RBNeedAuth(); return; }
        const isAdmin = !!me.is_admin;
        let target = (opts && opts.user) || null, actPage = 1, actQuery = '';
        const title = () => target ? `${RBesc(RBt('Activity'))} · @${RBesc(target.username)}` : RBesc(RBt('My activity'));
        // One search field for the log, the CSV beside the title, and — for an admin — whose log it
        // is, changed through the shared user picker (#731): never a second search box glued on.
        const m = RBModal(`<div class="head-row"><h2><i class="fa-solid fa-clock-rotate-left icon-accent"></i> <span id="myActTitle">${title()}</span></h2>
                <button class="btn btn-ghost btn-sm" id="myActCsv" type="button"><i class="fa-solid fa-file-csv"></i> CSV</button></div>
            ${isAdmin ? `<div class="toolbar"><span class="muted small">${RBesc(RBt('Showing'))}</span> <b id="myActWho"></b>
                <button class="btn btn-ghost btn-sm" id="myActPickBtn" type="button"><i class="fa-solid fa-user"></i> ${RBesc(RBt('Another user…'))}</button>
                <button class="btn btn-ghost btn-sm" id="myActMe" type="button" hidden>${RBesc(RBt('Me'))}</button></div>` : ''}
            <div class="rb-toolbar"><i class="fa-solid fa-magnifying-glass"></i><input type="search" class="rb-search" id="myActSearch" placeholder="${RBesc(RBt('Search the activity…'))}" aria-label="${RBesc(RBt('Search the activity…'))}" autocomplete="off" spellcheck="false"></div>
            <div id="myActBody" class="muted small">${RBesc(RBt('Loading…'))}</div>
            <div class="pager" id="myActPager"></div>`, 'wide');
        const fetchPage = (page, perPage) => (isAdmin && target)
            ? RBApi('admin_activity', { id: target.id, page, per_page: perPage, q: actQuery })
            : RBApi('activity_mine', { page, per_page: perPage, q: actQuery });
        let actSeq = 0; // only the latest request paints: a slow answer to an older search is dropped
        const loadAct = () => {
            const seq = ++actSeq;
            m.q('#myActTitle').innerHTML = title();
            if (isAdmin) { m.q('#myActWho').textContent = '@' + (target || me).username; m.q('#myActMe').hidden = !target; }
            fetchPage(actPage, 20).then((r) => {
                if (seq !== actSeq) return;
                const body = m.q('#myActBody');
                if (!r.ok) { body.textContent = RBt(r.error || 'Could not load.'); return; }
                const stats = r.stats ? `<p class="hint">${r.stats.roadbooks} ${RBesc(RBt('roadbooks'))} · ${RBFmtSize(r.stats.bytes)}</p>` : '';
                body.innerHTML = stats + ((r.events || []).length
                    ? `<table class="act-table"><tbody>${r.events.map((e) => `<tr><td class="small">${RBesc(RBFmtDateTime(e.created_at))}</td><td>${RBesc((e.action || '').replace(/_/g, ' '))}</td><td class="muted small">${RBesc(e.detail || '')}</td>${e.ip != null ? `<td class="muted small">${RBesc(e.ip || '')}</td>` : ''}</tr>`).join('')}</tbody></table>`
                    : `<p class="muted small">${RBesc(RBt('No activity yet.'))}</p>`);
                const pages = Math.max(1, Math.ceil((r.total || 0) / (r.per_page || 20)));
                RBPager(m.q('#myActPager'), actPage, pages, (p) => { actPage = p; loadAct(); });
            });
        };
        m.q('#myActSearch').oninput = RBDebounce(() => { actQuery = m.q('#myActSearch').value; actPage = 1; loadAct(); });
        // the whole (filtered) log as CSV, fetched 100 at a time; an empty log says so
        m.q('#myActCsv').onclick = async (e) => {
            const busy = RBBusy(e.currentTarget), rows = [];
            for (let p = 1; ; p++) {
                const r = await fetchPage(p, 100);
                if (!r.ok) { busy.reset(); return RBToast(r.error || 'Could not load.'); }
                rows.push(...r.events);
                if (p * r.per_page >= r.total) break;
            }
            if (!rows.length) { busy.reset(); return RBToast('No activity yet.'); }
            busy.ok();
            RBDownload(RBCsv([['created_at', 'action', 'detail', 'ip'], ...rows.map((ev) => [ev.created_at, ev.action, ev.detail, ev.ip])]), 'activity_' + (target ? target.username : me.username) + '.csv');
        };
        if (isAdmin) {
            let everyone = null; // the user list, fetched on the first pick
            m.q('#myActMe').onclick = () => { target = null; actPage = 1; loadAct(); };
            m.q('#myActPickBtn').onclick = async () => {
                if (!everyone) {
                    const r = await RBApi('admin_users');
                    if (!r.ok) return RBToast(r.error || 'Could not load.');
                    everyone = r.users;
                }
                RBRowPicker({
                    title: 'Activity', icon: 'fa-clock-rotate-left', card: 'narrow', lead: 'Whose activity?',
                    items: everyone, fields: ['username', 'name', 'email'], limit: 50, empty: 'No users yet.',
                    rowHTML: (u, i) => `<button class="mv-opt" data-pick="${i}"><b>@${RBesc(u.username)}</b> <span class="muted small">${RBesc(u.name || '')}</span></button>`,
                    onPick: (u, picker) => { picker.close(); target = u.id === me.id ? null : u; actPage = 1; loadAct(); },
                });
            };
        }
        loadAct();
    };

    /* ---------------- Install (PWA) + iOS ---------------- */
    const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    // iPadOS reports as "Macintosh" (desktop-class UA) unless it's a touch device — catches iPhone/iPad/iPod alike.
    const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    // The device this page runs on: 'ios' · 'android' · 'desktop'. UA-based on purpose — it decides
    // which INSTALL INSTRUCTIONS to show, never whether a feature exists. Shared so the Install chip
    // and the /install/ guide always agree on the device (#333). RBPlatform answers a different
    // question: which native shell (if any) we are inside.
    window.RBDevice = () => (isIOS() ? 'ios' : (/android/i.test(navigator.userAgent) ? 'android' : 'desktop'));
    let deferred = null, installBtn = null;

    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; showInstall(); });
    window.addEventListener('appinstalled', () => { deferred = null; if (installBtn) installBtn.hidden = true; });

    // A floating stack, above the bottom tab bar on mobile and bottom-right on desktop, for the
    // contextual chips (Install prompt, unsaved-work alert). Independent of the top bar, which is
    // hidden on every mobile-width view — so the chips work on every layout. Created on first use.
    function chipStack() {
        let s = document.querySelector('.app-chip-stack');
        if (!s) { s = document.createElement('div'); s.className = 'app-chip-stack'; document.body.appendChild(s); }
        return s;
    }
    // The chip carries its own small red close button (#793): someone not interested closes it once
    // and it stays closed on this device.
    const INSTALL_CLOSED_KEY = 'rb_install_chip_closed';
    const installClosed = () => { try { return !!localStorage.getItem(INSTALL_CLOSED_KEY); } catch (e) { return false; } };
    function ensureBtn() {
        if (installBtn || isStandalone()) return installBtn;
        installBtn = document.createElement('div');
        installBtn.className = 'install-chip';
        installBtn.hidden = true;
        installBtn.innerHTML = `<button type="button" class="install-btn" id="installBtn"><i class="fa-solid fa-circle-down"></i> ${RBt('Install')}</button>`
            + `<button type="button" class="chip-close" aria-label="${RBesc(RBt('Close'))}" title="${RBesc(RBt('Close'))}"><i class="fa-solid fa-xmark"></i></button>`;
        installBtn.querySelector('.install-btn').onclick = onInstall;
        installBtn.querySelector('.chip-close').onclick = () => { try { localStorage.setItem(INSTALL_CLOSED_KEY, '1'); } catch (e) {} installBtn.hidden = true; };
        chipStack().prepend(installBtn);
        return installBtn;
    }
    // Never offer "Install" inside the native app: it IS the app, and a Capacitor WebView is not
    // display-mode:standalone / navigator.standalone, so without this it would wrongly show (#198).
    // …nor on the install guide itself, the page the chip leads to (#794).
    function showInstall() { if (isStandalone() || isNativeApp() || installClosed() || /\/install\/?$/.test(location.pathname)) return; const b = ensureBtn(); if (b) b.hidden = false; }
    // The captured install prompt, shared with the /install/ guide (#333) so both offer the same
    // one-tap install. Chromium only — iOS Safari never fires beforeinstallprompt, which is exactly
    // why the guide exists.
    window.RBInstallPrompt = {
        available: () => !!deferred,
        async fire() {
            if (!deferred) return false;
            deferred.prompt();
            const r = await deferred.userChoice; deferred = null;
            if (r.outcome === 'accepted' && installBtn) installBtn.hidden = true;
            return r.outcome === 'accepted';
        },
    };
    // The chip always opens the install guide (#720): it leads with the native apps on a phone, and
    // on a computer it offers the browser's one-tap install itself.
    function onInstall() { location.href = ROOT + 'install/'; }
    // iOS Safari never fires beforeinstallprompt: offer the button when not installed (never in the app).
    if (isIOS() && !isStandalone() && !isNativeApp()) document.addEventListener('DOMContentLoaded', showInstall);

    /* ---------------- Client-side image downscaler ----------------
       Shrinks photos in the browser BEFORE upload so they never hit PHP's
       post_max_size and uploads stay tiny. Used by avatar + gallery + logo. */
    window.RBImg = {
        // an image file drawn onto a canvas no larger than `max` px on its longest side
        canvas(file, max) {
            return new Promise((res, rej) => {
                const img = new Image();
                img.onload = () => {
                    const sc = Math.min(1, max / Math.max(img.width, img.height));
                    const w = Math.max(1, Math.round(img.width * sc)), h = Math.max(1, Math.round(img.height * sc));
                    const c = document.createElement('canvas'); c.width = w; c.height = h;
                    c.getContext('2d').drawImage(img, 0, 0, w, h);
                    URL.revokeObjectURL(img.src); res(c);
                };
                img.onerror = (e) => { URL.revokeObjectURL(img.src); rej(e); };
                img.src = URL.createObjectURL(file);
            });
        },
        // → a small JPEG Blob (for upload). Falls back to the original file if anything fails.
        async toBlob(file, max = 900, q = 0.82) {
            if (!file || !/^image\//.test(file.type)) return file;
            try { const c = await this.canvas(file, max); return await new Promise((r) => c.toBlob((b) => r(b || file), 'image/jpeg', q)); }
            catch (e) { return file; }
        },
        // → a PNG data: URI (for embedding, e.g. the event logo — keeps transparency)
        async toDataURL(file, max = 256) { const c = await this.canvas(file, max); return c.toDataURL('image/png'); },
        // → {lat, lon} from a JPEG's EXIF GPS, or null. Only JPEG exposes readable EXIF
        // here; PNG/HEIC return null (the caller then asks the user to place it on the map).
        async gps(file) {
            if (!file || !/jpe?g/i.test(file.type || '')) return null;
            try {
                const v = new DataView(await file.slice(0, 262144).arrayBuffer());
                if (v.getUint16(0) !== 0xFFD8) return null; // not a JPEG
                for (let off = 2; off + 4 < v.byteLength;) {
                    const marker = v.getUint16(off);
                    if ((marker & 0xFF00) !== 0xFF00) break;
                    if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) return exifGps(v, off + 10); // APP1 "Exif"
                    off += 2 + v.getUint16(off + 2);
                }
            } catch (e) {}
            return null;
        },
    };
    // Parse the GPS IFD of an EXIF/TIFF block starting at `tiff`. Lat/Lon are 3 rationals
    // (deg, min, sec) with an N/S · E/W ref; returns decimal degrees or null.
    function exifGps(v, tiff) {
        const little = v.getUint16(tiff) === 0x4949;
        const u16 = (o) => v.getUint16(o, little), u32 = (o) => v.getUint32(o, little);
        if (v.getUint16(tiff + 2, little) !== 0x002A) return null;
        const ifd0 = tiff + u32(tiff + 4);
        let gpsIfd = 0;
        for (let i = 0, n = u16(ifd0); i < n; i++) { const e = ifd0 + 2 + i * 12; if (u16(e) === 0x8825) { gpsIfd = tiff + u32(e + 8); break; } }
        if (!gpsIfd) return null;
        const g = {};
        for (let i = 0, n = u16(gpsIfd); i < n; i++) {
            const e = gpsIfd + 2 + i * 12, tag = u16(e);
            if (tag === 1 || tag === 3) g[tag] = String.fromCharCode(v.getUint8(e + 8)); // lat/lon ref
            else if (tag === 2 || tag === 4) { const p = tiff + u32(e + 8), rat = (o) => u32(o + 4) ? u32(o) / u32(o + 4) : 0; g[tag] = rat(p) + rat(p + 8) / 60 + rat(p + 16) / 3600; } // 3 rationals
        }
        if (g[2] == null || g[4] == null) return null;
        let lat = g[1] === 'S' ? -g[2] : g[2], lon = g[3] === 'W' ? -g[4] : g[4];
        return (isFinite(lat) && isFinite(lon) && (lat || lon)) ? { lat, lon } : null;
    }

    /* ---------------- Shared UI primitives (the one home for these) ----------------
       Every page reuses these instead of re-implementing them — see CLAUDE.md. */
    // Overlay modal. Pass the card's inner HTML (+ optional card style + dismiss callback +
    // options). A dialog you can leave without deciding anything is dismissable: Escape, a
    // backdrop click or its corner close (RBModalX) leave it, and it carries no Close / Cancel
    // button of its own. `dismissable: false` is a dialog that asks for a decision — only its own
    // buttons leave it. `corner: true` with it: a form whose typed input a stray backdrop tap must
    // not lose, left deliberately from the corner. Returns { el, q(sel), close }.
    // Dialog focus management for a `.modal-card`: moves focus in, cycles Tab
    // inside, Escape → onEscape; returns release() (detaches + restores focus).
    // Reused by RBModal AND the Reader's static dialogs — one home for the logic.
    window.RBFocusTrap = (card, onEscape) => {
        const prevFocus = document.activeElement;
        const focusable = () => [...card.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
        function onKey(e) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (onEscape) onEscape(); return; }
            if (e.key !== 'Tab') return; // trap Tab within the dialog
            const f = focusable(); if (!f.length) { e.preventDefault(); card.focus(); return; }
            const first = f[0], last = f[f.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        document.addEventListener('keydown', onKey, true);
        setTimeout(() => { const f = focusable(); (f[0] || card).focus(); }, 0); // move focus into the dialog
        return () => { document.removeEventListener('keydown', onKey, true); if (prevFocus && prevFocus.focus) prevFocus.focus(); };
    };
    // The corner close of a dialog card (RBModal's, and the Reader's static ones): the card's
    // content moves into a scrolling .modal-body, and the red disc sits on its top-right vertex.
    window.RBModalX = (card, onClose) => {
        if (card.classList.contains('has-x')) return;
        const body = document.createElement('div'); body.className = 'modal-body';
        while (card.firstChild) body.appendChild(card.firstChild);
        const x = document.createElement('button');
        x.type = 'button'; x.className = 'modal-x'; x.title = RBt('Close'); x.setAttribute('aria-label', RBt('Close'));
        x.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        x.onclick = onClose;
        card.append(body, x); card.classList.add('has-x');
    };
    window.RBModal = (cardHtml, cardClass, onDismiss, opts) => {
        const dismissable = !(opts && opts.dismissable === false), corner = dismissable || !!(opts && opts.corner);
        const m = document.createElement('div'); m.className = 'modal';
        const card = document.createElement('div');
        card.className = 'modal-card' + (cardClass ? ' ' + cardClass : '');
        card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.tabIndex = -1;
        card.innerHTML = cardHtml;
        m.appendChild(card);
        document.body.appendChild(m);
        let release;
        const close = () => { if (release) release(); m.remove(); };
        const dismiss = () => { close(); if (onDismiss) onDismiss(); };
        if (corner) RBModalX(card, dismiss);
        // a dismissable dialog also leaves on Escape and a backdrop click; a decision ignores both
        // and is left only through its own buttons (Escape still traps focus)
        release = RBFocusTrap(card, dismissable ? dismiss : null);
        if (dismissable) m.addEventListener('click', (e) => { if (e.target === m) dismiss(); });
        return { el: m, q: (s) => m.querySelector(s), close };
    };
    // Metres → "12.34 km", the one distance format (#732); `digits` for the precision the place needs.
    window.RBKm = (m, digits = 2) => ((m || 0) / 1000).toFixed(digits) + ' km';
    // The ONE vehicle table (#713): each vehicle's icon + label, for the small icons on the cards
    // (#745) and the segmented toggles of the gallery filter and the Editor settings alike
    const VEHICLE_ICON = { car: ['fa-truck-monster', '4x4'], moto: ['fa-motorcycle', 'Motorbike'], bike: ['fa-person-biking', 'Bicycle'] };
    window.RBVehicleSegmentsHTML = () => Object.entries(VEHICLE_ICON).map(([v, [icon, label]]) =>
        `<button class="segment" type="button" data-vehicle="${v}" aria-pressed="false"><i class="fa-solid ${icon}"></i> <span data-i18n="${label}">${RBesc(RBt(label))}</span></button>`).join('');
    window.RBVehicleIcons = (list) => (list || []).length ? `<span class="vehicle-icons">${list.map((v) => `<i class="fa-solid ${VEHICLE_ICON[v][0]}" title="${RBesc(RBt(VEHICLE_ICON[v][1]))}" aria-label="${RBesc(RBt(VEHICLE_ICON[v][1]))}"></i>`).join('')}</span>` : '';
    // Shared roadbook one-liner subtitle: "12.3 km · 45 notes" (translated unit word).
    window.RBSummary = (distanceM, noteCount) => RBKm(distanceM, 1) + ' · ' + noteCount + ' ' + RBt('notes');
    // The publication-status select (draft → ready → public), for My roadbooks and the admin's
    // per-user list alike; `dataAttr` names the attribute its row handler reads.
    window.RBStatusSelectHTML = (rb, dataAttr) => `<select class="rb-status rb-status-${rb.status}" ${dataAttr}="${rb.id}" aria-label="${RBesc(RBt('Status'))}" title="${RBesc(RBt('Status'))}">${RB.ROADBOOK_STATUSES.map((s) => `<option value="${s}"${rb.status === s ? ' selected' : ''}>${RBesc(RBt(RBStatusLabel[s]))}</option>`).join('')}</select>`;
    /* A crash checkpoint in localStorage (the Editor draft, a Reader / Tripmaster run, a GPX log) —
       one way to read, write, clear and decline them. A declined checkpoint is MARKED, never
       deleted (#436): asking twice is nagging, deleting is data loss; the next checkpoint written
       replaces it. */
    window.RBCheckpoint = {
        read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } },
        write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} },
        decline(key) { const v = this.read(key); if (v) this.write(key, Object.assign(v, { declined: true })); },
    };
    // Set SEO meta at runtime for the public dynamic pages (challenge, event): title + description
    // + canonical, keeping the og:/twitter: mirrors in sync. Creates any missing tag; skips nulls.
    window.RBSetMeta = ({ title, description, canonical, robots }) => {
        const meta = (key, kind) => {
            let el = document.head.querySelector(`meta[${kind}="${key}"]`);
            if (!el) { el = document.createElement('meta'); el.setAttribute(kind, key); document.head.appendChild(el); }
            return el;
        };
        if (title != null) {
            document.title = title;
            meta('og:title', 'property').setAttribute('content', title);
            meta('twitter:title', 'name').setAttribute('content', title);
        }
        if (robots != null) meta('robots', 'name').setAttribute('content', robots);
        if (description != null) {
            meta('description', 'name').setAttribute('content', description);
            meta('og:description', 'property').setAttribute('content', description);
            meta('twitter:description', 'name').setAttribute('content', description);
        }
        if (canonical != null) {
            let link = document.head.querySelector('link[rel="canonical"]');
            if (!link) { link = document.createElement('link'); link.setAttribute('rel', 'canonical'); document.head.appendChild(link); }
            link.setAttribute('href', canonical);
            meta('og:url', 'property').setAttribute('content', canonical);
        }
    };
    /* Rows (arrays of cells, the header first) → a CSV Blob, the one way every export writes one:
       RFC-4180 quoting where a cell needs it, and a UTF-8 BOM so a spreadsheet opens accented
       names and cities as they are instead of as mojibake. */
    const csvCell = (v) => /[",\r\n]/.test(v = String(v ?? '')) ? '"' + v.replace(/"/g, '""') + '"' : v;
    window.RBCsv = (rows) => new Blob(['\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    // Human-readable byte size, e.g. "12.3 MB" / "640 KB" (shared by the storage indicator + admin).
    window.RBFmtSize = (b) => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
    /* A timestamp in the reader's language: the date as RBFmtDate writes it plus the clock.
       Takes what the API returns ("YYYY-MM-DD HH:MM:SS") or a Date. */
    window.RBFmtDateTime = (value) => {
        const d = value instanceof Date ? value : new Date(String(value || '').replace(' ', 'T'));
        if (isNaN(d.getTime())) return String(value || '');
        const lang = window.RBi18n ? RBi18n.current() : undefined;
        return d.toLocaleDateString(lang) + ' ' + d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
    };
    // An ISO YYYY-MM-DD date in the ACTIVE UI language's format (event dates). The parts are
    // used as-is — never parsed as UTC, so the day can’t shift across timezones.
    window.RBFmtDate = (iso) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
        if (!m) return iso || '';
        return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(window.RBi18n ? RBi18n.current() : undefined);
    };
    // Locale-aware date field (issue #152): shows/enters the date in the ACTIVE UI language while
    // the real <input type="date"> — kept in the DOM with its id and ISO value — holds the value
    // and drives the native picker. The native input sits transparent on top (a click opens the
    // picker, the keyboard still operates it) and the localized text shows through behind it.
    // Every <input type="date"> is enhanced automatically, so callers keep using input.value (ISO).
    window.RBDateField = (input) => {
        if (!input || input.dataset.rbdf) return;
        input.dataset.rbdf = '1';
        const wrap = document.createElement('span');
        wrap.className = 'rb-datefield';
        input.parentNode.insertBefore(wrap, input);
        const disp = document.createElement('span');
        disp.className = 'field rb-date-display';
        disp.setAttribute('aria-hidden', 'true');
        input.classList.add('field', 'rb-datefield-native');
        wrap.appendChild(disp);
        wrap.appendChild(input);
        const refresh = () => {
            const iso = input.value;
            disp.textContent = iso ? RBFmtDate(iso) : RBt('Select date');
            disp.classList.toggle('rb-date-empty', !iso);
        };
        input.addEventListener('input', refresh);
        input.addEventListener('change', refresh);
        input.addEventListener('click', () => { try { if (input.showPicker) input.showPicker(); } catch (e) {} });
        window.addEventListener('rb-lang', refresh);
        // a form loading an existing record sets input.value = iso programmatically → refresh the text
        const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        Object.defineProperty(input, 'value', {
            configurable: true,
            get() { return desc.get.call(this); },
            set(v) { desc.set.call(this, v); refresh(); },
        });
        refresh();
    };
    // iOS Safari zooms the page on a pinch whatever the viewport meta says (#933): its own gesture
    // events are refused everywhere but on a map, which zooms itself.
    document.addEventListener('gesturestart', (e) => { if (!(e.target.closest && e.target.closest('.maplibregl-map'))) e.preventDefault(); }, { passive: false });
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('input[type="date"]').forEach((inp) => { try { RBDateField(inp); } catch (e) {} });
    });

    // The one chevron pager (‹ page/pages ›, plus an optional trailing label): empty on a single
    // page (the label alone stays, e.g. a result count). onGo(page) fires already clamped.
    window.RBPager = (el, page, pages, onGo, label) => {
        if (!el) return;
        el.innerHTML = pages > 1
            ? `<button class="btn btn-ghost" data-pg="${page - 1}"${page <= 1 ? ' disabled' : ''} aria-label="${RBesc(RBt('Previous'))}"><i class="fa-solid fa-chevron-left"></i></button><span class="muted small">${page} / ${pages}${label ? ' · ' + label : ''}</span><button class="btn btn-ghost" data-pg="${page + 1}"${page >= pages ? ' disabled' : ''} aria-label="${RBesc(RBt('Next'))}"><i class="fa-solid fa-chevron-right"></i></button>`
            : (label ? `<span class="muted small">${label}</span>` : '');
        el.querySelectorAll('[data-pg]').forEach((b) => b.onclick = () => { const p = +b.dataset.pg; if (p >= 1 && p <= pages) onGo(p); });
    };
    /* A search box that asks the server wants its call to wait until the typing stops: `fn` runs
       `ms` after the last call, with that call's arguments; `.cancel()` drops a pending run (a
       dialog closed mid-typing). Pair it with a sequence guard in the fetch, so a slow answer to an
       older query never paints over a newer one. */
    window.RBDebounce = (fn, ms = 300) => {
        let timer = null;
        const run = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
        run.cancel = () => clearTimeout(timer);
        return run;
    };
    /* One filtered, paged list: filter → clamp the cursor → slice → draw → pager. Four lists wrote
       the same four lines each (public roadbooks · events · My roadbooks · user management),
       including the same clamp for when a filter shrinks the list under the current page.
       `source()` returns everything, `filter()` narrows it, `draw(slice, total)` paints it, and
       `label(total)` is what the pager shows when there is only one page. */
    window.RBPagedList = ({ pager, per, source, filter, draw, label }) => {
        let page = 1;
        const list = {
            render() {
                const items = filter ? filter(source()) : source();
                const pages = Math.max(1, Math.ceil(items.length / per));
                if (page > pages) page = pages;
                draw(items.slice((page - 1) * per, page * per), items.length);
                RBPager(pager, page, pages, (p) => { page = p; list.render(); }, label ? label(items.length) : '');
            },
            reset() { page = 1; list.render(); }, // a new search or filter starts at the first page
        };
        return list;
    };
    /* Pick one thing from a list, in a dialog: the Reader's "your roadbooks" and the Editor's
       "public roadbooks" were two hand-rolled copies of the same modal, neither of which could
       be searched — painful once you have more than a screenful (#493). `rowHTML(item)` draws a
       row, `fields` are what the search box looks at, and the search only appears when the list
       is long enough to need it. */
    window.RBRowPicker = ({ title, icon = 'fa-book', lead = '', items, fields, rowHTML, onPick, empty, limit = 0, card = 'wide' }) => {
        const searchable = items.length > 5;
        const modal = RBModal(`<h2><i class="fa-solid ${icon} icon-accent"></i> ${RBesc(RBt(title))}</h2>
            ${lead ? `<p class="muted small">${RBesc(RBt(lead))}</p>` : ''}
            ${searchable ? `<div class="rb-toolbar"><i class="fa-solid fa-magnifying-glass"></i><input type="search" class="rb-search" placeholder="${RBesc(RBt('Search…'))}" aria-label="${RBesc(RBt('Search…'))}" autocomplete="off" spellcheck="false"></div>` : ''}
            <div class="challenge-list"></div>`, card);
        const list = modal.q('.challenge-list'), search = modal.q('.rb-search');
        const draw = (q) => {
            let shown = q ? RB.filterByText(items, q, fields) : items;
            if (limit) shown = shown.slice(0, limit);
            list.innerHTML = shown.length ? shown.map(rowHTML).join('')
                : `<p class="muted small">${RBesc(RBt('Nothing matches that search.'))}</p>`;
            list.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => onPick(shown[+b.dataset.pick], modal));
        };
        if (!items.length) list.innerHTML = `<p class="muted small">${RBesc(RBt(empty))}</p>`;
        else draw('');
        if (search) { search.oninput = () => draw(search.value); setTimeout(() => search.focus(), 50); }
        return modal;
    };
    // An event's date range for a meta line: "start – end", the single date, or '' when undated.
    window.RBDateRange = (startIso, endIso) => startIso ? (endIso && endIso !== startIso ? RBFmtDate(startIso) + ' – ' + RBFmtDate(endIso) : RBFmtDate(startIso)) : '';
    /* ONE card for every gallery (#770): the media on top — the photo or the route, darkened at the
       foot so what sits on it reads — carrying `badges` top-left, the `overlays` actions top-right
       and the key `stats` ([icon, value, label] — icon may be null) at its foot; the title and a
       `meta` line below, then `body`. `meta`/`overlays`/`badges`/`body`/`placeholder` are HTML the
       caller already escaped. The image always covers the media box, photo and logo alike.
       RBRoadbookCard and RBEventCard fill it the same way everywhere, so the cards read alike. */
    window.RBGalleryCard = ({ href, thumb, title, meta = '', icon = 'fa-map-location-dot', placeholder = '', overlays = '', badges = '', stats = [], body = '' }) =>
        (href ? `<a class="gallery-card" href="${RBesc(href)}">` : `<div class="gallery-card">`)
        + '<div class="card-media">'
        + (thumb ? `<img class="thumb" src="${RBesc(RBMediaSrc(thumb))}" alt="${RBesc(title)}" loading="lazy">`
                 : (placeholder || `<div class="thumb thumb-placeholder"><i class="fa-solid ${icon}"></i></div>`))
        + (badges ? `<div class="card-badges">${badges}</div>` : '')
        + (overlays ? `<div class="card-actions">${overlays}</div>` : '')
        + (stats.length ? `<div class="card-stats">${stats.map(([i, value, label]) => `<span${label ? ` title="${RBesc(label)}"` : ''}>${i ? `<i class="fa-solid ${i}"></i> ` : ''}${value}</span>`).join('')}</div>` : '')
        + '</div>'
        + `<div class="gallery-body"><h3>${RBesc(title)}</h3>${meta ? `<div class="gallery-meta">${meta}</div>` : ''}${body}</div>`
        + (href ? '</a>' : '</div>');
    // A roadbook's card: what it suits and its event category on the media, its length and notes at
    // the foot, its author below. No photo → the route's own shape (RBFillRoutes), never a stock icon.
    window.RBRoadbookCard = (r, { href, overlays = '', body = '', category = '' } = {}) => RBGalleryCard({
        href, thumb: r.thumb, title: r.title, overlays, body,
        placeholder: `<div class="thumb thumb-placeholder" data-route="${RBesc(r.slug || '')}"><i class="fa-solid fa-route"></i></div>`,
        badges: RBVehicleIcons(r.vehicles) + (category ? `<span class="card-chip">${RBesc(category)}</span>` : ''),
        stats: [['fa-route', RBKm(r.total_distance, 1), RBt('Distance')], ['fa-location-dot', String(r.note_count), RBt('Notes')]]
            .concat(r.completions ? [['fa-flag-checkered', r.completions + '×', RBt('Times completed')]] : []), // #868
        meta: r.username ? `<i class="fa-solid fa-circle-user"></i> @${RBesc(r.username)}` : '',
    });
    // An event's card: its image, a calendar tile with its first day, where it stands
    // (upcoming · live · ended), how many roadbooks and for which vehicles, who runs it and when.
    window.RBEventCard = (e) => {
        const today = new Date().toISOString().slice(0, 10);
        const state = e.ended ? ['ended', 'Ended'] : (e.starts_on && e.starts_on <= today ? ['live', 'Live'] : ['upcoming', 'Upcoming']);
        const day = e.starts_on ? new Date(e.starts_on + 'T12:00:00') : null;
        const lang = window.RBi18n ? RBi18n.current() : undefined; // the UI language, like RBFmtDate
        return RBGalleryCard({
            href: `/event/${encodeURIComponent(e.slug)}`, thumb: e.logo, title: e.title, icon: 'fa-flag-checkered',
            badges: (day ? `<span class="card-date"><b>${day.getDate()}</b><small>${RBesc(day.toLocaleDateString(lang, { month: 'short' }))}</small></span>` : ''),
            overlays: `<span class="card-chip state-${state[0]}">${RBesc(RBt(state[1]))}</span>`,
            stats: [['fa-book-open', `${e.roadbooks} ${RBesc(RBt('roadbooks'))}`]].concat(e.vehicles && e.vehicles.length ? [[null, RBVehicleIcons(e.vehicles)]] : []),
            meta: `<i class="fa-solid fa-circle-user"></i> @${RBesc(e.organizer)}${RBDateRange(e.starts_on, e.ends_on) ? ` · <i class="fa-solid fa-calendar-days"></i> ${RBesc(RBDateRange(e.starts_on, e.ends_on))}` : ''}`,
        });
    };
    /* A photo-less roadbook card shows its route: the track is fetched once per roadbook and drawn
       as a static SVG fit to the media box (equirectangular, lon scaled by cos(lat)). A roadbook
       that hides its map (map_access:false) keeps the icon — its shape is not revealed. */
    const routeShapes = {}; // slug → SVG ('' once known to have none), so each is fetched once
    function routeSvg(track) {
        if (!Array.isArray(track) || track.length < 2) return '';
        let pts = track;
        if (pts.length > 240) { const step = Math.ceil(pts.length / 240); pts = track.filter((_, i) => i % step === 0 || i === track.length - 1); }
        const W = 320, H = 200, pad = 18;
        const latM = pts.reduce((sum, p) => sum + (+p.lat), 0) / pts.length;
        const k = Math.cos(latM * Math.PI / 180) || 1;
        const X = pts.map((p) => (+p.lon) * k), Y = pts.map((p) => -(+p.lat));
        const minX = Math.min(...X), maxX = Math.max(...X), minY = Math.min(...Y), maxY = Math.max(...Y);
        const spanX = (maxX - minX) || 1e-9, spanY = (maxY - minY) || 1e-9;
        const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
        const offX = (W - spanX * scale) / 2, offY = (H - spanY * scale) / 2;
        const d = pts.map((p, i) => `${((X[i] - minX) * scale + offX).toFixed(1)},${((Y[i] - minY) * scale + offY).toFixed(1)}`).join(' ');
        return `<svg class="thumb thumb-route" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${RBesc(RBt('route map'))}"><rect width="${W}" height="${H}"/><polyline points="${d}"/></svg>`;
    }
    window.RBFillRoutes = (container) => {
        if (!container) return;
        container.querySelectorAll('.thumb-placeholder[data-route]').forEach((el) => {
            const slug = el.getAttribute('data-route'); if (!slug) return;
            if (routeShapes[slug] != null) { if (routeShapes[slug]) el.outerHTML = routeShapes[slug]; return; }
            routeShapes[slug] = ''; // in flight: never fetched twice
            RBApi('public_get', { slug }).then((j) => {
                const m = j.ok && j.roadbook && j.roadbook.meta;
                const svg = (!m || m.map_access === false) ? '' : routeSvg(j.roadbook.track);
                routeShapes[slug] = svg;
                if (svg) document.querySelectorAll(`.thumb-placeholder[data-route="${CSS.escape(slug)}"]`).forEach((cur) => { cur.outerHTML = svg; });
            });
        });
    };
    /* A thumbnail whose file is gone (a deleted photo, a failed upload) shows the card's own
       placeholder, never its alt text on a grey box: one capture-phase listener (`error` does not
       bubble) swaps it in. */
    document.addEventListener('error', (e) => {
        const img = e.target;
        if (!(img instanceof HTMLImageElement) || !img.classList.contains('thumb')) return;
        const placeholder = document.createElement('div');
        placeholder.className = 'thumb thumb-placeholder';
        placeholder.innerHTML = '<i class="fa-solid fa-map-location-dot"></i>';
        img.replaceWith(placeholder);
    }, true);

    /* The copy-link control that floats over a public roadbook's card, wherever one is shown
       (#493). The card is a link, so ONE delegated listener copies the Reader link and keeps the
       card from navigating, for every gallery on every page (#636). */
    document.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('.card-copy');
        if (!b) return;
        e.preventDefault(); e.stopPropagation();
        RBCopy(readerLink(b.dataset.copy));
    });
    window.RBCopyLinkOverlay = (slug) => `<button type="button" class="card-btn card-copy" data-copy="${RBesc(slug)}" title="${RBesc(RBt('Copy link'))}" aria-label="${RBesc(RBt('Copy link'))}"><i class="fa-solid fa-link"></i></button>`;

    /* The trash, one way everywhere (#704): the user's own trash (My roadbooks) and the admin's
       trash draw the same row, state the same retention, and ask the same questions. */
    window.RBTrashNote = (days) => RBt('A deleted roadbook stays in the trash {n} days, then it is gone for good.').replace('{n}', days);
    window.RBTrashRowHTML = (rb, showOwner) => `<div class="roadbook-row">
            <div class="meta"><b>${RBesc(rb.title || RBt('Untitled'))}</b><small>${showOwner ? '@' + RBesc(rb.username) + ' · ' : ''}${RBSummary(rb.total_distance, rb.note_count)} · <i class="fa-solid fa-hourglass-half"></i> ${rb.days_left} ${RBesc(RBt('days left'))}</small></div>
            <div class="btnrow end">
                <button class="btn btn-ghost" data-restore="${rb.id}"><i class="fa-solid fa-rotate-left"></i> ${RBesc(RBt('Restore'))}</button>
                <button class="btn btn-ghost" data-purge="${rb.id}"><i class="fa-solid fa-trash-can icon-danger"></i> ${RBesc(RBt('Delete forever'))}</button>
            </div>
        </div>`;
    // "Delete" on a live roadbook moves it to the trash — the question says so, and names it
    window.RBConfirmTrash = (title) => RBConfirmDanger(RBt('Move “{title}” to the trash? You can restore it later.').replace('{title}', RBesc(title || RBt('Untitled'))));
    window.RBConfirmPurge = (title) => RBConfirmDanger(RBt('Delete “{title}” forever? This cannot be undone.').replace('{title}', RBesc(title || RBt('Untitled'))));

    // Gate an admin/management page behind sign-in (and optionally the admin role): resolves the
    // signed-in user, or writes the standard message into msgEl and returns null. `account` is
    // the relative path to the sign-in page (page depths differ).
    window.RBRequireUser = async (msgEl, { admin = false } = {}) => {
        const cfg = await RBConfig(); // offline, a signed-in user is still signed in (#630)
        // Detach the element from i18n before writing the gate message: msgEl starts as the
        // "Loading…" placeholder (data-i18n), and a later apply() pass — e.g. when the account's
        // saved language is applied after config — would revert our message back to "Loading…",
        // which looked like the page hanging on "Loading…" for non-admins (#182).
        const setMsg = (html) => { msgEl.removeAttribute('data-i18n'); msgEl.removeAttribute('data-i18n-html'); msgEl.innerHTML = html; };
        if (!cfg.user) { setMsg(`${RBesc(RBt('Sign in to continue.'))} <a href="${RBLoginUrl()}">${RBesc(RBt('Sign in'))}</a>`); return null; } // real login flow: ?next= brings the user back here (#233)
        if (admin && !cfg.user.is_admin) { setMsg(RBesc(RBt('Admins only.'))); return null; }
        return cfg.user;
    };
    // Fill a <datalist> with the organization names already in use, so the profile field and the
    // event organizer search reuse the canonical club spelling instead of diverging (#116).
    window.RBOrgDatalist = async (el) => {
        if (!el) return;
        const r = await RBApi('org_suggest').catch(() => ({}));
        if (r && r.ok && Array.isArray(r.organizations)) el.innerHTML = r.organizations.map((o) => `<option value="${RBesc(o)}"></option>`).join('');
    };
    // The "done" cue (#768): a bell + a big check — a Recorder note, a Reader validation — and the
    // arrival fanfare when a roadbook is completed (#843). The sounds are decoded once and played
    // through Web Audio, which MIXES with the music of another app instead of taking the audio
    // over the way a media element does (#842): Chrome and the Android WebView ask for audio focus
    // only for media elements, and on iOS the page declares its audio `transient`
    // (navigator.audioSession, WebKit 16.4+), a mixable session — so the context can simply stay
    // running between sounds, and a GPS validation minutes after the last tap still rings. A
    // mixable iOS session follows the silent switch.
    // iOS INTERRUPTS the context whenever something else touches the audio session — the screen
    // locking, a notification, Siri, a call, another app — and only a touch may resume it (#937).
    // So a sound never waits on a resume that may never come (it is dropped after RESUME_WAIT_MS),
    // and every touch while the context is not running resumes it — or, interrupted, replaces it —
    // so one tap anywhere brings the sound back for the rest of the run.
    window.RBSuccess = (function () {
        const RESUME_WAIT_MS = 400;
        let context = null, buffers = {};
        const audio = () => {
            if (context && context.state !== 'closed') return context;
            const Context = window.AudioContext || window.webkitAudioContext;
            if (!Context) return null;
            try { if (navigator.audioSession) navigator.audioSession.type = 'transient'; } catch (e) {}
            context = new Context(); buffers = {}; // decoded sounds belong to the context that made them
            return context;
        };
        const load = (name) => buffers[name] || (buffers[name] = fetch(ROOT + 'assets/sounds/' + name + '.mp3')
            .then((r) => r.arrayBuffer())
            .then((bytes) => new Promise((resolve, reject) => audio().decodeAudioData(bytes, resolve, reject)))
            .catch((e) => { delete buffers[name]; throw e; }));
        const settle = (promise) => Promise.race([promise.catch(() => {}), new Promise((r) => setTimeout(r, RESUME_WAIT_MS))]);
        // a touch while the sound is down, all inside the touch (iOS counts nothing after an await): a
        // suspended context resumes; an interrupted one, which iOS often never lets run again, is
        // replaced by a fresh one with the sounds decoded anew
        function revive() {
            if (!context || context.state === 'running') return;
            if (context.state === 'interrupted') { try { context.close(); } catch (e) {} context = null; }
            const c = audio();
            if (!c) return;
            c.resume().catch(() => {});
            load('success').catch(() => {}); load('fanfare').catch(() => {});
        }
        ['pointerdown', 'touchend', 'keydown'].forEach((type) => document.addEventListener(type, revive, { capture: true, passive: true }));
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && context) context.resume().catch(() => {}); });
        async function play(name) {
            const c = audio();
            if (!c) return;
            try {
                const resumed = c.state === 'running' ? null : c.resume(); // before any await: inside the tap that asked
                const buffer = await load(name);
                if (resumed) await settle(resumed);
                if (c.state !== 'running') return; // interrupted, and no touch yet to bring it back: this one is lost, never the next
                const source = c.createBufferSource();
                source.buffer = buffer; source.connect(c.destination);
                source.start();
            } catch (e) { /* no sound is never an error worth showing */ }
        }
        const ring = () => play('success');
        return {
            ring,
            fanfare: () => play('fanfare'),
            // the tap that starts a run: resume the context inside the gesture (iOS needs one) and
            // decode both sounds now, so a GPS validation minutes later rings at once
            unlock() {
                const c = audio();
                if (!c) return;
                c.resume().catch(() => {});
                load('success').catch(() => {}); load('fanfare').catch(() => {});
            },
            flash() {
                ring();
                const el = document.createElement('div');
                el.className = 'success-flash'; el.setAttribute('aria-hidden', 'true');
                el.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
                document.body.appendChild(el);
                setTimeout(() => el.remove(), 900);
            },
        };
    })();
    // Publication-status labels (draft/ready/public) — My roadbooks, the admin's per-user list (#707)
    // and an event's roadbooks.
    window.RBStatusLabel = { draft: 'Draft', ready: 'Ready', public: 'Public' };
    // The signed-in user's saved roadbooks rendered into `container` — shared by My roadbooks
    // and the Editor landing. Loads rb_list, draws one .roadbook-row each (View/Edit/Duplicate/
    // Delete), wires duplicate+delete (re-rendering after each). Returns the count (0 = none).
    // Relative links work from any one-level-deep tool page (/editor/, /myroadbooks/).
    window.RBRoadbookList = async (container, onChange) => { // onChange: fires after a delete/duplicate, so the page can refresh siblings (e.g. the trash, #238)
        if (!container) return 0;
        const r = await RBApi('rb_list');
        // a failed call is NOT an empty list — offline in the field must never read as
        // "you have no roadbooks" (#218)
        if (!r.ok) { container.innerHTML = `<p class="muted small"><i class="fa-solid fa-triangle-exclamation"></i> ${RBesc(RBt(navigator.onLine === false ? 'You are offline — reconnect to see your roadbooks.' : (r.error || 'Could not load.')))}</p>`; return 0; }
        const all = r.roadbooks || [];
        if (!all.length) { container.innerHTML = `<p class="muted small">${RBesc(RBt('No roadbooks yet. Create one in the Editor.'))}</p>`; return 0; }
        const PER = 12;
        let q = '';
        // Search box only once the list is long enough to need it; the pager appears only past one page.
        container.innerHTML =
            ((r.used_bytes != null && r.quota_bytes) ? `<div class="rb-usage muted small"><i class="fa-solid fa-database"></i> ${RBesc(RBt('Storage'))}: ${RBFmtSize(r.used_bytes)} / ${RBFmtSize(r.quota_bytes)}</div>` : '') +
            (all.length > 5 ? `<div class="rb-toolbar"><i class="fa-solid fa-magnifying-glass"></i><input type="search" class="rb-search" placeholder="${RBesc(RBt('Search roadbooks…'))}" autocomplete="off" spellcheck="false"></div>` : '') +
            `<div class="rb-grid"></div><div class="pager"></div>`;
        const rowsEl = container.querySelector('.rb-grid'), pagerEl = container.querySelector('.pager');
        const rowHtml = (rb) => `<div class="roadbook-row">
            <div class="meta"><b>${RBesc(rb.title)}</b><small>${RBSummary(rb.total_distance, rb.note_count)} · <i class="fa-solid fa-clock-rotate-left"></i> ${RBFmtDate(rb.updated_at)}${rb.total_bytes ? ` · <i class="fa-solid fa-database"></i> ${RBFmtSize(rb.total_bytes)}` : ''}</small></div>
            ${RBStatusSelectHTML(rb, 'data-status')}
            <a class="btn btn-ghost" href="../reader/?rb=${rb.id}" title="${RBesc(RBt('Read'))}" aria-label="${RBesc(RBt('Read'))}"><i class="fa-solid fa-compass"></i></a>
            <a class="btn btn-ghost" href="../challenge/${rb.slug || ''}" title="${RBesc(RBt('View'))}" aria-label="${RBesc(RBt('View'))}"><i class="fa-solid fa-eye"></i></a>
            ${rb.status === 'public' && rb.slug ? `<button class="btn btn-ghost" data-copy="${RBesc(rb.slug)}" title="${RBesc(RBt('Copy link'))}" aria-label="${RBesc(RBt('Copy link'))}"><i class="fa-solid fa-link"></i></button>` : ''}
            <a class="btn btn-ghost" href="../editor/?rb=${rb.id}" title="${RBesc(RBt('Edit'))}" aria-label="${RBesc(RBt('Edit'))}"><i class="fa-solid fa-pen"></i></a>
            <a class="btn btn-ghost" href="../editor/?rb=${rb.id}&export=1" title="${RBesc(RBt('Export'))}" aria-label="${RBesc(RBt('Export'))}"><i class="fa-solid fa-file-export"></i></a>
            <button class="btn btn-ghost" data-dup="${rb.id}" title="${RBesc(RBt('Duplicate'))}" aria-label="${RBesc(RBt('Duplicate'))}"><i class="fa-solid fa-clone"></i></button>
            <button class="btn btn-ghost" data-del="${rb.id}" data-title="${RBesc(rb.title)}" title="${RBesc(RBt('Delete'))}" aria-label="${RBesc(RBt('Delete'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button>
        </div>`;
        const wireRows = () => {
            rowsEl.querySelectorAll('[data-dup]').forEach((b) => b.onclick = async () => {
                const busy = RBBusy(b);
                const x = await RBApi('rb_duplicate', { id: +b.dataset.dup });
                if (x.ok) { busy.ok(); RBToast('Roadbook duplicated.'); RBRoadbookList(container, onChange); if (onChange) onChange(); } else { busy.reset(); RBToast(x.error || 'Could not duplicate.'); }
            });
            rowsEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
                if (await RBConfirmTrash(b.dataset.title)) {
                    const busy = RBBusy(b);
                    const x = await RBApi('rb_delete', { id: +b.dataset.del });
                    if (x.ok) { busy.ok(); RBRoadbookList(container, onChange); if (onChange) onChange(); }
                    else { busy.reset(); RBToast(x.error || 'Could not delete.'); }
                }
            });
            rowsEl.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => RBCopy(readerLink(b.dataset.copy)));
            rowsEl.querySelectorAll('[data-status]').forEach((sel) => sel.onchange = async () => {
                sel.disabled = true;
                const r = await RBApi('rb_status', { id: +sel.dataset.status, status: sel.value });
                sel.disabled = false;
                RBToast(r.ok ? 'Status updated.' : (r.error || 'Could not change visibility.'));
                RBRoadbookList(container, onChange); // re-render from the server truth (also resets on error)
            });
        };
        const list = RBPagedList({
            pager: pagerEl, per: PER, source: () => all,
            filter: (items) => RB.filterRoadbooks(items, q),
            draw: (slice) => {
                rowsEl.innerHTML = slice.length ? slice.map(rowHtml).join('') : `<p class="muted small">${RBesc(RBt('Nothing matches that search.'))}</p>`;
                wireRows();
            },
        });
        const search = container.querySelector('.rb-search');
        if (search) search.oninput = () => { q = search.value; list.reset(); };
        list.render();
        return all.length;
    };
    // Translated toast, on every page: the #toast element is created on the first call.
    let toastTimer = null;
    window.RBToast = (msg, ms) => {
        let el = document.getElementById('toast');
        if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
        el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); // announce to screen readers
        el.textContent = RBt(msg); el.hidden = false;
        clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms || 2500);
    };
    // A button that reports its own async work (#459): disabled with a spinner while it runs, then
    // — on success — the SAME button green with a check for 3 s, then back to exactly how it was.
    // The button that was pressed is where the answer belongs — a toast alone is easy to miss.
    //
    // Only the icon is swapped when there is one, so a labelled button keeps its text and width
    // and nothing jumps. `ok()` reports success; `reset()` just puts the button back — a failure
    // (the toast carries the reason), or a caller that paints its own outcome on it. Re-enabling
    // is left to the caller's own updater when it has one
    // (a saved roadbook has nothing left to save, so its Save goes back to disabled) — hence
    // `onEnd`.
    window.RBBusy = (el, { onEnd } = {}) => {
        const btn = typeof el === 'string' ? document.getElementById(el) : el;
        if (!btn) return { ok() {}, reset() {} };
        const icon = btn.querySelector('i');
        const html = icon ? icon.outerHTML : btn.innerHTML;
        const paint = (h) => { if (icon) { const t = btn.querySelector('i, .spinner'); if (t) t.outerHTML = h; } else btn.innerHTML = h; };
        let timer = null;
        btn.disabled = true;
        btn.classList.add('btn-busy');
        paint('<span class="spinner" aria-hidden="true"></span>');
        const back = () => {
            clearTimeout(timer);
            btn.classList.remove('btn-busy', 'btn-ok');
            paint(html);
            btn.disabled = false;
            if (onEnd) onEnd();
        };
        return {
            ok() { // stays disabled while it shows the tick: the work is done, there is nothing to press
                clearTimeout(timer);
                btn.classList.remove('btn-busy');
                btn.classList.add('btn-ok');
                paint('<i class="fa-solid fa-check" aria-hidden="true"></i>');
                timer = setTimeout(back, 3000);
            },
            reset: back,
        };
    };
    // Copy text (a share link, an activation token…) to the clipboard, with a translated toast.
    // `okMsg` names what was copied; the failure message is the same for everyone.
    //
    // The async Clipboard API is not always there to be awaited: outside a secure context, in
    // older WebViews, or when the write is refused, `navigator.clipboard` can be undefined — and
    // an unguarded `navigator.clipboard.writeText(...)` then throws where a caller cannot catch
    // it, so the copy silently never happens and not even the failure toast shows (#423). Hence
    // one helper, with the selection-based fallback built in.
    window.RBCopy = async (text, okMsg) => {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
            else if (!legacyCopy(text)) throw new Error('no clipboard');
            RBToast(okMsg || 'Link copied');
        } catch (e) {
            if (legacyCopy(text)) return void RBToast(okMsg || 'Link copied');
            RBToast('Could not copy.');
        }
    };
    // Pre-Clipboard-API copy: a throwaway off-screen textarea, selected and cut by the document.
    // Deprecated but still the only path in a non-secure context, and it needs no permission.
    function legacyCopy(text) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text; ta.setAttribute('readonly', '');
            ta.className = 'copy-shuttle';
            document.body.appendChild(ta);
            ta.select(); ta.setSelectionRange(0, ta.value.length); // iOS needs the explicit range
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch (e) { return false; }
    }
    // An absolute link to a page of the site, the kind that is shared or printed: this origin on
    // the web, the real domain inside the app (whose own origin is a WebView-local one, so a copied
    // link would be a dead localhost URL).
    window.RBPublicLink = (path) => (isNativeApp() ? PROD_ROOT.replace(/\/+$/, '') : location.origin) + path;
    const readerLink = (slug) => RBPublicLink('/reader/' + encodeURIComponent(slug)); // a public roadbook's shareable link
    // API auth: a Capacitor webview can't carry the cross-origin session cookie, so in the
    // native apps login returns a Bearer token we store and replay on every call. In the
    // browser this is completely inert — the httponly session cookie is used as before and
    // no token is ever read, stored or sent.
    const RB_TOKEN_KEY = 'rb_token';
    const rbAuthHeaders = (base) => {
        if (!isNativeApp()) return base;
        try { const t = localStorage.getItem(RB_TOKEN_KEY); if (t) return Object.assign({ Authorization: 'Bearer ' + t }, base); } catch (e) {}
        return base;
    };
    // Cached signed-in identity for the offline config fallback (#188/#189), cleared on sign-out.
    const RB_CFG_USER = 'rb_cfg_user';
    const rbCaptureToken = (action, json) => {
        if (isNativeApp()) try {
            if (json && json.token) localStorage.setItem(RB_TOKEN_KEY, json.token);
            else if (action === 'logout') localStorage.removeItem(RB_TOKEN_KEY);
        } catch (e) {}
        if (action === 'logout') try { localStorage.removeItem(RB_CFG_USER); } catch (e) {} // forget cached identity on any sign-out
        return json;
    };
    // JSON POST to the API → the parsed response ({ ok: false, … } on network failure).
    window.RBApi = (action, body) => fetch(API_ROOT + 'api/index.php', {
        method: 'POST', credentials: 'same-origin', headers: rbAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(Object.assign({ action }, body || {})),
    }).then((r) => r.json().catch(() => ({ ok: false, error: 'The server did not answer properly — please try again in a moment.' }))) // reached, but no JSON back (a crash, a proxy page)
        .then((j) => rbCaptureToken(action, j)).catch(() => ({ ok: false, error: 'Network error.' }));
    // The same call, sent so it survives the page going away (pagehide): the shared API host and
    // auth headers, so it works inside the app too — sendBeacon can carry neither (#651).
    window.RBApiKeepalive = (action, body) => fetch(API_ROOT + 'api/index.php', {
        method: 'POST', keepalive: true, credentials: 'same-origin', headers: rbAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(Object.assign({ action }, body || {})),
    }).catch(() => {});
    // Config with an offline fallback (#188/#189). `config` is what tells the app who is signed in
    // (account menu, the Recorder's capture buttons…). When the server is unreachable — flaky/no
    // data, common on an iPad in the field — a bare RBApi('config') returns no user and the app
    // wrongly looks signed-out. So cache the last-known user and fall back to it offline; the real
    // API calls still enforce auth server-side, and a genuine sign-out clears the cache (rbCaptureToken).
    window.RBConfig = async () => {
        const cfg = await RBApi('config');
        if (cfg && cfg.ok !== false) { // reached the server → the authoritative answer
            try { if (cfg.user) localStorage.setItem(RB_CFG_USER, JSON.stringify(cfg.user)); else localStorage.removeItem(RB_CFG_USER); } catch (e) {}
            return cfg;
        }
        let user = null; try { user = JSON.parse(localStorage.getItem(RB_CFG_USER) || 'null'); } catch (e) {}
        return { ok: false, offline: true, user };
    };
    // Delete an event, from its management list or its edit page (#601): the confirm names the event
    // and says what goes with it — every participant and the roadbook links — and that the roadbooks
    // themselves stay. Resolves true once it is gone.
    window.RBEventDelete = async (ev) => {
        const msg = RBt('Delete event') + '<br><b>' + RBesc(ev.title) + '</b><br>'
            + RBt('Its participants and roadbook links are removed with it; the roadbooks themselves are kept.')
            + (ev.participants ? ' (' + ev.participants + ' ' + RBt('participants') + ')' : '');
        if (!(await RBConfirmDanger(msg))) return false;
        const x = await RBApi('event_delete', { id: ev.id });
        if (!x.ok) { RBToast(x.error || 'Could not delete.'); return false; }
        return true;
    };
    // A palette colour for the few APIs that take a literal (map markers): read from the CSS
    // tokens, so the colours live in app.css only.
    window.RBCssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    // Sign out, from the account menu or the account page — one way, so both clear the same state.
    window.RBSignOut = async () => { await RBApi('logout'); location.reload(); };
    // A user's public profile (#620). The app's bundled pages have no server rewrite for /u/<name>,
    // so there the page takes the name as ?name= instead.
    window.RBProfileLink = (username) => (isNativeApp() ? ROOT + 'u/?name=' : ROOT + 'u/') + encodeURIComponent(username || '');
    window.RBIsParticipant = isParticipant;
    // Drop the client-side participant flag (the server context is cleared by the API call that
    // ends it: leave_participant_mode, event_leave). One place, so every exit clears the same.
    window.RBLeaveParticipantMode = () => {
        document.cookie = 'rb_participant=; max-age=0; path=/';
        try { localStorage.removeItem('rb_participant'); } catch (e) {}
    };
    // The native bridge (RBNative) loads async after app.js — wait for it briefly so a tap
    // that lands right after startup still reaches the native capability. Resolves with
    // RBNative, or null when it never arrives (or outside the app). (#250)
    window.RBNativeReady = async () => {
        for (let i = 0; i < 40 && isNativeApp() && !window.RBNative; i++) await new Promise((r) => setTimeout(r, 50));
        return window.RBNative || null;
    };
    // Share a generated file (the run card, the result QR): the OS share sheet in the app, the Web
    // Share sheet where the browser can share files, a download everywhere else (#785).
    window.RBShareFile = async (blob, filename, text) => {
        if (isNativeApp()) return nativeShare(blob, filename, text);
        const file = new File([blob], filename, { type: blob.type });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            // a dismissed sheet is a choice; a refused one (the tap is long gone after an upload,
            // NotAllowedError) is not — the file is saved instead of nothing happening
            try { await navigator.share({ files: [file], text }); } catch (e) { if (e && e.name === 'NotAllowedError') RBDownload(blob, filename); }
            return;
        }
        return RBDownload(blob, filename);
    };
    // Save a generated file (GPX, .rdbk, CSV…) from a Blob or a URL. On the web: an `<a download>`
    // click. The app's WebView ignores that trick, so there every file goes to the OS share sheet —
    // Save to Files / Downloads, open in another app, send — exactly like the PDF: the user always
    // sees where it goes and decides, never a silent save into a folder nobody finds.
    async function nativeShare(data, filename, text) {
        try {
            const blob = (typeof data === 'string') ? await (await fetch(data)).blob() : data;
            const native = await RBNativeReady();
            if (!native) throw new Error('native bridge unavailable');
            await native.shareFile(blob, filename, text);
        } catch (e) {
            if (!/cancel/i.test((e && e.message) || '')) RBToast(RBt('Could not save the file.') + ((e && e.message) ? ' (' + e.message + ')' : '')); // dismissing the sheet is a choice
        }
    }
    window.RBDownload = async (data, filename) => {
        if (isNativeApp()) return nativeShare(data, filename);
        const url = (typeof data === 'string') ? data : URL.createObjectURL(data);
        const a = document.createElement('a'); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        if (typeof data !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    // POST a multipart upload to upload.php (`fields` = extra form fields). Photos go through the
    // image downscale; voice notes upload the recorded blob as-is.
    const rbPostUpload = async (fields, fieldName, blob, name) => {
        const fd = new FormData();
        for (const k in fields) fd.append(k, fields[k]);
        fd.append(fieldName, blob, name);
        try { return await (await fetch(API_ROOT + 'api/upload.php', { method: 'POST', credentials: 'same-origin', headers: rbAuthHeaders({}), body: fd })).json(); }
        catch (e) { return { ok: false, error: 'Upload failed.' }; }
    };
    window.RBUpload = async (fields, file, name) => rbPostUpload(fields, 'photo', await RBImg.toBlob(file), name || 'photo.jpg');
    // A voice note's filename extension follows its MIME (the MediaRecorder container varies by
    // browser), so the server stores it under a type it can serve back (#657).
    const audioExt = (mime) => ({ 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' })[(mime || '').split(';')[0]] || 'webm';
    window.RBUploadAudio = async (fields, blob, name) => rbPostUpload(fields, 'audio', blob, name || ('audio.' + audioExt(blob.type)));

    /* ---------------- Styled confirm + auth prompt (built on RBModal) ---------------- */
    // msg runs through RBt: a plain English key translates, a composed string falls through.
    // A confirmation asks a question, so its buttons answer it: **No / Yes**, always — *Cancel* is
    // the wrong word for the negative half of a question (#435). Whatever is specific to the
    // decision belongs in `msg`, which is where a delete confirm has to name what it deletes.
    // `danger` only styles the Yes as destructive.
    window.RBConfirm = (msg, danger) => new Promise((resolve) => {
        const ok = danger
            ? `<button class="btn btn-danger" data-yes><i class="fa-solid fa-triangle-exclamation"></i> ${RBt('Yes')}</button>`
            : `<button class="btn btn-primary" data-yes>${RBt('Yes')}</button>`;
        const d = RBModal(`<p class="modal-text">${RBt(msg)}</p>
            <div class="btnrow end">
                <button class="btn btn-ghost" data-no>${RBt('No')}</button>
                ${ok}
            </div>`, 'narrow', null, { dismissable: false }); // a question: No or Yes, nothing else
        const done = (v) => { d.close(); resolve(v); };
        d.q('[data-yes]').onclick = () => done(true);
        d.q('[data-no]').onclick = () => done(false);
    });
    // Confirm for a destructive/data-losing action: same as RBConfirm but a red button + warning
    // icon. Use it for anything that deletes or overwrites; name the object in `msg` (e.g. its title).
    window.RBConfirmDanger = (msg) => window.RBConfirm(msg, true);
    // Field help (#859): every .help-tip shares ONE bubble, fixed to the viewport so no scrolling panel
    // clips it, placed ABOVE its ⓘ so it never covers the field it explains (below only when there is
    // no room above) and clamped 8 px inside the screen. Hover, focus or a tap opens it; leaving,
    // blurring, scrolling or a tap elsewhere closes it. data-tip holds the (translated) text.
    (function helpTips() {
        let bubble = null, owner = null;
        const hide = () => { if (bubble) bubble.classList.remove('on'); owner = null; };
        function show(tip) {
            if (!bubble) { bubble = document.createElement('div'); bubble.className = 'tip-bubble'; bubble.setAttribute('role', 'tooltip'); document.body.appendChild(bubble); }
            owner = tip;
            bubble.textContent = tip.getAttribute('data-tip') || '';
            const r = tip.getBoundingClientRect(), b = bubble.getBoundingClientRect(), gap = 7, edge = 8;
            const left = Math.min(Math.max(edge, r.left + r.width / 2 - b.width / 2), window.innerWidth - b.width - edge);
            const top = r.top - b.height - gap >= edge ? r.top - b.height - gap : r.bottom + gap;
            bubble.style.setProperty('--tip-x', Math.round(left) + 'px'); bubble.style.setProperty('--tip-y', Math.round(top) + 'px');
            bubble.classList.add('on');
        }
        const tipOf = (e) => e.target.closest && e.target.closest('.help-tip');
        // a tap focuses the ⓘ (opening it) before its click lands, so a tap toggles by what was open
        // when the finger went DOWN — else its own focus would open it and its own click close it. A
        // mouse click keeps it open: hovering already showed it, and leaving closes it.
        let openAtPress = false;
        document.addEventListener('pointerdown', (e) => { const tip = tipOf(e); openAtPress = !!tip && tip === owner && e.pointerType !== 'mouse'; }, true);
        document.addEventListener('pointerover', (e) => { const tip = tipOf(e); if (tip && e.pointerType === 'mouse') show(tip); });
        document.addEventListener('pointerout', (e) => { if (tipOf(e) === owner && e.pointerType === 'mouse') hide(); });
        document.addEventListener('focusin', (e) => { const tip = tipOf(e); if (tip) show(tip); });
        document.addEventListener('focusout', (e) => { if (tipOf(e) === owner) hide(); });
        document.addEventListener('click', (e) => {
            const tip = tipOf(e);
            if (!tip) return hide();
            e.preventDefault();
            if (openAtPress) hide(); else show(tip);
            openAtPress = false;
        });
        window.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
    })();
    // The device a run was made on, for the admins (#870): a coarse model / OS read from the user
    // agent — never an identifier — and where it ran (the app, the installed PWA, the browser).
    // Android names its model; iOS only the device class, which is all WebKit tells.
    window.RBDeviceLabel = () => {
        const ua = navigator.userAgent || '';
        const surface = isNativeApp() ? 'App' : (isStandalone() ? 'PWA' : 'Web');
        const ios = ua.match(/(iPhone|iPad|iPod).*?OS (\d+)[_.](\d+)/);
        const android = ua.match(/Android (\d+(?:\.\d+)?)(?:; ([^;)]+?))?(?: Build|;|\))/);
        // iOS browsers are all WebKit and say so ("Safari/"), naming themselves in their own token
        const browser = /Edg(e|A|iOS)?\//.test(ua) ? 'Edge' : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
        const os = ios ? `${ios[1]} · iOS ${ios[2]}.${ios[3]}`
            : android ? [android[2] && !['K', 'wv'].includes(android[2].trim()) ? android[2].trim() : '', 'Android ' + android[1]].filter(Boolean).join(' · ')
            : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
        return [surface, surface === 'App' ? '' : browser, os].filter(Boolean).join(' · ').slice(0, 80);
    };
    /* Guided tours (#906): the first time a tool opens, its main controls are pointed at one by one —
       the screen dimmed, a hole over the control, a bubble beside it saying what it does. Asked ONCE,
       ever (No / Yes): a No means no tour anywhere, again — until the Profile starts them over. After a Yes each tool's tour runs once, and
       every bubble carries "Skip tutorial" (Escape too), which ends it for good. A tour counts as seen
       from its first step, so an interrupted one (a reload, a crash) never comes back. A step whose
       control is not on screen is left out. steps: [{ target: CSS selector, title, text }] — short English
       source strings: a title of a word or two and one line saying what the control does. */
    // The device's answers: { optin: 'yes'|'no', seen: [tool ids] }
    const TOUR_KEY = 'rb_tour';
    function tourState() {
        try { const s = JSON.parse(localStorage.getItem(TOUR_KEY) || 'null'); if (s && Array.isArray(s.seen)) return s; } catch (e) {}
        return { optin: null, seen: [] };
    }
    const saveTour = (s) => { try { localStorage.setItem(TOUR_KEY, JSON.stringify(s)); } catch (e) {} };
    let touring = false;
    window.RBTour = async (id, steps) => {
        const state = tourState();
        if (touring || state.seen.includes(id) || state.optin === 'no') return;
        const onScreen = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
        const live = steps.map((s) => ({ title: s.title, text: s.text, el: document.querySelector(s.target) })).filter((s) => onScreen(s.el));
        if (!live.length) return;
        touring = true;
        if (state.optin !== 'yes') {
            const yes = await RBConfirm(RBt('Take a quick tour? Each tool shows you its main controls once, the first time you open it.'));
            state.optin = yes ? 'yes' : 'no'; saveTour(state);
            if (!yes) { touring = false; return; }
        }
        state.seen = [...new Set(state.seen.concat(id))]; saveTour(state);
        const root = document.createElement('div');
        root.className = 'tour'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
        root.innerHTML = '<div class="tour-hole"></div><div class="tour-bubble" aria-live="polite"><b class="tour-title"></b><p class="tour-text"></p>'
            + '<span class="tour-dots">' + live.map(() => '<i></i>').join('') + '</span>'
            + '<div class="tour-foot"><button type="button" class="btn btn-ghost" data-skip></button><button type="button" class="btn btn-primary" data-next></button></div></div>';
        document.body.appendChild(root);
        const hole = root.querySelector('.tour-hole'), bubble = root.querySelector('.tour-bubble'), nextBtn = root.querySelector('[data-next]');
        let i = 0;
        const px = (el, name, v) => el.style.setProperty(name, Math.round(v) + 'px');
        function place() {
            if (!root.isConnected || !live[i]) return; // a repaint queued before the tour ended
            const r = live[i].el.getBoundingClientRect(), pad = 6, gap = 12, edge = 10;
            px(hole, '--tour-hx', r.left - pad); px(hole, '--tour-hy', r.top - pad);
            px(hole, '--tour-hw', r.width + 2 * pad); px(hole, '--tour-hh', r.height + 2 * pad);
            const b = bubble.getBoundingClientRect();
            const below = r.bottom + pad + gap, above = r.top - pad - gap - b.height;
            const fitsBelow = below + b.height <= innerHeight - edge;
            const top = fitsBelow ? below : above >= edge ? above : Math.max(edge, innerHeight - b.height - edge);
            const left = Math.min(Math.max(edge, r.left + r.width / 2 - b.width / 2), innerWidth - b.width - edge);
            px(bubble, '--tour-x', left); px(bubble, '--tour-y', top);
            // the bubble's pointer aims at the control, on the side it faces
            bubble.dataset.side = fitsBelow ? 'below' : 'above';
            px(bubble, '--tour-ax', Math.min(Math.max(18, r.left + r.width / 2 - left), b.width - 18));
        }
        function show() {
            live[i].el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); // the step's control in the middle of the screen, the hole following it there
            root.querySelector('.tour-title').textContent = RBt(live[i].title);
            root.querySelector('.tour-text').textContent = RBt(live[i].text);
            root.querySelectorAll('.tour-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
            root.querySelector('[data-skip]').textContent = RBt('Skip tutorial');
            nextBtn.textContent = RBt(i === live.length - 1 ? 'Done' : 'tour.next');
        }
        // the hole and the bubble follow their control on every frame while the tour is open: a page
        // that settles its layout, scrolls, rotates or opens the keyboard never leaves them behind
        const follow = () => { if (!root.isConnected) return; place(); requestAnimationFrame(follow); };
        function end() { root.remove(); document.removeEventListener('keydown', onKey, true); touring = false; }
        function next() { if (++i >= live.length) end(); else show(); }
        function onKey(e) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); }
            else if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); next(); }
        }
        nextBtn.onclick = next;
        root.querySelector('[data-skip]').onclick = end;
        document.addEventListener('keydown', onKey, true);
        show();
        requestAnimationFrame(follow);
        nextBtn.focus();
    };
    // "Show the tours again" (the Profile's Preferences, #925): every tool's tour runs once more, unasked
    RBTour.replay = () => saveTour({ optin: 'yes', seen: [] });
    // Cloudflare Turnstile: ONE loader for every form that asks for the challenge (the account forms,
    // the roadbook comments #809). RBTurnstile(el, siteKey) renders the widget into `el` and returns
    // { token(), reset() }. Without a site key (not configured) or inside the app it does nothing and
    // token() is null: the widget is domain-locked and can't run in the WebView, and the server
    // exempts the app origins from the challenge to match (verify_turnstile).
    let turnstileScript = null;
    window.RBTurnstile = (el, siteKey) => {
        let token = null, widget = null;
        const handle = { token: () => token, reset: () => { token = null; if (widget != null) window.turnstile.reset(widget); } };
        if (!el || !siteKey || isNativeApp()) return handle;
        turnstileScript = turnstileScript || new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            s.async = true; s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
        // the script is loaded async, so render straight from its load: the API's ready() hook refuses an
        // async-loaded api.js and would never fire (the widget then never showed, #863)
        turnstileScript.then(() => {
            widget = window.turnstile.render(el, { sitekey: siteKey, theme: 'dark', callback: (t) => { token = t; }, 'expired-callback': () => { token = null; }, 'error-callback': () => { token = null; } });
        }).catch(() => {}); // blocked or offline: the server answers "Please complete the challenge."
        return handle;
    };
    window.RBNeedAuth = (msg) => {
        const d = RBModal(`<h2><i class="fa-solid fa-circle-user icon-accent"></i> ${RBt('Sign in')}</h2>
            <p class="muted">${RBt(msg || 'Create a free account to save and share your roadbooks.')}</p>
            <div class="btnrow center spaced">
                <a class="btn btn-primary" href="${RBLoginUrl()}"><i class="fa-solid fa-right-to-bracket"></i> ${RBt('Sign in / Create account')}</a>
            </div>`, 'narrow center');
    };

    // Site-wide announcement banner (#103): rendered under the header from the config payload.
    // Dismissing it sticks across pages (keyed on the message text, #250) — it only comes back
    // when the admin publishes a different message.
    const BANNER_DISMISSED = 'rb_banner_dismissed';
    function renderBanner(banner) {
        document.querySelector('.site-banner')?.remove();
        if (!banner || !banner.text) return;
        try { if (localStorage.getItem(BANNER_DISMISSED) === banner.text) return; } catch (e) {}
        const el = document.createElement('div');
        el.className = 'site-banner site-banner-' + (banner.level === 'warning' ? 'warning' : 'info');
        el.innerHTML = `<span>${RBesc(banner.text)}</span><button class="site-banner-x" aria-label="${RBesc(RBt('Dismiss'))}"><i class="fa-solid fa-xmark"></i></button>`;
        const header = document.querySelector('header.topbar');
        (header || document.body).insertAdjacentElement(header ? 'afterend' : 'afterbegin', el);
        el.querySelector('.site-banner-x').onclick = () => { el.remove(); try { localStorage.setItem(BANNER_DISMISSED, banner.text); } catch (e) {} };
    }

    // Management links (admin console + organizer tools) for the header account dropdown (#303).
    function manageLinks(user, participant) {
        if (participant || !user) return [];
        if (user.is_admin) return [
            { href: 'admin/events/',       icon: 'fa-flag-checkered', label: 'Event management',       group: 1 },
            { href: 'admin/',              icon: 'fa-users-gear',     label: 'User management',        group: 2 },
            { href: 'admin/config/',       icon: 'fa-sliders',        label: 'Site settings',          group: 2 },
            { href: 'admin/trash/',        icon: 'fa-trash-can',      label: 'Roadbook trash',         group: 2 },
            { href: 'admin/logs/',         icon: 'fa-list-check',     label: 'Logs',                   group: 2 },
        ];
        if (user.is_organizer || user.manages_events) return [
            { href: 'admin/events/',       icon: 'fa-flag-checkered', label: 'Event management',       group: 0 },
        ];
        return [];
    }
    // Render management links as <a> rows, with a separator between groups.
    function manageLinksHTML(links) {
        return links.map((l, i) => (i && l.group !== links[i - 1].group ? '<hr class="menu-sep">' : '')
            + `<a href="${ROOT}${l.href}">${menuLabel(l.icon, l.label)}</a>`).join('');
    }
    /* Every item of the account menu carries its label as a <span data-i18n>, so switching the
       language re-translates an OPEN menu instead of leaving it in the previous one (#495) —
       RBt() alone paints the text once and the i18n pass has nothing to find later. */
    const menuLabel = (icon, label) => `<i class="fa-solid ${icon}"></i> <span data-i18n="${RBesc(label)}">${RBesc(RBt(label))}</span>`;
    /* The account menu is ONE list, rendered into the desktop dropdown and the tab-bar dropup
       alike; `p` prefixes the ids the wiring below looks for. */
    function accountMenuHTML(user, participant, p) {
        return `<a href="${RBProfileLink(user.username)}">${menuLabel('fa-circle-user', 'My profile')}</a>`
            + `<a href="${ROOT}account/">${menuLabel('fa-gear', 'Account settings')}</a>`
            + (participant ? '' : `<a href="${ROOT}myroadbooks/">${menuLabel('fa-folder-open', 'My roadbooks')}</a>`
                + `<a href="${ROOT}roadbooks/">${menuLabel('fa-book-open', 'Public roadbooks')}</a>`) // the only way in on mobile and in the app (#671)
            + manageLinksHTML(manageLinks(user, participant))
            + `<button id="${p}Activity">${menuLabel('fa-clock-rotate-left', 'My activity')}</button>`
            + (participant ? `<hr class="menu-sep"><button id="${p}Leave">${menuLabel('fa-up-right-from-square', 'Switch to full mode')}</button>` : '')
            // Help sits at the foot, just before App Info (#743)
            + `<hr class="menu-sep"><a href="${ROOT}wiki/">${menuLabel('fa-circle-question', 'Help')}</a>`
            + `<button id="${p}AppInfo">${menuLabel('fa-circle-info', 'App Info')}</button>`
            + `<button id="${p}Logout">${menuLabel('fa-right-from-bracket', 'Sign out')}</button>`;
    }
    // …and one wiring for both: close the menu, then do the thing.
    function wireAccountMenu(root, p, closeMenu) {
        const on = (id, fn) => { const el = root.querySelector('#' + p + id); if (el) el.onclick = fn; };
        on('Logout', RBSignOut);
        on('Activity', () => { closeMenu(); window.RBActivityLog(); });
        on('AppInfo', () => { closeMenu(); showAppInfo(); });
        on('Leave', async () => {
            await RBApi('leave_participant_mode');
            RBLeaveParticipantMode();
            location.href = ROOT;
        });
    }

    /* A new account is asked once where it rides (#749): the default location centres the Recorder
       and the Editor before the first fix, and puts the rider on the users map. Asked on the first
       page that has room for it — never over the account page (it has the picker), a tool that owns
       the screen, or another dialog — and leaving it without an answer (its corner close) is
       remembered on this device as a "not now", so it does not come back (#436). */
    function askForLocation(user) {
        const key = 'rb_location_asked_' + user.id;
        try { if (user.default_lat != null || localStorage.getItem(key)) return; } catch (e) { return; }
        setTimeout(() => {
            if (/\/account\/?$/.test(location.pathname) || document.body.classList.contains('rb-immersive') || document.querySelector('.modal')) return;
            const dialog = RBModal(`<h2><i class="fa-solid fa-location-dot icon-accent"></i> ${RBesc(RBt('Where do you usually ride?'))}</h2>
                <p>${RBesc(RBt('Set your default location: the Recorder and the Editor open the map there until the GPS has a fix. You can change it any time in Account settings.'))}</p>
                <div class="btnrow end">
                    <a class="btn btn-ghost" href="${ROOT}account/#defaultLocation"><i class="fa-solid fa-map-location-dot"></i> ${RBesc(RBt('Choose on the map'))}</a>
                    <button class="btn btn-primary" data-act="here" type="button"><i class="fa-solid fa-location-crosshairs"></i> ${RBesc(RBt('Use my location'))}</button>
                </div>`, 'narrow', () => remember());
            const remember = () => { try { localStorage.setItem(key, '1'); } catch (e) {} };
            dialog.q('a').onclick = () => remember();
            dialog.q('[data-act="here"]').onclick = (e) => {
                if (!navigator.geolocation) return RBToast('Could not get your location.');
                const busy = RBBusy(e.currentTarget);
                navigator.geolocation.getCurrentPosition(async (p) => {
                    const r = await RBApi('save_location', { default_lat: +p.coords.latitude.toFixed(7), default_lon: +p.coords.longitude.toFixed(7) });
                    if (!r.ok) { busy.reset(); return RBToast(r.error); }
                    user.default_lat = p.coords.latitude; user.default_lon = p.coords.longitude;
                    remember(); dialog.close(); RBToast('Location saved.');
                }, () => { busy.reset(); RBToast('Could not get your location.'); }, { enableHighAccuracy: true, timeout: 10000 });
            };
        }, 1200);
    }

    /* ---------------- Account control in the header ---------------- */
    (async function accountControl() {
        const cfg = await RBConfig();
        const user = cfg.user || null;
        const participant = cfg.participant || null;
        // The server is the authority on participant mode. The web also gets a cookie from /go/, but
        // the app has neither that page nor a cookie — so the client flag follows the server (#580).
        if (!cfg.offline) {
            if (participant) { try { localStorage.setItem('rb_participant', '1'); } catch (e) {} }
            else if (isParticipant()) RBLeaveParticipantMode();
        }
        renderBanner(cfg.banner);
        if (user && !participant && !cfg.offline) askForLocation(user);
        // Admins get the in-context UI translation editor (#118) — a small script loaded only for
        // them; it stays dormant until they turn edit mode on. Never loaded for anyone else.
        if (user && user.is_admin) { const s = document.createElement('script'); s.src = ROOT + 'assets/js/i18n-edit.js'; s.async = true; document.head.appendChild(s); }
        // A signed-in user's language preference follows them across devices: apply it on
        // connect, and persist any later switch (the language control in the footer and at the
        // bottom of the Profile page).
        if (user && window.RBi18n) {
            if (user.ui_lang && user.ui_lang !== RBi18n.current()) RBi18n.set(user.ui_lang);
            window.addEventListener('rb-lang', (e) => {
                if (e.detail === user.ui_lang) return; // no-op echo (e.g. the apply above)
                user.ui_lang = e.detail;
                RBApi('set_lang', { lang: e.detail }).catch(() => {});
            });
        }
        const place = () => {
            const slot = document.querySelector('header .topnav') || document.querySelector('header .wrap');
            if (!slot || slot.querySelector('.account-control')) return;
            const w = document.createElement('div'); w.className = 'account-control';
            if (!user) {
                w.innerHTML = `<a class="nav-link" href="${RBLoginUrl()}"><i class="fa-solid fa-circle-user"></i> <span data-i18n="Sign in">${RBt('Sign in')}</span></a>`;
            } else {
                w.innerHTML = `<button class="nav-link account-button"><i class="fa-solid fa-circle-user"></i> <span>${RBesc(user.username || '') || RBt('Account')}</span></button>
                    <div class="account-menu" hidden>${accountMenuHTML(user, participant, 'acc')}</div>`;
            }
            slot.appendChild(w);
            if (user) {
                const btn = w.querySelector('.account-button'), menu = w.querySelector('.account-menu');
                btn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
                document.addEventListener('click', () => { menu.hidden = true; });
                wireAccountMenu(w, 'acc', () => { menu.hidden = true; });
            }
            if (participant) {
                const n = document.querySelector('#topnav');
                n.querySelectorAll('.nav-tool').forEach((el) => el.hidden = true);
                const existing = n.querySelector('.ev-back-link');
                if (!existing) {
                    const bl = document.createElement('a');
                    bl.className = 'nav-link ev-back-link';
                    bl.href = ROOT + 'event/' + encodeURIComponent(participant.event_slug);
                    bl.innerHTML = '<i class="fa-solid fa-arrow-left"></i> ' + RBesc(participant.event_title);
                    n.insertBefore(bl, n.firstChild);
                }
                const p = location.pathname.replace(/\/+$/, '') || '/';
                const root = new URL(ROOT, location.href).pathname.replace(/\/+$/, '') || '/';
                if (p === root) location.href = ROOT + 'event/' + encodeURIComponent(participant.event_slug);
            }
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place); else place();
        // Tab-bar profile dropup (mobile, #303 · #310): the same account menu as the desktop dropdown.
        const tabProfileBtn = document.getElementById('tabProfileBtn');
        if (tabProfileBtn) {
            let tabMenu = document.getElementById('tabProfileMenu');
            if (!tabMenu) {
                tabMenu = document.createElement('div');
                tabMenu.id = 'tabProfileMenu';
                tabMenu.className = 'tabbar-dropup';
                tabMenu.hidden = true;
                tabProfileBtn.parentNode.appendChild(tabMenu);
            }
            if (!user) {
                tabProfileBtn.onclick = () => { location.href = RBLoginUrl(); };
            } else {
                tabMenu.innerHTML = accountMenuHTML(user, participant, 'tab');
                tabProfileBtn.onclick = (e) => { e.stopPropagation(); tabMenu.hidden = !tabMenu.hidden; };
                document.addEventListener('click', () => { tabMenu.hidden = true; });
                wireAccountMenu(tabMenu, 'tab', () => { tabMenu.hidden = true; });
            }
        }
        const tabBackBtn = document.getElementById('tabBackBtn');
        if (tabBackBtn) tabBackBtn.onclick = () => { if (window.history.length > 1) history.back(); else location.href = ROOT; };
    })();

    /* ---------------- Unsaved-work guard (cross-tool) ----------------
       Every tool crash-saves its in-progress work to localStorage and prompts to resume on
       its OWN page. This surfaces that work EVERYWHERE ELSE: a header pill (shown only when
       something is pending in another tool) opens a list to resume or discard each item — so a
       recording, a run or an unsaved draft left in one tool is never silently orphaned. */
    const PENDING_KEYS = ['rb_editor_draft', 'rb_recorder_session', 'rb_recorder_pending_save', 'rb_tripmaster_session', 'rb_session', 'rb_session_roadbook'];
    const PENDING_LABEL = { editor: 'Unsaved draft', recorder: 'Recording in progress', tripmaster: 'Tripmaster run', reader: 'Run in progress' };
    const PENDING_ICON = { editor: 'fa-pen-ruler', recorder: 'fa-circle-dot', tripmaster: 'fa-gauge-high', reader: 'fa-compass' };
    const curTool = (location.pathname.slice(new URL(ROOT, location.href).pathname.length).replace(/^\/+/, '').split('/')[0]) || '';
    // The work left in OTHER tools (the current tool already prompts to resume its own work).
    function listPending() {
        if (!window.RB || !RB.pendingWork) return [];
        const snap = {};
        for (const k of PENDING_KEYS) { try { snap[k] = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { snap[k] = null; } }
        return RB.pendingWork(snap).filter((it) => it.tool !== curTool);
    }
    function pendingDetail(it) {
        if (it.kind === 'draft') return (it.title || RBt('Untitled')) + ' · ' + it.noteCount + ' ' + RBt('notes');
        if (it.kind === 'navigation') return (it.title || RBt('Roadbook')) + ' · ' + it.noteIdx + '/' + it.noteTotal + ' ' + RBt('notes') + ' · ' + RBKm(it.distanceM);
        return RBKm(it.distanceM); // recording · run
    }
    function openPendingModal() {
        const d = RBModal(`<h2><i class="fa-solid fa-floppy-disk icon-accent"></i> ${RBt('Unsaved work')}</h2>
            <p class="muted small">${RBt('Work left in progress in other tools. Resume it, or discard it.')}</p>
            <div class="pending-list"></div>`, 'narrow');
        const listEl = d.q('.pending-list');
        const draw = () => {
            const items = listPending();
            if (!items.length) { d.close(); refreshPendingPill(); return; }
            listEl.innerHTML = items.map((it, i) => `<div class="roadbook-row" data-i="${i}">
                <i class="fa-solid ${PENDING_ICON[it.tool]} icon-accent"></i>
                <div class="meta"><b>${RBesc(RBt(it.kind === 'finished' ? 'Recording to save' : PENDING_LABEL[it.tool]))}</b><small>${RBesc(pendingDetail(it))}</small></div>
                <a class="btn btn-primary" href="${ROOT}${it.url}">${RBt('Resume')}</a>
                ${it.resumeOnly ? '' : '<button class="btn btn-ghost" data-discard><i class="fa-solid fa-trash-can icon-danger"></i></button>'}
            </div>`).join('');
            listEl.querySelectorAll('[data-discard]').forEach((b) => b.onclick = async () => {
                const it = items[+b.closest('[data-i]').dataset.i];
                if (!(await RBConfirmDanger(RBt('Discard') + ' “' + RBt(PENDING_LABEL[it.tool]) + ' · ' + RBesc(pendingDetail(it)) + '”?'))) return;
                it.keys.forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
                RBToast('Discarded.'); draw(); refreshPendingPill();
            });
        };
        draw();
    }
    function refreshPendingPill() {
        const n = listPending().length;
        let pill = document.querySelector('#pendingPill');
        if (!n) { if (pill) pill.hidden = true; return; }
        if (!pill) {
            pill = document.createElement('button');
            pill.id = 'pendingPill'; pill.className = 'pending-pill';
            pill.setAttribute('aria-label', RBt('Unsaved work'));
            pill.onclick = openPendingModal;
            chipStack().prepend(pill);
        }
        pill.hidden = false;
        pill.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> ${RBt('Unsaved work')} <span class="pending-count">${n}</span>`;
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshPendingPill); else refreshPendingPill();

    /* ---------------- Cookie / storage notice (#95) ----------------
       RDBK uses ONLY an essential login session cookie + functional localStorage (preferences,
       offline data) — no ads, no third-party tracking, no profiling. So this is an honest one-time
       notice, not a consent wall; the choice is remembered so it shows once. Never in the native
       app: it is a self-contained bundle with no browser-cookie context, so the notice is moot. */
    const COOKIE_OK_KEY = 'rb_cookie_ok';
    function cookieNotice() {
        if (isNativeApp()) return;
        let seen = false; try { seen = localStorage.getItem(COOKIE_OK_KEY) === '1'; } catch (e) {}
        if (seen || document.querySelector('.cookie-notice')) return;
        const el = document.createElement('div');
        el.className = 'cookie-notice'; el.setAttribute('role', 'note');
        el.innerHTML = `<span class="cookie-text">${RBt('RDBK uses only essential cookies (to keep you signed in) and local storage for your preferences and offline data — no ads, no tracking, no profiling.')} <a href="${ROOT}privacy/">${RBt('Privacy')}</a></span>
            <button class="btn btn-primary cookie-ok" type="button">${RBt('I accept')}</button>`;
        document.body.appendChild(el);
        // Pinned to the bottom, the notice would sit on whatever the page has down there — and on
        // a screen that fills the viewport exactly (the Recorder's start screen) there is nowhere
        // to scroll the control to, so its main button becomes untappable (#405). Publishing the
        // height lets the shared body padding reserve the room; dismissing gives it straight back.
        const publishHeight = () => document.body.style.setProperty('--notice-h', Math.ceil(el.getBoundingClientRect().height) + 'px');
        publishHeight();
        window.addEventListener('resize', publishHeight); // it re-wraps, so its height changes with the width
        el.querySelector('.cookie-ok').onclick = () => {
            try { localStorage.setItem(COOKIE_OK_KEY, '1'); } catch (e) {}
            window.removeEventListener('resize', publishHeight);
            el.remove(); document.body.style.removeProperty('--notice-h');
        };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cookieNotice); else cookieNotice();

    /* ---------------- Web-GPS reliability messaging (#381) ----------------
       The browser Geolocation API is far less dependable than the native app's
       background-capable GPS: on phones (especially Android, sometimes iOS) it is less
       accurate, can drift, and stops when the screen locks or the tab is backgrounded. That
       is invisible to a user who trusts the web app, so we surface it where it matters —
       a persistent floating banner on the GPS tools, and a one-time gate before any
       recording or navigation starts. Never in the native app, where the watch is solid. */
    const GPS_WARN_KEY = 'rb_web_gps_warn_seen';
    // Show a dismissable (per-session) warning when running in a browser. A page calls it once;
    // it returns silently in the native app or once dismissed this session. It goes FIRST in the
    // body, in the flow, so it pushes the page down instead of covering the tool's own top bar
    // (#403) — the CSS carries no `position` for exactly that reason.
    window.RBWebGpsWarn = (msg) => {
        if (isNativeApp()) return;
        if (document.querySelector('.webgps-banner')) return;
        let seen = false; try { seen = sessionStorage.getItem(GPS_WARN_KEY) === '1'; } catch (e) {}
        if (seen) return;
        const el = document.createElement('div');
        el.className = 'webgps-banner'; el.setAttribute('role', 'note');
        // one short line and the way out (#727): the apps, from the install guide
        el.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span class="webgps-text">${RBt(msg || 'web.gps.warn')} <a href="${ROOT}install/">${RBt('Get the app')}</a></span>`;
        const close = document.createElement('button');
        close.type = 'button'; close.className = 'webgps-x'; close.setAttribute('aria-label', RBt('Close'));
        close.textContent = '×'; close.onclick = () => { try { sessionStorage.setItem(GPS_WARN_KEY, '1'); } catch (e) {} el.remove(); };
        el.appendChild(close);
        document.body.prepend(el);
    };
    // One-time (per-browser, remembered) confirmation before a GPS-critical action starts in
    // the browser. Returns a Promise<boolean>. `comp` picks the stronger competition wording.
    window.RBWebGpsConfirm = (comp) => {
        if (isNativeApp()) return Promise.resolve(true);
        try { if (localStorage.getItem('rb_web_gps_ok_' + (comp ? 'comp' : 'nav')) === '1') return Promise.resolve(true); } catch (e) {}
        return new Promise((resolve) => {
            const d = RBModal(`<h2><i class="fa-solid fa-triangle-exclamation icon-danger"></i> ${RBt(comp ? 'web.gps.comp.title' : 'web.gps.title')}</h2>
                <p class="modal-text">${RBt(comp ? 'web.gps.comp.warn' : 'web.gps.warn')}</p>
                <p class="muted small"><i class="fa-solid fa-mobile-screen-button"></i> ${RBt('web.gps.alt')}</p>
                <p class="modal-text"><b>${RBt('Continue in the browser anyway?')}</b></p>
                <div class="btnrow end"><button class="btn btn-ghost" data-no>${RBt('No')}</button><button class="btn btn-primary" data-yes>${RBt('Yes')}</button></div>`, 'narrow', null, { dismissable: false });
            // a question answers No / Yes (#435), and No answers too — an await must never hang (#669)
            d.q('[data-no]').onclick = () => { d.close(); resolve(false); };
            d.q('[data-yes]').onclick = () => { try { localStorage.setItem('rb_web_gps_ok_' + (comp ? 'comp' : 'nav'), '1'); } catch (e) {} d.close(); resolve(true); };
        });
    };
})();
