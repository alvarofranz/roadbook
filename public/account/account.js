'use strict';
/* Account: register / verify / sign-in / forgot / reset and the user's profile
 * (avatar + bio). The saved roadbooks live on their own page (myroadbooks/).
 * Talks to /api (same-origin, session cookie). Cloudflare Turnstile is rendered
 * when a site key is configured server-side. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt; // shared helpers (app.js / i18n.js)
    const params = new URLSearchParams(location.search);
    let tsSite = '', tsTokens = {};

    const api = RBApi; // shared helper (app.js)
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

    /* Submit on Enter / button: run the handler, never reload the page. */
    function onSubmit(formId, handler) { $(formId).addEventListener('submit', (e) => { e.preventDefault(); handler(); }); }

    /* Our forms submit by fetch (no navigation), so the browser's password-change detection
     * never fires — it only triggers on a real navigation (that's why it prompted at logout,
     * never on the in-page change). So after a successful change we reload: the password
     * manager then offers to update the stored credential. A toast is stashed across the
     * reload so the user still sees confirmation. (#78) */
    function reloadWithToast(message) { try { sessionStorage.setItem('rbToast', message || ''); } catch (e) {} location.reload(); }

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
        tsSite = cfg.turnstile || '';
        loadTurnstile();

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
        if (cfg.user) return cfg.user.must_change_password ? showForce(cfg.user) : showAccount(cfg.user);
        show('vLogin');
    }

    // Admin gave a temporary password → force a new one before the profile is reachable.
    function showForce(user) { show('vForce'); msg(''); if (user) $('forceUser').value = user.email || user.username || ''; }

    $('toRegister').onclick = (e) => { e.preventDefault(); msg(''); show('vRegister'); };
    $('toLogin').onclick = (e) => { e.preventDefault(); msg(''); show('vLogin'); };
    $('toLogin2').onclick = (e) => { e.preventDefault(); msg(''); show('vLogin'); };
    $('toForgot').onclick = (e) => { e.preventDefault(); msg(''); show('vForgot'); };

    onSubmit('loginForm', async () => {
        const r = await api('login', { email: $('loginId').value, password: $('loginPass').value, turnstile: tsTokens.login });
        // Reload on success: the navigation is what lets the password manager offer to save the
        // login — a fetch with no navigation never triggers it. init() then shows the profile
        // (or the forced-change view). (#78)
        if (r.ok) location.reload(); else { msg(r.error, false); resetTs('login'); }
    });
    // Forced password change: no current password (the admin set a temporary one); then reload into the profile.
    onSubmit('forceForm', async () => {
        if ($('forcePass').value !== $('forcePass2').value) return msg("Passwords don't match.", false);
        const r = await api('change_password', { new: $('forcePass').value });
        if (r.ok) reloadWithToast(r.message); else msg(r.error, false);
    });
    onSubmit('registerForm', async () => {
        const r = await api('register', { first_name: $('regFirst').value, last_name: $('regLast').value, username: $('regUser').value, email: $('regEmail').value, password: $('regPass').value, turnstile: tsTokens.register });
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
        if (r.ok) reloadWithToast(r.message); else RBToast(r.message || r.error);
    });
    // change email (signed in): re-verifies the new address — see change_email() server-side
    onSubmit('emailForm', async () => {
        if ($('emNew').value.trim().toLowerCase() !== $('emNew2').value.trim().toLowerCase()) return RBToast("Emails don't match.");
        const r = await api('change_email', { email: $('emNew').value });
        RBToast(r.message || r.error);
        if (r.ok) { $('emNew').value = ''; $('emNew2').value = ''; }
    });
    onSubmit('delForm', async () => {
        if (!(await RBConfirmDanger(t('Delete your account permanently? This cannot be undone.'), t('Delete account')))) return;
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
        show('vAccount'); msg('');
        try { const m = sessionStorage.getItem('rbToast'); if (m != null) { sessionStorage.removeItem('rbToast'); if (m) RBToast(m); } } catch (e) {} // confirmation carried across a reload (e.g. after a password change)
        $('adminLink').hidden = !user.is_admin; // the admin panel link, only for admins

        $('accName').textContent = ((user.first_name || '') + ' ' + (user.last_name || '')).trim() || user.username;
        $('accHandle').textContent = '@' + user.username + ' · ' + user.email;
        $('accAvatar').src = user.avatar ? user.avatar + '?v=' + Date.now() : '../assets/icon.svg'; // bust HTTP/CDN cache so a re-uploaded avatar shows fresh
        $('logoutBtn').onclick = async () => { await api('logout'); location.reload(); };
        $('pwUser').value = user.email || user.username || ''; // hidden field so the pw manager updates the right credential
        $('pfFirst').value = user.first_name || '';
        $('pfLast').value = user.last_name || '';
        $('pfBio').value = user.bio || '';
        $('pfVoiceLang').value = user.voice_lang || '';
        initLocPicker(user.default_lat, user.default_lon);
        $('pfAvatarBtn').onclick = () => $('pfAvatar').click();
        $('pfAvatar').onchange = async () => {
            const f = $('pfAvatar').files[0]; if (!f) return;
            msg('Uploading photo…', true);
            const r = await RBUpload({ type: 'avatar' }, f, 'avatar.jpg');
            if (r.ok) { $('accAvatar').src = r.avatar; msg('Photo updated.', true); } else msg(r.error, false);
        };
        $('pfSave').onclick = async () => {
            const r = await api('profile', { first_name: $('pfFirst').value, last_name: $('pfLast').value, bio: $('pfBio').value, voice_lang: $('pfVoiceLang').value });
            if (r.ok) $('accName').textContent = (($('pfFirst').value || '') + ' ' + ($('pfLast').value || '')).trim() || user.username; // keep the header name in sync
            msg(r.ok ? 'Profile saved.' : r.error, !!r.ok);
        };
    }

    init();
})();
