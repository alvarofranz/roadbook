import { describe, it, expect } from 'vitest';
import fs from 'fs';
import RB from '../public/assets/js/roadbook-core.js';
import NoteCanvas from '../public/assets/js/note-canvas.js';
globalThis.RB = RB;
globalThis.RBesc = (s) => String(s);

/* An imported tulip is kept for good and switched on / off (#943). An OpenRally note's original
   image is its vignette while shown; `hidden` switches to the editor's own tulip, which is what
   icons and junctions are added to — the original is never deleted, always one toggle away. And
   "Discard changes" really discards: leaving the page no longer writes the edits back as a draft. */
const read = (p) => fs.readFileSync(p, 'utf8');
const editor = read('public/editor/editor.js'), html = read('public/editor/index.html');
const note = (hidden) => ({ num: 2, bearing_in: 0, bearing_out: 0, road_type_in: 2, road_type: 2, junctions: [],
    imported_tulip: { image: 'data:image/png;base64,TULIP', shown: !hidden }, symbols: [{ name: 'x.svg', position: [10, 10], size: 30 }] });

describe('the original tulip, on / off (#943)', () => {
    it('shown, it is the whole vignette', () => {
        const svg = NoteCanvas.toSVG(note(false), (ic) => 'SRC:' + ic.name, {});
        expect(svg).toContain('href="data:image/png;base64,TULIP"');
        expect(svg).not.toContain('SRC:x.svg');
        expect(svg).not.toContain('<path d="M115'); // no generated roads over it
    });
    it('switched off, the editor’s own tulip shows — and the original stays with the note', () => {
        const n = note(true);
        const svg = NoteCanvas.toSVG(n, (ic) => 'SRC:' + ic.name, {});
        expect(svg).toContain('<path d="M115 154 L115 81"');
        expect(svg).toContain('SRC:x.svg');
        expect(svg).not.toContain('TULIP');
        expect(n.imported_tulip.image).toBe('data:image/png;base64,TULIP');
    });
    it('the toggle lives beside the vignette, and adding to the vignette switches to the editor’s tulip', () => {
        expect(html).toContain('id="toggleTulip"');
        expect(editor).toContain('original.shown = !original.shown;');
        expect(editor).toContain("$('addJunction').onclick = () => { if (editable()) { ownTulip(); canvas.addJunction(); } };");
        expect(editor).toMatch(/function addIcon\(name\) \{\s*if \(!editable\(\)\) return;\s*ownTulip\(\);/);
    });
    it('is its note’s own field, never a symbol of the library', () => {
        expect(editor).toContain('const yours = custom.reverse();');
        expect(editor).not.toContain('.cover');
    });
});

describe('Discard really discards (#943)', () => {
    it('clears the unsaved flag before leaving, so no unload handler writes the draft back', () => {
        const leave = editor.match(/async function leaveEditor\(\) \{[\s\S]*?\n {4}\}/)[0];
        expect(leave.indexOf('dirty = false;')).toBeGreaterThan(-1);
        expect(leave.indexOf('dirty = false;')).toBeLessThan(leave.indexOf('location.href'));
        expect(editor).toContain("window.addEventListener('beforeunload', (e) => { if (rb && dirty && !exported) { saveDraft();");
    });
});

describe('the choice travels: what the Editor saved is what the Reader shows (#943)', () => {
    const rb = (hidden) => {
        const r = RB.buildRoadbook({ name: 't', trkpts: [{ lat: 45, lon: 9 }, { lat: 45.001, lon: 9 }, { lat: 45.002, lon: 9 }], wpts: [{ lat: 45.001, lon: 9, name: 'mid' }] });
        r.notes[1].imported_tulip = { image: 'data:image/png;base64,AAAA', shown: !hidden };
        return r;
    };
    // saved as its .rdbk document, read back, drawn as the Reader draws it
    const readerRow = (r) => NoteCanvas.rowsHTML(RB.readRoadbook(RB.writeRoadbook(r)), { iconBase: '/assets/icons/' }).split('data-i="1"')[1].split('data-i="2"')[0];
    it('the original, when the original was chosen', () => {
        expect(readerRow(rb(false))).toContain('data:image/png;base64,AAAA');
        expect(RB.writeRoadbook(rb(false)).notes[1].imported_tulip).toEqual({ image: 'data:image/png;base64,AAAA' });
    });
    it('the editor’s tulip, when that was chosen — the original kept in the file for the next toggle', () => {
        expect(readerRow(rb(true))).not.toContain('data:image/png;base64,AAAA');
        expect(readerRow(rb(true))).toContain('<path d="M115');
        expect(RB.writeRoadbook(rb(true)).notes[1].imported_tulip).toEqual({ image: 'data:image/png;base64,AAAA', shown: false });
    });
    it('the PDF and the OpenRally export draw through the same vignette', () => {
        expect(read('public/assets/js/rb-pdf.js')).toContain('NoteCanvas.toSVG(rb.notes[i], resolver, RB.tulipContext(rb, i))');
        expect(editor).toContain('const tulips = rb.notes.map((n, i) => tulipSVG(n, i));');
    });
});
