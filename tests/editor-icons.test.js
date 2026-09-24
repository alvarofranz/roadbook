import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* Custom icons in the Editor (#855 · #856). */
const js = fs.readFileSync('public/editor/editor.js', 'utf8');

describe('an icon added while a note is open', () => {
    it('goes straight into its vignette', () => {
        expect(js).toContain("if (editorOpen && rb.notes[sel]) { ownTulip(); added.forEach((name) => canvas.addIcon(mkIcon(name, [0, 0])));"); // onto the editor's own tulip (#943)
    });
    it('shows first in the gallery: re-inserted last, listed newest first', () => {
        expect(js).toContain('delete rb.icons[name]; rb.icons[name] = data;');
        expect(js).toMatch(/const yours = custom\.filter\([\s\S]*?\)\.reverse\(\);/);
    });
});

describe('the vignette', () => {
    it('opens the Icons tab when tapped on the open note', () => {
        // on the press, in the capture phase: picking an icon redraws the vignette, so a click never arrives (#963)
        expect(js).toContain("$('noteCanvas').addEventListener('pointerdown', () => { if (editorOpen && blockTab !== 'icon') { blockTab = 'icon'; renderEditor(); } }, true);");
        expect(js).not.toContain("$('noteCanvas').addEventListener('click'");
    });
});
