import { describe, it, expect } from 'vitest';
import fs from 'fs';
import RB from '../public/assets/js/roadbook-core.js';
import RBZip from '../public/assets/js/rbzip.js';

/* The .rdbk 1 standard everywhere it is read or written (#986): one validator for the Reader, the
   Editor, the validator page and the server's own check; the container and its media; the pages. */
const read = (p) => fs.readFileSync(p, 'utf8');
const doc = () => RB.writeRoadbook(RB.buildRoadbook({ name: 'Loop', trkpts: [{ lat: 45, lon: 9 }, { lat: 45, lon: 9.001 }, { lat: 45.001, lon: 9.002 }], wpts: [] }));

describe('the container', () => {
    it('inspect tells what a file holds before anyone judges it, and readBundle hands over the document', async () => {
        const zip = await RBZip.write({ 'roadbook.json': JSON.stringify(doc()), 'media.json': JSON.stringify({ photos: [{ file: 'photos/a.jpg', lat: 45, lon: 9 }] }), 'photos/a.jpg': new Uint8Array([1, 2, 3]) });
        const f = await RBZip.inspect(new File([zip], 'x.rdbk'));
        expect(f.container).toBe('zip');
        expect(f.names.sort()).toEqual(['media.json', 'photos/a.jpg', 'roadbook.json']);
        expect(RB.validateRoadbook(f.doc).valid).toBe(true);
        expect(RB.validateMedia(f.manifest, f.names)).toEqual({ valid: true, errors: [], warnings: [] });
        const b = await RBZip.readBundle(new File([zip], 'x.rdbk'));
        expect(b.roadbook.rdbk_version).toBe(1);
        expect(b.media).toEqual([expect.objectContaining({ type: 'photo', name: 'a.jpg', lat: 45, lon: 9 })]);
    });
    it('a bare roadbook.json is read too; a broken one says why', async () => {
        const ok = await RBZip.inspect(new File([JSON.stringify(doc())], 'x.json'));
        expect(ok.container).toBe('json');
        expect(ok.doc.meta.title).toBe('Loop');
        const bad = await RBZip.inspect(new File(['{not json'], 'x.json'));
        expect(bad.doc).toBeNull();
        expect(bad.docError).toBe('roadbook.json is not valid JSON.');
    });
    it('media.json names only entries the ZIP holds; an unlisted photo has no position', () => {
        const r = RB.validateMedia({ photos: [{ file: 'photos/missing.jpg' }, { file: 'elsewhere.jpg' }] }, ['roadbook.json', 'photos/b.jpg']);
        expect(r.errors.map((e) => e.path)).toEqual(['media.json.photos[0].file', 'media.json.photos[1].file']);
        expect(r.warnings).toEqual([{ path: 'photos/b.jpg', message: 'Not listed in media.json: it has no position.' }]);
    });
});

describe('the validator page', () => {
    const page = read('public/validator/index.html'), js = read('public/validator/validator.js');
    it('judges with the functions every surface reads a roadbook with, on the device', () => {
        expect(js).toContain('await RBZip.inspect(file)');
        expect(js).toContain('RB.validateRoadbook(f.doc)');
        expect(js).toContain('RB.validateMedia(f.manifest, f.names)');
        expect(js).not.toMatch(/RBApi|RBUpload|fetch\(/); // nothing leaves the device
        expect(page).toContain('<script src="../assets/js/rbzip.js');
    });
    it('is linked from the standard’s landing and the sitemap, not the footer', () => {
        expect(read('public/assets/js/app.js')).not.toContain("path: 'validator/'");
        expect(read('public/standard/index.html')).toContain('<a class="btn btn-primary" href="../validator/" data-i18n="Validate a .rdbk">');
        expect(read('public/sitemap.xml')).toContain('https://rdbk.app/validator/');
    });
});

describe('the Editor writes only what the validator accepts', () => {
    const editor = read('public/editor/editor.js');
    it('saving and exporting go through the same judged document', () => {
        expect(editor).toContain('const doc = RB.writeRoadbook(rb), report = RB.validateRoadbook(doc);');
        expect(editor).toContain("roadbook: doc });");
        expect(editor).toContain("const files = { 'roadbook.json': JSON.stringify(doc) };");
    });
    it('a recording draft with no route yet opens as a new roadbook under its title', () => {
        expect(editor).toContain('RB.newRoadbook(r.title, [], [])');
    });
});

describe('the server keeps the standard too', () => {
    const php = read('app/roadbooks.php');
    it('refuses what is not a .rdbk 1 document and computes the length itself', () => {
        expect(php).toContain("if (!rb_valid_document($rb)) fail('This file is not a valid .rdbk roadbook.');");
        expect(php).toContain("if (!is_array($rb) || ($rb['rdbk_version'] ?? null) !== 1) return false;");
        expect(php).toContain('$dist = rb_track_length($rb[\'track\']);');
        expect(php).toContain('2 * 6371000 * asin(min(1, sqrt($h)))'); // the same sphere as RB.geo.haversineM
        expect(php).not.toContain("meta']['category'");
    });
    it('a draft without a file has no document', () => {
        expect(php).toContain("if ($row['filename'] === 'pending') return null;");
    });
});

describe('the PDF generator (#973)', () => {
    const pdf = read('public/assets/js/rb-pdf.js');
    it('the image it changes is the roadbook’s own, and the Map choice shows the map it will print', () => {
        expect(pdf).not.toContain('For this PDF only.');
        expect(pdf).toContain("d.q('[data-pick-image]').hidden = backdrop !== 'image' || !opts.onImage;");
        expect(pdf).toContain('coverMap(rb).then((m) => { map = m;');
        expect(pdf).toContain('backdrop, image, map });');
    });
});

describe('the contact page', () => {
    const page = read('public/contact/index.html');
    it('the privacy line right under the form, and the six topics in two full rows', () => {
        expect(page).not.toContain('contact.h.email');
        expect(page).toContain('<p class="contact-legal" data-i18n-html="contact.more">');
        expect(page).toContain('@media (min-width: 620px) { .contact-topics { grid-template-columns: repeat(auto-fit, minmax(min(100%, max(8em, 30%)), 1fr)); } }');
        expect(page.match(/name="topic" value=/g)).toHaveLength(6);
    });
});
