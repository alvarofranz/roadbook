'use strict';
/* Admin · Public roadbooks moderation page. Lists every public roadbook with a force-private
 * control (the shared RBPublicRoadbooksList). Gated to admins. */
(function () {
    const $ = (id) => document.getElementById(id);
    (async function init() {
        const cfg = await RBApi('config');
        if (!cfg.user) { $('adminMsg').innerHTML = `${RBesc(RBt('Sign in to continue.'))} <a href="../../account/">${RBesc(RBt('Sign in'))}</a>`; return; }
        if (!cfg.user.is_admin) { $('adminMsg').textContent = RBt('Admins only.'); return; }
        $('adminMsg').hidden = true; $('pubList').hidden = false;
        RBPublicRoadbooksList($('pubList'));
    })();
})();
