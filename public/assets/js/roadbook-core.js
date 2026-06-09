/* roadbook-core.js — library shared by ALL the tools.
 * Data model (roadbook JSON), geo math, GPX/WPT parsing, roadbook building,
 * metric recomputation and the scoring constants the Reader and Ranking share.
 * Exposes a single global: window.RB (no modules — simple multi-page app). */
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
    const ROAD_TYPES = [
        { id: 0, color: '#9aa4b2', dashed: false }, // default
        { id: 1, color: '#3b82f6', dashed: false }, // motorway
        { id: 2, color: '#22c55e', dashed: false }, // asphalt
        { id: 3, color: '#ff5a45', dashed: false }, // track
        { id: 4, color: '#ff5a45', dashed: true },  // off-piste
    ];

    /* ---------------- scoring constants (Reader and Ranking must agree) ---------------- */
    const CONST = {
        MANUAL_RADIUS_M: 100, MIN_DISP_M: 5,
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
                trkpts.push({
                    lat, lon,
                    ele: isFinite(ele) ? ele : null,
                    time: p.querySelector('time')?.textContent || null,
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
                wpts.push({ lat, lon, name: nm, num: numFromName(nm) });
            }
        });
        if (!wpts.length) {
            trkpts.forEach((p) => {
                if (p.cmt && /^wpt/i.test(p.cmt)) wpts.push({ lat: p.lat, lon: p.lon, name: p.cmt, num: numFromName(p.cmt) });
            });
        }
        return { name, trkpts, wpts };
    }
    function numFromName(s) {
        const m = String(s || '').match(/(\d+)/);
        return m ? parseInt(m[1], 10) : null;
    }
    // Garmin .wpt: "W <name> ... lat lon" lines with N/S/E/W/O hemisphere letters
    function parseWPT(text) {
        const out = [];
        text.split(/\r?\n/).forEach((line) => {
            if (!/^W/i.test(line)) return;
            const nums = line.match(/[-+]?\d+\.\d+/g);
            if (!nums || nums.length < 2) return;
            let lat = parseFloat(nums[nums.length - 2]), lon = parseFloat(nums[nums.length - 1]);
            if (/\bS\b/.test(line)) lat = -Math.abs(lat);
            if (/\b[WO]\b/.test(line)) lon = -Math.abs(lon);
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
    // Cumulative distance in METRES at each track point.
    function cumulativeM(trkpts) {
        const cum = [0];
        for (let i = 1; i < trkpts.length; i++) cum[i] = cum[i - 1] + haversineM(trkpts[i - 1], trkpts[i]);
        return cum;
    }

    // Build the roadbook JSON from a track + waypoints.
    function buildRoadbook({ name, trkpts, wpts }) {
        if (!trkpts || trkpts.length < 2) throw new Error('The GPX track has too few points.');
        const cum = cumulativeM(trkpts);
        const totalM = cum[cum.length - 1];

        // guarantee a start note and an end note
        const pts = (wpts && wpts.length) ? wpts.slice() : [];
        const hasStart = pts.some((w) => nearestIdx(trkpts, w) === 0);
        const hasEnd = pts.some((w) => nearestIdx(trkpts, w) === trkpts.length - 1);
        if (!hasStart) pts.push({ lat: trkpts[0].lat, lon: trkpts[0].lon, name: 'start', num: 0 });
        if (!hasEnd) pts.push({ lat: trkpts[trkpts.length - 1].lat, lon: trkpts[trkpts.length - 1].lon, name: 'end', num: 9999 });

        // resolve each waypoint's track index and order along the track
        const withIdx = pts.map((w) => ({ ...w, idx: nearestIdx(trkpts, w) }))
            .sort((a, b) => a.idx - b.idx)
            .filter((w, i, arr) => i === 0 || w.idx !== arr[i - 1].idx); // dedup by idx

        const notes = withIdx.map((w, i) => {
            const idx = w.idx;
            const prevIdx = i > 0 ? withIdx[i - 1].idx : null;
            const tp = trkpts[idx];
            const bIn = idx > 0 ? bearingDeg(trkpts[idx - 1], tp) : (idx < trkpts.length - 1 ? bearingDeg(tp, trkpts[idx + 1]) : 0);
            const bOut = idx < trkpts.length - 1 ? bearingDeg(tp, trkpts[idx + 1]) : bIn;
            return {
                num: i + 1, idx,
                distance: Math.round(cum[idx]),
                partial_distance: Math.round(prevIdx == null ? 0 : Math.max(0, cum[idx] - cum[prevIdx])),
                lat: round6(tp.lat), lon: round6(tp.lon),
                text: typeof w.text === 'string' ? w.text : '',
                cap: null, cap_distance: null,
                bearing_in: round3(bIn), bearing_out: round3(bOut),
                road_type_in: 3, road_type_out: 3, // track by default
                junctions: null, icons: [],
            };
        });

        return {
            meta: { title: name || 'roadbook', total_distance: Math.round(totalM), note_count: notes.length },
            track: trkpts.map((p) => (p.ele != null && isFinite(p.ele) ? { lat: round6(p.lat), lon: round6(p.lon), ele: Math.round(p.ele) } : { lat: round6(p.lat), lon: round6(p.lon) })),
            notes,
        };
    }

    /* ---------------- metric recomputation (after edit/splice) ---------------- */
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
            const bIn = idx > 0 ? bearingDeg(rb.track[idx - 1], tp) : (idx < rb.track.length - 1 ? bearingDeg(tp, rb.track[idx + 1]) : 0);
            const bOut = idx < rb.track.length - 1 ? bearingDeg(tp, rb.track[idx + 1]) : bIn;
            n.bearing_in = round3(bIn); n.bearing_out = round3(bOut);
        });
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
    // speed limit encoded in a symbol name (S01_10km → 10; S99_end → 0 = limit lifted)
    function speedLimitFromName(name) {
        if (!name) return null;
        if (/S99_end/i.test(name)) return 0;
        const m = String(name).match(/^S\d{2}_(\d{1,3})km/i);
        return m ? parseInt(m[1], 10) : null;
    }
    // limit in force at a note (looks at its icons; 0 = limit lifted)
    function speedLimitOfNote(note) {
        let lim = null;
        (note.icons || []).forEach((ic) => { const v = speedLimitFromName(ic.name); if (v != null) lim = v; });
        return lim;
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

    /* ---------------- export ---------------- */
    window.RB = {
        ROAD_TYPES, CONST,
        geo: { haversineM, bearingDeg, destPoint },
        parseGPX, parseWPT, buildRoadbook,
        recomputeMetrics, recomputeCaps, speedLimitFromName, speedLimitOfNote,
        buildMeta, parseMeta, signMeta, verifyMeta, iconSrc,
        nearestIdx, round6,
    };
})();
