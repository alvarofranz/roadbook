import { describe, it, expect } from 'vitest';
import RB from '../public/assets/js/roadbook-core.js';
import NoteCanvas from '../public/assets/js/note-canvas.js';
globalThis.RB = RB;
globalThis.RBesc = (s) => String(s);

/* The tulip's roads take the shape the author drew into the track (#945): 4 or more points within
   30 m of the note on one side means that road was drawn on purpose and the tulip follows it; fewer,
   and it is the classic straight road — the exit aimed along the road's first 20 m. Never over the
   note, never over the author's junctions, never stored. */
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
    const shape = (pts, step, noteAt = [0, 0]) => { const trk = track(pts, step); const rb = roadbook(trk, [0, idxNear(trk, ...noteAt), trk.length - 1]); return { rb, s: RB.tulipShape(rb, 1, false, false) }; };

    it('a few points around the note: the classic straight roads', () => {
        const { s } = shape([[0, -300], [0, 15], [25, 40], [300, 40]], 20); // a bend, but drawn with 2-3 points
        expect(s.entry).toBeNull(); expect(s.exit).toBeNull();
    });

    it('4 or more points after the note: the exit follows them — from the centre, the full length, inside the box', () => {
        const { s } = shape([[0, -300], [0, 15], [25, 40], [300, 40]], 4);
        expect(s.exit.length).toBeGreaterThanOrEqual(3);
        expect(s.exit[0]).toEqual([115, 81]);
        expect(s.exit[s.exit.length - 1][0]).toBeGreaterThan(115 + 20); // it ends to the right, where the road goes
        expect(pathLen(s.exit)).toBeGreaterThan(55); expect(pathLen(s.exit)).toBeLessThan(64);
        expect(inBox(s.exit)).toBe(true);
    });

    it('4 or more points before the note: the entry follows them, from the bottom into the centre', () => {
        const { s } = shape([[0, -300], [0, -45], [14, -32], [14, -18], [0, -6], [0, 0], [0, 300]], 3);
        expect(s.entry.length).toBeGreaterThanOrEqual(3);
        expect(s.entry[s.entry.length - 1]).toEqual([115, 81]);
        expect(s.entry[0][1]).toBeGreaterThan(81 + 30);
        expect(s.entry.some(([x]) => x > 115 + 5)).toBe(true);
        expect(inBox(s.entry)).toBe(true);
    });

    it('a dense road that runs straight is still straight, jitter included', () => {
        expect(shape([[0, -300], [0, 300]], 4).s).toMatchObject({ entry: null, exit: null });
        const trk = track([[0, -300], [0, 300]], 4).map((p, i) => ({ lat: p.lat, lon: p.lon + ((i % 3) - 1) * 0.9 / mPerDegLon }));
        const rb = roadbook(trk, [0, idxNear(trk, 0, 0), trk.length - 1]);
        expect(RB.tulipShape(rb, 1, false, false)).toMatchObject({ entry: null, exit: null });
    });

    it('turns with the arrival: a road arriving east that bends north draws its exit to the left', () => {
        const { s } = shape([[-300, 0], [10, 0], [30, 25], [30, 300]], 4);
        expect(s.exit[s.exit.length - 1][0]).toBeLessThan(115 - 20);
    });

    it('a hairpin never curls back over the note or down over the entry', () => {
        for (const pts of [[[0, -300], [0, 12], [6, 18], [12, 12], [12, -300]], [[0, -300], [0, 6], [3, 9], [6, 6], [6, -300]]]) {
            const { s } = shape(pts, 2);
            if (!s.exit) continue; // too tight to draw: the classic exit
            let out = false;
            for (const [x, y] of s.exit.slice(1)) {
                expect(y).toBeLessThanOrEqual(81 + 6);
                const d = Math.hypot(x - 115, y - 81);
                if (d > 22) out = true; else if (out) expect(d).toBeGreaterThanOrEqual(16);
            }
        }
    });

    it('stops at the neighbouring note: never draws the next one’s curve', () => {
        const trk = track([[0, -300], [0, 20], [100, 20], [300, 20]], 4);
        const rb = roadbook(trk, [0, idxNear(trk, 0, 0), idxNear(trk, 0, 20), trk.length - 1]);
        expect(RB.tulipShape(rb, 1, false, false).exit).toBeNull();
    });

    it('the classic exit aims where the road goes over its first 20 m, not over its first metre', () => {
        // arriving north; a clean right turn — but the recorded first metre drifts to the north-east
        const trk = [at(0, -300), at(0, -150), at(0, 0), at(1, 1.5), at(60, 3), at(300, 3)]; // a point or two: no drawn shape
        const rb = roadbook(trk, [0, 2, trk.length - 1]);
        expect(rb.notes[1].bearing_out).toBeLessThan(45); // the stored bearing reads ~34°
        const s = RB.tulipShape(rb, 1, false, false);
        expect(s.exit).toBeNull();
        expect(s.turn).toBeGreaterThan(75); expect(s.turn).toBeLessThan(95); // drawn as the right turn it is
        rb.notes[1].junctions = [{ pivot: [0, 0], tip: [60, 0], width: 6, road_type: 3 }]; // a branch just there
        expect(RB.tulipShape(rb, 1, false, false).turn).toBeUndefined(); // then the stored angle stays
    });

    it('a drawn curve keeps clear of the author’s branches, or stays classic', () => {
        const trk = track([[0, -300], [0, 15], [25, 40], [300, 40]], 4);
        const rb = roadbook(trk, [0, idxNear(trk, 0, 0), trk.length - 1]);
        rb.notes[1].junctions = [{ pivot: [0, 0], tip: [-45, 30], width: 6, road_type: 3 }]; // off to the left
        expect(RB.tulipShape(rb, 1, false, false).exit).not.toBeNull();
        rb.notes[1].junctions = [{ pivot: [0, 0], tip: [30, 40], width: 6, road_type: 3 }]; // where the curve goes
        expect(RB.tulipShape(rb, 1, false, false).exit).toBeNull();
    });

    it('the start has no entry and the end no exit (#472 · #447)', () => {
        const trk = track([[0, 0], [0, 15], [25, 40], [300, 40]], 4);
        const rb = roadbook(trk, [0, trk.length - 1]);
        const ctx0 = RB.tulipContext(rb, 0), ctxEnd = RB.tulipContext(rb, 1);
        expect(ctx0).toMatchObject({ isFirst: true, isEnd: false }); expect(ctx0.shape.entry).toBeNull();
        expect(ctx0.shape.exit.length).toBeGreaterThanOrEqual(3);
        expect(ctxEnd).toMatchObject({ isEnd: true }); expect(ctxEnd.shape.exit).toBeNull();
    });

    it('an OpenRally distance-only placeholder track stays straight', () => {
        const trk = Array.from({ length: 40 }, (_, k) => ({ lat: 0, lon: (k * 50) / 111320 }));
        const rb = roadbook(trk, [0, 10, 20, 39]);
        for (let i = 0; i < 4; i++) expect(RB.tulipShape(rb, i, i === 3, i === 0)).toMatchObject({ entry: null, exit: null });
    });

    it('stores nothing: the roadbook is untouched', () => {
        const trk = track([[0, -300], [0, 15], [25, 40], [300, 40]], 4);
        const rb = roadbook(trk, [0, idxNear(trk, 0, 0), trk.length - 1]);
        const before = JSON.stringify(rb);
        RB.tulipContext(rb, 1);
        expect(JSON.stringify(rb)).toBe(before);
    });
});

describe('the tulip draws the shape (#945)', () => {
    it('a drawn road is a smooth path through its points, arrow at its end', () => {
        const trk = track([[0, -300], [0, 15], [25, 40], [300, 40]], 4);
        const rb = roadbook(trk, [0, idxNear(trk, 0, 0), trk.length - 1]);
        const svg = NoteCanvas.toSVG(rb.notes[1], (ic) => ic.name, RB.tulipContext(rb, 1));
        expect(svg).toMatch(/<path d="M115 81 C[^"]*"[^>]*marker-end="url\(#vig-arr\)"/);
        expect(svg).toContain('<path d="M115 154 L115 81"'); // the straight arrival stays the classic one
    });
    it('a straight road draws exactly the classic tulip', () => {
        const trk = track([[0, -300], [0, 300]], 20);
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

describe('the Editor shows what a note reaches and what shapes its tulip (#945)', () => {
    const fs = require('fs');
    const editor = fs.readFileSync('public/editor/editor.js', 'utf8'), map = fs.readFileSync('public/assets/js/rbmap.js', 'utf8');
    it('rings the selected note: its detection radius, and the dashed radius whose points shape the tulip', () => {
        expect(editor).toContain('map.setNoteRings(i >= 0 ? n : null, i >= 0 ? RB.reachRadius(n, rb.notes[i + 1], rb.meta) : 0, RB.TULIP_SHAPE_M);');
        expect(map).toContain("'line-dasharray': [2.5, 2]");
        expect(RB.TULIP_SHAPE_M).toBe(30);
    });
    it('opens a note on ~200 m around it, turned so the road you arrive on points up', () => {
        expect(editor).toContain('zoom: map.zoomForRadius(200), bearing: n.bearing_in || 0');
    });
});

describe('the Editor edits on a flat map (#945 feedback)', () => {
    it('turns the 3D relief off, so the track points sit on the line they belong to', () => {
        const fs = require('fs');
        expect(fs.readFileSync('public/editor/editor.js', 'utf8')).toMatch(/new RBMap\('edMap', \{[^}]*terrain: false/);
        expect(fs.readFileSync('public/assets/js/rbmap.js', 'utf8')).toContain('if (!this._terrainOn) return;');
    });
});
