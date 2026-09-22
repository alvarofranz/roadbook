import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const editor = fs.readFileSync('public/editor/editor.js', 'utf8');
const html = fs.readFileSync('public/editor/index.html', 'utf8');
const appCss = fs.readFileSync('public/assets/css/app.css', 'utf8');

describe('editor review (#695–#701)', () => {
    it('a note row lays itself out by the width of its column, not the window (#695)', () => {
        expect(html).toContain('.note-list-zone { container: notes / inline-size; }');
        expect(html).toMatch(/@container notes \(max-width: 560px\)/);
        expect(html).toContain('body:has(#mapEditor:not([hidden])) .app-chip-stack { display: none; }');
    });

    it('text fields never fall back to monospace (#696)', () => {
        expect(appCss).toMatch(/\.field \{[^}]*font: inherit;/);
    });

    it('lossy actions ask first and name what they touch (#697)', () => {
        expect(editor).toContain("t('Switch to Basic? These notes lose their rally waypoint type:') + ' ' + losing.map(noteLabel)");
        expect(editor).toContain("esc(t('Remove the logo?'))");
        expect(editor).toContain("t('Turn this note into a plain track point? Its text and symbols will be removed.') + ' ' + noteLabel(");
        expect(editor).toMatch(/btn btn-danger" id="ccDiscard"><i class="fa-solid fa-trash-can"><\/i> \$\{t\('Discard changes'\)\}/);
    });

    it('read-only under another editor’s lock is read-only for real (#698)', () => {
        expect(editor).toContain('const markDirty = () => { if (readOnly()) return;');
        expect(editor).toContain("document.body.classList.toggle('rb-readonly', readOnly());");
        expect(editor).toContain("const modeAvailable = (tool) => !readOnly() &&");
        expect(editor).toMatch(/if \(recWatch != null \|\| readOnly\(\) \|\| e\.target\.matches/);
        expect(html).toMatch(/body\.rb-readonly #noteEditZone[^{]*\{ pointer-events: none;/);
    });

    it('the toolbar has one primary action, and export is a list with a way out (#699)', () => {
        const toolbar = html.slice(html.indexOf('<div class="ed-toolbar">'), html.indexOf('</div>', html.indexOf('<div class="ed-toolbar">')));
        expect((toolbar.match(/btn-primary/g) || []).length).toBe(1);
        expect(toolbar).toContain('id="saveAccount"');
        expect(html).not.toContain('rawJsonBtn');
        expect(editor).toContain("row('source', 'fa-code', 'View source'");
        expect(editor).toMatch(/function openExportModal\(\)[\s\S]*?modal-close[\s\S]*?m\.q\('\.modal-close'\)\.onclick = m\.close;/);
    });

    it('messages are translatable, not concatenated raw errors (#700)', () => {
        expect(editor).not.toContain("toast('Error: ' + err.message)");
        expect(editor).not.toContain("toast('GPS: ' + e.message)");
        expect(editor).not.toContain('>IMG</button>');
    });
});
