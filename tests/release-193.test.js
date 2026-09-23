import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The 1.9.3 fixes that live in PHP, CSS or configuration — pinned in the source, like the rest of
   the suite pins PHP (there is no PHP harness in CI, #327). */
const read = (p) => fs.readFileSync(p, 'utf8');

describe('account emails (#748)', () => {
    const mail = read('app/mail.php'), auth = read('app/auth.php'), account = read('public/account/account.js');
    it('use one table-based template with inline styles', () => {
        expect(mail).toContain('function mail_account(');
        expect(mail).toContain('<table role="presentation"');
        expect(mail).not.toContain('function mail_html(');
        expect(auth).not.toMatch(/mail_html|mail_button/);
    });
    it('speak every UI language, for every kind, with an English fallback', () => {
        const table = mail.slice(mail.indexOf('const MAIL_TEXT'), mail.indexOf('function mail_t('));
        const keys = [...table.matchAll(/'([a-z.]+)' => \[([^\]]*)\]/g)];
        expect(keys.length).toBeGreaterThan(15);
        for (const [, key, langs] of keys) for (const l of ['en', 'es', 'it', 'de', 'fr']) expect(langs, key + ' ' + l).toContain(`'${l}' =>`);
        for (const kind of ['verify', 'reset', 'change']) expect(auth).toContain(`mail_account('${kind}', $lang`);
    });
    it('are written in the language the user is using the site in', () => {
        expect(account.match(/lang: RBi18n\.current\(\)/g)).toHaveLength(3);
    });
});

describe('voice transcription can fetch its model (#746)', () => {
    it('lets the Hugging Face CDN through the CSP', () => {
        const csp = read('public/.htaccess').match(/connect-src[^;]*/)[0];
        for (const host of ['https://huggingface.co', 'https://*.huggingface.co', 'https://*.hf.co']) expect(csp).toContain(host);
    });
});

describe('map pins survive the terrain loading late (#741)', () => {
    it('re-evaluates marker occlusion once the DEM tiles are in', () => {
        const map = read('public/assets/js/rbmap.js');
        expect(map).toMatch(/e\.sourceId !== 'rb-dem'[\s\S]{0,160}m\.once\('idle', \(\) => \{ pending = false; m\.fire\('move'\); \}\)/);
    });
});

describe('the events gallery (#745)', () => {
    const php = read('app/events.php'), js = read('public/events/events.js');
    it('lists upcoming events first, soonest first, and past ones last', () => {
        expect(php).toMatch(/function events_public_list[\s\S]*usort/);
    });
    it('badges each event with the vehicles of its roadbooks', () => {
        expect(php).toContain('RB_VEHICLES');
        expect(js).toContain('RBVehicleIcons(e.vehicles)');
    });
});

describe('the Editor groups the note blocks (#747)', () => {
    it('frames the Extras apart from Note and Icon', () => {
        const editor = read('public/editor/editor.js');
        expect(editor).toContain('<div class="kind-group extras"><span class="kind-group-label">');
        expect(read('public/editor/index.html')).toContain('.kind-group-label');
    });
});

describe('a new account is asked where it rides (#749)', () => {
    const app = read('public/assets/js/app.js');
    it('asks once, only when no default location is set, and remembers "Not now"', () => {
        expect(app).toContain('if (user && !participant && !cfg.offline) askForLocation(user);');
        expect(app).toMatch(/user\.default_lat != null \|\| localStorage\.getItem\(key\)\) return;/);
        expect(app).toContain("dialog.q('[data-act=\"later\"]').onclick = () => { remember(); dialog.close(); };");
    });
    it('stays off the account page, full-screen tools and other dialogs', () => {
        expect(app).toMatch(/\\\/account\\\/\?\$\/\.test\(location\.pathname\) \|\| document\.body\.classList\.contains\('rb-immersive'\) \|\| document\.querySelector\('\.modal'\)/);
        expect(read('public/account/index.html')).toContain('id="defaultLocation"');
    });
});

describe('small fixes (#744 · #750)', () => {
    it('keeps the label editor’s buttons inside the window', () => {
        expect(read('public/assets/css/app.css')).toContain('.i18ne-list { max-height: calc(80vh - 13rem)');
    });
    it('says "Scarica da" on the Italian App Store badge', () => {
        const it = read('public/assets/js/i18n.it.js');
        expect(it).toContain('"Download on the": "Scarica da"');
        expect(it).not.toContain('Scarica su');
    });
});
