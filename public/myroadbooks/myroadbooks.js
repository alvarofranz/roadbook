'use strict';
/* My roadbooks — the signed-in user's saved roadbooks. The list itself (render +
 * duplicate/delete) is the shared RBRoadbookList helper in app.js, reused by the
 * Editor landing too. Requires a session; redirects to the account page otherwise. */
(function () {
    (async function init() {
        const cfg = await RBApi('config');
        if (!cfg.user) { location.href = RBLoginUrl(); return; } // sign in first, then come back here
        RBRoadbookList(document.getElementById('rbList'));
    })();
})();
