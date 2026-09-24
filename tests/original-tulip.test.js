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
const note = (hidden) => ({ num: 2, bearing_in: 0, bearing_out: 0, road_type_in: 3, road_type_out: 3, junctions: null,
    icons: [Object.assign({ name: 'tulip-2.png', cover: true }, hidden ? { hidden: true } : {}), { name: 'x.svg', pos: [10, 10], size: 30 }] });

describe('the original tulip, on / off (#943)', () => {
    it('shown, it is the whole vignette', () => {
        const svg = NoteCanvas.toSVG(note(false), (ic) => 'SRC:' + ic.name, {});
        expect(svg).toContain('href="SRC:tulip-2.png"');
        expect(svg).not.toContain('SRC:x.svg');
        expect(svg).not.toContain('<path d="M115'); // no generated roads over it
    });
    it('hidden, the editor’s own tulip shows — and the original is never drawn as an icon on it', () => {
        const svg = NoteCanvas.toSVG(note(true), (ic) => 'SRC:' + ic.name, {});
        expect(svg).toContain('<path d="M115 154 L115 81"');
        expect(svg).toContain('SRC:x.svg');
        expect(svg).not.toContain('SRC:tulip-2.png');
        expect(NoteCanvas.originalTulip(note(true)).name).toBe('tulip-2.png'); // still kept with the note
    });
    it('the toggle lives beside the vignette, and adding to the vignette switches to the editor’s tulip', () => {
        expect(html).toContain('id="toggleTulip"');
        expect(editor).toContain("if (original.hidden) delete original.hidden; else original.hidden = true;");
        expect(editor).toContain("$('addJunction').onclick = () => { if (editable()) { ownTulip(); canvas.addJunction(); } };");
        expect(editor).toMatch(/function addIcon\(name\) \{\s*if \(!editable\(\)\) return;\s*ownTulip\(\);/);
    });
    it('is never an icon in the palette, and has no delete path of its own', () => {
        expect(editor).toContain('const yours = custom.filter((n) => !originals.has(n.toLowerCase())).reverse();');
        expect(editor).not.toContain('Delete me to export the edited tulip');
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
    const rb = (hidden) => ({ meta: { title: 't' }, icons: { 'tulip-2.png': 'data:image/png;base64,AAAA' },
        track: [{ lat: 45, lon: 9 }, { lat: 45.001, lon: 9 }, { lat: 45.002, lon: 9 }],
        notes: [0, 1, 2].map((idx) => Object.assign(note(hidden && idx === 1), { idx, num: idx + 1, lat: 45 + idx / 1000, lon: 9, distance: idx * 111, partial_distance: 111, text: '' })) });
    // saved (the server stores the JSON as it is), read back, drawn as the Reader draws it
    const readerRow = (r) => NoteCanvas.rowsHTML(JSON.parse(JSON.stringify(r)), { iconBase: '/assets/icons/' }).split('data-i="1"')[1].split('data-i="2"')[0];
    it('the original, when the original was chosen', () => {
        expect(readerRow(rb(false))).toContain('data:image/png;base64,AAAA');
    });
    it('the editor’s tulip, when that was chosen — the original kept in the file for the next toggle', () => {
        const saved = JSON.parse(JSON.stringify(rb(true)));
        expect(readerRow(saved)).not.toContain('data:image/png;base64,AAAA');
        expect(readerRow(saved)).toContain('<path d="M115');
        expect(saved.notes[1].icons[0]).toEqual({ name: 'tulip-2.png', cover: true, hidden: true });
    });
    it('the PDF and the OpenRally export draw through the same vignette', () => {
        expect(read('public/assets/js/rb-pdf.js')).toContain('NoteCanvas.toSVG(rb.notes[i], resolver, RB.tulipContext(rb, i))');
        expect(editor).toContain('const tulips = rb.notes.map((n, i) => tulipSVG(n, i));');
    });
});
