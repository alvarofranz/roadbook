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

    // API + live-version host. On the web it is the same-origin ROOT. The native app serves its
    // bundled UI from a WebView-local origin with no backend, so the PHP API (accounts, public
    // roadbooks, uploads) and the live version.json live on the production domain, reached
    // cross-origin (the server whitelists the app origin — see cors_for_app). Shared globally so
    // every module (challenges.js…) reaches the backend through the same host.
    const PROD_ROOT = 'https://rdbk.app/';
    const API_ROOT = isNativeApp() ? PROD_ROOT : ROOT;
    window.RB_API_ROOT = API_ROOT;
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

    /* ---------------- Global header + footer (same on every page) ---------------- */
    function renderChrome() {
        const rootPath = new URL(ROOT, location.href).pathname;
        const rel = location.pathname.slice(rootPath.length).replace(/^\/+/, '');
        const active = (p) => rel.indexOf(p) === 0 ? ' active' : '';
        // Each tool → [short nav label, canonical FontAwesome icon]. Short single-word labels keep
        // the desktop bar clean and even; the icon is CSS-hidden there and only shows in the
        // mobile full-screen menu, where it makes the list scannable.
        const TOOLS = {
            recorder:   ['Recorder',   'fa-circle-dot'],
            editor:     ['Editor',     'fa-pen-ruler'],
            reader:     ['Reader',     'fa-compass'],
            tripmaster: ['Tripmaster', 'fa-gauge-high'],
            roadbooks:  ['Roadbooks',  'fa-book-open'],
            events:     ['Events',     'fa-calendar-check'],
            ranking:    ['Ranking',    'fa-ranking-star']
        };
        // The native app is a field companion: the GPS tools + Events (#198). Editor/Ranking/Roadbooks
        // stay web-only in the top nav. The website keeps the full set.
        const order = isNativeApp()
            ? ['reader', 'tripmaster', 'recorder', 'events']
            : ['recorder', 'editor', 'reader', 'tripmaster', 'roadbooks', 'events', 'ranking'];
        // Each tool's "How it works" link lives on the tool page itself (beside the title, or at
        // the foot of the Tripmaster dashboard) — never in the top menu. "Events" is the lone
        // translated label (the future feature); the rest are proper tool names.
        const navLinks = order.map((p) => {
            const [label, icon] = TOOLS[p];
            const text = p === 'events' ? '<span data-i18n="Events">Events</span>' : label;
            return `<a class="nav-link nav-tool${active(p)}" href="${ROOT}${p}/"><i class="fa-solid ${icon} nav-ico"></i><span class="nav-txt">${text}</span></a>`;
        }).join('');
        let header = document.querySelector('header.topbar') || document.querySelector('header');
        if (!header) { header = document.createElement('header'); document.body.prepend(header); }
        header.className = 'topbar';
        header.innerHTML = `<div class="wrap">
            <span class="brand-wrap"><a class="brand" href="${ROOT}"><img class="brand-logo" src="${ROOT}assets/logo.png" alt=""> RDBK.app</a></span>
            <div class="lang lang-bar"></div>
            <button class="navtoggle" id="navToggle" aria-label="Menu" data-i18n-aria="Menu" aria-expanded="false"><i class="fa-solid fa-bars"></i></button>
            <nav class="topnav" id="topnav">${navLinks}<div class="lang lang-top"></div></nav>
        </div>`;
        const toggle = header.querySelector('#navToggle'), nav = header.querySelector('#topnav');
        const setOpen = (open) => {
            nav.classList.toggle('open', open);
            header.classList.toggle('nav-open', open); // drops the blur so the menu can cover the viewport
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            toggle.innerHTML = open ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
            // closing the menu also folds the account submenu — the X stops propagation, so the
            // document-level closer never sees it and it would still be open on the next ☰ (#243)
            if (!open) { const m = nav.querySelector('.account-menu'); if (m) m.hidden = true; }
        };
        toggle.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!nav.classList.contains('open')); });
        document.addEventListener('click', (e) => { if (!nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false); });
        nav.addEventListener('click', (e) => { if (e.target.closest('a, button:not(.account-button)')) setOpen(false); });

        let footer = document.querySelector('footer.foot');
        if (!footer) { footer = document.createElement('footer'); footer.className = 'foot'; document.body.appendChild(footer); }
        footer.innerHTML = `<div class="wrap">
            <div class="muted foot-links">
                <b>RDBK.app</b>
                <a href="${ROOT}about/"><i class="fa-solid fa-circle-info"></i> ${RBt('About')}</a>
                <a href="${ROOT}standard/"><i class="fa-solid fa-book"></i> The .rdbk standard</a>
                <a href="${ROOT}privacy/" data-i18n="Privacy"><i class="fa-solid fa-shield-halved"></i> Privacy</a>
                <a href="${ROOT}terms/"><i class="fa-solid fa-file-contract"></i> ${RBt('Terms of Use')}</a>
                <a href="${ROOT}contact/"><i class="fa-solid fa-envelope"></i> ${RBt('Contact')}</a>
                <span class="small">© ${new Date().getFullYear()} RDBK.app. All rights reserved.</span>
                <span class="small" id="appVersion"></span>
            </div>
        </div>`;
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
    async function checkVersion() {
        // Never reload in the middle of an active session (e.g. a competition run in the Reader):
        // defer until it's free. window.RB_BUSY is set by the tool. The app never hot-refreshes —
        // its code is bundled and updates ship through the store — so this is web-only.
        if (!isNativeApp() && pendingRefresh && !window.RB_BUSY && !refreshing) { refreshing = true; return hardRefresh(); }
        try {
            const v = (await (await fetch(API_ROOT + 'version.json', { cache: 'no-store' })).json()).version;
            if (!v) return;
            const el = document.getElementById('appVersion'); if (el) el.textContent = 'v' + v;
            if (isNativeApp()) return;                        // app: just show the live version; never hot-refresh
            if (appVer == null) { appVer = v; return; }      // first read: set the reference
            if (v !== appVer && !refreshing) {
                appVer = v;
                if (window.RB_BUSY) pendingRefresh = true;   // wait for the session to end
                else { refreshing = true; await hardRefresh(); }
            }
        } catch (e) { /* offline: retried on the next tick, keeps the last shown version */ }
    }
    async function hardRefresh() {
        try { if (swReg) await swReg.update(); } catch (e) {}
        try { if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k))); } catch (e) {}
        location.reload();
    }
    checkVersion();
    setInterval(checkVersion, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });

    // App-only: on the home launcher show the INSTALLED build (via Capacitor) + the LATEST live
    // version, so a tester sees what they're running and whether a newer build is out (#198). The
    // app never hot-updates its code (that ships through TestFlight/Play), so this is how you tell.
    if (isNativeApp()) document.addEventListener('DOMContentLoaded', async () => {
        const el = document.getElementById('appVer'); if (!el) return;
        let build = '';
        try { const info = await Capacitor.Plugins.App.getInfo(); build = info.version + (info.build ? ' (' + info.build + ')' : ''); } catch (e) {}
        let live = '';
        try { live = (await (await fetch(API_ROOT + 'version.json', { cache: 'no-store' })).json()).version; } catch (e) {}
        const parts = [];
        if (build) parts.push(RBt('Installed') + ' ' + build);
        if (live) parts.push(RBt('latest') + ' ' + live);
        el.textContent = parts.join('  ·  ');
        el.hidden = !parts.length;
    });

    /* ---------------- Install (PWA) + iOS ---------------- */
    const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let deferred = null, installBtn = null;

    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; showInstall(); });
    window.addEventListener('appinstalled', () => { deferred = null; if (installBtn) installBtn.hidden = true; });

    function ensureBtn() {
        if (installBtn || isStandalone()) return installBtn;
        const slot = document.querySelector('header .topnav') || document.querySelector('header .wrap');
        if (!slot) return null;
        installBtn = document.createElement('button');
        installBtn.id = 'installBtn';
        installBtn.className = 'nav-link install-btn';
        installBtn.textContent = RBt('Install');
        installBtn.hidden = true;
        installBtn.onclick = onInstall;
        slot.appendChild(installBtn);
        return installBtn;
    }
    // Never offer "Install" inside the native app: it IS the app, and a Capacitor WebView is not
    // display-mode:standalone / navigator.standalone, so without this it would wrongly show (#198).
    function showInstall() { if (isStandalone() || isNativeApp()) return; const b = ensureBtn(); if (b) b.hidden = false; }
    async function onInstall() {
        if (deferred) {
            deferred.prompt();
            const r = await deferred.userChoice; deferred = null;
            if (r.outcome === 'accepted' && installBtn) installBtn.hidden = true;
            return;
        }
        if (isIOS()) showIosModal();
    }
    // iOS Safari never fires beforeinstallprompt: offer the button when not installed (never in the app).
    if (isIOS() && !isStandalone() && !isNativeApp()) document.addEventListener('DOMContentLoaded', showInstall);

    function showIosModal() {
        const d = RBModal(`<h2><i class="fa-solid fa-mobile-screen icon-accent"></i> ${RBt('Install on iPhone')}</h2>
            <p class="muted small">${RBt('From Safari, in 3 steps:')}</p>
            <ol class="ios-steps">
                <li>${RBt('Tap <b>Share</b> <i class="fa-solid fa-arrow-up-from-bracket icon-accent"></i> in the bar.')}</li>
                <li>${RBt('Choose <b>Add to Home Screen</b> <i class="fa-solid fa-square-plus icon-accent"></i>.')}</li>
                <li>${RBt('Tap <b>Add</b>. Done!')}</li>
            </ol>
            <div class="btnrow"><button class="btn btn-primary" data-ok>${RBt('Got it')}</button></div>`);
        d.q('[data-ok]').onclick = d.close;
    }

    /* ---------------- Client-side image downscaler ----------------
       Shrinks photos in the browser BEFORE upload so they never hit PHP's
       post_max_size and uploads stay tiny. Used by avatar + gallery + logo. */
    window.RBImg = {
        _canvas(file, max) {
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
            try { const c = await this._canvas(file, max); return await new Promise((r) => c.toBlob((b) => r(b || file), 'image/jpeg', q)); }
            catch (e) { return file; }
        },
        // → a PNG data: URI (for embedding, e.g. the event logo — keeps transparency)
        async toDataURL(file, max = 256) { const c = await this._canvas(file, max); return c.toDataURL('image/png'); },
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
    // Overlay modal. Pass the card's inner HTML (+ optional card style + backdrop-dismiss
    // callback + options). Options: { dismissable } — set dismissable:false for data-entry
    // forms, so a stray backdrop click or Escape can't discard what you typed (close only via
    // the dialog's own buttons). Returns { el, q(sel), close }.
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
    window.RBModal = (cardHtml, cardClass, onDismiss, opts) => {
        const dismissable = !(opts && opts.dismissable === false);
        const m = document.createElement('div'); m.className = 'modal';
        const card = document.createElement('div');
        card.className = 'modal-card' + (cardClass ? ' ' + cardClass : '');
        card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.tabIndex = -1;
        card.innerHTML = cardHtml;
        m.appendChild(card);
        document.body.appendChild(m);
        let release;
        const close = () => { if (release) release(); m.remove(); };
        // dismissable dialogs close on Escape and on a backdrop click; a non-dismissable form
        // ignores both and is closed only by its own buttons (Escape still traps focus, no close).
        release = RBFocusTrap(card, dismissable ? () => { close(); if (onDismiss) onDismiss(); } : null);
        if (dismissable) m.addEventListener('click', (e) => { if (e.target === m) { close(); if (onDismiss) onDismiss(); } });
        return { el: m, q: (s) => m.querySelector(s), close };
    };
    // HTML-escape for safe interpolation into innerHTML.
    window.RBesc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    // Shared roadbook one-liner subtitle: "12.3 km · 45 notes" (translated unit word).
    window.RBSummary = (distanceM, noteCount) => (distanceM / 1000).toFixed(1) + ' km · ' + noteCount + ' ' + RBt('notes');
    // Set SEO meta at runtime for the public dynamic pages (challenge, event): title + description
    // + canonical, keeping the og:/twitter: mirrors in sync. Creates any missing tag; skips nulls.
    window.RBSetMeta = ({ title, description, canonical }) => {
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
    // Human-readable byte size, e.g. "12.3 MB" / "640 KB" (shared by the storage indicator + admin).
    window.RBFmtSize = (b) => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
    // An ISO YYYY-MM-DD date in the ACTIVE UI language's format (event dates). The parts are
    // used as-is — never parsed as UTC, so the day can't shift across timezones.
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
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('input[type="date"]').forEach((inp) => { try { RBDateField(inp); } catch (e) {} });
    });

    // Shared fullscreen toggle for the field tools (Tripmaster, Reader): hides the site header +
    // footer for a distraction-free view and uses the browser Fullscreen API where available. Pass
    // the toggle button; its <i> icon swaps expand/compress. Leaving browser fullscreen (Esc)
    // restores everything. Page CSS offsets any sticky bar via `body.rb-fs`.
    window.RBFullscreen = (btn) => {
        if (!btn) return;
        const set = (on) => {
            document.body.classList.toggle('rb-fs', on);
            const i = btn.querySelector('i'); if (i) i.className = on ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
        };
        btn.addEventListener('click', () => {
            const on = !document.body.classList.contains('rb-fs');
            set(on);
            try {
                if (on) { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); }
                else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
            } catch (e) {}
        });
        document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) set(false); });
    };
    // The one chevron pager (‹ page/pages ›, plus an optional trailing label): empty on a single
    // page (the label alone stays, e.g. a result count). onGo(page) fires already clamped.
    window.RBPager = (el, page, pages, onGo, label) => {
        if (!el) return;
        el.innerHTML = pages > 1
            ? `<button class="btn btn-ghost" data-pg="${page - 1}"${page <= 1 ? ' disabled' : ''} aria-label="${RBesc(RBt('Previous'))}"><i class="fa-solid fa-chevron-left"></i></button><span class="muted small">${page} / ${pages}${label ? ' · ' + label : ''}</span><button class="btn btn-ghost" data-pg="${page + 1}"${page >= pages ? ' disabled' : ''} aria-label="${RBesc(RBt('Next'))}"><i class="fa-solid fa-chevron-right"></i></button>`
            : (label ? `<span class="muted small">${label}</span>` : '');
        el.querySelectorAll('[data-pg]').forEach((b) => b.onclick = () => { const p = +b.dataset.pg; if (p >= 1 && p <= pages) onGo(p); });
    };
    // An event's date range for a meta line: "start – end", the single date, or '' when undated.
    window.RBDateRange = (startIso, endIso) => startIso ? (endIso && endIso !== startIso ? RBFmtDate(startIso) + ' – ' + RBFmtDate(endIso) : RBFmtDate(startIso)) : '';
    // One public gallery card (Roadbooks · Events · event page · home teaser): thumb (or an icon
    // placeholder), title and a meta line. `meta`/`overlays`/`body`/`placeholder` are HTML the
    // caller already escaped; `overlays` floats over the image, `body` follows the meta line.
    window.RBGalleryCard = ({ href, thumb, title, meta, icon = 'fa-map-location-dot', placeholder = '', overlays = '', body = '' }) =>
        `<a class="gallery-card" href="${RBesc(href)}">`
        + (thumb ? `<img class="thumb" src="${RBesc(RBMediaSrc(thumb))}" alt="${RBesc(title)}" loading="lazy">`
                 : (placeholder || `<div class="thumb thumb-placeholder"><i class="fa-solid ${icon}"></i></div>`))
        + overlays
        + `<div class="gallery-body"><h3>${RBesc(title)}</h3><div class="gallery-meta">${meta}</div>${body}</div></a>`;
    // Gate an admin/management page behind sign-in (and optionally the admin role): resolves the
    // signed-in user, or writes the standard message into msgEl and returns null. `account` is
    // the relative path to the sign-in page (page depths differ).
    window.RBRequireUser = async (msgEl, { admin = false } = {}) => {
        const cfg = await RBApi('config').catch(() => ({}));
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
    // The waypoint quick-text prompt (Recorder + the Editor's route recording): shown right
    // after the waypoint drops, auto-dismisses after 5 s ("Edit later (5)…") unless the user
    // starts typing. opts.mic adds the dictation button (speech-to-text where supported) with
    // opts.lang() as its language. onDone(text) fires exactly once, however the modal closes.
    window.RBWaypointPrompt = (num, onDone, opts = {}) => {
        const SR = opts.mic ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
        const inputHtml = SR
            ? `<div class="wf-row"><input id="wfText" class="field" placeholder="${RBesc(RBt('Quick note (optional)…'))}" autocomplete="off"><button class="btn btn-ghost" type="button" id="wfMic" aria-label="${RBesc(RBt('Dictate'))}" title="${RBesc(RBt('Dictate'))}"><i class="fa-solid fa-microphone"></i></button></div>`
            : `<input id="wfText" class="modal-in" placeholder="${RBesc(RBt('Quick note (optional)…'))}" autocomplete="off">`;
        const d = RBModal(`<h3>${RBesc(RBt('Waypoint'))} ${num}</h3>
            ${inputHtml}
            <div class="btnrow end"><button class="btn btn-primary" id="wfBtn">${RBesc(RBt('Edit later'))} (5)</button></div>`, 'narrow', () => finish());
        const inp = d.q('#wfText'), btn = d.q('#wfBtn');
        setTimeout(() => inp.focus(), 50);
        let n = 5, typed = false, done = false;
        const timer = setInterval(() => { if (typed) return; if (--n <= 0) finish(); else btn.textContent = `${RBt('Edit later')} (${n})`; }, 1000);
        function finish() { if (done) return; done = true; clearInterval(timer); d.close(); onDone(inp.value.trim()); }
        inp.addEventListener('input', () => { if (inp.value && !typed) { typed = true; btn.textContent = RBt('Save note'); } });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(); });
        btn.onclick = finish;
        if (SR) { // dictate straight into the field (tap to start, tap to stop)
            const mic = d.q('#wfMic'); let rec = null;
            mic.onclick = () => {
                if (rec) { rec.stop(); return; }
                rec = new SR();
                rec.lang = opts.lang ? opts.lang() : document.documentElement.lang;
                rec.interimResults = true;
                rec.onresult = (e) => { let txt = ''; for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript; inp.value = txt; typed = true; btn.textContent = RBt('Save note'); };
                const stop = () => { mic.classList.remove('on'); rec = null; };
                rec.onend = stop; rec.onerror = stop;
                mic.classList.add('on'); try { rec.start(); } catch (e) { stop(); }
            };
        }
    };
    // A just-captured photo: full preview + OK / "Convert into waypoint" (Recorder + the
    // Editor's route recording). onWaypoint fires only when the user converts.
    window.RBPhotoPreview = (url, onWaypoint) => {
        const d = RBModal(`<img src="${RBesc(url)}" alt="" class="photo-preview">
            <div class="btnrow center">
                <button class="btn btn-ghost" id="ptOk">OK</button>
                <button class="btn btn-primary" id="ptWpt"><i class="fa-solid fa-location-dot"></i> ${RBesc(RBt('Convert into waypoint'))}</button>
            </div>`, 'slim center');
        d.q('#ptOk').onclick = d.close;
        d.q('#ptWpt').onclick = () => { onWaypoint(); d.close(); };
    };
    // The signed-in user's saved roadbooks rendered into `container` — shared by My roadbooks
    // and the Editor landing. Loads rb_list, draws one .roadbook-row each (View/Edit/Duplicate/
    // Delete), wires duplicate+delete (re-rendering after each). Returns the count (0 = none).
    // Relative links work from any one-level-deep tool page (/editor/, /myroadbooks/).
    // Publication-status labels for the My-roadbooks status control (draft/ready/public).
    const RB_STATUS_LABEL = { draft: 'Draft', ready: 'Ready', public: 'Public' };
    window.RBRoadbookList = async (container, onChange) => { // onChange: fires after a delete/duplicate, so the page can refresh siblings (e.g. the trash, #238)
        if (!container) return 0;
        const r = await RBApi('rb_list');
        // a failed call is NOT an empty list — offline in the field must never read as
        // "you have no roadbooks" (#218)
        if (!r.ok) { container.innerHTML = `<p class="muted small"><i class="fa-solid fa-triangle-exclamation"></i> ${RBesc(RBt(navigator.onLine === false ? 'You are offline — reconnect to see your roadbooks.' : (r.error || 'Could not load.')))}</p>`; return 0; }
        const all = r.roadbooks || [];
        if (!all.length) { container.innerHTML = `<p class="muted small">${RBesc(RBt('No roadbooks yet. Create one in the Editor.'))}</p>`; return 0; }
        const PER = 12;
        let page = 1, q = '';
        // Search box only once the list is long enough to need it; the pager appears only past one page.
        container.innerHTML =
            ((r.used_bytes != null && r.quota_bytes) ? `<div class="rb-usage muted small"><i class="fa-solid fa-database"></i> ${RBesc(RBt('Storage'))}: ${RBFmtSize(r.used_bytes)} / ${RBFmtSize(r.quota_bytes)}</div>` : '') +
            (all.length > 5 ? `<div class="rb-toolbar"><i class="fa-solid fa-magnifying-glass"></i><input type="search" class="field rb-search" placeholder="${RBesc(RBt('Search roadbooks…'))}" autocomplete="off" spellcheck="false"></div>` : '') +
            `<div class="rb-grid"></div><div class="pager"></div>`;
        const rowsEl = container.querySelector('.rb-grid'), pagerEl = container.querySelector('.pager');
        const rowHtml = (rb) => `<div class="roadbook-row">
            <div class="meta"><b>${RBesc(rb.title)}</b><small>${RBSummary(rb.total_distance, rb.note_count)} · <i class="fa-solid fa-clock-rotate-left"></i> ${RBFmtDate(rb.updated_at)}${rb.total_bytes ? ` · <i class="fa-solid fa-database"></i> ${RBFmtSize(rb.total_bytes)}` : ''}</small></div>
            <select class="rb-status rb-status-${rb.status}" data-status="${rb.id}" aria-label="${RBesc(RBt('Status'))}" title="${RBesc(RBt('Status'))}">${RB.ROADBOOK_STATUSES.map((s) => `<option value="${s}"${rb.status === s ? ' selected' : ''}>${RBesc(RBt(RB_STATUS_LABEL[s]))}</option>`).join('')}</select>
            <a class="btn btn-ghost" href="../reader/?rb=${rb.id}" title="${RBesc(RBt('Read'))}" aria-label="${RBesc(RBt('Read'))}"><i class="fa-solid fa-book-open"></i></a>
            <a class="btn btn-ghost" href="../challenge/${rb.slug || ''}" title="${RBesc(RBt('View'))}" aria-label="${RBesc(RBt('View'))}"><i class="fa-solid fa-eye"></i></a>
            ${rb.status === 'public' && rb.slug ? `<button class="btn btn-ghost" data-copy="${RBesc(rb.slug)}" title="${RBesc(RBt('Copy link'))}" aria-label="${RBesc(RBt('Copy link'))}"><i class="fa-solid fa-link"></i></button>` : ''}
            <a class="btn btn-ghost" href="../editor/?rb=${rb.id}" title="${RBesc(RBt('Edit'))}" aria-label="${RBesc(RBt('Edit'))}"><i class="fa-solid fa-pen"></i></a>
            <a class="btn btn-ghost" href="../editor/?rb=${rb.id}&export=1" title="${RBesc(RBt('Export'))}" aria-label="${RBesc(RBt('Export'))}"><i class="fa-solid fa-file-export"></i></a>
            <button class="btn btn-ghost" data-dup="${rb.id}" title="${RBesc(RBt('Save as'))}" aria-label="${RBesc(RBt('Save as'))}"><i class="fa-solid fa-clone"></i></button>
            <button class="btn btn-ghost" data-del="${rb.id}" data-title="${RBesc(rb.title)}" title="${RBesc(RBt('Delete'))}" aria-label="${RBesc(RBt('Delete'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button>
        </div>`;
        const wireRows = () => {
            rowsEl.querySelectorAll('[data-dup]').forEach((b) => b.onclick = async () => {
                const x = await RBApi('rb_duplicate', { id: +b.dataset.dup });
                if (x.ok) { RBToast('Roadbook duplicated.'); RBRoadbookList(container, onChange); if (onChange) onChange(); } else RBToast(x.error || 'Could not duplicate.');
            });
            rowsEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
                if (await RBConfirmDanger(RBt('Delete roadbook') + ' “' + RBesc(b.dataset.title || '') + '”?', 'Delete')) { await RBApi('rb_delete', { id: +b.dataset.del }); RBRoadbookList(container, onChange); if (onChange) onChange(); }
            });
            rowsEl.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => RBCopy(RBReaderLink(b.dataset.copy)));
            rowsEl.querySelectorAll('[data-status]').forEach((sel) => sel.onchange = async () => {
                const r = await RBApi('rb_status', { id: +sel.dataset.status, status: sel.value });
                RBToast(r.ok ? 'Status updated.' : (r.error || 'Could not change visibility.'));
                RBRoadbookList(container, onChange); // re-render from the server truth (also resets on error)
            });
        };
        const render = () => {
            const filtered = (window.RB && RB.filterRoadbooks) ? RB.filterRoadbooks(all, q) : all;
            const pages = Math.max(1, Math.ceil(filtered.length / PER));
            if (page > pages) page = pages;
            const slice = filtered.slice((page - 1) * PER, page * PER);
            rowsEl.innerHTML = slice.length ? slice.map(rowHtml).join('') : `<p class="muted small">${RBesc(RBt('No matching roadbooks.'))}</p>`;
            RBPager(pagerEl, page, pages, (p) => { page = p; render(); });
            wireRows();
        };
        const search = container.querySelector('.rb-search');
        if (search) search.oninput = () => { q = search.value; page = 1; render(); };
        render();
        return all.length;
    };
    // Admin-only: every public roadbook (any owner) as .roadbook-row cards, each with a
    // force-private control (moderation). Reuses admin_roadbooks / admin_unpublish. Returns the count.
    window.RBPublicRoadbooksList = async (container) => {
        if (!container) return 0;
        const r = await RBApi('admin_roadbooks');
        if (!r.ok) { container.innerHTML = ''; return 0; }
        const list = r.roadbooks || [];
        container.innerHTML = list.length ? list.map((rb) => `<div class="roadbook-row">
            <div class="meta"><b>${RBesc(rb.title)}</b><small>@${RBesc(rb.username)} · ${RBSummary(rb.total_distance, rb.note_count)}</small></div>
            <button class="rb-badge public" data-unpub="${rb.id}" data-title="${RBesc(rb.title)}" title="${RBesc(RBt('Make private'))}" aria-label="${RBesc(RBt('Make private'))}"><i class="fa-solid fa-globe"></i> ${RBesc(RBt('Public'))}</button>
            <a class="btn btn-ghost" href="/challenge/${rb.slug || ''}" title="${RBesc(RBt('View'))}" aria-label="${RBesc(RBt('View'))}"><i class="fa-solid fa-eye"></i></a>
        </div>`).join('') : `<p class="muted small">${RBesc(RBt('No public roadbooks yet.'))}</p>`;
        container.querySelectorAll('[data-unpub]').forEach((b) => b.onclick = async () => {
            if (!(await RBConfirm(RBt('Make this roadbook private?') + ' “' + RBesc(b.dataset.title || '') + '”', RBt('Make private')))) return;
            const x = await RBApi('admin_unpublish', { id: +b.dataset.unpub });
            if (x.ok) { RBToast('Roadbook is now private.'); RBPublicRoadbooksList(container); } else RBToast(x.error || 'Could not change visibility.');
        });
        return list.length;
    };
    // Translated toast (every tool page ships an empty #toast element).
    let toastTimer = null;
    window.RBToast = (msg) => {
        const el = document.getElementById('toast'); if (!el) return;
        el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); // announce to screen readers
        el.textContent = RBt(msg); el.hidden = false;
        clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
    };
    // Copy text (e.g. a roadbook share link) to the clipboard, with a translated toast.
    window.RBCopy = async (text) => {
        try { await navigator.clipboard.writeText(text); RBToast('Link copied'); }
        catch (e) { RBToast('Could not copy the link.'); }
    };
    // Absolute "read in the Reader" link for a public roadbook slug — the shareable URL.
    window.RBReaderLink = (slug) => location.origin + '/reader/' + encodeURIComponent(slug);
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
    }).then((r) => r.json()).then((j) => rbCaptureToken(action, j)).catch(() => ({ ok: false, error: 'Network error.' }));
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
    // Trigger a download from a Blob or a URL.
    window.RBDownload = (data, filename) => {
        const url = (typeof data === 'string') ? data : URL.createObjectURL(data);
        const a = document.createElement('a'); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        if (typeof data !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    // Upload one image (downscaled first) to upload.php. `fields` = extra form fields.
    // POST a multipart upload to upload.php. Photos go through the image downscale; voice
    // notes upload the recorded blob as-is.
    const rbPostUpload = async (fields, fieldName, blob, name) => {
        const fd = new FormData();
        for (const k in fields) fd.append(k, fields[k]);
        fd.append(fieldName, blob, name);
        try { return await (await fetch(API_ROOT + 'api/upload.php', { method: 'POST', credentials: 'same-origin', headers: rbAuthHeaders({}), body: fd })).json(); }
        catch (e) { return { ok: false, error: 'Upload failed.' }; }
    };
    window.RBUpload = async (fields, file, name) => rbPostUpload(fields, 'photo', await RBImg.toBlob(file), name || 'photo.jpg');
    // The filename extension follows the blob's MIME (MediaRecorder output differs by browser)
    // so the server stores it under a type it can serve back.
    window.RBUploadAudio = async (fields, blob, name) => {
        const ext = ({ 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' })[(blob.type || '').split(';')[0]] || 'webm';
        return rbPostUpload(fields, 'audio', blob, name || ('audio.' + ext));
    };

    /* ---------------- Styled confirm + auth prompt (built on RBModal) ---------------- */
    // msg and okLabel run through RBt: plain English keys translate, already-
    // translated or composed strings fall through unchanged.
    window.RBConfirm = (msg, okLabel, danger) => new Promise((resolve) => {
        const ok = danger
            ? `<button class="btn btn-danger" data-yes><i class="fa-solid fa-triangle-exclamation"></i> ${RBt(okLabel || 'OK')}</button>`
            : `<button class="btn btn-primary" data-yes>${RBt(okLabel || 'OK')}</button>`;
        const d = RBModal(`<p class="modal-text">${RBt(msg)}</p>
            <div class="btnrow end">
                <button class="btn btn-ghost" data-no>${RBt('Cancel')}</button>
                ${ok}
            </div>`, 'narrow', () => resolve(false));
        const done = (v) => { d.close(); resolve(v); };
        d.q('[data-yes]').onclick = () => done(true);
        d.q('[data-no]').onclick = () => done(false);
    });
    // Confirm for a destructive/data-losing action: same as RBConfirm but a red button + warning
    // icon. Use it for anything that deletes or overwrites; name the object in `msg` (e.g. its title).
    window.RBConfirmDanger = (msg, okLabel) => window.RBConfirm(msg, okLabel, true);
    window.RBNeedAuth = (msg) => {
        const d = RBModal(`<h2><i class="fa-solid fa-circle-user icon-accent"></i> ${RBt('Sign in')}</h2>
            <p class="muted">${RBt(msg || 'Create a free account to save and share your roadbooks.')}</p>
            <div class="btnrow center spaced">
                <button class="btn btn-ghost" data-no>${RBt('Not now')}</button>
                <a class="btn btn-primary" href="${RBLoginUrl()}"><i class="fa-solid fa-right-to-bracket"></i> ${RBt('Sign in / Create account')}</a>
            </div>`, 'narrow center');
        d.q('[data-no]').onclick = d.close;
    };

    // Site-wide announcement banner (#103): rendered under the header from the config payload.
    function renderBanner(banner) {
        document.querySelector('.site-banner')?.remove();
        if (!banner || !banner.text) return;
        const el = document.createElement('div');
        el.className = 'site-banner site-banner-' + (banner.level === 'warning' ? 'warning' : 'info');
        el.innerHTML = `<span>${RBesc(banner.text)}</span><button class="site-banner-x" aria-label="${RBesc(RBt('Dismiss'))}"><i class="fa-solid fa-xmark"></i></button>`;
        const header = document.querySelector('header.topbar');
        (header || document.body).insertAdjacentElement(header ? 'afterend' : 'afterbegin', el);
        el.querySelector('.site-banner-x').onclick = () => el.remove();
    }

    /* ---------------- Account control in the header ---------------- */
    (async function accountControl() {
        const cfg = await RBConfig();
        const user = cfg.user || null;
        renderBanner(cfg.banner);
        // Admins get the in-context UI translation editor (#118) — a small script loaded only for
        // them; it stays dormant until they turn edit mode on. Never loaded for anyone else.
        if (user && user.is_admin) { const s = document.createElement('script'); s.src = ROOT + 'assets/js/i18n-edit.js'; s.async = true; document.head.appendChild(s); }
        // A signed-in user's language preference follows them across devices: apply it on
        // connect, and persist any later switch from the header selector.
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
                w.innerHTML = `<a class="nav-link account-login" href="${RBLoginUrl()}"><i class="fa-solid fa-circle-user"></i> <span>${RBt('Sign in')}</span></a>`;
            } else {
                w.innerHTML = `<button class="nav-link account-button"><i class="fa-solid fa-circle-user"></i> <span>${RBesc(user.username || '')}</span></button>
                    <div class="account-menu" hidden>
                        <a href="${ROOT}account/"><i class="fa-solid fa-user"></i> ${RBt('My profile')}</a>
                        <a href="${ROOT}myroadbooks/"><i class="fa-solid fa-book"></i> ${RBt('My roadbooks')}</a>
                        ${user.is_admin ? `<a href="${ROOT}admin/roadbooks/"><i class="fa-solid fa-globe"></i> ${RBt('Public Roadbooks')}</a>
                        <hr class="menu-sep">
                        <a href="${ROOT}admin/events/"><i class="fa-solid fa-flag-checkered"></i> ${RBt('Event management')}</a>
                        <hr class="menu-sep">
                        <a href="${ROOT}admin/"><i class="fa-solid fa-users-gear"></i> ${RBt('User management')}</a>
                        <a href="${ROOT}admin/config/"><i class="fa-solid fa-sliders"></i> ${RBt('Site settings')}</a>
                        <a href="${ROOT}admin/trash/"><i class="fa-solid fa-trash-can"></i> ${RBt('Roadbook trash')}</a>
                        <a href="${ROOT}admin/logs/"><i class="fa-solid fa-list-check"></i> ${RBt('Logs')}</a>` : ''}
                        ${(!user.is_admin && (user.is_organizer || user.manages_events)) ? `<hr class="menu-sep"><a href="${ROOT}admin/events/"><i class="fa-solid fa-flag-checkered"></i> ${RBt('Event management')}</a>` : ''}
                        <button id="accountLogout"><i class="fa-solid fa-right-from-bracket"></i> ${RBt('Sign out')}</button>
                    </div>`;
            }
            slot.appendChild(w);
            if (user) {
                const btn = w.querySelector('.account-button'), menu = w.querySelector('.account-menu');
                btn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
                document.addEventListener('click', () => { menu.hidden = true; });
                w.querySelector('#accountLogout').onclick = async () => { await RBApi('logout'); location.reload(); };
            }
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place); else place();
    })();

    /* ---------------- Unsaved-work guard (cross-tool) ----------------
       Every tool crash-saves its in-progress work to localStorage and prompts to resume on
       its OWN page. This surfaces that work EVERYWHERE ELSE: a header pill (shown only when
       something is pending in another tool) opens a list to resume or discard each item — so a
       recording, a run or an unsaved draft left in one tool is never silently orphaned. */
    const PENDING_KEYS = ['rb_editor_draft', 'rb_recorder_session', 'rb_tripmaster_session', 'rb_session', 'rb_session_roadbook'];
    const PENDING_LABEL = { editor: 'Unsaved draft', recorder: 'Recording in progress', tripmaster: 'Tripmaster run', reader: 'Run in progress' };
    const PENDING_ICON = { editor: 'fa-pen-ruler', recorder: 'fa-circle-dot', tripmaster: 'fa-gauge-high', reader: 'fa-book-open' };
    const curTool = (location.pathname.slice(new URL(ROOT, location.href).pathname.length).replace(/^\/+/, '').split('/')[0]) || '';
    const km = (m) => (m / 1000).toFixed(2) + ' km';
    // The work left in OTHER tools (the current tool already prompts to resume its own work).
    function listPending() {
        if (!window.RB || !RB.pendingWork) return [];
        const snap = {};
        for (const k of PENDING_KEYS) { try { snap[k] = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { snap[k] = null; } }
        return RB.pendingWork(snap).filter((it) => it.tool !== curTool);
    }
    function pendingDetail(it) {
        if (it.kind === 'draft') return (it.title || RBt('Untitled')) + ' · ' + it.noteCount + ' ' + RBt('notes');
        if (it.kind === 'navigation') return (it.title || RBt('Roadbook')) + ' · ' + it.noteIdx + '/' + it.noteTotal + ' ' + RBt('notes') + ' · ' + km(it.distanceM);
        return km(it.distanceM); // recording · run
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
                <div class="meta"><b>${RBesc(RBt(PENDING_LABEL[it.tool]))}</b><small>${RBesc(pendingDetail(it))}</small></div>
                <a class="btn btn-primary" href="${ROOT}${it.url}">${RBt('Resume')}</a>
                <button class="btn btn-ghost" data-discard><i class="fa-solid fa-trash-can icon-danger"></i></button>
            </div>`).join('');
            listEl.querySelectorAll('[data-discard]').forEach((b) => b.onclick = async () => {
                const it = items[+b.closest('[data-i]').dataset.i];
                if (!(await RBConfirmDanger(RBt('Discard') + ' “' + RBt(PENDING_LABEL[it.tool]) + ' · ' + RBesc(pendingDetail(it)) + '”?', 'Discard'))) return;
                it.keys.forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
                RBToast('Discarded.'); draw(); refreshPendingPill();
            });
        };
        draw();
    }
    function refreshPendingPill() {
        const slot = document.querySelector('header.topbar .wrap');
        if (!slot) return;
        const n = listPending().length;
        let pill = slot.querySelector('#pendingPill');
        if (!n) { if (pill) pill.hidden = true; return; }
        if (!pill) {
            pill = document.createElement('button');
            pill.id = 'pendingPill'; pill.className = 'pending-pill';
            pill.setAttribute('aria-label', RBt('Unsaved work'));
            pill.onclick = openPendingModal;
            slot.insertBefore(pill, slot.querySelector('#navToggle'));
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
        el.querySelector('.cookie-ok').onclick = () => { try { localStorage.setItem(COOKIE_OK_KEY, '1'); } catch (e) {} el.remove(); };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cookieNotice); else cookieNotice();
})();
