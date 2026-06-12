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

    /* ---------------- Global header + footer (same on every page) ---------------- */
    function renderChrome() {
        const rootPath = new URL(ROOT, location.href).pathname;
        const rel = location.pathname.slice(rootPath.length).replace(/^\/+/, '');
        const active = (p) => rel.indexOf(p) === 0 ? ' active' : '';
        let header = document.querySelector('header.topbar') || document.querySelector('header');
        if (!header) { header = document.createElement('header'); document.body.prepend(header); }
        header.className = 'topbar';
        header.innerHTML = `<div class="wrap">
            <a class="brand" href="${ROOT}"><img class="brand-logo" src="${ROOT}assets/logo.png" alt=""> RDBK.app</a>
            <button class="navtoggle" id="navToggle" aria-label="Menu" aria-expanded="false"><i class="fa-solid fa-bars"></i></button>
            <nav class="topnav" id="topnav">
                <a class="nav-link${active('editor')}" href="${ROOT}editor/">Editor</a>
                <a class="nav-link${active('reader')}" href="${ROOT}reader/">Reader</a>
                <a class="nav-link${active('tripmaster')}" href="${ROOT}tripmaster/">Tripmaster</a>
                <a class="nav-link${active('ranking')}" href="${ROOT}ranking/">Ranking</a>
            </nav>
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
            <div class="lang" role="group" aria-label="Language"><button data-lang="en">EN</button><button data-lang="es">ES</button><button data-lang="it">IT</button></div>
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
    };

    /* ---------------- Shared UI primitives (the one home for these) ----------------
       Every page reuses these instead of re-implementing them — see CLAUDE.md. */
    // Overlay modal. Pass the card's inner HTML (+ optional card style + backdrop-dismiss
    // callback). Returns { el, q(sel), close }.
    window.RBModal = (cardHtml, cardClass, onDismiss) => {
        const m = document.createElement('div'); m.className = 'modal';
        m.innerHTML = `<div class="modal-card${cardClass ? ' ' + cardClass : ''}">${cardHtml}</div>`;
        document.body.appendChild(m);
        const close = () => m.remove();
        m.addEventListener('click', (e) => { if (e.target === m) { close(); if (onDismiss) onDismiss(); } });
        return { el: m, q: (s) => m.querySelector(s), close };
    };
    // HTML-escape for safe interpolation into innerHTML.
    window.RBesc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    // Translated toast (every tool page ships an empty #toast element).
    let toastTimer = null;
    window.RBToast = (msg) => {
        const el = document.getElementById('toast'); if (!el) return;
        el.textContent = RBt(msg); el.hidden = false;
        clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
    };
    // JSON POST to the API → the parsed response ({ ok: false, … } on network failure).
    window.RBApi = (action, body) => fetch(ROOT + 'api/index.php', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ action }, body || {})),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Network error.' }));
    // Trigger a download from a Blob or a URL.
    window.RBDownload = (data, filename) => {
        const url = (typeof data === 'string') ? data : URL.createObjectURL(data);
        const a = document.createElement('a'); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
    };
    // Upload one image (downscaled first) to upload.php. `fields` = extra form fields.
    window.RBUpload = async (fields, file, name) => {
        const fd = new FormData();
        for (const k in fields) fd.append(k, fields[k]);
        fd.append('photo', await RBImg.toBlob(file), name || 'photo.jpg');
        try { return await (await fetch(ROOT + 'api/upload.php', { method: 'POST', credentials: 'same-origin', body: fd })).json(); }
        catch (e) { return { ok: false, error: 'Upload failed.' }; }
    };

    /* ---------------- Styled confirm + auth prompt (built on RBModal) ---------------- */
    // msg and okLabel run through RBt: plain English keys translate, already-
    // translated or composed strings fall through unchanged.
    window.RBConfirm = (msg, okLabel) => new Promise((resolve) => {
        const d = RBModal(`<p class="modal-text">${RBt(msg)}</p>
            <div class="btnrow end">
                <button class="btn btn-ghost" data-no>${RBt('Cancel')}</button>
                <button class="btn btn-primary" data-yes>${RBt(okLabel || 'OK')}</button>
            </div>`, 'narrow', () => resolve(false));
        const done = (v) => { d.close(); resolve(v); };
        d.q('[data-yes]').onclick = () => done(true);
        d.q('[data-no]').onclick = () => done(false);
    });
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
        const place = () => {
            const slot = document.querySelector('header .topnav') || document.querySelector('header .wrap');
            if (!slot || slot.querySelector('.account-control')) return;
            const w = document.createElement('div'); w.className = 'account-control';
            if (!user) {
                w.innerHTML = `<a class="nav-link account-login" href="${ROOT}account/" title="Sign in / Create account"><i class="fa-solid fa-circle-user"></i></a>`;
            } else {
                w.innerHTML = `<button class="nav-link account-button"><i class="fa-solid fa-circle-user"></i> <span>${RBesc(user.username || '')}</span></button>
                    <div class="account-menu" hidden>
                        <a href="${ROOT}account/"><i class="fa-solid fa-user"></i> ${RBt('My account')}</a>
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
})();
