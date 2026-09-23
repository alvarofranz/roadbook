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
    it('skins the left controls like MapLibre’s on the right: white groups of 29 px buttons', () => {
        expect(html).toContain('.map-tools, .mode-rail, .map-tools-menu { background: #fff;');
        expect(html).toContain('.map-tool, .mode-btn { position: relative; display: flex; align-items: center; justify-content: center; width: 29px; height: 29px;');
    });
    it('keeps the mode rail clear of the scale bar, which wears the same skin', () => {
        expect(html).toMatch(/\.mode-rail \{ position: absolute; left: 10px; bottom: 46px;/);
        expect(html).toContain('.map-editor .maplibregl-ctrl-scale { background: #fff;');
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
