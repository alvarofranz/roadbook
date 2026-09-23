import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';

/* The shared layer, held to what every page gets from it: a toast on any page, one CSV writer, one
   debounce for the searches that ask the server, media paths that load inside the app too, server
   answers in the reader's language, and dictionaries that define each key once. */

const read = (p) => fs.readFileSync(p, 'utf8');
const appJs = read('public/assets/js/app.js');
// These helpers touch nothing but the DOM and timers, so they run standalone in happy-dom —
// evaluating the whole of app.js would drag in the header, the service worker and version polling.
const snippet = (re) => { const m = appJs.match(re); if (!m) throw new Error('not found: ' + re); return m[0]; };
window.RBt = (k) => k;
eval(snippet(/let toastTimer = null;\n {4}window\.RBToast = [\s\S]*?\n {4}\};/).replace('let toastTimer', 'window.toastTimer'));
eval(snippet(/const csvCell = [^\n]*\n {4}window\.RBCsv = [^\n]*/).replace('const csvCell', 'window.csvCell'));
eval(snippet(/window\.RBDebounce = \(fn, ms = 300\) => \{[\s\S]*?\n {4}\};/));

describe('RBToast works on every page', () => {
    it('creates the #toast element where the page ships none, and reuses it after', () => {
        document.body.innerHTML = '<main></main>';
        window.RBToast('Saved.');
        const el = document.getElementById('toast');
        expect(el).toBeTruthy();
        expect(el.className).toBe('toast');
        expect(el.getAttribute('role')).toBe('status');
        expect(el.textContent).toBe('Saved.');
        window.RBToast('Again.');
        expect(document.querySelectorAll('#toast').length).toBe(1);
    });
});

describe('RBCsv: the one CSV writer', () => {
    it('starts with a BOM and quotes only the cells that need it', async () => {
        const blob = window.RBCsv([['name', 'note'], ['Zoë', 'a, "b"'], [null, 3]]);
        expect(blob.type).toBe('text/csv;charset=utf-8');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        expect([...bytes.slice(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]); // the UTF-8 BOM a spreadsheet needs
        expect(new TextDecoder().decode(bytes)).toBe('name,note\nZoë,"a, ""b"""\n,3');
    });
    it('is what every export writes', () => {
        expect(appJs).toContain("RBDownload(RBCsv([['created_at', 'action', 'detail', 'ip']");
        expect(read('public/admin/events/participants/participants.js')).toContain("RBDownload(RBCsv([['username', 'first_name', 'last_name', 'email', 'status', 'joined']");
        expect(read('public/ranking/ranking.js')).toContain('RBDownload(RBCsv([head, ...lines])');
        for (const p of ['public/assets/js/app.js', 'public/admin/events/participants/participants.js', 'public/ranking/ranking.js']) {
            expect(read(p), p).not.toContain("type: 'text/csv'");
        }
    });
});

describe('RBDebounce + a sequence guard for the searches that ask the server', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('runs once, after the typing stops, with the last arguments; cancel drops it', () => {
        const fn = vi.fn();
        const run = window.RBDebounce(fn, 300);
        run('a'); run('ab'); vi.advanceTimersByTime(299);
        expect(fn).not.toHaveBeenCalled();
        run('abc'); vi.advanceTimersByTime(300);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('abc');
        run('x'); run.cancel(); vi.advanceTimersByTime(1000);
        expect(fn).toHaveBeenCalledTimes(1);
    });
    it('the activity log and the admin roadbook list debounce and drop stale answers', () => {
        expect(appJs).toContain("m.q('#myActSearch').oninput = RBDebounce(");
        expect(appJs).toMatch(/const seq = \+\+actSeq;[\s\S]*?if \(seq !== actSeq\) return;/);
        const admin = read('public/admin/admin.js');
        expect(admin).toContain("m.q('#rbsSearch').oninput = RBDebounce(");
        expect(admin).toMatch(/const seq = \+\+rbSeq;[\s\S]*?if \(seq !== rbSeq\) return;/);
    });
    it('no page hand-rolls its own search timer any more', () => {
        for (const p of ['public/admin/admin.js', 'public/admin/config/config.js', 'public/admin/logs/admin-logs.js', 'public/admin/events/participants/participants.js']) {
            expect(read(p), p).not.toMatch(/clearTimeout\((search|add|org)Timer\)/);
        }
    });
});

describe('media and links that work inside the app', () => {
    it('the data export and the run cards load media through RBMediaSrc', () => {
        const account = read('public/account/account.js');
        expect(account).toContain('await fetch(RBMediaSrc(p.url))');
        expect(account).toContain('await fetch(RBMediaSrc(a.url))');
        expect(read('public/assets/js/profile-page.js')).toContain('const cardSrc = r.card ? RBMediaSrc(r.card) : \'\';');
    });
    it('the event page uses the shared sign-in link, config and palette', () => {
        const event = read('public/event/event.js');
        expect(event).toContain('const whoami = RBConfig();');
        expect(event).toContain('href="${RBLoginUrl()}"');
        expect(event).not.toContain('/account/?next=');
        for (const p of ['public/event/event.js', 'public/admin/events/edit/event-edit.js']) {
            expect(read(p), p).toContain("new maplibregl.Marker({ color: RBCssVar('--track') })");
            expect(read(p), p).not.toContain('#dc3545');
        }
    });
    it('an event card names its month in the UI language', () => {
        expect(appJs).toMatch(/window\.RBEventCard = [\s\S]*?const lang = window\.RBi18n \? RBi18n\.current\(\) : undefined;/);
    });
});

describe('what the server says, and what a confirm shows', () => {
    it('server errors go through t() like everywhere else', () => {
        expect(read('public/ranking/ranking.js')).toContain("msg(t(x.error || 'Could not save.'), true)");
        expect(read('public/admin/admin.js')).toContain("body.textContent = t(r.error || 'Could not load.')");
        expect(read('public/admin/users-map/users-map.js')).toContain("$('adminMsg').textContent = t(r.error || 'Could not load.')");
        expect(read('public/admin/events/edit/event-edit.js')).toContain("$('adminMsg').textContent = t(r.error || 'Not found.')");
        expect(read('public/admin/events/participants/participants.js')).toContain("$('adminMsg').textContent = t(r.error || 'Not found.')");
    });
    it('a username in a confirm is escaped (the confirm renders HTML)', () => {
        const admin = read('public/admin/admin.js');
        expect(admin).toContain("' @' + esc(au.username) + '?'");
        expect(admin).toContain("' @' + esc((u && u.username) || '') + '?'");
        expect(admin).toContain("' (@' + esc(b.dataset.name) + ')'");
        expect(read('public/admin/trash/admin-trash.js')).toContain("' @' + esc(u.username) + '?'");
    });
    it('the translation editor survives blocked storage', () => {
        const edit = read('public/assets/js/i18n-edit.js');
        expect(edit).toContain("const isOn = () => { try { return localStorage.getItem(LS_ON) === '1'; } catch (e) { return false; } };");
        expect(edit).not.toMatch(/const setOn = \(v\) => \{ if \(v\) localStorage/);
    });
});

describe('the dictionaries', () => {
    const files = ['i18n.js', 'i18n.es.js', 'i18n.it.js', 'i18n.de.js', 'i18n.fr.js'];
    // Every string key followed by ':' — an object literal silently keeps the LAST of two, so a
    // duplicate is a translation nobody sees, and two of them had drifted apart (#480).
    const keysOf = (src) => {
        const out = [];
        const re = /(['"])((?:\\.|(?!\1).)*)\1\s*:/g;
        const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        for (const m of stripped.matchAll(re)) out.push(m[2].replace(/\\(['"])/g, '$1'));
        return out;
    };
    for (const f of files) {
        it(`${f} defines every key once`, () => {
            const keys = keysOf(read('public/assets/js/' + f)), seen = new Set(), dup = [];
            for (const k of keys) { if (seen.has(k)) dup.push(k); seen.add(k); }
            expect(dup).toEqual([]);
        });
    }
    it('no key carries a straight apostrophe (#114)', () => {
        for (const l of ['es', 'it', 'de', 'fr']) eval(read(`public/assets/js/i18n.${l}.js`));
        for (const [lang, dict] of Object.entries(window.RBi18nLangs)) {
            expect(Object.keys(dict).filter((k) => k.includes("'")), lang).toEqual([]);
        }
    });
    it('the site banner level has its own key; the icon palette keeps “Warning” for its danger signs', () => {
        expect(read('public/admin/config/index.html')).toContain('<option value="warning" data-i18n="banner.level.warning">Warning</option>');
        expect(read('public/assets/js/i18n.js')).toContain("'banner.level.warning': 'Warning',");
    });
});
