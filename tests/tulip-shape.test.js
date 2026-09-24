import { describe, it, expect } from 'vitest';
import RB from '../public/assets/js/roadbook-core.js';
import NoteCanvas from '../public/assets/js/note-canvas.js';
globalThis.RB = RB;
globalThis.RBesc = (s) => String(s);

/* The tulip's exit follows the real shape of the road just past the note (#945): ~40 m of track,
   simplified, rotated so the arrival points up and scaled to the vignette, drawn only when the road
   really bends. The entry is always the classic straight one; the shape is never stored. */
const M_PER_DEG_LAT = 111195, LAT0 = 45;
const mPerDegLon = M_PER_DEG_LAT * Math.cos(LAT0 * Math.PI / 180);
const at = (east, north) => ({ lat: LAT0 + north / M_PER_DEG_LAT, lon: 9 + east / mPerDegLon });
// a track through the given points (metres east/north), densified every `step` metres
function track(points, step = 5) {
    const out = [];
    for (let k = 0; k < points.length - 1; k++) {
        const [a, b] = [points[k], points[k + 1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / step));
        for (let s = 0; s < n; s++) out.push(at(a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n));
    }
    out.push(at(...points[points.length - 1]));
    return out;
}
// a roadbook with notes on the given track indices, metrics as the Editor computes them
function roadbook(trk, idxs) {
    const rb = { meta: { title: 't' }, track: trk, notes: idxs.map((idx) => ({ idx, icons: [], junctions: null, road_type_in: 3, road_type_out: 3 })) };
    RB.recomputeMetrics(rb);
    return rb;
}
const idxNear = (trk, e, n) => { const p = at(e, n); let best = 0, bd = Infinity; trk.forEach((q, i) => { const d = Math.hypot(q.lat - p.lat, q.lon - p.lon); if (d < bd) { bd = d; best = i; } }); return best; };
const pathLen = (line) => line.reduce((s, p, i) => s + (i ? Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1]) : 0), 0);
const inBox = (line) => line.every(([x, y]) => x >= 0 && x <= 230 && y >= 0 && y <= 162);

describe('RB.tulipShape (#945)', () => {
    it('a straight track gives no shape: the classic straight tulip', () => {
        const trk = track([[0, -300], [0, 300]]);
        const rb = roadbook(trk, [0, idxNear(trk, 0, 0), trk.length - 1]);
        expect(RB.tulipShape(rb, 1, false)).toEqual({ exit: null });
    });

    it('GPS jitter on a straight road is not a bend', () => {
        const trk = track([[0, -300], [0, 300]], 5).map((p, i) => ({ lat: p.lat, lon: p.lon + ((i % 3) - 1) * 1.2 / mPerDegLon })); // ±1.2 m wobble
        const rb = roadbook(trk, [0, idxNear(trk, 0, 0), trk.length - 1]);
        expect(RB.tulipShape(rb, 1, false)).toEqual({ exit: null });
    });

    it('a bend after the note curves the exit, from the centre, the full road length, inside the box', () => {
        // north through the note, then bending right 15 m after it
        const trk = track([[0, -300], [0, 15], [25, 40], [300, 40]]);
        const rb = roadbook(trk, [0, idxNear(trk, 0, 0), trk.length - 1]);
        const { exit } = RB.tulipShape(rb, 1, false);
        expect(exit.length).toBeGreaterThanOrEqual(3);
        expect(exit[0]).toEqual([115, 81]); // it leaves the note
        expect(exit[exit.length - 1][0]).toBeGreaterThan(115 + 20); // and ends to the right, where the road goes
        expect(pathLen(exit)).toBeGreaterThan(55); expect(pathLen(exit)).toBeLessThan(64);
        expect(inBox(exit)).toBe(true);
    });

    it('the entry is always the classic straight one: a bend before the note is no part of the manoeuvre', () => {
        const trk = track([[0, -300], [0, -60], [15, -40], [15, -25], [0, -10], [0, 0], [0, 300]], 3);
        const rb = roadbook(trk, [0, idxNear(trk, 0, 0), trk.length - 1]);
        expect(RB.tulipShape(rb, 1, false)).toEqual({ exit: null });
        expect(NoteCanvas.toSVG(rb.notes[1], (ic) => ic.name, RB.tulipContext(rb, 1))).toContain('<path d="M115 154 L115 81"');
    });

    it('turns with the arrival: a road arriving east that bends north draws its exit to the left', () => {
        const trk = track([[-300, 0], [10, 0], [30, 25], [30, 300]]);
        const rb = roadbook(trk, [0, idxNear(trk, 0, 0), trk.length - 1]);
        const { exit } = RB.tulipShape(rb, 1, false);
        expect(exit[exit.length - 1][0]).toBeLessThan(115 - 20);
    });

    it('a hairpin never curls back over the note: shorter, in the upper half, or the classic road', () => {
        const trk = track([[0, -300], [0, 12], [6, 18], [12, 12], [12, -300]], 2);
        const rb = roadbook(trk, [0, idxNear(trk, 0, 0), trk.length - 1]);
        const { exit } = RB.tulipShape(rb, 1, false);
        if (exit) {
            for (const [, y] of exit.slice(1)) expect(y).toBeLessThanOrEqual(81 + 6); // never down over the entry
            let out = false;
            for (const [x, y] of exit.slice(1)) { const d = Math.hypot(x - 115, y - 81); if (d > 22) out = true; else if (out) expect(d).toBeGreaterThanOrEqual(16); }
            expect(inBox(exit)).toBe(true);
        }
    });

    it('only a real bend draws a curve: a gentle drift keeps the classic direct turn', () => {
        // drifting 3 m sideways over 45 m — a road that is basically straight
        const drift = track([[0, -300], [0, 0], [3, 45], [15, 300]]);
        expect(RB.tulipShape(roadbook(drift, [0, idxNear(drift, 0, 0), drift.length - 1]), 1, false, false).exit).toBeNull();
        // a clean 90° turn right at the note is the classic tulip too: the direct turn says it all
        const turn = track([[0, -300], [0, 0], [300, 0]]);
        expect(RB.tulipShape(roadbook(turn, [0, idxNear(turn, 0, 0), turn.length - 1]), 1, false)).toEqual({ exit: null });
    });

    it('a note with junctions keeps its classic exit: its branches are drawn against it', () => {
        const trk = track([[0, -300], [0, 15], [25, 40], [300, 40]]);
        const rb = roadbook(trk, [0, idxNear(trk, 0, 0), trk.length - 1]);
        expect(RB.tulipShape(rb, 1, false).exit).not.toBeNull();
        rb.notes[1].junctions = [{ pivot: [0, 0], tip: [-40, 30], width: 6, road_type: 3 }];
        expect(RB.tulipShape(rb, 1, false).exit).toBeNull();
    });

    it('stops at a neighbouring note: never draws the next one’s curve', () => {
        // straight for 20 m to the next note, which is where the road turns
        const trk = track([[0, -300], [0, 20], [100, 20], [300, 20]]);
        const rb = roadbook(trk, [0, idxNear(trk, 0, 0), idxNear(trk, 0, 20), trk.length - 1]);
        expect(RB.tulipShape(rb, 1, false).exit).toBeNull();
    });

    it('a sparse track has no shape to copy in 40 m: straight, like today', () => {
        const trk = [at(0, -600), at(0, -400), at(0, -200), at(0, 0), at(150, 150), at(300, 300)];
        const rb = roadbook(trk, [0, 3, 5]);
        expect(RB.tulipShape(rb, 1, false)).toEqual({ exit: null });
    });

    it('the start has no entry and the end no exit (#472 · #447)', () => {
        const trk = track([[0, 0], [0, 15], [25, 40], [300, 40]]);
        const rb = roadbook(trk, [0, trk.length - 1]);
        const ctx0 = RB.tulipContext(rb, 0), ctxEnd = RB.tulipContext(rb, 1);
        expect(ctx0).toMatchObject({ isFirst: true, isEnd: false });
        expect(ctx0.shape.exit.length).toBeGreaterThanOrEqual(3); // the start's exit still curves
        expect(ctxEnd).toMatchObject({ isEnd: true }); expect(ctxEnd.shape.exit).toBeNull();
    });

    it('an OpenRally distance-only placeholder track stays straight', () => {
        const trk = Array.from({ length: 40 }, (_, k) => ({ lat: 0, lon: (k * 50) / 111320 }));
        const rb = roadbook(trk, [0, 10, 20, 39]);
        for (let i = 0; i < 4; i++) expect(RB.tulipShape(rb, i, i === 3)).toEqual({ exit: null });
    });

    it('stores nothing: the roadbook is untouched', () => {
        const trk = track([[0, -300], [0, 15], [25, 40], [300, 40]]);
        const rb = roadbook(trk, [0, idxNear(trk, 0, 0), trk.length - 1]);
        const before = JSON.stringify(rb);
        RB.tulipContext(rb, 1);
        expect(JSON.stringify(rb)).toBe(before);
    });
});

describe('the tulip draws the shape (#945)', () => {
    it('a curved road is a smooth path through the track’s shape, arrow at its end', () => {
        const trk = track([[0, -300], [0, 15], [25, 40], [300, 40]]);
        const rb = roadbook(trk, [0, idxNear(trk, 0, 0), trk.length - 1]);
        const svg = NoteCanvas.toSVG(rb.notes[1], (ic) => ic.name, RB.tulipContext(rb, 1));
        const exit = svg.match(/<path d="(M115 81 C[^"]*)"[^>]*marker-end="url\(#vig-arr\)"/);
        expect(exit).not.toBeNull();
        expect(svg).toContain('<path d="M115 154 L115 81"'); // the straight arrival stays the classic one
    });
    it('a straight track draws exactly the classic tulip', () => {
        const trk = track([[0, -300], [0, 300]]);
        const rb = roadbook(trk, [0, idxNear(trk, 0, 0), trk.length - 1]);
        const svg = NoteCanvas.toSVG(rb.notes[1], (ic) => ic.name, RB.tulipContext(rb, 1));
        expect(svg).toContain('<path d="M115 154 L115 81"');
        expect(svg).toContain('<path d="M115 81 L115 18"');
    });
    it('every renderer passes the same context: Editor, Reader/public rows and the PDF', () => {
        const fs = require('fs');
        expect(fs.readFileSync('public/editor/editor.js', 'utf8')).toContain('canvas.setNote(rb.notes[i], RB.tulipContext(rb, i))');
        expect(fs.readFileSync('public/editor/editor.js', 'utf8')).toContain("NoteCanvas.toSVG(n, (ic) => RB.iconSrc(ic, rb, '../assets/icons/'), RB.tulipContext(rb, i))");
        expect(fs.readFileSync('public/assets/js/note-canvas.js', 'utf8')).toContain('window.NoteCanvas.toSVG(n, iconSrc, RB.tulipContext(rb, i))');
        expect(fs.readFileSync('public/assets/js/rb-pdf.js', 'utf8')).toContain('NoteCanvas.toSVG(rb.notes[i], resolver, RB.tulipContext(rb, i))');
    });
});
