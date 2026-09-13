import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The About page tells a user what this copy of RDBK.app IS and what changed in each release
   (#478). Both answers are DATA — version.json and changelog.js — so they go stale in exactly
   the ways a static check catches: a release that never documented itself, an entry with no
   date, a note nobody translated. */

const read = (p) => fs.readFileSync(p, 'utf8');
const LANGS = ['es', 'it', 'de', 'fr'];

// changelog.js is a browser global; eval it with a window to get the array back.
function changelog() {
    const window = {};
    // eslint-disable-next-line no-eval
    eval(read('public/assets/js/changelog.js'));
    return window.RBChangelog;
}

// The per-language dictionaries, loaded the way the pages load them.
function dictionaries() {
    const window = {};
    for (const lang of LANGS) eval(read(`public/assets/js/i18n.${lang}.js`));
    return window.RBi18nLangs;
}

const asNumbers = (version) => version.split('.').map(Number);
const isNewer = (a, b) => { // a strictly after b
    const [x, y] = [asNumbers(a), asNumbers(b)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
    return false;
};

describe('the release notes are a usable list (#478)', () => {
    const releases = changelog();

    it('is not empty and reads newest first', () => {
        expect(releases.length).toBeGreaterThan(5);
        for (let i = 1; i < releases.length; i++) {
            expect(isNewer(releases[i - 1].version, releases[i].version), `${releases[i - 1].version} must be newer than ${releases[i].version}`).toBe(true);
        }
    });

    it('every entry carries a semver, a real date, a headline and something that changed', () => {
        for (const rel of releases) {
            expect(rel.version, JSON.stringify(rel)).toMatch(/^\d+\.\d+\.\d+$/);
            expect(rel.date, rel.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(Number.isNaN(Date.parse(rel.date)), rel.version).toBe(false);
            expect(rel.title.length, rel.version).toBeGreaterThan(10);
            expect(rel.items.length, rel.version).toBeGreaterThan(0);
            for (const item of rel.items) expect(item.length, rel.version).toBeGreaterThan(10);
        }
    });

    it('documents the release that is actually shipping', () => {
        // A semver bump without its entry would ship a "What's new" that never mentions what is
        // new. The build number moves on its own with every stamp, so only the version is pinned.
        const live = JSON.parse(read('public/version.json'));
        expect(releases[0].version).toBe(live.version);
    });

    it('is translated into every language, like the rest of the UI', () => {
        const langs = dictionaries();
        for (const lang of LANGS) {
            const missing = releases.flatMap((rel) => [rel.title, ...rel.items]).filter((s) => !(s in langs[lang]));
            expect(missing, lang).toEqual([]);
        }
    });
});

describe('the About page keeps the app panel and teasers the changelog (#478)', () => {
    const html = read('public/about/index.html');
    const js = read('public/about/about.js');

    it('ships the page module and anchors the app panel', () => {
        expect(html).toMatch(/src="about\.js\?v=/);
        expect(html).toContain('id="appFacts"');
    });

    it('links the dedicated changelog page instead of embedding the list', () => {
        expect(html).toContain('id="changelog"');           // old /about/#changelog bookmarks still land here
        expect(html).toContain('href="../changelog/"');
        expect(html).not.toContain('id="relList"');
        expect(html).not.toMatch(/changelog\.js\?v=/);
        expect(read('public/assets/js/app.js')).toContain('ROOT}changelog/');
        expect(read('public/assets/js/app.js')).not.toContain('about/#changelog');
    });

    it('asks the shared helpers what this copy is, instead of fetching version.json again', () => {
        expect(js).toContain('RBRunningRelease()');
        expect(js).toContain('RBLiveVersion()');
        expect(js).toContain('RBPlatformName()');
        expect(js).not.toContain('version.json');
        expect(js).not.toContain('relList');
    });
});

describe('the changelog page renders the release list', () => {
    const html = read('public/changelog/index.html');
    const js = read('public/changelog/changelog.js');

    it('ships the changelog data and the page module', () => {
        expect(html).toMatch(/src="\.\.\/assets\/js\/changelog\.js\?v=/);
        expect(html).toMatch(/src="changelog\.js\?v=/);
    });

    it('anchors the release list', () => {
        expect(html).toContain('id="relList"');
        expect(html).toContain('id="relMore"');
    });

    it('translates the notes it renders, and re-renders on a language switch', () => {
        expect(js).toContain('t(rel.title)');
        expect(js).toContain('t(item)');
        expect(js).toContain("addEventListener('rb-lang'");
    });
});

describe('one place reads a version.json (#478)', () => {
    const app = read('public/assets/js/app.js');

    it('RBLiveVersion is that place, and it never reads a cache', () => {
        expect(app).toContain("window.RBLiveVersion = async (root) => {");
        expect(app).toContain("cache: 'no-store'");
        // every other reader of it goes through the helper: one string literal, one fetch
        expect(app.match(/'version\.json'/g).length).toBe(1);
    });
});
