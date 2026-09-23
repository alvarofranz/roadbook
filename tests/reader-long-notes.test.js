import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* Long notes in the Reader (#759): the scroll on advancing and the text wrapping. */
const read = (p) => fs.readFileSync(p, 'utf8');

describe('long notes in the Reader (#759)', () => {
    it('scrolls through RB.activeScrollTop, so the active row always shows whole', () => {
        const reader = read('public/reader/reader.js');
        expect(reader).toContain('list.scrollTo({ top: RB.activeScrollTop({');
        expect(reader).not.toContain('const anchor = at > 0 ? rows[at - 1] : act;');
    });
    it('hyphenates long words instead of cutting them at random', () => {
        const css = read('public/assets/css/app.css');
        expect(css).toContain('.nrow .col-text .text { flex: 1; overflow-wrap: break-word; hyphens: auto; }');
        expect(css).not.toContain('word-break: break-word');
    });
});
