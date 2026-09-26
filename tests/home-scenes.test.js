import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const home = readFileSync('public/assets/js/home.js', 'utf8');
const html = readFileSync('public/index.html', 'utf8');

function openHome(native = false) {
    document.body.innerHTML = html.match(/<main>([\s\S]*?)<\/main>/)[1];
    document.getElementById('galleryGrid').remove();
    vi.stubGlobal('RBIsNativeApp', () => native);
    vi.stubGlobal('RB_ROOT', 'https://example.test/roadbook/');
    eval(home);
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
});

describe('home adventure scenes', () => {
    it('switches each landscape from a nested icon and exposes exactly one pressed button', () => {
        openHome();
        for (const scene of ['moto', 'bike', 'offroad']) {
            const button = document.querySelector(`[data-scene="${scene}"]`);
            button.querySelector('i').click();
            expect(document.getElementById('adventureImage').src).toBe(`https://example.test/roadbook/assets/brand/${scene}.webp`);
            expect([...document.querySelectorAll('[data-scene][aria-pressed="true"]')]).toEqual([button]);
        }
    });

    it('ignores clicks on the group itself', () => {
        openHome();
        const image = document.getElementById('adventureImage');
        const original = image.src;
        document.querySelector('.scene-selector').click();
        expect(image.src).toBe(original);
    });

    it('does not attach the marketing interaction inside the native app', () => {
        openHome(true);
        document.querySelector('[data-scene="bike"]').click();
        expect(document.querySelector('[data-scene="offroad"]').getAttribute('aria-pressed')).toBe('true');
    });
});
