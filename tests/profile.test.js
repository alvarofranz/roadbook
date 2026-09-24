import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* Public profiles and the account settings (#619 · #620 · #629 · #631 · #632 · #671 · #672). */
const read = (p) => fs.readFileSync(p, 'utf8');
const app = read('public/assets/js/app.js');
const page = read('public/assets/js/profile-page.js');

describe('the public profile (#620)', () => {
    it('is served at /u/<username> with its own rewrite (usernames may contain a dot)', () => {
        expect(read('public/.htaccess')).toContain('RewriteRule ^u/[A-Za-z0-9_.-]+$ /u/index.html [L]');
    });
    it('keeps its script outside /u/, where any file name could be a username', () => {
        expect(read('public/u/index.html')).toContain('<script src="/assets/js/profile-page.js');
        expect(fs.existsSync('public/u/u.js')).toBe(false);
    });
    it('links profiles the same way everywhere (the app takes ?name=)', () => {
        expect(app).toContain("window.RBProfileLink = (username) => (isNativeApp() ? ROOT + 'u/?name=' : ROOT + 'u/') + encodeURIComponent(username || '');");
        for (const p of ['public/challenge/challenge.js', 'public/event/event.js', 'public/reader/reader.js']) expect(read(p), p).toContain('RBProfileLink(');
    });
    it('the owner can publish, hide and delete a run — the delete confirm names it', () => {
        expect(page).toContain("RBApi('run_update', { id, is_public: isPublic ? 1 : 0 })");
        expect(page).toContain("t('Delete this run?') + '<br><b>' + esc(r.title) + '</b> · '");
    });
});

describe('account settings', () => {
    const html = read('public/account/index.html');
    const js = read('public/account/account.js');
    it('run reports have a standing choice (#619)', () => {
        expect(html).toMatch(/<select id="pfRunsVis"[\s\S]*value="ask"[\s\S]*value="public"[\s\S]*value="private"/);
        expect(js).toContain("api('runs_settings', { runs_visibility: $('pfRunsVis').value })");
    });
    it('has no voice-note language: nothing dictates or transcribes any more (#773)', () => {
        expect(html + js).not.toMatch(/pfVoiceLang|voice_lang/);
        expect(read('app/auth.php')).not.toContain('voice_lang');
    });
    it('one sign-out, toasts for every save, palette colours (#631)', () => {
        expect(js).toContain("$('logoutBtn').onclick = RBSignOut;");
        expect(app).toContain("on('Logout', RBSignOut);");
        expect(js).not.toMatch(/msg\('Profile saved|msg\('Photo updated/);
        expect(js).not.toContain('#e8b059');
    });
    it('role badges are the shared .u-badge (#632)', () => {
        expect(js).toContain('<span class="u-badge ${g.cls}">');
        expect(html).not.toContain('grant-badge');
    });
});

describe('the account menu', () => {
    it('reaches public roadbooks, with Help at the foot next to App Info (#671 · #672 · #743)', () => {
        expect(app).toContain("menuLabel('fa-book-open', 'Public roadbooks')");
        // the foot of the menu: Help, App Info, Sign out (#977)
        expect(app).toMatch(/<div class="acc-foot">\s*<a href="\$\{ROOT\}wiki\/">\$\{menuLabel\('fa-circle-question', 'Help'\)\}<\/a>\s*<button id="\$\{p\}AppInfo">/);
        expect(app).not.toContain('admin/roadbooks');
        expect(app).not.toContain('Wiki / Guida');
    });
});

describe('your own public profile (#777)', () => {
    it('calls your public roadbooks yours', () => {
        const page = fs.readFileSync('public/assets/js/profile-page.js', 'utf8');
        expect(page).toContain("const rbTitle = data.is_me ? 'My public roadbooks' : 'Public roadbooks';");
        expect(fs.readFileSync('public/u/index.html', 'utf8')).toContain('id="pfRbTitle"');
    });
});

describe('the account menu, two presentations of one structure (#977)', () => {
    const css = fs.readFileSync('public/assets/css/app.css', 'utf8');
    it('who you are, your account and — when you have it — administration, then the way out', () => {
        expect(app).toContain('<div class="acc-cols${manage ? \' two\' : \'\'}">${section(\'Your account\', mine)}${manage ? section(\'Administration\', manage) : \'\'}</div>');
        expect(app).toContain('<a class="acc-who" href="${RBProfileLink(user.username)}">');
    });
    it('two columns on a desktop, the whole screen above the tab bar on a phone', () => {
        expect(css).toContain('.account-menu .acc-cols.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }');
        expect(css).toMatch(/\.tabbar-dropup \{ position: fixed; top: 0; left: 0; right: 0; bottom: calc\(var\(--tabbar-h\)/);
        expect(app).toContain("document.body.appendChild(tabMenu);"); // never inside the bar, whose backdrop-filter would frame it
        expect(app).toContain("on('Close', closeMenu);");
    });
    it('the user sheet in user management shows where they ride, when they said', () => {
        const admin = fs.readFileSync('public/admin/admin.js', 'utf8');
        expect(admin).toContain("${u.location ? '<div class=\"u-sheet-map\" id=\"uSheetMap\"></div>' : ''}");
        expect(admin).toContain("if (u.location && window.maplibregl) {");
    });
});

