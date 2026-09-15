'use strict';
/* Admin user locations map (#499): every user who set a default map location, as pins.
 * Clicking a pin opens the user card (the edit dialog on the users page). */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, api = RBApi;

    (async function init() {
        if (!(await RBRequireUser($('adminMsg'), { admin: true }))) return;
        const r = await api('admin_user_locations', {});
        if (!r.ok) { $('adminMsg').textContent = r.error || t('Could not load.'); $('adminMsg').hidden = false; return; }
        const users = r.users || [];
        $('adminMsg').hidden = true; $('ulocBody').hidden = false;
        $('ulocCount').textContent = users.length ? `(${users.length})` : '';
        if (!users.length) { $('ulocMap').innerHTML = `<p class="muted">${esc(t('No locations yet.'))}</p>`; return; }
        if (!window.maplibregl) { $('ulocMap').innerHTML = `<p class="muted">${esc(t('Map not configured.'))}</p>`; return; }
        const hqMap = new RBMap('ulocMap', { zoom: 3, center: [12, 42] });
        if (!hqMap.map) return;
        const place = () => {
            users.forEach((u) => {
                const m = new maplibregl.Marker({ color: '#3a8dff' }).setLngLat([u.lon, u.lat]).addTo(hqMap.map);
                const pop = new maplibregl.Popup({ offset: 18, closeButton: false });
                pop.setHTML(`<div class="uloc-pop"><b>@${esc(u.username)}</b>${u.name ? `<br><span>${esc(u.name)}</span>` : ''}<br><a href="../?user=${u.id}">${esc(t('View user'))}</a></div>`);
                m.setPopup(pop);
            });
            const lons = users.map((u) => u.lon), lats = users.map((u) => u.lat);
            hqMap.map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60, maxZoom: 10 });
        };
        if (hqMap.ready) place(); else hqMap.map.on('load', place);
    })();
})();
