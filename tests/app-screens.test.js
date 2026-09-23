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
        expect(read('app/roadbooks.php')).toContain('rb_card_fields($r) + [\'category\' => $r[\'category\'], \'status\' => $r[\'status\']');
    });
    it('the Recorder starts from one big button after three short points', () => {
        const html = read('public/recorder/index.html');
        expect(html).toContain('<ul class="rec-points">');
        expect(html).toContain('<button class="btn btn-primary rec-start" id="recStart">');
    });
    it('the Editor’s odd last way to start spans the width on a phone', () => {
        expect(read('public/editor/index.html')).toContain('.load-opts > :last-child:nth-child(odd) { grid-column: 1 / -1; }');
    });
    it('the Reader’s two ways in share one row', () => {
        expect(read('public/reader/index.html')).toContain('<div class="btnrow split mt-2">');
        expect(read('public/assets/css/app.css')).toContain('.btnrow.split > .btn { flex: 1 1 0; min-width: 0; justify-content: center; }');
    });
    it('the Tripmaster sits in the middle of a phone screen', () => {
        expect(read('public/tripmaster/index.html')).toContain('body.gps-tool .trip-main { flex: 1 0 auto; width: 100%; display: flex; flex-direction: column; justify-content: center; }');
    });
});
