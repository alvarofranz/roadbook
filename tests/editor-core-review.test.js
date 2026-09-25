import { describe, it, expect } from 'vitest';
import fs from 'fs';
import RB from '../public/assets/js/roadbook-core.js';
import NoteCanvas from '../public/assets/js/note-canvas.js';
import RBZip from '../public/assets/js/rbzip.js';
globalThis.RB = RB; // NoteCanvas reads the global RB.ROAD_TYPES
globalThis.RBesc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* The Editor and the shared core it edits with — what a review of them found, pinned. */
const read = (p) => fs.readFileSync(p, 'utf8');
const editor = read('public/editor/editor.js'), html = read('public/editor/index.html');
const core = read('public/assets/js/roadbook-core.js'), canvasJs = read('public/assets/js/note-canvas.js');
const fn = (src, head) => { const i = src.indexOf(head); return src.slice(i, src.indexOf('\n    }\n', i)); };

describe('joining a GPX keeps its times and elevations, at either end', () => {
    const route = () => RB.buildRoadbook({ name: 'r', trkpts: [
        { lat: 0, lon: 0.010, ele: 10, t: 3000 }, { lat: 0, lon: 0.011, ele: 11, t: 4000 }, { lat: 0, lon: 0.012, ele: 12, t: 5000 },
    ] });
    const piece = [{ lat: 0, lon: 0.010, ele: 10, t: 2500 }, { lat: 0, lon: 0.009, ele: 9, t: 2000 }, { lat: 0, lon: 0.008, ele: 8, t: 1000 }];

    it('at the start the piece is laid before it, running in, and no point loses its time', () => {
        const rb = route(), before = rb.track.length;
        RB.joinTrack(rb, piece, true);
        expect(rb.track).toHaveLength(before + 2); // the meeting point is not duplicated
        expect(rb.track.map((p) => p.time_ms)).toEqual([1000, 2000, 3000, 4000, 5000]);
        expect(rb.track.map((p) => p.elevation)).toEqual([8, 9, 10, 11, 12]);
        expect(rb.notes[0].track_index).toBe(0);           // a new start note rides the new tip
        expect(rb.notes[0].distance).toBe(0);
        expect(rb.notes.map((n) => n.num)).toEqual(rb.notes.map((_, i) => i + 1));
    });
    it('at the finish it is appended the same way', () => {
        const rb = route();
        RB.joinTrack(rb, [{ lat: 0, lon: 0.012 }, { lat: 0, lon: 0.013, ele: 13, t: 6000 }], false);
        expect(rb.track.map((p) => p.time_ms)).toEqual([3000, 4000, 5000, 6000]);
        expect(rb.notes[rb.notes.length - 1].track_index).toBe(3);
    });
    it('the old notes keep their own vertices', () => {
        const rb = route(), oldStart = { ...rb.track[0] };
        RB.joinTrack(rb, piece, true);
        expect(rb.notes.some((n) => n.lat === oldStart.lat && n.lon === oldStart.lon)).toBe(true);
    });
    it('the Editor joins through it, never a reverse (which drops every time)', () => {
        const join = fn(editor, 'async function addGpxTrack(');
        expect(join).toContain('RB.joinTrack(rb,');
        expect(join).not.toContain('reverseRoadbook');
    });
});

describe('editing the track keeps each point’s elevation and time', () => {
    it('a splice (Adjust, detour) copies them', () => {
        const splice = fn(editor, 'function spliceByIndex(');
        expect(splice).toContain('const piece = newTrk.map(RB.trackPoint);'); // a GPS fix → a track point, elevation and time kept
    });
    it('a drag moves only the position', () => {
        expect(fn(editor, 'function onVertexDrag(')).toContain('Object.assign(rb.track[i], { lat: RB.round6(lat), lon: RB.round6(lon) });');
        expect(fn(editor, 'function onWptDrag(')).toContain('Object.assign(rb.track[n.track_index], { lat: RB.round6(lat), lon: RB.round6(lon) });');
    });
});

describe('someone else’s lock makes the Editor read-only for real', () => {
    it('no map mode can be armed while read-only', () => {
        expect(fn(editor, 'function setMapTool(')).toContain("if (readOnly()) tool = 'pan';");
    });
    it('opening the roadbook keeps the route tools off', () => {
        const open = fn(editor, 'function setRoadbook(');
        expect(open).toContain("['toolAddGpx', 'toolSimplify', 'toolAdjust'].forEach((id) => $(id).disabled = readOnly());");
        expect(editor).toContain('setLock(r.lock); setRoadbook(r.roadbook ? RB.readRoadbook(r.roadbook) : RB.newRoadbook(r.title, [], []));'); // the lock is known first
    });
    it('every tool that changes the roadbook asks editable()', () => {
        for (const head of ["$('toolAddGpx').onclick", "$('addGpxFile').onchange", "$('cfgReverse').onclick", "$('toolSimplify').onclick", "$('toolAdjust').onclick", "$('addJunction').onclick", 'function addIcon(', 'async function addIconFiles(', 'async function delCustomIcon(']) {
            const at = editor.indexOf(head);
            expect(at, head).toBeGreaterThan(-1);
            expect(editor.slice(at, at + 240), head).toContain('editable()');
        }
    });
    it('Escape goes back to Move only when it is not read-only and no dialog or viewer is open', () => {
        const at = editor.indexOf("if (e.key !== 'Escape' || recWatch != null || readOnly()) return;");
        expect(at).toBeGreaterThan(-1);
        expect(editor.slice(at, at + 200)).toContain("if (document.querySelector('.modal') || !$('lightbox').hidden) return;");
    });
});

describe('a recovered draft is the whole working state', () => {
    it('keeps the server-side settings a save writes back', () => {
        const save = editor.slice(editor.indexOf('const saveDraft = '), editor.indexOf('const clearDraft'));
        for (const k of ['reusable', 'vehicles', 'publicSlug', 'gaps']) expect(save, k).toContain(k);
        const restore = editor.slice(editor.indexOf("if (await RBConfirm(t('You left unsaved changes here."), editor.indexOf('declineDraft();\n'));
        expect(restore).toContain('reusable = !!draft.reusable; publicSlug = draft.publicSlug || null;');
        expect(restore).toContain('vehicles = Array.isArray(draft.vehicles)');
    });
    it('takes the edit lock before loading a saved roadbook’s draft', () => {
        const restore = editor.slice(editor.indexOf("if (await RBConfirm(t('You left unsaved changes here."), editor.indexOf('declineDraft();\n'));
        expect(restore.indexOf("RBApi('rb_get', { id: currentRbId, lock: 1 })")).toBeGreaterThan(-1);
        expect(restore.indexOf('setLock(r.lock)')).toBeLessThan(restore.indexOf('setRoadbook(draft.rb'));
    });
    it('restores the open cuts before the history starts', () => {
        expect(editor).toContain("setRoadbook(draft.rb, Array.isArray(draft.gaps) ? draft.gaps : []);");
        const open = fn(editor, 'function setRoadbook(');
        expect(open).toContain('gaps = restoredGaps || [];');
        expect(open.indexOf('gaps = restoredGaps')).toBeLessThan(open.indexOf('histReset();'));
    });
    it('is not written again right after an export', () => {
        expect(editor).toContain("if (document.visibilityState === 'hidden') { if (rb && dirty && !exported) saveDraft(); return; }");
    });
});

describe('copying a public roadbook respects its owner (#106)', () => {
    it('copies from the roadbook itself (/editor/<slug>), refusing one its owner keeps, taking the vehicles along', () => {
        expect(editor).toContain("if (!j.reusable) { toast(t('This public roadbook cannot be copied.')); return; } currentRbId = 0; setStatus('draft'); reusable = false; vehicles = j.vehicles;");
        // not from the Editor's opening screen: a list of anyone's roadbooks from anywhere there said nothing (#979)
        expect(read('public/editor/index.html')).not.toContain('pickChallenge');
        expect(read('public/assets/js/challenges.js')).not.toContain('async function pick(');
    });
});

describe('the Editor asks before it loses anything', () => {
    it('a cut names the notes inside it', () => {
        const cut = fn(editor, 'async function cutPoint(');
        expect(cut).toContain("RBConfirmDanger(t('Cut the route? These notes are inside the cut and will be deleted:') + ' ' + losing.map(noteLabel).join(', '))");
        expect(cut.indexOf('RBConfirmDanger')).toBeLessThan(cut.indexOf('rb.track = rb.track.slice(b);'));
    });
    it('a custom icon’s name is escaped in its delete confirm', () => {
        const del = fn(editor, 'async function delCustomIcon(');
        expect(del).not.toMatch(/' “' \+ name \+/);
        expect(del.match(/esc\(name\)/g)).toHaveLength(1); // the one confirm: an imported tulip is never deleted here (#943)
    });
});

describe('undo / redo refill the settings from the one helper', () => {
    it('setRoadbook and histApply share fillSettings', () => {
        expect(fn(editor, 'function setRoadbook(')).toContain('fillSettings();');
        const apply = fn(editor, 'function histApply(');
        expect(apply).toContain('fillSettings();');
        expect(apply).not.toContain("$('rbTitle').value");
        const fill = fn(editor, 'function fillSettings(');
        for (const id of ['rbTitle', 'rbAuthor', 'rbModified', 'cfgProfile', 'cfgWpRadius', 'cfgReusable']) expect(fill, id).toContain(`$('${id}')`);
        expect(fill).toContain("rb.meta.author || userName() || ''");
    });
    it('a snapshot with no notes renders nothing it does not have', () => {
        expect(fn(editor, 'function histApply(')).toContain('if (rb.notes.length) { renderEditor(); showOnCanvas(sel); } else');
    });
    it('the default radius placeholder is the system default', () => {
        expect(RB.CONST.REACH_DEFAULT_M).toBe(30);
        expect(editor).toContain("$('cfgWpRadius').placeholder = RB.CONST.REACH_DEFAULT_M;");
        expect(html).not.toMatch(/id="cfgWpRadius"[^>]*placeholder/);
    });
});

describe('the live vignette editor', () => {
    const mount = () => {
        const host = document.createElement('div'), box = document.createElement('div'), bar = document.createElement('div');
        host.append(box, bar); document.body.append(host);
        return new NoteCanvas(box, { toolbarEl: bar, resolveIcon: (ic) => 'RES:' + ic.name });
    };
    it('draws a shown imported tulip full-box, like toSVG', () => {
        const c = mount();
        c.setNote({ num: 2, symbols: [], junctions: [], imported_tulip: { image: 'data:image/svg+xml,OR', shown: true } });
        const img = c.svg.querySelector('image');
        expect(img.getAttribute('width')).toBe('230');
        expect(img.getAttribute('height')).toBe('162');
        expect(img.getAttribute('href')).toBe('data:image/svg+xml,OR');
        expect(c.svg.querySelectorAll('path.vignette-box-dyn')).toHaveLength(0);
    });
    it('draws the bike lane in its own colour, as thick as every other road', () => {
        const svg = NoteCanvas.toSVG({ num: 2, bearing_in: 0, bearing_out: 0, road_type_in: 5, road_type: 5, symbols: [] });
        expect(svg).toContain('stroke-width="8"');
        expect(svg).toContain(RB.roadType(5).color);
    });
    it('draws the branches under the route, and the route lets taps through to them', () => {
        const note = { num: 2, bearing_in: 0, bearing_out: 90, road_type_in: 2, road_type: 2, symbols: [], junctions: [{ from: [0, 0], to: [60, 40], road_type: 2 }] };
        const svg = NoteCanvas.toSVG(note);
        expect(svg.indexOf('stroke="#9aa4b2"')).toBeLessThan(svg.indexOf('stroke="#ff5a45"'));
        const c = mount(); c.setNote(note);
        const kids = [...c.svg.children];
        const branch = kids.findIndex((el) => (el.getAttribute('class') || '').includes('vignette-box-junctions')), road = kids.findIndex((el) => el.tagName === 'path' && el.getAttribute('class') === 'vignette-box-dyn' && el.getAttribute('stroke') === '#ff5a45');
        expect(branch).toBeGreaterThan(-1);
        expect(branch).toBeLessThan(road);
        expect(kids[road].getAttribute('pointer-events')).toBe('none');
    });
    it('draws every road with its FIA stroke: tarmac double, low-visible long–short, off track short dashes', () => {
        const draw = (rt) => NoteCanvas.toSVG({ num: 2, bearing_in: 0, bearing_out: 0, road_type_in: rt, road_type: rt, symbols: [], junctions: [] });
        expect(draw(1)).toContain('stroke="#fff" stroke-width="2"'); // the white centre that splits the double line
        expect(draw(2)).not.toContain('stroke-dasharray');
        expect(draw(3)).toContain('stroke-dasharray="24 8 8 8"');
        expect(draw(4)).toContain('stroke-dasharray="8 8"');
        expect(RB.ROAD_TYPES.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
    });
    it('has no dead options left', () => {
        expect(canvasJs).not.toContain('onSelect');
        expect(canvasJs).not.toContain("document.createElement('div'); this.el.parentNode.insertBefore");
        expect(canvasJs).not.toContain('note.num > 1');
    });
});

describe('dead code in the core', () => {
    it('simplifyTrack is gone; simplifyRoadbook is the one simplifier', () => {
        expect(core).not.toContain('simplifyTrack');
        expect(RB.simplifyTrack).toBeUndefined();
        expect(typeof RB.simplifyRoadbook).toBe('function');
    });
    it('readRdbk is readBundle’s roadbook', async () => {
        const rb = { meta: { title: 'x' }, track: [], notes: [] };
        expect(await RBZip.readRdbk(new Blob([JSON.stringify(rb)]))).toEqual(rb);
        expect(read('public/assets/js/rbzip.js')).toContain('const readRdbk = async (file) => (await readBundle(file)).roadbook;');
    });
});
