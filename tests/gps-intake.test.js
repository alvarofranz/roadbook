import { describe, it, expect } from 'vitest';
import RB from '../public/assets/js/roadbook-core.js';

/* Live GPS intake — the two gates that stand between a phone's position stream and what the
   Reader/Tripmaster tell the driver. Both were reported from the field on an Oppo A54S:
   57 km on the odometer after 3 km of driving (#383) and auto-validation that never fired even
   standing on the waypoint (#384). The stream is hostile by nature — cell/wifi fixes hundreds of
   metres off, a cached position from another town, and a wander as wide as the error circle while
   parked — so every rule below is pinned against a scenario that actually happened. */

const M_PER_DEG = (2 * Math.PI * 6371000) / 360; // ~111195 m per degree on the equator
const deg = (m) => m / M_PER_DEG;                // metres → degrees of latitude/equatorial longitude
const fix = (lat, lon, acc, t) => ({ lat, lon, acc, t });

// Feed a whole stream through the gate the way RBGpsMeter does, and report what an odometer
// driven by it would show.
function run(fixes, anchor = null) {
    let total = 0; const verdicts = [];
    for (const f of fixes) {
        const step = RB.odometerStep(anchor, f);
        total += step.disp; anchor = step.anchor; verdicts.push(step.verdict);
    }
    return { total, anchor, verdicts };
}

describe('odometerStep — what may count as distance travelled (#383)', () => {
    it('the first fix only anchors: there is nothing to measure from yet', () => {
        const step = RB.odometerStep(null, fix(0, 0, 8, 1000));
        expect(step.verdict).toBe('first');
        expect(step.disp).toBe(0);
        expect(step.anchor).toEqual({ lat: 0, lon: 0, t: 1000 });
    });

    it('a junk fix is dropped AND leaves the anchor alone, so no ground is lost', () => {
        // 500 m off with 800 m accuracy: a cell fix. Then a good fix 100 m from the ORIGINAL
        // anchor — the 100 m actually driven is what gets counted, not the 500 m detour.
        const { total, verdicts } = run([
            fix(0, 0, 6, 0),
            fix(0, deg(500), 800, 1000),
            fix(0, deg(100), 6, 2000),
        ]);
        expect(verdicts).toEqual(['first', 'junk', 'ok']);
        expect(total).toBeCloseTo(100, 0);
    });

    it('jitter while standing still never accumulates — the 57 km bug', () => {
        // Parked at a waypoint for a minute with a mediocre fix: the position wanders 20 m each
        // second inside its own 25 m error circle. The old flat 5 m floor counted every wobble.
        const fixes = [fix(0, 0, 25, 0)];
        for (let i = 1; i <= 60; i++) fixes.push(fix(deg(i % 2 ? 20 : -20), 0, 25, i * 1000));
        expect(run(fixes).total).toBe(0);
    });

    it('a step beyond the fix\'s own uncertainty is real movement and counts', () => {
        const { total, verdicts } = run([fix(0, 0, 8, 0), fix(0, deg(30), 8, 1000)]);
        expect(verdicts[1]).toBe('ok');
        expect(total).toBeCloseTo(30, 0);
    });

    it('slow movement is deferred, not lost: the anchor holds until the floor is cleared', () => {
        // Walking pace with a good fix: 3 m per second, under the 5 m floor every time, but the
        // anchor does not follow the noise — so the metres show up as soon as they add up.
        const fixes = [fix(0, 0, 4, 0)];
        for (let i = 1; i <= 4; i++) fixes.push(fix(0, deg(3 * i), 4, i * 1000));
        const { total, verdicts } = run(fixes);
        expect(verdicts).toEqual(['first', 'noise', 'ok', 'noise', 'ok']); // 3 m · 6 m · 3 m · 6 m
        expect(total).toBeCloseTo(12, 0);
    });

    it('an impossible jump adds nothing but DOES re-anchor, so one bogus fix cannot freeze the run', () => {
        // A cached position from another town, then the real ones. If the anchor stayed on the
        // bogus point every later fix would read as a teleport and the odometer would never move.
        const { total, verdicts } = run([
            fix(0, 0, 10, 0),
            fix(0, deg(50000), 10, 30000), // 50 km in 30 s
            fix(0, deg(50100), 10, 40000), // …then 100 m driven from there
        ]);
        expect(verdicts).toEqual(['first', 'teleport', 'ok']);
        expect(total).toBeCloseTo(100, 0);
    });

    it('a big displacement after a long gap is plausible and counts (tunnel, locked screen)', () => {
        const { total, verdicts } = run([fix(0, 0, 10, 0), fix(0, deg(60000), 10, 3600000)]); // 60 km in 1 h
        expect(verdicts[1]).toBe('ok');
        expect(total).toBeCloseTo(60000, 0);
    });

    it('an unknown accuracy still gets the plain noise floor', () => {
        expect(run([fix(0, 0, null, 0), fix(0, deg(3), null, 1000)]).verdicts[1]).toBe('noise');
        expect(run([fix(0, 0, null, 0), fix(0, deg(9), null, 1000)]).verdicts[1]).toBe('ok');
    });

    it('a mixed real-world stream reads the distance driven, not the sum of the glitches', () => {
        // 1 km driven at 10 m/s with good fixes, with a junk fix 5 km away every fifth second.
        const fixes = [];
        for (let i = 0; i <= 100; i++) {
            fixes.push(fix(0, deg(i * 10), 7, i * 1000));
            if (i % 5 === 0) fixes.push(fix(0, deg(i * 10 + 5000), 900, i * 1000 + 500));
        }
        expect(run(fixes).total).toBeCloseTo(1000, -1); // ±10 m, and nowhere near the 100 km of junk
    });
});

describe('noteReached — the auto-validation gate (#384)', () => {
    const note = { lat: 0, lon: 0 };
    const gate = RB.CONST.REACH_MIN_M; // 18 m: the tightest gate the Reader ever uses

    it('a fix inside the radius reaches the note', () => {
        expect(RB.noteReached(note, null, { lat: 0, lon: deg(10) }, gate)).toBe(true);
        expect(RB.noteReached(note, null, { lat: 0, lon: deg(40) }, gate)).toBe(false);
    });

    it('a waypoint driven straight over between two fixes is reached', () => {
        // 90 km/h with ~1 Hz fixes: 25 m before the note, 25 m past it. NEITHER endpoint is
        // inside the 18 m gate — the point test the Reader used to do missed the note entirely.
        const before = { lat: 0, lon: -deg(25) }, after = { lat: 0, lon: deg(25) };
        expect(RB.noteReached(note, null, before, gate)).toBe(false);
        expect(RB.noteReached(note, null, after, gate)).toBe(false);
        expect(RB.noteReached(note, before, after, gate)).toBe(true);
    });

    it('a segment that passes wide of the note does not reach it', () => {
        const from = { lat: deg(40), lon: -deg(25) }, here = { lat: deg(40), lon: deg(25) };
        expect(RB.noteReached(note, from, here, gate)).toBe(false);
    });

    it('with no path to speak of it falls back to the single point', () => {
        expect(RB.noteReached(note, null, { lat: 0, lon: deg(5) }, gate)).toBe(true);
        expect(RB.noteReached(note, { lat: 0, lon: deg(5) }, { lat: 0, lon: deg(5) }, gate)).toBe(true);
    });

    it('never reaches a note with no coordinates (a comment row) or without a position', () => {
        expect(RB.noteReached({ note_kind: 'comment', text: 'careful' }, null, { lat: 0, lon: 0 }, gate)).toBe(false);
        expect(RB.noteReached(note, null, null, gate)).toBe(false);
        expect(RB.noteReached(null, null, { lat: 0, lon: 0 }, gate)).toBe(false);
    });
});
