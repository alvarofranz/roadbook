import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* Long notes in the Reader (#759): the scroll on advancing and the text wrapping. */
const read = (p) => fs.readFileSync(p, 'utf8');

describe('long notes in the Reader (#759)', () => {
    it('puts the note to drive to at the very top of the list, its own material first (#844)', () => {
        const reader = read('public/reader/reader.js');
        const scroll = reader.match(/function scrollActiveIntoView\(\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(scroll).toContain("while (top.previousElementSibling && top.previousElementSibling.classList.contains('block')) top = top.previousElementSibling;");
        expect(scroll).toContain('top.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop');
    });
    it('hyphenates long words instead of cutting them at random', () => {
        const css = read('public/assets/css/app.css');
        expect(css).toContain('.nrow .col-text .text { flex: 1; overflow-wrap: break-word; hyphens: auto; }');
        expect(css).not.toMatch(/\.nrow \.col-text \.text \{[^}]*word-break/);
    });
});

describe('the Reader shell covers the page chrome on a wide screen (#776)', () => {
    const html = read('public/reader/index.html');
    it('stacks above the header, footer and tab bar, below the toast and the dialogs', () => {
        expect(html).toMatch(/body\.rb-immersive #navScreen \{\s*position: fixed; inset: 0; z-index: 65;/);
    });
    it('hides the footer while navigating', () => {
        expect(html).toContain('body.rb-immersive .webgps-banner, body.rb-immersive #prNativeHint, body.rb-immersive .foot { display: none; }');
    });
});
