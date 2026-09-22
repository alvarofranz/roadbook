'use strict';
/* Direct-APK page (#540): test builds and releases from GitHub. A rolling DEBUG build is
 * published on the floating `apk-latest` prerelease at every push to main (uninstall the
 * store version first: signatures differ); versioned signed APKs ride normal releases.
 * Nothing published yet (or API unreachable) → the fallback card. Admins only. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;
    const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

    async function shaOf(assets) {
        const shaAsset = (assets || []).find((a) => /\.sha256$/i.test(a.name || ''));
        if (!shaAsset) return '';
        try {
            const st = await (await fetch(shaAsset.browser_download_url)).text();
            return st.split(/\s+/)[0] || '';
        } catch (e) { return ''; }
    }

    function card(badge, rel, apk, sha) {
        const ver = rel.tag_name === 'apk-latest' ? String(rel.published_at || '').slice(0, 16).replace('T', ' ') : String(rel.tag_name || '').replace(/^android-/, '');
        return `<h2>RDBK ${esc(ver)} · Android${badge ? ` <span class="muted small">${esc(badge)}</span>` : ''}</h2>`
            + `<div class="apk-meta">${fmtSize(apk.size || 0)} · ${esc((apk.updated_at || '').slice(0, 10))}${sha ? `<br>SHA-256: <code>${esc(sha)}</code>` : ''}</div>`
            + `<div class="btnrow"><a class="btn btn-primary" href="${esc(apk.browser_download_url)}"><i class="fa-solid fa-download"></i> ${esc(t('apk.download'))}</a></div>`;
    }

    async function load() {
        if (!(await RBRequireUser($('adminMsg'), { admin: true }))) return;
        $('adminMsg').hidden = true; $('apkBody').hidden = false;
        const box = $('apkCard');
        let releases = [];
        try {
            const r = await fetch('https://api.github.com/repos/alvarofranz/roadbook/releases?per_page=20');
            if (r.ok) releases = await r.json();
        } catch (e) { /* offline: fall through to the fallback card */ }
        const pick = (rel) => rel && (rel.assets || []).find((a) => /\.apk$/i.test(a.name || ''));
        const rolling = releases.find((r) => r.tag_name === 'apk-latest');
        const stable = releases.find((r) => !r.prerelease && !r.draft && pick(r));
        const cards = [];
        if (rolling && pick(rolling)) cards.push(card(0, t('apk.testBuild'), rolling, pick(rolling), await shaOf(rolling.assets)));
        if (stable && (!rolling || stable.id !== rolling.id)) cards.push(card(0, '', stable, pick(stable), await shaOf(stable.assets)));
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
