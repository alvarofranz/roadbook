'use strict';
/* Account: register / verify / sign-in / forgot / reset, profile, my roadbooks.
 * Talks to /api (same-origin, session cookie). Cloudflare Turnstile is rendered
 * when a site key is configured server-side. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc; // shared helpers (app.js / i18n.js)
    const params = new URLSearchParams(location.search);
    let tsSite = '', tsTokens = {};

    const api = RBApi; // shared helper (app.js)
    const msg = (text, ok) => { const m = $('auth-message'); if (!text) { m.hidden = true; return; } m.textContent = RBt(text); m.className = 'auth-message ' + (ok ? 'ok' : 'err'); m.hidden = false; };
    const show = (id) => ['vLogin', 'vRegister', 'vForgot', 'vReset', 'vAccount'].forEach((v) => $(v).hidden = v !== id);

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
            $('resetBtn').onclick = async () => {
                const r = await api('reset', { token: params.get('reset'), password: $('resetPass').value });
                msg(r.message || r.error, !!r.ok); if (r.ok) { history.replaceState(null, '', location.pathname); show('vLogin'); }
            };
            return;
        }
        if (cfg.user) return showAccount(cfg.user);
        show('vLogin');
    }

    $('toRegister').onclick = (e) => { e.preventDefault(); msg(''); show('vRegister'); };
    $('toLogin').onclick = (e) => { e.preventDefault(); msg(''); show('vLogin'); };
    $('toLogin2').onclick = (e) => { e.preventDefault(); msg(''); show('vLogin'); };
    $('toForgot').onclick = (e) => { e.preventDefault(); msg(''); show('vForgot'); };

    $('loginBtn').onclick = async () => {
        const r = await api('login', { email: $('loginId').value, password: $('loginPass').value, turnstile: tsTokens.login });
        if (r.ok) showAccount(r.user); else { msg(r.error, false); resetTs('login'); }
    };
    $('regBtn').onclick = async () => {
        const r = await api('register', { first_name: $('regFirst').value, last_name: $('regLast').value, username: $('regUser').value, email: $('regEmail').value, password: $('regPass').value, turnstile: tsTokens.register });
        msg(r.message || r.error, !!r.ok); if (r.ok) show('vLogin'); else resetTs('register');
    };
    $('forgotBtn').onclick = async () => {
        const r = await api('forgot', { email: $('forgotEmail').value, turnstile: tsTokens.forgot });
        msg(r.message || r.error, !!r.ok); resetTs('forgot');
    };

    /* ---------- account ---------- */
    async function showAccount(user) {
        show('vAccount'); msg('');
        $('accName').textContent = ((user.first_name || '') + ' ' + (user.last_name || '')).trim() || user.username;
        $('accHandle').textContent = '@' + user.username + ' · ' + user.email;
        $('accBio').textContent = user.bio || '';
        $('accAvatar').src = user.avatar ? user.avatar + '?v=' + Date.now() : '../assets/icon.svg';
        $('logoutBtn').onclick = async () => { await api('logout'); location.reload(); };
        $('editProfileBtn').onclick = () => { $('profileForm').hidden = !$('profileForm').hidden; };
        $('pfBio').value = user.bio || '';
        $('pfAvatarBtn').onclick = () => $('pfAvatar').click();
        $('pfAvatar').onchange = async () => {
            const f = $('pfAvatar').files[0]; if (!f) return;
            msg('Uploading photo…', true);
            const r = await RBUpload({ type: 'avatar' }, f, 'avatar.jpg');
            if (r.ok) { $('accAvatar').src = r.avatar; msg('Photo updated.', true); } else msg(r.error, false);
        };
        $('pfSave').onclick = async () => { const r = await api('profile', { bio: $('pfBio').value }); msg(r.ok ? 'Profile saved.' : r.error, !!r.ok); };
        loadRoadbooks();
    }

    async function loadRoadbooks() {
        const r = await api('rb_list');
        const list = $('rbList');
        if (!r.ok || !r.roadbooks || !r.roadbooks.length) { list.innerHTML = `<p class="muted small">${t('No roadbooks yet. Create one in the Editor.')}</p>`; return; }
        list.innerHTML = r.roadbooks.map((rb) => `<div class="roadbook-row">
            <div class="meta"><b>${esc(rb.title)}</b><small><i class="fa-solid fa-${rb.is_public ? 'globe' : 'lock'}"></i> ${(rb.total_distance / 1000).toFixed(1)} km · ${rb.note_count} ${t('notes')}</small></div>
            <a class="btn btn-ghost" href="../challenge/${rb.slug || ''}" title="View"><i class="fa-solid fa-eye"></i></a>
            <a class="btn btn-ghost" href="../editor/?rb=${rb.id}" title="Edit"><i class="fa-solid fa-pen"></i></a>
            <button class="btn btn-ghost" data-del="${rb.id}" title="Delete"><i class="fa-solid fa-trash-can icon-danger"></i></button>
        </div>`).join('');
        list.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
            if (await RBConfirm('Delete this roadbook?', 'Delete')) { await api('rb_delete', { id: +b.dataset.del }); loadRoadbooks(); }
        });
    }

    init();
})();
