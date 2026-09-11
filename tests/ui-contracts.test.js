import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/* Cross-cutting contracts behind four field reports (#422 · #423 · #426 · #427). Each of them
   failed *silently* — a CSS rule that painted nothing, a copy button that threw where nobody
   could catch it, an API call that lost the caller's identity — which is exactly the kind of bug
   a cheap static check catches and a human never does. */

const read = (p) => fs.readFileSync(p, 'utf8');

// Every first-party page and module — the files a human wrote, not a vendor bundle.
function firstPartySources() {
    const out = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (!['fontawesome', 'icons', 'photos', 'audio', 'avatars', 'event-logos'].includes(e.name)) walk(p); continue; }
            if (/\.(html|js)$/.test(e.name) && !/\.min\.js$|native\.bundle\.js$/.test(e.name)) out.push(p);
        }
    };
    walk('public');
    return out;
}

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

describe('app info pop-up states running vs available (#474, #478)', () => {
    const app = read('public/assets/js/app.js');
    const fn = app.match(/window\.showAppInfo = (?:async )?function \(\) \{([\s\S]*?)modal\.q\('\.modal-close'\)\.onclick = \(\) => modal\.close\(\);\s*\};/)[1];

    it('asks the shared helpers every time it opens, never the stale footer text', () => {
        expect(fn).toContain('RBRunningRelease()');
        expect(fn).toContain('RBLiveVersion()');
        expect(fn).not.toContain('appVersion');
    });

    it('names platform, running and available rows, with the web-content reference in-app', () => {
        for (const k of ["row('Platform'", "row('Running'", "'Available'", "'Latest web content'"]) {
            expect(fn, k).toContain(k);
        }
    });

    it('offers Update only when something is actually newer', () => {
        expect(fn).toContain('live.build > (bundled ? bundled.build : 0)');           // app: the store, live web content ahead of the binary
        expect(fn).toContain('live.version !== running.version || live.build !== running.build'); // web: a shell refresh
    });

    it('links what changed and the official site', () => {
        expect(fn).toContain("about/#changelog");
        expect(fn).toContain('https://rdbk.app');
        expect(fn).toContain('RDBK.app</div>');
    });

    it('styles the card with classes, never an inline style attribute', () => {
        expect(fn).not.toMatch(/style="/);
        for (const cls of ['app-info-card', 'app-info-table', 'app-info-foot']) {
            expect(read('public/assets/css/app.css'), cls).toContain('.' + cls);
        }
    });
});

/* Every declaration a stylesheet makes, in document order, flattened to one entry per
   selector × property, with the media queries it sits in noted. Enough to answer the one
   question below: does a later rule silently kill an earlier responsive one? */
function declarations(css) {
    const out = [];
    const collect = (text, inMedia) => {
        let k = 0;
        while (k < text.length) {
            const brace = text.indexOf('{', k);
            if (brace < 0) break;
            const selector = text.slice(k, brace).trim();
            let depth = 0, end = brace;
            for (; end < text.length; end++) {
                if (text[end] === '{') depth++;
                else if (text[end] === '}' && !--depth) break;
            }
            const body = text.slice(brace + 1, end);
            if (selector.startsWith('@')) { if (/^@media/i.test(selector)) collect(body, true); }
            else for (const declaration of body.split(';')) {
                const colon = declaration.indexOf(':');
                if (colon < 0) continue;
                const property = declaration.slice(0, colon).trim().toLowerCase();
                if (!/^[a-z-]+$/.test(property)) continue; // a chunk of a data: URI, not a declaration
                for (const one of selector.split(',')) out.push({ selector: one.trim().replace(/\s+/g, ' '), property, inMedia });
            }
            k = end + 1;
        }
    };
    collect(css.replace(/\/\*[\s\S]*?\*\//g, ''), false);
    return out;
}

describe('a responsive override is never killed by the rule written below it (#476)', () => {
    // A @media block and a plain rule with the SAME selector have the SAME specificity, so the one
    // written last wins at every width — the media query is dead code. That is how the My-roadbooks
    // card collapsed on every phone: `@media (max-width: 640px) { .roadbook-row .meta { min-width:
    // 100% } }` sat above `.roadbook-row .meta { min-width: 0 }`, so the card's text shrank to 6 px
    // and its summary line ran straight across the action buttons. Nothing warns about it: the CSS
    // is valid, the rule is simply never applied. Responsive blocks go AFTER the base rules.
    it('no @media declaration is overridden by a later base rule with the same selector', () => {
        const dead = [];
        for (const [file, css] of styleSources()) {
            const decls = declarations(css);
            decls.forEach((d, i) => {
                if (!d.inMedia) return;
                for (let k = i + 1; k < decls.length; k++) {
                    if (decls[k].inMedia || decls[k].selector !== d.selector || decls[k].property !== d.property) continue;
                    dead.push(`${file}: @media … { ${d.selector} { ${d.property} } } — killed by the base rule below it`);
                    break;
                }
            });
        }
        expect(dead).toEqual([]);
    });
});

describe('the saved-roadbook card is readable on a phone (#476)', () => {
    const css = read('public/assets/css/app.css');
    const mobile = css.match(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}/)[1];

    it('gives the title + summary a full-width row of their own', () => {
        expect(mobile).toContain('.roadbook-row .meta { min-width: 100%; }');
    });

    it('lets the summary wrap instead of running across the buttons', () => {
        expect(mobile).toContain('.roadbook-row .meta small { white-space: normal; }');
    });

    it('spreads the status pill and the actions over the row below, so none is orphaned', () => {
        expect(mobile).toContain('.roadbook-row .btn, .roadbook-row .rb-status { flex: 1 1 auto; }');
    });
});

describe('styling lives in stylesheets, never in a style attribute (#480)', () => {
    // CLAUDE.md: inline styles ARE the bug. They also hide dead class names — the App Info card
    // leaned on `style="…"` over two classes no stylesheet ever defined (#478).
    it('no page or JS-built markup carries a style attribute', () => {
        const offenders = [];
        for (const file of firstPartySources()) {
            for (const m of read(file).matchAll(/style="[^"]*"/g)) offenders.push(`${file} → ${m[0]}`);
        }
        expect(offenders).toEqual([]);
    });
});

describe('one tool, one icon, everywhere (#480)', () => {
    // CLAUDE.md's canonical set. The home workflow step for the Ranking wore a trophy while every
    // other surface used fa-ranking-star, and the Editor's "start from a public roadbook" card
    // still wore the trophy of the old "challenge" naming (#426).
    const CANONICAL = {
        recorder: 'fa-circle-dot', editor: 'fa-pen-ruler', reader: 'fa-compass',
        tripmaster: 'fa-gauge-high', ranking: 'fa-ranking-star',
    };

    it('every link to a tool from the home, the launcher or a feature page wears the tool icon', () => {
        const pages = ['public/index.html', 'public/navigate/index.html',
            ...Object.keys(CANONICAL).map((t) => `public/features/${t}/index.html`)];
        const offenders = [];
        for (const page of pages) {
            for (const m of read(page).matchAll(/<a[^>]*href="([^"]*)"[^>]*class="(wf-step|launch-tile|feat-card)"[^>]*>([\s\S]*?)<\/a>|<a[^>]*class="(wf-step|launch-tile|feat-card)"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
                const href = m[1] || m[5], inner = m[3] || m[6];
                for (const [tool, icon] of Object.entries(CANONICAL)) {
                    if (!new RegExp(`(^|/)(features/)?${tool}/$`).test(href)) continue;
                    const used = (inner.match(/fa-(?!solid|brands|regular)[a-z-]+/) || [])[0];
                    if (used && used !== icon) offenders.push(`${page} → ${href} uses ${used}, not ${icon}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it('each feature page leads with its own tool icon', () => {
        for (const [tool, icon] of Object.entries(CANONICAL)) {
            const hero = read(`public/features/${tool}/index.html`).match(/<i class="fa-solid (fa-[a-z-]+) feat-ico"/);
            expect(hero && hero[1], tool).toBe(icon);
        }
    });

    it('nothing wears the retired challenge trophy', () => {
        for (const file of firstPartySources()) expect(read(file), file).not.toContain('fa-trophy');
    });
});

describe('the page itself never scrolls sideways (#480)', () => {
    // A horizontal page scroll on a phone is never cosmetic here: the shared bars (tab bar,
    // language chip, cookie notice) are sized from the layout viewport, so one over-wide element
    // drags them off-screen with it. German found three: "Datenschutzerklärung" in an h1,
    // "Veranstaltungsklassement" in a grid cell, and the 540 px spec tables.
    const app = read('public/assets/css/app.css');

    it('running text breaks a word that cannot fit its box', () => {
        expect(app).toMatch(/h1, h2, h3, h4, p, li, dt, dd, td, th, figcaption, \.lead \{ overflow-wrap: break-word; \}/);
    });

    it('the feature-page title can shrink below its longest word', () => {
        expect(app).toContain('.feat-titlerow h1 { margin: 0; min-width: 0; }'); // a grid item defaults to min-content
    });

    it('a table too wide for a phone scrolls inside its own box', () => {
        for (const [page, selector] of [['public/standard/index.html', '.doc table'], ['public/wiki/index.html', '.wiki-content table']]) {
            const css = read(page).match(/<style>([\s\S]*?)<\/style>/)[1];
            const mobile = css.match(/@media \(max-width: 640px\) \{([\s\S]*?)\n *\}/);
            expect(mobile, page).toBeTruthy();
            expect(mobile[1], page).toContain(`${selector} { display: block; width: max-content; max-width: 100%; overflow-x: auto; }`);
        }
    });
});
