'use strict';
/* Direct-APK page (#540): test builds and releases resolved server-side (admin_apk_latest),
 * so the page needs no CSP exception and never hits the GitHub rate limit. A rolling DEBUG
 * build is published on every main push (uninstall the store version first: signatures
 * differ); versioned signed APKs ride normal releases. Admins only. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, api = RBApi;
    const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

    function card(badge, build) {
        const ver = build.tag === 'apk-latest' ? String(build.published || '').slice(0, 16).replace('T', ' ') : String(build.tag || '').replace(/^android-/, '');
        return `<h2>RDBK ${esc(ver)} · Android${badge ? ` <span class="muted small">${esc(badge)}</span>` : ''}</h2>`
            + `<div class="apk-meta">${fmtSize(build.size || 0)}${build.sha256 ? `<br>SHA-256: <code>${esc(build.sha256)}</code>` : ''}</div>`
            + `<div class="btnrow"><a class="btn btn-primary" href="${esc(build.url)}"><i class="fa-solid fa-download"></i> ${esc(t('apk.download'))}</a></div>`;
    }

    async function load() {
        if (!(await RBRequireUser($('adminMsg'), { admin: true }))) return;
        $('adminMsg').hidden = true; $('apkBody').hidden = false;
        const box = $('apkCard');
        let j = null;
        try { j = await api('admin_apk_latest', {}); } catch (e) { j = null; }
        const cards = [];
        if (j && j.ok) {
            if (j.rolling) cards.push(card(t('apk.testBuild'), j.rolling));
            if (j.stable) cards.push(card('', j.stable));
        }
        if (!cards.length) {
            box.innerHTML = `<p class="muted">${esc(t('apk.noRelease'))}</p>`
                + `<div class="btnrow"><a class="btn btn-ghost" href="https://github.com/alvarofranz/roadbook/releases" target="_blank" rel="noopener"><i class="fa-brands fa-github"></i> GitHub releases</a></div>`;
            return;
        }
        box.innerHTML = cards.join('<hr>');
    }

    load();
    window.addEventListener('rb-lang', () => { load(); });
})();
