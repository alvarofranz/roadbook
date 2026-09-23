import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The run card (#785): made on the device, shown in the report, shared, and attached to the run. */
const read = (p) => fs.readFileSync(p, 'utf8');
const card = read('public/assets/js/run-card.js'), reader = read('public/reader/reader.js'), cover = read('public/assets/js/cover-map.js');

describe('the card itself', () => {
    it('is a 1080×1350 image: the route with its notes, the title, who and when, four figures', () => {
        expect(card).toContain('const W = 1080, H = 1350');
        expect(card).toContain("color: skipped.has(n.num) ? SKIPPED : REACHED");
        for (const label of ["t('Distance')", "t('Time')", "t('Average speed')", "t('Notes reached')"]) expect(card).toContain(label);
    });
    it('keeps a hidden map hidden, and falls back to a tile-less route offline', () => {
        expect(card).toContain("const showMap = meta.map_access !== false && track.length >= 2;");
        expect(card).toContain('Object.assign({}, mapOpts, { tiles: false })');
    });
    it('draws on the shared tile renderer, which now also takes markers and a padded box', () => {
        expect(cover).toContain('window.RBCoverMap = { capture, render };');
        expect(cover).toContain("(opts.markers || []).forEach((m) => dot(at(m.lat, m.lon), m.color, 7));");
        expect(cover).toContain('const z = Math.floor(zoom), n = Math.pow(2, z), tile = 256 * Math.pow(2, zoom - z), world = tile * n;');
    });
});

describe('the report shows, shares and attaches it', () => {
    it('renders it while the report is read and shares it through RBShareFile', () => {
        expect(reader).toContain('const cardP = makeCard(report, user);');
        expect(reader).toContain("$('cardShare').onclick = () => { if (cardBlob) RBShareFile(cardBlob, cardName(),");
        expect(read('public/reader/index.html')).toMatch(/<div id="reportCard" class="report-card" hidden>/);
    });
    it('uploads it to the run once the run is saved on the profile', () => {
        expect(reader).toMatch(/const done = \(saved\) => \{\s*attachCard\(saved\);/);
        expect(reader).toContain("RBUpload({ type: 'run_card', run: String(saved.id) }");
    });
    it('the result QR shares through the same helper', () => {
        expect(reader).toContain("$('qrShare').onclick = async () => RBShareFile(");
        expect(reader).not.toContain('navigator.share(');
    });
});

describe('the server side', () => {
    const runs = read('app/runs.php'), upload = read('public/api/upload.php');
    it('stores it under a name keyed with the app secret, for the runner’s own run only', () => {
        expect(runs).toContain("hash_hmac('sha256', 'run-card:' . $id, (string)$CFG['app_secret'])");
        expect(upload).toMatch(/if \(\$type === 'run_card'\) \{\s*run_owned\(\$user, \$runId = \(int\)\(\$_POST\['run'\] \?\? 0\)\);/);
    });
    it('hands it out with its run on the profile, and deletes it with the run', () => {
        expect(runs).toContain("'card' => run_card_url((int)$r['id'])");
        expect(runs).toContain('@unlink(run_card_path($id));');
        expect(read('public/assets/js/profile-page.js')).toContain('data-share-card=');
    });
});

describe('RBShareFile', () => {
    it('uses the native sheet in the app, Web Share where it can share files, a download otherwise', () => {
        const app = read('public/assets/js/app.js');
        expect(app).toContain('window.RBShareFile = async (blob, filename, text) => {');
        expect(read('native/src/native.js')).toContain('async shareFile(blob, filename, text) {');
    });
});

describe('the run’s shareable page (#803)', () => {
    const page = read('public/run/index.php');
    it('is rendered on the server with the card as og:image, for public runs only', () => {
        expect(page).toContain("WHERE ru.id = ? AND ru.is_public = 1 AND u.blocked = 0");
        expect(page).toContain('<meta property="og:image" content="<?= $h($image) ?>">');
        expect(page).toContain("$image = $card ? $base . $card : $base . '/assets/mockup.png';");
        expect(page).toContain('if (!$run) http_response_code(404);');
        expect(read('public/.htaccess')).toContain('RewriteRule ^run/([0-9]+)$ /run/index.php?id=$1 [L]');
    });
    it('is what Share sends once the run is public, from the report and the profile', () => {
        expect(reader).toContain("if (saved.is_public) cardLink = RBPublicLink('/run/' + saved.id);");
        expect(read('public/assets/js/profile-page.js')).toContain("RBPublicLink('/run/' + b.dataset.runId)");
    });
});
