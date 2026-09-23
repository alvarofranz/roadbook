import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* Direct-APK page (#540): install without the Play Store. The APK itself ships as a GitHub
   Release asset (built by android-release.yml); the page only needs to exist, load its module
   and resolve the download client-side — plus translated copy like every UI string. */

const read = (p) => fs.readFileSync(p, 'utf8');
const LANGS = ['es', 'it', 'de', 'fr'];

function dictionaries() {
    const window = {};
    for (const lang of LANGS) eval(read(`public/assets/js/i18n.${lang}.js`));
    return window.RBi18nLangs;
}

describe('the apk page exists and loads its module (#540)', () => {
    it('public/apk/ serves a page with a download card and its script', () => {
        const page = read('public/apk/index.html');
        expect(page).toContain('id="apkCard"');
        expect(page).toMatch(/src="apk\.js\?v=/);
        expect(page).toContain('https://rdbk.app/apk/');
    });

    it('lists every build newest first, each with when it was built (#742)', () => {
        const js = read('public/apk/apk.js');
        expect(js).toContain("api('admin_apk_builds'");
        expect(js).toContain('RBFmtDateTime(build.built_at)');
        expect(js).toContain('sha256');
        const php = read('app/admin.php');
        expect(php).toContain("usort($builds, fn($x, $y) => strcmp($y['built_at'], $x['built_at']));");
        expect(php).toContain("'built_at' => (string)($apk['updated_at']");
    });

    it('the page is admin-gated and stays out of the sitemap', () => {
        const page = read('public/apk/index.html');
        expect(page).toContain('noindex');
        expect(page).toContain('id="adminMsg"');
        expect(page).toContain('id="apkBody"');
        const js = read('public/apk/apk.js');
        expect(js).toContain("RBRequireUser($('adminMsg'), { admin: true })");
        expect(read('public/sitemap.xml')).not.toContain('https://rdbk.app/apk/');
    });
});

describe('apk copy is translated (#540)', () => {
    const langs = dictionaries();
    for (const lang of LANGS) {
        it(`${lang} translates the apk strings`, () => {
            for (const k of ['seo.apk.title', 'seo.apk.desc', 'apk.lead', 'apk.download', 'apk.noRelease', 'apk.step1', 'apk.step2', 'apk.step3']) {
                expect(langs[lang][k], `${lang} ${k}`).toBeTruthy();
            }
        });
    }
});
