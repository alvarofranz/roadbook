import { describe, it, expect } from 'vitest';
import RB from '../public/assets/js/roadbook-core.js';

/* The Reader re-syncs to the note actually reached (#931): only when the active note is behind the
   rider AND the rider is following the track towards the next ones — never on a single fix, never
   across a closed circuit's start/finish, never on a road that merely crosses the route. */
const M_PER_DEG_LAT = 111195;
const ORIGIN = { lat: 45, lon: 9 };
const mPerDegLon = M_PER_DEG_LAT * Math.cos(ORIGIN.lat * Math.PI / 180);
// a point `east`/`north` metres from the origin
const at = (east, north = 0) => ({ lat: ORIGIN.lat + north / M_PER_DEG_LAT, lon: ORIGIN.lon + east / mPerDegLon });
// a track through the given corners (metres), sampled every 10 m
function trackThrough(corners) {
    const pts = [];
    for (let c = 0; c < corners.length - 1; c++) {
        const [a, b] = [corners[c], corners[c + 1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.round(len / 10);
        for (let s = 0; s < n; s++) pts.push(at(a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n));
    }
    const last = corners[corners.length - 1]; pts.push(at(last[0], last[1]));
    return pts;
}
function roadbook(corners, noteMs) {
    const track = trackThrough(corners), cum = RB.cumulativeM(track);
    const notes = noteMs.map((m, i) => {
        const idx = cum.findIndex((c) => c >= m - 0.5);
        return { num: i + 1, idx, lat: track[idx].lat, lon: track[idx].lon, distance: Math.round(cum[idx]) };
    });
    return { rb: { track, notes }, cum };
}
const radius = () => 30;
const fixes = (pts, acc = 5) => pts.map(([e, n]) => ({ ...at(e, n || 0), acc }));

describe('RB.routeResync (#931)', () => {
    const straight = roadbook([[0, 0], [2000, 0]], [200, 400, 600, 800, 1000, 1200]);

    it('skips to the next note once the active one is behind and the track is being followed', () => {
        const trail = fixes([[690], [720], [750], [780]]);
        expect(RB.routeResync(straight.rb, straight.cum, 1, trail, radius)).toBe(3); // 400 and 600 skipped, 800 ahead
    });

    it('does nothing while the rider is on the route heading to the active note', () => {
        expect(RB.routeResync(straight.rb, straight.cum, 1, fixes([[290], [320], [350], [380]]), radius)).toBe(-1);
    });

    it('needs several fixes that follow the route, never one', () => {
        expect(RB.routeResync(straight.rb, straight.cum, 1, fixes([[700], [730], [760]]), radius)).toBe(-1); // too few
        expect(RB.routeResync(straight.rb, straight.cum, 1, fixes([[700], [705], [710], [715]]), radius)).toBe(-1); // under 80 m followed
        expect(RB.routeResync(straight.rb, straight.cum, 1, fixes([[300], [320], [900], [340]]), radius)).toBe(-1); // one spiky fix far ahead
    });

    it('ignores a road that only crosses the route', () => {
        expect(RB.routeResync(straight.rb, straight.cum, 1, fixes([[800, -90], [800, -30], [800, 30], [800, 90]]), radius)).toBe(-1);
    });

    it('re-syncs after a detour, once back on the route and following it', () => {
        expect(RB.routeResync(straight.rb, straight.cum, 1, fixes([[1050, 400], [1100, 200], [1110], [1140]]), radius)).toBe(-1); // still coming back
        expect(RB.routeResync(straight.rb, straight.cum, 1, fixes([[1100], [1130], [1160], [1190]]), radius)).toBe(5); // next ahead: 1200
    });

    it('never jumps to the far side of a closed circuit', () => {
        // a 500 m square: start and finish at the same corner, the last note right beside the start
        const loop = roadbook([[0, 0], [500, 0], [500, 500], [0, 500], [0, 0]], [100, 500, 1000, 1500, 1950]);
        // leaving the start, on the way to note 2: nothing to re-sync — and never to the finish note
        expect(RB.routeResync(loop.rb, loop.cum, 1, fixes([[10], [40], [70], [100]]), radius)).toBe(-1);
        // note 2 missed, following the second side: note 3 is next
        expect(RB.routeResync(loop.rb, loop.cum, 1, fixes([[500, 200], [500, 230], [500, 260], [500, 290]]), radius)).toBe(2);
    });

    it('tells an out-and-back road’s two passes apart by the direction of travel', () => {
        const outBack = roadbook([[0, 0], [1000, 0], [0, 0]], [300, 700, 1300, 1700]);
        // driving back west past the 650…560 m marks is the RETURN pass (1350…1440 on the route)
        expect(RB.routeResync(outBack.rb, outBack.cum, 1, fixes([[650], [620], [590], [560]]), radius)).toBe(3);
        // driving east over the same stretch is the outbound pass, still heading to note 2
        expect(RB.routeResync(outBack.rb, outBack.cum, 1, fixes([[560], [590], [620], [650]]), radius)).toBe(-1);
    });

    it('never finishes the run: past the last note it changes nothing', () => {
        expect(RB.routeResync(straight.rb, straight.cum, 1, fixes([[1800], [1830], [1860], [1890]]), radius)).toBe(-1);
    });
});
