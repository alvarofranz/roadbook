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
        expect(rb.track[0].time_ms).toBe(0);           // times preserved into the .rdbk track
        expect(rb.track[4].time_ms).toBe(400);
        const note = rb.notes.find((n) => n.text === 'return' || n.track_index === 3);
        expect(note.track_index).toBe(3);                       // the return-leg point (t=300), not the outbound idx 1
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
        expect(rb.notes[0].track_index).toBe(0);
        expect(rb.notes[0].distance).toBe(0);
        expect(rb.notes[0].partial_distance).toBe(0);
        expect(rb.notes[1].track_index).toBe(2);
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
    it('road_type_in follows the previous note road_type; the first note arrives on its own', () => {
        const rb = {
            meta: {},
            track: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0, lon: 0.002 }],
            notes: [
                { track_index: 0, road_type: 2 },
                { track_index: 2, road_type: 4 },
            ],
        };
        RB.recomputeMetrics(rb);
        expect(rb.notes[0].road_type_in).toBe(2); // first note: in == out
        expect(rb.notes[1].road_type_in).toBe(2); // inherits previous note's out
        expect(rb.notes[1].road_type).toBe(4);
        expect(rb.notes[0].num).toBe(1);
        expect(rb.meta.note_count).toBe(2);
        expect(rb.meta.total_distance).toBeGreaterThan(0);
    });

    it('derives each note bearing from the track heading (the data the editor map rotates to)', () => {
        const rb = {
            meta: {},
            track: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0, lon: 0.002 }], // due east
            notes: [{ track_index: 1, road_type: 2 }],
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
                { track_index: 0, lat: 0, lon: 0, cap: 0, cap_distance: 0 },
                { track_index: 1, lat: 0, lon: 0.002, cap: null },
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

describe('note blocks — the material around a note (#542)', () => {
    const withBlocks = () => ({
        meta: {},
        track: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0, lon: 0.002 }],
        notes: [
            { track_index: 0, road_type: 2, blocks: [{ type: 'text', placement: 'before', text: 'Read me first' }] },
            { track_index: 2, road_type: 2, blocks: [{ type: 'ad', placement: 'after', image: 'data:x', text: 'ACME' }] },
        ],
    });

    it('the catalog is what every surface builds itself from', () => {
        expect(RB.NOTE_BLOCKS.map((k) => k.id)).toEqual(['photo', 'ad', 'text']);
        for (const k of RB.NOTE_BLOCKS) { expect(k.name, k.id).toBeTruthy(); expect(k.icon, k.id).toMatch(/^fa-/); }
        for (const k of RB.NOTE_BLOCKS.filter((x) => x.image)) expect(k.imageMax, k.id).toBeGreaterThan(0);
    });

    it('material of a type this version does not know still reads as text', () => {
        expect(RB.blockType({ type: 'photo' }).id).toBe('photo');
        expect(RB.blockType({ type: 'whatever-comes-next' }).id).toBe('text');
        expect(RB.blockType(null).id).toBe('text');
    });

    it('a note hands over its material, by side', () => {
        const n = withBlocks().notes[0];
        expect(RB.noteBlocks(n).length).toBe(1);
        expect(RB.noteBlocks(n, 'before').length).toBe(1);
        expect(RB.noteBlocks(n, 'after').length).toBe(0);
        // no `placement` means after — the side a block ends up on is never undefined
        expect(RB.noteBlocks({ blocks: [{ type: 'text' }] }, 'after').length).toBe(1);
        expect(RB.noteBlocks({}).length).toBe(0);
        expect(RB.noteBlocks(null).length).toBe(0);
    });

    it('every row is a note: numbering and note_count count them all', () => {
        const rb = withBlocks();
        RB.recomputeMetrics(rb);
        expect(rb.notes.map((n) => n.num)).toEqual([1, 2]);
        expect(rb.meta.note_count).toBe(2);
        expect(rb.notes[0].blocks[0].text, 'the material is left alone').toBe('Read me first');
    });

    it('material travels with its note through a reverse', () => {
        const rb = withBlocks();
        RB.recomputeMetrics(rb);
        const total = rb.meta.total_distance;
        RB.reverseRoadbook(rb);
        expect(rb.meta.note_count).toBe(2);
        expect(rb.notes[0].distance).toBe(0);
        expect(rb.notes[1].distance).toBe(total);
        expect(rb.notes.flatMap((n) => RB.noteBlocks(n)).map((b) => b.type).sort()).toEqual(['ad', 'text']);
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
        rb.notes.forEach((n) => expect(n.track_index).toBeLessThan(rb.track.length));
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
            { num: 1, track_index: 2, lat: track[2].lat, lon: track[2].lon, text: 'out', distance: 0, partial_distance: 0 },
            { num: 2, track_index: iBack, lat: track[iBack].lat, lon: track[iBack].lon, text: 'back', distance: 0, partial_distance: 0 },
        ];
        const rb = { meta: { title: 'T', total_distance: 0, note_count: 2 }, track, notes };
        RB.simplifyRoadbook(rb, 5);
        // travel order preserved (out before back) and the return note keeps a return-leg distance:
        // ~85% of the ~222 m round trip, not the ~33 m of the outbound pass it must NOT snap to
        expect(rb.notes[0].text).toBe('out');
        expect(rb.notes[1].text).toBe('back');
        expect(rb.notes[1].track_index).toBeGreaterThan(rb.notes[0].track_index);
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
    it('a note imposes the limit it declares (0 = lifted), and nothing else', () => {
        expect(RB.speedLimitOfNote({ speed_limit_kmh: 50, symbols: [{ name: 'S03_30km.svg' }] })).toBe(50);
        expect(RB.speedLimitOfNote({ speed_limit_kmh: 0, symbols: [] })).toBe(0);
        expect(RB.speedLimitOfNote({ symbols: [{ name: 'S03_30km.svg' }] }), 'a sign is a drawing, the limit is the field').toBeNull();
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
        expect(meta).toHaveLength(55); // sum of META_WIDTHS (incl. the 6-char rb field)
        const parsed = RB.parseMeta(meta);
        for (const k of Object.keys(fields)) expect(Number(parsed[k])).toBe(fields[k]);
    });

    it('carries the roadbook slug prefix in the rb field and truncates it to the field width', () => {
        expect(RB.metaRbPrefix('monza-stage-1')).toBe('monza-'); // truncated to 6 chars
        expect(RB.metaRbPrefix('ab')).toBe('ab');                // shorter slugs pass through
        expect(RB.metaRbPrefix('')).toBe('');
        const meta = RB.buildMeta({ team: 3, rb: 'monza-stage-1' });
        expect(RB.parseMeta(meta).rb).toBe('monza-');            // round-trips back to the prefix (trailing pad trimmed)
        const shortMeta = RB.buildMeta({ team: 3, rb: 'ab' });
        expect(RB.parseMeta(shortMeta).rb).toBe('ab');
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

    it('verifies a payload whose rb field is space-padded (the padding is part of the signed string)', async () => {
        // Regression: verifyMeta must NOT trim the meta, or the rb field's trailing padding is
        // dropped before the HMAC is recomputed and every real result fails to validate.
        const meta = RB.buildMeta({ team: 1, accuracy: 10, rb: 'ab' }); // 'ab' → 'ab    ' (4 trailing spaces)
        expect(meta.endsWith('    ')).toBe(true);
        const payload = await RB.signMeta(meta, key);
        const v = await RB.verifyMeta(payload, key);
        expect(v.valid).toBe(true);
        expect(v.meta).toBe(meta);
        expect(RB.parseMeta(v.meta).rb).toBe('ab');
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

describe('symbolSrc resolution', () => {
    it('the roadbook\'s own library first, by its exact name; else the palette under the base path', () => {
        const rb = { symbols: { 'Foo.png': 'data:embedded' } };
        expect(RB.symbolSrc({ name: 'Foo.png' }, rb, 'assets/')).toBe('data:embedded');
        expect(RB.symbolSrc({ name: 'bar.png' }, rb, 'assets/icons/')).toBe('assets/icons/bar.png');
    });
});

describe('Roadbook Suite import (another program\'s format, translated)', () => {
    const track = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0, lon: 0.002 }];
    it('translates the Italian keys, the road codes and the +y-down junction geometry', () => {
        const rb = RB.readRoadbook({
            meta: { titolo: 'Giro', km_totali: 1.5 }, track,
            notes: [{ idx: 0, testo: 'bivio a destra', km_prog: 0, road_type_out: 3, bivio: [{ pivot: [1, 2], punta: [3, 4], th: 5, rt: 2 }] }, { idx: 2, testo: 'fine' }],
        });
        expect(rb.rdbk_version).toBe(1);
        expect(rb.meta.title).toBe('Giro');
        const n = rb.notes[0];
        expect(n.text).toBe('bivio a destra');
        expect(n.road_type).toBe(2); // the suite's track → the FIA track
        expect(n.junctions).toEqual([{ from: [1, -2], to: [3, -4], road_type: 1 }]); // asphalt → tarmac; y negated
        expect(rb.notes[1].distance).toBe(rb.meta.total_distance); // distances come from the track
        expect(RB.validateRoadbook(RB.writeRoadbook(rb)).valid).toBe(true);
    });
    it('a speed-limit sign is a speed-controlled zone (#94)', () => {
        const rb = RB.readRoadbook({
            meta: { titolo: 'T' }, track,
            notes: [
                { idx: 0, testo: 'a', icons: [{ file: 'icons/S03_30km.png', pos: [0, 0], size: 32 }] },
                { idx: 1, testo: 'b', icons: [{ file: 'S99_end.png', pos: [0, 0], size: 32 }] },
                { idx: 2, testo: 'c', icons: [{ name: 'I02_partenza.png', pos: [0, 0], size: 32 }] },
            ],
        });
        expect(rb.notes[0].symbols[0].name).toBe('S03_30km.svg');
        expect(rb.notes[0].speed_limit_kmh).toBe(30);
        expect(rb.notes[0].waypoint_type).toBe('dz');
        expect(rb.notes[1].speed_limit_kmh).toBe(0);
        expect(rb.notes[1].waypoint_type).toBe('fz');
        expect(rb.notes[2].speed_limit_kmh).toBeUndefined();
    });
    it('a Suite file without a track cannot become a roadbook', () => {
        expect(() => RB.readRoadbook({ meta: { titolo: 'T' }, notes: [{ testo: 'x' }] })).toThrow();
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
    const draft = { rb_editor_draft: { rb: { rdbk_version: 1, meta: { title: 'My route' }, notes: [{}, {}, {}] } } };
    const rec = { rb_recorder_session: { recording: true, recordedM: 3210 } };
    const tm = { rb_tripmaster_session: { totalM: 5120, waypoints: 0, timerOn: false, timerAcc: 0 } };
    const nav = { rb_session: { pen: {}, activeIdx: 4, totalM: 8300 }, rb_session_roadbook: { rdbk_version: 1, meta: { title: 'Rally X' }, notes: new Array(20) } };

    it('returns [] for an empty / all-null snapshot', () => {
        expect(RB.pendingWork({})).toEqual([]);
        expect(RB.pendingWork()).toEqual([]);
        expect(RB.pendingWork({ rb_editor_draft: null, rb_session: null })).toEqual([]);
    });
    it('never offers a checkpoint the user declined (#436)', () => {
        expect(RB.pendingWork({ rb_recorder_session: { recording: true, recordedM: 3210, declined: true } })).toEqual([]);
        expect(RB.pendingWork({ rb_editor_draft: { ...draft.rb_editor_draft, declined: true } })).toEqual([]);
        expect(RB.pendingWork({ ...rec, rb_editor_draft: { ...draft.rb_editor_draft, declined: true } })).toHaveLength(1);
    });
    it('describes an unsaved editor draft (title + note count)', () => {
        const [d] = RB.pendingWork(draft);
        expect(d).toMatchObject({ tool: 'editor', url: 'editor/', kind: 'draft', title: 'My route', noteCount: 3, keys: ['rb_editor_draft'] });
        // a roadbook of another .rdbk version is not work this version can resume
        expect(RB.pendingWork({ rb_editor_draft: { rb: { meta: { title: 'x' }, notes: [] } } })).toEqual([]);
    });
    it('lists a finished recording waiting for Save / Discard, resumable only (#460)', () => {
        expect(RB.pendingWork({ rb_recorder_session: { finishing: true, recordedM: 900 } })).toEqual([{ tool: 'recorder', url: 'recorder/', keys: [], kind: 'finished', resumeOnly: true, distanceM: 900 }]);
        expect(RB.pendingWork({ rb_recorder_pending_save: { finishing: true, recordedM: 400 } })[0]).toMatchObject({ kind: 'finished', resumeOnly: true });
    });
    it('describes a recorder recording only while it is recording', () => {
        expect(RB.pendingWork(rec)).toEqual([{ tool: 'recorder', url: 'recorder/', keys: ['rb_recorder_session'], kind: 'recording', resumeOnly: true, distanceM: 3210 }]);
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
        const r = RB.appWaypointSymbol({ symbols: [{ name: 'I07_acqua_potabile.png' }] });
        expect(r.sym).toBe('Drinking Water');
        expect(r.osmandIcon).toBe('drinking_water');
        expect(r.color).toBe('#3a8dff'); // blue
    });
    it('matches the icon name case-insensitively and ignores any path prefix', () => {
        const r = RB.appWaypointSymbol({ symbols: [{ name: 'sub/dir/I10_STAZIONE_servizio.PNG' }] });
        expect(r.sym).toBe('Gas Station');
        expect(r.osmandIcon).toBe('fuel');
    });
    it('keeps a recognised icon’s sym but forces red on a danger note', () => {
        const r = RB.appWaypointSymbol({ danger: 3, symbols: [{ name: 'I07_acqua_potabile.png' }] });
        expect(r.sym).toBe('Drinking Water'); // the icon still wins for the sym
        expect(r.color).toBe('#e01414');      // danger only overrides the colour → red
    });
    it('uses the Dangerous Area marker for a danger note with no recognised icon', () => {
        const r = RB.appWaypointSymbol({ danger: 2, symbols: [] });
        expect(r.sym).toBe('Dangerous Area');
        expect(r.color).toBe('#e01414');
    });
    it('falls back to the default blue flag for a note with no recognised icon', () => {
        const r = RB.appWaypointSymbol({ symbols: [] });
        expect(r.sym).toBe('Flag, Blue');
        expect(r.osmandIcon).toBe('special_point');
        expect(r.color).toBe('#3a8dff'); // blue
    });
    it('a declared waypoint_type wins over the icon and carries its sym/icon/colour', () => {
        const r = RB.appWaypointSymbol({ waypoint_type: 'masked', symbols: [{ name: 'I07_acqua_potabile.png' }] });
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
    it('wpTypeByCap() reverse-lookup: OpenRally cap code → type', () => {
        expect(RB.wpTypeByCap('WPM').id).toBe('masked');
        expect(RB.wpTypeByCap('WPN').id).toBe('navigation');
        expect(RB.wpTypeByCap('WPE').id).toBe('eclipse');
        expect(RB.wpTypeByCap('DSS').id).toBe('ss_start');
        expect(RB.wpTypeByCap('STOP').id).toBe('stop');
        expect(RB.wpTypeByCap(null)).toBeNull();
        expect(RB.wpTypeByCap('NOPE')).toBeNull();
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
        const meta = { default_validation_radius: 60 };
        expect(RB.detectionRadius({ validation_radius: 40, waypoint_type: 'precise' }, meta)).toBe(40);
        expect(RB.detectionRadius({ waypoint_type: 'precise' }, meta)).toBe(60);
        expect(RB.detectionRadius({ waypoint_type: 'precise' }, {})).toBe(30); // the type's own default
        expect(RB.detectionRadius({}, {})).toBe(RB.CONST.REACH_DEFAULT_M);
        expect(RB.detectionRadius(null, null)).toBe(RB.CONST.REACH_DEFAULT_M);
        expect(RB.CONST.REACH_DEFAULT_M).toBe(30); // system default when the roadbook defines nothing (#439 · #753)
    });
    it('reachRadius = detection radius, capped to half the smaller neighbour gap, floored above GPS noise (#87)', () => {
        const wide = { validation_radius: 40, partial_distance: 1000 };
        // gaps large on both sides → the note's own radius wins
        expect(RB.reachRadius(wide, { partial_distance: 1000 }, {})).toBe(40);
        // last note (no next) → forward gap is infinite, radius still wins
        expect(RB.reachRadius(wide, null, {})).toBe(40);
        // a tight previous gap caps the reach to half that gap
        expect(RB.reachRadius({ validation_radius: 40, partial_distance: 50 }, { partial_distance: 1000 }, {})).toBe(25);
        // a tight forward gap caps it too (uses the smaller of the two)
        expect(RB.reachRadius({ validation_radius: 40, partial_distance: 1000 }, { partial_distance: 30 }, {})).toBe(RB.CONST.REACH_MIN_M); // 15 → floored to 18
        // a very tight cluster is floored, never demanding sub-GPS precision
        expect(RB.reachRadius({ validation_radius: 40, partial_distance: 20 }, { partial_distance: 20 }, {})).toBe(RB.CONST.REACH_MIN_M);
        // no per-note radius → falls back through detectionRadius (roadbook default here), then capped
        expect(RB.reachRadius({ partial_distance: 1000 }, { partial_distance: 1000 }, { default_validation_radius: 50 })).toBe(50);
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
    it('emits <openrally:wptType> when a note has waypoint_type', () => {
        const track = [{ lat: 45, lon: 9 }, { lat: 45, lon: 9.001 }, { lat: 45.001, lon: 9.002 }];
        const rb = RB.buildRoadbook({ name: 'src', trkpts: track, wpts: [] });
        rb.notes[0].waypoint_type = 'masked';
        const xml = RB.openRallyDocument(rb, { tulips: [] });
        expect(xml).toContain('<openrally:wptType>WPM</openrally:wptType>');
        expect(xml.split('<openrally:wptType>').length - 1).toBe(1);
    });
    it('does not emit wptType for notes without waypoint_type', () => {
        const track = [{ lat: 45, lon: 9 }, { lat: 45.001, lon: 9.001 }];
        const rb = RB.buildRoadbook({ name: 'src', trkpts: track, wpts: [] });
        const xml = RB.openRallyDocument(rb, { tulips: [] });
        expect(xml).not.toContain('wptType');
    });
    it('the .rdbk writes a waypoint type by its own name; OpenRally codes stay in the OpenRally file', () => {
        const rb = RB.buildRoadbook({ name: 'src', trkpts: [{ lat: 45, lon: 9 }, { lat: 45.001, lon: 9.001 }], wpts: [] });
        rb.notes[0].waypoint_type = 'masked';
        expect(RB.writeRoadbook(rb).notes[0].waypoint_type).toBe('masked');
        const doc = RB.writeRoadbook(rb);
        doc.notes[0].waypoint_type = 'WPM';
        expect(RB.validateRoadbook(doc).errors.map((e) => e.path)).toEqual(['notes[0].waypoint_type']);
    });
});

describe('NoteCanvas.toSVG (vignette render)', () => {
    const baseNote = { num: 2, bearing_in: 0, bearing_out: 0, road_type_in: 2, road_type: 2, symbols: [], junctions: [] };
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
            symbols: [{ name: 'S03_30km.svg', position: [0, 0], size: 64 }], // centre-placed icon (e.g. auto speed symbol)
            junctions: [{ from: [0, 0], to: [45, 25], road_type: 2 }],
        }, (ic) => ic.name);
        const circle = s.indexOf('<circle cx="115" cy="81" r="6"');
        expect(circle).toBeGreaterThan(s.lastIndexOf('marker-end="url(#vig-tick)"')); // after every junction
        expect(circle).toBeGreaterThan(s.lastIndexOf('<image'));                      // after every icon
    });
    it('renders a shown imported tulip full-box and nothing else (no trunk/validation circle)', () => {
        const s = NoteCanvas.toSVG({ symbols: [], imported_tulip: { image: 'data:image/svg+xml,OR', shown: true } });
        expect(s).toContain('width="230" height="162" href="data:image/svg+xml,OR"');
        expect(s).not.toContain('#vig-arr');
        expect(s).not.toContain('r="6"');
    });
    it('resolves placed-icon hrefs through resolveIcon', () => {
        const s = NoteCanvas.toSVG({ ...baseNote, symbols: [{ name: 'a.png', position: [0, 0], size: 32 }] }, (ic) => 'RES:' + ic.name);
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
        const placed = NoteCanvas.toSVG({ ...baseNote, symbols: [{ name: evil, position: [0, 0], size: 32 }] }, (ic) => ic.name);
        const cover = NoteCanvas.toSVG({ symbols: [], imported_tulip: { image: evil, shown: true } });
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
            notes: [{ track_index: 0, road_type: 3 }, { track_index: 1, road_type: 3 }, { track_index: 3, road_type: 3 }],
        };
        RB.recomputeMetrics(rb);
        const removed = RB.deleteNote(rb, 1); // delete the middle note (sits on vertex idx 1)
        expect(removed).toBe(1);
        expect(rb.track.map((p) => p.lon)).toEqual([0, 2, 3]); // the lon=1 vertex is gone — route straightened
        expect(rb.notes.map((n) => n.track_index)).toEqual([0, 2]);    // the note that was at idx 3 shifted to 2
    });
    it('keeps the vertex (note-only removal) when the track would fall below 2 points', () => {
        const rb = {
            meta: {},
            track: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }],
            notes: [{ track_index: 0, road_type: 3 }, { track_index: 1, road_type: 3 }],
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
            notes: [{ track_index: 0, road_type: 3 }, { track_index: 2, road_type: 3 }],
        };
        RB.recomputeMetrics(rb);
        RB.deleteNote(rb, 1); // delete the note at idx 2 (the end)
        expect(rb.track.map((p) => p.lon)).toEqual([0, 1]); // lon=2 removed; earlier points untouched
        expect(rb.notes.map((n) => n.track_index)).toEqual([0]);
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
    // the existing waypoint_type round-trip test above — it exercises the namespace parsing + emitOr
    // passthrough path through openRallyDocument.
});

describe('isEndNote — which note is the roadbook\'s finish (#447)', () => {
    const nav = (num) => ({ num, lat: 0, lon: 0 });

    it('is the last note, and only it', () => {
        const notes = [nav(1), nav(2), nav(3)];
        expect(notes.map((n, i) => RB.isEndNote(notes, i))).toEqual([false, false, true]);
    });

    it('says no out of range', () => {
        expect(RB.isEndNote([nav(1)], 5)).toBe(false);
        expect(RB.isEndNote([], 0)).toBe(false);
        expect(RB.isEndNote(null, 0)).toBe(false);
    });

    it('a single note is both start and end', () => {
        expect(RB.isEndNote([nav(1)], 0)).toBe(true);
    });
});

describe('isFirstNote — which note the roadbook starts from (#472)', () => {
    const nav = (num) => ({ num, lat: 0, lon: 0 });

    it('is the first note, and only it', () => {
        const notes = [nav(1), nav(2), nav(3)];
        expect(notes.map((n, i) => RB.isFirstNote(notes, i))).toEqual([true, false, false]);
    });

    it('says no out of range', () => {
        expect(RB.isFirstNote([nav(1)], 5)).toBe(false);
        expect(RB.isFirstNote([], 0)).toBe(false);
        expect(RB.isFirstNote(null, 0)).toBe(false);
    });

    it('a single note is both start and end', () => {
        expect(RB.isFirstNote([nav(1)], 0)).toBe(true);
    });
});

describe('the end note\'s tulip has no exit road (#447)', () => {
    const note = (num) => ({ num, road_type_in: 2, road_type: 2, bearing_in: 0, bearing_out: 90, symbols: [] });
    const roads = (svg) => svg.match(/<path d="[^"]*" fill="none" stroke="#[0-9a-f]{6}"/gi) || []; // the coloured roads, not the markers or the white motorway centre

    it('a middle note draws the exit segment with its arrow', () => {
        const svg = NoteCanvas.toSVG(note(2), (ic) => ic.name, { isEnd: false, isFirst: false });
        expect(roads(svg)).toHaveLength(2);          // incoming + exit
        expect(svg).toContain('marker-end="url(#vig-arr)"');
    });

    it('the end note draws only the incoming road — no exit, no arrow', () => {
        // past the finish there is nothing to follow, so the arrow pointed at nothing; the
        // validation dot at the centre is the end of the road
        const svg = NoteCanvas.toSVG(note(9), (ic) => ic.name, { isEnd: true });
        expect(roads(svg)).toHaveLength(1);
        expect(svg).not.toContain('marker-end="url(#vig-arr)"');
        expect(svg).toContain('<circle');                       // the centre dot stays
    });

    it('the first note draws only the exit road — no incoming line from nowhere', () => {
        // nothing comes before the start, so a line from the bottom edge pointed from nowhere;
        // the validation dot at the centre is all that stays
        const svg = NoteCanvas.toSVG(note(1), (ic) => ic.name, { isFirst: true });
        expect(roads(svg)).toHaveLength(1);
        expect(svg).toContain('marker-end="url(#vig-arr)"');    // the exit keeps its arrow
        expect(svg).toContain('<circle');                       // the centre dot stays
    });
});

describe('bearings survive a duplicate track vertex (#452)', () => {
    // a straight line north, then a right-angle turn west — with a DUPLICATE vertex at the corner
    const north = (m) => ({ lat: m / M_PER_DEG, lon: 0 });
    const west = (m) => ({ lat: 100 / M_PER_DEG, lon: -m / M_PER_DEG });
    const track = [north(0), north(50), north(100), north(100), west(50), west(100)]; // [2] === [3]

    it('takes the first neighbour that is actually somewhere else', () => {
        // the note sits on the corner: its exit is the leg to the WEST (270°), but the vertex
        // straight after it is a duplicate, and bearingDeg(p, p) is 0 — which is how a left turn
        // came out drawn as a right one
        const b = RB.deriveBearings(track, 2);
        expect(b.bIn).toBeCloseTo(0, 0);     // came from the south heading north
        expect(b.bOut).toBeCloseTo(270, 0);  // …and leaves to the west
        const turn = ((b.bOut - b.bIn) % 360 + 360) % 360;
        expect(turn).toBeCloseTo(270, 0);    // a LEFT turn; it used to compute 0 → straight on
    });

    it('reads through a duplicate on the incoming side too', () => {
        const b = RB.deriveBearings(track, 3); // the second copy of the corner
        expect(b.bIn).toBeCloseTo(0, 0);
        expect(b.bOut).toBeCloseTo(270, 0);
    });

    it('keeps the end fallbacks: the first note borrows its exit, the last its entry', () => {
        expect(RB.deriveBearings(track, 0).bIn).toBeCloseTo(RB.deriveBearings(track, 0).bOut, 3);
        const last = RB.deriveBearings(track, track.length - 1);
        expect(last.bOut).toBeCloseTo(last.bIn, 3);
    });

    it('does not throw on a track that is all one point', () => {
        expect(RB.deriveBearings([north(0), north(0)], 0)).toEqual({ bIn: 0, bOut: 0 });
    });
});

describe('the .rdbk 1 document: authored data only, one shape', () => {
    const trkpts = [{ lat: 45, lon: 9, ele: 300, t: 1000 }, { lat: 45, lon: 9.001, ele: 305, t: 2000 }, { lat: 45.001, lon: 9.002, t: 3000 }];
    const built = () => {
        const rb = RB.buildRoadbook({ name: 'Loop', trkpts, wpts: [] });
        rb.symbols['I01_arrivo.png'] = 'data:image/png;base64,AA';
        rb.notes[1].symbols.push({ name: 'I01_arrivo.png', position: [0, 0], size: 40, angle: 0, mirrored: false });
        return rb;
    };
    it('writes the version, the authored fields and nothing that can be computed', () => {
        const doc = RB.writeRoadbook(built());
        expect(doc.rdbk_version).toBe(1);
        expect(Object.keys(doc)).toEqual(['rdbk_version', 'meta', 'track', 'notes', 'symbols']);
        expect(doc.meta).toEqual({ title: 'Loop', default_validation_radius: 30, generator: 'RDBK.app' });
        expect(doc.track[0]).toEqual({ lat: 45, lon: 9, elevation: 300, time_ms: 1000 });
        expect(doc.track[2]).toEqual({ lat: 45.001, lon: 9.002, time_ms: 3000 });
        // the start note says nothing but where it is: text '', the track road, no CAP — all defaults
        expect(doc.notes[0]).toEqual({ track_index: 0 });
        expect(doc.notes[1]).toEqual({ track_index: 2, symbols: [{ name: 'I01_arrivo.png', position: [0, 0], size: 40 }] });
        for (const k of ['num', 'lat', 'lon', 'distance', 'partial_distance', 'bearing_in', 'bearing_out', 'road_type_in', 'cap_distance']) expect(doc.notes[1]).not.toHaveProperty(k);
        expect(doc.meta).not.toHaveProperty('total_distance');
        expect(doc.meta).not.toHaveProperty('note_count');
        expect(RB.validateRoadbook(doc)).toEqual({ valid: true, errors: [], warnings: [] });
    });
    it('reading derives every computed value, and writing it again gives back the same file', () => {
        const doc = RB.writeRoadbook(built());
        const rb = RB.readRoadbook(doc);
        expect(rb.notes.map((n) => n.num)).toEqual([1, 2]);
        expect(rb.notes[1].distance).toBe(rb.meta.total_distance);
        expect(rb.notes[1].lat).toBe(45.001);
        expect(rb.notes[1].road_type_in).toBe(2);
        expect(rb.meta.note_count).toBe(2);
        expect(RB.writeRoadbook(rb)).toEqual(doc);
    });
    it('a CAP is authored: the heading is stored, its distance derived', () => {
        const rb = built();
        rb.notes[0].cap = 45; rb.notes[0].cap_type = 'average';
        const doc = RB.writeRoadbook(rb);
        expect(doc.notes[0]).toEqual({ track_index: 0, cap: 45, cap_type: 'average' });
        const back = RB.readRoadbook(doc);
        expect(back.notes[0].cap).toBe(45);
        expect(back.notes[0].cap_distance).toBe(Math.round(RB.geo.haversineM(back.notes[0], back.notes[1])));
    });
    it('keeps the whole symbol library — a custom symbol has no other copy (#454)', () => {
        const rb = built();
        rb.symbols['mine.png'] = 'data:image/png;base64,BB';
        expect(Object.keys(RB.writeRoadbook(rb).symbols)).toEqual(['I01_arrivo.png', 'mine.png']);
    });
    it('carries the compatibility blocks untouched, at the root and on a note', () => {
        const rb = built();
        rb.compatibility = { openrally: { units: 'metric' } };
        rb.notes[0].compatibility = { openrally: [{ tag: 'speed', attrs: {}, text: '50' }] };
        const doc = RB.writeRoadbook(rb);
        expect(doc.compatibility).toEqual({ openrally: { units: 'metric' } });
        expect(RB.readRoadbook(doc).notes[0].compatibility.openrally[0].text).toBe('50');
    });
    it('refuses what is not a .rdbk 1, saying where and why', () => {
        const doc = RB.writeRoadbook(built());
        const bad = JSON.parse(JSON.stringify(doc));
        delete bad.rdbk_version;
        bad.notes[1].track_index = 0;
        bad.notes[1].symbols[0].name = 'missing.png';
        bad.notes[1].road_type = 7;
        const report = RB.validateRoadbook(bad);
        expect(report.valid).toBe(false);
        expect(report.errors.map((e) => e.path)).toEqual(['rdbk_version', 'notes[1].track_index', 'notes[1].road_type', 'notes[1].symbols[0].name']);
        let thrown = null;
        try { RB.readRoadbook(bad); } catch (e) { thrown = e; }
        expect(thrown.report.errors.length).toBe(4);
    });
    it('the symbol library is a map, never a list: PHP turns an empty {} into [] (#523)', () => {
        const doc = RB.writeRoadbook(RB.buildRoadbook({ name: 'x', trkpts, wpts: [] }));
        expect(doc).not.toHaveProperty('symbols'); // nothing to write, so nothing a round trip could turn into []
        expect(RB.validateRoadbook({ ...doc, symbols: [] }).errors[0]).toEqual({ path: 'symbols', message: 'Must be an object.' });
    });
    it('defaults written out are allowed, and the validator says to leave them out', () => {
        const doc = RB.writeRoadbook(built());
        doc.notes[0].text = ''; doc.notes[0].road_type = 2;
        const r = RB.validateRoadbook(doc);
        expect(r.valid).toBe(true);
        expect(r.warnings.map((w) => w.path)).toEqual(['notes[0].text', 'notes[0].road_type']);
    });
    it('an unknown key is ignored by readers, and reported', () => {
        const doc = RB.writeRoadbook(built());
        doc.meta.category = 'x';
        expect(RB.validateRoadbook(doc).warnings).toEqual([{ path: 'meta.category', message: 'Unknown key: readers ignore it.' }]);
    });
});

describe('RB.distanceChars (#730)', () => {
    it('is the length of the longest total as km.dd, never under 4', () => {
        expect(RB.distanceChars([{ distance: 0 }, { distance: 9870 }])).toBe(4);
        expect(RB.distanceChars([{ distance: 1200 }, { distance: 123450 }])).toBe(6);
        expect(RB.distanceChars([])).toBe(4);
    });
});

describe('routeAhead: where the driver is along the route (#847)', () => {
    // a straight east-west road with notes at its 2nd and 4th vertex, ~111 m between vertices
    const track = [0, 1, 2, 3, 4, 5].map((k) => ({ lat: 45, lon: 9 + k * 0.001414 }));
    const rb = RB.recomputeMetrics({ meta: {}, track, notes: [RB.blankNote(1, 2), RB.blankNote(3, 2)] });
    const cum = RB.cumulativeM(track);

    it('measures what is left to the note along the track, in the notes’ own metres', () => {
        const half = { lat: 45.00005, lon: 9 + 2.5 * 0.001414 }; // halfway between vertex 2 and 3, a bit off the road
        const a = RB.routeAhead(rb, cum, 1, half);
        expect(Math.round(rb.notes[1].distance - a.atM)).toBe(Math.round((cum[3] - cum[2]) / 2));
        expect(a.offRouteM).toBeGreaterThan(4);
    });
    it('reads past the note once driven beyond it', () => {
        const a = RB.routeAhead(rb, cum, 1, { lat: 45, lon: 9 + 3.5 * 0.001414 });
        expect(a.atM).toBeGreaterThan(rb.notes[1].distance);
    });
    it('never snaps onto a stretch of the route outside the notes around it', () => {
        const a = RB.routeAhead(rb, cum, 0, { lat: 45, lon: 9 + 4.5 * 0.001414 }); // far past note 2
        expect(a.atM).toBeLessThanOrEqual(cum[3] + 1);                          // clamped to the window
    });
    it('on an out-and-back, the odometer picks the pass the driver is on', () => {
        // out east along lat 45 to a note at the spur's end, back west 3 m further north, then on north
        const out = [0, 1, 2, 3, 4].map((k) => ({ lat: 45, lon: 9 + k * 0.001414 }));
        const back = [3, 2, 1, 0].map((k) => ({ lat: 45.00003, lon: 9 + k * 0.001414 }));
        const spur = out.concat(back, [{ lat: 45.002, lon: 9 }]);
        const srb = RB.recomputeMetrics({ meta: {}, track: spur, notes: [RB.blankNote(0, 2), RB.blankNote(4, 2), RB.blankNote(spur.length - 1, 2)] });
        const scum = RB.cumulativeM(spur);
        const here = { lat: 45.00002, lon: 9 + 1.5 * 0.001414 }; // driving out, the fix a touch nearer the way back
        expect(RB.routeAhead(srb, scum, 1, here).atM).toBeGreaterThan(srb.notes[1].distance); // geometry alone: the wrong pass
        const a = RB.routeAhead(srb, scum, 1, here, 160);                                    // the odometer says ~1.5 legs out
        expect(Math.round(a.atM)).toBe(Math.round(scum[1] + (scum[2] - scum[1]) / 2));
        // the neighbouring segments of the same pass never override the nearest point
        expect(RB.routeAhead(rb, cum, 1, { lat: 45.00005, lon: 9 + 2.1 * 0.001414 }, 0).atM).toBeGreaterThan(cum[2]);
    });
    it('leftToNote: along the route, never under the straight line', () => {
        const half = { lat: 45, lon: 9 + 2.5 * 0.001414 };
        expect(Math.round(RB.leftToNote(rb, cum, 1, half))).toBe(Math.round(rb.notes[1].distance - (cum[2] + (cum[3] - cum[2]) / 2)));
        // on the way to the start, 2 km short of it: the route has nothing nearer than its first point
        const carPark = { lat: 45, lon: 9 - 0.026 };
        expect(RB.leftToNote(rb, cum, 0, carPark)).toBeCloseTo(RB.geo.haversineM(carPark, rb.notes[0]), 3);
        expect(RB.leftToNote(rb, cum, 0, carPark)).toBeGreaterThan(1900);
        // no route: the straight line
        expect(RB.leftToNote({ track: [], notes: rb.notes }, [0], 1, half)).toBeCloseTo(RB.geo.haversineM(half, rb.notes[1]), 3);
    });
    it('has nothing to say without a route or a fix', () => {
        expect(RB.routeAhead({ track: [], notes: rb.notes }, [], 0, { lat: 45, lon: 9 })).toBeNull();
        expect(RB.routeAhead(rb, cum, 0, null)).toBeNull();
    });
});

describe('road types', () => {
    it('paints the bike lane violet', () => {
        expect(RB.ROAD_TYPES.find((r) => r.id === 5).color).toBe('#532b78');
    });
});

describe('gpsHealth — the one GPS scale (#901)', () => {
    it('reads good · fair · weak · none', () => {
        expect(RB.gpsHealth(5)).toBe('good');
        expect(RB.gpsHealth(RB.CONST.GPS_GOOD_M)).toBe('good');
        expect(RB.gpsHealth(20)).toBe('fair');
        expect(RB.gpsHealth(RB.CONST.FIX_ACC_MAX_M)).toBe('fair');
        expect(RB.gpsHealth(80)).toBe('weak');
        expect(RB.gpsHealth(null)).toBe('none');
    });
});
