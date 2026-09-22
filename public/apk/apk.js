'use strict';
/* Direct-APK page (#540): latest Android release asset from GitHub, rendered with version,
 * size, date and SHA-256. No release yet (or API unreachable) → the fallback card. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;
    const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

    async function load() {
        const card = $('apkCard');
        let rel = null;
        try {
            const r = await fetch('https://api.github.com/repos/alvarofranz/roadbook/releases/latest');
            if (r.ok) rel = await r.json();
        } catch (e) { /* offline: fall through to the fallback card */ }
        const apk = rel && (rel.assets || []).find((a) => /\.apk$/i.test(a.name || ''));
        if (!apk) {
            card.innerHTML = `<p class="muted">${esc(t('apk.noRelease'))}</p>`
                + `<div class="btnrow"><a class="btn btn-ghost" href="https://github.com/alvarofranz/roadbook/releases" target="_blank" rel="noopener"><i class="fa-brands fa-github"></i> GitHub releases</a></div>`;
            return;
        }
        const shaAsset = (rel.assets || []).find((a) => /\.sha256$/i.test(a.name || ''));
        let sha = '';
        if (shaAsset) {
            try {
                const st = await (await fetch(shaAsset.browser_download_url)).text();
                sha = st.split(/\s+/)[0] || '';
            } catch (e) { /* checksum stays empty */ }
        }
        const ver = String(rel.tag_name || '').replace(/^android-/, '');
        card.innerHTML = `<h2>RDBK ${esc(ver)} · Android</h2>`
            + `<div class="apk-meta">${fmtSize(apk.size || 0)} · ${esc((apk.updated_at || '').slice(0, 10))}${sha ? `<br>SHA-256: <code>${esc(sha)}</code>` : ''}</div>`
            + `<div class="btnrow"><a class="btn btn-primary" href="${esc(apk.browser_download_url)}"><i class="fa-solid fa-download"></i> ${esc(t('apk.download'))}</a></div>`;
    }

    load();
    window.addEventListener('rb-lang', () => { load(); });
})();
