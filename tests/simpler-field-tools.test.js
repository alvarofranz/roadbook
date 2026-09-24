import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { execSync } from 'child_process';

/* The field tools, simpler (#932 · #933 · #936): no fullscreen mode, no page zoom, one way out of a
   run, and every file the app makes handed to the OS share sheet. */
const read = (p) => fs.readFileSync(p, 'utf8');
const firstParty = execSync("git ls-files 'public/*.html' 'public/*.js' 'public/*.css'").toString().trim().split('\n')
    .filter((f) => !/\.min\.js$|native\.bundle\.js$|i18n(\.\w+)?\.js$/.test(f));

describe('no fullscreen mode anywhere (#932)', () => {
    it('leaves no Fullscreen API call, toggle or class behind', () => {
        for (const f of firstParty) {
            const src = read(f);
            expect(src, f).not.toMatch(/requestFullscreen|exitFullscreen|RBFullscreen|rb-fs\b|fa-expand/);
        }
    });
});

describe('no page zoom, only the maps zoom (#933)', () => {
    it('locks the scale on every page', () => {
        for (const f of firstParty.filter((x) => x.endsWith('.html'))) {
            const meta = read(f).match(/<meta name="viewport" content="([^"]*)">/);
            expect(meta, f).not.toBeNull();
            expect(meta[1], f).toContain('maximum-scale=1');
            expect(meta[1], f).toContain('user-scalable=no');
        }
    });
    it('drops the double-tap zoom and refuses the iOS pinch outside a map', () => {
        expect(read('public/assets/css/app.css')).toContain('* { touch-action: manipulation; }');
        expect(read('public/assets/js/app.js')).toContain("document.addEventListener('gesturestart', (e) => { if (!(e.target.closest && e.target.closest('.maplibregl-map'))) e.preventDefault(); }, { passive: false });");
    });
});

describe('the Reader in navigation (#936)', () => {
    const html = read('public/reader/index.html'), js = read('public/reader/reader.js');
    it('has no title row: the dashboard is the first row', () => {
        for (const id of ['navTitle', 'odoLogo', 'odo-toprow']) expect(html + js, id).not.toContain(id);
    });
    it('has one way out, Finish — no Leave, no GPX toggle', () => {
        expect(html).not.toContain('id="endBtn"');
        expect(html).not.toContain('id="navGpx"');
        const bar = html.match(/<nav class="fabrow">([\s\S]*?)<\/nav>/)[1];
        expect([...bar.matchAll(/id="(\w+)"/g)].map((m) => m[1])).toEqual(['autoBtn', 'mapBtn', 'pauseBtn', 'finishBtn']);
    });
    it('lays the bar out as two rows of two, Auto taking its row when there is no map', () => {
        const css = read('public/assets/css/app.css');
        expect(css).toMatch(/\.fabrow \{[^}]*display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
        expect(css).toContain('.fabrow:has(#mapBtn[hidden]) #autoBtn { grid-column: 1 / -1; }');
    });
});

describe('every file the app makes goes to the share sheet', () => {
    it('RBDownload in the app is the OS share sheet, like the PDF', () => {
        const app = read('public/assets/js/app.js');
        expect(app).toContain('if (isNativeApp()) return nativeShare(data, filename);');
        expect(app).toContain('await native.shareFile(blob, filename, text);');
        const bridge = read('native/src/native.js');
        expect(bridge).not.toContain('downloadFile');
        expect(bridge).not.toContain('FileSharer');
        expect(JSON.parse(read('package.json')).dependencies).not.toHaveProperty('@capgo/capacitor-file-sharer');
    });
    it('no GPX log asks anything before it starts', () => {
        const gpx = read('public/assets/js/gpx-recorder.js');
        expect(gpx).not.toMatch(/function settings\(/);
        expect(gpx).toContain('SAMPLE_MS = 2000');
        for (const page of ['public/recorder/recorder.js', 'public/tripmaster/tripmaster.js', 'public/reader/reader.js']) expect(read(page), page).not.toContain('RBGpxRecorder.settings');
    });
});
