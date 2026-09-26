import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The phone's large text (#1004): Android's font size scales every text in the app's WebView, px
   sizes included, while boxes sized in px or rem stay put. Every layout it broke now reflows: the
   minimums that decide a layout are in em, so they grow with the text, and a row that no longer
   fits wraps instead of squeezing a word to a letter per line or pushing the page sideways. At the
   default size every screen is pixel for pixel what it was. */
const read = (p) => fs.readFileSync(p, 'utf8');
const css = read('public/assets/css/app.css');
describe('the app with the phone’s large text (#1004)', () => {
    it('App Info is one wrapping row per fact, never a table that squeezes the value', () => {
        const app = read('public/assets/js/app.js');
        expect(app).toContain('<div class="app-info-fact"><span>${RBesc(RBt(label))}</span><b>${RBesc(value)}</b></div>');
        expect(app).not.toContain('app-info-table');
        expect(css).toContain('.app-info-fact { display: flex; flex-wrap: wrap; justify-content: space-between;');
        expect(css).toContain('.app-info-fact b { margin-left: auto; min-width: 0; text-align: right; overflow-wrap: anywhere; }');
    });
    it('a page title keeps its words whole: "Help" goes under it rather than the title breaking', () => {
        expect(css).toContain('.tool-titlebar { display: flex; flex-wrap: wrap;');
        expect(css).toContain('.tool-titlebar h1 { margin: 0; flex: 1 1 5em; min-width: 0; }');
    });
    it('the option grids go to one column when a card would be narrower than its words', () => {
        expect(css).toContain('minmax(min(100%, max(9em, 40%)), 1fr)');
        expect(read('public/contact/index.html')).toContain('minmax(min(100%, max(8em, 40%)), 1fr)');
        expect(read('public/editor/index.html')).toContain('.note-params { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9em), 1fr));');
    });
    it('the status bar keeps every reading whole, wrapping the last one to a second line', () => {
        expect(css).toContain('.status-bar { position: sticky; top: env(safe-area-inset-top); z-index: 30; display: flex; flex-wrap: wrap;');
        expect(css).toContain('.status-bar .status-cell { flex: 1 1 0; min-width: max-content;');
    });
    it('a Reader note row drops its text under the distance and the vignette instead of squeezing it', () => {
        expect(css).toContain('.nrow:not(.block) { display: flex; flex-wrap: wrap; }');
        expect(css).toContain('.nrow:not(.block) .col-text { flex: 1 1 7em; margin-left: -1px;');
        expect(css).toContain('.nrow:not(.block) .col-distance { flex: 0 0 max(104px, calc(var(--dist-ch, 5) * 1.65ch + 1.2rem)); min-width: max-content; }');
        // photo / ad / text blocks keep their grid spans
        expect(css).toContain('.nrow.block .block-media { grid-column: 1 / 3;');
    });
    it('the Reader bar puts its indicators under the odometers when both no longer fit', () => {
        const reader = read('public/reader/index.html');
        expect(reader).toContain('.odometer-bar { display: flex; flex-wrap: wrap;');
        expect(reader).toContain('<div class="odometer-values">');
        expect(reader).toContain('<div class="odometer-inds">');
        for (const id of ['odoTotal', 'odoPartial', 'odoBrg', 'odoClock', 'gpsTxt', 'odoSpeed']) expect(reader).toContain(`id="${id}"`);
    });
    it('the action buttons and the Recorder’s Note button wrap their words; the capture row grows', () => {
        expect(css).toContain('.fabrow .btn { justify-content: center; min-width: 0; min-height: 3.1rem; font-size: 1rem; white-space: normal;');
        const rec = read('public/recorder/index.html');
        expect(rec).toContain('.rec-note { height: 100%; min-width: 0; flex-wrap: wrap;');
        expect(rec).toContain('.rec-capture { display: grid; grid-template-columns: 2fr 2fr 1fr; gap: .45rem; min-height: 7.2rem; }');
    });
});
