import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* What a row in a roadbook IS is one catalog (RB.NOTE_KINDS) that everything reads: the editor's
   tabs, the row's icon, the image downscale, the Reader/PDF/public rendering (#534). Adding a
   kind must stay a one-line change there, so nothing below may hard-code the list. */

const read = (p) => fs.readFileSync(p, 'utf8');
const editorJs = read('public/editor/editor.js');
const editorHtml = read('public/editor/index.html');
const core = read('public/assets/js/roadbook-core.js');
const LANGS = ['es', 'it', 'de', 'fr'];

describe('the kinds live in the core, once (#534)', () => {
    it('the catalog is the single source', () => {
        expect(core).toContain('const NOTE_KINDS = [');
        expect(core).toContain('const isInfoNote = (n) => !!(n && n.note_kind && n.note_kind !== \'note\');');
        expect(core).toContain('noteKind,');
    });

    it('no page keeps its own idea of what a comment note is', () => {
        for (const p of ['public/editor/editor.js', 'public/reader/reader.js', 'public/challenge/challenge.js', 'public/assets/js/rb-pdf.js', 'public/assets/js/note-canvas.js']) {
            expect(read(p), p).not.toContain("note_kind === 'comment'");
            expect(read(p), p).not.toContain('isComment');
        }
    });
});

describe('the editor builds itself from the catalog (#534)', () => {
    it('renders one tab per kind, straight from RB.NOTE_KINDS', () => {
        expect(editorHtml).toContain('id="kindTabs"');
        const tabs = editorJs.match(/function renderKindTabs\(n\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(tabs).toContain('RB.NOTE_KINDS.map');
        expect(tabs).toContain('k.icon');
        expect(tabs).toContain("t(k.name)");
        for (const hard of ["'photo'", "'ad'"]) expect(tabs, `hard-codes ${hard}`).not.toContain(hard);
    });

    it('switching kind keeps the note whole, so it can switch back', () => {
        const set = editorJs.match(/function setNoteKind\(i, id\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(set).toContain("if (id === 'note') delete n.note_kind; else n.note_kind = id;");
        for (const field of ['idx', 'lat', 'icons', 'junctions', 'wp_type']) {
            expect(set, `throws ${field} away`).not.toContain(`delete n.${field}`);
        }
        // a row with no point on the route cannot become a navigation note — the tab says so
        expect(editorJs).toContain("k.id === 'note' && !placed");
        expect(editorJs).toContain("t('This row has no place on the route.')");
    });

    it('an image kind edits its picture, never the tulip tools', () => {
        const render = editorJs.match(/function renderEditor\(\) \{([\s\S]*?)\n {8}\$\('noteEditStd'\)\.hidden = false;/)[1];
        expect(render).toContain("$('noteEditStd').hidden = true;");
        expect(render).toContain("$('infoForm').hidden = false;");
        expect(editorJs).toContain('RBImg.toDataURL(f, kind.imageMax)'); // per-kind downscale
    });

    it('drops the Add comment button and the row arrows', () => {
        expect(editorHtml).not.toContain('addSponsorBtn');
        expect(editorJs).not.toContain('addComment');
        expect(editorJs).not.toContain('data-up=');
        expect(editorJs).not.toContain('data-down=');
        expect(editorJs).not.toContain('note-nav');
    });

    it('puts Delete in the row\'s left cell, with the number', () => {
        const rows = editorJs.match(/\$\('noteList'\)\.innerHTML = rb\.notes\.map\(\(n, i\) => \{([\s\S]*?)\}\)\.join\(''\);/)[1];
        expect(rows).toContain('class="note-number"');
        expect(rows.indexOf('note-del')).toBeGreaterThan(-1);
        expect(rows).toContain('${left}${middle}');   // one row template for every kind
        expect(editorHtml).toMatch(/\.note-mini \.note-number \{[^}]*flex-direction: column/);
    });

    it('names every kind in every language', () => {
        for (const lang of LANGS) {
            const dict = read(`public/assets/js/i18n.${lang}.js`);
            for (const key of ['Note', 'Photo', 'Ad', '(caption)', 'This row has no place on the route.']) {
                expect(dict, `${lang}: ${key}`).toContain(`'${key}':`);
            }
        }
    });
});

describe('the format documents the kinds (#534)', () => {
    it('the spec page states the rule that keeps unknown kinds safe', () => {
        const spec = read('public/standard/index.html');
        expect(spec).toContain('data-i18n-html="notes.note_kind"');
        expect(spec).toContain('<code>"photo"</code>');
        expect(spec).toContain('<code>"ad"</code>');
        expect(spec).toContain('data-i18n-html="conformance.info"');
        expect(spec).not.toContain('conformance.comment');
    });

    it('is translated, like every other page', () => {
        for (const lang of LANGS) {
            const dict = read(`public/assets/js/i18n.${lang}.js`);
            for (const key of ['notes.note_kind', 'notes.info.intro', 'conformance.info']) {
                expect(dict, `${lang}: ${key}`).toContain(`'${key}':`);
            }
            expect(dict, lang).not.toContain("'conformance.comment':");
        }
    });
});
