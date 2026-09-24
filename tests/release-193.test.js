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

describe('the CSP lets through no speech-model host (#746 · #767)', () => {
    it('lets no model host and no WASM through the CSP', () => {
        const csp = read('public/.htaccess').match(/Content-Security-Policy "([^"]*)"/)[1];
        for (const host of ['huggingface', 'hf.co', 'wasm-unsafe-eval']) expect(csp).not.toContain(host);
    });
});

describe('map pins survive the terrain loading late (#741)', () => {
    it('re-evaluates marker occlusion once the DEM tiles are in', () => {
        const map = read('public/assets/js/rbmap.js');
        expect(map).toMatch(/e\.sourceId !== 'rb-dem'[\s\S]{0,160}m\.once\('idle', \(\) => \{ demPending = false; m\.fire\('move'\); \}\)/);
    });
    it('listens once, not once more on every style switch', () => {
        const map = read('public/assets/js/rbmap.js');
        const terrain = map.slice(map.indexOf('    _terrain() {'), map.indexOf('    _init() {'));
        expect(terrain).not.toContain("m.on('sourcedata'");
        expect(map.match(/m\.on\('sourcedata'/g)).toHaveLength(1);
    });
});

describe('the events gallery (#745)', () => {
    const php = read('app/events.php'), js = read('public/events/events.js');
    it('lists upcoming events first, soonest first, and past ones last', () => {
        expect(php).toMatch(/function events_public_list[\s\S]*usort/);
    });
    it('badges each event with the vehicles of its roadbooks', () => {
        expect(php).toContain('RB_VEHICLES');
        expect(js).toContain('RBEventCard(e)');
        expect(fs.readFileSync('public/assets/js/app.js', 'utf8')).toContain('[null, RBVehicleIcons(e.vehicles)]');
    });
});

describe('the Editor groups the note blocks (#747)', () => {
    it('frames Note + Icon left and the material right, on one row, with no label', () => {
        const editor = read('public/editor/editor.js'), html = read('public/editor/index.html');
        expect(editor.match(/<div class="kind-group">/g)).toHaveLength(2);
        expect(html).toContain('.kind-tabs { justify-content: space-between; }');
    });
    it('shows no counters: material the note carries is lit in sand instead', () => {
        const editor = read('public/editor/editor.js'), html = read('public/editor/index.html');
        expect(editor).toContain("${has ? ' has' : ''}");
        expect(html).toContain('.kind-tab.has:not(.on) { border-color: var(--sand); color: var(--sand); }');
    });
    it('draws no frame around the groups', () => {
        expect(read('public/editor/index.html')).toContain('.kind-group { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; }');
    });
    it('calls the big-text block a Heading', () => {
        expect(read('public/assets/js/roadbook-core.js')).toContain("{ id: 'text',  name: 'Heading', icon: 'fa-heading' }");
    });
});

describe('a new account is asked where it rides (#749)', () => {
    const app = read('public/assets/js/app.js');
    it('asks once, only when no default location is set, and remembers being left unanswered', () => {
        expect(app).toContain('if (user && !participant && !cfg.offline) askForLocation(user);');
        expect(app).toMatch(/user\.default_lat != null \|\| localStorage\.getItem\(key\)\) return;/);
        expect(app).toContain("</div>`, 'narrow', () => remember());"); // its corner close (or Escape / the backdrop) is the "not now"
        expect(app).not.toContain('data-act="later"');
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
    });
});
