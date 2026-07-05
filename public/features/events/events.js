'use strict';
/* Organiser guide (/features/events/): the "getting the organiser role" box is for people who
 * can't create events yet. Once the visitor already manages events (admin, organiser, or a
 * co-organiser of some event), swap it for an "Organise an event" shortcut into Event management. */
(function () {
    RBApi('config').then((c) => {
        const u = c && c.user;
        if (!u || !(u.is_admin || u.is_organizer || u.manages_events)) return; // keep the request box
        const box = document.getElementById('evRoleBox');
        if (!box) return;
        box.innerHTML = '<i class="fa-solid fa-calendar-check" aria-hidden="true"></i>'
            + '<div><h3>' + RBesc(RBt('You have the organiser role')) + '</h3>'
            + '<a class="btn btn-primary ev-callout-cta" href="../../admin/events/">'
            + '<i class="fa-solid fa-calendar-check"></i> ' + RBesc(RBt('Organise an event')) + '</a></div>';
    }).catch(() => {});
})();
