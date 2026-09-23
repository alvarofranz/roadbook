import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The Editor's map chrome and settings view (#754 · #752) — CSS and wiring, pinned in the source. */
const read = (p) => fs.readFileSync(p, 'utf8');
const html = read('public/editor/index.html'), editor = read('public/editor/editor.js'), rbmap = read('public/assets/js/rbmap.js');

describe('the Editor map controls (#754)', () => {
    it('drops the note-icons toggle, the compass and the zoom readout', () => {
        expect(editor).toContain('wpIcons: true, compass: false');
        expect(rbmap).toContain('showCompass: compass');
        expect(rbmap).not.toMatch(/wpIconsToggle|setWpIcons/);
        expect(editor + html).not.toContain('rb-mapctl-zoom');
    });
    it('gives every control, left and right, one dark skin with 34 px buttons', () => {
        expect(html).toContain('.map-tools, .mode-rail, .map-tools-menu, .map-editor .maplibregl-ctrl-group { background: rgba(14, 17, 22, .88);');
        expect(html).toContain('.map-tool, .mode-btn, .map-editor .maplibregl-ctrl-group button { position: relative; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px;');
        expect(html).toContain('.map-editor .maplibregl-ctrl-icon { filter: invert(1); }');
        expect(html).not.toMatch(/\.(map-tools|mode-rail|map-tools-menu|mode-name|maplibregl-ctrl-scale|rb-mapctl-layers)[^{]*\{[^}]*background: #fff/);
    });
    it('names the mode for 3 s when it changes, never permanently', () => {
        expect(editor).toContain("modeNameTimer = setTimeout(() => rail.classList.remove('show-name'), 3000);");
        expect(editor).toContain('if (tool !== mapTool) flashModeName();');
        expect(html).toContain('.mode-rail.show-name .mode-btn.on .mode-name { display: block;');
        expect(html).not.toMatch(/\n\s*\.mode-btn\.on \.mode-name \{/);
    });
    it('keeps the mode rail clear of the scale bar, which wears the same skin', () => {
        expect(html).toMatch(/\.mode-rail \{ position: absolute; left: 10px; bottom: 46px;/);
        expect(html).toContain('.map-editor .maplibregl-ctrl-scale { background: rgba(14, 17, 22, .88);');
    });
});

describe('no dialog is taller than the screen (#754)', () => {
    it('caps every modal card at the viewport and scrolls inside it', () => {
        expect(read('public/assets/css/app.css')).toMatch(/\.modal-card \{[^}]*max-height: calc\(100dvh - 2rem\); overflow-y: auto;/);
    });
    it('lays the shortcut sheet out in compact columns', () => {
        expect(editor).toContain('<div class="shortcut-grid">');
        expect(html).toContain('.shortcut-grid { display: grid;');
    });
});

describe('the roadbook settings view (#752)', () => {
    it('puts Back next to Save, at the top and again at the foot', () => {
        expect(html).toMatch(/id="backToMap"[\s\S]{0,200}id="cfgSave"/);
        expect(html).toMatch(/id="backToMapBottom"[\s\S]{0,200}id="cfgSaveBottom"/);
        expect(editor).toContain("['backToMap', 'backToMapBottom'].forEach(");
        expect(editor).toContain("$('cfgSaveBottom').onclick = () => saveRoadbook('cfgSaveBottom');");
        expect(editor).toContain("['saveAccount', 'cfgSave', 'cfgSaveBottom']");
    });
});

describe('Add junction sits beside the tulip, not inside it', () => {
    it('hangs off the live canvas to its left, tied to it by a line', () => {
        expect(html).toContain('.add-junction { position: absolute; right: calc(100% + 12px); top: 0;');
        expect(html).toContain(".add-junction::after { content: ''; position: absolute; left: 100%;");
        expect(html).toMatch(/<div id="canvasWrap" hidden>[\s\S]{0,120}id="addJunction"/);
    });
});
