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
                const r = await api('reset', { token: params.get('reset'), password: $('resetPass').value });
                msg(r.message || r.error, !!r.ok); if (r.ok) { history.replaceState(null, '', location.pathname); show('vLogin'); }
            });
            return;
        }
        if (cfg.user) return cfg.user.must_change_password ? showForce() : showAccount(cfg.user);
        show('vLogin');
    }

    // Admin gave a temporary password → force a new one before the profile is reachable.
    function showForce() { show('vForce'); msg(''); }

    $('toRegister').onclick = (e) => { e.preventDefault(); msg(''); show('vRegister'); };
    $('toLogin').onclick = (e) => { e.preventDefault(); msg(''); show('vLogin'); };
    $('toLogin2').onclick = (e) => { e.preventDefault(); msg(''); show('vLogin'); };
    $('toForgot').onclick = (e) => { e.preventDefault(); msg(''); show('vForgot'); };

    onSubmit('loginForm', async () => {
        const r = await api('login', { email: $('loginId').value, password: $('loginPass').value, turnstile: tsTokens.login });
        if (r.ok) (r.user.must_change_password ? showForce() : showAccount(r.user)); else { msg(r.error, false); resetTs('login'); }
    });
    // Forced password change: no current password (the admin set a temporary one); then reload into the profile.
    onSubmit('forceForm', async () => {
        const r = await api('change_password', { new: $('forcePass').value });
        if (r.ok) { const c = await api('config'); showAccount(c.user); } else msg(r.error, false);
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
        const r = await api('change_password', { current: $('pwCurrent').value, new: $('pwNew').value });
        RBToast(r.message || r.error); // toast: visible even when scrolled down in the profile
        if (r.ok) { $('pwCurrent').value = ''; $('pwNew').value = ''; }
    });
    onSubmit('delForm', async () => {
        if (!(await RBConfirmDanger(t('Delete your account permanently? This cannot be undone.'), t('Delete account')))) return;
        const r = await api('account_delete', { password: $('delPass').value });
        if (r.ok) location.href = '../'; else RBToast(r.error);
    });
    wirePasswordToggles();

    /* ---------- account ---------- */
    async function showAccount(user) {
        show('vAccount'); msg('');
        $('adminLink').hidden = !user.is_admin; // the admin panel link, only for admins

        $('accName').textContent = ((user.first_name || '') + ' ' + (user.last_name || '')).trim() || user.username;
        $('accHandle').textContent = '@' + user.username + ' · ' + user.email;
        $('accAvatar').src = user.avatar ? user.avatar + '?v=' + Date.now() : '../assets/icon.svg'; // bust HTTP/CDN cache so a re-uploaded avatar shows fresh
        $('logoutBtn').onclick = async () => { await api('logout'); location.reload(); };
        $('pfBio').value = user.bio || '';
        $('pfVoiceLang').value = user.voice_lang || '';
        $('pfAvatarBtn').onclick = () => $('pfAvatar').click();
        $('pfAvatar').onchange = async () => {
            const f = $('pfAvatar').files[0]; if (!f) return;
            msg('Uploading photo…', true);
            const r = await RBUpload({ type: 'avatar' }, f, 'avatar.jpg');
            if (r.ok) { $('accAvatar').src = r.avatar; msg('Photo updated.', true); } else msg(r.error, false);
        };
        $('pfSave').onclick = async () => { const r = await api('profile', { bio: $('pfBio').value, voice_lang: $('pfVoiceLang').value }); msg(r.ok ? 'Profile saved.' : r.error, !!r.ok); };
    }

    init();
})();
