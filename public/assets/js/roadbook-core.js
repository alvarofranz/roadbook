/* roadbook-core.js — library shared by ALL the tools.
 * Data model (roadbook JSON), geo math, GPX/WPT parsing, roadbook building,
 * metric recomputation and the scoring constants the Reader and Ranking share.
 * The browser uses the global window.RB; Node (the test runner) imports the same
 * object via module.exports — see the export at the bottom of the file. */
(function () {
    'use strict';

    const EARTH_RADIUS_M = 6371000;

    /* ---------------- geo ---------------- */
    const toRad = (d) => d * Math.PI / 180;
    const toDeg = (r) => r * 180 / Math.PI;
    const normDeg = (d) => ((d % 360) + 360) % 360;

    function haversineM(a, b) {
        const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
        const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
        return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
    }
    // compass bearing a→b, degrees [0,360), 0=N 90=E
    function bearingDeg(a, b) {
        const φ1 = toRad(a.lat), φ2 = toRad(b.lat), Δλ = toRad(b.lon - a.lon);
        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
        return normDeg(toDeg(Math.atan2(y, x)));
    }
    // destination point from (lat,lon) heading `heading` degrees for distM metres
    function destPoint(lat, lon, heading, distM) {
        const δ = distM / EARTH_RADIUS_M, θ = toRad(heading), φ1 = toRad(lat), λ1 = toRad(lon);
        const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
        const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
        return { lat: toDeg(φ2), lon: ((toDeg(λ2) + 540) % 360) - 180 };
    }

    /* ---------------- road types ---------------- */
    // width: stroke width in vignette reference units — indicative of the road
    // type (motorway widest, off-piste thinnest).
    const ROAD_TYPES = [
        { id: 0, color: '#9aa4b2', width: 5, dashed: false }, // default
        { id: 1, color: '#3b82f6', width: 9, dashed: false }, // motorway
        { id: 2, color: '#22c55e', width: 7, dashed: false }, // asphalt
        { id: 3, color: '#ff5a45', width: 5, dashed: false }, // track
        { id: 4, color: '#ff5a45', width: 4, dashed: true },  // off-piste
    ];

    /* A roadbook's publication lifecycle (#96): draft (in progress, private) → ready
       (done, private) → public (visible to anyone). The DB `status` column mirrors this
       list; the client builds its status controls from it. Unknown values fall back to
       'draft' — the same normalisation the API does server-side. */
    const ROADBOOK_STATUSES = ['draft', 'ready', 'public'];
    const roadbookStatus = (s) => ROADBOOK_STATUSES.includes(s) ? s : 'draft';

    /* ---------------- waypoint types (FIA characterization, #63) ----------------
       One optional per-note `wp_type`, profile-scoped in the editor (`tier`: core shows in
       every roadbook, rally only when meta.profile === 'rally'). A "zone" is a start note +
       an end note — there is no zones[] structure. `cap` is the badge acronym (or `glyph` for
       the flag markers); `color` follows the FIA roadbook convention (orange = zone start,
       green = zone end/finish, yellow = control). `radius` is the default validation radius
       (metres) prefilled in the editor. `sym`/`osm` map the type to a Garmin <sym> / OSMAnd
       icon so the type carries into the GPX export. Verified against the FIA Road Book Lexicon
       (Appendix III, 2026). */
    const WP_TYPES = [
        // core tier — offered in every roadbook
        { id: 'start',    tier: 'core',  cap: 'ST',  name: 'Start',  color: '#57bb63', sym: 'Flag, Green',     osm: 'special_flag_start' },
        { id: 'finish',   tier: 'core',  cap: 'FIN', name: 'Finish', color: '#111111', sym: 'Flag, Checkered', osm: 'special_flag_finish' },
        { id: 'ss_start', tier: 'core',  cap: 'DSS', name: 'Selective section start', color: '#ee9a3c', sym: 'Flag, Green',     osm: 'special_flag_start' },
        { id: 'ss_end',   tier: 'core',  cap: 'ASS', name: 'Selective section end',   color: '#57bb63', sym: 'Flag, Checkered', osm: 'special_flag_finish' },
        // rally tier — FIA waypoint types (radius-bearing)
        { id: 'navigation', tier: 'rally', cap: 'WPN', name: 'Navigation WP', color: '#3a8dff', radius: 90,  sym: 'Waypoint',      osm: 'special_point' },
        { id: 'masked',     tier: 'rally', cap: 'WPM', name: 'Masked WP',     color: '#a855f7', radius: 200, sym: 'Flag, Blue',    osm: 'special_marker' },
        { id: 'eclipse',    tier: 'rally', cap: 'WPE', name: 'Eclipse WP',    color: '#6366f1', radius: 200, sym: 'Flag, Blue',    osm: 'special_marker' },
        { id: 'control',    tier: 'rally', cap: 'WPC', name: 'Control WP',    color: '#22c55e', radius: 90,  sym: 'Circle, Green', osm: 'special_point' },
        { id: 'security',   tier: 'rally', cap: 'WPS', name: 'Security WP',   color: '#ff5a45', radius: 90,  sym: 'Circle, Red',   osm: 'special_marker' },
        { id: 'precise',    tier: 'rally', cap: 'WPP', name: 'Precise WP',    color: '#e8b059', radius: 30,  sym: 'Waypoint',      osm: 'special_point' },
        { id: 'visible',    tier: 'rally', cap: 'WPV', name: 'Visible WP',    color: '#2dd4bf', radius: 200, sym: 'Waypoint',      osm: 'special_point' },
        // rally tier — zone boundaries (start = orange · end = green)
        { id: 'dz', tier: 'rally', cap: 'DZ', name: 'Difficult-overtaking zone start', color: '#ee9a3c', sym: 'Flag, Red',   osm: 'special_marker' },
        { id: 'fz', tier: 'rally', cap: 'FZ', name: 'Difficult-overtaking zone end',   color: '#57bb63', sym: 'Flag, Green', osm: 'special_point' },
        { id: 'dn', tier: 'rally', cap: 'DN', name: 'Neutralisation start', color: '#ee9a3c', sym: 'Flag, Red',   osm: 'special_marker' },
        { id: 'fn', tier: 'rally', cap: 'FN', name: 'Neutralisation end',   color: '#57bb63', sym: 'Flag, Green', osm: 'special_point' },
        { id: 'dt', tier: 'rally', cap: 'DT', name: 'Transfer start', color: '#ee9a3c', sym: 'Flag, Red',   osm: 'special_marker' },
        { id: 'ft', tier: 'rally', cap: 'FT', name: 'Transfer end',   color: '#57bb63', sym: 'Flag, Green', osm: 'special_point' },
        // rally tier — point controls (yellow)
        { id: 'cp',   tier: 'rally', cap: 'CP',   name: 'Check point',      color: '#f5c518', sym: 'Circle, Red', osm: 'special_point' },
        { id: 'pc',   tier: 'rally', cap: 'PC',   name: 'Passage control',  color: '#f5c518', sym: 'Circle, Red', osm: 'special_point' },
        { id: 'stop', tier: 'rally', cap: 'STOP', name: 'Stop',             color: '#ff5a45', sym: 'Stop',        osm: 'special_marker' },
    ];
    const WP_TYPE_BY_ID = {}; WP_TYPES.forEach((w) => { WP_TYPE_BY_ID[w.id] = w; });
    // Look up a type by id (null when unset/unknown). The badge label is its acronym or glyph.
    function wpType(id) { return (id && WP_TYPE_BY_ID[id]) || null; }
    // The types offered for a roadbook profile: core always; rally adds the full FIA set.
    function wpTypesForProfile(profile) { return WP_TYPES.filter((w) => w.tier === 'core' || profile === 'rally'); }
    // The geofence radius (metres) for auto-validating a note. Precedence: the note's own
    // wp_radius → the roadbook default → the type's default → the system default. The Reader
    // still caps this by neighbour spacing and floors it for GPS noise.
    function detectionRadius(note, meta) {
        if (note && note.wp_radius != null) return note.wp_radius;
        if (meta && meta.default_wp_radius != null) return meta.default_wp_radius;
        const w = note && wpType(note.wp_type);
        if (w && w.radius != null) return w.radius;
        return CONST.REACH_DEFAULT_M;
    }
    // Dark or light ink for legible text on a solid colour fill (perceived luminance).
    function textInk(hex) {
        const c = String(hex).replace('#', '');
        const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#14100a' : '#fff';
    }
    // A self-contained SVG roundel for a waypoint type (solid colour + acronym) — the shared
    // badge drawn identically in the editor selector and the Reader row. '' when unset/unknown.
    function wpBadgeSVG(id, size) {
        const w = wpType(id); if (!w) return '';
        size = size || 26;
        const label = w.cap || '';
        const fs = label.length >= 4 ? size * 0.34 : label.length === 3 ? size * 0.40 : size * 0.46;
        const c = size / 2;
        // Double ring so the badge is legible on ANY background — a white halo pops a dark badge on
        // a dark menu, a dark hairline pops a light badge on white paper.
        return `<svg class="wp-badge" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}">`
            + `<circle cx="${c}" cy="${c}" r="${c - 1}" fill="#fff"/>`
            + `<circle cx="${c}" cy="${c}" r="${c - 2}" fill="${w.color}" stroke="rgba(0,0,0,.35)" stroke-width="1"/>`
            + `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-weight="800" font-size="${fs.toFixed(1)}" fill="${textInk(w.color)}">${label}</text></svg>`;
    }

    /* ---------------- scoring constants (Reader and Ranking must agree) ---------------- */
    const CONST = {
        MANUAL_RADIUS_M: 100, MIN_DISP_M: 5, REACH_DEFAULT_M: 30,
        P_SKIP: 450, P_SPEED_PER_KMH: 10, // accuracy/cap/extra = 1 pt/m
        REG_GRACE_S: 59,
        META_WIDTHS: [3, 6, 6, 6, 4, 4, 4, 4, 4, 5, 3],
    };

    /* ---------------- GPX parsing ---------------- */
    function parseGPX(text) {
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        if (doc.querySelector('parsererror')) throw new Error('Invalid GPX (malformed XML).');
        const name = (doc.querySelector('trk > name, metadata > name')?.textContent || '').trim();

        const trkpts = [];
        doc.querySelectorAll('trkpt').forEach((p) => {
            const lat = parseFloat(p.getAttribute('lat')), lon = parseFloat(p.getAttribute('lon'));
            if (isFinite(lat) && isFinite(lon)) {
                const ele = parseFloat(p.querySelector('ele')?.textContent);
                const t = Date.parse(p.querySelector('time')?.textContent || ''); // GPX ISO 8601 → epoch ms
                trkpts.push({
                    lat, lon,
                    ele: isFinite(ele) ? ele : null,
                    t: isFinite(t) ? t : null, // fix time, one name + unit across the pipeline (epoch ms)
                    cmt: (p.querySelector('cmt')?.textContent || '').trim() || null,
                });
            }
        });

        // waypoints: <wpt>, or any <trkpt> whose <cmt> starts with "wpt"
        const wpts = [];
        doc.querySelectorAll('wpt').forEach((w) => {
            const lat = parseFloat(w.getAttribute('lat')), lon = parseFloat(w.getAttribute('lon'));
            if (isFinite(lat) && isFinite(lon)) {
                const nm = (w.querySelector('name')?.textContent || '').trim();
                const sym = (w.querySelector('sym')?.textContent || '').trim();
                const all = [...w.getElementsByTagName('*')];
                // OSMAnd icon/colour live in <osmand:icon>/<osmand:color>; match the qualified
                // name first (parser-independent), then fall back to prefix/namespace.
                const osmand = (local) => all.find((e) => e.nodeName === 'osmand:' + local
                    || (e.localName === local && (e.prefix === 'osmand' || /osmand/i.test(e.namespaceURI || ''))))?.textContent;
                const r = appwptFromImport(sym, osmand('icon'), osmand('color'));
                const wt = Date.parse(w.querySelector('time')?.textContent || '');
                wpts.push({ lat, lon, name: nm, num: numFromName(nm), t: isFinite(wt) ? wt : null, icon: r.icon || null, danger: r.danger || null, appwpt: r.appwpt || null });
            }
        });
        if (!wpts.length) {
            trkpts.forEach((p) => {
                if (p.cmt && /^wpt/i.test(p.cmt)) wpts.push({ lat: p.lat, lon: p.lon, name: p.cmt, num: numFromName(p.cmt), t: p.t }); // a cmt-flagged trackpoint keeps its own time
            });
        }
        return { name, trkpts, wpts };
    }
    function numFromName(s) {
        const m = String(s || '').match(/(\d+)/);
        return m ? parseInt(m[1], 10) : null;
    }

    // OpenRally GPX import (github.com/openrally/openrally): GPX 1.1 + openrally: extensions.
    // Each <wpt> becomes a note (distance·cap·danger·tulip). The tulip is an opaque drawing →
    // imported as ONE full-box icon (it can't be decomposed into RDBK icons/junctions).
    // Three geometry cases: a real <trk>; else real <wpt> coords → a track through them; else a
    // distance-only roadbook (the official example: wpts at 0,0 with only a distance) → a
    // placeholder line spaced by openrally:distance, flagged so the author re-draws it on the
    // map. Returns { rb, warnings }. Needs a DOMParser (browser), like parseGPX.
    const OPENRALLY_NS = 'http://www.openrally.org/xmlschemas/GpxExtensions/v1.0.3';
    function parseOpenRally(text) {
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        if (doc.querySelector('parsererror')) throw new Error('Invalid GPX (malformed XML).');
        const orFirst = (el, local) => el.getElementsByTagNameNS(OPENRALLY_NS, local)[0] || null;
        const orNum = (el, local) => { const n = orFirst(el, local); const v = n ? parseFloat(n.textContent) : NaN; return isFinite(v) ? v : null; };
        // Capture every openrally: child of a <wpt>'s <extensions> EXCEPT distance/tulip (both
        // regenerated on export) — wp types, zones, speed, show_coordinates, notes, … — so the
        // full set of OpenRally parameters round-trips verbatim through import → save → export.
        const captureOr = (w) => {
            const ext = w.getElementsByTagName('extensions')[0]; if (!ext) return [];
            const out = [];
            Array.from(ext.childNodes).forEach((c) => {
                if (c.nodeType !== 1 || c.namespaceURI !== OPENRALLY_NS || c.localName === 'distance' || c.localName === 'tulip') return;
                const attrs = {}; Array.from(c.attributes).forEach((a) => { attrs[a.localName] = a.value; });
                out.push({ tag: c.localName, attrs, text: (c.textContent || '').trim() });
            });
            return out;
        };
        const tulipToDataURL = (s) => {
            s = String(s || '').trim(); if (!s) return null;
            if (/^data:/i.test(s)) return s;
            if (/<svg[\s>]/i.test(s) || /^<\?xml/i.test(s)) return 'data:image/svg+xml,' + encodeURIComponent(s);
            return 'data:image/png;base64,' + s.replace(/\s+/g, ''); // otherwise assume a base64 PNG
        };

        const name = (doc.querySelector('metadata > name, trk > name')?.textContent || '').trim() || 'OpenRally roadbook';
        const trkpts = [];
        doc.querySelectorAll('trkpt').forEach((p) => {
            const lat = parseFloat(p.getAttribute('lat')), lon = parseFloat(p.getAttribute('lon'));
            if (isFinite(lat) && isFinite(lon)) { const ele = parseFloat(p.querySelector('ele')?.textContent); trkpts.push({ lat, lon, ele: isFinite(ele) ? ele : null }); }
        });
        const raws = [];
        doc.querySelectorAll('wpt').forEach((w) => {
            const lat = parseFloat(w.getAttribute('lat')), lon = parseFloat(w.getAttribute('lon'));
            const tulipEl = orFirst(w, 'tulip');
            const distKm = orNum(w, 'distance');
            raws.push({
                lat, lon, distM: distKm != null ? Math.round(distKm * 1000) : null,
                cap: orNum(w, 'cap'), danger: orNum(w, 'danger'),
                tulip: tulipEl ? (tulipEl.getAttribute('href') || tulipEl.textContent || '') : '',
                name: (w.querySelector('name')?.textContent || '').trim(),
                or: captureOr(w),
            });
        });
        if (!raws.length) throw new Error('No OpenRally waypoints found.');

        const warnings = [];
        const realCoords = (r) => isFinite(r.lat) && isFinite(r.lon) && !(r.lat === 0 && r.lon === 0);
        let track, idxOf;
        if (trkpts.length >= 2) {
            track = trkpts;
            const cum = cumulativeM(track);
            const nearestByDist = (distM) => { if (distM == null) return 0; let best = 0, bd = Infinity; cum.forEach((c, i) => { const d = Math.abs(c - distM); if (d < bd) { bd = d; best = i; } }); return best; };
            idxOf = (r) => realCoords(r) ? nearestIdx(track, r) : nearestByDist(r.distM);
        } else if (raws.some(realCoords)) {
            track = raws.map((r) => ({ lat: r.lat, lon: r.lon, ele: null }));
            idxOf = (r, i) => i;
            warnings.push('builtTrackFromWaypoints');
        } else {
            // distance-only: a placeholder line east of (0,0) spaced by cumulative distance (~m → lon°)
            let prev = -1;
            const dists = raws.map((r) => { let d = r.distM == null ? prev + 1 : r.distM; if (d <= prev) d = prev + 1; prev = d; return d; });
            track = dists.map((d) => ({ lat: 0, lon: d / 111320, ele: null }));
            idxOf = (r, i) => i;
            warnings.push('placeholderTrack');
        }

        const icons = {};
        const notes = raws.map((r, i) => {
            const note = {
                num: i + 1, idx: idxOf(r, i), lat: r.lat, lon: r.lon,
                distance: r.distM != null ? r.distM : 0, partial_distance: 0,
                text: wptText({ name: r.name }),
                cap: r.cap != null ? Math.round(r.cap) : null, cap_distance: null,
                bearing_in: 0, bearing_out: 0, road_type_in: 0, road_type_out: 0,
                icons: [], junctions: null,
            };
            if (r.danger >= 1 && r.danger <= 3) note.danger = Math.round(r.danger);
            const orPass = r.or.filter((e) => {
                if (e.tag === 'wptType') { if (wpType(e.text)) note.wp_type = e.text; return false; }
                return true;
            });
            if (orPass.length) note.openrally = orPass;
            const t = tulipToDataURL(r.tulip);
            // The tulip is the whole vignette → a `cover` icon (NoteCanvas renders it full-box, alone).
            if (t) { const key = 'tulip-' + (i + 1) + (/^data:image\/png/i.test(t) ? '.png' : '.svg'); icons[key] = t; note.icons.push({ name: key, cover: true }); }
            return note;
        });

        const rb = { meta: { title: name }, track, notes, icons };
        recomputeMetrics(rb); // fills num/idx/lat/lon/distance/partial/bearings/road_type from the track; leaves cap (OpenRally-authored) untouched — no recomputeCaps
        return { rb, warnings };
    }
    // A waypoint's name (street, landmark…) is real content and becomes the note
    // text; auto-generated labels (wptN / start / end / bare numbers) do not.
    function wptText(w) {
        if (typeof w.text === 'string' && w.text) return w.text;
        const name = String(w.name || '').trim();
        return /^(wpt\s*\d*|start|end|\d+)$/i.test(name) ? '' : name;
    }
    // Garmin .wpt: "W <name> ... lat lon" lines with N/S/E/W/O hemisphere letters
    function parseWPT(text) {
        const out = [];
        text.split(/\r?\n/).forEach((line) => {
            if (!/^W/i.test(line)) return;
            const nums = line.match(/[-+]?\d+\.\d+/g);
            if (!nums || nums.length < 2) return;
            let lat = parseFloat(nums[nums.length - 2]), lon = parseFloat(nums[nums.length - 1]);
            // Hemisphere letters sit with the coordinates; strip the leading "W <name>"
            // record marker first so the record-type "W" is never read as West longitude.
            const coords = line.replace(/^\s*W\s+\S+/i, '');
            if (/\bS\b/.test(coords)) lat = -Math.abs(lat);
            if (/\b[WO]\b/.test(coords)) lon = -Math.abs(lon);
            const nm = (line.split(/\s+/)[1] || '').trim();
            out.push({ lat, lon, name: nm, num: numFromName(nm) });
        });
        return out;
    }

    /* ---------------- roadbook building ---------------- */
    function nearestIdx(trkpts, pt) {
        let best = 0, bd = Infinity;
        for (let i = 0; i < trkpts.length; i++) {
            const d = haversineM(trkpts[i], pt);
            if (d < bd) { bd = d; best = i; }
        }
        return best;
    }
    // The track index of the point closest in TIME to `t` (epoch ms). Only meaningful when the
    // track carries per-point times — used to place a waypoint on a self-crossing route, where
    // "nearest in space" is ambiguous but "nearest in time" is not (#158).
    function nearestIdxByTime(trkpts, t) {
        let best = 0, bd = Infinity;
        for (let i = 0; i < trkpts.length; i++) {
            if (trkpts[i].t == null) continue;
            const d = Math.abs(trkpts[i].t - t);
            if (d < bd) { bd = d; best = i; }
        }
        return best;
    }
    // Resolve a waypoint's track index: by TIME when both the waypoint and the track carry a
    // timestamp (robust on loops/out-and-backs), otherwise by nearest position. One rule, reused
    // by buildRoadbook and the Editor's waypoint snap.
    const trackHasTime = (trkpts) => trkpts.some((p) => p.t != null);
    function resolveIdx(trkpts, pt) {
        return (pt.t != null && trackHasTime(trkpts)) ? nearestIdxByTime(trkpts, pt.t) : nearestIdx(trkpts, pt);
    }
    // Cumulative distance in METRES at each track point.
    function cumulativeM(trkpts) {
        const cum = [0];
        for (let i = 1; i < trkpts.length; i++) cum[i] = cum[i - 1] + haversineM(trkpts[i - 1], trkpts[i]);
        return cum;
    }
    // A note's bearings at track index `idx`: in = from the previous point (falling back to the
    // outgoing one at the track start), out = to the next point (falling back to in at the end).
    function deriveBearings(trkpts, idx) {
        const tp = trkpts[idx];
        const bIn = idx > 0 ? bearingDeg(trkpts[idx - 1], tp) : (idx < trkpts.length - 1 ? bearingDeg(tp, trkpts[idx + 1]) : 0);
        const bOut = idx < trkpts.length - 1 ? bearingDeg(tp, trkpts[idx + 1]) : bIn;
        return { bIn, bOut };
    }
    // Live-recording intake (Recorder · the Editor's record/adjust · the GPX logger): a fix
    // worse than 35 m is junk; the sampling step scales with the accuracy — dense detail with
    // a good fix, no jitter with a weak one.
    const recJunkFix = (acc) => acc != null && acc > 35;
    const recStepM = (acc) => Math.max(2.5, (acc || 10) * 0.35);

    // Build the roadbook JSON from a track + waypoints.
    function buildRoadbook({ name, trkpts, wpts }) {
        if (!trkpts || trkpts.length < 2) throw new Error('The GPX track has too few points.');
        const cum = cumulativeM(trkpts);
        const totalM = cum[cum.length - 1];

        // guarantee a start note and an end note
        const pts = (wpts && wpts.length) ? wpts.slice() : [];
        const hasStart = pts.some((w) => resolveIdx(trkpts, w) === 0);
        const hasEnd = pts.some((w) => resolveIdx(trkpts, w) === trkpts.length - 1);
        if (!hasStart) pts.push({ lat: trkpts[0].lat, lon: trkpts[0].lon, name: 'start', num: 0 });
        if (!hasEnd) pts.push({ lat: trkpts[trkpts.length - 1].lat, lon: trkpts[trkpts.length - 1].lon, name: 'end', num: 9999 });

        // resolve each waypoint's track index (by time when available) and order along the track
        const withIdx = pts.map((w) => ({ ...w, idx: resolveIdx(trkpts, w) }))
            .sort((a, b) => a.idx - b.idx)
            .filter((w, i, arr) => i === 0 || w.idx !== arr[i - 1].idx); // dedup by idx

        const notes = withIdx.map((w, i) => {
            const idx = w.idx;
            const prevIdx = i > 0 ? withIdx[i - 1].idx : null;
            const tp = trkpts[idx];
            const { bIn, bOut } = deriveBearings(trkpts, idx);
            const note = {
                num: i + 1, idx,
                distance: Math.round(cum[idx]),
                partial_distance: Math.round(prevIdx == null ? 0 : Math.max(0, cum[idx] - cum[prevIdx])),
                lat: round6(tp.lat), lon: round6(tp.lon),
                text: wptText(w),
                cap: null, cap_distance: null,
                bearing_in: round3(bIn), bearing_out: round3(bOut),
                road_type_in: 3, road_type_out: 3, // track by default
                junctions: null,
                icons: w.icon ? [{ name: w.icon, pos: [0, 0], angle: 0, size: 40, flip_x: false }] : [],
            };
            if (w.danger) note.danger = w.danger;       // recovered from an imported special_marker
            if (w.appwpt) note.appwpt = w.appwpt;        // unmapped Garmin/OSMAnd icon, re-emitted verbatim
            return note;
        });

        return {
            meta: { title: name || 'roadbook', total_distance: Math.round(totalM), note_count: notes.length },
            track: trkpts.map((p) => {
                const tp = { lat: round6(p.lat), lon: round6(p.lon) };
                if (p.ele != null && isFinite(p.ele)) tp.ele = Math.round(p.ele);
                if (p.t != null && isFinite(p.t)) tp.t = p.t; // optional per-point time (epoch ms), preserved from the recording/GPX
                return tp;
            }),
            notes,
        };
    }

    // Import a just-loaded roadbook into the canonical schema. RDBK's pre-standard files
    // used Italian field names (titolo / km_totali / testo); we deliberately keep opening
    // them, so this is a permanent, intentional importer — not back-compat cruft. It renames
    // those keys to the English standard and drops the originals, then fills in the structural
    // defaults (meta, icons, per-note junctions) a hand-made or foreign file may omit.
    // Idempotent: a file already in the standard shape passes through unchanged.
    // Roadbook Suite pictograms that map 1:1 to a differently-named palette icon.
    // Speed-limit signs (S0x_*km / S99_end) are handled by rule in the loop below: the
    // suite ships them as PNG, the palette as SVG. Names with no palette equivalent at
    // all (p24_cassonetto, the generic *_icona placeholders, …) are left untouched and
    // flagged in the Editor instead. See docs/editor.md §9.5.
    const SUITE_ICON_ALIASES = {
        'p36_gruppo_case.png': 'P02_gruppo_case.png',
        'p14_lago.png': 'P14_estanque.png',
        // traffic signs: the suite's S10/S11/S12/S19/S20 numbering is unrelated to the
        // palette's S-series (speed limits), so these are mapped by meaning, not number.
        's10_stop.png': 'B02_stop.svg',
        's11_precedenza.png': 'B01_give_way.svg',
        's12_divieto_passaggio.png': 'C01_no_entry.svg',
        's14_strettoia.png': 'W07_road_narrows.svg',
        's15_curva_pericolosa_dx.png': 'W01_curve_right.svg',
        's16_curva_pericolosa_sx.png': 'W02_curve_left.svg',
        's17_sdrucciolevole.png': 'W11_slippery_road.svg',
        's18_frana.png': 'W13_falling_rocks.svg',
        's19_pericolo_generico.png': 'W28_general_danger.svg',
        's20_rotatoria.png': 'D06_roundabout.svg',
        's20_strada_tortuosa.png': 'W03_double_curve_right.svg',
        's21_attraversamanto_senza_barriere.png': 'W24_level_crossing.svg',
        's24_attenzione.png': 'W28_general_danger.svg',
        's25_trattori.png': 'W27_agricultural_vehicles.svg',
    };
    // Normalize a roadbook into the canonical .rdbk schema in place. Besides the
    // structural defaults, this is where pre-standard files exported by Roadbook
    // Suite (Italian keys, km units, `bivio` junctions, +y-down geometry) are
    // translated — so they open identically in the Editor and the Reader. Each legacy
    // key is mapped by presence and then dropped, leaving a clean canonical object.
    function importRoadbook(rb) {
        const meta = rb.meta || (rb.meta = {});
        // A Roadbook Suite file is detected by any of its legacy markers; only then do
        // we apply suite-specific conversions (axis flip, metric recompute) so canonical
        // .rdbk files are never touched.
        const suite = meta.titolo != null || meta.km_totali != null ||
            (rb.notes || []).some((n) => 'testo' in n || 'bivio' in n || 'cap_hdr' in n || 'km_prog' in n || 'km_parz' in n);
        if (meta.titolo != null) meta.title ??= meta.titolo;
        if (meta.km_totali != null && isFinite(parseFloat(meta.km_totali))) meta.total_distance ??= Math.round(parseFloat(meta.km_totali) * 1000);
        delete meta.titolo; delete meta.km_totali;
        delete meta.logo_path; // server-side path from the suite — not embeddable, not part of the format
        rb.notes = (rb.notes || []).map((n) => {
            if ('testo' in n) { n.text ??= n.testo; delete n.testo; }
            if ('km_prog' in n) { n.distance ??= Math.round((n.km_prog || 0) * 1000); delete n.km_prog; }
            if ('km_parz' in n) { n.partial_distance ??= Math.round((n.km_parz || 0) * 1000); delete n.km_parz; }
            if ('cap_hdr' in n) { n.cap ??= (n.cap_hdr == null ? null : Math.round(n.cap_hdr)); delete n.cap_hdr; }
            if ('cap_km' in n) { n.cap_distance ??= (n.cap_km == null ? null : Math.round(n.cap_km * 1000)); delete n.cap_km; }
            delete n.cap_small; delete n.hide_cap_btm; // suite-only CAP display fields, no canonical equivalent
            // bivio[] {punta, th, rt} → junctions[] {tip, width, road_type}; suite y is
            // screen-down, the vignette box is +y-up, so the y of every vector is flipped.
            if ('bivio' in n) {
                if (n.junctions == null) n.junctions = Array.isArray(n.bivio)
                    ? n.bivio.map((b) => ({ pivot: [b.pivot[0], -b.pivot[1]], tip: [b.punta[0], -b.punta[1]], width: b.th, road_type: b.rt }))
                    : null;
                delete n.bivio;
            }
            if (n.junctions === undefined) n.junctions = null;
            (n.icons || []).forEach((ic) => { // pre-standard icon keys: file (path) / flipX → name / flip_x
                if (ic.name == null && ic.file) ic.name = String(ic.file).split('/').pop();
                if ('flipX' in ic) { ic.flip_x ??= !!ic.flipX; delete ic.flipX; }
                delete ic.file;
                if (suite && Array.isArray(ic.pos) && typeof ic.pos[0] === 'number' && typeof ic.pos[1] === 'number') {
                    // suite anchors a symbol at its TOP-LEFT corner in a +y-down box; RDBK centers it
                    // in a +y-up box — so flip y and shift the anchor to the centre (half a symbol).
                    const half = (typeof ic.size === 'number' ? ic.size : 32) / 2;
                    ic.pos = [ic.pos[0] + half, -ic.pos[1] - half];
                }
                if (suite && typeof ic.size === 'number') { // suite symbols import a touch small; start/finish markers want extra presence
                    const startFinish = ['i01_arrivo.png', 'i02_partenza.png'].includes((ic.name || '').toLowerCase());
                    ic.size = Math.min(120, Math.round(ic.size * (startFinish ? 3 : 1.5)));
                }
                if (ic.name) { // Roadbook Suite icon names → standard palette (safe 1:1 only)
                    if (/^S0\d_\d{1,3}km\.png$/i.test(ic.name) || /^S99_end\.png$/i.test(ic.name)) ic.name = ic.name.replace(/\.png$/i, '.svg');
                    else if (SUITE_ICON_ALIASES[ic.name.toLowerCase()]) ic.name = SUITE_ICON_ALIASES[ic.name.toLowerCase()];
                }
            });
            return n;
        });
        rb.icons = rb.icons || {};
        // The suite's bearings use a different reference (e.g. the start note's bogus
        // bearing_in points the trunk arrow backwards); the track is authoritative, so
        // re-derive bearings/distances/road-types from it — exactly as buildRoadbook does.
        if (suite && Array.isArray(rb.track) && rb.track.length >= 2) recomputeMetrics(rb);
        // #94: a note carrying a speed-limit sign is a speed-controlled zone. Surface the limit as
        // the declarative field and tag the note as a zone start/end (DZ / FZ) — only filling gaps,
        // so a file that already declares speed_limit / wp_type is left untouched.
        rb.notes.forEach((n) => {
            let sp = null;
            (n.icons || []).forEach((ic) => { const v = speedLimitFromName((ic.name || '').split('/').pop()); if (v != null) sp = v; });
            if (sp != null) {
                if (n.speed_limit == null) n.speed_limit = sp;
                if (n.wp_type == null) n.wp_type = sp === 0 ? 'fz' : 'dz';
            }
        });
        return rb;
    }

    /* ---------------- metric recomputation (after edit/splice) ---------------- */
    // The road you ARRIVE on at a note is the road the previous note LEAVES on, so
    // road_type_in is always derived from the previous note's road_type_out (the
    // first note has no predecessor, so it arrives on the road it leaves on). Only
    // road_type_out is authored per note — the road simply continues until a note
    // changes it. Run after every edit so the invariant always holds.
    function normalizeRoadTypes(rb) {
        rb.notes.forEach((n, i) => { n.road_type_in = i > 0 ? rb.notes[i - 1].road_type_out : n.road_type_out; });
        return rb;
    }
    // Recomputes num, clamped idx, lat/lon, distance/partial_distance and bearings from the track.
    function recomputeMetrics(rb) {
        const cum = cumulativeM(rb.track);
        rb.notes.sort((a, b) => a.idx - b.idx);
        rb.notes.forEach((n, i) => {
            n.num = i + 1;
            const idx = Math.max(0, Math.min(rb.track.length - 1, n.idx | 0));
            n.idx = idx;
            const tp = rb.track[idx];
            n.lat = round6(tp.lat); n.lon = round6(tp.lon);
            n.distance = Math.round(cum[idx]);
            n.partial_distance = Math.round(i === 0 ? 0 : Math.max(0, cum[idx] - cum[rb.notes[i - 1].idx]));
            const { bIn, bOut } = deriveBearings(rb.track, idx);
            n.bearing_in = round3(bIn); n.bearing_out = round3(bOut);
        });
        normalizeRoadTypes(rb);
        rb.meta.total_distance = Math.round(cum[cum.length - 1] || 0);
        rb.meta.note_count = rb.notes.length;
        return rb;
    }
    // Recompute the red CAP (heading + straight-line distance in metres to the next note) where active.
    function recomputeCaps(rb) {
        for (let i = 0; i < rb.notes.length; i++) {
            const n = rb.notes[i], nx = rb.notes[i + 1];
            if (n.cap != null && nx) { n.cap = Math.round(bearingDeg(n, nx)); n.cap_distance = Math.round(haversineM(n, nx)); }
        }
        return rb;
    }
    /* ---------------- route operations (editor tools) ---------------- */
    // Douglas-Peucker simplification with a tolerance in METRES, iterative (no
    // recursion limit) on a local equirectangular projection. Indices listed in
    // `keepIdx` (note anchors) always survive.
    function simplifyTrack(trkpts, toleranceM, keepIdx) {
        if (!trkpts || trkpts.length < 3) return (trkpts || []).slice();
        const lat0 = toRad(trkpts[0].lat);
        const xy = trkpts.map((p) => ({ x: toRad(p.lon) * Math.cos(lat0) * EARTH_RADIUS_M, y: toRad(p.lat) * EARTH_RADIUS_M }));
        const segDist = (p, a, b) => {
            const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
            const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
            return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
        };
        const keep = new Uint8Array(trkpts.length);
        keep[0] = keep[trkpts.length - 1] = 1;
        (keepIdx || []).forEach((i) => { if (i >= 0 && i < keep.length) keep[i] = 1; });
        const stack = [[0, trkpts.length - 1]];
        while (stack.length) {
            const [a, b] = stack.pop();
            if (b - a < 2) continue;
            let worst = -1, worstDist = 0;
            for (let i = a + 1; i < b; i++) {
                const d = segDist(xy[i], xy[a], xy[b]);
                if (d > worstDist) { worstDist = d; worst = i; }
            }
            if (worstDist > toleranceM) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
        }
        return trkpts.filter((_, i) => keep[i]);
    }
    // Closest position ON the track polyline (not just a vertex): the segment
    // index `i` (between points i and i+1), the fraction `t` along it, the
    // projected point and its distance in metres.
    function nearestOnTrack(trkpts, pt) {
        if (!trkpts || trkpts.length < 2) return null;
        const lat0 = toRad(pt.lat);
        const proj = (p) => ({ x: toRad(p.lon) * Math.cos(lat0) * EARTH_RADIUS_M, y: toRad(p.lat) * EARTH_RADIUS_M });
        const P = proj(pt);
        let best = null;
        for (let i = 0; i < trkpts.length - 1; i++) {
            const A = proj(trkpts[i]), B = proj(trkpts[i + 1]);
            const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy;
            const t = l2 ? Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / l2)) : 0;
            const dist = Math.hypot(P.x - (A.x + t * dx), P.y - (A.y + t * dy));
            if (!best || dist < best.dist) best = { i, t, dist };
        }
        const a = trkpts[best.i], b = trkpts[best.i + 1];
        return { i: best.i, t: best.t, dist: best.dist, lat: round6(a.lat + (b.lat - a.lat) * best.t), lon: round6(a.lon + (b.lon - a.lon) * best.t) };
    }
    // Simplify rb.track (notes' anchor points always survive), then re-anchor and recompute.
    function simplifyRoadbook(rb, toleranceM) {
        rb.track = simplifyTrack(rb.track, toleranceM, rb.notes.map((n) => n.idx));
        rb.notes.forEach((n) => { n.idx = nearestIdx(rb.track, n); });
        recomputeMetrics(rb); recomputeCaps(rb);
        return rb;
    }
    // Reverse the direction of travel: track flipped, notes re-anchored and
    // re-ordered. The road a note now LEAVES on is the one it used to arrive on,
    // so road_type_out becomes the old road_type_in; recomputeMetrics re-derives
    // road_type_in (and bearings/CAPs follow).
    function reverseRoadbook(rb) {
        const last = rb.track.length - 1;
        rb.track.reverse();
        rb.notes.forEach((n) => { n.idx = last - n.idx; n.road_type_out = n.road_type_in; });
        recomputeMetrics(rb); recomputeCaps(rb);
        return rb;
    }
    // XML attribute/text escape, shared by the GPX and OpenRally serializers.
    const xmlEsc = (s) => String(s == null ? '' : s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
    // Serialize a GPX 1.1 document: a track (points may carry ele/t) + optional named waypoints.
    function gpxDocument(name, pts, wpts) {
        const x = xmlEsc;
        const trkpts = pts.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}">${p.ele != null ? '<ele>' + Math.round(p.ele) + '</ele>' : ''}${p.t ? '<time>' + new Date(p.t).toISOString() + '</time>' : ''}</trkpt>`).join('');
        // a wpt may carry app icons: `sym` = Garmin standard symbol (+ a gpxx WaypointExtension so
        // Garmin shows symbol+name) · `osmandIcon`/`color` = OSMAnd extensions. Both tag sets live
        // in one file (each app ignores the other's) — matches the reference Garmin/OSMAnd exports.
        const hasOsm = (wpts || []).some((w) => w.osmandIcon);
        const hasSym = (wpts || []).some((w) => w.sym);
        const wptXml = (wpts || []).map((w) => {
            let inner = w.name ? '<name>' + x(w.name) + '</name>' : '';   // the note NUMBER
            if (w.t != null) inner += '<time>' + new Date(w.t).toISOString() + '</time>'; // when the waypoint was dropped (#158)
            if (w.desc) inner += '<desc>' + x(w.desc) + '</desc>';        // the note comment
            if (w.sym) inner += '<sym>' + x(w.sym) + '</sym><type>user</type>';
            let ext = '';
            if (w.osmandIcon) ext += '<osmand:icon>' + x(w.osmandIcon) + '</osmand:icon><osmand:background>circle</osmand:background>' + (w.color ? '<osmand:color>' + x(w.color) + '</osmand:color>' : '') + '<osmand:displaymode>SymbolAndName</osmand:displaymode>';
            if (w.sym) ext += '<gpxx:WaypointExtension><gpxx:DisplayMode>SymbolAndName</gpxx:DisplayMode></gpxx:WaypointExtension>';
            if (ext) inner += '<extensions>' + ext + '</extensions>';
            return `<wpt lat="${w.lat}" lon="${w.lon}">${inner}</wpt>`;
        }).join('');
        const ns = (hasOsm ? ' xmlns:osmand="https://osmand.net"' : '') + (hasSym ? ' xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3"' : '');
        const trk = (pts && pts.length) ? `<trk><name>${x(name || 'RDBK route')}</name><trkseg>${trkpts}</trkseg></trk>` : ''; // omit the track for a waypoints-only GPX
        return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="RDBK.app" xmlns="http://www.topografix.com/GPX/1/1"${ns}><metadata><name>${x(name || 'RDBK route')}</name></metadata>${wptXml}${trk}</gpx>`;
    }
    // Map a note to a Garmin <sym> + OSMAnd icon/colour for GPX export (issue #33). Curated for
    // the POI-like Info icons; a note with `danger` is always red; everything else is generic.
    const APP_WPT = {
        'I01_arrivo.png': { sym: 'Flag, Checkered', osmandIcon: 'special_flag_finish', color: 'green' },
        'I02_partenza.png': { sym: 'Flag, Green', osmandIcon: 'special_flag_start', color: 'green' },
        'I03_animali.png': { sym: 'Animal', osmandIcon: 'animals', color: 'default' },
        'I04_persone.png': { sym: 'Trail Head', osmandIcon: 'special_trekking', color: 'default' },
        'I05_biciclette_moto.png': { sym: 'Bike Trail', osmandIcon: 'special_bicycle', color: 'default' },
        'I06_no_potabile.png': { sym: 'Drinking Water', osmandIcon: 'water', color: 'blue' },
        'I07_acqua_potabile.png': { sym: 'Drinking Water', osmandIcon: 'drinking_water', color: 'blue' },
        'I08_meccanico.png': { sym: 'Mechanic', osmandIcon: 'car_repair', color: 'default' },
        'I09_parcheggio.png': { sym: 'Parking Area', osmandIcon: 'parking', color: 'default' },
        'I10_stazione_servizio.png': { sym: 'Gas Station', osmandIcon: 'fuel', color: 'default' },
        'I11_ristorante.png': { sym: 'Restaurant', osmandIcon: 'restaurants', color: 'default' },
        'I12_servizio_,medico.png': { sym: 'First Aid', osmandIcon: 'first_aid', color: 'red' },
    };
    const APP_DANGER = { sym: 'Dangerous Area', osmandIcon: 'special_marker', color: 'red' };
    const APP_DEFAULT = { sym: 'Flag, Blue', osmandIcon: 'special_point', color: 'blue' };
    const APP_COLOR_HEX = { green: '#2ca02c', blue: '#3a8dff', red: '#e01414' };
    // Lowercase index so a note's icon name matches regardless of case.
    const APP_WPT_LC = {}; for (const [k, v] of Object.entries(APP_WPT)) APP_WPT_LC[k.toLowerCase()] = v;
    function appWaypointSymbol(note) {
        // A declared waypoint type wins — it carries the FIA characterization into the export.
        const wt = wpType(note.wp_type);
        if (wt) return { sym: wt.sym, osmandIcon: wt.osm, color: wt.color };
        let m = null;
        for (const ic of (note.icons || [])) { const k = (ic.name || '').split('/').pop().toLowerCase(); if (APP_WPT_LC[k]) { m = APP_WPT_LC[k]; break; } }
        if (!m) m = note.danger ? APP_DANGER : APP_DEFAULT;
        const colorName = note.danger ? 'red' : m.color; // a danger note is always red
        return { sym: m.sym, osmandIcon: m.osmandIcon, color: APP_COLOR_HEX[colorName] || '' };
    }

    // Reverse of APP_WPT: recover a note's RDBK icon (or danger flag) from an imported GPX
    // waypoint's OSMAnd <osmand:icon> or Garmin <sym>, so a Garmin/OSMAnd round-trip keeps its
    // pictograms. OSMAnd icon wins (more specific); the Garmin sym is the fallback.
    const REV_OSM = {}, REV_SYM = {};
    for (const [file, m] of Object.entries(APP_WPT)) {
        if (m.osmandIcon && !(m.osmandIcon in REV_OSM)) REV_OSM[m.osmandIcon] = file;
        const sk = m.sym.toLowerCase();
        if (!(sk in REV_SYM)) REV_SYM[sk] = file;
    }
    // Garmin <sym> → OSMAnd icon, matching how Garmin Desktop fills <osmand:icon>. Lets a
    // Garmin-only file (e.g. QMapShack, which writes no <osmand:icon>) still export the right
    // OSMAnd icons. Syms with no clean OSMAnd equivalent (Triangle Blue, Dot White) stay generic.
    const SYM_OSMAND = {
        'tall tower': 'man_made_mast', 'lodge': 'topo_shelter', 'civil': 'house', 'waypoint': 'waypoint',
        'circle, red': 'circle', 'circle, green': 'circle', 'navaid, red': 'circle',
        'flag, blue': 'special_flag_stroke', 'flag, red': 'special_flag_stroke', 'flag, green': 'special_flag_stroke',
    };
    // The colour word in a Garmin <sym> ("Circle, Green") → the OSMAnd colour Garmin Desktop
    // writes in <osmand:color>. Garmin's gpxx carries no colour tag — the sym name holds it.
    const SYM_COLOR = { green: '#00842b', red: '#d00d0d', blue: '#1010a0' };
    const colorFromSym = (sym) => SYM_COLOR[(sym.split(',').pop() || '').trim().toLowerCase()] || null;
    function appwptFromImport(sym, osmandIcon, color) {
        const oi = (osmandIcon || '').trim(), sy = (sym || '').trim();
        if (oi === 'special_marker' || sy === 'Dangerous Area') return { danger: 3 };
        const icon = REV_OSM[oi.toLowerCase()] || REV_SYM[sy.toLowerCase()] || null;
        if (icon) return { icon };                          // recognised → map back to an RDBK icon
        const osm = oi || SYM_OSMAND[sy.toLowerCase()] || null; // source OSMAnd icon, else derived from the Garmin sym
        const col = (color || '').trim() || colorFromSym(sy); // source colour, else derived from the sym's colour word
        if (osm || sy) return { appwpt: { sym: sy || null, osmandIcon: osm, color: col } };
        return {};                                          // plain waypoint, no icon at all
    }

    // OpenRally export: a GPX 1.1 file carrying the route as a <trk> and every note as a
    // <wpt> with openrally: extensions (distance·cap·danger·speed·tulip). The vignette is a
    // pre-rendered SVG passed in via opts.tulips[noteIndex] (the caller renders it with
    // NoteCanvas.toSVG, which this DOM-free module can't do). Spec: github.com/openrally/openrally.
    function openRallyDocument(rb, opts) {
        opts = opts || {};
        const tulips = opts.tulips || [];
        const NS = 'http://www.openrally.org/xmlschemas/GpxExtensions/v1.0.3';
        const x = xmlEsc;
        const name = opts.name || (rb.meta && rb.meta.title) || 'RDBK roadbook';
        // re-emit one preserved openrally: element (from an imported note's passthrough) verbatim
        const emitOr = (e) => {
            const at = Object.entries(e.attrs || {}).map(([k, v]) => ` ${k}="${x(v)}"`).join('');
            return e.text ? `<openrally:${e.tag}${at}><![CDATA[${e.text}]]></openrally:${e.tag}>` : `<openrally:${e.tag}${at}/>`;
        };
        const trkpts = (rb.track || []).map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}">${p.ele != null ? '<ele>' + Math.round(p.ele) + '</ele>' : ''}</trkpt>`).join('');
        const wpts = (rb.notes || []).map((n, i) => {
            const ext = [`<openrally:distance>${((n.distance || 0) / 1000).toFixed(3)}</openrally:distance>`];
            if (n.wp_type) ext.push(`<openrally:wptType>${x(n.wp_type)}</openrally:wptType>`);
            if (Array.isArray(n.openrally) && n.openrally.length) {
                // imported note: re-emit every preserved param verbatim (cap·danger·speed·wp types·zones·…)
                n.openrally.forEach((e) => ext.push(emitOr(e)));
            } else {
                // RDBK-native note: the computed set
                if (n.cap != null) ext.push(`<openrally:cap>${Math.round(n.cap)}</openrally:cap>`);
                if (n.danger) ext.push(`<openrally:danger>${n.danger}</openrally:danger>`);
                const spd = speedLimitOfNote(n);
                if (spd) ext.push(`<openrally:speed>${spd}</openrally:speed>`); // 0 = lifted → no positive value to emit
            }
            if (tulips[i]) ext.push(`<openrally:tulip><![CDATA[${tulips[i]}]]></openrally:tulip>`);
            return `<wpt lat="${n.lat}" lon="${n.lon}"><name>${x(n.num != null ? n.num : i + 1)}</name><extensions>${ext.join('')}</extensions></wpt>`;
        }).join('');
        const totalM = (rb.track && rb.track.length > 1) ? cumulativeM(rb.track)[rb.track.length - 1] : (rb.meta && rb.meta.total_distance) || 0;
        return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="RDBK.app" xmlns="http://www.topografix.com/GPX/1/1" xmlns:openrally="${NS}">`
            + `<metadata><name>${x(name)}</name><extensions><openrally:units>metric</openrally:units><openrally:distance>${(totalM / 1000).toFixed(3)}</openrally:distance></extensions></metadata>`
            + `${wpts}<trk><name>${x(name)}</name><trkseg>${trkpts}</trkseg></trk></gpx>`;
    }

    // speed limit encoded in a symbol name (S01_10km → 10; S99_end → 0 = limit lifted)
    function speedLimitFromName(name) {
        if (!name) return null;
        if (/S99_end/i.test(name)) return 0;
        const m = String(name).match(/^S\d{2}_(\d{1,3})km/i);
        return m ? parseInt(m[1], 10) : null;
    }
    // limit in force at a note (0 = limit lifted). The declarative speed_limit field is the
    // source of truth; a limit encoded in an icon name (imported roadbooks) is the fallback.
    function speedLimitOfNote(note) {
        if (note.speed_limit != null) return note.speed_limit;
        let lim = null;
        (note.icons || []).forEach((ic) => { const v = speedLimitFromName(ic.name); if (v != null) lim = v; });
        return lim;
    }

    /* ---------------- competition scoring (the Reader accrues → META → the Ranking scores) ---------------- */
    // Scored sections (rally special stages): only notes between a START icon and the next
    // FINISH icon (both inclusive) are penalised; liaison/transfer notes outside them are not.
    // Returns null when the roadbook has no START marker — the whole roadbook is scored.
    const START_ICON = 'I02_partenza.png', FINISH_ICON = 'I01_arrivo.png';
    function scoredNoteSet(notes) {
        const has = (n, name) => (n.icons || []).some((ic) => ic.name === name);
        if (!notes.some((n) => has(n, START_ICON))) return null;
        const set = new Set();
        let inStage = false;
        notes.forEach((n, i) => { if (has(n, START_ICON)) inStage = true; if (inStage) set.add(i); if (has(n, FINISH_ICON)) inStage = false; });
        return set;
    }
    const isScoredIdx = (scoredSet, i) => scoredSet === null || scoredSet.has(i);
    // Position penalties on validating note i from `here` (1 pt/m): accuracy = distance to the
    // note (never charged on the first note); CAP = distance to the previous note's CAP target
    // point. Both zero without a GPS fix — a manual run has nothing to measure against.
    function validationPenalties(notes, i, here) {
        if (!here) return { acc: 0, cap: 0 };
        const n = notes[i], prev = notes[i - 1];
        const acc = i > 0 ? haversineM(here, n) : 0;
        const cap = (prev && prev.cap != null && prev.cap_distance != null)
            ? haversineM(here, destPoint(prev.lat, prev.lon, prev.cap, prev.cap_distance)) : 0;
        return { acc, cap };
    }
    // Speed penalty when a controlled segment closes: points per full km/h over the limit.
    function speedPenalty(maxKmh, limitKmh) {
        return (limitKmh && limitKmh > 0 && maxKmh > limitKmh) ? CONST.P_SPEED_PER_KMH * (Math.floor(maxKmh) - limitKmh) : 0;
    }
    // Skip penalty for jumping from note `fromIdx` straight to `toIdx`: each passed-over note
    // inside a scored section costs P_SKIP; unscored (liaison) notes are free to skip.
    function skipPenalty(scoredSet, fromIdx, toIdx) {
        let skips = 0;
        for (let k = fromIdx; k < toIdx; k++) if (isScoredIdx(scoredSet, k)) skips++;
        return CONST.P_SKIP * skips;
    }
    // Codecs for the META date/time fields (fixed-width digits, no separators).
    const hhmmss = (d) => d ? pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) : '000000';
    const ddmmyy = (d) => d ? pad2(d.getDate()) + pad2(d.getMonth() + 1) + pad2(d.getFullYear() % 100) : '000000';
    const parseHms = (s) => { const p = String(s).padStart(6, '0'); return (+p.slice(0, 2)) * 3600 + (+p.slice(2, 4)) * 60 + (+p.slice(4, 6)); };
    // Score one parsed META (the Ranking side; lower = better). `avgTarget` is the organizer-set
    // target average (km/h); it falls back to the run's own informational average, then 30.
    // Regularity: early seconds cost 1 pt each; late ones get REG_GRACE_S of grace first.
    function rankEntry(m, avgTarget) {
        const num = (x) => { const n = parseInt(x, 10); return isFinite(n) ? n : 0; };
        const accuracy = num(m.accuracy) + num(m.skip) + num(m.extra);
        const cap = num(m.cap), speed = num(m.speed);
        const km = num(m.km) / 10;
        const avg = avgTarget || num(m.avg) / 10 || 30;
        let reg = 0;
        let actual = parseHms(m.end) - parseHms(m.start);
        if (actual < 0) actual += 86400; // the run crossed midnight
        if (avg > 0 && km > 0 && actual > 0) {
            const expected = Math.round(3600 * km / avg);
            const early = Math.max(0, expected - actual);
            const late = Math.max(0, actual - expected);
            reg = early + Math.max(0, late - CONST.REG_GRACE_S);
        }
        return { team: parseInt(m.team, 10), km, accuracy, cap, speed, reg, finalScore: accuracy + cap + speed + reg };
    }
    // Speed-alert band vs a limit (Tripmaster dashboard): 0 = well under (>5 km/h margin),
    // 1 = approaching, 2 = just over (<5 km/h), 3 = far over; null when no limit is set.
    function speedBand(speedKmh, limitKmh) {
        if (!limitKmh) return null;
        return speedKmh < limitKmh - 5 ? 0 : speedKmh < limitKmh ? 1 : speedKmh < limitKmh + 5 ? 2 : 3;
    }

    /* ---------------- result META (49-char QR payload) ---------------- */
    const META_KEYS = ['team', 'date', 'start', 'end', 'accuracy', 'skip', 'extra', 'cap', 'speed', 'km', 'avg'];
    function buildMeta(f) {
        // Fixed-width numeric fields: clamp negatives to 0 and saturate to all-9s on
        // overflow (never let a '-' or a left-truncated value corrupt the string).
        // padStart restores leading zeros for fields like date/start/end.
        return META_KEYS.map((k, i) => {
            const w = CONST.META_WIDTHS[i];
            const v = Math.max(0, Math.round(Number(f[k]) || 0));
            let s = String(v);
            if (s.length > w) s = '9'.repeat(w);
            return s.padStart(w, '0');
        }).join('');
    }
    function parseMeta(str) {
        const out = {}; let o = 0;
        META_KEYS.forEach((k, i) => { const w = CONST.META_WIDTHS[i]; out[k] = String(str).slice(o, o + w).trim(); o += w; });
        return out;
    }

    /* ---------------- QR signature (HMAC-SHA256) ---------------- */
    // The key lives in the client (config.js), so the signature protects against
    // casual/accidental tampering, not a determined forger. Still far better than
    // an unverifiable plain-text QR.
    async function hmacHex(msg, key) {
        const enc = new TextEncoder();
        const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
        return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    async function signMeta(meta, key) {
        try { return meta + '-' + (await hmacHex(meta, key || '')).slice(0, 10); } catch (e) { return meta; }
    }
    async function verifyMeta(payload, key) {
        const i = String(payload).lastIndexOf('-');
        if (i < 0) return { meta: String(payload).trim(), valid: false }; // no signature → not a valid result
        const meta = payload.slice(0, i).trim(), sig = payload.slice(i + 1).trim();
        try { return { meta, valid: (await hmacHex(meta, key || '')).slice(0, 10) === sig }; }
        catch (e) { return { meta, valid: false }; }
    }

    /* ---------------- icon resolution ---------------- */
    // Source for a note icon: direct data: URI, the roadbook's embedded library
    // (rb.icons, case-insensitive) or the standard palette under basePath.
    function iconSrc(ic, rb, basePath) {
        const name = ic.name || '';
        if (/^data:/.test(name)) return name;
        const base = name.split('/').pop();
        if (rb && rb.icons) {
            if (rb.icons[base]) return rb.icons[base];
            const k = Object.keys(rb.icons).find((x) => x.toLowerCase() === base.toLowerCase());
            if (k) return rb.icons[k];
        }
        return (basePath || '') + base;
    }

    /* ---------------- rounding ---------------- */
    const round3 = (n) => Math.round(n * 1000) / 1000;
    const round6 = (n) => Math.round(n * 1e6) / 1e6;

    // URL/filename-safe slug from a title (lowercase, single dashes, ≤60 chars).
    const slug = (s) => (String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'roadbook');
    // Zero-pad to two digits (shared by the timestamped filename helpers).
    const pad2 = (n) => String(n).padStart(2, '0');

    // Fetch a (same-origin) URL and return it as a data: URI — null on failure.
    // Used to embed assets self-contained (icons into .rdbk / the PDF).
    async function urlToDataURL(url) {
        try { const r = await fetch(url); if (!r.ok) return null; const b = await r.blob(); return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); }
        catch (e) { return null; }
    }

    // Delete note `i` AND the track vertex it sits on, reconnecting the route between its
    // neighbours; notes after it shift down one index. The vertex is kept (note-only removal)
    // when the track would drop below 2 points. Returns the removed vertex index, or -1 if the
    // vertex was kept / nothing was deleted. (The Editor's "Transform" keeps the point instead.)
    function deleteNote(rb, i) {
        if (!rb || i < 0 || i >= rb.notes.length) return -1;
        const idx = rb.notes[i].idx;
        rb.notes.splice(i, 1);
        let removed = -1;
        if (rb.track.length > 2) {
            rb.track.splice(idx, 1);
            rb.notes.forEach((n) => { if (n.idx > idx) n.idx -= 1; });
            removed = idx;
        }
        recomputeMetrics(rb); recomputeCaps(rb);
        return removed;
    }

    // Generic free-text filter: keep items where ANY of `fields` contains `query`
    // (case-insensitive); a blank query returns a copy of the whole list. Null-safe.
    function filterByText(list, query, fields) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return (list || []).slice();
        const fs = fields || [];
        return (list || []).filter((item) => fs.some((f) => String(item && item[f] != null ? item[f] : '').toLowerCase().includes(q)));
    }
    // Filter a roadbook list (My roadbooks / Editor landing) by title.
    function filterRoadbooks(list, query) { return filterByText(list, query, ['title']); }

    // Cross-tool "unsaved work" scan. Each tool crash-saves its in-progress work to
    // localStorage and prompts to resume on its OWN page; this turns a snapshot of those
    // keys into a flat list so the shell can surface work left in OTHER tools. `snap` is the
    // already-parsed value of each key (null when absent). Returns one descriptor per pending
    // item — { tool, url, keys[], kind, title?, noteCount?, distanceM?, noteIdx?, noteTotal? }
    // — the same "is this resumable?" guard each tool applies to its own checkpoint. The
    // shell formats the human label/detail (i18n stays out of the core).
    function pendingWork(snap) {
        snap = snap || {};
        const out = [];
        const draft = snap.rb_editor_draft;
        if (draft && draft.rb && draft.rb.meta && Array.isArray(draft.rb.notes)) {
            out.push({ tool: 'editor', url: 'editor/', keys: ['rb_editor_draft'], kind: 'draft',
                title: draft.rb.meta.title || '', noteCount: draft.rb.notes.length });
        }
        const rec = snap.rb_recorder_session;
        if (rec && rec.recording) {
            out.push({ tool: 'recorder', url: 'recorder/', keys: ['rb_recorder_session'], kind: 'recording',
                distanceM: rec.recordedM || 0 });
        }
        const tm = snap.rb_tripmaster_session;
        if (tm && (tm.totalM > 0 || tm.waypoints > 0 || tm.timerOn || tm.timerAcc > 0 || tm.gpxRecording)) {
            out.push({ tool: 'tripmaster', url: 'tripmaster/', keys: ['rb_tripmaster_session'], kind: 'run',
                distanceM: tm.totalM || 0 });
        }
        const nav = snap.rb_session, navRb = snap.rb_session_roadbook;
        if (nav && nav.pen && navRb && Array.isArray(navRb.notes)) {
            out.push({ tool: 'reader', url: 'reader/', keys: ['rb_session', 'rb_session_roadbook'], kind: 'navigation',
                title: (navRb.meta && navRb.meta.title) || '', distanceM: nav.totalM || 0,
                noteIdx: nav.activeIdx || 0, noteTotal: navRb.notes.length });
        }
        return out;
    }

    /* ---------------- export ---------------- */
    const RB = {
        ROAD_TYPES, CONST, WP_TYPES, ROADBOOK_STATUSES, roadbookStatus, wpType, wpTypesForProfile, wpBadgeSVG, detectionRadius,
        geo: { haversineM, bearingDeg, destPoint },
        parseGPX, parseWPT, buildRoadbook, importRoadbook, parseOpenRally,
        recomputeMetrics, recomputeCaps, normalizeRoadTypes, speedLimitOfNote, speedLimitFromName,
        simplifyRoadbook, reverseRoadbook, gpxDocument, openRallyDocument, appWaypointSymbol, nearestOnTrack,
        buildMeta, parseMeta, signMeta, verifyMeta, iconSrc,
        scoredNoteSet, isScoredIdx, validationPenalties, speedPenalty, skipPenalty, rankEntry, speedBand, hhmmss, ddmmyy, parseHms,
        nearestIdx, nearestIdxByTime, resolveIdx, round6, slug, urlToDataURL, pad2, filterByText, filterRoadbooks, deleteNote, pendingWork,
        cumulativeM, deriveBearings, recJunkFix, recStepM,
    };
    // The browser uses the global; Node (the test runner) imports the same object.
    if (typeof window !== 'undefined') window.RB = RB;
    if (typeof module !== 'undefined' && module.exports) module.exports = RB;
})();
