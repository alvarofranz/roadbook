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

// The bubble's wiring, lifted out of app.js and driven in happy-dom like a finger and a mouse would.
describe('a help tip answers a tap', () => {
    eval(app.match(/\(function helpTips\(\) \{[\s\S]*?\n {4}\}\)\(\);/)[0]);
    const bubble = () => document.querySelector('.tip-bubble');
    const page = document.createElement('main'); document.body.appendChild(page); // the bubble lives beside it, on <body>
    const press = (el, pointerType) => {
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType }));
        el.focus(); // a tap on a button focuses it before the click lands (Android Chrome)
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    };
    it('a tap opens it — its own focus does not get closed by its own click — and a second tap closes it', () => {
        page.innerHTML = '<label>Radius <button class="help-tip" data-tip="How close counts as reached.">i</button></label><input id="other">';
        const tip = document.querySelector('.help-tip');
        press(tip, 'touch');
        expect(bubble().classList.contains('on')).toBe(true);
        expect(bubble().textContent).toBe('How close counts as reached.');
        press(tip, 'touch');
        expect(bubble().classList.contains('on')).toBe(false);
    });
    it('a mouse click keeps the tip hovering already showed, and a click elsewhere closes it', () => {
        page.innerHTML = '<button class="help-tip" data-tip="Shown on hover.">i</button><p id="elsewhere">x</p>';
        const tip = document.querySelector('.help-tip');
        tip.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
        press(tip, 'mouse');
        expect(bubble().classList.contains('on')).toBe(true);
        document.getElementById('elsewhere').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(bubble().classList.contains('on')).toBe(false);
    });
});
