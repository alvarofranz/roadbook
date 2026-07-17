'use strict';
/* Account: register / verify / sign-in / forgot / reset and the user's profile
 * (avatar + bio). The saved roadbooks live on their own page (myroadbooks/).
 * Talks to /api (same-origin, session cookie). Cloudflare Turnstile is rendered
 * when a site key is configured server-side. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc; // shared helpers (app.js / i18n.js)
    const params = new URLSearchParams(location.search);
    let tsSite = '', tsTokens = {};
    let me = null; // the signed-in user (held so the change-password handler knows the credential id)

    const api = RBApi; // shared helper (app.js)
    const IS_APP = document.documentElement.classList.contains('native'); // Capacitor shell (set before paint)
    const msg = (text, ok) => { const m = $('auth-message'); if (!text) { m.hidden = true; return; } m.textContent = RBt(text); m.className = 'auth-message ' + (ok ? 'ok' : 'err'); m.hidden = false; };
    const show = (id) => ['vLogin', 'vRegister', 'vForgot', 'vReset', 'vForce', 'vAccount'].forEach((v) => $(v).hidden = v !== id);

    /* ---------- Turnstile ---------- */
    window.__tsReady = function renderTurnstile() {
        if (!tsSite || !window.turnstile) return;
        document.querySelectorAll('.turnstile[data-ts]').forEach((el) => {
            if (el.dataset.rendered) return; el.dataset.rendered = '1';
            const name = el.dataset.ts;
            window.turnstile.render(el, { sitekey: tsSite, theme: 'dark', callback: (t) => { tsTokens[name] = t; } });
        });
    };
    function loadTurnstile() {
        if (!tsSite) return;
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__tsReady';
        s.async = true; document.head.appendChild(s);
    }
    function resetTs(name) { tsTokens[name] = null; if (window.turnstile) document.querySelectorAll(`.turnstile[data-ts="${name}"]`).forEach((el) => window.turnstile.reset(el)); }

    /* ---------- Google Sign-In ---------- */
    let gClientId = '', googleCred = null;
    // Google's four-colour "G" (no white circle) so our OWN dark button matches the site theme.
    const GOOGLE_G = '<svg class="gicon" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
    const gButton = () => `<button type="button" class="btn btn-ghost gbtn-btn">${GOOGLE_G}<span>${t('Continue with Google')}</span></button>`;
    // `reg.acceptTerms` is a namespaced key whose English text lives inline in the HTML (not in T.en),
    // so RBt returns the key itself for English — fall back to the English literal in that one case.
    const termsLabel = () => { const tr = t('reg.acceptTerms'); return tr === 'reg.acceptTerms' ? 'I have read and accept the <a href="/terms/" target="_blank" rel="noopener">Terms of Use</a>' : tr; };

    function loadGoogle(clientId) {
        gClientId = clientId || '';
        if (!gClientId) return;
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
        s.onload = renderGoogle; document.head.appendChild(s);
    }
    // Web: our own dark button (matches the theme) with Google's real button rendered INVISIBLY on
    // top of it, so a click reliably triggers the official ID-token flow without the white-box GIS look.
    function renderGoogle() {
        if (!gClientId || !window.google || !google.accounts || !google.accounts.id) return;
        google.accounts.id.initialize({ client_id: gClientId, callback: (resp) => onGoogle(resp && resp.credential) });
        const el = $('gBtn'); if (!el) return;
        el.className = 'gbtn-wrap';
        el.innerHTML = `${gButton()}<div class="gis-overlay"></div>`;
        google.accounts.id.renderButton(el.querySelector('.gis-overlay'), { type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: 280 });
        // If the invisible GIS iframe never rendered (blocked frame/script), taps fall through to
        // the wrap — trigger Google's One Tap prompt so pressing the button always reacts (#250).
        el.onclick = () => { if (!el.querySelector('.gis-overlay iframe')) { try { google.accounts.id.prompt(); } catch (e) {} } };
    }
    // App: a real dark button that opens the native OS Google picker (RBNative), then the SAME flow.
    function renderNativeGoogle() {
        const el = $('gBtn'); if (!el) return;
        el.className = ''; el.innerHTML = gButton();
        el.querySelector('button').onclick = async () => {
            try {
                const native = await RBNativeReady(); // the bridge script loads async (#250)
                if (!native || !native.googleSignIn) throw new Error('native bridge unavailable');
                const idToken = await native.googleSignIn(); if (idToken) onGoogle(idToken);      // null = cancelled
            } catch (e) {
                if (/cancel/i.test((e && e.message) || '')) return; // closing the OS picker is a choice, not an error
                // Always show the underlying reason — a generic message made native sign-in
                // failures (plugin config, Play Services…) undiagnosable in the field.
                msg(t('Google sign-in failed. Please try again.') + ((e && e.message) ? ' (' + e.message + ')' : ''), false);
            }
        };
    }
    // Feedback while the ID token is verified server-side; restoreGoogle() puts the button back on a
    // terminal failure (on success the page navigates away, so no restore is needed).
    function googleBusy() { const el = $('gBtn'); if (el) { el.className = ''; el.innerHTML = `<div class="gbtn-loading"><span class="spinner"></span> ${t('Signing you in…')}</div>`; } }
    function restoreGoogle() { IS_APP ? renderNativeGoogle() : renderGoogle(); }

    // After Google consent: probe the server (who is this? does the account exist?) WITHOUT signing in,
    // then show a clear "Sign in / Create account as <email>" confirmation.
    async function onGoogle(cred) {
        if (!cred) return;
        googleCred = cred; googleBusy();
        const p = await api('google_auth', { credential: cred });          // probe (no confirm)
        if (p && p.probe) return showGoogleConfirm(p.email, !!p.exists);
        restoreGoogle(); msg((p && p.error) || 'Google sign-in failed. Please try again.', false);
    }
    // The confirmation panel: the detected email, the Terms (new accounts only) and the final CTA.
    function showGoogleConfirm(email, exists) {
        const el = $('gBtn'); if (!el) return;
        el.className = 'gconfirm';
        el.innerHTML =
            `<p class="gconfirm-as">${t('Continue as')} <b>${RBesc(email)}</b></p>`
            + (exists ? '' : `<label class="checkbox-row gconfirm-terms"><input type="checkbox" id="gConfirmTerms"> <span>${termsLabel()}</span></label>`)
            + `<button type="button" class="btn btn-primary gconfirm-go">${exists ? t('Sign in') : t('Create account')}</button>`
            + `<button type="button" class="gconfirm-other">${t('Use a different account')}</button>`;
        el.querySelector('.gconfirm-go').onclick = () => {
            if (!exists && !el.querySelector('#gConfirmTerms').checked) return msg('You must accept the Terms of Use to register.', false);
            googleBusy(); confirmGoogle(exists);
        };
        el.querySelector('.gconfirm-other').onclick = () => { googleCred = null; msg(''); restoreGoogle(); };
    }
    // Confirm: create the account (new, Terms accepted) or sign in (existing), then land in the profile.
    async function confirmGoogle(exists) {
        const r = await api('google_auth', { credential: googleCred, confirm: true, accept_terms: !exists });
        if (r.ok) { me = r.user; return finishLogin(me); }
        restoreGoogle(); msg(r.error || 'Google sign-in failed. Please try again.', false);
    }
    // Shared post-sign-in step (classic login + Google): force a password change if flagged, else
    // return to ?next= (safe same-origin path only) or show the profile.
    function finishLogin(user) {
        if (user.must_change_password) return showForce();
        const next = new URLSearchParams(location.search).get('next');
        if (next && next.charAt(0) === '/' && next.charAt(1) !== '/') { location.href = next; return; }
        showAccount(user);
    }

    /* Submit on Enter / button: run the handler, never reload the page. */
    function onSubmit(formId, handler) { $(formId).addEventListener('submit', (e) => { e.preventDefault(); handler(); }); }

    /* Our forms post by fetch (no navigation), so the browser never sees a credential
     * submission and won't offer to save/update the password. The Credential Management
     * API is the explicit trigger: after a successful login or change we hand the
     * credential to the password manager, which then prompts. Needs HTTPS + a Chromium
     * browser; a silent no-op elsewhere. (#78) */
    async function storeCredential(id, password) {
        if (!window.PasswordCredential || !id || !password) return;
        try { await navigator.credentials.store(new PasswordCredential({ id: String(id), password })); } catch (e) {}
    }

    /* Too many login attempts (server 429 with retry_after secs): toast + a live countdown on
     * the Sign in button, disabled until the window clears. */
    let rlTimer = null;
    function rateLimited(seconds) {
        RBToast('Too many attempts. Please wait a moment.');
        const btn = $('loginBtn'); if (!btn) return;
        if (rlTimer) clearInterval(rlTimer);
        let left = Math.max(1, Math.ceil(seconds));
        btn.disabled = true;
        const render = () => { const m = Math.floor(left / 60), s = left % 60; btn.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> ${t('Try again in')} ${m}:${String(s).padStart(2, '0')}`; };
        render();
        rlTimer = setInterval(() => {
            if (--left <= 0) { clearInterval(rlTimer); rlTimer = null; btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> ${t('Sign in')}`; }
            else render();
        }, 1000);
    }

    /* Show/hide eye toggle for every password field. */
    function wirePasswordToggles() {
        document.querySelectorAll('input[type="password"]').forEach((input) => {
            const wrap = document.createElement('div');
            wrap.className = 'pass-wrap';
            input.parentNode.insertBefore(wrap, input);
            wrap.appendChild(input);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pass-toggle';
            btn.setAttribute('aria-label', t('Show password'));
            btn.innerHTML = '<i class="fa-solid fa-eye"></i>';
            btn.onclick = () => {
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                btn.setAttribute('aria-label', t(show ? 'Hide password' : 'Show password'));
                btn.innerHTML = `<i class="fa-solid fa-eye${show ? '-slash' : ''}"></i>`;
            };
            wrap.appendChild(btn);
        });
    }

    /* ---------- routes ---------- */
    async function init() {
        const cfg = await api('config');
        // Turnstile is a domain-locked Cloudflare widget: it can't run in the app's WebView
        // (origin localhost, not rdbk.app), so never load it there. The backend exempts the
        // trusted app origins from the challenge to match (see verify_turnstile).
        tsSite = IS_APP ? '' : (cfg.turnstile || '');
        loadTurnstile();
        // In the Capacitor app the web GIS button can't run (Google blocks OAuth in a WebView), so
        // ALWAYS use the native OS picker there. Decided by the shell class — set synchronously at
        // startup — never by whether the async RBNative bridge finished loading: racing on it could
        // render the web button inside the app, where pressing it does nothing (#250).
        if (IS_APP) renderNativeGoogle();
        else loadGoogle(cfg.google_client || '');

        if (params.get('verify')) {
            const r = await api('verify', { token: params.get('verify') });
            msg(r.message || r.error, !!r.ok); history.replaceState(null, '', location.pathname); show('vLogin'); return;
        }
        if (params.get('reset')) {
            show('vReset');
            onSubmit('resetForm', async () => {
                if ($('resetPass').value !== $('resetPass2').value) return msg("Passwords don't match.", false);
                const r = await api('reset', { token: params.get('reset'), password: $('resetPass').value });
                msg(r.message || r.error, !!r.ok); if (r.ok) { history.replaceState(null, '', location.pathname); show('vLogin'); }
            });
            return;
        }
        if (params.get('verifyemail')) {
            const r = await api('verify_email_change', { token: params.get('verifyemail') });
            history.replaceState(null, '', location.pathname);
            const c = await api('config'); // email may have changed → re-read the user
            if (c.user) { showAccount(c.user); RBToast(r.message || r.error); } else { show('vLogin'); msg(r.message || r.error, !!r.ok); }
            return;
        }
        if (cfg.user) { me = cfg.user; return me.must_change_password ? showForce() : showAccount(me); }
        show('vLogin');
    }

    // Admin gave a temporary password → force a new one before the profile is reachable.
    function showForce() { show('vForce'); msg(''); }

    $('toRegister').onclick = (e) => { e.preventDefault(); msg(''); show('vRegister'); };
    $('toLogin').onclick = (e) => { e.preventDefault(); msg(''); show('vLogin'); };
    $('toLogin2').onclick = (e) => { e.preventDefault(); msg(''); show('vLogin'); };
    $('toForgot').onclick = (e) => { e.preventDefault(); msg(''); show('vForgot'); };

    onSubmit('loginForm', async () => {
        const pass = $('loginPass').value;
        const r = await api('login', { email: $('loginId').value, password: pass, turnstile: tsTokens.login });
        if (r.ok) { me = r.user; await storeCredential(me.email, pass); finishLogin(me); }
        else if (r.retry_after) rateLimited(r.retry_after); // too many attempts → popup + countdown
        else { msg(r.error, false); resetTs('login'); }
    });
    // Forced password change: no current password (the admin set a temporary one); then reload into the profile.
    onSubmit('forceForm', async () => {
        if ($('forcePass').value !== $('forcePass2').value) return msg("Passwords don't match.", false);
        const r = await api('change_password', { new: $('forcePass').value });
        if (r.ok) { await storeCredential(me && me.email, $('forcePass').value); const c = await api('config'); showAccount(c.user); } else msg(r.error, false);
    });
    onSubmit('registerForm', async () => {
        if ($('regPass').value !== $('regPass2').value) return msg("Passwords don't match.", false);
        if (!$('regTerms').checked) return msg('You must accept the Terms of Use to register.', false);
        const r = await api('register', { first_name: $('regFirst').value, last_name: $('regLast').value, username: $('regUser').value, email: $('regEmail').value, password: $('regPass').value, password_confirm: $('regPass2').value, accept_terms: true, turnstile: tsTokens.register });
        msg(r.message || r.error, !!r.ok); if (r.ok) show('vLogin'); else resetTs('register');
    });
    onSubmit('forgotForm', async () => {
        const r = await api('forgot', { email: $('forgotEmail').value, turnstile: tsTokens.forgot });
        msg(r.message || r.error, !!r.ok); resetTs('forgot');
    });
    // change password (signed in) + delete account — bound once; the forms live in #vAccount
    onSubmit('pwForm', async () => {
        if ($('pwNew').value !== $('pwNew2').value) return RBToast("Passwords don't match.");
        const r = await api('change_password', { current: $('pwCurrent').value, new: $('pwNew').value });
        RBToast(r.message || r.error); // toast: visible even when scrolled down in the profile
        if (r.ok) {
            await storeCredential(me && me.email, $('pwNew').value);
            $('pwCurrent').value = ''; $('pwNew').value = ''; $('pwNew2').value = '';
            if (me && !me.has_password) { me.has_password = 1; showAccount(me); } // first password set (#211) → the card becomes "Change password"
        }
    });
    // change email (signed in): re-verifies the new address — see change_email() server-side
    onSubmit('emailForm', async () => {
        if ($('emNew').value.trim().toLowerCase() !== $('emNew2').value.trim().toLowerCase()) return RBToast("Emails don't match.");
        const r = await api('change_email', { email: $('emNew').value });
        RBToast(r.message || r.error);
        if (r.ok) { $('emNew').value = ''; $('emNew2').value = ''; }
    });
    async function buildTakeout() {
        RBToast(t('Building your data export…'));
        const profile = me ? { username: me.username, email: me.email, first_name: me.first_name, last_name: me.last_name, created_at: me.created_at } : {};
        const list = await api('rb_list');
        if (!list.ok || !list.roadbooks) { RBToast(t('Could not load your roadbooks.')); return; }
        const outerFiles = { 'profile.json': JSON.stringify(profile, null, 2) };
        for (const rbMeta of list.roadbooks) {
            const r = await api('rb_get', { id: rbMeta.id });
            if (!r.ok || !r.roadbook) continue;
            const rb = r.roadbook;
            if (!rb.meta) rb.meta = {}; if (!rb.meta.title) rb.meta.title = rbMeta.title;
            const innerFiles = { 'roadbook.json': JSON.stringify(RB.roadbookForExport(rb)) };
            const media = { photos: [], audio: [] };
            const ph = await api('ph_list', { roadbook: rbMeta.id });
            if (ph.ok && ph.photos) {
                for (const p of ph.photos) {
                    try { const res = await fetch(p.url); if (!res.ok) continue; const name = 'photos/' + p.url.split('/').pop(); innerFiles[name] = new Uint8Array(await res.arrayBuffer()); media.photos.push({ file: name, lat: p.lat, lon: p.lon }); } catch (e) {}
                }
            }
            const au = await api('audio_list', { roadbook: rbMeta.id });
            if (au.ok && au.audio) {
                for (const a of au.audio) {
                    try { const res = await fetch(a.url); if (!res.ok) continue; const name = 'audio/' + a.url.split('/').pop(); innerFiles[name] = new Uint8Array(await res.arrayBuffer()); media.audio.push({ file: name, lat: a.lat, lon: a.lon }); } catch (e) {}
                }
            }
            if (media.photos.length || media.audio.length) innerFiles['media.json'] = JSON.stringify(media);
            const slug = (RB.slug(rb.meta.title) || 'roadbook') + '_' + rbMeta.id;
            outerFiles[slug + '.rdbk'] = new Uint8Array(await (await RBZip.write(innerFiles)).arrayBuffer());
        }
        RBDownload(await RBZip.write(outerFiles), 'rdbk-export_' + (me ? me.username : 'user') + '.zip');
    }
    onSubmit('delForm', async () => {
        if (!(await RBConfirmDanger(t('Delete your account permanently? This cannot be undone.'), t('Delete account')))) return;
        if (await RBConfirm(t('Download all your data as a ZIP before deleting?'), t('Download data'))) await buildTakeout();
        const r = await api('account_delete', { password: $('delPass').value });
        if (r.ok) location.href = '../'; else RBToast(r.error);
    });
    wirePasswordToggles();

    /* ---------- default map location picker (a draggable pin on a mini-map) ---------- */
    let locMap = null, locMarker = null, locLat = null, locLon = null;
    function fmtCoord(lat, lon) {
        if (lat == null) return t('Not set');
        const ew = lon >= 0 ? 'E' : t('W'); // West is "O" (Oeste/Ovest) in es/it
        return `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(5)}° ${ew}`;
    }
    function renderLoc() { $('pfLocCoords').textContent = fmtCoord(locLat, locLon); $('pfLocClear').hidden = locLat == null; }
    function setLoc(lat, lon) {
        locLat = lat; locLon = lon;
        if (lat == null) { if (locMarker) { locMarker.remove(); locMarker = null; } return renderLoc(); }
        if (!locMarker) {
            locMarker = new maplibregl.Marker({ draggable: true, color: '#e8b059' }).setLngLat([lon, lat]).addTo(locMap.map);
            locMarker.on('dragend', () => { const p = locMarker.getLngLat(); setLoc(+p.lat.toFixed(7), +p.lng.toFixed(7)); });
        } else locMarker.setLngLat([lon, lat]);
        renderLoc();
    }
    function initLocPicker(lat, lon) {
        const has = lat != null && lon != null;
        if (!locMap) {
            locMap = new RBMap('pfLocMap', { style: RBMap.STYLE_TOPO, zoom: has ? 11 : 3, geolocate: true, center: has ? [lon, lat] : [0, 20] });
            locMap.map.on('click', (e) => setLoc(+e.lngLat.lat.toFixed(7), +e.lngLat.lng.toFixed(7)));
            $('pfLocClear').onclick = () => setLoc(null, null);
            $('pfLocSave').onclick = async () => {
                const r = await api('save_location', { default_lat: locLat, default_lon: locLon });
                RBToast(r.ok ? 'Location saved.' : r.error);
            };
            $('pfLocHere').onclick = () => {
                if (!navigator.geolocation) return;
                navigator.geolocation.getCurrentPosition((p) => {
                    setLoc(+p.coords.latitude.toFixed(7), +p.coords.longitude.toFixed(7));
                    locMap.map.flyTo({ center: [locLon, locLat], zoom: 13 });
                }, () => RBToast('Could not get your location.'), { enableHighAccuracy: true, timeout: 10000 });
            };
        } else if (has) locMap.map.jumpTo({ center: [lon, lat], zoom: 11 });
        setTimeout(() => locMap.map.resize(), 80); // the card was display:none until the account view showed
        if (has) setLoc(+lat, +lon); else setLoc(null, null);
    }

    /* ---------- account ---------- */
    async function showAccount(user) {
        me = user;
        show('vAccount'); msg('');
        // A Google-created account has no password yet (#211): hide the "current password"
        // fields (the server doesn't require them either), retitle the card to "Set a
        // password" and explain — setting one also enables email/password sign-in.
        const hasPassword = !!user.has_password;
        $('pwTitle').setAttribute('data-i18n', hasPassword ? 'Change password' : 'Set a password');
        $('pwTitle').textContent = t(hasPassword ? 'Change password' : 'Set a password');
        $('pwGoogleHint').hidden = hasPassword;
        $('pwCurrentLabel').hidden = !hasPassword;
        $('pwCurrent').hidden = !hasPassword;
        $('delPassLabel').hidden = !hasPassword;
        $('delPass').hidden = !hasPassword;

        $('accName').textContent = ((user.first_name || '') + ' ' + (user.last_name || '')).trim() || user.username;
        $('accHandle').textContent = '@' + user.username + ' · ' + user.email;
        $('accAvatar').src = user.avatar ? RBMediaSrc(user.avatar) + '?v=' + Date.now() : '../assets/icon.svg'; // bust HTTP/CDN cache so a re-uploaded avatar shows fresh
        $('logoutBtn').onclick = async () => { await api('logout'); location.reload(); };
        $('pfFirst').value = user.first_name || '';
        $('pfLast').value = user.last_name || '';
        $('pfBio').value = user.bio || '';
        $('pfOrg').value = user.organization || '';
        RBOrgDatalist($('orgSuggest')); // suggest existing clubs so the same one isn't retyped differently (#116)
        $('pfVoiceLang').value = user.voice_lang || '';
        // Grants recap (#310)
        const grants = [];
        if (user.is_admin) grants.push({ label: t('Admin'), cls: 'admin' });
        if (user.is_organizer) grants.push({ label: t('Organizer'), cls: 'organizer' });
        if (!user.is_admin && !user.is_organizer) grants.push({ label: t('Basic user'), cls: 'basic' });
        $('grantsList').innerHTML = grants.map((g) => `<div class="grant-row"><span class="grant-badge ${g.cls}">${esc(g.label)}</span></div>`).join('');
        initLocPicker(user.default_lat, user.default_lon);
        $('pfAvatarBtn').onclick = () => $('pfAvatar').click();
        $('pfAvatar').onchange = async () => {
            const f = $('pfAvatar').files[0]; if (!f) return;
            msg('Uploading photo…', true);
            const r = await RBUpload({ type: 'avatar' }, f, 'avatar.jpg');
            if (r.ok) { $('accAvatar').src = RBMediaSrc(r.avatar); msg('Photo updated.', true); } else msg(r.error, false);
        };
        $('pfSave').onclick = async () => {
            const r = await api('profile', { first_name: $('pfFirst').value, last_name: $('pfLast').value, bio: $('pfBio').value, organization: $('pfOrg').value, voice_lang: $('pfVoiceLang').value });
            if (r.ok) $('accName').textContent = (($('pfFirst').value || '') + ' ' + ($('pfLast').value || '')).trim() || user.username; // keep the header name in sync
            msg(r.ok ? 'Profile saved.' : r.error, !!r.ok);
        };
    }

    init();
})();
