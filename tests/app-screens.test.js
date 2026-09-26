import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The app screens (#894–#899). */
const read = (p) => fs.readFileSync(p, 'utf8');

describe('the app screens', () => {
    it('the APK page lists only versioned releases', () => {
        expect(read('app/admin.php')).toContain("!preg_match('/^android-\\d+\\.\\d+\\.\\d+$/', (string)($rel['tag_name'] ?? ''))");
        expect(read('public/apk/apk.js')).not.toContain('build.test');
    });
    it('the app home draws my roadbooks as the shared cards', () => {
        expect(read('public/assets/js/home.js')).toContain('mine.slice(0, 6).map((rb) => RBRoadbookCard(rb, {');
        expect(read('app/roadbooks.php')).toContain('rb_card_fields($r) + [\'status\' => $r[\'status\']');
    });
    it('the Recorder starts from one big button after three short points', () => {
        const html = read('public/recorder/index.html');
        expect(html).toContain('<ul class="rec-points">');
        expect(html).toContain('<button class="btn btn-primary rec-start" id="recStart">');
    });
    it('the ways in are one card design across the site: the Editor, the Navigate hub, the app home (#979)', () => {
        expect(read('public/editor/index.html')).toContain('<div class="choice-grid four">');
        expect(read('public/navigate/index.html')).toContain('<nav class="choice-grid"');
        expect(read('public/index.html')).toContain('class="choice-card center compact card-art"');
        expect(read('public/editor/editor.js')).toContain('<div class="choice-grid stack">'); // the Export list, as rows
    });
    it('the brand reaches every surface: one palette, one logo, the same pictures behind the cards', () => {
        const css = read('public/assets/css/app.css'), home = read('public/index.html');
        expect(css).not.toContain(':root:not(.native)'); // no second palette for the browser
        expect(css).toContain('--sand: #ff7a1a;');
        expect(css).not.toMatch(/rgba\(\s*232,\s*176,\s*89/); // the old sand, never hard-coded again
        expect(read('public/assets/js/app.js')).toContain("const brandLogo = 'assets/brand/logo-minimal.webp';");
        expect(home).toContain('<img class="app-logo" src="assets/brand/logo-minimal.webp"');
        // the app home's big action, its tiles and the Navigate hub carry the tool illustrations
        expect(home).toContain('<a class="app-primary card-art" href="recorder/">');
        for (const tool of ['recorder', 'reader', 'editor', 'events']) expect(home).toContain(`<img class="card-art-image" src="assets/brand/tools/${tool}.webp"`);
        for (const tool of ['tripmaster', 'reader']) expect(read('public/navigate/index.html')).toContain(`<img class="card-art-image" src="../assets/brand/tools/${tool}.webp"`);
        // the page intros are no longer web-only
        for (const page of ['roadbooks', 'events']) expect(read(`public/${page}/index.html`)).toContain('<div class="page-intro card-art">');
        expect(read('public/assets/css/web.css')).not.toContain('.page-intro');
    });
    it('the Reader’s two ways in share one row', () => {
        expect(read('public/reader/index.html')).toContain('<div class="btnrow split mt-2">');
        expect(read('public/assets/css/app.css')).toContain('.btnrow.split > .btn { flex: 1 1 0; min-width: 0; justify-content: center; }');
    });
    it('the Tripmaster sits in the middle of a phone screen', () => {
        expect(read('public/tripmaster/index.html')).toContain('body.gps-tool .trip-main { flex: 1 0 auto; width: 100%; display: flex; flex-direction: column; justify-content: center; }');
    });
});
