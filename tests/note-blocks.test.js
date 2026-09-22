import { describe, it, expect } from 'vitest';
import fs from 'fs';

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

    it('each piece of material says which side of the note it sits on', () => {
        const panel = editorJs.match(/function renderBlockPanel\(n\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(panel).toContain("['before', 'after'].map");
        expect(panel).toContain("t(at === 'before' ? 'Before the note' : 'After the note')");
        expect(panel).toContain('type="radio"');
        expect(panel).toContain('blockAdd');                    // add another one
        expect(panel).toContain('data-del');                    // …or remove this one
    });

    it('deleting material asks first, naming it', () => {
        const del = editorJs.match(/async function deleteBlock\(n, b, kind\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(del).toContain('RBConfirm(');
        expect(del).toContain("t('Delete this from note {n}?')");
        expect(del).toContain('b.text');                        // the message names what goes
    });

    it('a picture is downscaled by its own type', () => {
        expect(editorJs).toContain('RBImg.toDataURL(f, kind.imageMax)');
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
        for (const js of [readerJs, read('public/challenge/challenge.js')]) {
            expect(js).toContain("RB.noteBlocks(n, at)");
            expect(js).toContain('nrow');
            expect(js).toContain("RB.blockType(b)");
        }
        expect(readerJs).toContain("blockRowsHTML(n, 'before')");
        expect(readerJs).toContain("blockRowsHTML(n, 'after')");
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
        expect(pdf).toContain('const sheetRows = N + notes.reduce');
    });
});
