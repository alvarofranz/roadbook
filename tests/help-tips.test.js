import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* Field help (#859): one bubble, above its ⓘ, always inside the screen. */
const app = fs.readFileSync('public/assets/js/app.js', 'utf8');
const css = fs.readFileSync('public/assets/css/app.css', 'utf8');

describe('help tips', () => {
    it('share one bubble fixed to the viewport, so no panel can clip it', () => {
        expect(css).toMatch(/\.tip-bubble \{ position: fixed;/);
        expect(css).not.toMatch(/\.help-tip::after/);
    });
    it('open above the ⓘ — below only without room — and stay 8 px inside the screen', () => {
        expect(app).toContain('const top = r.top - b.height - gap >= edge ? r.top - b.height - gap : r.bottom + gap;');
        expect(app).toContain('const left = Math.min(Math.max(edge, r.left + r.width / 2 - b.width / 2), window.innerWidth - b.width - edge);');
    });
});
