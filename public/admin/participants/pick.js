'use strict';
/* Participant picker: choose an event you manage, then go to its participants page. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast, api = RBApi;
    let events = [];

    function render() {
        $('ppList').innerHTML = events.length ? events.map((e) => `<div class="roadbook-row">
            <div class="meta"><b>${esc(e.title)}${e.ended ? ` <span class="u-badge u-blocked">${esc(t('Expired'))}</span>` : ''}</b><small>${esc(t(e.is_public ? 'Public' : 'Draft'))} · <i class="fa-solid fa-user icon-accent"></i> @${esc(e.organizer)} · ${e.participants} ${esc(t('participants'))}${RBDateRange(e.starts_on, e.ends_on) ? ' · ' + esc(RBDateRange(e.starts_on, e.ends_on)) : ''}</small></div>
            <a class="btn btn-ghost" href="../events/participants/?id=${e.id}" title="${esc(t('Participants'))}" aria-label="${esc(t('Participants'))}"><i class="fa-solid fa-users"></i> ${e.participants}</a>
        </div>`).join('') : `<p class="muted small">${esc(t('No events yet.'))}</p>`;
    }

    window.addEventListener('rb-lang', () => { if (events.length) render(); });

    (async function init() {
        const user = await RBRequireUser($('adminMsg'));
        if (!user) return;
        const r = await api('events_manage');
        events = (r.ok && r.events) || [];
        if (!user.is_admin && !user.is_organizer && !events.length) { $('adminMsg').textContent = t('Organizers only.'); return; }
        $('adminMsg').hidden = true; $('ppBody').hidden = false;
        render();
    })();
})();
