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
        expect(read('public/assets/css/app.css')).toMatch(/\.modal-card \{[^}]*max-height: calc\(100dvh - 2\.5rem - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\); overflow-y: auto;/);
        // a card with a corner close scrolls in its body instead, so the close is never clipped
        expect(read('public/assets/css/app.css')).toContain('.modal-card.has-x > .modal-body { overflow-y: auto; min-height: 0;');
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
        expect(editor).toContain("['saveAccount', 'cfgSave', 'cfgSaveBottom']");
    });
});

describe('Add junction sits beside the tulip, not inside it', () => {
    it('hangs off the live canvas to its left, tied to it by a line', () => {
        expect(html).toContain('.add-junction { position: absolute; right: calc(100% + 10px); top: 14px; z-index: 4; width: 26px; height: 26px;');
        expect(html).toContain(".add-junction::after { content: ''; position: absolute; left: 100%;");
        expect(html).toMatch(/<div id="canvasWrap" hidden>[\s\S]{0,120}id="addJunction"/);
    });
});

describe('Add junction on a phone', () => {
    it('moves to the free right side of the tulip, the line still tying it to the canvas', () => {
        expect(html).toContain('.add-junction { right: auto; left: calc(100% + 10px); top: 50%; transform: translateY(-50%); }');
        expect(html).toContain('.add-junction::after { left: auto; right: 100%; }');
    });
});

describe('the Editor saves, it does not duplicate (#761)', () => {
    it('has no "Save a copy": copies are made from My roadbooks', () => {
        expect(html + editor).not.toMatch(/saveAsAccount|Save a copy/);
    });
});

describe('a map style switch paints everything back (#788)', () => {
    it('reloads the style fully and replays what the map was showing', () => {
        expect(rbmap).toContain("this.map.setStyle(styleUrl, { diff: false });");
        expect(rbmap).toContain('this._replay(); if (onReady) onReady();');
        for (const k of ['this._lastRb', 'this._lastLive', 'this._lastPhotos', 'this._vertShow', 'this._lastSel', 'this._lastPos', 'this._lastGuide']) expect(rbmap.slice(rbmap.indexOf('_replay() {'))).toContain(k);
    });
    it('remembers the live recording and the photos to paint them back', () => {
        expect(rbmap).toContain('this._lastLive = { pts, wpts, photos };');
        expect(rbmap).toContain('this._lastPhotos = photos;');
    });
    it('leaves no page to repaint by hand', () => {
        expect(editor).not.toMatch(/setBaseStyle|MAP_STYLES|mapStyleIdx/);
    });
    it('paints the Adjust overlay back too', () => {
        expect(rbmap).toContain('this._lastOverlay = pts && pts.length ? pts : null;');
        expect(rbmap.slice(rbmap.indexOf('_replay() {'))).toContain('if (this._lastOverlay) this.setOverlay(this._lastOverlay);');
    });
});

describe('one base-map toggle, RBMap’s own', () => {
    it('the Editor uses it, with the short labels and a remembered choice', () => {
        expect(editor).toContain("layerToggle: { short: true, remember: 'rb_map_style' }");
        expect(editor).not.toContain('addControl(');
        expect(rbmap).toContain("const STYLE_SHORT = ['SAT', 'TOPO', 'OSM'];");
        expect(rbmap).toContain('localStorage.getItem(this._rememberKey)');
        expect(rbmap).toContain('localStorage.setItem(this._rememberKey, STYLE_KEYS[this._mapLayer])');
    });
    it('keeps the Editor’s look: the compact button class and its tooltip', () => {
        expect(rbmap).toContain("b.type = 'button'; b.className = 'rb-mapctl-layers';");
        expect(rbmap).toContain("t('Map: satellite · topographic · OpenStreetMap')");
        expect(html).toContain('.map-editor .maplibregl-ctrl-group button.rb-mapctl-layers {');
    });
    it('names the button for screen readers once its title exists, and again on a language switch', () => {
        const control = rbmap.slice(rbmap.indexOf('function layerToggleControl('));
        const start = control.indexOf('const update = () => {');
        const update = control.slice(start, control.indexOf('};', start));
        expect(update).toContain("b.setAttribute('aria-label', b.title);");
        expect(control).toContain("window.addEventListener('rb-lang', update);");
    });
});

describe('the Editor start offers four ways, recording first (#808 · #979)', () => {
    it('Record · GPX · Draw · .rdbk, as the site’s option cards', () => {
        const ways = [...html.matchAll(/<(?:a|button) class="choice-card"[^>]*?(?:href="([^"]+)"|id="(\w+)")/g)].map((m) => m[1] || m[2]);
        expect(ways).toEqual(['../recorder/', 'loadGpx', 'drawRoute', 'loadJson']);
        const css = read('public/assets/css/app.css');
        expect(css).toContain('.choice-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .8rem; }');
        expect(css).toContain('.choice-card > i:first-child { display: inline-grid; place-items: center;'); // the icon in its tinted square
    });
});
