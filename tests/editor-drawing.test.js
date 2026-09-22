import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('editor map modes M · N · P · D (#692)', () => {
    const editor = fs.readFileSync('public/editor/editor.js', 'utf8');
    const html = fs.readFileSync('public/editor/index.html', 'utf8');

    it('every mode has its mnemonic key and its button in the bottom-left rail', () => {
        for (const [tool, key] of [['points', 'M'], ['note', 'N'], ['point', 'P'], ['draw', 'D']]) {
            expect(html).toMatch(new RegExp(`data-tool="${tool}"[^>]*>[\\s\\S]*?<kbd class="key-chip">${key}</kbd>`));
        }
        expect(html).toContain('class="mode-rail"');
        expect(editor).toContain("const MODE_KEYS = { m: 'points', n: 'note', p: 'point', d: 'draw', c: 'cut' };");
    });

    it('P inserts points into the existing track; D adds new points with taps (#712)', () => {
        expect(editor).toContain("if (mapTool === 'point') addPointAtExact(here);");
        expect(editor).toContain("else if (mapTool === 'draw') extendRoute(here);");
        expect(editor).toContain("const modeAvailable = (tool) => !readOnly() && (tool === 'draw' || !!(rb && rb.track.length >= 2));");
    });

    it('no mode takes the drag away from the map: there is no freehand stroke (#712)', () => {
        expect(editor).not.toContain('dragPan.disable');
        expect(editor).not.toContain('normalizeStroke');
    });

    it('the context-menu keys speak the same letters as the modes', () => {
        expect(editor).toContain("label: 'Turn this point into a note', key: 'N'");
        expect(editor).toContain("label: 'Add track point here', key: 'P'");
        expect(editor).not.toContain("key: 'W'");
        expect(editor).not.toContain("key: 'L'");
    });

    it('Esc closes the open context menu instead of leaving it hanging', () => {
        expect(editor).toMatch(/k === 'escape'[^]*?closeCtxMenu\(\)/);
    });
});
