'use strict';
/* About page — what this copy of RDBK.app IS (platform, the release it runs, the release
 * the server has). The release history lives on its own page (/changelog/). Everything
 * else on the page is static, translated markup. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;

    /* What this copy is and whether it is current: the same facts and status as the App Info
     * pop-up (RBReleaseFacts), straight on the page, so nobody hunts through a menu for them. */
    async function paintApp() {
        const { facts, status } = await RBReleaseFacts();
        const fact = ([label, value]) => `<div class="fact"><span class="fact-key">${esc(t(label))}</span><span class="fact-value">${esc(value)}</span></div>`;
        $('appFacts').innerHTML = RBReleaseStatusHTML(status) + facts.map(fact).join('');
        const info = $('appInfoOpen');
        info.onclick = () => showAppInfo();
        info.hidden = false;
    }

    paintApp();
    // A language switch re-renders what the page built itself, translations included.
    window.addEventListener('rb-lang', () => { paintApp(); });
})();
