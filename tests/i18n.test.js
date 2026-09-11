import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

/* i18n regression guards (happy-dom env gives us window/document):
   - every data-i18n key the /features/ pages use must be translated in ALL languages
     (the feature pages once shipped fully untranslated — issue we don't want to recur);
   - applying a language and then switching BACK to English must restore the inline English
     source, not stay stuck on the previous translation (the apply() capture/restore bug). */

const LANGS = ['es', 'it', 'de', 'fr'];
const TOOLS = ['recorder', 'editor', 'reader', 'tripmaster', 'ranking'];
const read = (p) => fs.readFileSync(p, 'utf8');

// Every .html under a directory — the runtime dictionaries have to cover all of them.
function htmlPages(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (!['fontawesome', 'icons', 'photos', 'audio', 'avatars', 'event-logos'].includes(e.name)) out.push(...htmlPages(p)); }
        else if (e.name.endsWith('.html')) out.push(p);
    }
    return out;
}
// `data-i18n="End &amp; close"` reaches RBt as `End & close`: the browser decodes the attribute.
const decodeEntities = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// The per-language files attach window.RBi18nLangs.<lang>; eval them in the happy-dom window.
function loadLangs() {
    delete window.RBi18nLangs;
    for (const l of LANGS) eval(read(`public/assets/js/i18n.${l}.js`));
    return window.RBi18nLangs;
}

// Every data-i18n* key used across the feature pages.
function featureKeys() {
    const re = /data-i18n(?:-html|-ph|-title|-aria|-tip)?="([^"]+)"/g;
    const keys = new Set();
    for (const t of TOOLS) {
        const html = read(`public/features/${t}/index.html`);
        let m;
        while ((m = re.exec(html))) keys.add(m[1]);
    }
    return [...keys];
}

describe('feature-page i18n (fp.* keys)', () => {
    const langs = loadLangs();
    const fpKeys = featureKeys().filter((k) => k.startsWith('fp.'));

    it('the feature pages are actually annotated with fp.* keys', () => {
        expect(fpKeys.length).toBeGreaterThan(100);
    });

    for (const lang of LANGS) {
        it(`every feature-page key is translated in ${lang}`, () => {
            const missing = fpKeys.filter((k) => !(k in langs[lang]));
            expect(missing).toEqual([]);
        });
    }
});

describe('i18n cross-language key parity', () => {
    // Every key defined in ANY language must exist in ALL of them — guards key drift,
    // including the apostrophe-variant duplication (straight ' vs typographic ’) that left
    // four strings untranslated in de/fr (#114).
    const langs = loadLangs();
    const union = [...new Set(LANGS.flatMap((l) => Object.keys(langs[l])))];

    for (const lang of LANGS) {
        it(`${lang} defines every key the other languages do`, () => {
            const missing = union.filter((k) => !(k in langs[lang]));
            expect(missing).toEqual([]);
        });
    }
});

describe('i18n — English key parity + all-page data-i18n keys', () => {
    const langs = loadLangs();
    // Also load the English dict (i18n.js attaches window.RBi18nLangs.en)
    loadLangs();
    eval(read('public/assets/js/i18n.js'));
    const enDict = window.RBi18nLangs.en || {};

    it('every English source key is translated in every language', () => {
        const enKeys = Object.keys(enDict);
        expect(enKeys.length).toBeGreaterThan(50);
        for (const lang of LANGS) {
            const missing = enKeys.filter((k) => !(k in langs[lang]));
            expect(missing).toEqual([]);
        }
    });

    // EVERY page, not a hand-kept list: the spec page at /standard/ was fully translated into
    // German and French and left in English for Spanish and Italian for months, because no test
    // ever looked at it (#480). Walking the tree means a new page is covered the day it lands.
    it('every data-i18n key on every page is defined in every language', () => {
        const allKeys = new Set();
        for (const p of htmlPages('public')) {
            for (const m of read(p).matchAll(/data-i18n(?:-html|-ph|-title|-aria|-tip|-content)?="([^"]+)"/g)) {
                allKeys.add(decodeEntities(m[1])); // the attribute is decoded before the key reaches RBt
            }
        }
        expect(allKeys.size).toBeGreaterThan(400);
        for (const lang of LANGS) {
            const missing = [...allKeys].filter((k) => !(k in langs[lang]));
            expect(missing, lang).toEqual([]);
        }
    });
});

describe('i18n apply round-trip', () => {
    beforeAll(() => {
        delete window.RBi18nLangs;
        delete window.RBi18n;
        delete window.RBt;
        for (const l of LANGS) eval(read(`public/assets/js/i18n.${l}.js`));
        eval(read('public/assets/js/i18n.js'));
    });

    it('switching to a language and back to English restores the inline English source', () => {
        // fp.tips lives only in the language files (English is the inline source), so it
        // exercises the capture/restore path that the switch-back-to-English bug broke.
        document.body.innerHTML = '<h2 id="probe" data-i18n="fp.tips">Tips &amp; tricks</h2>';
        const el = document.getElementById('probe');
        const italian = window.RBi18nLangs.it['fp.tips'];
        expect(italian).toBeTruthy();
        expect(italian).not.toBe('Tips & tricks'); // otherwise the test would be vacuous

        window.RBi18n.set('it');
        expect(el.textContent.trim()).toBe(italian);

        window.RBi18n.set('en');
        expect(el.textContent.trim()).toBe('Tips & tricks'); // restored, not stuck on Italian
    });
});

describe('the active language is one answer, not two (#459)', () => {
    // Every page ships `<html lang="en">`, so an attribute-first current() reported English for the
    // whole window before DOMContentLoaded — long enough for the Editor's recovery prompt to render
    // a Spanish sentence next to an American date.
    const src = read('public/assets/js/i18n.js');

    it('current() resolves through the same source as t()', () => {
        expect(src).toContain('t(key) { const v = tr(pickLang(), key);');
        expect(src).toContain('current() { return applied || pickLang(); }');
        expect(src).not.toContain('document.documentElement.lang || pickLang()');
    });

    it('apply() records what it applied, which outlives blocked storage', () => {
        const apply = src.match(/function apply\(lang\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(apply).toContain('applied = lang;');
        expect(apply).toContain("localStorage.setItem('rb_lang', lang)");
    });
});
