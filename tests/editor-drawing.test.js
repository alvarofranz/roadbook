import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import RB from '../public/assets/js/roadbook-core.js';

// A freehand stroke becomes a clean route piece (#692).
describe('RB.normalizeStroke', () => {
    const D = RB.geo.haversineM;
    // a wobbly west→east stroke: ~1 km with ±3 m of hand jitter every ~10 m
    const wobbly = Array.from({ length: 100 }, (_, i) => ({ lat: 45 + (i % 2 ? 0.000027 : -0.000027), lon: 9 + i * 0.000128 }));

    it('a straight but shaky stroke becomes a straight segment', () => {
        const out = RB.normalizeStroke(wobbly, 8);
        expect(out.length).toBeLessThanOrEqual(4);
        expect(out[0]).toEqual({ lat: RB.round6(wobbly[0].lat), lon: RB.round6(wobbly[0].lon) });
        expect(D(out[out.length - 1], wobbly[wobbly.length - 1])).toBeLessThan(0.5); // ends where the finger lifted
    });

    it('a curve keeps its shape with evenly spread points', () => {
        // a quarter circle, radius ~500 m, traced with 200 points
        const arc = Array.from({ length: 200 }, (_, i) => {
            const a = (i / 199) * Math.PI / 2;
            return { lat: 45 + Math.sin(a) * 0.0045, lon: 9 + (1 - Math.cos(a)) * 0.0064 };
        });
        const out = RB.normalizeStroke(arc, 5);
        expect(out.length).toBeGreaterThan(5);
        expect(out.length).toBeLessThan(60);
        // no point of the result strays from the drawn arc by more than a few metres
        for (const p of out) expect(Math.min(...arc.map((q) => D(p, q)))).toBeLessThan(8);
    });

    it('drops invalid points and survives tiny strokes', () => {
        expect(RB.normalizeStroke([], 5)).toEqual([]);
        expect(RB.normalizeStroke([{ lat: 45, lon: 9 }, { lat: NaN, lon: 9 }, { lat: 45.001, lon: 9 }], 5)).toHaveLength(2);
    });
});

describe('editor map modes M · N · P · D (#692)', () => {
    const editor = fs.readFileSync('public/editor/editor.js', 'utf8');
    const html = fs.readFileSync('public/editor/index.html', 'utf8');

    it('every mode has its mnemonic key and its button in the bottom-left rail', () => {
        for (const [tool, key] of [['points', 'M'], ['note', 'N'], ['point', 'P'], ['draw', 'D']]) {
            expect(html).toMatch(new RegExp(`data-tool="${tool}"[^>]*>[\\s\\S]*?<kbd class="key-chip">${key}</kbd>`));
        }
        expect(html).toContain('class="mode-rail"');
        expect(editor).toContain("const MODE_KEYS = { m: 'points', n: 'note', p: 'point', d: 'draw', c: 'cut' };");
    });

    it('P inserts into the route, and extends an end when tapped away from it', () => {
        expect(editor).toMatch(/function pointTap\(p\)[\s\S]*?addPointAtExact\(p\)[\s\S]*?extendRoute\(p\)/);
    });

    it('D is freehand: the stroke is normalized, and the map does not pan while drawing', () => {
        expect(editor).toContain('RB.normalizeStroke(stroke, strokeTolerance())');
        expect(editor).toMatch(/tool === 'draw' \? map\.map\.dragPan\.disable\(\) : map\.map\.dragPan\.enable\(\)/);
    });

    it('the context-menu keys speak the same letters as the modes', () => {
        expect(editor).toContain("label: 'Turn this point into a note', key: 'N'");
        expect(editor).toContain("label: 'Add track point here', key: 'P'");
        expect(editor).not.toContain("key: 'W'");
        expect(editor).not.toContain("key: 'L'");
    });

    it('Esc closes the open context menu instead of leaving it hanging', () => {
        expect(editor).toMatch(/k === 'escape'[^]*?closeCtxMenu\(\)/);
    });
});
