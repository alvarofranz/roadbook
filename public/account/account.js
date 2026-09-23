'use strict';
/* Account: register / verify / sign-in / forgot / reset and the user's profile
 * (avatar + bio). The saved roadbooks live on their own page (myroadbooks/).
 * Talks to /api (same-origin, session cookie). Cloudflare Turnstile is rendered
 * when a site key is configured server-side. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc; // shared helpers (app.js / i18n.js)
    const params = new URLSearchParams(location.search);
    const ts = {}; // the Turnstile widget of each form, by data-ts name
    let me = null; // the signed-in user (held so the change-password handler knows the credential id)

    const api = RBApi; // shared helper (app.js)
    const IS_APP = document.documentElement.classList.contains('native'); // Capacitor shell (set before paint)
    // One message box for every form on the page. An error is always SEEN (#764): the keyboard
    // closes and the box scrolls into view, since on a phone the form sits below it. What it says
    // stays generic where it must — a failed sign-in never tells which of the two was wrong — and
    // explains the failures that are not the user's: no connection, a server that did not answer.
    const PLAIN = { 'Network error.': 'Could not reach the server — check your connection and try again.' };
    const msg = (text, ok) => {
        const m = $('auth-message'); if (!text) { m.hidden = true; return; }
        m.textContent = RBt(PLAIN[text] || text); m.className = 'auth-message ' + (ok ? 'ok' : 'err'); m.hidden = false;
        if (!ok) { if (document.activeElement) document.activeElement.blur(); m.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    };
    const show = (id) => ['vLogin', 'vRegister', 'vForgot', 'vReset', 'vForce', 'vAccount'].forEach((v) => $(v).hidden = v !== id);

    /* ---------- Turnstile ---------- */
    const tsToken = (name) => (ts[name] ? ts[name].token() : null);
    const resetTs = (name) => { if (ts[name]) ts[name].reset(); };

    /* ---------- Social sign-in: Google (#46) + Apple (#370) ---------- */
    // Both providers run through the SAME one-call server flow — verify the identity token, then
    // sign in or create the account — so ONE pipeline drives them and a provider only has to
    // produce its identity token. Apple is what App Store guideline 4.8 asks for alongside
    // Google: its relay address lets a user keep their real email private.
    // Google's four-colour "G" (no white circle) so our OWN dark button matches the site theme;
    // Apple's mark is the FontAwesome brand glyph, white on the same dark button (their guideline).
    const GOOGLE_G = '<svg class="social-mark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
    const APPLE_MARK = '<i class="fa-brands fa-apple social-mark" aria-hidden="true"></i>';
    const PROVIDERS = {
        google: { action: 'google_auth', label: 'Continue with Google', mark: GOOGLE_G, failed: 'Google sign-in failed. Please try again.', renderWeb: renderGoogleWeb },
        apple: { action: 'apple_auth', label: 'Continue with Apple', mark: APPLE_MARK, failed: 'Apple sign-in failed. Please try again.', webSignIn: appleWebSignIn },
    };
    let googleClientId = '', appleClientId = '';
    const socialBox = (key) => $(key + 'Btn');                  // #googleBtn / #appleBtn
    const socialButton = (key) => `<button type="button" class="btn btn-ghost social-btn">${PROVIDERS[key].mark}<span>${t(PROVIDERS[key].label)}</span></button>`;
    // Closing the OS sheet or the popup is a choice, not a failure: the plugins reject with a
    // "cancel" message, Apple's web SDK with { error: 'popup_closed_by_user' }.
    const wasCancelled = (e) => /cancel|popup_closed/i.test((e && (e.error || e.message)) || '');

    // Which providers this surface offers. Google: the OS picker in the app, the GIS button on the
    // web once a client id is configured. Apple: the OS sheet on iOS (nothing to configure) and the
    // Apple JS popup on the web once a Services ID is configured — never in the Android app, where
    // there is no Apple sheet and guideline 4.8 doesn't apply.
    function initSocial(cfg) {
        googleClientId = cfg.google_client || '';
        appleClientId = cfg.apple_client || '';
        const available = {
            google: IS_APP ? true : !!googleClientId,
            apple: IS_APP ? RBPlatform() === 'ios' : !!appleClientId,
        };
        Object.keys(PROVIDERS).forEach((key) => {
            socialBox(key).hidden = !available[key];
            if (available[key]) renderSocial(key);              // the web Google button renders when GIS lands
        });
        $('socialSignin').hidden = !(available.google || available.apple);
        if (!IS_APP && available.google) loadGoogleScript();
    }

    // Our own dark button: a tap asks the provider for an identity token. On the web a provider may
    // instead insist on drawing its own button (Google) — that's what renderWeb is for.
    function renderSocial(key) {
        const box = socialBox(key); if (!box) return;
        const provider = PROVIDERS[key];
        if (!IS_APP && provider.renderWeb) return provider.renderWeb(box);
        box.className = '';
        box.innerHTML = socialButton(key);
        box.querySelector('button').onclick = () => startSocial(key);
    }
    function loadGoogleScript() {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
        s.onload = () => renderSocial('google'); document.head.appendChild(s);
    }
    // Web Google: our dark button with Google's real button rendered INVISIBLY on top of it, so a
    // click reliably triggers the official ID-token flow without the white-box GIS look.
    function renderGoogleWeb(box) {
        if (!window.google || !google.accounts || !google.accounts.id) return;   // renders when the GIS script lands
        google.accounts.id.initialize({ client_id: googleClientId, callback: (resp) => onSocialIdentity('google', { credential: resp && resp.credential }) });
        box.className = 'social-overlay-wrap';
        box.innerHTML = `${socialButton('google')}<div class="social-overlay"></div>`;
        google.accounts.id.renderButton(box.querySelector('.social-overlay'), { type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: 280 });
        // If the invisible GIS iframe never rendered (blocked frame/script), taps fall through to
        // the wrap — trigger Google's One Tap prompt so pressing the button always reacts (#250).
        box.onclick = () => { if (!box.querySelector('.social-overlay iframe')) { try { google.accounts.id.prompt(); } catch (e) {} } };
    }
    // Ask the provider for an identity: the OS sheet inside the app, the provider's own web flow
    // otherwise. Both resolve with { credential, first_name?, last_name? } or null when cancelled.
    async function startSocial(key) {
        try {
            const identity = IS_APP ? await nativeSignIn(key) : await PROVIDERS[key].webSignIn();
            if (identity) onSocialIdentity(key, identity);
        } catch (e) {
            if (wasCancelled(e)) return;
            // Always show the underlying reason — a generic message made native sign-in
            // failures (plugin config, Play Services…) undiagnosable in the field.
            msg(t(PROVIDERS[key].failed) + ((e && e.message) ? ' (' + e.message + ')' : ''), false);
        }
    }
    async function nativeSignIn(key) {
        const native = await RBNativeReady();                   // the bridge script loads async (#250)
        const signIn = native && native[key + 'SignIn'];
        if (!signIn) throw new Error('native bridge unavailable');
        return signIn.call(native);
    }
    // Apple on the web: their JS SDK, loaded on the first tap and initialised once. The popup keeps
    // the user on the page and hands us the identity token. The name comes with it on the FIRST
    // authorization only — Apple never repeats it, so it travels to the server alongside the token.
    const APPLE_LOCALES = { en: 'en_US', es: 'es_ES', it: 'it_IT', de: 'de_DE', fr: 'fr_FR' };
    let appleWebReady = null;
    function appleWebInit() {
        if (!appleWebReady) appleWebReady = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/' + (APPLE_LOCALES[RBi18n.current()] || APPLE_LOCALES.en) + '/appleid.auth.js';
            s.async = true;
            s.onload = () => {
                AppleID.auth.init({ clientId: appleClientId, scope: 'name email', redirectURI: location.origin + '/account/', usePopup: true });
                resolve();
            };
            s.onerror = () => { appleWebReady = null; reject(new Error('Apple sign-in script blocked')); };
            document.head.appendChild(s);
        });
        return appleWebReady;
    }
    async function appleWebSignIn() {
        await appleWebInit();
        const res = await AppleID.auth.signIn();
        const credential = res && res.authorization && res.authorization.id_token;
        if (!credential) return null;
        const name = (res.user && res.user.name) || {};
        return { credential: credential, first_name: name.firstName || '', last_name: name.lastName || '' };
    }
    // Feedback while the identity token is verified server-side; restoreSocial() puts the button back
    // on a terminal failure (on success the page navigates away, so no restore is needed).
    function busySocial(key) { const box = socialBox(key); if (box) { box.className = ''; box.innerHTML = `<div class="social-loading"><span class="spinner"></span> ${t('Signing you in…')}</div>`; } }
    function restoreSocial(key) { renderSocial(key); }

    /* Straight in: choosing the account in Google's chooser (or Apple's sheet) IS the decision, so
       one verified identity means one call and the user lands in their profile — an existing
       account and a new one alike. The Terms sit beside the buttons, which makes pressing one the
       acceptance; that is what `accept_terms` carries here, and the server ignores it for an
       account that already exists (#519). */
    async function onSocialIdentity(key, identity) {
        if (me) return;                                                     // already signed in — ignore stray GIS re-callbacks (#308)
        if (!identity || !identity.credential) return;
        busySocial(key);
        const r = await api(PROVIDERS[key].action, Object.assign({}, identity, { accept_terms: true }));
        if (r.ok) {
            me = r.user;
            // Stop Google's GIS library from auto re-firing the callback (One Tap / button
            // re-render) once we're signed in, which otherwise re-showed the chooser (#308).
            try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.cancel(); } catch (e) {}
            return finishLogin(me);
        }
        restoreSocial(key); msg(r.error || PROVIDERS[key].failed, false);
    }
    // Shared post-sign-in step (classic login + social): force a password change if flagged, else
    // return to ?next= (safe same-origin path only) or show the profile.
    function finishLogin(user) {
        if (user.must_change_password) return showForce();
        const next = new URLSearchParams(location.search).get('next');
        // only a path on this site: '//x' and '/\x' are both read by browsers as another host
        if (next && next.charAt(0) === '/' && !/^[/\\]/.test(next.charAt(1))) { location.href = next; return; }
        showAccount(user);
    }

    /* Submit on Enter / button: run the handler, never reload the page. */
    function onSubmit(formId, handler) { $(formId).addEventListener('submit', (e) => { e.preventDefault(); handler(); }); }
    // Busy state for a form's submit button (no double submits, visible progress).
    const busySubmit = (formId) => RBBusy(document.querySelector('#' + formId + ' [type=submit]'));

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
        const cfg = await RBConfig(); // offline, a signed-in user still gets their account (#630)
        document.querySelectorAll('.turnstile[data-ts]').forEach((el) => { ts[el.dataset.ts] = RBTurnstile(el, cfg.turnstile); });
        // In the Capacitor app the providers' web SDKs can't run (they block OAuth in a WebView), so
        // ALWAYS use the native OS sheets there. Decided by the shell class — set synchronously at
        // startup — never by whether the async RBNative bridge finished loading: racing on it could
        // render a web button inside the app, where pressing it does nothing (#250).
        initSocial(cfg);

        if (params.get('verify')) {
            const r = await api('verify', { token: params.get('verify') });
            msg(r.message || r.error, !!r.ok); history.replaceState(null, '', location.pathname); show('vLogin'); return;
        }
        if (params.get('reset')) {
            show('vReset');
            onSubmit('resetForm', async () => {
                if ($('resetPass').value !== $('resetPass2').value) return msg('Passwords don’t match.', false);
                const r = await api('reset', { token: params.get('reset'), password: $('resetPass').value });
                msg(r.message || r.error, !!r.ok); if (r.ok) { history.replaceState(null, '', location.pathname); show('vLogin'); }
            });
            return;
        }
        if (params.get('verifyemail')) {
            const r = await api('verify_email_change', { token: params.get('verifyemail') });
            history.replaceState(null, '', location.pathname);
            const c = await RBConfig(); // email may have changed → re-read the user
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
        const busy = busySubmit('loginForm');
        const pass = $('loginPass').value;
        const r = await api('login', { email: $('loginId').value, password: pass, turnstile: tsToken('login') });
        busy.reset();
        if (r.ok) { me = r.user; await storeCredential(me.email, pass); finishLogin(me); }
        else if (r.retry_after) rateLimited(r.retry_after); // too many attempts → popup + countdown
        else { msg(r.error, false); resetTs('login'); }
    });
    // Forced password change: no current password (the admin set a temporary one); then reload into the profile.
    onSubmit('forceForm', async () => {
        if ($('forcePass').value !== $('forcePass2').value) return msg('Passwords don’t match.', false);
        const busy = busySubmit('forceForm');
        const r = await api('change_password', { new: $('forcePass').value });
        busy.reset();
        if (r.ok) { await storeCredential(me && me.email, $('forcePass').value); const c = await RBConfig(); showAccount(c.user); } else msg(r.error, false);
    });
    onSubmit('registerForm', async () => {
        if ($('regPass').value !== $('regPass2').value) return msg('Passwords don’t match.', false);
        if (!$('regTerms').checked) return msg('You must accept the Terms of Use to register.', false);
        const busy = busySubmit('registerForm');
        const r = await api('register', { first_name: $('regFirst').value, last_name: $('regLast').value, username: $('regUser').value, email: $('regEmail').value, password: $('regPass').value, password_confirm: $('regPass2').value, accept_terms: true, turnstile: tsToken('register'), lang: RBi18n.current() });
        busy.reset();
        msg(r.message || r.error, !!r.ok); if (r.ok) show('vLogin'); else resetTs('register');
    });
    onSubmit('forgotForm', async () => {
        const busy = busySubmit('forgotForm');
        const r = await api('forgot', { email: $('forgotEmail').value, turnstile: tsToken('forgot'), lang: RBi18n.current() });
        busy.reset();
        msg(r.message || r.error, !!r.ok); resetTs('forgot');
    });
    // change password (signed in) + delete account — bound once; the forms live in #vAccount
    onSubmit('pwForm', async () => {
        if ($('pwNew').value !== $('pwNew2').value) return RBToast('Passwords don’t match.');
        const busy = busySubmit('pwForm');
        const r = await api('change_password', { current: $('pwCurrent').value, new: $('pwNew').value });
        busy.reset();
        RBToast(r.message || r.error); // toast: visible even when scrolled down in the profile
        if (r.ok) {
            await storeCredential(me && me.email, $('pwNew').value);
            $('pwCurrent').value = ''; $('pwNew').value = ''; $('pwNew2').value = '';
            if (me && !me.has_password) { me.has_password = 1; showAccount(me); } // first password set (#211) → the card becomes "Change password"
        }
    });
    // change email (signed in): re-verifies the new address — see change_email() server-side
    onSubmit('emailForm', async () => {
        if ($('emNew').value.trim().toLowerCase() !== $('emNew2').value.trim().toLowerCase()) return RBToast('Emails don’t match.');
        const busy = busySubmit('emailForm');
        const r = await api('change_email', { email: $('emNew').value, lang: RBi18n.current() });
        busy.reset();
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
                    try { const res = await fetch(RBMediaSrc(p.url)); if (!res.ok) continue; const name = 'photos/' + p.url.split('/').pop(); innerFiles[name] = new Uint8Array(await res.arrayBuffer()); media.photos.push({ file: name, lat: p.lat, lon: p.lon }); } catch (e) {}
                }
            }
            const au = await api('audio_list', { roadbook: rbMeta.id });
            if (au.ok && au.audio) {
                for (const a of au.audio) {
                    try { const res = await fetch(RBMediaSrc(a.url)); if (!res.ok) continue; const name = 'audio/' + a.url.split('/').pop(); innerFiles[name] = new Uint8Array(await res.arrayBuffer()); media.audio.push({ file: name, lat: a.lat, lon: a.lon }); } catch (e) {}
                }
            }
            if (media.photos.length || media.audio.length) innerFiles['media.json'] = JSON.stringify(media);
            const slug = (RB.slug(rb.meta.title) || 'roadbook') + '_' + rbMeta.id;
            outerFiles[slug + '.rdbk'] = new Uint8Array(await (await RBZip.write(innerFiles)).arrayBuffer());
        }
        RBDownload(await RBZip.write(outerFiles), 'rdbk-export_' + (me ? me.username : 'user') + '.zip');
    }
    onSubmit('delForm', async () => {
        if (!(await RBConfirmDanger(t('Delete your account permanently? This cannot be undone.') + (me ? '<br><b>@' + esc(me.username) + '</b>' : '')))) return; // names whose account goes
        if (await RBConfirm(t('Download all your data as a ZIP before deleting?'))) await buildTakeout();
        const busy = busySubmit('delForm');
        const r = await api('account_delete', { password: $('delPass').value });
        busy.reset();
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
            locMarker = new maplibregl.Marker({ draggable: true, color: RBCssVar('--sand') }).setLngLat([lon, lat]).addTo(locMap.map);
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
            $('pfLocSave').onclick = async (e) => {
                const busy = RBBusy(e.currentTarget);
                const r = await api('save_location', { default_lat: locLat, default_lon: locLon });
                if (r.ok) busy.ok(); else busy.reset();
                RBToast(r.ok ? 'Location saved.' : r.error);
            };
            $('pfLocHere').onclick = () => {
                if (!navigator.geolocation) return RBToast('Could not get your location.');
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
        // A social-login account has no password yet (#211): hide the "current password"
        // fields (the server doesn't require them either), retitle the card to "Set a
        // password" and explain — setting one also enables email/password sign-in.
        const hasPassword = !!user.has_password;
        $('pwTitle').setAttribute('data-i18n', hasPassword ? 'Change password' : 'Set a password');
        $('pwTitle').textContent = t(hasPassword ? 'Change password' : 'Set a password');
        $('pwNoPasswordHint').hidden = hasPassword;
        $('pwCurrentLabel').hidden = !hasPassword;
        $('pwCurrent').hidden = !hasPassword;
        $('delPassLabel').hidden = !hasPassword;
        $('delPass').hidden = !hasPassword;

        $('accName').textContent = ((user.first_name || '') + ' ' + (user.last_name || '')).trim() || user.username;
        $('accHandle').textContent = '@' + user.username + ' · ' + user.email;
        $('accAvatar').src = user.avatar ? RBMediaSrc(user.avatar) : '../assets/icon.svg'; // the stored URL carries its upload version
        $('accProfileLink').href = RBProfileLink(user.username);
        $('logoutBtn').onclick = RBSignOut;
        $('pfFirst').value = user.first_name || '';
        $('pfLast').value = user.last_name || '';
        $('pfBio').value = user.bio || '';
        $('pfOrg').value = user.organization || '';
        RBOrgDatalist($('orgSuggest')); // suggest existing clubs so the same one isn't retyped differently (#116)
        // Grants recap (#310) — the same role badges as the user admin list (#632)
        const grants = [];
        if (user.is_admin) grants.push({ label: t('Admin'), cls: 'u-admin' });
        if (user.is_organizer) grants.push({ label: t('Organizer'), cls: 'u-organizer' });
        if (!user.is_admin && !user.is_organizer) grants.push({ label: t('Basic user'), cls: '' });
        $('grantsList').innerHTML = grants.map((g) => `<span class="u-badge ${g.cls}">${esc(g.label)}</span>`).join('');
        $('pfRunsVis').value = user.runs_visibility || 'ask';
        $('pfRunsSave').onclick = async (e) => {
            const busy = RBBusy(e.currentTarget);
            const r = await api('runs_settings', { runs_visibility: $('pfRunsVis').value });
            if (r.ok) busy.ok(); else busy.reset();
            RBToast(r.ok ? 'Saved.' : r.error);
        };
        initLocPicker(user.default_lat, user.default_lon);
        // "Choose on the map" from the first-sign-in prompt lands here (#749)
        if (location.hash === '#defaultLocation') setTimeout(() => $('defaultLocation').scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
        $('pfAvatarBtn').onclick = () => $('pfAvatar').click();
        $('pfAvatar').onchange = async () => {
            const f = $('pfAvatar').files[0]; if (!f) return;
            RBToast('Uploading photo…');
            const r = await RBUpload({ type: 'avatar' }, f, 'avatar.jpg');
            if (r.ok) $('accAvatar').src = RBMediaSrc(r.avatar);
            RBToast(r.ok ? 'Photo updated.' : r.error); // every profile save reports the same way (#631)
        };
        $('pfSave').onclick = async (e) => {
            const busy = RBBusy(e.currentTarget);
            const r = await api('profile', { first_name: $('pfFirst').value, last_name: $('pfLast').value, bio: $('pfBio').value, organization: $('pfOrg').value });
            if (r.ok) { busy.ok(); $('accName').textContent = (($('pfFirst').value || '') + ' ' + ($('pfLast').value || '')).trim() || user.username; } // keep the header name in sync
            else busy.reset();
            RBToast(r.ok ? 'Profile saved.' : r.error);
        };
    }

    init();
})();
