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

    // True only inside a Capacitor native shell (available synchronously at startup).
    const isNativeApp = () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());

    // Native shell: load the native capability bridge (RBNative) and flag the document
    // for safe-area styling. Never runs in a plain browser — the PWA stays unchanged.
    if (isNativeApp()) {
        document.documentElement.classList.add('native');
        const nativeBridge = document.createElement('script');
        nativeBridge.src = ROOT + 'assets/js/native.bundle.js';
        document.head.appendChild(nativeBridge);
    }

    /* ---------------- Global header + footer (same on every page) ---------------- */
    function renderChrome() {
        const rootPath = new URL(ROOT, location.href).pathname;
        const rel = location.pathname.slice(rootPath.length).replace(/^\/+/, '');
        const active = (p) => rel.indexOf(p) === 0 ? ' active' : '';
        // The native app is a field companion: Reader · Tripmaster · Recorder only (Editor and
        // Ranking stay web-only). The website keeps the full set.
        const tools = isNativeApp()
            ? [['reader', 'Reader'], ['tripmaster', 'Tripmaster'], ['recorder', 'Recorder']]
            : [['recorder', 'Recorder'], ['editor', 'Editor'], ['reader', 'Reader'], ['tripmaster', 'Tripmaster'], ['ranking', 'Ranking'], ['roadbooks', 'Roadbooks']];
        const navLinks = tools.map(([p, label]) => `<a class="nav-link${active(p)}" href="${ROOT}${p}/">${label}</a>`).join('');
        let header = document.querySelector('header.topbar') || document.querySelector('header');
        if (!header) { header = document.createElement('header'); document.body.prepend(header); }
        header.className = 'topbar';
        header.innerHTML = `<div class="wrap">
            <a class="brand" href="${ROOT}"><img class="brand-logo" src="${ROOT}assets/logo.png" alt=""> RDBK.app</a>
            <button class="navtoggle" id="navToggle" aria-label="Menu" data-i18n-aria="Menu" aria-expanded="false"><i class="fa-solid fa-bars"></i></button>
            <nav class="topnav" id="topnav">${navLinks}<div class="lang lang-top" role="group" aria-label="Language" data-i18n-aria="Language"><button data-lang="en">EN</button><button data-lang="es">ES</button><button data-lang="it">IT</button></div></nav>
        </div>`;
        const toggle = header.querySelector('#navToggle'), nav = header.querySelector('#topnav');
        const setOpen = (open) => {
            nav.classList.toggle('open', open);
            header.classList.toggle('nav-open', open); // drops the blur so the menu can cover the viewport
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            toggle.innerHTML = open ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
        };
        toggle.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!nav.classList.contains('open')); });
        document.addEventListener('click', (e) => { if (!nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false); });
        nav.addEventListener('click', (e) => { if (e.target.closest('a, button:not(.account-button)')) setOpen(false); });

        let footer = document.querySelector('footer.foot');
        if (!footer) { footer = document.createElement('footer'); footer.className = 'foot'; document.body.appendChild(footer); }
        footer.innerHTML = `<div class="wrap">
            <div class="muted foot-links">
                <b>RDBK.app</b>
                <a href="${ROOT}standard/"><i class="fa-solid fa-book"></i> The .rdbk standard</a>
                <a href="https://github.com/alvarofranz/roadbook" target="_blank" rel="noopener"><i class="fa-brands fa-github"></i> GitHub</a>
                <a href="https://choosealicense.com/licenses/wtfpl/" target="_blank" rel="noopener"><i class="fa-solid fa-scale-balanced"></i> WTFPL</a>
                <span class="small" id="appVersion"></span>
            </div>
            <div class="lang" role="group" aria-label="Language" data-i18n-aria="Language"><button data-lang="en">EN</button><button data-lang="es">ES</button><button data-lang="it">IT</button></div>
        </div>`;
        if (!window.RBi18n) { const l = footer.querySelector('.lang'); if (l) l.hidden = true; }
    }
    try { renderChrome(); } catch (e) { console.warn('chrome', e); }
    // Safety net: if anything raced, ensure the header is filled once the DOM is ready.
    document.addEventListener('DOMContentLoaded', () => {
        const h = document.querySelector('header.topbar');
        if (h && !h.querySelector('.topnav')) { try { renderChrome(); } catch (e) {} }
    });

    /* ---------------- Service Worker ---------------- */
    let swReg = null;
    if ('serviceWorker' in navigator) {
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
        // Never reload in the middle of an active session (e.g. a competition run
        // in the Reader): defer until it's free. window.RB_BUSY is set by the tool.
        if (pendingRefresh && !window.RB_BUSY && !refreshing) { refreshing = true; return hardRefresh(); }
        try {
            const v = (await (await fetch(ROOT + 'version.json', { cache: 'no-store' })).json()).version;
            if (!v) return;
            const el = document.getElementById('appVersion'); if (el) el.textContent = 'v' + v;
            if (appVer == null) { appVer = v; return; }      // first read: set the reference
            if (v !== appVer && !refreshing) {
                appVer = v;
                if (window.RB_BUSY) pendingRefresh = true;   // wait for the session to end
                else { refreshing = true; await hardRefresh(); }
            }
        } catch (e) { /* offline: retried on the next tick */ }
    }
    async function hardRefresh() {
        try { if (swReg) await swReg.update(); } catch (e) {}
        try { if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k))); } catch (e) {}
        location.reload();
    }
    checkVersion();
    setInterval(checkVersion, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });

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
    function showInstall() { if (isStandalone()) return; const b = ensureBtn(); if (b) b.hidden = false; }
    async function onInstall() {
        if (deferred) {
            deferred.prompt();
            const r = await deferred.userChoice; deferred = null;
            if (r.outcome === 'accepted' && installBtn) installBtn.hidden = true;
            return;
        }
        if (isIOS()) showIosModal();
    }
    // iOS Safari never fires beforeinstallprompt: offer the button when not installed.
    if (isIOS() && !isStandalone()) document.addEventListener('DOMContentLoaded', showInstall);

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
    // callback). Returns { el, q(sel), close }.
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
    window.RBModal = (cardHtml, cardClass, onDismiss) => {
        const m = document.createElement('div'); m.className = 'modal';
        const card = document.createElement('div');
        card.className = 'modal-card' + (cardClass ? ' ' + cardClass : '');
        card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.tabIndex = -1;
        card.innerHTML = cardHtml;
        m.appendChild(card);
        document.body.appendChild(m);
        let release;
        const close = () => { if (release) release(); m.remove(); };
        release = RBFocusTrap(card, () => { close(); if (onDismiss) onDismiss(); });
        m.addEventListener('click', (e) => { if (e.target === m) { close(); if (onDismiss) onDismiss(); } });
        return { el: m, q: (s) => m.querySelector(s), close };
    };
    // HTML-escape for safe interpolation into innerHTML.
    window.RBesc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    // Shared roadbook one-liner subtitle: "12.3 km · 45 notes" (translated unit word).
    window.RBSummary = (distanceM, noteCount) => (distanceM / 1000).toFixed(1) + ' km · ' + noteCount + ' ' + RBt('notes');
    // The signed-in user's saved roadbooks rendered into `container` — shared by My roadbooks
    // and the Editor landing. Loads rb_list, draws one .roadbook-row each (View/Edit/Duplicate/
    // Delete), wires duplicate+delete (re-rendering after each). Returns the count (0 = none).
    // Relative links work from any one-level-deep tool page (/editor/, /myroadbooks/).
    window.RBRoadbookList = async (container) => {
        if (!container) return 0;
        const fmtDate = (s) => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? '' : d.toLocaleDateString(); };
        const r = await RBApi('rb_list');
        const all = (r.ok && r.roadbooks) || [];
        if (!all.length) { container.innerHTML = `<p class="muted small">${RBesc(RBt('No roadbooks yet. Create one in the Editor.'))}</p>`; return 0; }
        const PER = 12;
        let page = 1, q = '';
        // Search box only once the list is long enough to need it; the pager appears only past one page.
        container.innerHTML =
            (all.length > 5 ? `<div class="rb-toolbar"><i class="fa-solid fa-magnifying-glass"></i><input type="search" class="field rb-search" placeholder="${RBesc(RBt('Search roadbooks…'))}" autocomplete="off" spellcheck="false"></div>` : '') +
            `<div class="rb-rows"></div><div class="rb-pager"></div>`;
        const rowsEl = container.querySelector('.rb-rows'), pagerEl = container.querySelector('.rb-pager');
        const rowHtml = (rb) => `<div class="roadbook-row">
            <div class="meta"><b>${RBesc(rb.title)}</b><small>${RBSummary(rb.total_distance, rb.note_count)} · <i class="fa-solid fa-clock-rotate-left"></i> ${fmtDate(rb.updated_at)}</small></div>
            <span class="rb-badge ${rb.is_public ? 'public' : 'private'}"><i class="fa-solid fa-${rb.is_public ? 'globe' : 'lock'}"></i> ${RBesc(RBt(rb.is_public ? 'Public' : 'Private'))}</span>
            <a class="btn btn-ghost" href="../reader/?rb=${rb.id}" title="${RBesc(RBt('Read'))}" aria-label="${RBesc(RBt('Read'))}"><i class="fa-solid fa-book-open"></i></a>
            <a class="btn btn-ghost" href="../challenge/${rb.slug || ''}" title="${RBesc(RBt('View'))}" aria-label="${RBesc(RBt('View'))}"><i class="fa-solid fa-eye"></i></a>
            <a class="btn btn-ghost" href="../editor/?rb=${rb.id}" title="${RBesc(RBt('Edit'))}" aria-label="${RBesc(RBt('Edit'))}"><i class="fa-solid fa-pen"></i></a>
            <a class="btn btn-ghost" href="../editor/?rb=${rb.id}&export=1" title="${RBesc(RBt('Export'))}" aria-label="${RBesc(RBt('Export'))}"><i class="fa-solid fa-file-export"></i></a>
            <button class="btn btn-ghost" data-dup="${rb.id}" title="${RBesc(RBt('Save as'))}" aria-label="${RBesc(RBt('Save as'))}"><i class="fa-solid fa-clone"></i></button>
            <button class="btn btn-ghost" data-del="${rb.id}" data-title="${RBesc(rb.title)}" title="${RBesc(RBt('Delete'))}" aria-label="${RBesc(RBt('Delete'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button>
        </div>`;
        const wireRows = () => {
            rowsEl.querySelectorAll('[data-dup]').forEach((b) => b.onclick = async () => {
                const x = await RBApi('rb_duplicate', { id: +b.dataset.dup });
                if (x.ok) { RBToast('Roadbook duplicated.'); RBRoadbookList(container); } else RBToast(x.error || 'Could not duplicate.');
            });
            rowsEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
                if (await RBConfirmDanger(RBt('Delete roadbook') + ' “' + (b.dataset.title || '') + '”?', 'Delete')) { await RBApi('rb_delete', { id: +b.dataset.del }); RBRoadbookList(container); }
            });
        };
        const render = () => {
            const filtered = (window.RB && RB.filterRoadbooks) ? RB.filterRoadbooks(all, q) : all;
            const pages = Math.max(1, Math.ceil(filtered.length / PER));
            if (page > pages) page = pages;
            const slice = filtered.slice((page - 1) * PER, page * PER);
            rowsEl.innerHTML = slice.length ? slice.map(rowHtml).join('') : `<p class="muted small">${RBesc(RBt('No matching roadbooks.'))}</p>`;
            pagerEl.innerHTML = pages > 1
                ? `<button class="btn btn-ghost rb-prev"${page <= 1 ? ' disabled' : ''} aria-label="${RBesc(RBt('Previous'))}"><i class="fa-solid fa-chevron-left"></i></button><span class="muted small">${page} / ${pages}</span><button class="btn btn-ghost rb-next"${page >= pages ? ' disabled' : ''} aria-label="${RBesc(RBt('Next'))}"><i class="fa-solid fa-chevron-right"></i></button>`
                : '';
            wireRows();
            const prev = pagerEl.querySelector('.rb-prev'), next = pagerEl.querySelector('.rb-next');
            if (prev) prev.onclick = () => { if (page > 1) { page--; render(); } };
            if (next) next.onclick = () => { if (page < pages) { page++; render(); } };
        };
        const search = container.querySelector('.rb-search');
        if (search) search.oninput = () => { q = search.value; page = 1; render(); };
        render();
        return all.length;
    };
    // Translated toast (every tool page ships an empty #toast element).
    let toastTimer = null;
    window.RBToast = (msg) => {
        const el = document.getElementById('toast'); if (!el) return;
        el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); // announce to screen readers
        el.textContent = RBt(msg); el.hidden = false;
        clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
    };
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
    const rbCaptureToken = (action, json) => {
        if (isNativeApp()) try {
            if (json && json.token) localStorage.setItem(RB_TOKEN_KEY, json.token);
            else if (action === 'logout') localStorage.removeItem(RB_TOKEN_KEY);
        } catch (e) {}
        return json;
    };
    // JSON POST to the API → the parsed response ({ ok: false, … } on network failure).
    window.RBApi = (action, body) => fetch(ROOT + 'api/index.php', {
        method: 'POST', credentials: 'same-origin', headers: rbAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(Object.assign({ action }, body || {})),
    }).then((r) => r.json()).then((j) => rbCaptureToken(action, j)).catch(() => ({ ok: false, error: 'Network error.' }));
    // Trigger a download from a Blob or a URL.
    window.RBDownload = (data, filename) => {
        const url = (typeof data === 'string') ? data : URL.createObjectURL(data);
        const a = document.createElement('a'); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
    };
    // Upload one image (downscaled first) to upload.php. `fields` = extra form fields.
    // POST a multipart upload to upload.php. Photos go through the image downscale; voice
    // notes upload the recorded blob as-is.
    const rbPostUpload = async (fields, fieldName, blob, name) => {
        const fd = new FormData();
        for (const k in fields) fd.append(k, fields[k]);
        fd.append(fieldName, blob, name);
        try { return await (await fetch(ROOT + 'api/upload.php', { method: 'POST', credentials: 'same-origin', headers: rbAuthHeaders({}), body: fd })).json(); }
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
                <a class="btn btn-primary" href="${ROOT}account/"><i class="fa-solid fa-right-to-bracket"></i> ${RBt('Sign in / Create account')}</a>
            </div>`, 'narrow center');
        d.q('[data-no]').onclick = d.close;
    };

    /* ---------------- Account control in the header ---------------- */
    (async function accountControl() {
        const user = (await RBApi('config')).user || null;
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
                w.innerHTML = `<a class="nav-link account-login" href="${ROOT}account/" title="Sign in / Create account"><i class="fa-solid fa-circle-user"></i></a>`;
            } else {
                w.innerHTML = `<button class="nav-link account-button"><i class="fa-solid fa-circle-user"></i> <span>${RBesc(user.username || '')}</span></button>
                    <div class="account-menu" hidden>
                        <a href="${ROOT}myroadbooks/"><i class="fa-solid fa-book"></i> ${RBt('My roadbooks')}</a>
                        <a href="${ROOT}account/"><i class="fa-solid fa-user"></i> ${RBt('My profile')}</a>
                        ${user.is_admin ? `<a href="${ROOT}admin/"><i class="fa-solid fa-users-gear"></i> ${RBt('Admin')}</a>` : ''}
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
                if (!(await RBConfirmDanger(RBt('Discard') + ' “' + RBt(PENDING_LABEL[it.tool]) + ' · ' + pendingDetail(it) + '”?', 'Discard'))) return;
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
       notice, not a consent wall; the choice is remembered so it shows once. */
    const COOKIE_OK_KEY = 'rb_cookie_ok';
    function cookieNotice() {
        let seen = false; try { seen = localStorage.getItem(COOKIE_OK_KEY) === '1'; } catch (e) {}
        if (seen || document.querySelector('.cookie-notice')) return;
        const el = document.createElement('div');
        el.className = 'cookie-notice'; el.setAttribute('role', 'note');
        el.innerHTML = `<span class="cookie-text">${RBt('RDBK uses only essential cookies (to keep you signed in) and local storage for your preferences and offline data — no ads, no tracking, no profiling.')} <a href="${ROOT}privacy/">${RBt('Privacy')}</a></span>
            <button class="btn btn-primary cookie-ok" type="button">${RBt('Got it')}</button>`;
        document.body.appendChild(el);
        el.querySelector('.cookie-ok').onclick = () => { try { localStorage.setItem(COOKIE_OK_KEY, '1'); } catch (e) {} el.remove(); };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cookieNotice); else cookieNotice();
})();
