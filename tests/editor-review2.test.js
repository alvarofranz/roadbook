import { describe, it, expect } from 'vitest';
import fs from 'fs';
import RB from '../public/assets/js/roadbook-core.js';

/* The Editor + core, second review pass — what it found, pinned. */
const read = (p) => fs.readFileSync(p, 'utf8');
const editor = read('public/editor/editor.js'), html = read('public/editor/index.html'), rbmap = read('public/assets/js/rbmap.js');
const fn = (src, head) => { const i = src.indexOf(head); return src.slice(i, src.indexOf('\n    }\n', i)); };

describe('joining a GPX never drops the piece’s first point', () => {
    const route = () => RB.buildRoadbook({ name: 'r', trkpts: [{ lat: 0, lon: 0.010 }, { lat: 0, lon: 0.011 }, { lat: 0, lon: 0.012 }] });
    it('a first point merely near the finish is kept, the route bridging to it', () => {
        const rb = route();
        RB.joinTrack(rb, [{ lat: 0, lon: 0.013, t: 1 }, { lat: 0, lon: 0.014, t: 2 }], false);
        expect(rb.track.map((p) => p.lon)).toEqual([0.010, 0.011, 0.012, 0.013, 0.014]);
    });
    it('a first point on the finish is not duplicated', () => {
        const rb = route();
        RB.joinTrack(rb, [{ lat: 0, lon: 0.012 }, { lat: 0, lon: 0.013 }], false);
        expect(rb.track).toHaveLength(4);
    });
    it('the same at the start', () => {
        const rb = route();
        RB.joinTrack(rb, [{ lat: 0, lon: 0.009 }, { lat: 0, lon: 0.008 }], true);
        expect(rb.track.map((p) => p.lon)).toEqual([0.008, 0.009, 0.010, 0.011, 0.012]);
        expect(rb.notes[0].idx).toBe(0);
    });
});

describe('a recovered draft waiting for someone else’s lock survives Close', () => {
    it('leaveEditor clears the checkpoint only when the lock is ours', () => {
        const leave = fn(editor, 'async function leaveEditor(');
        expect(leave).toContain('if (!readOnly()) clearDraft();');
        expect(leave).not.toMatch(/\n\s*clearDraft\(\);/);
    });
});

describe('read-only means the vignette does not drag either', () => {
    it('the canvas and the junction button take no input under the lock', () => {
        expect(html).toContain('body.rb-readonly #noteCanvas svg, body.rb-readonly #addJunction { pointer-events: none; }');
    });
    it('a palette drop and the photo pill go through the gate', () => {
        expect(editor).toContain('canvas.onDropIcon((name, pos) => { if (editable()) canvas.addIcon(mkIcon(name, pos)); });');
        expect(fn(editor, 'async function photoToExtra(')).toContain("if (photo && !blockOf(n, 'photo') && !readOnly())");
    });
});

describe('undo holes', () => {
    it('deleting an unused custom icon is a change: dirty, checkpointed, undoable', () => {
        expect(fn(editor, 'async function delCustomIcon(')).toContain('delete rb.icons[name]; markDirty(); renderIcons();');
    });
    it('an undo drops a half-done cut, a selected vertex and a draw seed', () => {
        expect(fn(editor, 'function histApply(')).toContain('cutFromIdx = -1; drawSeed = []; selVertex = -1; map.setPin(null); map.setSelectedVertex(null);');
    });
    it('the map’s vertex dots follow the track it shows, so a style swap never repaints a replaced one', () => {
        expect(fn(rbmap, '    showRoadbook(')).toContain('if (this._vertShow) { this._vertShow = rb.track; this._paintVerts(rb.track); }');
        expect(rbmap).toContain('refreshVertices(track) { if (this._vertShow) { this._vertShow = track; this._paintVerts(track); } }');
    });
});
