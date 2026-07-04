import { describe, it, expect } from 'vitest';
import RB from '../public/assets/js/roadbook-core.js';

/* Competition scoring (#169): the Reader accrues penalties → META (49-char QR) → the
 * Ranking scores it. Both sides now share the SAME core primitives, and this suite runs
 * one fixture through the whole producer → consumer chain to keep them in agreement. */

const C = RB.CONST;
const east = (m) => RB.geo.destPoint(0, 0, 90, m); // a point m metres east of the origin

describe('META time codecs', () => {
    it('hhmmss / ddmmyy encode a Date as fixed-width digits ("000000" for null)', () => {
        const d = new Date(2026, 5, 15, 9, 5, 7);
        expect(RB.hhmmss(d)).toBe('090507');
        expect(RB.ddmmyy(d)).toBe('150626');
        expect(RB.hhmmss(null)).toBe('000000');
        expect(RB.ddmmyy(null)).toBe('000000');
    });
    it('parseHms decodes to seconds and round-trips hhmmss', () => {
        expect(RB.parseHms('090507')).toBe(9 * 3600 + 5 * 60 + 7);
        expect(RB.parseHms('000000')).toBe(0);
        expect(RB.parseHms('235959')).toBe(86399);
        const d = new Date(2026, 0, 1, 23, 59, 59);
        expect(RB.parseHms(RB.hhmmss(d))).toBe(86399);
    });
});

describe('scoredNoteSet / isScoredIdx', () => {
    const N = (icons) => ({ lat: 0, lon: 0, icons });
    it('no START marker → null → every note is scored', () => {
        const set = RB.scoredNoteSet([N(), N(), N()]);
        expect(set).toBeNull();
        expect(RB.isScoredIdx(set, 0)).toBe(true);
        expect(RB.isScoredIdx(set, 2)).toBe(true);
    });
    it('START→FINISH bounds the scored section, both inclusive', () => {
        const set = RB.scoredNoteSet([N(), N([{ name: 'I02_partenza.png' }]), N(), N([{ name: 'I01_arrivo.png' }]), N()]);
        expect([...set].sort()).toEqual([1, 2, 3]);
        expect(RB.isScoredIdx(set, 0)).toBe(false);
        expect(RB.isScoredIdx(set, 4)).toBe(false);
    });
    it('supports several stages separated by liaison notes', () => {
        const set = RB.scoredNoteSet([
            N([{ name: 'I02_partenza.png' }]), N([{ name: 'I01_arrivo.png' }]),
            N(), // liaison
            N([{ name: 'I02_partenza.png' }]), N([{ name: 'I01_arrivo.png' }]),
        ]);
        expect([...set].sort()).toEqual([0, 1, 3, 4]);
        expect(set.has(2)).toBe(false);
    });
});

describe('validationPenalties (1 pt/m)', () => {
    const notes = [
        { lat: 0, lon: 0, cap: 90, cap_distance: 1000 }, // CAP target = 1000 m east
        { ...east(1000) },
    ];
    it('is zero without a GPS fix (manual run)', () => {
        expect(RB.validationPenalties(notes, 1, null)).toEqual({ acc: 0, cap: 0 });
    });
    it('never charges accuracy on the first note', () => {
        expect(RB.validationPenalties(notes, 0, east(50)).acc).toBe(0);
    });
    it('accuracy = distance from the fix to the note', () => {
        expect(RB.validationPenalties(notes, 1, east(900)).acc).toBeCloseTo(100, 0);
    });
    it('CAP = distance from the fix to the previous note\'s CAP target point', () => {
        expect(RB.validationPenalties(notes, 1, east(1000)).cap).toBeCloseTo(0, 0);
        expect(RB.validationPenalties(notes, 1, east(900)).cap).toBeCloseTo(100, 0);
    });
});

describe('speedPenalty / skipPenalty', () => {
    it('speed: P_SPEED_PER_KMH per full km/h over the limit, zero at/under or with no limit', () => {
        expect(RB.speedPenalty(49.9, 50)).toBe(0);
        expect(RB.speedPenalty(50, 50)).toBe(0);
        expect(RB.speedPenalty(55.7, 50)).toBe(5 * C.P_SPEED_PER_KMH);
        expect(RB.speedPenalty(80, 0)).toBe(0);
        expect(RB.speedPenalty(80, null)).toBe(0);
    });
    it('skip: P_SKIP per scored note passed over; liaison notes are free', () => {
        expect(RB.skipPenalty(null, 0, 3)).toBe(3 * C.P_SKIP); // whole roadbook scored
        const set = new Set([1]);                              // only note 1 is scored
        expect(RB.skipPenalty(set, 0, 3)).toBe(C.P_SKIP);
        expect(RB.skipPenalty(set, 2, 3)).toBe(0);
        expect(RB.skipPenalty(null, 2, 2)).toBe(0);            // no jump, no penalty
    });
});

describe('rankEntry (the Ranking side)', () => {
    // 12.0 km at a 30 km/h target → expected 1440 s; start fixed at 10:00:00
    const m = (over) => ({ team: '007', start: '100000', end: '102400', accuracy: '0120', skip: '0450', extra: '0030', cap: '0055', speed: '0020', km: '00120', avg: '000', ...over });
    it('sums accuracy + skips + extra, keeps cap and speed, parses the team', () => {
        const r = RB.rankEntry(m(), 30);
        expect(r.team).toBe(7);
        expect(r.km).toBe(12);
        expect(r.accuracy).toBe(120 + 450 + 30);
        expect(r.cap).toBe(55);
        expect(r.speed).toBe(20);
    });
    it('regularity: on time → 0; late gets REG_GRACE_S of grace; early never does', () => {
        expect(RB.rankEntry(m(), 30).reg).toBe(0);                                     // exactly 1440 s
        expect(RB.rankEntry(m({ end: '102459' }), 30).reg).toBe(0);                    // +59 s → inside the grace
        expect(RB.rankEntry(m({ end: '102500' }), 30).reg).toBe(60 - C.REG_GRACE_S);   // +60 s → 1 pt
        expect(RB.rankEntry(m({ end: '102330' }), 30).reg).toBe(30);                   // −30 s → 30 pts
    });
    it('a run across midnight wraps (#40 groundwork)', () => {
        // 0.5 km at 30 km/h → expected 60 s; 23:59:30 → 00:00:30 = 60 s → reg 0
        const r = RB.rankEntry(m({ start: '235930', end: '000030', km: '00005' }), 30);
        expect(r.reg).toBe(0);
    });
    it('average falls back: organizer target → run\'s own avg → 30', () => {
        expect(RB.rankEntry(m({ end: '102500' }), 30).reg).toBe(1);       // target wins
        expect(RB.rankEntry(m({ end: '102500', avg: '300' }), 0).reg).toBe(1); // m.avg (30.0) when no target
        expect(RB.rankEntry(m({ end: '102500', avg: '000' }), 0).reg).toBe(1); // default 30
    });
    it('finalScore = accuracy + cap + speed + reg', () => {
        const r = RB.rankEntry(m(), 30);
        expect(r.finalScore).toBe(r.accuracy + r.cap + r.speed + r.reg);
    });
});

describe('producer → consumer: a scored run through META and back', () => {
    it('the Reader-side accruals survive buildMeta/parseMeta and rankEntry agrees', () => {
        // Stage: START at n0 → n1 (1 km east, CAP 90° 1000 m from n0) → FINISH at n2.
        const notes = [
            { lat: 0, lon: 0, cap: 90, cap_distance: 1000, icons: [{ name: 'I02_partenza.png' }] },
            { ...east(1000), icons: [] },
            { ...east(1500), icons: [{ name: 'I01_arrivo.png' }] },
        ];
        const scoredSet = RB.scoredNoteSet(notes);
        // Validate n1 from 50 m short: accuracy ≈ 50, CAP ≈ 50 (target is n1 itself here).
        const pen = { acc: 0, cap: 0, skip: 0, extra: 0, speed: 0 };
        const p = RB.validationPenalties(notes, 1, east(950));
        pen.acc += p.acc; pen.cap += p.cap;
        pen.skip += RB.skipPenalty(scoredSet, 2, 2);        // no jump
        pen.speed += RB.speedPenalty(63.7, 50);             // 13 km/h over → 130
        pen.extra += 20;                                    // overshoot-and-return accrued
        // Finish exactly on time for 1.5 km at 30 km/h (180 s).
        const start = new Date(2026, 0, 1, 10, 0, 0), end = new Date(2026, 0, 1, 10, 3, 0);
        const meta = RB.buildMeta({
            team: '12', date: RB.ddmmyy(end), start: RB.hhmmss(start), end: RB.hhmmss(end),
            accuracy: Math.round(pen.acc), skip: pen.skip, extra: Math.round(pen.extra),
            cap: Math.round(pen.cap), speed: pen.speed, km: 15, avg: 300,
        });
        expect(meta).toHaveLength(49);
        const r = RB.rankEntry(RB.parseMeta(meta), 30);
        expect(r.team).toBe(12);
        expect(r.km).toBe(1.5);
        expect(r.accuracy).toBe(Math.round(pen.acc) + pen.skip + Math.round(pen.extra));
        expect(r.cap).toBe(Math.round(pen.cap));
        expect(r.speed).toBe(130);
        expect(r.reg).toBe(0);
        expect(r.finalScore).toBe(r.accuracy + r.cap + r.speed + r.reg);
    });
});

describe('speedBand (Tripmaster alert bands)', () => {
    it('maps the speed to 0..3 vs the limit, null when no limit is set', () => {
        expect(RB.speedBand(40, 0)).toBeNull();
        expect(RB.speedBand(40, null)).toBeNull();
        expect(RB.speedBand(44.9, 50)).toBe(0); // well under
        expect(RB.speedBand(47, 50)).toBe(1);   // approaching
        expect(RB.speedBand(52, 50)).toBe(2);   // just over
        expect(RB.speedBand(55, 50)).toBe(3);   // far over
    });
});

describe('direct coverage for transitively-tested exports', () => {
    it('ROAD_TYPES: five surfaces, off-piste (4) is the dashed one', () => {
        expect(RB.ROAD_TYPES).toHaveLength(5);
        RB.ROAD_TYPES.forEach((rt, i) => { expect(rt.id).toBe(i); expect(rt.color).toMatch(/^#/); });
        expect(RB.ROAD_TYPES[4].dashed).toBe(true);
        expect(RB.ROAD_TYPES.filter((rt) => rt.dashed)).toHaveLength(1);
    });
    it('nearestIdx returns the closest track point', () => {
        const track = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0, lon: 0.002 }];
        expect(RB.nearestIdx(track, { lat: 0, lon: 0.00101 })).toBe(1);
        expect(RB.nearestIdx(track, { lat: 0, lon: 0.01 })).toBe(2);
        expect(RB.nearestIdx(track, { lat: 0, lon: -1 })).toBe(0);
    });
    it('normalizeRoadTypes chains each note\'s road_type_in from the previous road_type_out', () => {
        const rb = { notes: [{ road_type_out: 2 }, { road_type_out: 3 }, { road_type_out: 0 }] };
        RB.normalizeRoadTypes(rb);
        expect(rb.notes[0].road_type_in).toBe(2); // the first note continues its own surface
        expect(rb.notes[1].road_type_in).toBe(2);
        expect(rb.notes[2].road_type_in).toBe(3);
    });
});
