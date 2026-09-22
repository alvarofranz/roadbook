'use strict';
/* Events console (#6): the list of events you manage — your own and the ones you co-organize
 * (#123); admins see every event. Creating and editing happen on the dedicated event page
 * (edit/?id=<id>), never in a popup. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, api = RBApi;
    let events = [], loadError = '';
    const errorText = (r) => t(r.error === 'Network error.' ? 'You are offline — reconnect to load this page.' : (r.error || 'Could not load.'));

    function render() {
        if (loadError) { $('evList').innerHTML = `<p class="muted">${esc(loadError)}</p>`; return; } // a failed load is not "No events yet" (#705)
        $('evList').innerHTML = events.length ? events.map((e) => `<div class="roadbook-row">
            <div class="meta"><b>${esc(e.title)}${e.ended ? ` <span class="u-badge u-blocked">${esc(t('Ended'))}</span>` : ''}</b><small>${esc(t(e.is_public ? 'Listed' : 'Unlisted'))} · <i class="fa-solid fa-user icon-accent"></i> @${esc(e.organizer)} · ${e.roadbooks} ${esc(t('roadbooks'))} · ${e.participants} ${esc(t('participants'))}${RBDateRange(e.starts_on, e.ends_on) ? ' · ' + esc(RBDateRange(e.starts_on, e.ends_on)) : ''}</small></div>
            ${e.is_public ? `<a class="btn btn-ghost" href="/event/${esc(e.slug)}" title="${esc(t('View'))}" aria-label="${esc(t('View'))}"><i class="fa-solid fa-eye"></i></a>` : ''}
            <a class="btn btn-ghost" href="participants/?id=${e.id}" title="${esc(t('Participants'))}" aria-label="${esc(t('Participants'))}"><i class="fa-solid fa-users"></i> ${e.participants}</a>
            <a class="btn btn-ghost" href="edit/?id=${e.id}" title="${esc(t('Edit'))}" aria-label="${esc(t('Edit'))}"><i class="fa-solid fa-pen"></i></a>
            ${e.is_owner ? `<button class="btn btn-ghost" data-del="${e.id}" title="${esc(t('Delete event'))}" aria-label="${esc(t('Delete event'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button>` : ''}
        </div>`).join('') : `<p class="muted small">${esc(t('No events yet.'))}</p>`;
        // deleting is the owner's (#600); the shared confirm says what goes with the event (#601)
        $('evList').querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
            if (await RBEventDelete(events.find((e) => e.id === +b.dataset.del))) load();
        });
    }

    async function load() {
        const r = await api('events_manage');
        events = (r.ok && r.events) || []; loadError = r.ok ? '' : errorText(r);
        render();
    }
    window.addEventListener('rb-lang', () => { if (events.length) render(); }); // re-format the dates in the new language

    (async function init() {
        const user = await RBRequireUser($('adminMsg'));
        if (!user) return;
        const r = await api('events_manage');
        events = (r.ok && r.events) || []; loadError = r.ok ? '' : errorText(r);
        // organizers and admins always get the console; a co-organizer gets it for their events
        if (!loadError && !user.is_admin && !user.is_organizer && !events.length) { $('adminMsg').textContent = t('Organizers only.'); return; }
        $('adminMsg').hidden = true; $('evBody').hidden = false;
        $('evNew').hidden = !(user.is_admin || user.is_organizer); // creating needs the organizer role
        render();
    })();
})();
