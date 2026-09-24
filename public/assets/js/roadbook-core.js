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

    /* ---------------- note blocks (#542) ----------------
       Every row in `notes[]` is a NOTE. What a note may also carry is material around it — a
       photo, an advert, a block of text — placed BEFORE or AFTER it, none, one or several. They
       hang off the note they illustrate (`note.blocks`), so they can never disturb numbering,
       scoring, GPS validation or the GPX export: there is nothing of theirs in the sequence of
       waypoints. The catalog below is what the editor builds its controls from and what every
       renderer asks how to draw a block, so a fourth kind of material is one entry here. */
    const NOTE_BLOCKS = [
        { id: 'photo', name: 'Photo', icon: 'fa-image',        image: true, imageMax: 1024 },
        { id: 'ad',    name: 'Ad',    icon: 'fa-rectangle-ad', image: true, imageMax: 512 },
        { id: 'text',  name: 'Heading', icon: 'fa-heading' },
    ];
    const NOTE_BLOCK_BY_ID = Object.fromEntries(NOTE_BLOCKS.map((b) => [b.id, b]));
    // How to draw a block; material of a type this version does not know still reads as text.
    const blockType = (b) => (b && NOTE_BLOCK_BY_ID[b.type]) || NOTE_BLOCK_BY_ID.text;
    // A note's blocks, optionally just the ones on one side ('before' | 'after'; default after).
    const noteBlocks = (n, at) => ((n && Array.isArray(n.blocks)) ? n.blocks : [])
        .filter((b) => b && (!at || (b.at === 'before' ? 'before' : 'after') === at));

    /* ---------------- road types ---------------- */
    // The .rdbk format's own vocabulary of surfaces — not a FIA or OpenRally standard. Each entry
    // carries its NAME as well as its stroke, so the editor and the vignette toolbar name them
    // from one place; a type a reader does not know falls back to the track style.
    // `width` is the type's reference stroke, indicative of the road (motorway widest, off-piste
    // thinnest); the tulip draws its own, bolder strokes from it (ROAD_STYLE in note-canvas.js).
    const ROAD_TYPES = [
        { id: 0, name: 'Default',   color: '#9aa4b2', width: 5, dashed: false },
        { id: 1, name: 'Motorway',  color: '#3b82f6', width: 9, dashed: false },
        { id: 2, name: 'Asphalt',   color: '#22c55e', width: 7, dashed: false },
        { id: 3, name: 'Track',     color: '#ff5a45', width: 5, dashed: false },
        { id: 4, name: 'Off-piste', color: '#ff5a45', width: 4, dashed: true },
        { id: 5, name: 'Bike lane', color: '#532b78', width: 4, dashed: false }, // #561
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
    const WP_TYPE_BY_CAP = {}; WP_TYPES.forEach((w) => { if (w.cap) WP_TYPE_BY_CAP[w.cap] = w; });
    // Look up a type by id (null when unset/unknown). The badge label is its acronym or glyph.
    function wpType(id) { return (id && WP_TYPE_BY_ID[id]) || null; }
    // Look up a type by its OpenRally cap code (e.g. 'WPM' → masked).
    function wpTypeByCap(cap) { return (cap && WP_TYPE_BY_CAP[cap]) || null; }
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
    // The auto-validation reach gate for a note: its detection radius, capped to half the smaller
    // along-track gap to a neighbour (so adjacent reaches never overlap) and floored above GPS
    // noise. gapPrev is this note's partial_distance; gapNext is the next note's (null at the end).
    function reachRadius(note, nextNote, meta) {
        const base = detectionRadius(note, meta);
        const gapPrev = (note && note.partial_distance != null) ? note.partial_distance : Infinity;
        const gapNext = (nextNote && nextNote.partial_distance != null) ? nextNote.partial_distance : Infinity;
        return Math.max(CONST.REACH_MIN_M, Math.min(base, Math.min(gapPrev, gapNext) / 2));
    }
    /* Is note i the roadbook's END — the last one you navigate to? Its tulip draws no exit road: past the finish there is nothing to follow, and in a race
       that note is the finish arch (#447). One rule, so the Editor, the Reader, the public page
       and the PDF all agree about which note that is. */
    function isEndNote(notes, i) { return !!(notes && notes[i]) && i === notes.length - 1; }
    /* Is note i the roadbook's START — the first one you navigate from? Symmetrical to isEndNote.
       Its tulip draws no incoming road: nothing comes before the start, so a line from the bottom
       edge points from nowhere — just the validation dot at the centre (#472). */
    function isFirstNote(notes, i) { return !!(notes && notes[i]) && i === 0; }
    /* Has the active note been reached? — the Reader's auto-validation gate (#384). Testing the
       CURRENT FIX alone silently misses waypoints: fixes land about a second apart, so at 90 km/h
       the phone moves ~25 m between two of them and a tight gate (the REACH_MIN_M floor is 18 m)
       fits entirely inside that gap — the driver passes right over the waypoint and nothing
       validates. So the question is asked of the travel SEGMENT from the previous trusted position
       to this fix, which cannot be jumped over. `from` is null when there is no path to speak of
       (the first fix, or after an implausible jump), where the single point is all we have. */
    function noteReached(note, from, here, radiusM) {
        if (!note || !here || note.lat == null) return false;
        const d = from ? nearestOnTrack([from, here], note).dist : haversineM(here, note);
        return d <= radiusM;
    }
    /* Is the active note BEHIND you (#563)? Only then may the next waypoint take over from it.
       Two things must both hold: this step moved AWAY from the note, and the leg to it is at least
       half driven (coveredM = the partial odometer, the note's partial_distance = the leg). A
       route often swings past the next waypoint on its way in to the active one — a detour, a
       loop, a turn-back — and while you are still closing in, that neighbouring radius is not
       where you are going. With no segment to judge by (`from` null) nothing is behind you. */
    function notePassed(note, from, here, coveredM) {
        if (!note || !from || !here || note.lat == null) return false;
        const receding = haversineM(here, note) > haversineM(from, note);
        return receding && coveredM >= (note.partial_distance || 0) / 2;
    }
    /* Which note a driven segment validates while auto-advance is on (#529). The active note
       comes first; once it is behind you (notePassed) — missed by a few metres, or its radius
       crossed while the fix rate was too slow to notice — reaching the NEXT waypoint validates
       that one instead and leaves the missed one skipped, so a run is never stranded on a note it
       will never reach. Takes the indices the Reader considers navigational (comment notes are
       not), a radius-per-index function and the metres covered since the last validation, and
       returns the index to validate, or -1 for neither. */
    function autoReachedIdx(notes, activeIdx, nextIdx, from, here, radiusOf, coveredM) {
        const active = activeIdx >= 0 ? notes[activeIdx] : null, next = nextIdx >= 0 ? notes[nextIdx] : null;
        if (active && noteReached(active, from, here, radiusOf(activeIdx))) return activeIdx;
        if (next && notePassed(active, from, here, coveredM) && noteReached(next, from, here, radiusOf(nextIdx))) return nextIdx;
        return -1;
    }
    /* The course to steer by (#536 · #565): the direction you are actually travelling, which is
       what a course-up map must put at the top so the road ahead on screen is the road ahead
       through the windscreen. The per-fix course a phone reports (Doppler) is excellent at speed
       and noise below it — on a bike or on foot it jumps by tens of degrees between fixes — so it
       is trusted only from COURSE_DEVICE_KMH up. Below that the course is the bearing of the
       ground actually covered over the last COURSE_WINDOW_M (`trail`: the recent positions the
       odometer gate accepted as movement, oldest first, ending at the current one), which is
       steady at any speed and needs no heading from the device at all. With neither, the last
       known course stands — jitter never spins the map. */
    function courseFrom(prev, trail, speedKmh, deviceHeading) {
        if (deviceHeading != null && isFinite(deviceHeading) && speedKmh >= CONST.COURSE_DEVICE_KMH) return deviceHeading;
        const here = trail && trail[trail.length - 1];
        for (let i = (trail ? trail.length : 0) - 2; i >= 0; i--) {
            if (haversineM(trail[i], here) >= CONST.COURSE_WINDOW_M) return bearingDeg(trail[i], here);
        }
        return prev;
    }
    /* The movement trail courseFrom reads: `here` appended, then only what the window can still
       need kept (the newest point more than COURSE_WINDOW_M back, and everything after it). */
    function courseTrail(trail, here) {
        const next = (trail || []).concat([{ lat: here.lat, lon: here.lon }]);
        let keep = 0;
        for (let i = next.length - 2; i >= 0; i--) if (haversineM(next[i], here) >= CONST.COURSE_WINDOW_M) { keep = i; break; }
        return next.slice(keep);
    }
    /* May note i be validated by hand from `here`? — the Reader's manual/competition gate (#385,
       #431). Manual tracking works with NO GPS at all, so no position means no objection. With a
       position, a scored validation must not be fakeable from a distance, but the phone's own
       uncertainty is not the driver's fault: the 100 m radius is widened by the fix's accuracy.
       Returns the distance when it is too far (so the refusal can say how far, and offer to skip
       the note instead of dead-ending), or null when the validation is allowed. */
    function manualGate(note, here, accuracy) {
        if (!note || !here || note.lat == null) return null;
        const dist = haversineM(here, note);
        return dist > CONST.MANUAL_RADIUS_M + (accuracy || 0) ? dist : null;
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
        MANUAL_RADIUS_M: 100, MIN_DISP_M: 5, REACH_DEFAULT_M: 30, REACH_MIN_M: 18,
        COURSE_WINDOW_M: 15, COURSE_DEVICE_KMH: 12, // course-up: ground covered over the last 15 m, the device's own course only from 12 km/h
        GPS_GOOD_M: 15, // a fix at least this accurate is a good GPS (the status bar, the Recorder's start, #901)
        FIX_ACC_MAX_M: 35, MAX_SPEED_MS: 70, // a fix worse than this is junk; a step faster than this never happened (252 km/h)
        P_SKIP: 450, P_SPEED_PER_KMH: 10, // accuracy/cap/extra = 1 pt/m
        REG_GRACE_S: 59,
        META_WIDTHS: [3, 6, 6, 6, 4, 4, 4, 4, 4, 5, 3, 6],
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
    // Convert an OpenRally <tulip> value to a data: URI. Exported so the test suite can
    // exercise it directly (happy-dom can't parse namespaced XML children).
    function tulipToDataURL(s) {
        s = String(s || '').trim(); if (!s) return null;
        if (/^data:/i.test(s)) return s;
        if (/<svg[\s>]/i.test(s) || /^<\?xml/i.test(s)) return 'data:image/svg+xml,' + encodeURIComponent(s);
        return 'data:image/png;base64,' + s.replace(/\s+/g, ''); // otherwise assume a base64 PNG
    }
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
                if (e.tag === 'wptType') { const w = wpType(e.text) || wpTypeByCap(e.text); if (w) { note.wp_type = w.id; return false; } }
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
    // timestamp (robust on loops/out-and-backs), otherwise by nearest position (buildRoadbook).
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
    /* A bearing needs two points that are actually apart: `bearingDeg(p, p)` is 0 (atan2(0,0)), so
       a DUPLICATE vertex next to a note — drawing over an existing point, a GPS pair with no
       movement, a rejoin — would hand that note a bearing of 0°. The tulip's exit angle is
       `bearing_out − bearing_in`, so one bogus value swings the arrow anywhere: a note whose route
       goes straight on was drawn as a sharp right (#452). Hence: walk outwards to the first vertex
       far enough away to carry a direction. The threshold is deliberately small — this fixes
       degenerate neighbours, it does not try to smooth GPS jitter, which would change the angle of
       tulips that are not broken. */
    const BEARING_MIN_M = 1;
    // The bearing at `from` looking in `dir` (+1 = onwards, -1 = where we came from), or null when
    // there is no vertex that far away on that side (the track's ends, or an all-duplicate tail).
    function bearingAlong(trkpts, from, dir) {
        const a = trkpts[from];
        for (let i = from + dir; i >= 0 && i < trkpts.length; i += dir) {
            if (haversineM(a, trkpts[i]) >= BEARING_MIN_M) return dir > 0 ? bearingDeg(a, trkpts[i]) : bearingDeg(trkpts[i], a);
        }
        return null;
    }
    // A note's bearings at track index `idx`: in = where it came from (falling back to the outgoing
    // one at the track start), out = where it goes (falling back to in at the end).
    function deriveBearings(trkpts, idx) {
        const bIn = bearingAlong(trkpts, idx, -1), bOut = bearingAlong(trkpts, idx, 1);
        return { bIn: bIn != null ? bIn : (bOut != null ? bOut : 0), bOut: bOut != null ? bOut : (bIn != null ? bIn : 0) };
    }
    /* The tulip's roads take the shape the author gave the track around the note (#945). The
       signal is the track itself: over TULIP_SHAPE_M on one side of the note (before it for the
       road you arrive on, after it for the one you leave on — along the track, stopping at the
       neighbouring note), TULIP_SHAPE_POINTS points or more mean that road was drawn on purpose,
       point by point, and the tulip follows it; fewer, and the road is the classic straight one.
       A dense stretch that runs straight still draws straight. The stretch is smoothed of jitter
       (Douglas-Peucker), rotated so the road you arrive on points up (the stored bearing_in, like
       every tulip) and scaled so its length along the road is the vignette's fixed road length —
       73 px in, 63 px out — so a motorbike roadbook and a walking one draw at the same size and the
       drawing never leaves the box. A shape that would curl back over the note (the exit below it,
       the entry above it) or run over a junction the author drew stays classic.
       The classic straight exit aims where the road goes over its first TULIP_AIM_M — not over its
       first metre (the stored bearing_out), which on a recorded track is GPS noise: a clean right
       angle read as 37° — unless that aim would run over a branch, where the stored angle stays.
       Vignette coordinates: the 230×162 box, y down, the note at its centre (115, 81). Returns
       { entry, exit, turn } — `entry` a polyline from its far end in to the centre, `exit` one from
       the centre outwards, each or null; `turn` the classic exit's angle (degrees clockwise from
       straight on), absent where the stored bearings stand. Nothing is ever stored in the roadbook:
       to change a shape, add or move points on the track. */
    const TULIP_SHAPE_M = 30, TULIP_SHAPE_POINTS = 4, TULIP_MIN_M = 12, TULIP_AIM_M = 20;
    const TULIP_ENTRY_PX = 73, TULIP_EXIT_PX = 63, TULIP_STRAIGHT_M = 2;
    const TULIP_CX = 115, TULIP_CY = 81, TULIP_GUARD_PX = 16, TULIP_OVERLAP_PX = 6, TULIP_LEG_PX = 8, TULIP_ARROW_LEG_PX = 20, TULIP_BRANCH_CLEAR_PX = 12;
    // The track from note i along `dir` (+1 forward, -1 back), as metres east/north of the note, up
    // to maxM or the neighbouring note — the last step cut to fit exactly — and how many of the
    // track's own points it passes.
    function tulipStretch(rb, i, dir, maxM) {
        const track = rb.track, notes = rb.notes, n = notes[i], at = n && track && track[n.idx];
        if (!at) return null;
        const stop = notes[i + dir] ? notes[i + dir].idx : (dir > 0 ? track.length - 1 : 0);
        const proj = planarAround(at), O = proj(at), pts = [{ x: 0, y: 0 }];
        let len = 0, points = 0;
        for (let k = n.idx + dir; dir > 0 ? k <= stop : k >= stop; k += dir) {
            const P = proj(track[k]), prev = pts[pts.length - 1];
            const q = { x: P.x - O.x, y: P.y - O.y }, step = Math.hypot(q.x - prev.x, q.y - prev.y);
            if (step < 0.01) continue; // a duplicate vertex (#452)
            if (len + step >= maxM) {
                const f = (maxM - len) / step;
                pts.push({ x: prev.x + (q.x - prev.x) * f, y: prev.y + (q.y - prev.y) * f });
                len = maxM; break;
            }
            pts.push(q); len += step; points++;
        }
        return len >= TULIP_MIN_M ? { pts, len, points } : null;
    }
    // Douglas-Peucker on a short planar polyline (metres)
    function tulipSimplify(pts, tol) {
        const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
        const stack = [[0, pts.length - 1]];
        while (stack.length) {
            const [a, b] = stack.pop();
            let worst = -1, worstD = tol;
            for (let k = a + 1; k < b; k++) { const d = onSegment(pts[k], pts[a], pts[b]).dist; if (d > worstD) { worstD = d; worst = k; } }
            if (worst > 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
        }
        return pts.filter((_, k) => keep[k]);
    }
    function tulipShape(rb, i, isEnd, isFirst) {
        const n = rb && rb.notes && rb.notes[i];
        if (!n || !rb.track || rb.track.length < 2) return { entry: null, exit: null };
        const up = toRad(n.bearing_in || 0), c = Math.cos(up), s = Math.sin(up);
        const toBox = (pts, scale) => pts.map((p) => [TULIP_CX + (p.x * c - p.y * s) * scale, TULIP_CY - (p.x * s + p.y * c) * scale]);
        // how far a stretch strays from its own straight line (the note to its far end)
        const stray = (pts) => {
            const end = pts[pts.length - 1], len = Math.hypot(end.x, end.y) || 1;
            return pts.reduce((m, p) => Math.max(m, Math.abs(p.x * end.y - p.y * end.x) / len), 0);
        };
        // the author's junction vectors, in the box (model +y up → viewBox y down)
        const branches = (n.junctions || []).filter((b) => b && b.pivot && b.tip)
            .map((b) => [[TULIP_CX + b.pivot[0], TULIP_CY - b.pivot[1]], [TULIP_CX + b.tip[0], TULIP_CY - b.tip[1]]]);
        // does a drawing run over a branch? sampled along every leg, past the note's own circle
        const nearBranch = (line) => {
            if (!branches.length) return false;
            for (let j = 1; j < line.length; j++) {
                const [ax, ay] = line[j - 1], [bx, by] = line[j], steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
                for (let k = 0; k <= steps; k++) {
                    const x = ax + (bx - ax) * k / steps, y = ay + (by - ay) * k / steps;
                    if (Math.hypot(x - TULIP_CX, y - TULIP_CY) <= TULIP_GUARD_PX) continue;
                    if (branches.some(([a, b]) => onSegment({ x, y }, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }).dist < TULIP_BRANCH_CLEAR_PX)) return true;
                }
            }
            return false;
        };
        // does it curl back (a hairpin)? The exit stays in the upper half of the box and the entry in
        // the lower one — otherwise they cross over the note — and neither comes back to the note
        const curlsBack = (line, dir) => {
            let out = false;
            for (let j = 1; j < line.length; j++) {
                const [x, y] = line[j], d = Math.hypot(x - TULIP_CX, y - TULIP_CY);
                if (dir > 0 ? y > TULIP_CY + TULIP_OVERLAP_PX : y < TULIP_CY - TULIP_OVERLAP_PX) return true;
                if (d > TULIP_GUARD_PX * 1.4) out = true;
                else if (out && d < TULIP_GUARD_PX) return true;
            }
            return false;
        };
        // no leg too short to read — a stub between two bends is a kink — and, on the exit, a last leg
        // long enough to aim the arrowhead
        const legible = (line, dir) => {
            const out = [line[0]];
            for (let j = 1; j < line.length - 1; j++) {
                const p = out[out.length - 1];
                if (Math.hypot(line[j][0] - p[0], line[j][1] - p[1]) >= TULIP_LEG_PX) out.push(line[j]);
            }
            const end = line[line.length - 1];
            while (dir > 0 && out.length > 1 && Math.hypot(end[0] - out[out.length - 1][0], end[1] - out[out.length - 1][1]) < TULIP_ARROW_LEG_PX) out.pop();
            return out.concat([end]);
        };
        // the shape of one side, when the author drew it
        const side = (dir, px) => {
            const st = tulipStretch(rb, i, dir, TULIP_SHAPE_M);
            if (!st || st.points < TULIP_SHAPE_POINTS) return null; // a point or two: the classic straight road
            const simple = tulipSimplify(st.pts, 1);
            if (simple.length < 3 || stray(simple) < TULIP_STRAIGHT_M) return null; // drawn straight
            const line = legible(toBox(simple, px / st.len), dir);
            if (line.length < 3 || curlsBack(line, dir) || nearBranch(line)) return null;
            const rounded = line.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
            return dir < 0 ? rounded.reverse() : rounded; // the entry runs from its far end in to the centre
        };
        const entry = isFirst ? null : side(-1, TULIP_ENTRY_PX), exit = isEnd ? null : side(1, TULIP_EXIT_PX);
        if (exit || isEnd) return { entry, exit };
        // the classic straight exit, aimed along the road's first metres
        const aim = tulipStretch(rb, i, 1, TULIP_AIM_M);
        if (!aim) return { entry, exit: null };
        const end = aim.pts[aim.pts.length - 1];
        const turn = ((((Math.atan2(end.x, end.y) * 180 / Math.PI) - (n.bearing_in || 0)) % 360) + 360) % 360;
        const tip = [TULIP_CX + Math.sin(turn * Math.PI / 180) * TULIP_EXIT_PX, TULIP_CY - Math.cos(turn * Math.PI / 180) * TULIP_EXIT_PX];
        return nearBranch([[TULIP_CX, TULIP_CY], tip]) ? { entry, exit: null } : { entry, exit: null, turn: Math.round(turn * 10) / 10 };
    }
    // Everything a tulip render needs besides the note itself: where it sits in the roadbook and
    // the shape of the road around it (#945). One call for every renderer.
    function tulipContext(rb, i) {
        const notes = (rb && rb.notes) || [], isEnd = isEndNote(notes, i), isFirst = isFirstNote(notes, i);
        return { isEnd, isFirst, shape: tulipShape(rb, i, isEnd, isFirst) };
    }
    // Is the vertex a note sits on cut off from its neighbour on that side by duplicates?
    const degenerateSide = (trkpts, idx, dir) => {
        const j = idx + dir;
        return j >= 0 && j < trkpts.length && haversineM(trkpts[idx], trkpts[j]) < BEARING_MIN_M;
    };
    /* Bearings are STORED in the .rdbk, and the Reader, the public page and the PDF read them as
       they are — so a roadbook saved with a poisoned bearing would keep pointing the wrong way
       until someone re-saved it in the Editor. Repair, on load, exactly the ones that are provably
       broken: those derived from a degenerate neighbour. Every authored or imported value is left
       alone (an OpenRally file may carry bearings its own way, and a note placed by distance has
       an approximate `idx` — re-deriving everything could be worse than what is there). In memory
       only: the file itself changes when something is saved. */
    function repairDegenerateBearings(rb) {
        if (!rb || !Array.isArray(rb.track) || rb.track.length < 2) return rb;
        (rb.notes || []).forEach((n) => {
            const i = n.idx;
            if (i == null || !rb.track[i]) return;
            const badIn = degenerateSide(rb.track, i, -1), badOut = degenerateSide(rb.track, i, 1);
            if (!badIn && !badOut) return;
            const b = deriveBearings(rb.track, i);
            if (badIn) n.bearing_in = b.bIn;
            if (badOut) n.bearing_out = b.bOut;
        });
        return rb;
    }
    // Live-recording intake (Recorder · the Editor's record/adjust · the GPX logger): a fix
    // worse than FIX_ACC_MAX_M is junk; the sampling step scales with the accuracy — dense
    // detail with a good fix, no jitter with a weak one.
    const recJunkFix = (acc) => acc != null && acc > CONST.FIX_ACC_MAX_M;
    // How healthy a GPS fix is (#901) — the ONE scale the status bar and the Recorder's start read:
    // 'good' ≤ GPS_GOOD_M · 'fair' up to FIX_ACC_MAX_M, still recorded · 'weak' beyond it, a fix the
    // recording throws away · 'none' without one.
    const gpsHealth = (acc) => (acc == null || !isFinite(acc) ? 'none' : acc <= CONST.GPS_GOOD_M ? 'good' : acc <= CONST.FIX_ACC_MAX_M ? 'fair' : 'weak');
    const recStepM = (acc) => Math.max(2.5, (acc || 10) * 0.35);

    /* Odometer intake (the Reader's and Tripmaster's travelled distance, #383). A phone's
       position stream is not a trajectory: it interleaves usable fixes with cell/wifi ones
       hundreds of metres off, a cached position from wherever the phone last was, and — while
       standing still — a wander as wide as the fix's own error circle. Integrating that raw
       stream is what put 57 km on the odometer after 3 km of driving. So every fix is judged
       against the last position we trusted, and only a real step counts:
         · junk     — accuracy beyond FIX_ACC_MAX_M: dropped, and the anchor HOLDS, so the
                      ground actually covered meanwhile is counted when a good fix returns;
         · noise    — the step is inside the fix's own uncertainty, i.e. indistinguishable from
                      standing still: no distance, anchor holds (a slow, real movement is not
                      lost, it accumulates until it clears the floor);
         · teleport — the step implies a speed no vehicle reaches: no distance, but the anchor
                      MOVES there, or one bogus fix (a stale cached position) would freeze the
                      odometer for the rest of the run;
         · ok       — counted.
       `anchor` is the last trusted position + the time of its fix; pass null to start. Pure, so
       the whole gate is unit-tested — RBGpsMeter is its only caller. */
    function odometerStep(anchor, fix) {
        const acc = (fix.acc != null && isFinite(fix.acc)) ? fix.acc : null;
        const pos = { lat: fix.lat, lon: fix.lon, t: fix.t };
        if (recJunkFix(acc)) return { disp: 0, anchor, verdict: 'junk' };
        if (!anchor) return { disp: 0, anchor: pos, verdict: 'first' };
        const d = haversineM(anchor, pos);
        const dt = (fix.t - anchor.t) / 1000;
        if (dt > 0 && d / dt > CONST.MAX_SPEED_MS) return { disp: 0, anchor: pos, verdict: 'teleport' };
        if (d < Math.max(CONST.MIN_DISP_M, acc || 0)) return { disp: 0, anchor, verdict: 'noise' };
        return { disp: d, anchor: pos, verdict: 'ok' };
    }

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
            if (w.blocks && w.blocks.length) note.blocks = w.blocks; // its material, e.g. the Recorder's photo (#792)
            return note;
        });

        return {
            // default_wp_radius is written out rather than left implicit: the organizer sees the
            // number they are working with in the editor instead of an em-dash, and the file says
            // what it means without the reader having to know the system fallback (#439).
            meta: { title: name || 'roadbook', total_distance: Math.round(totalM), note_count: notes.length, default_wp_radius: CONST.REACH_DEFAULT_M },
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
        'Trattori.png': 'W27_agricultural_vehicles.svg',
    };
    // Normalize a roadbook into the canonical .rdbk schema in place. Besides the
    // structural defaults, this is where pre-standard files exported by Roadbook
    // Suite (Italian keys, km units, `bivio` junctions, +y-down geometry) are
    // translated — so they open identically in the Editor and the Reader. Each legacy
    // key is mapped by presence and then dropped, leaving a clean canonical object.
    /* Older files carried their photos, adverts and captions as ROWS of their own
       (`note_kind: "comment" | "photo" | "ad"`). It is the same material, so it folds onto the
       note it sat beside: after that note, or before the first one when it opened the roadbook.
       A row that had a place on the route was a note wearing a kind — it becomes a note again and
       keeps its picture as a block. A note holds ONE block of each type, so a second advert (two
       sponsor rows in a row) goes to the nearest note whose slot of that type is free, and only
       when there is nowhere at all do its words join the ones already there. Runs on import, so
       nothing downstream ever meets a row that is not a note. */
    function foldInfoRows(rb) {
        const rows = rb.notes || [];
        if (!rows.some((n) => n && n.note_kind && n.note_kind !== 'note')) return rb;
        const out = [], waiting = [];
        const blockFrom = (n, at) => {
            const block = { type: n.note_kind === 'photo' ? 'photo' : (n.image ? 'ad' : 'text'), at };
            if (n.image) block.image = n.image;
            if (n.text) block.text = n.text;
            return block;
        };
        const slotFree = (host, type) => !(host.blocks || []).some((b) => b.type === type);
        const put = (host, block, at) => { block.at = at; (host.blocks = host.blocks || []).push(block); };
        for (const n of rows) {
            if (!n.note_kind || n.note_kind === 'note') { out.push(n); continue; }
            if (n.idx != null && n.lat != null) { // a note that had been switched to a kind
                const block = blockFrom(n, 'after');
                delete block.text; // its words are the note's own text, not a caption of them
                delete n.note_kind; delete n.image;
                out.push(n);
                if (block.image) put(n, block, 'after');
            } else waiting.push({ block: blockFrom(n, 'after'), host: out.length - 1 }); // -1 = it opened the roadbook
        }
        for (const item of waiting) {
            const type = item.block.type;
            const from = Math.max(0, item.host);
            let placed = false;
            for (let i = from; i < out.length && !placed; i++) {
                if (slotFree(out[i], type)) { put(out[i], item.block, i === item.host ? 'after' : 'before'); placed = true; }
            }
            for (let i = from - 1; i >= 0 && !placed; i--) {
                if (slotFree(out[i], type)) { put(out[i], item.block, 'after'); placed = true; }
            }
            if (!placed && out.length) { // every slot taken: keep the words with the ones already there
                const host = out[Math.max(0, item.host)];
                const b = (host.blocks || []).find((x) => x.type === type);
                if (b && item.block.text) b.text = [b.text, item.block.text].filter(Boolean).join('\n');
            }
        }
        rb.notes = out;
        return rb;
    }
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
            // Normalize wp_type: accept both internal IDs (masked, navigation…) and
            // OpenRally cap codes (WPM, WPN…) from third-party .rdbk files.
            if (n.wp_type) { const w = wpType(n.wp_type) || wpTypeByCap(n.wp_type); if (w) n.wp_type = w.id; }
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
        // `icons` is a MAP. A file (or a server round trip through PHP, #523) can hand us an
        // empty ARRAY instead — and named keys written onto an array vanish on JSON.stringify,
        // taking every icon the author added with them. Normalise the shape once, here.
        rb.icons = (rb.icons && !Array.isArray(rb.icons)) ? rb.icons : {};
        foldInfoRows(rb);
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
        repairDegenerateBearings(rb); // a bearing taken from a duplicate vertex is meaningless (#452)
        return rb;
    }

    /* ---------------- metric recomputation (after edit/splice) ---------------- */
    // The road you ARRIVE on at a note is the road the previous note LEAVES on, so
    // road_type_in is always derived from the previous note's road_type_out (the
    // first note has no predecessor, so it arrives on the road it leaves on). Only
    // road_type_out is authored per note — the road simply continues until a note
    // changes it. Run after every edit so the invariant always holds.
    function normalizeRoadTypes(rb) {
        let prev = null;
        rb.notes.forEach((n) => {
            n.road_type_in = prev ? prev.road_type_out : n.road_type_out;
            prev = n;
        });
        return rb;
    }
    // Recomputes num, clamped idx, lat/lon, distance/partial_distance and bearings from the track.
    function recomputeMetrics(rb) {
        const cum = cumulativeM(rb.track);
        // Every row is a waypoint (a note's photos, adverts and texts hang off the note itself),
        // so the list is simply the notes in track order, renumbered from 1.
        rb.notes.sort((a, b) => a.idx - b.idx);
        rb.notes.forEach((n, i) => {
            const idx = Math.max(0, Math.min(rb.track.length - 1, n.idx | 0));
            n.idx = idx;
            const tp = rb.track[idx];
            n.lat = round6(tp.lat); n.lon = round6(tp.lon);
            n.distance = Math.round(cum[idx]);
            n.partial_distance = Math.round(i === 0 ? 0 : Math.max(0, cum[idx] - cum[rb.notes[i - 1].idx]));
            const { bIn, bOut } = deriveBearings(rb.track, idx);
            n.bearing_in = round3(bIn); n.bearing_out = round3(bOut);
            n.num = i + 1;
        });
        normalizeRoadTypes(rb);
        rb.meta.total_distance = Math.round(cum[cum.length - 1] || 0);
        rb.meta.note_count = rb.notes.length;
        return rb;
    }
    // Recompute the red CAP (heading + straight-line distance in metres to the next note) where active.
    function recomputeCaps(rb) {
        const notes = rb.notes;
        for (let i = 0; i < notes.length; i++) {
            const n = notes[i], nx = notes[i + 1];
            if (n.cap != null && nx) { n.cap = Math.round(bearingDeg(n, nx)); n.cap_distance = Math.round(haversineM(n, nx)); }
            else if (n.cap != null) { n.cap = null; n.cap_distance = null; } // target note was deleted → clear stale cap
        }
        return rb;
    }
    /* ---------------- route operations (editor tools) ---------------- */
    // Douglas-Peucker simplification with a tolerance in METRES, iterative (no recursion limit)
    // on a local equirectangular projection: the kept-vertex mask, where the endpoints and the
    // indices in `keepIdx` (note anchors) always survive; null when the track is too short to
    // simplify. simplifyRoadbook applies it.
    function simplifyKeepMask(trkpts, toleranceM, keepIdx) {
        if (!trkpts || trkpts.length < 3) return null;
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
        return keep;
    }
    /* Background removal for a custom icon (#694) — in the browser, no server, no model. A symbol
     * photographed or copied from a document sits on a flat backdrop (white paper, a coloured
     * slide) that would cover the tulip. `iconBackground` reads the image border: when one colour
     * dominates it (and the border is not already transparent) that colour is the background.
     * `removeIconBackground` then floods it from the edges — only pixels connected to the border
     * go, so a white detail INSIDE the symbol survives — and softens the rim: a pixel within
     * `tolerance` of the backdrop becomes fully transparent, one up to `feather` further fades in
     * proportion. Both work on raw RGBA (canvas ImageData.data) so they run in tests too. */
    function iconBackground(data, width, height) {
        const edge = [];
        for (let x = 0; x < width; x++) edge.push(x, (height - 1) * width + x);
        for (let y = 1; y < height - 1; y++) edge.push(y * width, y * width + width - 1);
        const bins = new Map();
        let transparent = 0;
        for (const i of edge) {
            const o = i * 4;
            if (data[o + 3] < 16) { transparent++; continue; }
            const key = (data[o] >> 4) << 8 | (data[o + 1] >> 4) << 4 | (data[o + 2] >> 4);
            const bin = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
            bin.n++; bin.r += data[o]; bin.g += data[o + 1]; bin.b += data[o + 2];
            bins.set(key, bin);
        }
        if (transparent > edge.length * 0.5) return null; // already cut out
        let top = null;
        bins.forEach((bin) => { if (!top || bin.n > top.n) top = bin; });
        if (!top || top.n < edge.length * 0.4) return null; // no single backdrop colour: a photo, not a symbol on paper
        return { r: Math.round(top.r / top.n), g: Math.round(top.g / top.n), b: Math.round(top.b / top.n) };
    }
    function removeIconBackground(data, width, height, bg, opts) {
        const tolerance = (opts && opts.tolerance) || 42, feather = (opts && opts.feather) || 36;
        const dist = (o) => Math.hypot(data[o] - bg.r, data[o + 1] - bg.g, data[o + 2] - bg.b);
        const seen = new Uint8Array(width * height), queue = [];
        const visit = (i) => { if (!seen[i]) { seen[i] = 1; queue.push(i); } };
        for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
        for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
        let removed = 0;
        while (queue.length) {
            const i = queue.pop(), o = i * 4, d = dist(o);
            if (d > tolerance + feather) continue;            // the symbol itself: the flood stops here
            if (d <= tolerance) { data[o + 3] = 0; removed++; } // backdrop
            else { data[o + 3] = Math.round(data[o + 3] * (d - tolerance) / feather); continue; } // soft rim, not spread further
            const x = i % width, y = (i - x) / width;
            if (x > 0) visit(i - 1);
            if (x < width - 1) visit(i + 1);
            if (y > 0) visit(i - width);
            if (y < height - 1) visit(i + width);
        }
        return removed;
    }
    // A local flat projection around `pt` (metres), and where `P` falls on the segment A→B in it.
    const planarAround = (pt) => { const lat0 = toRad(pt.lat); return (p) => ({ x: toRad(p.lon) * Math.cos(lat0) * EARTH_RADIUS_M, y: toRad(p.lat) * EARTH_RADIUS_M }); };
    function onSegment(P, A, B) {
        const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / l2)) : 0;
        return { t, dist: Math.hypot(P.x - (A.x + t * dx), P.y - (A.y + t * dy)) };
    }
    // Closest position ON the track polyline (not just a vertex): the segment
    // index `i` (between points i and i+1), the fraction `t` along it, the
    // projected point and its distance in metres.
    function nearestOnTrack(trkpts, pt) {
        if (!trkpts || trkpts.length < 2) return null;
        const proj = planarAround(pt), P = proj(pt);
        let best = null;
        for (let i = 0; i < trkpts.length - 1; i++) {
            const s = onSegment(P, proj(trkpts[i]), proj(trkpts[i + 1]));
            if (!best || s.dist < best.dist) best = { i, t: s.t, dist: s.dist };
        }
        const a = trkpts[best.i], b = trkpts[best.i + 1];
        return { i: best.i, t: best.t, dist: best.dist, lat: round6(a.lat + (b.lat - a.lat) * best.t), lon: round6(a.lon + (b.lon - a.lon) * best.t) };
    }
    // Where the driver is ALONG the route, relative to note i (#847): the fix projected onto the track
    // between the note before i and the note after it — never onto a loop or a parallel stretch
    // elsewhere on the route. `atM` is metres from the start, the scale of every note's `distance`
    // (both come from cumulativeM), so `notes[i].distance − atM` is what is left to the note measured
    // the way the roadbook measures its partials along the GPX track; a straight line to the waypoint
    // undercuts every bend. `cum` = cumulativeM(rb.track).
    // Even that stretch can pass the same place twice — an out-and-back to a note at the end of a
    // spur, a figure of eight — where the nearest segment is a coin toss between the two passes.
    // `hintM` (the odometer: where the driver should be, metres from the start) settles it: a pass
    // about as close as the nearest one but clearly elsewhere along the route wins when it is
    // nearer the odometer. Only a genuinely different pass can win — one more than twice the tie
    // margin away along the route — so the neighbouring segments of the same pass never do.
    const ROUTE_TIE_M = 20;
    function routeAhead(rb, cum, i, here, hintM) {
        const track = rb.track, notes = rb.notes, n = notes && notes[i];
        if (!n || !here || !track || track.length < 2) return null;
        const last = track.length - 1;
        const from = Math.max(0, Math.min(i > 0 ? notes[i - 1].idx : 0, last - 1));
        const to = Math.max(from + 1, Math.min(notes[i + 1] ? notes[i + 1].idx : last, last));
        const proj = planarAround(here), P = proj(here), passes = [];
        let best = null;
        for (let k = from; k < to; k++) {
            const s = onSegment(P, proj(track[k]), proj(track[k + 1]));
            const c = { k, t: s.t, dist: s.dist, atM: cum[k] + (cum[k + 1] - cum[k]) * s.t };
            passes.push(c);
            if (!best || c.dist < best.dist) best = c;
        }
        let at = best;
        if (hintM != null && isFinite(hintM)) {
            const tie = best.dist + ROUTE_TIE_M;
            for (const c of passes) {
                if (c.dist <= tie && Math.abs(c.atM - best.atM) > 2 * tie && Math.abs(c.atM - hintM) < Math.abs(at.atM - hintM)) at = c;
            }
        }
        return { atM: at.atM, offRouteM: at.dist };
    }
    /* Re-sync the run to where the rider actually is (#931). With Auto on, a note missed by the GPS
       (a gap, a radius too small, another line through the junction) used to strand the run: it
       sat on that note while the rider drove on. This says which note should be active instead —
       only when the rider has demonstrably SKIPPED the active one and is FOLLOWING the track
       towards the next ones. There are no fixed windows (no "next 10 notes"): the answer comes from
       where the recent fixes lie on the route and whether they keep following it.
       - Where on the route: every fix is projected onto the track from the last validated note
         on; each segment within the fix's tolerance (RESYNC_ON_ROUTE_M + its accuracy) is a place
         it may be. A fix with none is off the route, and nothing is decided.
       - Following it: the last RESYNC_FIXES fixes must chain along the route — each one ahead of
         the one before, by no more than the ground between them explains — and together cover at
         least RESYNC_FOLLOW_M of track. One fix is never enough: a GPS spike or a road that only
         crosses the route moves nothing.
       - Of every chain that holds, the one that starts earliest on the route wins: continuity with
         where the run is, so on a closed circuit the start never reads as the finish.
       - Skipped: the chain's position is past the active note (its distance on the route plus its
         radius). On the route but still heading to it, nothing changes.
       Returns the first note not yet behind that position — the notes before it are skipped — or
       -1 for "no change". `trail`: the recent moving fixes, oldest first, { lat, lon, acc }; each
       caches its candidates on itself (`cands`, keyed by the search start) so a fix is projected
       once. `radiusOf(i)` is the Reader's reach radius. */
    const RESYNC_FIXES = 4, RESYNC_FOLLOW_M = 80, RESYNC_ON_ROUTE_M = 25, RESYNC_STRETCH = 1.5;
    function routeResync(rb, cum, activeIdx, trail, radiusOf) {
        const track = rb.track, notes = rb.notes, active = notes && notes[activeIdx];
        if (!active || !trail || trail.length < RESYNC_FIXES || !track || track.length < 2 || !cum || cum.length !== track.length) return -1;
        const fromK = Math.max(0, Math.min(activeIdx > 0 ? notes[activeIdx - 1].idx : 0, track.length - 2));
        const recent = trail.slice(-RESYNC_FIXES);
        for (const p of recent) {
            if (p.cands && p.fromK === fromK) continue;
            const tol = RESYNC_ON_ROUTE_M + (p.acc || 0), proj = planarAround(p), P = proj(p), cands = [];
            for (let k = fromK; k < track.length - 1; k++) {
                const seg = onSegment(P, proj(track[k]), proj(track[k + 1]));
                if (seg.dist <= tol) cands.push(cum[k] + (cum[k + 1] - cum[k]) * seg.t);
            }
            p.cands = cands; p.fromK = fromK;
        }
        let best = null;
        for (const start of recent[0].cands) {
            let at = start;
            for (let j = 1; j < recent.length && at != null; j++) {
                const step = haversineM(recent[j - 1], recent[j]), tol = RESYNC_ON_ROUTE_M + (recent[j].acc || 0);
                let next = null;
                for (const c of recent[j].cands) {
                    if (c < at - tol || c - at > step * RESYNC_STRETCH + tol) continue; // backwards, or a leap no drive explains
                    if (next == null || Math.abs(c - at - step) < Math.abs(next - at - step)) next = c;
                }
                at = next;
            }
            if (at == null || at - start < RESYNC_FOLLOW_M) continue;
            if (!best || start < best.start) best = { start, at };
        }
        if (!best || best.at <= active.distance + radiusOf(activeIdx)) return -1;
        for (let j = activeIdx + 1; j < notes.length; j++) if (notes[j].distance + radiusOf(j) > best.at) return j;
        return -1; // past the last note: the run is finished by the rider, never by a re-sync
    }
    // What is left to note i (#847): along the route like the roadbook's own partials, so the partial
    // driven plus what is left add up to the note's partial — but never less than the straight line
    // to the waypoint. The route can only be longer than that, and a driver who is not on the
    // stretch around the note (on the way to the start, off on a detour) would otherwise read the
    // bit of route nearest to them: 0.00 in the car park before the first note. Without a route
    // (`cum` shorter than 2) the straight line is all there is.
    function leftToNote(rb, cum, i, here, hintM) {
        const n = rb.notes[i], straight = haversineM(here, n);
        const a = cum && cum.length > 1 ? routeAhead(rb, cum, i, here, hintM) : null;
        return a ? Math.max(n.distance - a.atM, straight) : straight;
    }
    // Simplify rb.track (notes' anchor points always survive), then remap and recompute.
    function simplifyRoadbook(rb, toleranceM) {
        const keep = simplifyKeepMask(rb.track, toleranceM, rb.notes.map((n) => n.idx));
        if (keep) {
            // Exact old→new index remap: every note's own vertex is in the mask, so its new
            // index is the count of kept vertices before it. Never re-anchor spatially here —
            // on a loop/out-and-back a nearest-vertex search can snap a note to the OTHER pass
            // of the same spot and scramble the note order (#216).
            const newIdx = new Int32Array(keep.length);
            let k = 0;
            for (let i = 0; i < keep.length; i++) newIdx[i] = keep[i] ? k++ : -1;
            rb.track = rb.track.filter((_, i) => keep[i]);
            rb.notes.forEach((n) => { n.idx = newIdx[n.idx] >= 0 ? newIdx[n.idx] : nearestIdx(rb.track, n); });
        }
        recomputeMetrics(rb); recomputeCaps(rb);
        return rb;
    }
    // Reverse the direction of travel: track flipped, notes re-anchored and
    // re-ordered. The road a note now LEAVES on is the one it used to arrive on,
    // so road_type_out becomes the old road_type_in; recomputeMetrics re-derives
    // road_type_in (and bearings/CAPs follow).
    function reverseRoadbook(rb) {
        rb.track.reverse();
        const last = rb.track.length - 1;
        rb.track.forEach((p) => { delete p.t; });
        rb.notes.forEach((n) => { n.idx = last - n.idx; n.road_type_out = n.road_type_in; });
        recomputeMetrics(rb); recomputeCaps(rb);
        return rb;
    }
    // A bare note anchored at track index `idx` — recomputeMetrics fills in the rest. The one
    // shape every tool that adds a note starts from.
    const bareNote = (rb, idx, roadType) => ({ num: 0, idx, distance: 0, partial_distance: 0, lat: rb.track[idx].lat, lon: rb.track[idx].lon, text: '', cap: null, cap_distance: null, bearing_in: 0, bearing_out: 0, road_type_in: roadType, road_type_out: roadType, junctions: null, icons: [] });
    // Lengthen the route with another track (the Editor's Add GPX). `piece` is oriented so its
    // FIRST point meets the joined end: after the finish, or — `atStart` — before the start,
    // running into it. A first point ON the joined end is not duplicated; one merely near it is
    // kept, the route bridging to it. Every joined point keeps its elevation and time (#158) so a
    // later join can still read the time span, the existing notes keep their own vertices, and a
    // new end note rides the new tip.
    function joinTrack(rb, piece, atStart) {
        const end = atStart ? rb.track[0] : rb.track[rb.track.length - 1];
        const pts = piece.slice(haversineM(end, piece[0]) < 1 ? 1 : 0).map((p) => {
            const q = { lat: p.lat, lon: p.lon };
            if (p.ele != null && isFinite(p.ele)) q.ele = p.ele;
            if (p.t != null) q.t = p.t;
            return q;
        });
        if (atStart) {
            const first = rb.notes[0];
            rb.track = pts.reverse().concat(rb.track);
            rb.notes.forEach((n) => { n.idx += pts.length; });
            rb.notes.push(bareNote(rb, 0, first ? first.road_type_out : 3));
        } else {
            const last = rb.notes[rb.notes.length - 1];
            rb.track = rb.track.concat(pts);
            rb.notes.push(bareNote(rb, rb.track.length - 1, last ? last.road_type_out : 3));
        }
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
    // Serialize a KML 2.2 document (for KMZ export): route as a LineString + waypoints as
    // Point Placemarks. KMZ = a ZIP containing doc.kml — the caller wraps it with RBZip.
    function kmlDocument(name, pts, wpts) {
        const x = xmlEsc;
        const coords = pts.map((p) => `${p.lon},${p.lat}${p.ele != null ? ',' + Math.round(p.ele) : ''}`).join(' ');
        const trk = (pts && pts.length) ? `<Placemark><name>${x(name || 'RDBK route')}</name><LineString><coordinates>${coords}</coordinates></LineString></Placemark>` : '';
        const wptXml = (wpts || []).map((w) => {
            let desc = '';
            if (w.desc) desc += '<description>' + x(w.desc) + '</description>';
            return `<Placemark><name>${x(w.name || '')}</name>${desc}<Point><coordinates>${w.lon},${w.lat}</coordinates></Point></Placemark>`;
        }).join('');
        return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${x(name || 'RDBK route')}</name>${trk}${wptXml}</Document></kml>`;
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
            if (n.wp_type) { const w = wpType(n.wp_type); ext.push(`<openrally:wptType>${x(w ? w.cap : n.wp_type)}</openrally:wptType>`); }
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
        }).filter(Boolean).join('');
        const totalM = (rb.track && rb.track.length > 1) ? cumulativeM(rb.track)[rb.track.length - 1] : (rb.meta && rb.meta.total_distance) || 0;
        return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="RDBK.app" xmlns="http://www.topografix.com/GPX/1/1" xmlns:openrally="${NS}">`
            + `<metadata><name>${x(name)}</name><extensions><openrally:units>metric</openrally:units><openrally:distance>${(totalM / 1000).toFixed(3)}</openrally:distance></extensions></metadata>`
            + `${wpts}<trk><name>${x(name)}</name><trkseg>${trkpts}</trkseg></trk></gpx>`;
    }

    // Deep-clone the roadbook with OpenRally cap codes in place of internal wp_type
    // IDs, so .rdbk export / server save carry interoperable codes (WPM, WPN, …)
    // instead of internal ones (masked, navigation, …). The clone leaves rb unchanged.
    function roadbookForExport(rb) {
        const out = JSON.parse(JSON.stringify(rb));
        (out.notes || []).forEach((n) => {
            if (n.wp_type) { const w = wpType(n.wp_type); if (w && w.cap) n.wp_type = w.cap; }
        });
        return out;
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

    /* ---------------- consistency report (#339) ---------------- */
    // What is probably a mistake in a roadbook but is NOT something the editor can fix on its own,
    // so it has to be shown to the author before a save. Returns one finding per problem, in
    // reading order: { code, count?, notes? } where `notes` holds the note NUMBERS involved.
    // Codes and numbers only — the wording lives in the UI, translated, never here.
    //
    // A note without a radius of its own is not a finding: it validates at the roadbook default,
    // then the type default, then the system one (RB.detectionRadius) — always a real radius (#773).
    //
    //   speed_zone_unclosed   — a note imposes a speed limit that no later note ever lifts (a
    //                           controlled zone with a start and no finish).
    //   speed_zone_unopened   — a note lifts a speed limit while none is in force.
    function consistencyReport(rb) {
        const notes = (rb && rb.notes) || [];
        const findings = [];
        const numberOf = (note, i) => (note.num != null ? note.num : i + 1);

        // Walk the notes once, tracking the limit in force: >0 opens a controlled zone, 0 lifts it.
        // Only the LAST zone can stay unclosed — any later 0 closes whatever was open.
        const unopened = [];
        let openedAt = null;
        notes.forEach((n, i) => {
            const limit = speedLimitOfNote(n);
            if (limit == null) return;
            if (limit > 0) { if (openedAt == null) openedAt = numberOf(n, i); }   // a further limit inside a zone just changes it
            else if (openedAt != null) openedAt = null;
            else unopened.push(numberOf(n, i));
        });
        if (openedAt != null) findings.push({ code: 'speed_zone_unclosed', count: 1, notes: [openedAt] });
        if (unopened.length) findings.push({ code: 'speed_zone_unopened', count: unopened.length, notes: unopened });

        return findings;
    }

    /* ---------------- competition scoring (the Reader accrues → META → the Ranking scores) ---------------- */
    // Scored sections (rally special stages): only notes between a stage-start marker and the
    // next stage-end marker (both inclusive) are penalised; liaison/transfer notes outside them
    // are not. A marker is the FIA waypoint type (ss_start/ss_end — DSS/ASS) or the
    // start/finish icon. Returns null when the roadbook has no start marker — all notes scored.
    const START_ICON = 'I02_partenza.png', FINISH_ICON = 'I01_arrivo.png';
    function scoredNoteSet(notes) {
        // A stage opens on the FIA selective-section start (wp_type 'ss_start' = DSS) or the
        // start icon, and closes on 'ss_end' (ASS) or the finish icon (#215).
        const has = (n, name) => (n.icons || []).some((ic) => ic.name === name);
        const opens = (n) => n.wp_type === 'ss_start' || has(n, START_ICON);
        const closes = (n) => n.wp_type === 'ss_end' || has(n, FINISH_ICON);
        if (!notes.some(opens)) return null;
        const set = new Set();
        let inStage = false;
        notes.forEach((n, i) => { if (opens(n)) inStage = true; if (inStage) set.add(i); if (closes(n)) inStage = false; });
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

    /* ---------------- result META (55-char QR payload) ---------------- */
    const META_KEYS = ['team', 'date', 'start', 'end', 'accuracy', 'skip', 'extra', 'cap', 'speed', 'km', 'avg', 'rb'];
    // `rb` carries only a fixed-width slug PREFIX (the payload must stay a compact QR).
    // metaRbPrefix is the single source of truth for how many characters count, so the
    // producer (buildMeta) and the consumer (ranking's roadbook match) never disagree.
    function metaRbPrefix(slug) { return String(slug || '').slice(0, CONST.META_WIDTHS[META_KEYS.indexOf('rb')]); }
    function buildMeta(f) {
        // Fixed-width fields: numeric (padStart zero, saturate all-9s) or the `rb` string
        // (slug prefix, padEnd with spaces). padStart restores leading zeros for date/start/end.
        return META_KEYS.map((k, i) => {
            const w = CONST.META_WIDTHS[i];
            if (k === 'rb') return metaRbPrefix(f[k]).padEnd(w, ' ');
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
    // The meta of a signed result payload, without its signature (the whole text when unsigned).
    // The signature is 10 hex chars (never a '-'), so the last '-' is always the separator; the meta
    // is never trimmed — the rb field's trailing padding is part of the signed string.
    function metaOf(payload) {
        const s = String(payload).trim(); // tolerate stray whitespace around the whole QR text
        const i = s.lastIndexOf('-');
        return i < 0 ? s : s.slice(0, i);
    }
    async function verifyMeta(payload, key) {
        const s = String(payload).trim(), meta = metaOf(s);
        if (meta === s) return { meta, valid: false }; // no signature → not a valid result
        try { return { meta, valid: (await hmacHex(meta, key || '')).slice(0, 10) === s.slice(meta.length + 1) }; }
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
    // How many characters the longest total distance takes as "km.dd" (#730): a note list sizes its
    // distance column from it, so a 123.45 km roadbook lines up instead of sticking out.
    function distanceChars(notes) {
        return Math.max(4, ...(notes || []).map((n) => ((n.distance ?? 0) / 1000).toFixed(2).length));
    }
    // The email addresses in a pasted list or a CSV (#153) — any column, any order, header or not
    // (the participants export works as it is): each found once, lower-cased, in reading order.
    function parseEmailList(text) {
        const seen = new Set(), out = [];
        for (const m of String(text || '').matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
            const e = m[0].toLowerCase();
            if (!seen.has(e)) { seen.add(e); out.push(e); }
        }
        return out;
    }
    // Keep the roadbooks that suit ANY of the picked vehicles (#713) — the gallery filter. Nothing
    // picked keeps everything; a roadbook lists its vehicles as ['car', 'moto', 'bike'] (any subset).
    const VEHICLES = ['car', 'moto', 'bike'];
    function filterByVehicles(list, picked) {
        if (!picked || !picked.length) return (list || []).slice();
        return (list || []).filter((item) => (item.vehicles || []).some((v) => picked.includes(v)));
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
        // a checkpoint the user declined stays on the device but is never offered again (#436)
        snap = Object.fromEntries(Object.entries(snap || {}).filter(([, v]) => !(v && v.declined)));
        const out = [];
        const draft = snap.rb_editor_draft;
        if (draft && draft.rb && draft.rb.meta && Array.isArray(draft.rb.notes)) {
            out.push({ tool: 'editor', url: 'editor/', keys: ['rb_editor_draft'], kind: 'draft',
                title: draft.rb.meta.title || '', noteCount: draft.rb.notes.length });
        }
        // A recording — still running, or finished and waiting for Save / Discard (its session, or the
        // stash kept across the sign-in trip). Only resumable from here: the Recorder's own Discard is
        // the one that also drops its queued photos and its draft (#460).
        const rec = snap.rb_recorder_session, stash = snap.rb_recorder_pending_save;
        const finished = rec && rec.finishing ? rec : (stash && stash.finishing ? stash : null);
        if (rec && rec.recording) {
            out.push({ tool: 'recorder', url: 'recorder/', keys: ['rb_recorder_session'], kind: 'recording', resumeOnly: true,
                distanceM: rec.recordedM || 0 });
        } else if (finished) {
            out.push({ tool: 'recorder', url: 'recorder/', keys: [], kind: 'finished', resumeOnly: true, distanceM: finished.recordedM || 0 });
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
    // Shareable event join link (#349): inside the native app location.origin is the
    // WebView-local host (capacitor://localhost), so links use the public web root there.
    function eventLink(code) {
        const native = typeof window !== 'undefined' && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
        const root = native ? 'https://rdbk.app' : (typeof location !== 'undefined' ? location.origin : 'https://rdbk.app');
        return root + '/go/' + code;
    }
    const RB = {
        ROAD_TYPES, CONST, WP_TYPES, ROADBOOK_STATUSES, roadbookStatus, wpType, wpTypeByCap, wpTypesForProfile, wpBadgeSVG, detectionRadius, reachRadius, noteReached, notePassed, autoReachedIdx, courseFrom, courseTrail, manualGate,
        geo: { haversineM, bearingDeg, destPoint },
        parseGPX, parseWPT, buildRoadbook, importRoadbook, parseOpenRally,
        recomputeMetrics, recomputeCaps, normalizeRoadTypes, speedLimitOfNote, speedLimitFromName, consistencyReport, appwptFromImport, tulipToDataURL,
        simplifyRoadbook, reverseRoadbook, joinTrack, routeAhead, routeResync, leftToNote, tulipShape, tulipContext, TULIP_SHAPE_M, bareNote, iconBackground, removeIconBackground, gpxDocument, kmlDocument, openRallyDocument, appWaypointSymbol, nearestOnTrack,
        buildMeta, parseMeta, metaRbPrefix, signMeta, verifyMeta, metaOf, iconSrc,
        scoredNoteSet, isScoredIdx, validationPenalties, speedPenalty, skipPenalty, rankEntry, speedBand, hhmmss, ddmmyy, parseHms,
        roadbookForExport, NOTE_BLOCKS, blockType, noteBlocks, isEndNote, isFirstNote,
        nearestIdx, nearestIdxByTime, resolveIdx, round6, slug, urlToDataURL, pad2, filterByText, filterRoadbooks, filterByVehicles, VEHICLES, parseEmailList, distanceChars, deleteNote, pendingWork,
        cumulativeM, deriveBearings, repairDegenerateBearings, recJunkFix, gpsHealth, recStepM, odometerStep,
        eventLink,
    };
    // The browser uses the global; Node (the test runner) imports the same object.
    if (typeof window !== 'undefined') window.RB = RB;
    if (typeof module !== 'undefined' && module.exports) module.exports = RB;
})();
