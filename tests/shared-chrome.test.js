import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* Shared chrome vs. the tool underneath (#401 · #403 · #404 · #405). Four bugs in a row came from
   the same mistake: a banner the shared layer pins to a viewport edge, with a z-index far above the
   page, reserving no space — so it landed on the Reader's Validate button, on its odometer, on the
   Recorder's Start button and on dialog buttons. CSS fails silently and no unit test can measure a
   real layout, but every contract that keeps them apart IS checkable statically, and each one below
   was verified to fail against the code as it was before its fix. The rules:
     · a bar pinned to an edge either takes space in the flow, or publishes its height;
     · a dialog is the top layer — nothing draws over it. */

const read = (p) => fs.readFileSync(p, 'utf8');
const appCss = read('public/assets/css/app.css');
const appJs = read('public/assets/js/app.js');
const readerJs = read('public/reader/reader.js');
// The declaration `prop` of a rule, as authored (rules here are single-line in app.css).
const declOf = (rule, prop) => { const m = rule.match(new RegExp('(?:^|[;\\n])\\s*' + prop + ':\\s*([^;\\n]+)')); return m ? m[1].trim() : null; };
const esc = (sel) => sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A base (unindented) rule. Rules inside media blocks are indented, so `^` keeps them out.
const ruleOf = (sel) => appCss.match(new RegExp('^' + esc(sel) + ' \\{([^}]*)\\}', 'm'))[1];
const zIndexOf = (sel) => parseInt(declOf(ruleOf(sel), 'z-index'), 10);

// Every `@media (max-width: 1024px)` block, brace-matched: a lazy regex would run out of one
// block and find the selector's BASE rule further down the file instead.
function mediaBlocks(query) {
    const out = [];
    for (let i = 0; (i = appCss.indexOf(query, i)) !== -1;) {
        const open = appCss.indexOf('{', i);
        let depth = 0, end = open;
        while (end < appCss.length) {
            if (appCss[end] === '{') depth++;
            else if (appCss[end] === '}' && --depth === 0) break;
            end++;
        }
        out.push(appCss.slice(open + 1, end));
        i = end;
    }
    return out;
}
const MOBILE = mediaBlocks('@media (max-width: 1024px)');
// The same rule as re-declared for mobile (the block spans several lines).
const mobileRuleOf = (sel) => {
    for (const block of MOBILE) {
        const m = block.match(new RegExp('(?:^|\\n)\\s*' + esc(sel) + '\\s*\\{([^}]*)\\}'));
        if (m) return m[1];
    }
    throw new Error('no mobile rule for ' + sel);
};
const bottomOf = (rule) => declOf(rule, 'bottom');
const baseRule = ruleOf('.cookie-notice');
const mobileRule = mobileRuleOf('.cookie-notice');

describe('cookie notice clears the page\'s bottom bars', () => {
    it('offsets by the published stack height on desktop', () => {
        expect(bottomOf(baseRule)).toContain('var(--bottom-stack');
    });

    it('still clears the mobile tab bar, and takes whichever is taller', () => {
        const bottom = bottomOf(mobileRule);
        // a tool that hides the tab bar puts its own row in that space, so neither offset alone
        // is enough — max() is what makes one rule right for both cases
        expect(bottom).toContain('max(');
        expect(bottom).toContain('--tabbar-h');
        expect(bottom).toContain('var(--bottom-stack');
    });

    it('falls back to the floor on a page that pins nothing', () => {
        // the variable is set only by a page that has bars to declare; every other page must still
        // get a valid length out of the rule
        for (const bottom of [bottomOf(baseRule), bottomOf(mobileRule)]) {
            expect(bottom).toMatch(/var\(--bottom-stack,\s*0px\)/);
        }
    });
});

describe('the Reader publishes its bottom stack', () => {
    it('sets --bottom-stack, the half of the contract app.css reads', () => {
        expect(readerJs).toContain("setProperty('--bottom-stack'");
    });

    it('publishes it from the action row\'s own height, not from the viewport', () => {
        // `window.innerHeight` arithmetic left bars floating mid-list on iOS: the viewport it
        // read moves after load, on resize and on rotation, the value did not (#429)
        expect(readerJs).toContain(".fabrow').offsetHeight");
        expect(readerJs).not.toMatch(/window\.innerHeight\s*-/); // the offset-from-the-viewport pattern
    });

    it('clears the variable when nothing is pinned, so the notice drops back down', () => {
        expect(readerJs).toContain("removeProperty('--bottom-stack')");
    });

    it('re-measures when the viewport changes', () => {
        expect(readerJs).toContain("window.addEventListener('resize', publishBottomStack)");
    });
});

describe('the web-GPS banner takes space instead of floating (#403)', () => {
    const banner = ruleOf('.webgps-banner');

    it('is not positioned at all — in the flow, so it can cover nothing', () => {
        // pinned at top:0 it wrapped to three lines on a phone and hid the Reader's total
        // odometer, and left the preview's Navigate button entirely unreachable
        expect(declOf(banner, 'position')).toBeNull();
        expect(declOf(banner, 'top')).toBeNull();
        expect(declOf(banner, 'z-index')).toBeNull();
    });

    it('is inserted FIRST in the body, so it pushes the page down', () => {
        // appended, an in-flow banner would land after the footer instead of above the page
        expect(appJs).toContain('document.body.prepend(el)');
        expect(appJs).not.toContain('document.body.appendChild(el);\n        el.querySelector');
    });

    it('carries the safe-area inset on the side it now touches — the top', () => {
        // it used to add the TOP inset to its BOTTOM padding, which reserved nothing under the
        // status bar and padded the wrong edge; in the flow the inset belongs to the first edge
        const padding = declOf(banner, 'padding');
        expect(padding.startsWith('calc(')).toBe(true);                                  // the first side…
        expect(padding.slice(0, padding.indexOf(')') + 1)).toContain('env(safe-area-inset-top)'); // …is the top
    });
});

describe('a dialog is the top layer (#404)', () => {
    it('outranks every shared banner', () => {
        // the notices used to draw over dialog buttons — and a notice cannot be dismissed while a
        // modal is up, because the backdrop swallows the click
        const modal = zIndexOf('.modal');
        expect(modal).toBeGreaterThan(zIndexOf('.cookie-notice'));
        expect(modal).toBeGreaterThan(200); // .webgps-banner carried 250 before it went in-flow
    });

    it('outranks the bottom tab bar and its drop-up', () => {
        expect(zIndexOf('.modal')).toBeGreaterThan(zIndexOf('.app-tabbar'));
        expect(zIndexOf('.modal')).toBeGreaterThan(zIndexOf('.tabbar-dropup'));
    });
});

describe('the cookie notice reserves its own room (#405)', () => {
    it('publishes its height, and takes it back when dismissed', () => {
        expect(appJs).toContain("setProperty('--notice-h'");
        expect(appJs).toContain("removeProperty('--notice-h')");
    });

    it('re-publishes on resize, since its height depends on how the text wraps', () => {
        expect(appJs).toContain("window.addEventListener('resize', publishHeight)");
    });

    it('is reserved by the body padding in every mode', () => {
        // plain, mobile (on top of the tab bar) and the immersive/fullscreen tools, which zero
        // the tab-bar padding and would otherwise reserve nothing
        for (const rule of [ruleOf('body'), mobileRuleOf('body'), ruleOf('body.rb-fs, body.rb-immersive')]) {
            expect(declOf(rule, 'padding-bottom')).toContain('var(--notice-h, 0px)');
        }
    });

    it('stays compact on a phone: the button beside the text, not under it', () => {
        // stacked it stood 177px tall on a 390px screen and reached down onto the Recorder's
        // start button; keeping it on one row is what halves it
        expect(declOf(mobileRuleOf('.cookie-notice'), 'flex-wrap')).toBe('nowrap');
    });
});

describe('the immersive Reader is an app shell, not pinned bars (#429)', () => {
    const readerHtml = read('public/reader/index.html');
    // rules from the Reader's own <style> block, which is indented inside the page
    const readerRule = (sel) => readerHtml.match(new RegExp(esc(sel) + '\\s*\\{([^}]*)\\}'))[1];

    it('#navScreen is a viewport-sized flex column', () => {
        const shell = readerRule('body.rb-immersive #navScreen');
        expect(declOf(shell, 'position')).toBe('fixed');
        expect(declOf(shell, 'inset')).toBe('0');
        expect(declOf(shell, 'flex-direction')).toBe('column');
        expect(declOf(shell, 'overflow')).toBe('hidden'); // the document must not scroll at all
    });

    it('carries the safe-area insets, so the status bar and home indicator are handled once', () => {
        const shell = readerRule('body.rb-immersive #navScreen');
        expect(declOf(shell, 'padding-top')).toContain('env(safe-area-inset-top)');
        expect(declOf(shell, 'padding-bottom')).toContain('env(safe-area-inset-bottom)');
    });

    it('the note list is the only scroller, and can shrink enough to be one', () => {
        const list = readerRule('body.rb-immersive #noteList');
        expect(declOf(list, 'flex')).toBe('1');
        expect(declOf(list, 'min-height')).toBe('0'); // without this a flex child pushes the bars off-screen
        expect(declOf(list, 'overflow-y')).toBe('auto');
        expect(declOf(list, 'padding-bottom')).toBe('0'); // no padding standing in for a bar's height
    });

    it('every bar is a flow row inside the shell', () => {
        for (const sel of ['body.rb-immersive .odometer-bar', 'body.rb-immersive .fabrow']) {
            expect(declOf(readerRule(sel), 'position'), sel).toBe('static');
        }
    });

    it('nothing shared floats onto the tool while it owns the screen', () => {
        // a floating chip was sitting on the action row mid-drive
        const hidden = appCss.match(/body\.rb-immersive \.app-chip-stack[^{]*\{([^}]*)\}/)[1];
        expect(declOf(hidden, 'display')).toBe('none');
        expect(declOf(readerRule('body.rb-immersive .webgps-banner, body.rb-immersive #prNativeHint, body.rb-immersive .foot'), 'display')).toBe('none');
    });

    it('the toast clears whatever is pinned to the bottom', () => {
        // the one message explaining why a tap did nothing must not land behind the buttons (#431)
        expect(declOf(ruleOf('.toast'), 'bottom')).toContain('var(--bottom-stack');
    });
});

describe('the GPS watch does not outlive the page (#430)', () => {
    const meter = read('public/assets/js/gps-meter.js');

    it('releases the watch on pagehide, and re-arms a page restored from the cache', () => {
        expect(meter).toContain("window.addEventListener('pagehide'");
        expect(meter).toContain("window.addEventListener('pageshow'");
        expect(meter).toMatch(/persisted/); // a bfcache restore keeps the JS state but not the watch
    });

    it('does NOT hang the watch off visibilitychange', () => {
        // backgrounding the app is exactly when logging must keep going — that is the whole
        // reason the native watch exists
        const onVis = meter.match(/_onVis = [^\n]*/)[0];
        expect(onVis).toContain('_wake()');
        expect(onVis).not.toContain('stop()');
    });

    it('the native watch is started idempotently', () => {
        const native = read('native/src/native.js');
        const start = native.match(/async start\(onUpdate, onError\) \{([\s\S]*?)\n {8}\}/)[1];
        expect(start.indexOf('BackgroundGeolocation.stop()')).toBeGreaterThan(-1);
        expect(start.indexOf('BackgroundGeolocation.stop()')).toBeLessThan(start.indexOf('BackgroundGeolocation.start('));
    });
});

describe('floating chips and the tab bar (#609 · #615)', () => {
    const css = fs.readFileSync('public/assets/css/app.css', 'utf8');
    const app = fs.readFileSync('public/assets/js/app.js', 'utf8');
    it('the chips share one stack; the language is chosen on the Profile page only (#670)', () => {
        expect(app).toContain('chipStack().prepend(installBtn);');
        expect(app).toContain('chipStack().prepend(pill);');
        expect(app).not.toContain('lang-mobile');
        expect(css).not.toContain('.lang-mobile');
    });
    it('button tabs lose the browser button box', () => {
        expect(css).toMatch(/\.app-tabbar \.tabbar-link \{[^}]*background: none; border: 0;/);
    });
});

describe('one chrome: stores, the guide, the web-GPS question (#669 · #673 · #674 · #677)', () => {
    const app = fs.readFileSync('public/assets/js/app.js', 'utf8');
    it('the web-GPS warning asks No / Yes, and No answers the await', () => {
        const fn = app.match(/window\.RBWebGpsConfirm = [\s\S]*?\n    \};/)[0];
        expect(fn).toContain("d.q('[data-no]').onclick = () => { d.close(); resolve(false); };");
        expect(fn).not.toContain("RBt('Cancel')");
    });
    it('every place that offers the apps draws the same store badges from RBStore (#674 · #720)', () => {
        expect(app).toContain('href="${RBesc(RBStore.ios)}"');
        expect(app).toContain('href="${RBesc(RBStore.android)}"');
        for (const page of ['public/index.html', 'public/about/index.html']) {
            const html = fs.readFileSync(page, 'utf8');
            expect(html, page).toContain('data-get-app');
            expect(html, page).not.toContain('apps.apple.com');
        }
        // the install guide leads each phone card with its store, from the same RBStore (#539)
        expect(fs.readFileSync('public/install/install.js', 'utf8')).toMatch(/store: \{ href: \(\) => RBStore\.android[\s\S]*?store: \{ href: \(\) => RBStore\.ios/);
    });
    it('the Install chip only on the web, and it always opens the guide (#720)', () => {
        expect(app).toContain("function onInstall() { location.href = ROOT + 'install/'; }");
        expect(app).toContain('function showInstall() { if (isStandalone() || isNativeApp()) return;');
    });
    it('the install page can show its toast', () => {
        expect(fs.readFileSync('public/install/index.html', 'utf8')).toContain('<div id="toast" class="toast" hidden></div>');
    });
    it('the guide reaches the server from the app and has no language picker of its own', () => {
        const js = fs.readFileSync('public/wiki/wiki.js', 'utf8'), html = fs.readFileSync('public/wiki/index.html', 'utf8');
        expect(js).toContain("fetch(RB_API_ROOT + 'wiki/md.php");
        expect(js.trimStart()).toMatch(/^'use strict';[\s\S]*?\(function \(\) \{/);
        expect(html).not.toContain('class="lang"');
        expect(html).not.toContain('maplibre');
    });
});

describe('find a label in the translation editor (#709)', () => {
    it('the editor searches every key by key or text and opens the hit in the same editor', () => {
        const edit = fs.readFileSync('public/assets/js/i18n-edit.js', 'utf8');
        expect(edit).toContain('window.RBI18nFind = (query, limit = 40) =>');
        expect(edit).toContain("LANGS.some((l) => String(valueOf(l, k)).toLowerCase().includes(q))");
        expect(edit).toContain('window.RBI18nEditKeys = (keys, title) => openEditor(keys, title);');
        const cfg = fs.readFileSync('public/admin/config/config.js', 'utf8');
        expect(cfg).toContain('RBI18nFind(q)');
        expect(cfg).toContain('RBI18nEditKeys([hits[+b.dataset.hit].key]');
    });
});

describe('nothing sits under the status bar (#787)', () => {
    const css = fs.readFileSync('public/assets/css/app.css', 'utf8');
    it('covers the top inset with one opaque strip above everything', () => {
        expect(css).toMatch(/body::before \{ content: ''; position: fixed; top: 0; left: 0; right: 0; height: env\(safe-area-inset-top\); background: rgba\(14, 17, 22, \.86\); -webkit-backdrop-filter: saturate\(160%\) blur\(18px\);/);
        expect(css).toContain('body:has(> .modal:not([hidden]))::before { background: rgba(8, 9, 14, .94); }');
    });
    it('pads every dialog by the safe areas and keeps its card within them', () => {
        expect(css).toMatch(/\.modal \{[^}]*padding: calc\(1rem \+ env\(safe-area-inset-top\)\)/);
        expect(css).toMatch(/\.modal-card \{[^}]*max-height: calc\(100dvh - 2rem - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\)/);
    });
    it('hides the status bar only on Android, where it gives its strip back', () => {
        expect(fs.readFileSync('native/src/native.js', 'utf8')).toContain("if (Capacitor.getPlatform() !== 'android') return;");
    });
});
