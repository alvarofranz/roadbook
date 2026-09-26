import { describe, it, expect } from 'vitest';
import fs from 'fs';
import RB from '../public/assets/js/roadbook-core.js';
import NoteCanvas from '../public/assets/js/note-canvas.js';
globalThis.RB = RB;
globalThis.RBesc = (s) => String(s);
globalThis.RBt = (s) => s;

/* The distance column follows the FIA roadbook (#1008): the total big and centred, the partial boxed
   in the bottom-left corner, the waypoint badge, and the note number small in the bottom-right —
   the same in the Reader, the public roadbook page and the PDF. */
const read = (p) => fs.readFileSync(p, 'utf8');
const rb = () => {
    const r = RB.buildRoadbook({ name: 't', trkpts: [{ lat: 45, lon: 9 }, { lat: 45.001, lon: 9 }, { lat: 45.002, lon: 9 }], wpts: [{ lat: 45.001, lon: 9, name: 'mid' }] });
    r.notes[1].waypoint_type = 'masked';
    return RB.readRoadbook(RB.writeRoadbook(r));
};

describe('the FIA distance column (#1008)', () => {
    const row = () => NoteCanvas.rowsHTML(rb(), { iconBase: '/assets/icons/' }).split('data-i="1"')[1].split('data-i="2"')[0];
    it('the total first, then one foot row: boxed partial · badge · number, in that order', () => {
        const html = row();
        expect(html).toMatch(/<div class="col-distance[^"]*"><div class="total">0\.11<\/div><div class="distance-foot"><span class="partial">0\.11<\/span><svg class="wp-badge"[\s\S]*<\/svg><span class="num">2<\/span><\/div><\/div>/);
    });
    it('the partial is a figure, not a "+" delta', () => {
        expect(row()).not.toContain('>+0.');
    });
    it('the total is centred, the partial boxed, the number pushed to the right corner', () => {
        const css = read('public/assets/css/app.css');
        expect(css).toMatch(/\.nrow \.col-distance \.total \{[^}]*justify-content: center/);
        expect(css).toMatch(/\.nrow \.col-distance \.partial \{[^}]*border: solid #14110b; border-width: 1px 1px 0 0/);
        expect(css).toMatch(/\.nrow \.col-distance \.num \{[^}]*margin-left: auto/);
    });
    it('the PDF draws the same cell', () => {
        const pdf = read('public/assets/js/rb-pdf.js');
        expect(pdf).toContain("doc.text(km(n.distance), x + colDist / 2, y + (h - footH) / 2, { align: 'center', baseline: 'middle' });");
        expect(pdf).toContain('doc.line(x + partialW, y + h - footH, x + partialW, y + h);');
        expect(pdf).toContain("doc.setFillColor(20); doc.rect(x + colDist - numW, y + h - numH, numW, numH, 'F');");
    });
});
