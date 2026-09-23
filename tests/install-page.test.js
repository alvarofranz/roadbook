import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* Install guide (#333). The page is per-device UI a unit test can't click through, but the two ways
   it silently breaks ARE checkable: a step string added in English and forgotten in the other
   languages (the visitor gets English instructions for their phone), and a platform key that no
   longer matches what RBDevice() returns (no card is detected, so the page opens with everything
   collapsed and nothing highlighted). */

const LANGS = ['es', 'it', 'de', 'fr'];
const read = (p) => fs.readFileSync(p, 'utf8');
const installJs = read('public/install/install.js');
const installHtml = read('public/install/index.html');
const appJs = read('public/assets/js/app.js');

// Every English string the page hands to RBt: the platform steps plus the literal t('…') calls.
function translatedStrings() {
    const strings = new Set();
    for (const block of installJs.match(/steps: \[([\s\S]*?)\],/g) || []) {
        for (const m of block.matchAll(/'((?:[^'\\]|\\.)*)'/g)) strings.add(m[1].replace(/\\'/g, "'"));
    }
    for (const m of installJs.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)) strings.add(m[1].replace(/\\'/g, "'"));
    return [...strings];
}

function loadLangs() {
    delete window.RBi18nLangs;
    for (const lang of LANGS) eval(read(`public/assets/js/i18n.${lang}.js`));
    return window.RBi18nLangs;
}

describe('install guide', () => {
    it('offers a card for every device RBDevice() can report', () => {
        const detected = [...appJs.matchAll(/RBDevice = \(\) => \((.*)\);/g)][0][1];
        const reported = ['ios', 'android', 'desktop'].filter((d) => detected.includes(`'${d}'`));
        expect(reported.sort()).toEqual(['android', 'desktop', 'ios']);
        const cards = [...installJs.matchAll(/key: '(\w+)'/g)].map((m) => m[1]);
        expect(cards.sort()).toEqual(reported.sort());
    });

    it('renders into the container the page provides', () => {
        expect(installJs).toContain("getElementById('installCards')");
        expect(installHtml).toContain('id="installCards"');
    });

    it('every instruction and label is translated in every language', () => {
        const langs = loadLangs();
        const strings = translatedStrings();
        expect(strings.length).toBeGreaterThan(12);           // the three step lists + the labels
        for (const lang of LANGS) {
            const missing = strings.filter((s) => !(s in langs[lang]));
            expect(missing, lang).toEqual([]);
        }
    });

    it('the page keys the wiki/SEO strings share are translated too', () => {
        const langs = loadLangs();
        const keys = [...installHtml.matchAll(/data-i18n(?:-html|-content)?="([^"]+)"/g)].map((m) => m[1]);
        expect(keys.length).toBeGreaterThan(3);
        for (const lang of LANGS) {
            expect(keys.filter((k) => !(k in langs[lang])), lang).toEqual([]);
        }
    });

    it('the Install chip always opens the guide (#720) — which offers the one-tap prompt itself', () => {
        expect(read('public/install/install.js')).toContain('RBInstallPrompt.fire()');
    });
});

describe('the install guide shows everything open (#794)', () => {
    it('has no accordion: every device card is on the page, the detected one first', () => {
        expect(installJs).not.toMatch(/<details|<summary/);
        expect(installJs).toContain('const ordered = PLATFORMS.filter((p) => p.key === here).concat(PLATFORMS.filter((p) => p.key !== here));');
    });
    it('offers the apps with the home’s own store badges', () => {
        expect(installJs).toContain('${RBGetAppHTML(false)}');
        expect(installJs).not.toContain('RBStore.');
    });
});
