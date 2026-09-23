import { describe, it, expect } from 'vitest';

/* German: a roadbook entry is a "Notiz" (plural "Notizen") — "Note" is a musical note or a school grade. */
describe('the German dictionary', () => {
    it('never calls a roadbook note a "Note"', async () => {
        globalThis.window = globalThis.window || globalThis; window.RBi18nLangs = {};
        await import('../public/assets/js/i18n.de.js');
        const bad = Object.entries(window.RBi18nLangs.de).filter(([, v]) => /\bNoten?\b/.test(String(v)));
        expect(bad).toEqual([]);
        expect(window.RBi18nLangs.de.Notes).toBe('Notizen');
    });
});
