import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import RB from '../public/assets/js/roadbook-core.js';

// A 20×20 RGBA image: a flat backdrop, a red square symbol in the middle, and — inside the
// symbol — a white hole that must survive (it is not connected to the border).
function sample(bg = [255, 255, 255]) {
    const w = 20, h = 20, data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const inSymbol = x >= 5 && x < 15 && y >= 5 && y < 15, inHole = x >= 9 && x < 11 && y >= 9 && y < 11;
        const c = inSymbol && !inHole ? [220, 30, 30] : bg;
        data.set([...c, 255], o);
    }
    return { data, w, h };
}
const alphaAt = (img, x, y) => img.data[(y * img.w + x) * 4 + 3];

describe('icon background removal (#694)', () => {
    it('finds the flat backdrop from the border', () => {
        const img = sample([250, 248, 245]);
        expect(RB.iconBackground(img.data, img.w, img.h)).toEqual({ r: 250, g: 248, b: 245 });
    });

    it('clears the backdrop, keeps the symbol and the white detail inside it', () => {
        const img = sample();
        const removed = RB.removeIconBackground(img.data, img.w, img.h, RB.iconBackground(img.data, img.w, img.h));
        expect(removed).toBe(20 * 20 - 10 * 10);
        expect(alphaAt(img, 0, 0)).toBe(0);
        expect(alphaAt(img, 7, 7)).toBe(255);   // the symbol
        expect(alphaAt(img, 9, 9)).toBe(255);   // the enclosed white hole survives
    });

    it('offers nothing for an image that is already transparent or has no single backdrop', () => {
        const cut = sample(); for (let i = 3; i < cut.data.length; i += 4) if (cut.data[i - 3] === 255) cut.data[i] = 0;
        expect(RB.iconBackground(cut.data, cut.w, cut.h)).toBeNull();
        const noisy = sample(); for (let i = 0; i < noisy.data.length; i += 4) { noisy.data[i] = (i * 37) % 256; noisy.data[i + 1] = (i * 91) % 256; }
        expect(RB.iconBackground(noisy.data, noisy.w, noisy.h)).toBeNull();
    });

    it('fades the rim instead of cutting it hard', () => {
        const img = sample();
        img.data.set([225, 225, 225, 255], (0 * img.w + 3) * 4); // a light-grey speck on the border: within the feather band
        RB.removeIconBackground(img.data, img.w, img.h, { r: 255, g: 255, b: 255 });
        const a = alphaAt(img, 3, 0);
        expect(a).toBeGreaterThan(0); expect(a).toBeLessThan(255);
    });

    it('the editor asks before removing, and keeps only the chosen version', () => {
        const editor = fs.readFileSync('public/editor/editor.js', 'utf8');
        expect(editor).toContain('RB.iconBackground(');
        expect(editor).toMatch(/RB\.removeIconBackground\([\s\S]*?askRemoveBackground\(original, cleaned\)\) \? cleaned : original/);
        expect(editor).toContain("t('Remove the background?')");
    });
});
