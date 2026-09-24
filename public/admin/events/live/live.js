'use strict';
/* The organizers' live map (#947): where each participant is, while they navigate one of the
 * event's roadbooks and agreed to share it. Opened as live/?id=<event id>; only the event's
 * organizers (and admins) get anything — live_list checks. Polled every 10 s (no sockets), paused
 * while the tab is hidden; the event's roadbooks are drawn underneath. Each marker is the vehicle
 * number (or the username's initial), coloured by how fresh its position is (RB.liveFreshness). */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, api = RBApi;
    const id = +(new URLSearchParams(location.search).get('id') || 0);
    const POLL_MS = 10000;
    let map = null, markers = new Map(), fitted = false, rows = [];

    const ago = (s) => (s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : Math.round(s / 3600) + ' h');
    const pinText = (p) => p.team || (p.username || '?').charAt(0).toUpperCase();
    const who = (p) => '@' + p.username + (p.name ? ' · ' + p.name : '');
    const progress = (p) => `${p.reached}/${p.notes_total}` + (p.skipped ? ' · ' + t('{n} skipped').replace('{n}', p.skipped) : '');
    const state = (p) => RB.liveFreshness(p.age_s, p.stopped);
    function popupHTML(p) {
        return `<div class="live-pop"><b>${esc(who(p))}</b>${p.team ? `<br>${esc(t('Vehicle'))} ${esc(p.team)}` : ''}
            <br>${esc(p.roadbook)} · ${esc(t('Note'))} ${Math.min(p.note_idx + 1, p.notes_total)}/${p.notes_total}
            <br>${esc(t('Notes reached'))}: ${esc(progress(p))}
            ${p.speed != null ? `<br>${p.speed} km/h` : ''}
            <br>${esc(t(p.stopped ? 'Finished {t} ago' : 'Updated {t} ago').replace('{t}', ago(p.age_s)))}</div>`;
    }

    function paint() {
        $('liveCount').textContent = rows.length ? `(${rows.length})` : '';
        // the list, the most advanced first
        const sorted = rows.slice().sort((a, b) => (b.reached - a.reached) || (b.note_idx - a.note_idx) || (a.age_s - b.age_s));
        $('liveList').innerHTML = sorted.length ? sorted.map((p) => `<div class="live-row" data-user="${p.user_id}">
                <span class="live-pin ${state(p)}">${esc(pinText(p))}</span>
                <div class="meta"><b>${esc(who(p))}</b><div class="muted small">${esc(p.roadbook)} · ${esc(progress(p))}</div></div>
                <span class="muted small">${esc(ago(p.age_s))}</span>
            </div>`).join('') : `<p class="muted">${esc(t('Nobody is sharing a live position right now.'))}</p>`;
        $('liveList').querySelectorAll('[data-user]').forEach((el) => el.onclick = () => {
            const m = markers.get(+el.dataset.user);
            if (m && map) { map.map.easeTo({ center: m.getLngLat(), zoom: Math.max(map.map.getZoom(), 14) }); if (!m.getPopup().isOpen()) m.togglePopup(); }
        });
        if (!map || !map.ready) return;
        // the markers: moved in place, so an open popup stays open
        const seen = new Set();
        rows.forEach((p) => {
            seen.add(p.user_id);
            let m = markers.get(p.user_id);
            if (!m) {
                const el = document.createElement('div');
                m = new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).setPopup(new maplibregl.Popup({ offset: 18, closeButton: false })).addTo(map.map);
                markers.set(p.user_id, m);
            }
            const el = m.getElement(); // classList, never className: MapLibre keeps its own classes on it
            el.classList.remove('live', 'stale', 'lost', 'ended'); el.classList.add('live-pin', state(p));
            el.textContent = pinText(p);
            m.setLngLat([p.lon, p.lat]);
            m.getPopup().setHTML(popupHTML(p));
        });
        markers.forEach((m, uid) => { if (!seen.has(uid)) { m.remove(); markers.delete(uid); } });
        if (!fitted && rows.length) {
            fitted = true;
            const lons = rows.map((p) => p.lon), lats = rows.map((p) => p.lat);
            map.map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60, maxZoom: 14 });
        }
    }
    // the event's roadbooks, as thin lines under the participants
    function drawTracks(tracks) {
        const m = map.map, lines = tracks.filter((x) => x.line.length >= 2);
        if (!lines.length) return;
        m.addSource('live-tracks', { type: 'geojson', data: { type: 'FeatureCollection', features: lines.map((x) => ({ type: 'Feature', properties: { title: x.title }, geometry: { type: 'LineString', coordinates: x.line } })) } });
        m.addLayer({ id: 'live-tracks', type: 'line', source: 'live-tracks', paint: { 'line-color': RBCssVar('--track'), 'line-width': 3, 'line-opacity': 0.75 } });
        if (!rows.length) {
            const all = lines.flatMap((x) => x.line), lons = all.map((c) => c[0]), lats = all.map((c) => c[1]);
            m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 40 });
        }
    }

    async function poll(first) {
        if (document.hidden && !first) return;
        const r = await api('live_list', { event_id: id, tracks: first ? 1 : 0 });
        if (!r.ok) { if (first) { $('adminMsg').textContent = t(r.error || 'Could not load.'); $('adminMsg').hidden = false; } return; }
        rows = r.live || [];
        if (first) {
            $('adminMsg').hidden = true; $('liveBody').hidden = false;
            $('liveEventTitle').textContent = r.event.title;
            $('liveEditLink').href = '../edit/?id=' + id; $('liveEditLink').hidden = false;
            if (window.maplibregl) {
                map = new RBMap('liveMap', { zoom: 5, center: [12, 42] });
                const ready = () => { drawTracks(r.tracks || []); paint(); };
                if (map.map) { if (map.ready) ready(); else map.map.on('load', ready); }
            } else $('liveMap').innerHTML = `<p class="muted">${esc(t('Map not configured.'))}</p>`;
        }
        paint();
    }

    (async function init() {
        if (!(await RBRequireUser($('adminMsg')))) return;
        await poll(true);
        setInterval(() => poll(false), POLL_MS);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(false); });
    })();
})();
