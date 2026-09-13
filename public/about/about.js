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
        const [running, live] = await Promise.all([RBRunningRelease(), RBLiveVersion()]);
        const fact = (label, value) => `<div class="fact"><span class="fact-key">${esc(t(label))}</span><span class="fact-value">${esc(value)}</span></div>`;
        $('appFacts').innerHTML =
            fact('Platform', RBPlatformName())
            + fact('Running', running ? running.text : '—')
            + fact(RBIsNativeApp() ? 'Latest web content' : 'Available', live ? 'v' + live.version + ' · build ' + live.build : '—');
        const info = $('appInfoOpen');
        info.onclick = () => showAppInfo();
        info.hidden = false;
    }

    paintApp();
    // A language switch re-renders what the page built itself, translations included.
    window.addEventListener('rb-lang', () => { paintApp(); });
})();
