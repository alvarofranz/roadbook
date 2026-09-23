import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The Reader's distances (#846 · #847): one format, measured along the route, odometers re-anchored. */
const js = fs.readFileSync('public/reader/reader.js', 'utf8');

describe('the Reader distances', () => {
    it('reads every live distance the way the roadbook writes it: km, two decimals', () => {
        expect(js).toContain('const fmtKm = (m) => (m / 1000).toFixed(2);');
        expect(js).not.toMatch(/Math\.round\(m\) \+ ' m'/);
    });
    it('measures what is left along the route, the straight line only for the radius', () => {
        expect(js).toContain('return a ? Math.max(0, notes[i].distance - a.atM) : RB.geo.haversineM(here, notes[i]);');
        expect(js).toContain('paintApproach(live ? RB.geo.haversineM(lastHere, an) : null, live ? toGoM(activeIdx, lastHere) : null);');
    });
    it('re-anchors the odometers on the route whenever the cursor moves', () => {
        expect(js).toContain('if (a) { tripTotalM = a.atM; tripPartialM = a.atM - (prev ? prev.distance : 0); return; }');
        expect(js.match(/reanchor\(i( \+ 1)?, (here \|\| )?lastHere\)/g).length).toBe(4); // validate · mark · jump · skip
        expect(js).not.toMatch(/tripPartialM = 0; ring|activeIdx = i; tripPartialM = 0/);
    });
    it('never shows a negative partial after an early validation', () => {
        expect(js).toContain('odoEls.partial.textContent = (Math.max(0, tripPartialM) / 1000).toFixed(2);');
    });
});
