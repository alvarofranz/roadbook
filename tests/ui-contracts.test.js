import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/* Cross-cutting contracts behind four field reports (#422 · #423 · #426 · #427). Each of them
   failed *silently* — a CSS rule that painted nothing, a copy button that threw where nobody
   could catch it, an API call that lost the caller's identity — which is exactly the kind of bug
   a cheap static check catches and a human never does. */

const read = (p) => fs.readFileSync(p, 'utf8');

// Every .css and every page <style> block in the site.
function styleSources() {
    const out = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (e.name !== 'fontawesome' && e.name !== 'icons') walk(p); continue; }
            if (e.name.endsWith('.css')) out.push([p, read(p)]);
            else if (e.name.endsWith('.html')) {
                for (const m of read(p).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) out.push([p, m[1]]);
            }
        }
    };
    walk('public');
    return out;
}

describe('every CSS custom property a rule reads is actually defined (#422)', () => {
    const appCss = read('public/assets/css/app.css');
    // The palette and anything else declared in a plain :root block.
    const declared = new Set([...appCss.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
    // Published at runtime by JS rather than declared in CSS — each with the code that sets it.
    const runtime = {
        '--notice-h': 'public/assets/js/app.js',            // the cookie notice's own height (#405)
        '--bottom-stack': 'public/reader/reader.js',        // the Reader's bottom bars (#401)
        '--cap-rotation': 'public/reader/reader.js',        // the bearing/CAP arrow
        '--speed-band': 'public/tripmaster/tripmaster.js',  // speed-alert colour
        '--tm-band': 'public/tripmaster/tripmaster.js',
        '--progress': 'public/editor/editor.js',       // the editor's progress bar
    };

    it('the runtime-published variables really are published by the code named here', () => {
        for (const [name, file] of Object.entries(runtime)) {
            expect(read(file), `${name} is not set by ${file}`).toContain(`'${name}'`);
        }
    });

    it('no rule reads a variable that nothing defines', () => {
        // `background: var(--accent)` painted NOTHING for the participants page's active filter:
        // the palette calls that colour --sand, so the toggle looked identical on and off, and the
        // same dead token left two invisible borders on the wiki page. CSS never complains.
        const unknown = [];
        for (const [file, css] of styleSources()) {
            for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,|\))/gi)) {
                const name = m[1];
                if (declared.has(name) || name in runtime) continue;
                if (name.startsWith('--fa-')) continue; // FontAwesome's own namespace, declared in its CSS
                if (m[2] === ',') continue; // has a fallback: degrades on purpose
                unknown.push(`${file} → var(${name})`);
            }
        }
        expect(unknown).toEqual([]);
    });
});

describe('copying goes through the one guarded helper (#423)', () => {
    const appJs = read('public/assets/js/app.js');

    it('no page calls navigator.clipboard.writeText itself', () => {
        // unguarded, it throws synchronously where `navigator.clipboard` is undefined (non-secure
        // context, older WebView, refused write) — outside any promise chain, so the copy silently
        // never happens and not even the failure toast shows
        const offenders = [];
        const walk = (dir) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) { walk(p); continue; }
                if (!e.name.endsWith('.js') || p === 'public/assets/js/app.js') continue;
                if (read(p).includes('navigator.clipboard.writeText')) offenders.push(p);
            }
        };
        walk('public');
        expect(offenders).toEqual([]);
    });

    it('RBCopy checks the API is there and falls back when it is not', () => {
        const copy = appJs.match(/window\.RBCopy = async \(text, okMsg\) => \{([\s\S]*?)\n {4}\};/)[1];
        expect(copy).toContain('navigator.clipboard && navigator.clipboard.writeText');
        expect(copy).toContain('legacyCopy(text)');
        expect(appJs).toContain("document.execCommand('copy')"); // the fallback path itself
        expect(appJs).toContain("'copy-shuttle'"); // …and it styles the shuttle by class, not inline
        expect(read('public/assets/css/app.css')).toContain('.copy-shuttle {');
    });
});

describe('public-roadbook calls carry who is asking (#426)', () => {
    const challenges = read('public/assets/js/challenges.js');

    it('go through RBApi, never a raw fetch', () => {
        // in the app the WebView calls rdbk.app cross-origin: no cookie travels, and the Bearer
        // RBApi attaches is the only proof of identity — without it a READY event roadbook is
        // invisible and the server answers "private"
        expect(challenges).not.toMatch(/\bawait fetch\(|=\s*fetch\(/);
        expect(challenges).toContain("RBApi('public_list'");
        expect(challenges).toContain("RBApi('public_get'");
    });

    it('still tell a failed call apart from an empty list (#218)', () => {
        // null = the call failed → callers show an error; [] = there are genuinely none
        const list = challenges.match(/async function listPublic\(opts\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(list).toContain('ok === false');
        expect(list).toContain('null');
        expect(list).toContain('roadbooks || []');
    });
});

describe('the user never reads the word "challenge" (#426)', () => {
    // It stays the internal name and the /challenge/<slug> route; the user-facing label is
    // "roadbook", with "challenge" reserved for the events feature (CLAUDE.md).
    const LANGS = ['es', 'it', 'de', 'fr'];

    it('no translated key is phrased about a challenge', () => {
        const keys = new Set();
        for (const lang of LANGS) {
            for (const m of read(`public/assets/js/i18n.${lang}.js`).matchAll(/'((?:[^'\\]|\\.)+)':\s*'/g)) keys.add(m[1]);
        }
        const CAPTCHA = ['Please complete the challenge.', 'Challenge failed. Please try again.']; // Turnstile: a security challenge IS one
        const offenders = [...keys].filter((k) => /challenge/i.test(k) && !/^fp\./.test(k) && !CAPTCHA.includes(k));
        expect(offenders).toEqual([]);
    });

    it('the not-found copy on the public page says roadbook', () => {
        const ch = read('public/challenge/challenge.js');
        expect(ch).toContain("t('Roadbook not found.')");
        expect(ch).toContain("t('This roadbook does not exist or is private.')");
        expect(ch).not.toMatch(/t\('[^']*[Cc]hallenge[^']*'\)/);
    });
});

describe('the per-note map is a close-up, not the whole route (#427)', () => {
    const readerJs = read('public/reader/reader.js');
    const open = readerJs.match(/function toggleNoteMap\(i\) \{([\s\S]*?)\n {4}\}/)[1];

    it('opens at a detailed zoom on the rider, falling back to the note with no fix', () => {
        expect(readerJs).toMatch(/NOTE_MAP_ZOOM = 1[5-9]/); // 13 was too coarse to read a junction
        expect(open).toContain('lastHere ||');
        expect(open).toContain('zoom: NOTE_MAP_ZOOM');
    });

    it('draws that one waypoint, not the roadbook', () => {
        expect(open).toContain('notes: [n]');
        expect(open).not.toMatch(/showRoadbook\(rb\b/);
    });
});

describe('the roadbook\'s icon library is not a cache (#454)', () => {
    const editor = read('public/editor/editor.js');
    const prune = editor.match(/async function embedUsed\(r\) \{([\s\S]*?)\n {4}\}/)[1];

    it('only deletes icons the standard palette can give back', () => {
        // rb.icons is the ONLY copy of a custom icon: pruning it destroyed uploads and left notes
        // pointing at a name that resolves to a 404 — the broken image in the report
        expect(prune).toContain('stdIconNames()');
        expect(prune).toMatch(/if \(stdNames\.has\(low\)\) delete r\.icons\[k\]/);
        // the unconditional prune is gone (the other `delete` in there resolves a case collision
        // on a name that IS in use, which is a different thing)
        expect(prune).not.toMatch(/if \(!\[\.\.\.used\]\.some[^)]*\)\) delete r\.icons\[k\]/);
    });

    it('an upload is checkpointed, so a crash cannot lose it', () => {
        const add = editor.match(/async function addIconFiles\(files, pasted\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(add).toContain('markDirty()');
    });

    it('a pasted image gets a unique name instead of overwriting the last paste (#455)', () => {
        // the clipboard calls everything "image.png"
        const add = editor.match(/async function addIconFiles\(files, pasted\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(add).toMatch(/pasted \? '[^']*' \+ Date\.now\(\)/);
    });

    it('an armed icon paste is honoured before the photo paths, with no saved roadbook needed', () => {
        // an icon is embedded in the .rdbk; a photo needs a server id, and that check used to
        // reject the paste before it could ever become an icon
        const handler = editor.match(/document\.addEventListener\('paste'[\s\S]*?\n {4}\}\);/)[0];
        expect(handler.indexOf('pasteIconArmed')).toBeGreaterThan(-1);
        expect(handler.indexOf('pasteIconArmed')).toBeLessThan(handler.indexOf("currentRbId > 0"));
    });
});

describe('comment rows span the description area (#463)', () => {
    // .col-vignette-empty is display:none, which removes the cell from the grid — without an
    // explicit span the comment text auto-placed into the narrow vignette column instead of
    // the description area (flex is inert in grid, so flex:1 never did anything there).
    for (const page of ['public/reader/index.html', 'public/challenge/index.html']) {
        it(`${page} pins the wide comment text across the vacated columns`, () => {
            const html = read(page);
            const rule = html.match(/\.nrow\.comment \.col-text-wide \{([^}]*)\}/);
            expect(rule, `${page} has no .col-text-wide rule`).not.toBeNull();
            expect(rule[1]).toMatch(/grid-column\s*:\s*2\s*\/\s*-1/);
            expect(rule[1]).not.toMatch(/flex\s*:/);
        });
    }
});

describe('editor map modes and keys (#458)', () => {
    const editor = read('public/editor/editor.js');
    const html = read('public/editor/index.html');

    it('Draw and Cut are reachable by key, not only from the landing', () => {
        expect(editor).toMatch(/k === 'd'[^]*?setMapTool\('draw'\)/);
        expect(editor).toMatch(/k === 'c'[^]*?setMapTool\('cut'\)/);
        expect(editor).toContain("MODE_TOOLS = ['toolMove', 'toolNote', 'toolDraw', 'toolCut']");
    });

    it('A always means Add note: the vertex midpoint moved to I', () => {
        expect(editor).toContain("const act = { w: 'note', i: 'mid', l: 'line', del: 'del' }[k]");
        expect(editor).not.toContain("a: 'mid'");
        expect(editor).toContain("label: 'Add intermediate point', key: 'I'");
    });

    it('the W/T pair is named as a pair, and L names the track point', () => {
        expect(editor).toContain("label: 'Turn this point into a note', key: 'W'");
        expect(editor).toContain("label: 'Turn this note into a track point', key: 'T'");
        expect(editor).toContain("label: 'Add track point here', key: 'L'");
    });

    it('the ☰ panel shows every mode with its key chip', () => {
        for (const [id, tool, key] of [['toolMove', 'points', 'M'], ['toolNote', 'note', 'A'], ['toolDraw', 'draw', 'D'], ['toolCut', 'cut', 'C']]) {
            expect(html).toContain(`id="${id}" data-tool="${tool}"`);
        }
        expect(html.match(/<span class="map-ctx-key">[MADC]<\/span>/g).length).toBeGreaterThanOrEqual(4);
    });

    it('Esc closes the open context menu instead of leaving it hanging', () => {
        expect(editor).toMatch(/k === 'escape'[^]*?closeCtxMenu\(\)/);
    });
});

describe('GPS readiness alerts (#443-446)', () => {
    const meter = read('public/assets/js/gps-meter.js');
    const bridge = read('native/src/native.js');

    it('the meter reports stalls, coarse fixes and preflight states instead of staying silent', () => {
        expect(meter).toContain("this._onAlert('stalled')");
        expect(meter).toContain("this._onAlert('coarse')");
        expect(meter).toContain("this._onAlert('battery')");
        expect(meter).toContain("this._onAlert('notifications')");
    });

    it('the bridge exposes readiness + settings deep-links backed by real plugins', () => {
        expect(bridge).toContain("import { PushNotifications } from '@capacitor/push-notifications'");
        expect(bridge).toContain("import { BatteryOptimization } from '@capawesome-team/capacitor-android-battery-optimization'");
        expect(bridge).toContain('PushNotifications.checkPermissions()');
        expect(bridge).toContain('BatteryOptimization.isBatteryOptimizationEnabled()');
        expect(bridge).toContain('BatteryOptimization.openBatteryOptimizationSettings()');
        expect(bridge).toContain('async readiness()');
        expect(bridge).toContain('async openSettings()');
        expect(bridge).toContain('async openBatterySettings()');
    });

    it('the alert copy exists in English', () => {
        const en = read('public/assets/js/i18n.js');
        for (const k of ['No GPS fixes yet', 'too coarse for a reliable track', 'Battery optimization is on', 'Notifications are off', 'Open battery settings', 'Open settings']) {
            expect(en, k).toContain(k);
        }
    });
});

describe('app info pop-up states running vs available (#474)', () => {
    const app = read('public/assets/js/app.js');
    const fn = app.match(/window\.showAppInfo = (?:async )?function \(\) \{([\s\S]*?)modal\.q\('\.modal-close'\)\.onclick = \(\) => modal\.close\(\);\s*\};/)[1];

    it('refreshes the versions when opened instead of showing the stale footer text', () => {
        expect(fn).toContain("version.json', { cache: 'no-store' }");
        expect(fn).not.toContain('appVersion');
    });

    it('names platform, running and available rows, with the web-content reference in-app', () => {
        for (const k of ["RBt('Platform')", "RBt('Running')", "'Available'", "'Latest web content'"]) {
            expect(fn, k).toContain(k);
        }
    });

    it('offers Update only when something is actually newer', () => {
        expect(fn).toContain('lb > bb'); // native: live build ahead of the bundled one
        expect(fn).toContain("available !== '—' && available !== running"); // web: live ahead of boot
    });

    it('links the official site with the copyright line', () => {
        expect(fn).toContain('https://rdbk.app');
        expect(fn).toContain('RDBK.app</div>');
    });
});
