'use strict';
/* Admin · Public roadbooks moderation page. Lists every public roadbook with a force-private
 * control (the shared RBPublicRoadbooksList). Gated to admins. */
(function () {
    const $ = (id) => document.getElementById(id);
    (async function init() {
        if (!(await RBRequireUser($('adminMsg'), { admin: true }))) return;
        $('adminMsg').hidden = true; $('pubList').hidden = false;
        RBPublicRoadbooksList($('pubList'));
    })();
})();
