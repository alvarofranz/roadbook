import { describe, it, expect } from 'vitest';
import RB from '../public/assets/js/roadbook-core.js';
import NoteCanvas from '../public/assets/js/note-canvas.js';
globalThis.RB = RB; // NoteCanvas.toSVG reads the global RB.ROAD_TYPES for the trunk colour
// toSVG escapes icon URLs through the shared RBesc global (app.js provides it in the browser).
globalThis.RBesc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// One metre on the equator is ~111195 m per degree at this Earth radius — handy for
// building tracks with predictable lengths.
const M_PER_DEG = (2 * Math.PI * 6371000) / 360;

describe('geo math', () => {
    it('haversineM is 0 for the same point and ~111195 m per degree on the equator', () => {
        expect(RB.geo.haversineM({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
        expect(RB.geo.haversineM({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(M_PER_DEG, 0);
        expect(RB.geo.haversineM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(M_PER_DEG, 0);
    });

    it('bearingDeg returns the four cardinals', () => {
        expect(RB.geo.bearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 5);
        expect(RB.geo.bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 5);
        expect(RB.geo.bearingDeg({ lat: 0, lon: 0 }, { lat: -1, lon: 0 })).toBeCloseTo(180, 5);
        expect(RB.geo.bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: -1 })).toBeCloseTo(270, 5);
    });

    it('destPoint is the inverse of bearing + distance', () => {
        const d = RB.geo.destPoint(45, 9, 90, 1000);
        expect(RB.geo.haversineM({ lat: 45, lon: 9 }, d)).toBeCloseTo(1000, 0);
        expect(RB.geo.bearingDeg({ lat: 45, lon: 9 }, d)).toBeCloseTo(90, 1);
    });
});

describe('rounding & string helpers', () => {
    it('round6 keeps six decimals', () => {
        expect(RB.round6(1.23456789)).toBe(1.234568);
        expect(RB.round6(1.0000004)).toBe(1);
    });
    it('slug', () => {
        expect(RB.slug('Hello World! 2026')).toBe('hello-world-2026');
        expect(RB.slug('')).toBe('roadbook');
        expect(RB.slug('---a---')).toBe('a');
    });
    it('pad2', () => {
        expect(RB.pad2(5)).toBe('05');
        expect(RB.pad2(12)).toBe('12');
    });
});

describe('parseGPX', () => {
    const gpx = `<?xml version="1.0"?>
    <gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
      <metadata><name>My Route</name></metadata>
      <wpt lat="45.0" lon="9.0"><name>3</name></wpt>
      <trk><name>My Route</name><trkseg>
        <trkpt lat="45.0" lon="9.0"><ele>100</ele></trkpt>
        <trkpt lat="45.001" lon="9.001"><ele>110</ele></trkpt>
      </trkseg></trk>
    </gpx>`;

    it('reads name, track points (with elevation) and waypoints', () => {
        const r = RB.parseGPX(gpx);
        expect(r.name).toBe('My Route');
        expect(r.trkpts).toHaveLength(2);
        expect(r.trkpts[0].ele).toBe(100);
        expect(r.wpts).toHaveLength(1);
        expect(r.wpts[0].num).toBe(3);
    });

    it('returns empty collections for a GPX with no points or waypoints', () => {
        const r = RB.parseGPX('<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"></gpx>');
        expect(r.trkpts).toEqual([]);
        expect(r.wpts).toEqual([]);
        expect(r.name).toBe('');
    });

    it('reads <time> as epoch ms on both track points and waypoints (#158)', () => {
        const gpxT = `<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
            <wpt lat="45.0" lon="9.0"><name>1</name><time>2026-07-03T10:00:30Z</time></wpt>
            <trk><trkseg>
              <trkpt lat="45.0" lon="9.0"><time>2026-07-03T10:00:00Z</time></trkpt>
              <trkpt lat="45.001" lon="9.001"></trkpt>
            </trkseg></trk></gpx>`;
        const r = RB.parseGPX(gpxT);
        expect(r.trkpts[0].t).toBe(Date.parse('2026-07-03T10:00:00Z'));
        expect(r.trkpts[1].t).toBeNull();               // no <time> → null, not NaN
        expect(r.wpts[0].t).toBe(Date.parse('2026-07-03T10:00:30Z'));
    });
});

describe('track-point timestamps (#158)', () => {
    it('nearestIdxByTime picks the point closest in time, ignoring untimed points', () => {
        const trk = [{ lat: 0, lon: 0, t: 1000 }, { lat: 0, lon: 1 }, { lat: 0, lon: 2, t: 5000 }];
        expect(RB.nearestIdxByTime(trk, 1200)).toBe(0);
        expect(RB.nearestIdxByTime(trk, 4800)).toBe(2);
    });
    it('resolveIdx uses time when both sides carry it, else falls back to nearest position', () => {
        const trk = [{ lat: 0, lon: 0, t: 1000 }, { lat: 0, lon: 1, t: 2000 }, { lat: 0, lon: 2, t: 3000 }];
        expect(RB.resolveIdx(trk, { lat: 5, lon: 5, t: 2900 })).toBe(2);   // far in space, but time wins
        expect(RB.resolveIdx(trk, { lat: 0, lon: 0.9 })).toBe(1);           // no time → nearest position
        const untimed = [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }];
        expect(RB.resolveIdx(untimed, { lat: 0, lon: 0.1, t: 9 })).toBe(0); // wp timed but track isn't → position
    });
    it('buildRoadbook keeps t on the track and anchors a self-crossing waypoint by time', () => {
        // an out-and-back on the SAME line: the return passes the outbound points again, so the
        // midpoint waypoint is spatially ambiguous — its time (late) must place it on the return leg.
        const trkpts = [
            { lat: 0, lon: 0, t: 0 }, { lat: 0, lon: 1, t: 100 }, { lat: 0, lon: 2, t: 200 },
            { lat: 0, lon: 1, t: 300 }, { lat: 0, lon: 0, t: 400 },
        ];
        const wpts = [{ lat: 0, lon: 1, t: 300, name: 'return' }];
        const rb = RB.buildRoadbook({ name: 'T', trkpts, wpts });
        expect(rb.track[0].t).toBe(0);                 // times preserved into the .rdbk track
        expect(rb.track[4].t).toBe(400);
        const note = rb.notes.find((n) => n.text === 'return' || n.idx === 3);
        expect(note.idx).toBe(3);                       // the return-leg point (t=300), not the outbound idx 1
    });
});

describe('parseWPT', () => {
    it('applies hemisphere letters to the coordinate sign without mistaking the record marker', () => {
        const txt = [
            'W Casa 45.500000 9.500000',     // north + east: both positive
            'W Sud S 12.250000 7.750000',    // S → negative latitude
            'W Ovest 40.000000 W 3.700000',  // W → negative longitude
            'W Oeste 40.000000 O 3.700000',  // O (Ovest/Oeste) → negative longitude
            'X ignored line',
        ].join('\n');
        const out = RB.parseWPT(txt);
        expect(out).toHaveLength(4);
        expect(out[0].name).toBe('Casa');
        expect(out[0].lat).toBeCloseTo(45.5, 5);
        // regression: the leading "W" record marker must NOT flip an eastern longitude (#47)
        expect(out[0].lon).toBeCloseTo(9.5, 5);
        expect(out[1].lat).toBeCloseTo(-12.25, 5);
        expect(out[2].lon).toBeCloseTo(-3.7, 5);
        expect(out[3].lon).toBeCloseTo(-3.7, 5);
    });
});

describe('buildRoadbook', () => {
    // 3 points heading east; ~1 degree spacing total.
    const trkpts = [
        { lat: 0, lon: 0 },
        { lat: 0, lon: 0.001 },
        { lat: 0, lon: 0.002 },
    ];

    it('injects a start and end note and computes distances from the track', () => {
        const rb = RB.buildRoadbook({ name: 'T', trkpts });
        expect(rb.meta.title).toBe('T');
        expect(rb.notes).toHaveLength(2);
        expect(rb.notes[0].idx).toBe(0);
        expect(rb.notes[0].distance).toBe(0);
        expect(rb.notes[0].partial_distance).toBe(0);
        expect(rb.notes[1].idx).toBe(2);
        const total = RB.geo.haversineM(trkpts[0], trkpts[1]) + RB.geo.haversineM(trkpts[1], trkpts[2]);
        expect(rb.notes[1].distance).toBe(Math.round(total));
        expect(rb.meta.total_distance).toBe(Math.round(total));
        expect(rb.meta.note_count).toBe(2);
    });

    it('rejects tracks with too few points', () => {
        expect(() => RB.buildRoadbook({ trkpts: [{ lat: 0, lon: 0 }] })).toThrow();
    });
});

describe('recomputeMetrics & normalizeRoadTypes', () => {
    it('road_type_in follows the previous note road_type_out; the first note arrives on its own', () => {
        const rb = {
            meta: {},
            track: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0, lon: 0.002 }],
            notes: [
                { idx: 0, road_type_out: 2 },
                { idx: 2, road_type_out: 4 },
            ],
        };
        RB.recomputeMetrics(rb);
        expect(rb.notes[0].road_type_in).toBe(2); // first note: in == out
        expect(rb.notes[1].road_type_in).toBe(2); // inherits previous note's out
        expect(rb.notes[1].road_type_out).toBe(4);
        expect(rb.notes[0].num).toBe(1);
        expect(rb.meta.note_count).toBe(2);
        expect(rb.meta.total_distance).toBeGreaterThan(0);
    });

    it('derives each note bearing from the track heading (the data the editor map rotates to)', () => {
        const rb = {
            meta: {},
            track: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0, lon: 0.002 }], // due east
            notes: [{ idx: 1, road_type_out: 2 }],
        };
        RB.recomputeMetrics(rb);
        // editor.js select() eases the map to note.bearing_in; if this regresses the map stops rotating.
        expect(rb.notes[0].bearing_in).toBeCloseTo(90, 0);
        expect(rb.notes[0].bearing_out).toBeCloseTo(90, 0);
    });
});

describe('recomputeCaps', () => {
    it('recomputes the CAP heading + straight-line distance where a CAP is active', () => {
        const rb = {
            meta: {},
            track: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.002 }],
            notes: [
                { idx: 0, lat: 0, lon: 0, cap: 0, cap_distance: 0 },
                { idx: 1, lat: 0, lon: 0.002, cap: null },
            ],
        };
        RB.recomputeCaps(rb);
        expect(rb.notes[0].cap).toBe(90); // due east to the next note
        expect(rb.notes[0].cap_distance).toBe(Math.round(RB.geo.haversineM(rb.notes[0], rb.notes[1])));
        expect(rb.notes[1].cap).toBeNull();
    });
});

describe('reverseRoadbook', () => {
    it('preserves total distance and swaps the endpoint anchors', () => {
        const rb = RB.buildRoadbook({
            name: 'T',
            trkpts: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0, lon: 0.002 }],
        });
        const total = rb.meta.total_distance;
        RB.reverseRoadbook(rb);
        expect(rb.meta.total_distance).toBe(total);
        expect(rb.notes[0].distance).toBe(0);
        expect(rb.notes[rb.notes.length - 1].distance).toBe(total);
    });
});

describe('simplifyRoadbook', () => {
    it('drops collinear intermediate points but keeps note anchors and total length', () => {
        const trkpts = [];
        for (let i = 0; i <= 10; i++) trkpts.push({ lat: 0, lon: i * 0.0001 });
        const rb = RB.buildRoadbook({ name: 'T', trkpts });
        const before = rb.track.length;
        RB.simplifyRoadbook(rb, 5); // 5 m tolerance — a straight line collapses
        expect(rb.track.length).toBeLessThan(before);
        expect(rb.track.length).toBeGreaterThanOrEqual(2);
        // every note still resolves to a valid track index
        rb.notes.forEach((n) => expect(n.idx).toBeLessThan(rb.track.length));
    });
    it('keeps the significant corner between waypoints, drops the collinear runs', () => {
        const trkpts = [
            { lat: 0, lon: 0 }, { lat: 0, lon: 0.0001 }, { lat: 0, lon: 0.0002 }, { lat: 0, lon: 0.0003 }, // straight east leg
            { lat: 0.0001, lon: 0.0003 }, { lat: 0.0002, lon: 0.0003 }, { lat: 0.0003, lon: 0.0003 },       // straight north leg
        ];
        const rb = RB.buildRoadbook({ name: 'T', trkpts });
        RB.simplifyRoadbook(rb, 2); // 2 m tolerance
        // the sharp corner (the bend) survives — a significant NON-waypoint point is not stripped...
        expect(rb.track.some((p) => Math.abs(p.lat) < 1e-7 && Math.abs(p.lon - 0.0003) < 1e-7)).toBe(true);
        // ...while the redundant collinear points on the two straight legs are dropped
        expect(rb.track.length).toBeLessThan(trkpts.length);
        expect(rb.track.length).toBeGreaterThanOrEqual(3);
    });
    it('a note on the return leg of an out-and-back keeps its own vertex — exact remap, no spatial snap (#216)', () => {
        // Out along a line, then back over the SAME spots. A nearest-vertex re-anchor would snap
        // the return-leg note to the outbound pass (same coordinates, lower index) and wreck its
        // distance; the exact remap must keep it on its own (kept) vertex.
        const track = [];
        for (let i = 0; i <= 10; i++) track.push({ lat: 0, lon: i * 0.0001 });          // outbound
        for (let i = 9; i >= 0; i--) track.push({ lat: 0, lon: i * 0.0001 });           // return
        const iBack = track.length - 3; // return leg, same coords as an outbound vertex
        const notes = [
            { num: 1, idx: 2, lat: track[2].lat, lon: track[2].lon, text: 'out', distance: 0, partial_distance: 0 },
            { num: 2, idx: iBack, lat: track[iBack].lat, lon: track[iBack].lon, text: 'back', distance: 0, partial_distance: 0 },
        ];
        const rb = { meta: { title: 'T', total_distance: 0, note_count: 2 }, track, notes };
        RB.simplifyRoadbook(rb, 5);
        // travel order preserved (out before back) and the return note keeps a return-leg distance:
        // ~85% of the ~222 m round trip, not the ~33 m of the outbound pass it must NOT snap to
        expect(rb.notes[0].text).toBe('out');
        expect(rb.notes[1].text).toBe('back');
        expect(rb.notes[1].idx).toBeGreaterThan(rb.notes[0].idx);
        expect(rb.notes[1].distance).toBeGreaterThan(100);
    });
});

describe('gpxDocument round-trips through parseGPX', () => {
    it('serializes a track + waypoints and re-parses to the same coordinates', () => {
        const pts = [{ lat: 45, lon: 9, ele: 100 }, { lat: 45.001, lon: 9.001, ele: 110 }];
        const wpts = [{ lat: 45, lon: 9, name: '1' }];
        const xml = RB.gpxDocument('Trip', pts, wpts);
        const r = RB.parseGPX(xml);
        expect(r.trkpts).toHaveLength(2);
        expect(r.trkpts[0].lat).toBeCloseTo(45, 6);
        expect(r.trkpts[1].ele).toBe(110);
        expect(r.wpts).toHaveLength(1);
    });

    it('escapes XML metacharacters in the name', () => {
        const xml = RB.gpxDocument('A & B <tag>', [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }], []);
        expect(xml).toContain('A &amp; B &lt;tag&gt;');
        expect(() => RB.parseGPX(xml)).not.toThrow();
    });

    it('serializes <time> on track points and waypoints and re-parses to the same epoch ms (#158)', () => {
        const t0 = Date.parse('2026-07-03T08:00:00Z'), t1 = Date.parse('2026-07-03T08:00:10Z');
        const xml = RB.gpxDocument('Timed', [{ lat: 45, lon: 9, t: t0 }, { lat: 45.001, lon: 9.001, t: t1 }], [{ lat: 45, lon: 9, name: '1', t: t0 }]);
        expect(xml).toContain('<time>2026-07-03T08:00:00.000Z</time>');
        const r = RB.parseGPX(xml);
        expect(r.trkpts[0].t).toBe(t0);
        expect(r.trkpts[1].t).toBe(t1);
        expect(r.wpts[0].t).toBe(t0);
    });
});

describe('speed limits', () => {
    it('reads the limit encoded in a note icon name', () => {
        expect(RB.speedLimitOfNote({ icons: [{ name: 'S03_30km.svg' }] })).toBe(30);
        expect(RB.speedLimitOfNote({ icons: [{ name: 'S99_end.svg' }] })).toBe(0);
        expect(RB.speedLimitOfNote({ icons: [{ name: 'W01_curve_right.svg' }] })).toBeNull();
        expect(RB.speedLimitOfNote({ icons: [] })).toBeNull();
    });
    it('prefers the declarative speed_limit field over the icon name (0 = lifted)', () => {
        expect(RB.speedLimitOfNote({ speed_limit: 50, icons: [{ name: 'S03_30km.svg' }] })).toBe(50);
        expect(RB.speedLimitOfNote({ speed_limit: 0, icons: [{ name: 'S03_30km.svg' }] })).toBe(0);
        expect(RB.speedLimitOfNote({ speed_limit: 90, icons: [] })).toBe(90);
        // unset field → falls back to the icon-name rule
        expect(RB.speedLimitOfNote({ icons: [{ name: 'S03_30km.svg' }] })).toBe(30);
    });
    it('parses the limit straight from a symbol name (speedLimitFromName)', () => {
        expect(RB.speedLimitFromName('S03_30km.svg')).toBe(30);
        expect(RB.speedLimitFromName('S12_120km')).toBe(120);
        expect(RB.speedLimitFromName('S99_end.svg')).toBe(0); // end-of-limit clears it
        expect(RB.speedLimitFromName('W01_curve_right.svg')).toBeNull(); // not a speed sign
        expect(RB.speedLimitFromName('')).toBeNull();
        expect(RB.speedLimitFromName(null)).toBeNull();
    });
});

describe('QR meta payload', () => {
    it('builds a fixed-width string that parses back to the same numbers', () => {
        const fields = { team: 7, date: 626, start: 1200, end: 1330, accuracy: 42, skip: 1, extra: 3, cap: 5, speed: 9, km: 12345, avg: 88 };
        const meta = RB.buildMeta(fields);
        expect(meta).toHaveLength(49); // sum of META_WIDTHS
        const parsed = RB.parseMeta(meta);
        for (const k of Object.keys(fields)) expect(Number(parsed[k])).toBe(fields[k]);
    });

    it('clamps negatives to zero and saturates on overflow', () => {
        const meta = RB.buildMeta({ team: -5, accuracy: 999999 });
        const parsed = RB.parseMeta(meta);
        expect(Number(parsed.team)).toBe(0);
        expect(parsed.accuracy).toBe('9999'); // width-4 field saturates to all 9s
    });
});

describe('QR signing (HMAC-SHA256)', () => {
    const key = 'test-sign-key';

    it('a freshly signed payload verifies with the same key', async () => {
        const meta = RB.buildMeta({ team: 1, accuracy: 10 });
        const payload = await RB.signMeta(meta, key);
        expect(payload).toContain('-');
        const v = await RB.verifyMeta(payload, key);
        expect(v.valid).toBe(true);
        expect(v.meta).toBe(meta);
    });

    it('fails verification with the wrong key or a tampered payload', async () => {
        const meta = RB.buildMeta({ team: 1, accuracy: 10 });
        const payload = await RB.signMeta(meta, key);
        expect((await RB.verifyMeta(payload, 'other-key')).valid).toBe(false);
        const tampered = payload.replace(meta, RB.buildMeta({ team: 1, accuracy: 11 }));
        expect((await RB.verifyMeta(tampered, key)).valid).toBe(false);
    });

    it('treats an unsigned payload as invalid', async () => {
        const v = await RB.verifyMeta('0000000000', key);
        expect(v.valid).toBe(false);
    });
});

describe('iconSrc resolution', () => {
    it('returns a data: URI as-is', () => {
        expect(RB.iconSrc({ name: 'data:image/png;base64,AAAA' })).toBe('data:image/png;base64,AAAA');
    });
    it('resolves from the embedded library case-insensitively, else the base path', () => {
        const rb = { icons: { 'Foo.png': 'data:embedded' } };
        expect(RB.iconSrc({ name: 'foo.png' }, rb, 'assets/')).toBe('data:embedded');
        expect(RB.iconSrc({ name: 'dir/bar.png' }, rb, 'assets/icons/')).toBe('assets/icons/bar.png');
    });
});

describe('importRoadbook (legacy Roadbook Suite → canonical)', () => {
    it('renames Italian keys, converts km to metres and flips junction geometry', () => {
        const rb = RB.importRoadbook({
            meta: { titolo: 'Giro', km_totali: 1.5 },
            notes: [{ testo: 'bivio a destra', km_prog: 0.5, km_parz: 0.2, bivio: [{ pivot: [1, 2], punta: [3, 4], th: 5, rt: 2 }] }],
        });
        expect(rb.meta.title).toBe('Giro');
        expect(rb.meta.total_distance).toBe(1500);
        expect(rb.meta.titolo).toBeUndefined();
        const n = rb.notes[0];
        expect(n.text).toBe('bivio a destra');
        expect(n.distance).toBe(500);
        expect(n.partial_distance).toBe(200);
        expect(n.testo).toBeUndefined();
        expect(n.bivio).toBeUndefined();
        // +y-down (suite) → +y-up (rdbk): the y of pivot and tip is negated
        expect(n.junctions).toEqual([{ pivot: [1, -2], tip: [3, -4], width: 5, road_type: 2 }]);
    });

    it('is idempotent on a file already in the canonical shape', () => {
        const canonical = {
            meta: { title: 'Done', total_distance: 1000, note_count: 1 },
            notes: [{ num: 1, idx: 0, text: 'start', distance: 0, junctions: null, icons: [] }],
            track: [{ lat: 0, lon: 0 }],
            icons: {},
        };
        const once = RB.importRoadbook(JSON.parse(JSON.stringify(canonical)));
        // a canonical file has no suite markers, so nothing is renamed or recomputed
        expect(once.meta).toEqual(canonical.meta);
        expect(once.notes[0].num).toBe(1);
        expect(once.notes[0].distance).toBe(0);
        expect(once.notes[0].text).toBe('start');
        expect(once.notes[0].junctions).toBeNull();
    });

    it('tags a note carrying a speed-limit sign as a speed-controlled zone (#94)', () => {
        const rb = RB.importRoadbook({
            meta: { title: 'T' },
            notes: [
                { num: 1, idx: 0, junctions: null, icons: [{ name: 'S03_30km.svg' }] }, // 30 km/h sign
                { num: 2, idx: 1, junctions: null, icons: [{ name: 'S99_end.svg' }] },   // end of limit
                { num: 3, idx: 2, junctions: null, icons: [{ name: 'I02_partenza.png' }] }, // no speed sign
            ],
            track: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0, lon: 0.002 }],
        });
        expect(rb.notes[0].speed_limit).toBe(30);
        expect(rb.notes[0].wp_type).toBe('dz');   // a positive limit → zone start
        expect(rb.notes[1].speed_limit).toBe(0);
        expect(rb.notes[1].wp_type).toBe('fz');   // end of limit → zone end
        expect(rb.notes[2].speed_limit).toBeUndefined();
        expect(rb.notes[2].wp_type).toBeUndefined();
    });

    it('does not override a speed_limit / wp_type a file already declares', () => {
        const rb = RB.importRoadbook({
            meta: { title: 'T' },
            notes: [{ num: 1, idx: 0, junctions: null, speed_limit: 50, wp_type: 'masked', icons: [{ name: 'S03_30km.svg' }] }],
            track: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }],
        });
        expect(rb.notes[0].speed_limit).toBe(50);      // kept
        expect(rb.notes[0].wp_type).toBe('masked');    // kept
    });
});

describe('filterRoadbooks (My roadbooks search)', () => {
    const list = [
        { id: 1, title: 'Alquería Vélez Rubio' },
        { id: 2, title: 'Casa a Casa' },
        { id: 3, title: 'Drawn route' },
        { id: 4, title: '' },
    ];
    it('returns a copy of the whole list for a blank/whitespace query', () => {
        expect(RB.filterRoadbooks(list, '')).toHaveLength(4);
        expect(RB.filterRoadbooks(list, '   ')).toHaveLength(4);
        expect(RB.filterRoadbooks(list, '')).not.toBe(list); // copy, not the same array
    });
    it('matches the title case-insensitively, anywhere in the string', () => {
        expect(RB.filterRoadbooks(list, 'casa').map((r) => r.id)).toEqual([2]);
        expect(RB.filterRoadbooks(list, 'CASA').map((r) => r.id)).toEqual([2]);
        expect(RB.filterRoadbooks(list, 'rubio').map((r) => r.id)).toEqual([1]);
    });
    it('trims the query and returns [] when nothing matches', () => {
        expect(RB.filterRoadbooks(list, '  casa  ').map((r) => r.id)).toEqual([2]);
        expect(RB.filterRoadbooks(list, 'zzz')).toEqual([]);
    });
    it('is null-safe on the list and on missing titles', () => {
        expect(RB.filterRoadbooks(null, 'x')).toEqual([]);
        expect(RB.filterRoadbooks(undefined, '')).toEqual([]);
        expect(RB.filterRoadbooks(list, 'x')).toEqual([]); // title:'' doesn't match 'x'
    });
});

describe('pendingWork (cross-tool unsaved-work scan, #73)', () => {
    const draft = { rb_editor_draft: { rb: { meta: { title: 'My route' }, notes: [{}, {}, {}] } } };
    const rec = { rb_recorder_session: { recording: true, recordedM: 3210 } };
    const tm = { rb_tripmaster_session: { totalM: 5120, waypoints: 0, timerOn: false, timerAcc: 0 } };
    const nav = { rb_session: { pen: {}, activeIdx: 4, totalM: 8300 }, rb_session_roadbook: { meta: { title: 'Rally X' }, notes: new Array(20) } };

    it('returns [] for an empty / all-null snapshot', () => {
        expect(RB.pendingWork({})).toEqual([]);
        expect(RB.pendingWork()).toEqual([]);
        expect(RB.pendingWork({ rb_editor_draft: null, rb_session: null })).toEqual([]);
    });
    it('describes an unsaved editor draft (title + note count)', () => {
        const [d] = RB.pendingWork(draft);
        expect(d).toMatchObject({ tool: 'editor', url: 'editor/', kind: 'draft', title: 'My route', noteCount: 3, keys: ['rb_editor_draft'] });
    });
    it('describes a recorder recording only while it is recording', () => {
        expect(RB.pendingWork(rec)).toEqual([{ tool: 'recorder', url: 'recorder/', keys: ['rb_recorder_session'], kind: 'recording', distanceM: 3210 }]);
        expect(RB.pendingWork({ rb_recorder_session: { recording: false, recordedM: 99 } })).toEqual([]);
    });
    it('describes a tripmaster run when any counter/timer/GPX is active, not when idle', () => {
        expect(RB.pendingWork(tm)[0]).toMatchObject({ tool: 'tripmaster', kind: 'run', distanceM: 5120 });
        expect(RB.pendingWork({ rb_tripmaster_session: { totalM: 0, waypoints: 0, timerOn: false, timerAcc: 0, gpxRecording: false } })).toEqual([]);
        expect(RB.pendingWork({ rb_tripmaster_session: { totalM: 0, waypoints: 0, gpxRecording: true } })).toHaveLength(1);
    });
    it('describes a reader run with note progress, and needs BOTH the session and its roadbook', () => {
        const [n] = RB.pendingWork(nav);
        expect(n).toMatchObject({ tool: 'reader', kind: 'navigation', title: 'Rally X', distanceM: 8300, noteIdx: 4, noteTotal: 20, keys: ['rb_session', 'rb_session_roadbook'] });
        expect(RB.pendingWork({ rb_session: { pen: {}, activeIdx: 1 } })).toEqual([]); // no roadbook → not resumable
        expect(RB.pendingWork({ rb_session: { activeIdx: 1 }, rb_session_roadbook: { notes: [] } })).toEqual([]); // no pen → not a real run
    });
    it('lists every pending item together', () => {
        const all = RB.pendingWork({ ...draft, ...rec, ...tm, ...nav });
        expect(all.map((i) => i.tool)).toEqual(['editor', 'recorder', 'tripmaster', 'reader']);
    });
});

describe('appWaypointSymbol (Garmin/OSMAnd mapping for GPX export, #34)', () => {
    it('maps a known RDBK icon to its Garmin sym + OSMAnd icon + colour', () => {
        const r = RB.appWaypointSymbol({ icons: [{ name: 'I07_acqua_potabile.png' }] });
        expect(r.sym).toBe('Drinking Water');
        expect(r.osmandIcon).toBe('drinking_water');
        expect(r.color).toBe('#3a8dff'); // blue
    });
    it('matches the icon name case-insensitively and ignores any path prefix', () => {
        const r = RB.appWaypointSymbol({ icons: [{ name: 'sub/dir/I10_STAZIONE_servizio.PNG' }] });
        expect(r.sym).toBe('Gas Station');
        expect(r.osmandIcon).toBe('fuel');
    });
    it('keeps a recognised icon’s sym but forces red on a danger note', () => {
        const r = RB.appWaypointSymbol({ danger: 3, icons: [{ name: 'I07_acqua_potabile.png' }] });
        expect(r.sym).toBe('Drinking Water'); // the icon still wins for the sym
        expect(r.color).toBe('#e01414');      // danger only overrides the colour → red
    });
    it('uses the Dangerous Area marker for a danger note with no recognised icon', () => {
        const r = RB.appWaypointSymbol({ danger: 2, icons: [] });
        expect(r.sym).toBe('Dangerous Area');
        expect(r.color).toBe('#e01414');
    });
    it('falls back to the default blue flag for a note with no recognised icon', () => {
        const r = RB.appWaypointSymbol({ icons: [] });
        expect(r.sym).toBe('Flag, Blue');
        expect(r.osmandIcon).toBe('special_point');
        expect(r.color).toBe('#3a8dff'); // blue
    });
    it('a declared wp_type wins over the icon and carries its sym/icon/colour', () => {
        const r = RB.appWaypointSymbol({ wp_type: 'masked', icons: [{ name: 'I07_acqua_potabile.png' }] });
        expect(r.sym).toBe('Flag, Blue');        // the masked-WP sym, not Drinking Water
        expect(r.osmandIcon).toBe('special_marker');
        expect(r.color).toBe('#a855f7');         // the type colour
    });
});

describe('WP_TYPES catalog (waypoint characterization, #63)', () => {
    it('exposes a flat catalog with unique ids and a tier on every entry', () => {
        const ids = RB.WP_TYPES.map((w) => w.id);
        expect(ids.length).toBe(new Set(ids).size);
        expect(RB.WP_TYPES.every((w) => w.tier === 'core' || w.tier === 'rally')).toBe(true);
        expect(RB.WP_TYPES.every((w) => w.cap || w.glyph)).toBe(true); // a label to render
    });
    it('wpType() looks an entry up, and is null-safe on unset/unknown ids', () => {
        expect(RB.wpType('masked').cap).toBe('WPM');
        expect(RB.wpType('ss_start').color).toBe('#ee9a3c'); // FIA: zone start = orange
        expect(RB.wpType(null)).toBeNull();
        expect(RB.wpType('nope')).toBeNull();
    });
    it('wpTypesForProfile() scopes the vocabulary: core-only vs the full FIA set', () => {
        const basic = RB.wpTypesForProfile('basic');
        const rally = RB.wpTypesForProfile('rally');
        expect(basic.every((w) => w.tier === 'core')).toBe(true);
        expect(rally.length).toBe(RB.WP_TYPES.length);
        expect(rally.length).toBeGreaterThan(basic.length);
        expect(RB.wpTypesForProfile(undefined).length).toBe(basic.length); // absent profile ⇒ basic
    });
    it('radius-bearing FIA types carry a default radius; zone boundaries do not', () => {
        expect(RB.wpType('precise').radius).toBe(30);
        expect(RB.wpType('navigation').radius).toBe(90);
        expect(RB.wpType('dz').radius).toBeUndefined();
    });
    it('detectionRadius follows the precedence: note → roadbook → type → system', () => {
        const meta = { default_wp_radius: 60 };
        expect(RB.detectionRadius({ wp_radius: 40, wp_type: 'precise' }, meta)).toBe(40);
        expect(RB.detectionRadius({ wp_type: 'precise' }, meta)).toBe(60);
        expect(RB.detectionRadius({ wp_type: 'precise' }, {})).toBe(30); // the type's own default
        expect(RB.detectionRadius({}, {})).toBe(RB.CONST.REACH_DEFAULT_M);
        expect(RB.detectionRadius(null, null)).toBe(RB.CONST.REACH_DEFAULT_M);
        expect(RB.CONST.REACH_DEFAULT_M).toBe(30); // system default when the roadbook defines nothing
    });
    it('reachRadius = detection radius, capped to half the smaller neighbour gap, floored above GPS noise (#87)', () => {
        const wide = { wp_radius: 40, partial_distance: 1000 };
        // gaps large on both sides → the note's own radius wins
        expect(RB.reachRadius(wide, { partial_distance: 1000 }, {})).toBe(40);
        // last note (no next) → forward gap is infinite, radius still wins
        expect(RB.reachRadius(wide, null, {})).toBe(40);
        // a tight previous gap caps the reach to half that gap
        expect(RB.reachRadius({ wp_radius: 40, partial_distance: 50 }, { partial_distance: 1000 }, {})).toBe(25);
        // a tight forward gap caps it too (uses the smaller of the two)
        expect(RB.reachRadius({ wp_radius: 40, partial_distance: 1000 }, { partial_distance: 30 }, {})).toBe(RB.CONST.REACH_MIN_M); // 15 → floored to 18
        // a very tight cluster is floored, never demanding sub-GPS precision
        expect(RB.reachRadius({ wp_radius: 40, partial_distance: 20 }, { partial_distance: 20 }, {})).toBe(RB.CONST.REACH_MIN_M);
        // no per-note radius → falls back through detectionRadius (roadbook default here), then capped
        expect(RB.reachRadius({ partial_distance: 1000 }, { partial_distance: 1000 }, { default_wp_radius: 50 })).toBe(50);
    });
    it('wpBadgeSVG renders a solid roundel with the acronym, and is empty when unset', () => {
        const svg = RB.wpBadgeSVG('dz', 26);
        expect(svg).toContain('<svg');
        expect(svg).toContain('#ee9a3c'); // the type colour fills the circle
        expect(svg).toContain('>DZ</text>');
        expect(RB.wpBadgeSVG(null)).toBe('');
        expect(RB.wpBadgeSVG('nope')).toBe('');
    });
});

describe('nearestOnTrack (project a point onto the polyline)', () => {
    const track = [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }]; // 1° eastward segment on the equator
    it('returns null for a track with fewer than two points', () => {
        expect(RB.nearestOnTrack([], { lat: 0, lon: 0 })).toBeNull();
        expect(RB.nearestOnTrack([{ lat: 0, lon: 0 }], { lat: 0, lon: 0 })).toBeNull();
    });
    it('projects a point on the segment back onto it (t in the middle, ~0 distance)', () => {
        const r = RB.nearestOnTrack(track, { lat: 0, lon: 0.5 });
        expect(r.i).toBe(0);
        expect(r.t).toBeCloseTo(0.5, 3);
        expect(r.lon).toBeCloseTo(0.5, 4);
        expect(r.dist).toBeCloseTo(0, 0);
    });
    it('clamps to the start when the point is before the segment', () => {
        const r = RB.nearestOnTrack(track, { lat: 0, lon: -1 });
        expect(r.t).toBe(0);
        expect(r.lon).toBeCloseTo(0, 6);
    });
    it('reports the perpendicular offset for an off-track point (~1.1 km for 0.01°)', () => {
        const r = RB.nearestOnTrack(track, { lat: 0.01, lon: 0.5 });
        expect(r.lon).toBeCloseTo(0.5, 4);
        expect(r.dist).toBeGreaterThan(1000);
        expect(r.dist).toBeLessThan(1200);
    });
});

describe('OpenRally round-trip (openRallyDocument → parseOpenRally)', () => {
    // The track + waypoint coordinates + names round-trip through plain (non-namespaced) GPX.
    // The openrally: <extensions> values (cap/danger/tulip) DO round-trip in a real browser, but
    // happy-dom's getElementsByTagNameNS doesn't read namespaced children, so they aren't asserted here.
    it('preserves the track and the note coordinates/count through build→serialize→parse', () => {
        const track = [{ lat: 45, lon: 9 }, { lat: 45, lon: 9.001 }, { lat: 45.001, lon: 9.002 }];
        const rb = RB.buildRoadbook({ name: 'src', trkpts: track, wpts: [] });
        const back = RB.parseOpenRally(RB.openRallyDocument(rb, { tulips: [], name: 'RT roundtrip' }));
        expect(back.warnings).not.toContain('placeholderTrack');
        expect(back.warnings).not.toContain('builtTrackFromWaypoints'); // a real track survives as the track
        expect(back.rb.meta.title).toBe('RT roundtrip');
        expect(back.rb.track).toHaveLength(track.length);
        expect(back.rb.track[2].lat).toBeCloseTo(45.001, 5);
        expect(back.rb.track[2].lon).toBeCloseTo(9.002, 5);
        expect(back.rb.notes).toHaveLength(rb.notes.length);
        expect(back.rb.notes[1].lat).toBeCloseTo(rb.notes[1].lat, 5);
        expect(back.rb.notes[1].lon).toBeCloseTo(rb.notes[1].lon, 5);
    });
    it('emits <openrally:wptType> when a note has wp_type', () => {
        const track = [{ lat: 45, lon: 9 }, { lat: 45, lon: 9.001 }, { lat: 45.001, lon: 9.002 }];
        const rb = RB.buildRoadbook({ name: 'src', trkpts: track, wpts: [] });
        rb.notes[0].wp_type = 'masked';
        const xml = RB.openRallyDocument(rb, { tulips: [] });
        expect(xml).toContain('<openrally:wptType>masked</openrally:wptType>');
        expect(xml.split('<openrally:wptType>').length - 1).toBe(1);
    });
    it('does not emit wptType for notes without wp_type', () => {
        const track = [{ lat: 45, lon: 9 }, { lat: 45.001, lon: 9.001 }];
        const rb = RB.buildRoadbook({ name: 'src', trkpts: track, wpts: [] });
        const xml = RB.openRallyDocument(rb, { tulips: [] });
        expect(xml).not.toContain('wptType');
    });
});

describe('NoteCanvas.toSVG (vignette render)', () => {
    const baseNote = { num: 2, bearing_in: 0, bearing_out: 0, road_type_in: 3, road_type_out: 3, icons: [], junctions: null };
    it('renders an <svg> with the central validation circle and an exit arrow', () => {
        const s = NoteCanvas.toSVG(baseNote);
        expect(s.startsWith('<svg')).toBe(true);
        expect(s.trimEnd().endsWith('</svg>')).toBe(true);
        expect(s).toContain('<circle cx="115" cy="81" r="6"'); // validation point
        expect(s).toContain('marker-end="url(#vig-arr)"');      // the exit arrow
    });
    it('draws the validation circle ON TOP of junctions and icons so they never hide it (#142)', () => {
        const s = NoteCanvas.toSVG({
            ...baseNote,
            icons: [{ name: 'S03_30km.svg', pos: [0, 0], size: 64 }], // centre-placed icon (e.g. auto speed symbol)
            junctions: [{ pivot: [0, 0], tip: [45, 25], width: 8, road_type: 3 }],
        }, (ic) => ic.name);
        const circle = s.indexOf('<circle cx="115" cy="81" r="6"');
        expect(circle).toBeGreaterThan(s.lastIndexOf('marker-end="url(#vig-tick)"')); // after every junction
        expect(circle).toBeGreaterThan(s.lastIndexOf('<image'));                      // after every icon
    });
    it('renders a cover icon full-box and nothing else (no trunk/validation circle)', () => {
        const s = NoteCanvas.toSVG({ icons: [{ name: 'or.svg', cover: true }] }, (ic) => 'DATA:' + ic.name);
        expect(s).toContain('width="230" height="162" href="DATA:or.svg"');
        expect(s).not.toContain('#vig-arr');
        expect(s).not.toContain('r="6"');
    });
    it('resolves placed-icon hrefs through resolveIcon', () => {
        const s = NoteCanvas.toSVG({ ...baseNote, icons: [{ name: 'a.png', pos: [0, 0], size: 32 }] }, (ic) => 'RES:' + ic.name);
        expect(s).toContain('href="RES:a.png"');
    });
    it('shows FIA danger marks (!!) for a danger-2 note', () => {
        const s = NoteCanvas.toSVG({ ...baseNote, danger: 2 });
        expect(s).toContain('>!!</text>');
    });
    it('escapes the resolved icon URL so a crafted .rdbk icon name cannot break out of the href', () => {
        // A malicious roadbook (e.g. a public one rendered on /challenge/<slug>) could set an
        // icon name with a quote to inject an onerror handler into the <image> element.
        const evil = 'a" onerror="alert(1)';
        const placed = NoteCanvas.toSVG({ ...baseNote, icons: [{ name: evil, pos: [0, 0], size: 32 }] }, (ic) => ic.name);
        const cover = NoteCanvas.toSVG({ icons: [{ name: evil, cover: true }] }, (ic) => ic.name);
        expect(placed).not.toContain('onerror="'); // no live event-handler attribute
        expect(cover).not.toContain('onerror="');
        expect(placed).toContain('href="a&quot; onerror=&quot;alert(1)"'); // quote neutralised
    });
});

describe('deleteNote (remove a note and its track vertex, #65)', () => {
    it('removes the note + its vertex, reconnects the route, and shifts later idx down', () => {
        const rb = {
            meta: {},
            track: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 0, lon: 2 }, { lat: 0, lon: 3 }],
            notes: [{ idx: 0, road_type_out: 3 }, { idx: 1, road_type_out: 3 }, { idx: 3, road_type_out: 3 }],
        };
        RB.recomputeMetrics(rb);
        const removed = RB.deleteNote(rb, 1); // delete the middle note (sits on vertex idx 1)
        expect(removed).toBe(1);
        expect(rb.track.map((p) => p.lon)).toEqual([0, 2, 3]); // the lon=1 vertex is gone — route straightened
        expect(rb.notes.map((n) => n.idx)).toEqual([0, 2]);    // the note that was at idx 3 shifted to 2
    });
    it('keeps the vertex (note-only removal) when the track would fall below 2 points', () => {
        const rb = {
            meta: {},
            track: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }],
            notes: [{ idx: 0, road_type_out: 3 }, { idx: 1, road_type_out: 3 }],
        };
        RB.recomputeMetrics(rb);
        const removed = RB.deleteNote(rb, 0);
        expect(removed).toBe(-1);
        expect(rb.track).toHaveLength(2); // vertex kept — route geometry intact
        expect(rb.notes).toHaveLength(1);
    });
    it('does not touch a vertex before the deleted note', () => {
        const rb = {
            meta: {},
            track: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 0, lon: 2 }],
            notes: [{ idx: 0, road_type_out: 3 }, { idx: 2, road_type_out: 3 }],
        };
        RB.recomputeMetrics(rb);
        RB.deleteNote(rb, 1); // delete the note at idx 2 (the end)
        expect(rb.track.map((p) => p.lon)).toEqual([0, 1]); // lon=2 removed; earlier points untouched
        expect(rb.notes.map((n) => n.idx)).toEqual([0]);
    });
});

describe('filterByText (generic multi-field search, #79)', () => {
    const users = [
        { id: 1, username: 'maxcroll', email: 'm_sabattini@hotmail.com', first_name: 'Max' },
        { id: 2, username: 'elena.rosa', email: 'elena.rosa.lc@gmail.com', first_name: 'Elena' },
    ];
    it('matches ANY of the given fields, case-insensitively', () => {
        expect(RB.filterByText(users, 'HOTMAIL', ['username', 'email']).map((u) => u.id)).toEqual([1]);
        expect(RB.filterByText(users, 'elena', ['username', 'email', 'first_name']).map((u) => u.id)).toEqual([2]);
        expect(RB.filterByText(users, 'max', ['first_name']).map((u) => u.id)).toEqual([1]);
    });
    it('blank query returns a copy of the whole list', () => {
        expect(RB.filterByText(users, '  ', ['username'])).toHaveLength(2);
        expect(RB.filterByText(users, '', ['username'])).not.toBe(users);
    });
    it('is null-safe (list, fields, missing values) and returns [] on no match', () => {
        expect(RB.filterByText(null, 'x', ['username'])).toEqual([]);
        expect(RB.filterByText(users, 'zzz', ['username', 'email'])).toEqual([]);
        expect(RB.filterByText(users, 'max', ['nope'])).toEqual([]); // field absent on the items
    });
    it('still backs filterRoadbooks (title-only) unchanged', () => {
        const rbs = [{ title: 'Casa' }, { title: 'Drawn route' }];
        expect(RB.filterRoadbooks(rbs, 'casa').map((r) => r.title)).toEqual(['Casa']);
        expect(RB.filterRoadbooks(rbs, '')).toHaveLength(2);
    });
});

describe('roadbook publication status (#96)', () => {
    it('exposes the draft → ready → public lifecycle in order', () => {
        expect(RB.ROADBOOK_STATUSES).toEqual(['draft', 'ready', 'public']);
    });
    it('normalises known states to themselves', () => {
        expect(RB.roadbookStatus('draft')).toBe('draft');
        expect(RB.roadbookStatus('ready')).toBe('ready');
        expect(RB.roadbookStatus('public')).toBe('public');
    });
    it('falls back to draft for anything unknown (matches the API)', () => {
        expect(RB.roadbookStatus('bogus')).toBe('draft');
        expect(RB.roadbookStatus('')).toBe('draft');
        expect(RB.roadbookStatus(undefined)).toBe('draft');
        expect(RB.roadbookStatus(null)).toBe('draft');
    });
});

describe('appwptFromImport — GPX icon recovery', () => {
    it('recognises an OSMAnd icon back to the RDBK icon', () => {
        const r = RB.appwptFromImport('', 'special_flag_finish', '');
        expect(r.icon).toBe('I01_arrivo.png');
    });
    it('recognises a Garmin sym back to the RDBK icon (fallback)', () => {
        const r = RB.appwptFromImport('Flag, Checkered', '', '');
        expect(r.icon).toBe('I01_arrivo.png');
    });
    it('returns danger:3 for Dangerous Area / special_marker', () => {
        expect(RB.appwptFromImport('Dangerous Area', '', '')).toEqual({ danger: 3 });
        expect(RB.appwptFromImport('', 'special_marker', '')).toEqual({ danger: 3 });
    });
    it('returns appwpt for an unrecognised but valid sym+osmandIcon (round-trip passthrough)', () => {
        const r = RB.appwptFromImport('Picnic Area', 'custom_icon', '#ff0000');
        expect(r.appwpt).toBeTruthy();
        expect(r.appwpt.sym).toBe('Picnic Area');
        expect(r.appwpt.osmandIcon).toBe('custom_icon');
        expect(r.appwpt.color).toBe('#ff0000');
    });
    it('derives the OSMAnd icon from the Garmin sym if neither is recognised', () => {
        const r = RB.appwptFromImport('tall tower', '', '');
        expect(r.appwpt).toBeTruthy();
        expect(r.appwpt.osmandIcon).toBe('man_made_mast');
        expect(r.appwpt.sym).toBe('tall tower');
    });
    it('derives the colour from a Garmin sym with a colour word', () => {
        const r = RB.appwptFromImport('Circle, Green', '', '');
        expect(r.appwpt.color).toBe('#00842b');
    });
    it('returns {} for a plain waypoint with no icon info', () => {
        expect(RB.appwptFromImport('', '', '')).toEqual({});
    });
});

describe('parseOpenRally — fallback paths and tulipToDataURL', () => {
    const GPX_EMPTY = '<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1" xmlns:openrally="http://www.openrally.org/xmlschemas/GpxExtensions/v1.0.3"></gpx>';

    it('warns placeholderTrack when the file has no trkpt and no real coords on wpts', () => {
        const xml = GPX_EMPTY.replace('</gpx>',
            '<wpt lat="0" lon="0"><name>N1</name><extensions><openrally:distance>5.2</openrally:distance></extensions></wpt></gpx>');
        const { warnings, rb } = RB.parseOpenRally(xml);
        expect(warnings).toContain('placeholderTrack');
        expect(rb.notes).toHaveLength(1);
    });

    it('warns builtTrackFromWaypoints when no trk segment but wpts have real coords', () => {
        const xml = GPX_EMPTY.replace('</gpx>',
            '<wpt lat="45.5" lon="9.1"><name>N1</name></wpt><wpt lat="45.6" lon="9.2"><name>N2</name></wpt></gpx>');
        const { warnings, rb } = RB.parseOpenRally(xml);
        expect(warnings).toContain('builtTrackFromWaypoints');
        expect(rb.track).toHaveLength(2);
        expect(rb.notes).toHaveLength(2);
    });

    it('passes a real trk segment through without warnings', () => {
        const xml = GPX_EMPTY.replace('</gpx>',
            '<trk><trkseg><trkpt lat="45" lon="9"></trkpt><trkpt lat="46" lon="9"></trkpt></trkseg></trk>'
            + '<wpt lat="45.2" lon="9.1"><name>N1</name></wpt></gpx>');
        const { warnings, rb } = RB.parseOpenRally(xml);
        expect(warnings).not.toContain('placeholderTrack');
        expect(warnings).not.toContain('builtTrackFromWaypoints');
        expect(rb.track).toHaveLength(2);
    });

    // tulipToDataURL is exported for direct testing (happy-dom can't parse namespaced XML children).
    it('tulipToDataURL keeps an existing data: URI unchanged', () => {
        expect(RB.tulipToDataURL('data:image/svg+xml,%3Csvg%3E%3C/svg%3E')).toBe('data:image/svg+xml,%3Csvg%3E%3C/svg%3E');
    });

    it('tulipToDataURL wraps an SVG string into a data URI', () => {
        const r = RB.tulipToDataURL('<svg></svg>');
        expect(r).toMatch(/^data:image\/svg\+xml/);
    });

    it('tulipToDataURL treats bare base64 as PNG', () => {
        const r = RB.tulipToDataURL('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
        expect(r).toMatch(/^data:image\/png;base64/);
    });

    it('tulipToDataURL returns null for empty/whitespace input', () => {
        expect(RB.tulipToDataURL('')).toBeNull();
        expect(RB.tulipToDataURL('  ')).toBeNull();
    });

    // OpenRally export emits an <openrally:wptType> element; DOM round-trips fine.
    // The import side capture of non-standard openrally: elements (captureOr) is covered by
    // the existing wp_type round-trip test above — it exercises the namespace parsing + emitOr
    // passthrough path through openRallyDocument.
});
