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
    const noteBlocks = (n, placement) => ((n && Array.isArray(n.blocks)) ? n.blocks : [])
        .filter((b) => b && (!placement || (b.placement === 'before' ? 'before' : 'after') === placement));

    /* ---------------- the .rdbk format ---------------- */
    // The version of the .rdbk standard this code reads and writes (`rdbk_version` in every file).
    const FORMAT_VERSION = 1;

    /* ---------------- road types ---------------- */
    // The road a note leaves on (`road_type`) and the road a junction branch shows. The strokes are
    // the FIA Road Book Lexicon's (Cross Country, 2026): tarmac a DOUBLE line, a track a solid one, a
    // low-visible track long–short dashes, off track short square dashes. The bike lane is the
    // format's own addition — the FIA knows no bicycles (#561). Every road is ROAD_WIDTH wide in the
    // 230×162 vignette box; `dash` is its SVG dash pattern in the same units, `double` splits the
    // stroke into two lines with a DOUBLE_GAP-wide white centre. The colour is how the app tells them
    // apart at a glance. Each entry carries its NAME, so every control names the types from one place.
    const ROAD_WIDTH = 8, DOUBLE_GAP = 2;
    const ROAD_TYPES = [
        { id: 1, name: 'Tarmac',            color: '#22c55e', dash: '',         double: true },
        { id: 2, name: 'Track',             color: '#ff5a45', dash: '',         double: false },
        { id: 3, name: 'Low-visible track', color: '#ff5a45', dash: '24 8 8 8', double: false },
        { id: 4, name: 'Off track',         color: '#ff5a45', dash: '8 8',      double: false },
        { id: 5, name: 'Bike lane',         color: '#532b78', dash: '',         double: false },
    ];
    // A road that says nothing else is a track.
    const DEFAULT_ROAD_TYPE = 2;
    const ROAD_TYPE_BY_ID = Object.fromEntries(ROAD_TYPES.map((r) => [r.id, r]));
    const roadType = (id) => ROAD_TYPE_BY_ID[id] || ROAD_TYPE_BY_ID[DEFAULT_ROAD_TYPE];

    /* A roadbook's publication lifecycle (#96): draft (in progress, private) → ready
       (done, private) → public (visible to anyone). The DB `status` column mirrors this
       list; the client builds its status controls from it. Unknown values fall back to
       'draft' — the same normalisation the API does server-side. */
    const ROADBOOK_STATUSES = ['draft', 'ready', 'public'];
    const roadbookStatus = (s) => ROADBOOK_STATUSES.includes(s) ? s : 'draft';

    /* ---------------- waypoint types (FIA characterization, #63) ----------------
       One optional per-note `waypoint_type`, its `id` written as it is. The editor offers a scope
       (`tier`: core in every roadbook, rally with the full FIA set). A "zone" is a start note +
       an end note — there is no zones[] structure. `cap` is the badge acronym and the OpenRally
       code the OpenRally import/export translates to; `color` follows the FIA roadbook convention
       (orange = zone start, green = zone end/finish, yellow = control). `radius` is the default
       validation radius (metres). `sym`/`osm` map the type to a Garmin <sym> / OSMAnd icon so the
       type carries into the GPX export. Verified against the FIA Road Book Lexicon (2026). */
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
    // Look up a type by its OpenRally code (e.g. 'WPM' → masked) — the OpenRally import.
    function wpTypeByCap(cap) { return (cap && WP_TYPE_BY_CAP[cap]) || null; }
    // The types the editor offers in a scope: core always; rally adds the full FIA set.
    function wpTypesForProfile(profile) { return WP_TYPES.filter((w) => w.tier === 'core' || profile === 'rally'); }
    // The geofence radius (metres) for auto-validating a note. Precedence: the note's own
    // validation_radius → the roadbook default → the type's default → the system default. The
    // Reader still caps this by neighbour spacing and floors it for GPS noise.
    function detectionRadius(note, meta) {
        if (note && note.validation_radius != null) return note.validation_radius;
        if (meta && meta.default_validation_radius != null) return meta.default_validation_radius;
        const w = note && wpType(note.waypoint_type);
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
    // kept as the note's `imported_tulip` (it can't be decomposed into symbols/junctions).
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
            if (isFinite(lat) && isFinite(lon)) { const ele = parseFloat(p.querySelector('ele')?.textContent); trkpts.push(isFinite(ele) ? { lat, lon, elevation: Math.round(ele) } : { lat, lon }); }
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
            track = raws.map((r) => ({ lat: r.lat, lon: r.lon }));
            idxOf = (r, i) => i;
            warnings.push('builtTrackFromWaypoints');
        } else {
            // distance-only: a placeholder line east of (0,0) spaced by cumulative distance (~m → lon°)
            let prev = -1;
            const dists = raws.map((r) => { let d = r.distM == null ? prev + 1 : r.distM; if (d <= prev) d = prev + 1; prev = d; return d; });
            track = dists.map((d) => ({ lat: 0, lon: d / 111320 }));
            idxOf = (r, i) => i;
            warnings.push('placeholderTrack');
        }

        const notes = raws.map((r, i) => {
            const note = blankNote(idxOf(r, i), DEFAULT_ROAD_TYPE);
            note.text = wptText({ name: r.name });
            if (r.cap != null) note.cap = Math.round(normDeg(r.cap)) % 360;
            if (r.danger >= 1 && r.danger <= 3) note.danger = Math.round(r.danger);
            const orPass = r.or.filter((e) => {
                if (e.tag === 'wptType') { const w = wpType(e.text) || wpTypeByCap(e.text); if (w) { note.waypoint_type = w.id; return false; } }
                return true;
            });
            // every other openrally: parameter travels untouched, for the OpenRally export
            if (orPass.length) note.compatibility = { openrally: orPass };
            const image = tulipToDataURL(r.tulip);
            if (image) note.imported_tulip = { image, shown: true }; // the whole vignette, kept for good (#943)
            return note;
        });

        const rb = newRoadbook(name, track, notes);
        recomputeMetrics(rb); // the cap stays the one OpenRally wrote — no recomputeCaps
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
       73 px in, 95 px out (longer than the classic 63 px exit, so the bend reads), shrunk only
       where it would leave the box — so a motorbike roadbook and a walking one draw at the same size and the
       drawing never leaves the box. The points counted are the ones inside the circle of
       TULIP_SHAPE_M around the note — the ring the Editor draws. A shape that would curl back over
       the note (the exit below it, the entry above it) stays classic.
       The classic straight exit aims where the road goes over its first TULIP_AIM_M — not over its
       first metre (the stored bearing_out), which on a recorded track is GPS noise: a clean right
       angle read as 37° — unless that aim would run over a branch, where the stored angle stays.
       Vignette coordinates: the 230×162 box, y down, the note at its centre (115, 81). Returns
       { entry, exit, turn } — `entry` a polyline from its far end in to the centre, `exit` one from
       the centre outwards, each or null; `turn` the classic exit's angle (degrees clockwise from
       straight on), absent where the stored bearings stand. Nothing is ever stored in the roadbook:
       to change a shape, add or move points on the track. */
    const TULIP_SHAPE_M = 30, TULIP_SHAPE_POINTS = 4, TULIP_MIN_M = 12, TULIP_AIM_M = 20;
    const TULIP_ENTRY_PX = 73, TULIP_EXIT_PX = 63, TULIP_CURVE_EXIT_PX = 95, TULIP_EDGE_PX = 14, TULIP_STRAIGHT_M = 2;
    const TULIP_CX = 115, TULIP_CY = 81, TULIP_GUARD_PX = 16, TULIP_OVERLAP_PX = 6, TULIP_LEG_PX = 5, TULIP_ARROW_LEG_PX = 14, TULIP_BRANCH_CLEAR_PX = 12;
    // The track from note i along `dir` (+1 forward, -1 back), as metres east/north of the note.
    // `within`: the stretch inside the circle of that radius around the note — exactly the ring the
    // Editor draws, what you see inside it is what counts — ending where the track crosses it (or at
    // the neighbouring note), with how many of the track's own points lie inside. `along`: the first
    // metres along the track instead (the classic exit's aim). `verts` are the track points walked
    // ({k: track index, s: metres along}) and `beyond` the index the stretch ends towards when it
    // stops on the circle's edge.
    function tulipWalk(rb, i, dir, { within, along }) {
        const track = rb.track, notes = rb.notes, n = notes[i], at = n && track && track[n.track_index];
        if (!at) return null;
        const stop = notes[i + dir] ? notes[i + dir].track_index : (dir > 0 ? track.length - 1 : 0);
        const proj = planarAround(at), O = proj(at), pts = [{ x: 0, y: 0 }], verts = [];
        let len = 0, points = 0, beyond = null;
        for (let k = n.track_index + dir; dir > 0 ? k <= stop : k >= stop; k += dir) {
            const P = proj(track[k]), prev = pts[pts.length - 1];
            const q = { x: P.x - O.x, y: P.y - O.y }, step = Math.hypot(q.x - prev.x, q.y - prev.y);
            if (step < 0.01) continue; // a duplicate vertex (#452)
            if (along != null && len + step >= along) {
                const f = (along - len) / step;
                pts.push({ x: prev.x + (q.x - prev.x) * f, y: prev.y + (q.y - prev.y) * f });
                len = along; break;
            }
            if (within != null && Math.hypot(q.x, q.y) > within) {
                // out of the circle: the stretch ends on its edge (the segment's crossing point)
                const dx = q.x - prev.x, dy = q.y - prev.y, a = dx * dx + dy * dy, b = 2 * (prev.x * dx + prev.y * dy), c = prev.x * prev.x + prev.y * prev.y - within * within;
                const f = Math.max(0, Math.min(1, (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a)));
                const edge = { x: prev.x + dx * f, y: prev.y + dy * f };
                len += Math.hypot(edge.x - prev.x, edge.y - prev.y); pts.push(edge); beyond = k; break;
            }
            pts.push(q); len += step; points++; verts.push({ k, s: len });
        }
        return { pts, len, points, verts, beyond };
    }
    function tulipStretch(rb, i, dir, opts) {
        const w = tulipWalk(rb, i, dir, opts);
        return w && w.len >= TULIP_MIN_M ? w : null;
    }
    // How many track points shape each side of note i's tulip — the ones inside the TULIP_SHAPE_M
    // circle, before it (the road you arrive on) and after it (the one you leave on) — against the
    // TULIP_SHAPE_POINTS a curve needs. A side with no road drawn in the tulip is null.
    function tulipPoints(rb, i) {
        const notes = (rb && rb.notes) || [], n = notes[i];
        if (!n || !rb.track || !rb.track[n.track_index]) return null;
        const count = (dir) => { const w = tulipWalk(rb, i, dir, { within: TULIP_SHAPE_M }); return w && w.len > 0 ? w.points : null; };
        return { before: isFirstNote(notes, i) ? null : count(-1), after: isEndNote(notes, i) ? null : count(1), need: TULIP_SHAPE_POINTS };
    }
    // Give each side of note i's tulip the TULIP_SHAPE_POINTS points a curve needs, without changing
    // the route: every new point lies ON the track, spread evenly inside the circle (at 1/5, 2/5…
    // of the stretch) and skipped where a point already stands within TULIP_POINT_GAP_M. `isOpen(a,
    // b)` names a segment that must stay as it is (an open cut). The notes after an insertion shift
    // along. Returns how many points were added.
    const TULIP_POINT_GAP_M = 1.5;
    function tulipAddPoints(rb, i, isOpen) {
        const pts = tulipPoints(rb, i);
        if (!pts) return 0;
        let added = 0;
        [[-1, pts.before], [1, pts.after]].forEach(([dir, have]) => {
            if (have == null || have >= TULIP_SHAPE_POINTS) return;
            const first = tulipWalk(rb, i, dir, { within: TULIP_SHAPE_M });
            const targets = [];
            for (let j = 1; j <= TULIP_SHAPE_POINTS; j++) targets.push(first.len * j / (TULIP_SHAPE_POINTS + 1));
            // the free spots first: the ones farthest from the points already there
            const room = (s, w) => Math.min(s, ...w.verts.map((v) => Math.abs(v.s - s)));
            targets.sort((x, y) => room(y, first) - room(x, first));
            for (const target of targets) {
                const w = tulipWalk(rb, i, dir, { within: TULIP_SHAPE_M }), n = rb.notes[i];
                if (w.points >= TULIP_SHAPE_POINTS) break;
                if (room(target, w) < TULIP_POINT_GAP_M) continue;
                // the stretch of track the target falls on: note → point → … → the circle's edge
                const anchors = [{ k: n.track_index, s: 0 }].concat(w.verts);
                const j = anchors.findIndex((v, m) => m === anchors.length - 1 || anchors[m + 1].s > target);
                const from = anchors[j], next = anchors[j + 1], to = next ? next.k : w.beyond;
                if (to == null) continue;
                const A = rb.track[from.k], B = rb.track[to];
                if (isOpen && isOpen(rb.track[Math.min(from.k, to)], rb.track[Math.max(from.k, to)])) continue;
                const f = Math.min(1, (target - from.s) / ((next ? next.s - from.s : haversineM(A, B)) || 1));
                const pt = { lat: round6(A.lat + (B.lat - A.lat) * f), lon: round6(A.lon + (B.lon - A.lon) * f) };
                if (A.elevation != null && B.elevation != null) pt.elevation = Math.round(A.elevation + (B.elevation - A.elevation) * f);
                if (A.time_ms != null && B.time_ms != null) pt.time_ms = Math.round(A.time_ms + (B.time_ms - A.time_ms) * f);
                // between the two, next to the far one: past any duplicates of the near one
                const at = dir > 0 ? to : to + 1;
                rb.track.splice(at, 0, pt);
                rb.notes.forEach((m) => { if (m.track_index >= at) m.track_index++; });
                added++;
            }
        });
        return added;
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
        const branches = (n.junctions || []).filter((b) => b && b.from && b.to)
            .map((b) => [[TULIP_CX + b.from[0], TULIP_CY - b.from[1]], [TULIP_CX + b.to[0], TULIP_CY - b.to[1]]]);
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
            const st = tulipStretch(rb, i, dir, { within: TULIP_SHAPE_M });
            if (!st || st.points < TULIP_SHAPE_POINTS) return null; // a point or two: the classic straight road
            // the author placed these points: kept as drawn, only a sub-metre wobble smoothed away
            const simple = tulipSimplify(st.pts, 0.5);
            if (simple.length < 3 || stray(simple) < TULIP_STRAIGHT_M) return null; // drawn straight
            // shrunk about the note if it would leave the box: the arrowhead stays inside
            const drawn = toBox(simple, px / st.len);
            const room = drawn.reduce((f, [x, y]) => {
                const dx = x - TULIP_CX, dy = y - TULIP_CY;
                const fx = dx ? (dx > 0 ? 230 - TULIP_EDGE_PX - TULIP_CX : TULIP_CX - TULIP_EDGE_PX) / Math.abs(dx) : Infinity;
                const fy = dy ? (dy > 0 ? 162 - TULIP_EDGE_PX - TULIP_CY : TULIP_CY - TULIP_EDGE_PX) / Math.abs(dy) : Infinity;
                return Math.min(f, fx, fy);
            }, 1);
            const line = legible(drawn.map(([x, y]) => [TULIP_CX + (x - TULIP_CX) * room, TULIP_CY + (y - TULIP_CY) * room]), dir);
            // the author's own drawing: it may run beside a branch they drew too — only never back over the note
            if (line.length < 3 || curlsBack(line, dir)) return null;
            const rounded = line.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
            return dir < 0 ? rounded.reverse() : rounded; // the entry runs from its far end in to the centre
        };
        const entry = isFirst ? null : side(-1, TULIP_ENTRY_PX), exit = isEnd ? null : side(1, TULIP_CURVE_EXIT_PX);
        if (exit || isEnd) return { entry, exit };
        // the classic straight exit, aimed along the road's first metres
        const aim = tulipStretch(rb, i, 1, { along: TULIP_AIM_M });
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
    // Live-recording intake (Recorder · the Editor's record/adjust · the GPX logger): a fix
    // worse than FIX_ACC_MAX_M is junk; the sampling step scales with the accuracy — dense
    // detail with a good fix, no jitter with a weak one.
    const recJunkFix = (acc) => acc != null && acc > CONST.FIX_ACC_MAX_M;
    // How healthy a GPS fix is (#901) — the ONE scale the status bar and the Recorder's start read:
    // 'good' ≤ GPS_GOOD_M · 'fair' up to FIX_ACC_MAX_M, still recorded · 'weak' beyond it, a fix the
    // recording throws away · 'none' without one.
    const gpsHealth = (acc) => (acc == null || !isFinite(acc) ? 'none' : acc <= CONST.GPS_GOOD_M ? 'good' : acc <= CONST.FIX_ACC_MAX_M ? 'fair' : 'weak');
    const recStepM = (acc) => Math.max(2.5, (acc || 10) * 0.35);

    /* Live tracking for event organizers (#947 · #970). The Reader shares its position only in the
       run of a roadbook of an event the user takes part in (an ACTIVE participant) and said yes to —
       asked once per event (liveAllowed over live_status's events) — never outside a run. Then it
       sends its last trusted position every LIVE_EVERY_MS, or
       sooner once it moved LIVE_MOVE_M, never retrying a failed send sooner than LIVE_RETRY_MS: live
       means now, so there is no backlog, just the latest position once the connection is back
       (liveDue). The organizers' map reads how fresh each one is (liveFreshness). */
    const LIVE_EVERY_MS = 15000, LIVE_MOVE_M = 50, LIVE_RETRY_MS = 5000, LIVE_FRESH_S = 60, LIVE_STALE_S = 300;
    const liveAllowed = (events) => (events || []).some((e) => e && e.consent === 1);
    // sent: {at, lat, lon} of the last position that went through (null: none yet) · tried: when the
    // last attempt was made, successful or not
    function liveDue(sent, tried, here, now) {
        if (!here) return false;
        if (tried != null && now - tried < LIVE_RETRY_MS) return false;
        if (!sent) return true;
        return now - sent.at >= LIVE_EVERY_MS || haversineM(sent, here) >= LIVE_MOVE_M;
    }
    const liveFreshness = (ageS, stopped) => (stopped ? 'ended' : ageS < LIVE_FRESH_S ? 'live' : ageS <= LIVE_STALE_S ? 'stale' : 'lost');


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
    // A roadbook in memory: the .rdbk document plus the values every reader derives from it
    // (hydrate). New roadbooks start here, whatever they are made from.
    function newRoadbook(title, track, notes) {
        return { rdbk_version: FORMAT_VERSION, meta: { title: title || 'roadbook', default_validation_radius: CONST.REACH_DEFAULT_M }, track, notes, symbols: {} };
    }
    // A note's authored fields at their defaults, anchored at track index `trackIndex` — the one
    // shape every tool that adds a note starts from; recomputeMetrics derives the rest.
    const blankNote = (trackIndex, road) => ({ track_index: trackIndex, text: '', road_type: road || DEFAULT_ROAD_TYPE, cap: null, symbols: [], junctions: [] });
    // A GPS fix ({lat, lon, ele, t} — GPX's own words) → a point of a roadbook's track.
    function trackPoint(p) {
        const tp = { lat: round6(p.lat), lon: round6(p.lon) };
        if (p.ele != null && isFinite(p.ele)) tp.elevation = Math.round(p.ele);
        if (p.t != null && isFinite(p.t)) tp.time_ms = Math.round(p.t);
        return tp;
    }
    // A roadbook's track as GPS fixes again — what the GPX and KML serializers write.
    const trackFixes = (track) => (track || []).map((p) => ({ lat: p.lat, lon: p.lon, ele: p.elevation, t: p.time_ms }));

    function buildRoadbook({ name, trkpts, wpts }) {
        if (!trkpts || trkpts.length < 2) throw new Error('The GPX track has too few points.');
        // guarantee a start note and an end note
        const pts = (wpts && wpts.length) ? wpts.slice() : [];
        const hasStart = pts.some((w) => resolveIdx(trkpts, w) === 0);
        const hasEnd = pts.some((w) => resolveIdx(trkpts, w) === trkpts.length - 1);
        if (!hasStart) pts.push({ lat: trkpts[0].lat, lon: trkpts[0].lon, name: 'start', num: 0 });
        if (!hasEnd) pts.push({ lat: trkpts[trkpts.length - 1].lat, lon: trkpts[trkpts.length - 1].lon, name: 'end', num: 9999 });

        // resolve each waypoint's track index (by time when available) and order along the track
        const placed = pts.map((w) => ({ ...w, track_index: resolveIdx(trkpts, w) }))
            .sort((a, b) => a.track_index - b.track_index)
            .filter((w, i, arr) => i === 0 || w.track_index !== arr[i - 1].track_index); // one note per point

        const notes = placed.map((w) => {
            const note = blankNote(w.track_index, DEFAULT_ROAD_TYPE);
            note.text = wptText(w);
            if (w.icon) note.symbols.push({ name: w.icon, position: [0, 0], size: 40, angle: 0, mirrored: false });
            if (w.danger) note.danger = w.danger;       // recovered from an imported special_marker
            if (w.appwpt) note.compatibility = { gpx: gpxCompatibility(w.appwpt) }; // an unmapped Garmin/OSMAnd icon, re-emitted by the GPX export as it came
            if (w.blocks && w.blocks.length) note.blocks = w.blocks; // its material, e.g. the Recorder's photo (#792)
            return note;
        });
        return recomputeMetrics(newRoadbook(name, trkpts.map(trackPoint), notes));
    }

    /* ---------------- Roadbook Suite import ----------------
       Roadbook System's editor (Roadbook Suite) writes its own JSON: Italian keys, kilometres, `bivio`
       junctions in a +y-down box, symbols anchored at their top-left corner. It is another program's
       format, imported like GPX or OpenRally: every field is translated into a .rdbk roadbook.
       Roadbook Suite pictograms that map 1:1 to a differently-named palette symbol are aliased;
       speed-limit signs (S0x_*km / S99_end) are handled by rule — the suite ships them as PNG, the
       palette as SVG. Names with no palette equivalent are left as they are and flagged in the Editor
       (docs/editor.md §9.5). */
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
    // The suite's road codes (its RB System palette) → the FIA road types.
    const SUITE_ROAD_TYPES = { 0: 2, 1: 1, 2: 1, 3: 2, 4: 4, 5: 5 };
    const suiteRoad = (rt) => SUITE_ROAD_TYPES[rt] || DEFAULT_ROAD_TYPE;
    function isSuiteRoadbook(doc) {
        const meta = (doc && doc.meta) || {};
        return !!doc && doc.rdbk_version == null && (meta.titolo != null || meta.km_totali != null ||
            (doc.notes || []).some((n) => n && ('testo' in n || 'bivio' in n || 'cap_hdr' in n || 'km_prog' in n || 'km_parz' in n)));
    }
    function importSuiteRoadbook(doc) {
        const meta = doc.meta || {};
        const track = (doc.track || []).filter((p) => p && isFinite(p.lat) && isFinite(p.lon)).map((p) => trackPoint({ lat: +p.lat, lon: +p.lon, ele: p.ele }));
        if (track.length < 2) throw new Error('The GPX track has too few points.');
        const symbolsLib = {};
        const notes = (doc.notes || []).map((n) => {
            const note = blankNote(Math.max(0, Math.min(track.length - 1, n.idx | 0)), suiteRoad(n.road_type_out));
            note.text = String(n.testo ?? n.text ?? '');
            if (n.cap_hdr != null) note.cap = Math.round(normDeg(n.cap_hdr)) % 360;
            if (n.danger >= 1 && n.danger <= 3) note.danger = n.danger | 0;
            note.junctions = (Array.isArray(n.bivio) ? n.bivio : []).map((b) => ({ from: [b.pivot[0], -b.pivot[1]], to: [b.punta[0], -b.punta[1]], road_type: suiteRoad(b.rt) }));
            note.symbols = (n.icons || []).map((ic) => {
                let name = ic.name != null ? String(ic.name) : String(ic.file || '').split('/').pop();
                if (/^S0\d_\d{1,3}km\.png$/i.test(name) || /^S99_end\.png$/i.test(name)) name = name.replace(/\.png$/i, '.svg');
                else if (SUITE_ICON_ALIASES[name.toLowerCase()]) name = SUITE_ICON_ALIASES[name.toLowerCase()];
                const startFinish = ['i01_arrivo.png', 'i02_partenza.png'].includes(name.toLowerCase());
                const raw = typeof ic.size === 'number' ? ic.size : 32;
                // the suite anchors a symbol at its TOP-LEFT corner in a +y-down box; the vignette
                // centres it in a +y-up box — so flip y and shift the anchor to the centre
                const pos = Array.isArray(ic.pos) ? [ic.pos[0] + raw / 2, -ic.pos[1] - raw / 2] : [0, 0];
                // suite symbols import a touch small; start/finish markers want extra presence
                return { name, position: pos, size: Math.min(120, Math.round(raw * (startFinish ? 3 : 1.5))), angle: ic.angle || 0, mirrored: !!(ic.flipX ?? ic.flip_x) };
            });
            // a speed-limit sign is a speed-controlled zone (#94): its start (DZ) or its end (FZ)
            let limit = null;
            note.symbols.forEach((ic) => { const v = speedLimitFromName(ic.name); if (v != null) limit = v; });
            if (limit != null) { note.speed_limit_kmh = limit; note.waypoint_type = limit === 0 ? 'fz' : 'dz'; }
            return note;
        }).sort((a, b) => a.track_index - b.track_index)
            .filter((n, i, arr) => i === 0 || n.track_index !== arr[i - 1].track_index);
        Object.entries(doc.icons && !Array.isArray(doc.icons) ? doc.icons : {}).forEach(([k, v]) => { if (/^data:/.test(v)) symbolsLib[k] = v; });
        const rb = newRoadbook(meta.titolo ?? meta.title, track, notes);
        rb.symbols = symbolsLib;
        return recomputeMetrics(rb);
    }

    /* ---------------- reading, writing and validating a .rdbk ----------------
       The file holds what the author decided and nothing that can be computed. validateRoadbook is
       the one judge of a document — the Reader, the Editor, the validator page and the tests all ask
       it; readRoadbook refuses what it rejects and hydrates the rest (the derived values below);
       writeRoadbook writes the one canonical shape back: defaults left out, keys in a fixed order,
       coordinates at 6 decimals. */
    const CAP_TYPES = ['exit', 'average', 'calculated', 'turning'];
    const META_FIELDS = ['title', 'description', 'author', 'organization', 'modified', 'logo', 'map_allowed', 'default_validation_radius', 'generator'];
    const NOTE_FIELDS = ['track_index', 'text', 'road_type', 'cap', 'cap_type', 'speed_limit_kmh', 'danger', 'waypoint_type', 'validation_radius', 'symbols', 'junctions', 'imported_tulip', 'blocks', 'compatibility'];
    const ROOT_FIELDS = ['rdbk_version', 'meta', 'track', 'notes', 'symbols', 'compatibility'];
    const GENERATOR = 'RDBK.app';
    const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
    const isInt = (v) => Number.isInteger(v);
    const isNum = (v) => typeof v === 'number' && isFinite(v);
    const isDataUri = (v) => typeof v === 'string' && /^data:[^,]*,/.test(v);
    const isPair = (v) => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
    function validateRoadbook(doc) {
        const errors = [], warnings = [];
        const err = (path, message, values) => errors.push(values ? { path, message, values } : { path, message });
        const warn = (path, message, values) => warnings.push(values ? { path, message, values } : { path, message });
        const unknown = (obj, allowed, base) => Object.keys(obj).forEach((k) => { if (!allowed.includes(k)) warn(base ? base + '.' + k : k, 'Unknown key: readers ignore it.'); });
        const compatibility = (v, path) => { if (v !== undefined && !isObj(v)) err(path, 'Must be an object.'); };
        if (!isObj(doc)) { err('', 'Must be an object.'); return { valid: false, errors, warnings }; }
        if (doc.rdbk_version !== FORMAT_VERSION) err('rdbk_version', 'Must be 1: the version of the .rdbk standard this file follows.');
        unknown(doc, ROOT_FIELDS, '');
        // meta
        const meta = doc.meta;
        if (!isObj(meta)) err('meta', 'Must be an object.');
        else {
            unknown(meta, META_FIELDS, 'meta');
            if (typeof meta.title !== 'string' || !meta.title.trim()) err('meta.title', 'Must be a non-empty string.');
            ['description', 'author', 'organization', 'generator'].forEach((k) => { if (meta[k] !== undefined && typeof meta[k] !== 'string') err('meta.' + k, 'Must be a string.'); });
            if (meta.modified !== undefined && !(typeof meta.modified === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(meta.modified))) err('meta.modified', 'Must be a date written YYYY-MM-DD.');
            if (meta.logo !== undefined && !isDataUri(meta.logo)) err('meta.logo', 'Must be a data: URI.');
            if (meta.map_allowed !== undefined && meta.map_allowed !== false) err('meta.map_allowed', 'Must be false when present: a map is allowed unless the file says so.');
            if (meta.default_validation_radius !== undefined && !(isInt(meta.default_validation_radius) && meta.default_validation_radius > 0)) err('meta.default_validation_radius', 'Must be a positive integer (metres).');
        }
        // track
        const track = doc.track;
        if (!Array.isArray(track) || track.length < 2) err('track', 'Must be a list of at least 2 points.');
        else track.forEach((p, i) => {
            const path = 'track[' + i + ']';
            if (!isObj(p)) return err(path, 'Must be an object.');
            unknown(p, ['lat', 'lon', 'elevation', 'time_ms'], path);
            if (!isNum(p.lat) || p.lat < -90 || p.lat > 90) err(path + '.lat', 'Must be a latitude from -90 to 90.');
            if (!isNum(p.lon) || p.lon < -180 || p.lon > 180) err(path + '.lon', 'Must be a longitude from -180 to 180.');
            if (p.elevation !== undefined && !isInt(p.elevation)) err(path + '.elevation', 'Must be an integer (metres).');
            if (p.time_ms !== undefined && !isInt(p.time_ms)) err(path + '.time_ms', 'Must be an integer (milliseconds since 1970, UTC).');
        });
        // symbols library
        const library = doc.symbols;
        if (library !== undefined && !isObj(library)) err('symbols', 'Must be an object.');
        const lib = isObj(library) ? library : {};
        Object.entries(lib).forEach(([k, v]) => { if (!isDataUri(v)) err('symbols.' + k, 'Must be a data: URI.'); });
        // notes
        const notes = doc.notes, points = Array.isArray(track) ? track.length : 0;
        if (!Array.isArray(notes) || !notes.length) err('notes', 'Must be a list of at least 1 note.');
        else {
            let prev = -1;
            notes.forEach((n, i) => {
                const path = 'notes[' + i + ']';
                if (!isObj(n)) return err(path, 'Must be an object.');
                unknown(n, NOTE_FIELDS, path);
                if (!isInt(n.track_index) || n.track_index < 0 || (points && n.track_index >= points)) err(path + '.track_index', 'Must be the index of a point of track.');
                else if (n.track_index <= prev) err(path + '.track_index', 'Must be greater than the previous note’s: notes follow the track.');
                if (isInt(n.track_index)) prev = n.track_index;
                if (n.text !== undefined && typeof n.text !== 'string') err(path + '.text', 'Must be a string.');
                if (n.text === '') warn(path + '.text', 'Default value: leave it out.');
                if (n.road_type !== undefined && !ROAD_TYPE_BY_ID[n.road_type]) err(path + '.road_type', 'Must be a road type from 1 to 5.');
                if (n.road_type === DEFAULT_ROAD_TYPE) warn(path + '.road_type', 'Default value: leave it out.');
                if (n.cap !== undefined && !(isInt(n.cap) && n.cap >= 0 && n.cap < 360)) err(path + '.cap', 'Must be an integer heading from 0 to 359.');
                if (n.cap_type !== undefined) {
                    if (!CAP_TYPES.includes(n.cap_type)) err(path + '.cap_type', 'Must be one of: {values}.', CAP_TYPES.join(', '));
                    else if (n.cap === undefined) err(path + '.cap_type', 'Only with a cap.');
                    else if (n.cap_type === 'exit') warn(path + '.cap_type', 'Default value: leave it out.');
                }
                if (n.speed_limit_kmh !== undefined && !(isInt(n.speed_limit_kmh) && n.speed_limit_kmh >= 0)) err(path + '.speed_limit_kmh', 'Must be an integer, 0 or more (0 lifts the limit).');
                if (n.danger !== undefined && ![1, 2, 3].includes(n.danger)) err(path + '.danger', 'Must be 1, 2 or 3.');
                if (n.waypoint_type !== undefined && !wpType(n.waypoint_type)) err(path + '.waypoint_type', 'Must be one of: {values}.', WP_TYPES.map((w) => w.id).join(', '));
                if (n.validation_radius !== undefined && !(isInt(n.validation_radius) && n.validation_radius > 0)) err(path + '.validation_radius', 'Must be a positive integer (metres).');
                if (n.symbols !== undefined) {
                    if (!Array.isArray(n.symbols)) err(path + '.symbols', 'Must be a list.');
                    else n.symbols.forEach((ic, j) => {
                        const sp = path + '.symbols[' + j + ']';
                        if (!isObj(ic)) return err(sp, 'Must be an object.');
                        unknown(ic, ['name', 'position', 'size', 'angle', 'mirrored'], sp);
                        if (typeof ic.name !== 'string' || !ic.name) err(sp + '.name', 'Must be a non-empty string.');
                        else if (!lib[ic.name]) err(sp + '.name', 'Must be embedded in symbols: a .rdbk carries every symbol it draws.');
                        if (!isPair(ic.position)) err(sp + '.position', 'Must be two numbers [x, y].');
                        if (!(isNum(ic.size) && ic.size > 0)) err(sp + '.size', 'Must be a positive number.');
                        if (ic.angle !== undefined && !isNum(ic.angle)) err(sp + '.angle', 'Must be a number.');
                        if (ic.angle === 0) warn(sp + '.angle', 'Default value: leave it out.');
                        if (ic.mirrored !== undefined && typeof ic.mirrored !== 'boolean') err(sp + '.mirrored', 'Must be true or false.');
                        if (ic.mirrored === false) warn(sp + '.mirrored', 'Default value: leave it out.');
                    });
                }
                if (n.junctions !== undefined) {
                    if (!Array.isArray(n.junctions)) err(path + '.junctions', 'Must be a list.');
                    else n.junctions.forEach((b, j) => {
                        const jp = path + '.junctions[' + j + ']';
                        if (!isObj(b)) return err(jp, 'Must be an object.');
                        unknown(b, ['from', 'to', 'road_type'], jp);
                        if (!isPair(b.from)) err(jp + '.from', 'Must be two numbers [x, y].');
                        if (!isPair(b.to)) err(jp + '.to', 'Must be two numbers [x, y].');
                        if (b.road_type !== undefined && !ROAD_TYPE_BY_ID[b.road_type]) err(jp + '.road_type', 'Must be a road type from 1 to 5.');
                        if (b.road_type === DEFAULT_ROAD_TYPE) warn(jp + '.road_type', 'Default value: leave it out.');
                    });
                }
                if (n.imported_tulip !== undefined) {
                    const t = n.imported_tulip, tp = path + '.imported_tulip';
                    if (!isObj(t)) err(tp, 'Must be an object.');
                    else {
                        unknown(t, ['image', 'shown'], tp);
                        if (!isDataUri(t.image)) err(tp + '.image', 'Must be a data: URI.');
                        if (t.shown !== undefined && t.shown !== false) err(tp + '.shown', 'Must be false when present: an imported tulip is shown unless the file says so.');
                    }
                }
                if (n.blocks !== undefined) {
                    if (!Array.isArray(n.blocks)) err(path + '.blocks', 'Must be a list.');
                    else n.blocks.forEach((bl, j) => {
                        const bp = path + '.blocks[' + j + ']';
                        if (!isObj(bl)) return err(bp, 'Must be an object.');
                        unknown(bl, ['type', 'placement', 'image', 'text'], bp);
                        if (!NOTE_BLOCK_BY_ID[bl.type]) err(bp + '.type', 'Must be one of: {values}.', NOTE_BLOCKS.map((x) => x.id).join(', '));
                        if (!['before', 'after'].includes(bl.placement)) err(bp + '.placement', 'Must be one of: {values}.', 'before, after');
                        if (bl.image !== undefined && !isDataUri(bl.image)) err(bp + '.image', 'Must be a data: URI.');
                        if (bl.text !== undefined && typeof bl.text !== 'string') err(bp + '.text', 'Must be a string.');
                        if (bl.image === undefined && !bl.text) err(bp, 'Must carry an image, a text or both.');
                    });
                }
                compatibility(n.compatibility, path + '.compatibility');
            });
        }
        compatibility(doc.compatibility, 'compatibility');
        return { valid: !errors.length, errors, warnings };
    }
    // A .rdbk container's media.json against the entries the ZIP really holds: { files: [...] } →
    // { valid, errors, warnings }, the same report as validateRoadbook. Absent, there is no media.
    function validateMedia(manifest, names) {
        const errors = [], warnings = [], listed = new Set();
        const err = (path, message, values) => errors.push(values ? { path, message, values } : { path, message }), warn = (path, message) => warnings.push({ path, message });
        if (manifest != null) {
            if (!isObj(manifest)) err('media.json', 'Must be an object.');
            else {
                Object.keys(manifest).forEach((k) => { if (!['photos', 'audio'].includes(k)) warn('media.json.' + k, 'Unknown key: readers ignore it.'); });
                ['photos', 'audio'].forEach((kind) => {
                    const list = manifest[kind];
                    if (list === undefined) return;
                    if (!Array.isArray(list)) return err('media.json.' + kind, 'Must be a list.');
                    list.forEach((m, i) => {
                        const path = 'media.json.' + kind + '[' + i + ']';
                        if (!isObj(m)) return err(path, 'Must be an object.');
                        const dir = kind === 'photos' ? 'photos/' : 'audio/';
                        if (typeof m.file !== 'string' || !m.file.startsWith(dir)) err(path + '.file', 'Must be a path inside {values}.', dir);
                        else if (!names.includes(m.file)) err(path + '.file', 'Must be a file inside the container.');
                        else listed.add(m.file);
                        if (m.lat !== undefined && !(isNum(m.lat) && Math.abs(m.lat) <= 90)) err(path + '.lat', 'Must be a latitude from -90 to 90.');
                        if (m.lon !== undefined && !(isNum(m.lon) && Math.abs(m.lon) <= 180)) err(path + '.lon', 'Must be a longitude from -180 to 180.');
                    });
                });
            }
        }
        names.filter((n) => /^(photos|audio)\//.test(n) && !/\/$/.test(n) && !listed.has(n)).forEach((n) => warn(n, 'Not listed in media.json: it has no position.'));
        names.filter((n) => !/^(photos|audio)\//.test(n) && !['roadbook.json', 'media.json'].includes(n)).forEach((n) => warn(n, 'Unknown entry: readers ignore it.'));
        return { valid: !errors.length, errors, warnings };
    }
    // A .rdbk document → a roadbook in memory (a Roadbook Suite file is imported instead). Throws
    // on a document validateRoadbook rejects, the report attached for whoever wants to show it.
    function readRoadbook(doc) {
        if (isSuiteRoadbook(doc)) return importSuiteRoadbook(doc);
        const report = validateRoadbook(doc);
        if (!report.valid) {
            const e = new Error('This file is not a valid .rdbk roadbook.');
            e.report = report;
            throw e;
        }
        const rb = JSON.parse(JSON.stringify(doc));
        rb.symbols = rb.symbols || {};
        rb.notes.forEach((n) => {
            if (n.text == null) n.text = '';
            if (n.road_type == null) n.road_type = DEFAULT_ROAD_TYPE;
            if (n.cap == null) n.cap = null;
            n.symbols = (n.symbols || []).map((ic) => ({ ...ic, angle: ic.angle || 0, mirrored: !!ic.mirrored }));
            n.junctions = (n.junctions || []).map((b) => ({ ...b, road_type: b.road_type || DEFAULT_ROAD_TYPE }));
            if (n.imported_tulip) n.imported_tulip.shown = n.imported_tulip.shown !== false;
        });
        return recomputeMetrics(rb);
    }
    // A roadbook in memory → its .rdbk document: the authored fields only, in the canonical shape.
    function writeRoadbook(rb) {
        const m = rb.meta || {}, meta = { title: String(m.title || '').trim() || 'roadbook' };
        ['description', 'author', 'organization'].forEach((k) => { const v = typeof m[k] === 'string' ? m[k].trim() : ''; if (v) meta[k] = v; });
        if (m.modified) meta.modified = m.modified;
        if (m.logo) meta.logo = m.logo;
        if (m.map_allowed === false) meta.map_allowed = false;
        if (m.default_validation_radius != null) meta.default_validation_radius = m.default_validation_radius;
        meta.generator = GENERATOR;
        const track = rb.track.map((p) => {
            const q = { lat: round6(p.lat), lon: round6(p.lon) };
            if (p.elevation != null) q.elevation = Math.round(p.elevation);
            if (p.time_ms != null) q.time_ms = Math.round(p.time_ms);
            return q;
        });
        const notes = rb.notes.map((n) => {
            const o = { track_index: n.track_index };
            if (n.text) o.text = n.text;
            if (n.road_type != null && n.road_type !== DEFAULT_ROAD_TYPE) o.road_type = n.road_type;
            if (n.cap != null) { o.cap = Math.round(normDeg(n.cap)) % 360; if (n.cap_type && n.cap_type !== 'exit') o.cap_type = n.cap_type; }
            if (n.speed_limit_kmh != null) o.speed_limit_kmh = n.speed_limit_kmh;
            if (n.danger) o.danger = n.danger;
            if (n.waypoint_type) o.waypoint_type = n.waypoint_type;
            if (n.validation_radius != null) o.validation_radius = n.validation_radius;
            const symbols = (n.symbols || []).map((ic) => {
                const q = { name: ic.name, position: [ic.position[0], ic.position[1]], size: ic.size };
                if (ic.angle) q.angle = ic.angle;
                if (ic.mirrored) q.mirrored = true;
                return q;
            });
            if (symbols.length) o.symbols = symbols;
            const junctions = (n.junctions || []).map((b) => {
                const q = { from: [b.from[0], b.from[1]], to: [b.to[0], b.to[1]] };
                if (b.road_type != null && b.road_type !== DEFAULT_ROAD_TYPE) q.road_type = b.road_type;
                return q;
            });
            if (junctions.length) o.junctions = junctions;
            if (n.imported_tulip) o.imported_tulip = n.imported_tulip.shown === false ? { image: n.imported_tulip.image, shown: false } : { image: n.imported_tulip.image };
            const blocks = (n.blocks || []).filter((b) => b && (b.image || b.text)).map((b) => {
                const q = { type: b.type, placement: b.placement === 'before' ? 'before' : 'after' };
                if (b.image) q.image = b.image;
                if (b.text) q.text = b.text;
                return q;
            });
            if (blocks.length) o.blocks = blocks;
            if (n.compatibility && Object.keys(n.compatibility).length) o.compatibility = JSON.parse(JSON.stringify(n.compatibility));
            return o;
        });
        const doc = { rdbk_version: FORMAT_VERSION, meta, track, notes };
        const symbols = {};
        Object.keys(rb.symbols || {}).sort().forEach((k) => { symbols[k] = rb.symbols[k]; }); // the roadbook's library, every custom symbol included (#454)
        if (Object.keys(symbols).length) doc.symbols = symbols;
        if (rb.compatibility && Object.keys(rb.compatibility).length) doc.compatibility = JSON.parse(JSON.stringify(rb.compatibility));
        return doc;
    }

    /* ---------------- metric recomputation (after edit/splice) ---------------- */
    /* The DERIVED values — never in the file, computed by every reader from the track, the same way
       everywhere (distances: haversine on a 6 371 000 m sphere, rounded to whole metres):
         note.num               its position in the list, from 1
         note.lat / note.lon    the track point it sits on
         note.distance          metres along the track from its first point
         note.partial_distance  metres along the track from the previous note (0 for the first)
         note.bearing_in / out  the track's bearing arriving / leaving (deriveBearings)
         note.road_type_in      the road it arrives on: the previous note's road_type (the first
                                note arrives on the road it leaves on)
         note.cap_distance      with a CAP: the straight-line metres to the next note
         meta.total_distance    the track's length · meta.note_count  the number of notes
       Run after every edit, so the invariants always hold. */
    function recomputeMetrics(rb) {
        const cum = cumulativeM(rb.track);
        rb.notes.sort((a, b) => a.track_index - b.track_index);
        rb.notes.forEach((n, i) => {
            const k = Math.max(0, Math.min(rb.track.length - 1, n.track_index | 0));
            n.track_index = k;
            const tp = rb.track[k];
            n.lat = round6(tp.lat); n.lon = round6(tp.lon);
            n.distance = Math.round(cum[k]);
            n.partial_distance = Math.round(i === 0 ? 0 : Math.max(0, cum[k] - cum[rb.notes[i - 1].track_index]));
            const { bIn, bOut } = deriveBearings(rb.track, k);
            n.bearing_in = round3(bIn); n.bearing_out = round3(bOut);
            n.road_type_in = i === 0 ? n.road_type : rb.notes[i - 1].road_type;
            n.num = i + 1;
        });
        rb.notes.forEach((n, i) => {
            const next = rb.notes[i + 1];
            if (n.cap == null) delete n.cap_distance;
            else n.cap_distance = next ? Math.round(haversineM(n, next)) : null;
        });
        rb.meta.total_distance = Math.round(cum[cum.length - 1] || 0);
        rb.meta.note_count = rb.notes.length;
        return rb;
    }
    // The Editor keeps every CAP on the straight bearing to the next note it points at: after an
    // edit each one is proposed afresh; the last note has nothing to point at and loses its CAP.
    function recomputeCaps(rb) {
        const notes = rb.notes;
        notes.forEach((n, i) => {
            if (n.cap == null) return;
            const next = notes[i + 1];
            if (next) { n.cap = Math.round(bearingDeg(n, next)) % 360; n.cap_distance = Math.round(haversineM(n, next)); }
            else { n.cap = null; delete n.cap_type; delete n.cap_distance; }
        });
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
        const from = Math.max(0, Math.min(i > 0 ? notes[i - 1].track_index : 0, last - 1));
        const to = Math.max(from + 1, Math.min(notes[i + 1] ? notes[i + 1].track_index : last, last));
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
        const fromK = Math.max(0, Math.min(activeIdx > 0 ? notes[activeIdx - 1].track_index : 0, track.length - 2));
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
        const keep = simplifyKeepMask(rb.track, toleranceM, rb.notes.map((n) => n.track_index));
        if (keep) {
            // Exact old→new index remap: every note's own vertex is in the mask, so its new
            // index is the count of kept vertices before it. Never re-anchor spatially here —
            // on a loop/out-and-back a nearest-vertex search can snap a note to the OTHER pass
            // of the same spot and scramble the note order (#216).
            const newIdx = new Int32Array(keep.length);
            let k = 0;
            for (let i = 0; i < keep.length; i++) newIdx[i] = keep[i] ? k++ : -1;
            rb.track = rb.track.filter((_, i) => keep[i]);
            rb.notes.forEach((n) => { n.track_index = newIdx[n.track_index] >= 0 ? newIdx[n.track_index] : nearestIdx(rb.track, n); });
        }
        recomputeMetrics(rb); recomputeCaps(rb);
        return rb;
    }
    // Reverse the direction of travel: track flipped, notes re-anchored and
    // re-ordered. The road a note now LEAVES on is the one it used to arrive on,
    // so its road_type becomes the old road_type_in; recomputeMetrics re-derives
    // road_type_in (and bearings/CAPs follow).
    function reverseRoadbook(rb) {
        rb.track.reverse();
        const last = rb.track.length - 1;
        rb.track.forEach((p) => { delete p.time_ms; });
        rb.notes.forEach((n) => { n.track_index = last - n.track_index; n.road_type = n.road_type_in; });
        recomputeMetrics(rb); recomputeCaps(rb);
        return rb;
    }
    // Lengthen the route with another track (the Editor's Add GPX): `piece` is GPS fixes, oriented so its
    // FIRST point meets the joined end: after the finish, or — `atStart` — before the start,
    // running into it. A first point ON the joined end is not duplicated; one merely near it is
    // kept, the route bridging to it. Every joined point keeps its elevation and time (#158) so a
    // later join can still read the time span, the existing notes keep their own vertices, and a
    // new end note rides the new tip.
    function joinTrack(rb, piece, atStart) {
        const end = atStart ? rb.track[0] : rb.track[rb.track.length - 1];
        const pts = piece.slice(haversineM(end, piece[0]) < 1 ? 1 : 0).map(trackPoint);
        if (atStart) {
            const first = rb.notes[0];
            rb.track = pts.reverse().concat(rb.track);
            rb.notes.forEach((n) => { n.track_index += pts.length; });
            rb.notes.push(blankNote(0, first ? first.road_type : DEFAULT_ROAD_TYPE));
        } else {
            const last = rb.notes[rb.notes.length - 1];
            rb.track = rb.track.concat(pts);
            rb.notes.push(blankNote(rb.track.length - 1, last ? last.road_type : DEFAULT_ROAD_TYPE));
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
        const wt = wpType(note.waypoint_type);
        if (wt) return { sym: wt.sym, osmandIcon: wt.osm, color: wt.color };
        let m = null;
        for (const ic of (note.symbols || [])) { const k = (ic.name || '').split('/').pop().toLowerCase(); if (APP_WPT_LC[k]) { m = APP_WPT_LC[k]; break; } }
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
    // An imported waypoint's Garmin/OSMAnd icon as the note keeps it (`compatibility.gpx`).
    function gpxCompatibility(appwpt) {
        const gpx = {};
        if (appwpt.sym) gpx.sym = appwpt.sym;
        if (appwpt.osmandIcon) gpx.osmand_icon = appwpt.osmandIcon;
        if (appwpt.color) gpx.osmand_color = appwpt.color;
        return gpx;
    }
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
        const trkpts = (rb.track || []).map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}">${p.elevation != null ? '<ele>' + Math.round(p.elevation) + '</ele>' : ''}</trkpt>`).join('');
        const wpts = (rb.notes || []).map((n, i) => {
            const ext = [`<openrally:distance>${((n.distance || 0) / 1000).toFixed(3)}</openrally:distance>`];
            if (n.waypoint_type) { const w = wpType(n.waypoint_type); if (w) ext.push(`<openrally:wptType>${x(w.cap)}</openrally:wptType>`); }
            const kept = n.compatibility && n.compatibility.openrally;
            if (Array.isArray(kept) && kept.length) {
                // imported note: re-emit every preserved param verbatim (cap·danger·speed·zones·…)
                kept.forEach((e) => ext.push(emitOr(e)));
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

    // The speed limit a traffic-sign symbol shows (S01_10km → 10; S99_end → 0 = limit lifted): the
    // Editor proposes it when the sign is placed, the Roadbook Suite import reads it.
    function speedLimitFromName(name) {
        if (!name) return null;
        if (/S99_end/i.test(name)) return 0;
        const m = String(name).match(/^S\d{2}_(\d{1,3})km/i);
        return m ? parseInt(m[1], 10) : null;
    }
    // The limit a note imposes (km/h; 0 = limit lifted), or null.
    const speedLimitOfNote = (note) => (note && note.speed_limit_kmh != null ? note.speed_limit_kmh : null);

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
        // A stage opens on the FIA selective-section start (waypoint_type 'ss_start' = DSS) or the
        // start symbol, and closes on 'ss_end' (ASS) or the finish symbol (#215).
        const has = (n, name) => (n.symbols || []).some((ic) => ic.name === name);
        const opens = (n) => n.waypoint_type === 'ss_start' || has(n, START_ICON);
        const closes = (n) => n.waypoint_type === 'ss_end' || has(n, FINISH_ICON);
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

    /* ---------------- symbol resolution ---------------- */
    // The image of a note's symbol: the roadbook's own library (rb.symbols) — every symbol of a
    // .rdbk file is there — else, while a roadbook is being edited and a palette symbol has not been
    // embedded yet, the standard palette under basePath.
    function symbolSrc(symbol, rb, basePath) {
        const name = symbol.name || '';
        if (rb && rb.symbols && rb.symbols[name]) return rb.symbols[name];
        return (basePath || '') + name;
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
        const k = rb.notes[i].track_index;
        rb.notes.splice(i, 1);
        let removed = -1;
        if (rb.track.length > 2) {
            rb.track.splice(k, 1);
            rb.notes.forEach((n) => { if (n.track_index > k) n.track_index -= 1; });
            removed = k;
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
        // a checkpoint holds a roadbook in memory; one of another .rdbk version is not work to resume
        const current = (rb) => !!rb && rb.rdbk_version === FORMAT_VERSION && !!rb.meta && Array.isArray(rb.notes);
        const draft = snap.rb_editor_draft;
        if (draft && current(draft.rb)) {
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
        if (nav && nav.pen && current(navRb)) {
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
        FORMAT_VERSION, ROAD_TYPES, ROAD_WIDTH, DOUBLE_GAP, DEFAULT_ROAD_TYPE, roadType, CAP_TYPES, CONST, WP_TYPES, ROADBOOK_STATUSES, roadbookStatus, wpType, wpTypeByCap, wpTypesForProfile, wpBadgeSVG, detectionRadius, reachRadius, noteReached, notePassed, autoReachedIdx, courseFrom, courseTrail, manualGate,
        geo: { haversineM, bearingDeg, destPoint },
        parseGPX, parseWPT, buildRoadbook, readRoadbook, writeRoadbook, validateRoadbook, validateMedia, newRoadbook, trackPoint, trackFixes, parseOpenRally,
        recomputeMetrics, recomputeCaps, speedLimitOfNote, speedLimitFromName, consistencyReport, appwptFromImport, gpxCompatibility, tulipToDataURL,
        simplifyRoadbook, reverseRoadbook, joinTrack, routeAhead, routeResync, leftToNote, liveAllowed, liveDue, liveFreshness, tulipShape, tulipContext, tulipPoints, tulipAddPoints, TULIP_SHAPE_M, TULIP_SHAPE_POINTS, blankNote, iconBackground, removeIconBackground, gpxDocument, kmlDocument, openRallyDocument, appWaypointSymbol, nearestOnTrack,
        buildMeta, parseMeta, metaRbPrefix, signMeta, verifyMeta, metaOf, symbolSrc,
        scoredNoteSet, isScoredIdx, validationPenalties, speedPenalty, skipPenalty, rankEntry, speedBand, hhmmss, ddmmyy, parseHms,
        NOTE_BLOCKS, blockType, noteBlocks, isEndNote, isFirstNote,
        nearestIdx, nearestIdxByTime, resolveIdx, round6, slug, urlToDataURL, pad2, filterByText, filterRoadbooks, filterByVehicles, VEHICLES, parseEmailList, distanceChars, deleteNote, pendingWork,
        cumulativeM, deriveBearings, recJunkFix, gpsHealth, recStepM, odometerStep,
        eventLink,
    };
    // The browser uses the global; Node (the test runner) imports the same object.
    if (typeof window !== 'undefined') window.RB = RB;
    if (typeof module !== 'undefined' && module.exports) module.exports = RB;
})();
