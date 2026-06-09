/* Shell común de la app (portada y herramientas). La raíz se deduce de la URL
   de este script, así funciona igual en /roadbook/ y en sus subcarpetas.
   - Service Worker (network-first) con auto-recarga al actualizar.
   - Sistema de versión: si version.json cambia, refresca TODO (SW + cachés + app),
     sea PWA o navegador.
   - Botón Instalar en la cabecera (oculto si ya está instalada). En iPhone abre
     un modal con las instrucciones de Safari. */
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
                <a class="btn btn-ghost${active('editor')}" href="${ROOT}editor/"><i class="fa-solid fa-map-location-dot"></i> Editor</a>
                <a class="btn btn-ghost${active('reader')}" href="${ROOT}reader/"><i class="fa-solid fa-compass"></i> Reader</a>
                <a class="btn btn-ghost${active('ranking')}" href="${ROOT}ranking/"><i class="fa-solid fa-ranking-star"></i> Ranking</a>
            </nav>
        </div>`;
        const t = header.querySelector('#navToggle'), nav = header.querySelector('#topnav');
        const close = () => { nav.classList.remove('open'); t.setAttribute('aria-expanded', 'false'); };
        t.addEventListener('click', (e) => { e.stopPropagation(); const o = nav.classList.toggle('open'); t.setAttribute('aria-expanded', o ? 'true' : 'false'); });
        document.addEventListener('click', (e) => { if (!nav.contains(e.target) && e.target !== t) close(); });
        nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));

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
        if (!window.RBi18n) { const l = footer.querySelector('.lang'); if (l) l.style.display = 'none'; }
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

    /* ---------------- Sistema de versión ---------------- */
    let appVer = null, refreshing = false, pendingRefresh = false;
    async function checkVersion() {
        // Never reload in the middle of an active session (e.g. a competition run
        // in the Reader): defer until it's free. window.RB_BUSY is set by the tool.
        if (pendingRefresh && !window.RB_BUSY && !refreshing) { refreshing = true; return hardRefresh(); }
        try {
            const v = (await (await fetch(ROOT + 'version.json', { cache: 'no-store' })).json()).version;
            if (!v) return;
            const el = document.getElementById('appVersion'); if (el) el.textContent = 'v' + v;
            if (appVer == null) { appVer = v; return; }      // primera lectura: fija la referencia
            if (v !== appVer && !refreshing) {
                appVer = v;
                if (window.RB_BUSY) pendingRefresh = true;   // wait for the session to end
                else { refreshing = true; await hardRefresh(); }
            }
        } catch (e) { /* offline: reintenta luego */ }
    }
    async function hardRefresh() {
        try { if (swReg) await swReg.update(); } catch (e) {}
        try { if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k))); } catch (e) {}
        location.reload();
    }
    checkVersion();
    setInterval(checkVersion, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });

    /* ---------------- Instalar (PWA) + iOS ---------------- */
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
        installBtn.className = 'btn btn-ghost install-btn';
        installBtn.innerHTML = '<i class="fa-solid fa-circle-down"></i> <span>Install</span>';
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
    // iOS Safari no emite beforeinstallprompt: si no está instalada, ofrece el botón.
    if (isIOS() && !isStandalone()) document.addEventListener('DOMContentLoaded', showInstall);

    function showIosModal() {
        let m = document.getElementById('iosModal');
        if (!m) {
            m = document.createElement('div');
            m.id = 'iosModal'; m.className = 'modal';
            m.innerHTML = `<div class="modal-card">
                <h2 style="margin-top:0"><i class="fa-solid fa-mobile-screen" style="color:var(--sand)"></i> Install on iPhone</h2>
                <p class="muted small">From Safari, in 3 steps:</p>
                <ol style="line-height:1.9;padding-left:1.2rem;margin:.4rem 0">
                    <li>Tap <b>Share</b> <i class="fa-solid fa-arrow-up-from-bracket" style="color:var(--sand)"></i> in the bar.</li>
                    <li>Choose <b>Add to Home Screen</b> <i class="fa-solid fa-square-plus" style="color:var(--sand)"></i>.</li>
                    <li>Tap <b>Add</b>. Done!</li>
                </ol>
                <div class="btnrow" style="margin-top:.8rem"><button class="btn btn-primary" id="iosClose">Got it</button></div>
            </div>`;
            document.body.appendChild(m);
            m.querySelector('#iosClose').onclick = () => { m.hidden = true; };
            m.addEventListener('click', (e) => { if (e.target === m) m.hidden = true; });
        }
        m.hidden = false;
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

    /* ---------------- Styled confirm (no native dialogs) ---------------- */
    window.RBConfirm = (msg, okLabel) => new Promise((resolve) => {
        const m = document.createElement('div'); m.className = 'modal';
        m.innerHTML = `<div class="modal-card" style="max-width:360px">
            <p style="margin:.2rem 0 1.1rem;font-size:1.05rem">${msg}</p>
            <div class="btnrow" style="justify-content:flex-end">
                <button class="btn btn-ghost" data-no>Cancel</button>
                <button class="btn btn-primary" data-yes>${okLabel || 'OK'}</button>
            </div></div>`;
        document.body.appendChild(m);
        const done = (v) => { m.remove(); resolve(v); };
        m.querySelector('[data-yes]').onclick = () => done(true);
        m.querySelector('[data-no]').onclick = () => done(false);
        m.addEventListener('click', (e) => { if (e.target === m) done(false); });
    });

    /* ---------------- Auth prompt (DRY) ---------------- */
    window.RBNeedAuth = (msg) => {
        const m = document.createElement('div'); m.className = 'modal';
        m.innerHTML = `<div class="modal-card" style="max-width:380px;text-align:center">
            <h2 style="margin-top:0"><i class="fa-solid fa-circle-user" style="color:var(--sand)"></i> Sign in</h2>
            <p class="muted">${msg || 'Create a free account to save and share your roadbooks.'}</p>
            <div class="btnrow" style="justify-content:center;margin-top:1rem">
                <button class="btn btn-ghost" data-no>Not now</button>
                <a class="btn btn-primary" href="${ROOT}account/"><i class="fa-solid fa-right-to-bracket"></i> Sign in / Create account</a>
            </div></div>`;
        document.body.appendChild(m);
        m.querySelector('[data-no]').onclick = () => m.remove();
        m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    };

    /* ---------------- Account control in the header ---------------- */
    (async function accountControl() {
        let user = null;
        try { user = (await (await fetch(ROOT + 'api/index.php?action=config', { credentials: 'same-origin' })).json()).user; } catch (e) {}
        const place = () => {
            const slot = document.querySelector('header .topnav') || document.querySelector('header .wrap');
            if (!slot || slot.querySelector('.acct-ctl')) return;
            const w = document.createElement('div'); w.className = 'acct-ctl';
            if (!user) {
                w.innerHTML = `<a class="btn btn-ghost acct-login" href="${ROOT}account/" title="Sign in / Create account"><i class="fa-solid fa-circle-user"></i></a>`;
            } else {
                w.innerHTML = `<button class="btn btn-ghost acct-btn"><i class="fa-solid fa-circle-user"></i> <span>${(user.username || '').replace(/[<>&]/g, '')}</span></button>
                    <div class="acct-menu" hidden>
                        <a href="${ROOT}account/"><i class="fa-solid fa-user"></i> My account</a>
                        <button id="acctLogout"><i class="fa-solid fa-right-from-bracket"></i> Sign out</button>
                    </div>`;
            }
            slot.appendChild(w);
            if (user) {
                const btn = w.querySelector('.acct-btn'), menu = w.querySelector('.acct-menu');
                btn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
                document.addEventListener('click', () => { menu.hidden = true; });
                w.querySelector('#acctLogout').onclick = async () => {
                    await fetch(ROOT + 'api/index.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
                    location.reload();
                };
            }
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place); else place();
    })();
})();
