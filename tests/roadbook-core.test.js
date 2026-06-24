import { describe, it, expect } from 'vitest';
import RB from '../public/assets/js/roadbook-core.js';

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
});
