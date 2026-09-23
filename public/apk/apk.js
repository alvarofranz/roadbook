'use strict';
/* Direct-APK page (#540 · #742 · #894): every versioned Android release, newest first, named by
 * its semver, resolved server-side (admin_apk_builds) so the page needs no CSP exception and never
 * hits the GitHub rate limit. Each says when it was built. Admins only. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, api = RBApi;

    function card(build) {
        const name = String(build.tag).replace(/^android-/, '');
        return `<section class="panel apk-build">
            <div class="head-row"><h2>RDBK ${esc(name)} · Android${build.prerelease ? ` <span class="u-badge">${esc(t('Pre-release'))}</span>` : ''}</h2>
                <a class="btn btn-primary" href="${esc(build.url)}"><i class="fa-solid fa-download"></i> ${esc(t('apk.download'))}</a></div>
            <div class="apk-meta"><i class="fa-regular fa-clock"></i> ${esc(t('Built'))} ${esc(RBFmtDateTime(build.built_at))} · ${RBFmtSize(build.size || 0)}${build.sha256 ? `<br>SHA-256: <code>${esc(build.sha256)}</code>` : ''}</div>
        </section>`;
    }

    async function load() {
        if (!(await RBRequireUser($('adminMsg'), { admin: true }))) return;
        $('adminMsg').hidden = true; $('apkBody').hidden = false;
        const box = $('apkCard');
        const j = await api('admin_apk_builds', {});
        if (!j.ok || !j.builds.length) {
            box.innerHTML = `<p class="muted">${esc(t(j.ok ? 'apk.noRelease' : (j.error || 'Could not load.')))}</p>`
                + `<div class="btnrow"><a class="btn btn-ghost" href="https://github.com/alvarofranz/roadbook/releases" target="_blank" rel="noopener"><i class="fa-brands fa-github"></i> GitHub releases</a></div>`;
            return;
        }
        box.innerHTML = j.builds.map(card).join('');
    }

    load();
    window.addEventListener('rb-lang', () => { load(); });
})();
