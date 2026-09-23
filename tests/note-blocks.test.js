import { describe, it, expect } from 'vitest';
import fs from 'fs';
import RBcore from '../public/assets/js/roadbook-core.js';

/* Every row of a roadbook is a NOTE. What a note may also carry is material around it — a photo,
   an advert, a block of text — placed before or after it, none, one or several (#542). One
   catalog in the core (RB.NOTE_BLOCKS) says what that material can be, and the editor, the
   Reader, the public page and the PDF all build themselves from it. */

const read = (p) => fs.readFileSync(p, 'utf8');
const core = read('public/assets/js/roadbook-core.js');
const editorJs = read('public/editor/editor.js');
const editorHtml = read('public/editor/index.html');
const readerJs = read('public/reader/reader.js');
const LANGS = ['es', 'it', 'de', 'fr'];

describe('a note is a note — the kinds are gone (#542)', () => {
    it('nothing decides what a ROW is any more', () => {
        for (const p of ['public/assets/js/roadbook-core.js', 'public/editor/editor.js', 'public/reader/reader.js',
            'public/challenge/challenge.js', 'public/assets/js/rb-pdf.js', 'public/assets/js/note-canvas.js']) {
            expect(read(p), p).not.toContain('isInfoNote');
            expect(read(p), p).not.toContain('NOTE_KINDS');
            expect(read(p), p).not.toMatch(/noteKind\(/);
        }
    });

    it('the Reader walks its notes straight, with no rows to skip over', () => {
        expect(readerJs).not.toContain('nextNav');
        expect(readerJs).not.toContain('prevNav');
        expect(readerJs).toContain('RB.autoReachedIdx(notes, activeIdx, activeIdx + 1,');
    });

    it('older files keep their material: the rows fold onto the note they sat beside', () => {
        expect(core).toContain('function foldInfoRows(rb)');
        expect(core).toContain('foldInfoRows(rb);');   // called from importRoadbook
        // the public page reads the same canonical shape as the Reader
        expect(read('public/challenge/challenge.js')).toContain('RB.importRoadbook(j.roadbook)');
    });
});

describe('the editor edits a note, or the material around it (#542)', () => {
    it('one tab for the note, one per material type, from the catalog', () => {
        const tabs = editorJs.match(/function renderBlockTabs\(n\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(tabs).toContain("tab('', 'fa-location-dot', t('Note')");
        expect(tabs).toContain('RB.NOTE_BLOCKS.map');
        for (const hard of ["'photo'", "'ad'", "'text'"]) expect(tabs, `hard-codes ${hard}`).not.toContain(hard);
    });

    it('the tab IS the control: one slot per type, no "Add" step (#547)', () => {
        const panel = editorJs.match(/function renderBlockPanel\(n\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(panel).toContain("['before', 'after'].map");
        expect(panel).toContain("t(v === 'before' ? 'Before the note' : 'After the note')");
        expect(panel).toContain('type="radio"');
        expect(panel).toContain('blockPickBtn');                 // the picker itself, straight away
        expect(panel, 'an Add step is back').not.toContain('blockAdd');
        // Delete only once there is something to delete
        expect(panel).toContain("${b ? `<button");
        expect(editorJs).toContain('const blockOf = (n, id) => RB.noteBlocks(n).find');
    });

    it('a slot holds a block only while it holds something', () => {
        const prune = editorJs.match(/function pruneBlocks\(n\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(prune).toContain('n.blocks.filter((b) => b.image || b.text)');
        expect(prune).toContain('delete n.blocks');
        // and nothing empty is ever drawn, on any surface
        for (const p of ['public/editor/editor.js', 'public/assets/js/note-canvas.js']) { // the Reader and the public page share note-canvas's rows (#635)
            expect(read(p), p).toContain('filter((b) => b.image || b.text)');
        }
        expect(read('public/assets/js/rb-pdf.js')).toContain('if (b.image || b.text) sheet.push');
    });

    it("the picker's file input lives where a re-render cannot destroy it (#547)", () => {
        // it used to sit inside #blockPanel, which replaces its own innerHTML — so the input the
        // click handler opened had already been thrown away, and Photo and Ad did nothing at all
        const panelTag = editorHtml.match(/<div class="tab-pane" id="blockPanel"[^>]*>([\s\S]*?)<\/div>/)[1];
        expect(panelTag.trim()).toBe('');
        expect(editorHtml).toContain('<input id="edBlockImg" type="file" accept="image/*" hidden>');
        expect(editorJs).toContain("const input = $('edBlockImg');");
    });

    it('deleting material asks first, naming it', () => {
        const del = editorJs.match(/async function deleteBlock\(n, b, kind\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(del).toContain('RBConfirm(');
        expect(del).toContain("t('Delete this from note {n}?')");
        expect(del).toContain('b.text');                        // the message names what goes
    });

    it('a picture is downscaled by its own type, and a file it cannot read says so', () => {
        expect(editorJs).toContain('RBImg.toDataURL(f, kind.imageMax)');
        expect(editorJs).toContain("toast('Could not read the image.')"); // one message per meaning (#700)
    });

    it('the rows show the material where it will be read', () => {
        expect(editorJs).toContain("blockRowsHTML(n, 'before', i)");
        expect(editorJs).toContain("blockRowsHTML(n, 'after', i)");
        expect(editorJs).toContain("select(+el.dataset.block, el.dataset.tab)"); // tap it → its own tab
    });

    it('has no Position field and no reorder arrows anywhere', () => {
        for (const src of [editorJs, editorHtml]) {
            expect(src).not.toContain('edInfoPos');
            expect(src).not.toContain('data-i18n="Position"');
            expect(src).not.toContain('note-nav');
        }
    });

    it('the notes column never scrolls sideways', () => {
        const css = editorHtml.match(/<style>([\s\S]*?)<\/style>/)[1];
        expect(css).toContain('#noteList { overflow-x: hidden; }');
        expect(css).toMatch(/#noteList, \.note-mini, \.note-edit-zone[^{]*\{[^}]*min-width: 0/);
    });

    it('names the material in every language', () => {
        for (const lang of LANGS) {
            const dict = read(`public/assets/js/i18n.${lang}.js`);
            for (const key of ['Photo', 'Ad', 'Text', 'Before the note', 'After the note', 'Add', '(text)', 'Delete this from note {n}?']) {
                expect(dict, `${lang}: ${key}`).toContain(`'${key}':`);
            }
        }
    });
});

describe('every surface draws the material the same way (#542)', () => {
    it('the Reader and the public page put it around the note it belongs to', () => {
        // one renderer for both (#635): NoteCanvas.rowsHTML draws the blocks around their note
        const canvas = read('public/assets/js/note-canvas.js');
        expect(canvas).toContain("RB.noteBlocks(n, at)");
        expect(canvas).toContain("RB.blockType(b)");
        expect(canvas).toContain("${blocks(n, 'before')}");
        expect(canvas).toContain("${blocks(n, 'after')}");
        for (const js of [readerJs, read('public/challenge/challenge.js')]) expect(js).toContain('NoteCanvas.rowsHTML(rb');
    });

    it('a text block is read across the full width, big', () => {
        const app = read('public/assets/css/app.css');
        const rule = app.match(/\.nrow\.block-text \.col-text-wide \.text \{([^}]*)\}/);
        expect(rule, 'app.css has no text-block rule').not.toBeNull();
        expect(rule[1]).toMatch(/font-size: 1\.\d+rem/);
        expect(rule[1]).toContain('white-space: pre-wrap');
    });

    it('the PDF prints it, and counts its pages with it', () => {
        const pdf = read('public/assets/js/rb-pdf.js');
        expect(pdf).toContain('function drawBlock(b, x, y, h)');
        expect(pdf).toContain("RB.noteBlocks(n, 'before')");
        expect(pdf).toContain("RB.noteBlocks(n, 'after')");
        expect(pdf).toContain('const pages = paginate(sheet.length, !!link)'); // the pages are counted over the sheet, material included
    });
});

describe('export and import keep the material, and the other formats unharmed (#556)', () => {
    // Maurizio's question on #535: whatever we do to notes, OpenRally and Roadbook Suite
    // round trips must keep working. Blocks hang off a note, so the sequence of WAYPOINTS —
    // which is all those formats know about — is exactly the notes, in order.
    const RB = require('../public/assets/js/roadbook-core.js');
    const track = Array.from({ length: 12 }, (_, i) => ({ lat: 45 + i * 0.0001, lon: 9 + i * 0.0001 }));
    const withMaterial = () => RB.importRoadbook({
        meta: { title: 'Round trip' }, icons: {}, track,
        notes: [
            { idx: 0, num: 1, road_type_out: 2, text: 'Start', blocks: [{ type: 'text', at: 'before', text: 'Briefing at 8' }] },
            { idx: 6, num: 2, road_type_out: 3, text: 'Fork', wp_type: 'masked', blocks: [{ type: 'ad', at: 'after', image: 'data:img', text: 'ACME' }] },
            { idx: 11, num: 3, road_type_out: 2, text: 'Finish' },
        ],
    });

    it('a .rdbk round trip keeps every block exactly as it was', () => {
        const out = RB.roadbookForExport(withMaterial());
        const back = RB.importRoadbook(JSON.parse(JSON.stringify(out)));
        expect(back.notes.length).toBe(3);
        expect(RB.noteBlocks(back.notes[0], 'before')[0]).toMatchObject({ type: 'text', text: 'Briefing at 8' });
        expect(RB.noteBlocks(back.notes[1], 'after')[0]).toMatchObject({ type: 'ad', image: 'data:img', text: 'ACME' });
        expect(back.notes[1].wp_type, 'the FIA type survives the cap-code round trip').toBe('masked');
    });

    it('the OpenRally export emits every note as a waypoint — no row to skip any more', () => {
        const rb = withMaterial();
        const xml = RB.openRallyDocument(rb, { name: 'Round trip' });
        expect((xml.match(/<wpt /g) || []).length).toBe(rb.notes.length);
        expect(xml).toContain('openrally:wptType');
        expect(xml, 'material is ours, not OpenRally\'s').not.toContain('Briefing at 8');
    });

    it('an OpenRally file still imports, and gains no phantom rows', () => {
        const rb = withMaterial();
        const { rb: back } = RB.parseOpenRally(RB.openRallyDocument(rb, { name: 'Round trip' }));
        expect(back.notes.length).toBe(rb.notes.length);
        expect(back.track.length).toBe(rb.track.length);
        expect(back.notes.map((n) => n.num)).toEqual([1, 2, 3]);   // numbering is the notes, in order
        expect(back.notes.some((n) => n.blocks), 'OpenRally carries no material').toBe(false);
    });

    it('a Roadbook Suite file still opens, and its sponsor rows become material', () => {
        // the suite's own field names, plus the information ROW shape older RDBK files used
        const suite = RB.importRoadbook({
            meta: { titolo: 'Giro', km_totali: 1.2 },
            track,
            notes: [
                { idx: 0, testo: 'Partenza', km_prog: 0, km_parz: 0, road_type_out: 2 },
                { note_kind: 'comment', text: 'Con il supporto di ACME', image: 'data:logo' },
                { idx: 11, testo: 'Arrivo', km_prog: 1.2, km_parz: 1.2, road_type_out: 2 },
            ],
            icons: {},
        });
        expect(suite.meta.title).toBe('Giro');
        expect(suite.notes.length, 'the sponsor row is no longer a row').toBe(2);
        expect(suite.notes.map((n) => n.text)).toEqual(['Partenza', 'Arrivo']);
        expect(RB.noteBlocks(suite.notes[0], 'after')[0]).toMatchObject({ type: 'ad', image: 'data:logo' });
    });
});

describe('a photo becomes its note’s Photo extra (#792)', () => {
    const fsx = fs;
    it('buildRoadbook carries a waypoint’s material onto its note', () => {
        const trkpts = [{ lat: 45, lon: 9 }, { lat: 45.001, lon: 9 }, { lat: 45.002, lon: 9 }];
        const block = { type: 'photo', at: 'after', image: 'data:image/png;base64,AA' };
        const rb = RBcore.buildRoadbook({ name: 't', trkpts, wpts: [{ lat: 45.001, lon: 9, name: 'wpt1', blocks: [block] }] });
        const note = rb.notes.find((n) => n.blocks);
        expect(note.blocks).toEqual([block]);
        expect(rb.notes.filter((n) => n.blocks).length).toBe(1);
    });
    it('the Recorder attaches each photo to the note it dropped', () => {
        const rec = fsx.readFileSync('public/recorder/recorder.js', 'utf8');
        expect(rec).toContain('dropWaypoint(lat, lon).photo = token;');
        expect(rec).toContain('wpts: await withPhotos(wpts)');
    });
    it('the Editor turns a note’s gallery photo into its extra instead of a viewer over the map', () => {
        const ed = fsx.readFileSync('public/editor/editor.js', 'utf8');
        expect(ed).toContain("photoToExtra(+b.dataset.photo, (photosByNote[+b.dataset.photo] || [])[0]);");
        expect(ed).toContain("select(i, 'photo');");
        expect(ed).not.toContain("showView('map'); // the viewer overlays the map");
        expect(fsx.readFileSync('public/editor/index.html', 'utf8')).toContain('#lightbox { position: fixed; inset: 0; z-index: 300;');
    });
});
