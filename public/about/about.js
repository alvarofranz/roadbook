'use strict';
/* About page — what this copy of RDBK.app IS (platform, the release it runs, the release
 * the server has). The release history lives on its own page (/changelog/). Everything
 * else on the page is static, translated markup. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;

    /* Platform · running · available: the same three answers as the App Info pop-up, straight on
     * the page, so nobody has to hunt through a menu for the version they are running. */
    async function paintApp() {
        const native = RBIsNativeApp();
        const [running, live, bundled] = await Promise.all([
            RBRunningRelease(), RBLiveVersion(), native ? RBLiveVersion(location.origin + '/') : null,
        ]);
        const rel = (r) => r ? 'v' + r.version + ' · build ' + r.build : '—';
        const fact = (label, value) => `<div class="fact"><span class="fact-key">${esc(t(label))}</span><span class="fact-value">${esc(value)}</span></div>`;
        // In the app the semver alone hides the drift: the binary carries the web content of the
        // day it was built, so name that build too and let the two be compared (#515).
        $('appFacts').innerHTML =
            fact('Platform', RBPlatformName())
            + fact('Running', running ? running.text : '—')
            + (native ? fact('Web content in this app', rel(bundled)) : '')
            + fact(native ? 'Latest web content' : 'Available', rel(live));
        const info = $('appInfoOpen');
        info.onclick = () => showAppInfo();
        info.hidden = false;
    }

    paintApp();
    // A language switch re-renders what the page built itself, translations included.
    window.addEventListener('rb-lang', () => { paintApp(); });
})();
