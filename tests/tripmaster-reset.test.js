import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The Tripmaster partial resets from its whole tile (#983): hold 2 s, red while held with the hint on
   the caption row and the ↺ lit above the finger, green for 500 ms once done; releasing early cancels. */
const js = fs.readFileSync('public/tripmaster/tripmaster.js', 'utf8');
const html = fs.readFileSync('public/tripmaster/index.html', 'utf8');

describe('the partial’s hold-to-reset', () => {
    it('2 s on the tile, the ±10 m buttons excluded, green for 500 ms after', () => {
        expect(js).toContain('const HOLD_MS = 2000, DONE_MS = 500;');
        expect(js).toContain("tile.addEventListener('pointerdown', start);");
        expect(js).toContain("if (e.button > 0 || e.target.closest('.corr')) return;");
        expect(js).toContain("tile.classList.add('done'); doneTimer = setTimeout(() => tile.classList.remove('done'), DONE_MS);");
    });
    it('the hint takes the caption row and the arrow stays, both above the finger', () => {
        expect(html).toContain('<div class="readout hold-tile" id="tmPartialTile">');
        expect(html).toContain('<span id="tmHoldHint" data-i18n="Hold 2 s to reset" hidden>Hold 2 s to reset</span>');
        expect(html).toContain('.hold-tile.holding .hold-fill { width: 100%; transition: width 2s linear; }');
        expect(html).toContain('.hold-tile.done { background: rgba(58, 210, 159, .3); border-color: var(--ok); }');
        expect(html).toContain('id="tmReset"');
    });
});
