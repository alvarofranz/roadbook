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

describe('a note\'s material spans the description area (#463)', () => {
    // .col-vignette-empty is display:none, which removes the cell from the grid — without an
    // explicit span the caption auto-placed into the narrow vignette column instead of the
    // description area (flex is inert in grid, so flex:1 never did anything there).
    const app = read('public/assets/css/app.css');

    it('pins the wide caption across the vacated columns', () => {
        const rule = app.match(/\.nrow\.block \.col-text-wide \{([^}]*)\}/);
        expect(rule, 'app.css has no .col-text-wide rule').not.toBeNull();
        expect(rule[1]).toMatch(/grid-column\s*:\s*2\s*\/\s*-1/);
        expect(rule[1]).not.toMatch(/flex\s*:/);
    });

    // The Reader and the public roadbook page render the SAME paper roadbook, and each used to
    // paint that row in its own slightly different shade of paper (#482).
    it('is one rule, not a copy per page', () => {
        for (const page of ['public/reader/index.html', 'public/challenge/index.html']) {
            expect(read(page), page).not.toContain('.nrow.block');
        }
    });
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

    it('old binaries without the bridge do not crash, and dismissing snoozes the battery nag', () => {
        expect(meter).toContain("typeof RBNative.geo.readiness === 'function'");
        expect(meter).toContain("this.snoozed('battery')");
        expect(meter).toContain("self.snooze('battery', 30)");
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
        expect(fn).toContain('live.build > bundled.build');                               // app: the store, live web content ahead of the binary
        expect(fn).toContain('live.version !== running.version || live.build !== running.build'); // web: a shell refresh
    });

    it('names the web content the app carries, and says when it is behind (#515)', () => {
        // "1.8.2" in the app and "1.8.2" on the web can be sixteen builds apart: the semver does
        // not move between store releases, so the BUNDLED build is the number that explains a
        // missing feature.
        expect(fn).toContain("row('Web content in this app', relText(bundled))");
        expect(fn).toContain('const behind = isNativeApp() && live && bundled && live.build > bundled.build');
        expect(fn).toContain('This app was built with older web content');
        const about = read('public/about/about.js');
        expect(about).toContain("fact('Web content in this app', rel(bundled))");
        // the launcher line compares builds too, not just semvers
        expect(app).toContain("parts.push(RBt('web content') + ' ' + bundled.build)");
    });

    it('links what changed and the official site', () => {
        expect(fn).toContain("ROOT}changelog/");
        expect(fn).not.toContain('about/#changelog');
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

    it('gives the status pill its own line and spreads the actions evenly below it', () => {
        // six buttons, or seven for a public roadbook: they share one row instead of leaving one
        // of them stretched alone across the card (#482)
        expect(mobile).toContain('.roadbook-row .rb-status { flex: 1 1 100%; }');
        expect(mobile).toContain('.roadbook-row .btn { flex: 1 1 auto; }');
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
        // one rule for every table written as plain markup — the spec page, the wiki's rendered
        // Markdown and the activity log; the rest are wrapped in .table-scroll
        expect(app).toContain('.doc table, .wiki-content table, .act-table { display: block; width: max-content; max-width: 100%; overflow-x: auto; }');
        for (const page of ['public/standard/index.html', 'public/wiki/index.html']) {
            expect(read(page), `${page} keeps its own copy`).not.toContain('width: max-content');
        }
    });
});

describe('one heading-row pattern, one class (#482)', () => {
    // Title left, actions right, wrapping when there is no room — the "a destra" layout. It had
    // four names across the site (.section-bar · three different .ev-head-row bodies · .sec-head)
    // and a fifth, .card-head, that no stylesheet ever defined, so the Ranking panel's export
    // buttons simply stacked under the title.
    const app = read('public/assets/css/app.css');

    it('app.css carries the layout', () => {
        expect(app).toContain('.head-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;');
        expect(app).toContain('.head-row h1, .head-row h2 { margin: 0; flex: 1; min-width: 12rem; }');
    });

    it('no page re-invents it under another name', () => {
        for (const file of firstPartySources()) {
            for (const dead of ['section-bar', 'ev-head-row', 'sec-head', 'card-head']) {
                expect(read(file), `${file} still uses .${dead}`).not.toContain(dead);
            }
        }
    });
});

describe('every map is the shared map (#482)', () => {
    // Both event HQ maps pasted their own OSM style object: no attribution, and RBMap's layer
    // toggle could not tell which style was showing (it compares by identity against its own).
    it('no page hand-rolls a MapLibre style', () => {
        for (const file of firstPartySources()) {
            if (file.endsWith('assets/js/rbmap.js')) continue;   // the one place that defines them
            const src = read(file);
            expect(/sources:\s*\{[\s\S]{0,200}type:\s*'raster'/.test(src), `${file} declares its own raster style`).toBe(false);
        }
        // RBCoverMap is not an exception to this: it paints tiles straight onto a canvas with no
        // MapLibre and no style object, which is why it names a tile URL of its own.
        expect(read('public/assets/js/cover-map.js')).not.toContain('sources:');
    });

    it('the HQ maps ask RBMap for the street style', () => {
        for (const file of ['public/event/event.js', 'public/admin/events/edit/event-edit.js']) {
            expect(read(file), file).toContain('style: RBMap.STYLE_TOPO');
        }
    });
});

describe('a control row wraps on a phone (#482)', () => {
    // The admin toolbar (search · organization · event · two filters · Create user) ran 814 px
    // wide on a 390 px screen and took the whole page sideways with it, because the shared
    // .toolbar never wrapped. The fields it holds are sized once, in the shared rule — two pages
    // had written the same `flex: 1; max-width: 360px` themselves.
    const app = read('public/assets/css/app.css');

    it('the shared control row wraps and owns its field sizing', () => {
        expect(app).toContain('.rb-toolbar, .toolbar { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }');
        expect(app).toContain('.toolbar .field { flex: 1; max-width: 360px; margin: 0; }');
        expect(app).toMatch(/@media \(max-width: 560px\) \{\s*\n\s*\.toolbar \.field \{ flex: 1 1 100%; max-width: none; \}/);
    });

    it('no page re-declares the field sizing', () => {
        for (const page of ['public/admin/index.html', 'public/admin/events/participants/index.html']) {
            expect(read(page), page).not.toMatch(/\.field \{ flex: 1; max-width: 360px/);
        }
    });
});

describe('a thumbnail that fails to load falls back to the placeholder (#482)', () => {
    const app = read('public/assets/js/app.js');

    it('listens for the error in one place, in the capture phase', () => {
        expect(app).toContain("document.addEventListener('error'");
        expect(app).toContain("placeholder.className = 'thumb thumb-placeholder'");
        expect(app).toMatch(/\}, true\);/); // `error` does not bubble
    });
});

describe('per-note map guidance line + 1 cm arrow (#485)', () => {
    const rbmap = read('public/assets/js/rbmap.js');
    const css = read('public/assets/css/app.css');
    const reader = read('public/reader/reader.js');

    it('RBMap paints the guidance through a dedicated source, cleared with nulls', () => {
        expect(rbmap).toContain("m.addSource('rb-guide'");
        expect(rbmap).toMatch(/setGuide\(from, to\)/);
        expect(rbmap).toContain('rb-guide-arrow');
    });

    it('the arrow keeps a physical centimetre at any zoom and points along the bearing', () => {
        expect(css).toMatch(/\.rb-guide-arrow\s*\{[^}]*width:\s*1cm/);
        expect(rbmap).toContain('bearingDeg(from, to) - 90'); // artwork points east; rotation 0 is north
    });

    it('the reader draws the guide on open and follows the live fix', () => {
        expect(reader).toContain('inlineMap.setGuide(lastHere, n)');
        expect(reader).toContain('inlineMap.setGuide(here, notes[inlineMapIdx])');
    });

    it('the guide survives style swaps and dies with the map', () => {
        expect(rbmap).toContain('if (this._lastGuide) this.setGuide(this._lastGuide.from, this._lastGuide.to)');
        expect(rbmap).toContain('this._guideArrow.remove()');
    });
});

describe('activity log modal, filtered by user type (#448)', () => {
    const app = read('public/assets/js/app.js');

    it('both account menus link My activity to the shared modal', () => {
        // one builder feeds the desktop dropdown ('acc') and the tab-bar dropup ('tab'), so the
        // item exists in both and the wiring is written once (#495)
        expect(app).toContain('`<button id="${p}Activity">${menuLabel(\'fa-clock-rotate-left\', \'My activity\')}</button>`');
        expect(app).toContain("accountMenuHTML(user, participant, 'acc')");
        expect(app).toContain("accountMenuHTML(user, participant, 'tab')");
        expect(app).toContain("on('Activity', () => { closeMenu(); window.RBActivityLog(); });");
    });

    it('plain users stay scoped to self while admins may pick any user', () => {
        const fn = app.match(/window\.RBActivityLog = async function \(\) \{([\s\S]*?)\n    \};/)[1];
        expect(fn).toContain("RBApi('activity_mine'");
        expect(fn).toContain("RBApi('admin_activity'");
        expect(fn).toContain('user_search');
    });
});

describe('modal confirm order + dismiss paths (#490)', () => {
    const app = read('public/assets/js/app.js');
    const reader = read('public/reader/reader.js');
    const editor = read('public/editor/editor.js');
    const parts = read('public/admin/events/participants/participants.js');

    it('RBConfirm puts the ghost dismiss first and the primary action last', () => {
        // source order lies (the data-yes const is built first): assert on the rendered row
        const fn = app.slice(app.indexOf('window.RBConfirm = '));
        const row = fn.match(/<div class="btnrow end">([\s\S]*?)<\/div>`/)[1];
        expect(row).toContain('data-no'); // the affirmative button is the ${ok} interpolation after it
        expect(row.indexOf('data-no')).toBeLessThan(row.indexOf('${ok}'));
    });

    it('the editor consistency and unsaved-changes rows end with the primary action', () => {
        for (const id of ['ckSave', 'ccSave']) {
            const row = editor.match(new RegExp(`<div class="btnrow center wrap">([\\s\\S]*?id="${id}"[\\s\\S]*?)</div>`))[1];
            expect(row.lastIndexOf('btn-ghost')).toBeLessThan(row.lastIndexOf('btn-primary'));
        }
    });

    it('the QR scanner stops the camera on every dismiss path, and Cancel is wired', () => {
        expect(parts).toContain('() => stopStream()'); // onDismiss: backdrop + Escape
        expect(parts).toContain('modal.close = function() { stopStream(); origClose(); };'); // buttons
        expect(parts).toContain("modal.q('.modal-close').onclick = () => modal.close();");
        expect(parts).toContain('document.body.contains(modal.el)'); // the scan loop ends too
    });

    it('the reader roadbook picker has an explicit Close row', () => {
        // the picker itself is the shared RBRowPicker now (#493) — it owns the Close row, so every
        // picker built on it keeps the explicit exit this contract was written for
        expect(reader).toContain("title: 'Your roadbooks'");
        expect(read('public/assets/js/app.js')).toContain('window.RBRowPicker = ');
        expect(read('public/assets/js/app.js')).toContain('<button class="btn btn-ghost modal-close">${RBesc(RBt(\'Close\'))}</button>');
    });
});

describe('async actions report on their own button (#491)', () => {
    // RBBusy disables + spins, then ticks or resets: the operation reports where it was
    // launched, so a second tap cannot double-submit and silence never reads as failure.
    const cases = [
        ['public/assets/js/app.js', "[data-dup]"],
        ['public/assets/js/app.js', "[data-del]"],
        ['public/myroadbooks/myroadbooks.js', "[data-restore]"],
        ['public/reader/reader.js', "'pickMine'"],
        ['public/admin/admin.js', "[data-org]"],
        ['public/admin/admin.js', "[data-verify]"],
        ['public/admin/admin.js', "[data-block]"],
        ['public/admin/admin.js', "[data-trash]"],
        ['public/admin/admin.js', "'#euSave'"],
        ['public/admin/admin.js', "'#cuSave'"],
        ['public/admin/events/edit/event-edit.js', "'evSave'"],
        ['public/admin/events/edit/event-edit.js', "'joinRotate').onclick"],
        ['public/admin/events/edit/event-edit.js', "'joinClear').onclick"],
        ['public/admin/events/edit/event-edit.js', "'joinSetBtn').onclick"],
        ['public/admin/events/participants/participants.js', "'ppActivateAll'"],
        ['public/admin/events/participants/participants.js', "'ppActivate'"],
        ['public/account/account.js', "'loginForm'"],
        ['public/account/account.js', "'registerForm'"],
        ['public/account/account.js', "'delForm'"],
        ['public/account/account.js', "'pfSave'"],
        ['public/event/event.js', "'#evJoinOpenBtn'"],
        ['public/event/event.js', "'#evJoinBtn'"],
    ];
    for (const [file, marker] of cases) {
        it(`${file} reports around ${marker}`, () => {
            const src = read(file);
            const at = src.indexOf(marker);
            expect(at, `${marker} not found in ${file}`).toBeGreaterThan(-1);
            const window = src.slice(Math.max(0, at - 1500), at + 1500);
            expect(window, `${file} ${marker} has no RBBusy/disabled feedback`).toMatch(/RBBusy|busySubmit|disabled\s*=\s*true/);
        });
    }
});

describe('the app keeps its tab-bar chrome at every width (#484)', () => {
    // The native app shows its bottom tab bar on ANY screen, so a rule that hides mobile chrome
    // above the desktop breakpoint has to exclude it. On an iPad in landscape (1080 px) the
    // profile tab sat there with `display: none` on the menu behind it: tapping it did nothing.
    const app = read('public/assets/css/app.css');

    it('the profile dropup is hidden above the breakpoint on the WEB only', () => {
        expect(app).toContain('@media (min-width: 1025px) { html:not(.native) .tabbar-dropup { display: none; } }');
    });

    it('every piece of tab-bar chrome carries its .native counterpart', () => {
        for (const selector of ['.app-tabbar', '.lang-mobile', '.app-chip-stack', '.fabrow']) {
            expect(app, `${selector} has no .native rule`).toContain(`.native ${selector}`);
        }
    });
});

describe('the UI says "note"; only the data keeps wp_* (#494)', () => {
    // A nota IS a GPX waypoint, so the user-facing word is "note" everywhere — while `wp_type`,
    // `wp_radius` and the GPX/OpenRally vocabulary stay exactly as they are, on disk and in the
    // export dialogs that talk about the GPX file itself.
    it('no control is labelled Waypoint any more', () => {
        for (const file of firstPartySources()) {
            expect(read(file), file).not.toMatch(/data-i18n(?:-[a-z]+)?="Waypoints?"/);
            expect(read(file), file).not.toMatch(/RBt\('Waypoints?'\)|[^A-Za-z]t\('Waypoints?'\)/);
        }
    });

    it('the controls that drop one say Note', () => {
        expect(read('public/recorder/index.html')).toContain('<span data-i18n="Note">Note</span>');
        expect(read('public/editor/index.html')).toContain('id="recWaypoint" data-i18n="Note"');
        for (const page of ['public/recorder/index.html', 'public/tripmaster/index.html']) {
            expect(read(page), page).toContain('<div class="key" data-i18n="Notes">Notes</div>');
        }
    });

    it('the format keys are untouched', () => {
        const core = read('public/assets/js/roadbook-core.js');
        for (const key of ['wp_type', 'wp_radius', 'default_wp_radius']) expect(core, key).toContain(key);
    });
});

describe('an open menu follows a language switch (#495)', () => {
    const app = read('public/assets/js/app.js');

    it('every account-menu label is a data-i18n span, not painted once by RBt', () => {
        expect(app).toContain('const menuLabel = (icon, label) =>');
        expect(app).toContain('<span data-i18n="${RBesc(label)}">${RBesc(RBt(label))}</span>');
    });

    it('the footer has no hard-coded label left', () => {
        const footer = app.match(/footer\.innerHTML = `([\s\S]*?)`;/);
        expect(footer, 'footer markup not found').toBeTruthy();
        expect(footer[1]).not.toContain('The .rdbk standard</a>');
        expect(footer[1]).toContain('${RBSiteLinksHTML()}');    // the shared list, every label translated (#496)
        expect(app).toContain("label: 'The .rdbk standard'");
    });

    it('the launcher tiles name themselves through i18n', () => {
        const home = read('public/index.html');
        expect(home).toContain('<span class="launch-name" data-i18n="Recorder">Recorder</span>');
        expect(home).toContain('<span class="launch-name" data-i18n="Editor">Editor</span>');
        expect(home).toContain('data-i18n-aria="RDBK sections"');
    });
});

describe('one picker, one pager, one empty-state vocabulary (#493)', () => {
    const app = read('public/assets/js/app.js');

    it('every pick-one dialog is the shared picker, with its search box', () => {
        expect(app).toContain('window.RBRowPicker = ');
        for (const [file, title] of [
            ['public/reader/reader.js', "title: 'Your roadbooks'"],
            ['public/assets/js/challenges.js', "title: 'Public Roadbooks'"],
            ['public/admin/trash/admin-trash.js', "title: 'Restore'"],
            ['public/admin/admin.js', "title: 'Move'"],
        ]) {
            const src = read(file);
            expect(src, `${file} does not use RBRowPicker`).toContain('RBRowPicker({');
            expect(src, file).toContain(title);
        }
    });

    it('no list keeps its own prev/next pager', () => {
        for (const file of firstPartySources()) {
            expect(read(file), `${file} hand-rolls a pager`).not.toMatch(/id="log(Prev|Next)"|mvSearch|rtSearch/);
        }
        expect(read('public/admin/logs/admin-logs.js')).toContain("RBPager($('logPager')");
    });

    it('a search that finds nothing says the same thing everywhere', () => {
        for (const file of firstPartySources()) {
            expect(read(file), file).not.toContain('No matching users.');
            expect(read(file), file).not.toContain('No matching roadbooks.');
        }
    });

    it('the copy-link control is one helper, on every public roadbook card', () => {
        expect(app).toContain('window.RBCopyLinkOverlay = ');
        for (const file of ['public/roadbooks/roadbooks.js', 'public/reader/reader.js', 'public/event/event.js']) {
            expect(read(file), file).toContain('RBCopyLinkOverlay(');
        }
    });

    it('the ranking tells offline apart from "not a participant"', () => {
        const ranking = read('public/ranking/ranking.js');
        expect(ranking).toContain('function gate(reason)');
        expect(ranking).toContain("navigator.onLine === false ? 'You are offline — reconnect to load this event.'");
    });
});

describe('site chrome comes from one list; the error pages stand alone (#496)', () => {
    const app = read('public/assets/js/app.js');

    it('the footer and the Profile page render the SAME site links', () => {
        expect(app).toContain('const SITE_LINKS = [');
        expect(app).toContain('window.RBSiteLinksHTML = ');
        expect(app).toContain('${RBSiteLinksHTML()}');                 // the footer
        expect(app).toContain("document.getElementById('accSiteLinks')"); // the Profile page
        // the Profile page no longer keeps a hand-written copy that can drift
        const account = read('public/account/index.html');
        expect(account).toContain('id="accSiteLinks"');
        expect(account).not.toContain('href="../terms/" data-i18n="Terms of Use"');
    });

    it('the three error pages carry the same stylesheet, on purpose', () => {
        const css = ['403', '404', '500'].map((code) => {
            const page = read(`public/${code}.html`);
            expect(page, `${code} must load no script`).not.toMatch(/<script[^>]*src=/);
            expect(page, `${code} must load no stylesheet`).not.toMatch(/<link[^>]*rel="stylesheet"/);
            expect(page, `${code} must explain why it is self-contained`).toContain('Deliberately SELF-CONTAINED');
            return page.match(/<style>([\s\S]*?)<\/style>/)[1];
        });
        expect(css[0], '403 and 404 have drifted apart').toBe(css[1]);
        expect(css[1], '404 and 500 have drifted apart').toBe(css[2]);
    });
});

describe('cron health is measured on the server\'s clock (#505)', () => {
    // Reported from production: "Last cron run: 17:53 — 120 minutes ago", read at 17:54. The log
    // is written with the SERVER's clock and the age was measured against the BROWSER's, so every
    // admin in another timezone saw a healthy cron as hours stale.
    const src = read('public/admin/logs/admin-logs.js');
    const body = src.match(/function cronHealth\(log, serverNow\) \{([\s\S]*?)\n    \}/)[1];
    // eslint-disable-next-line no-new-func
    const cronHealth = new Function('log', 'serverNow', body);
    const log = '[2026-09-16 17:52:01] task 2\n[2026-09-16 17:53:01] task 3\n';

    it('a run one minute ago reads as healthy, whatever timezone the admin is in', () => {
        const h = cronHealth(log, '2026-09-16 17:54:10');
        expect(h.state).toBe('ok');
        expect(h.minutes).toBe(1);
    });

    it('a runner that stopped hours ago still reads as stale', () => {
        expect(cronHealth(log, '2026-09-16 19:30:00').state).toBe('stale');
    });

    it('an empty log means it never ran', () => {
        expect(cronHealth('', '2026-09-16 17:54:10').state).toBe('never');
    });

    it('the endpoint sends the clock the log was written with', () => {
        expect(read('app/settings.php')).toContain("'now' => date('Y-m-d H:i:s')");
        expect(src).toContain('cronHealth(r.cron, r.now)');
    });
});

describe('the editor never edits what the author wrote (#521)', () => {
    const editor = read('public/editor/editor.js');
    const canvas = read('public/assets/js/note-canvas.js');

    it('an unresolved icon is reported, never written into the note or swapped in the data', () => {
        expect(editor).toContain('async function reportUnresolvedIcons()');
        expect(editor).toContain("toast(t('Some icons could not be found')");
        // the pass that rewrote `n.text` and `ic.name` is gone
        expect(editor).not.toContain('Note: add icon');
        expect(editor).not.toContain('MISSING_ICON_FALLBACK');
        expect(editor).not.toContain('flagUnresolvedIcons');
    });

    it('the vignette draws the placeholder instead, so only the picture changes', () => {
        expect(canvas).toContain("im.addEventListener('error'");
        expect(canvas).toContain('this.missingIcon');
        expect(editor).toContain("missingIcon: '../assets/icons/W28_general_danger.svg'");
    });

    it('opening a roadbook leaves no checkpoint behind', () => {
        // the automatic pass used to markDirty() during load, so the next visit offered to recover
        // work that had already been saved
        const fn = editor.match(/async function reportUnresolvedIcons\(\) \{([\s\S]*?)\n    \}/)[1];
        expect(fn).not.toContain('markDirty');
        expect(fn).not.toContain('renderNotes');
    });

    it('Del removes what is selected on the vignette, not the note holding it', () => {
        expect(editor).toContain("editorOpen && canvas.sel && k === 'del'");
        expect(editor).toContain('canvas.deleteSelected()');
        expect(canvas).toContain('deleteSelected() {');
        // both trash buttons go through the same method
        expect(canvas.match(/\[data-a="del"\]'\)\.onclick = \(\) => this\.deleteSelected\(\);/g).length).toBe(2);
    });

    it('the vignette bar says what it acts on', () => {
        expect(canvas).toContain("label('Icon tools')");
        expect(canvas).toContain("label('Junction tools')");
        for (const lang of ['es', 'it', 'de', 'fr']) {
            expect(read(`public/assets/js/i18n.${lang}.js`), lang).toContain("'Icon tools'");
        }
    });

    it('the note list keeps its scrollbar visible', () => {
        const css = read('public/editor/index.html').match(/<style>([\s\S]*?)<\/style>/)[1];
        expect(css).toContain('scrollbar-gutter: stable');
        expect(css).toMatch(/#noteList::-webkit-scrollbar \{ width: 10px; \}/);
    });
});

describe('a map-shaped field is stored as an object (#523)', () => {
    const php = read('app/roadbooks.php');

    it('the server shapes the icon map on the way in and on the way out', () => {
        expect(php).toContain('function rb_shape_maps(array $rb): array');
        expect(php).toContain("$rb['icons'] = new stdClass();");
        // both save branches and both read paths go through it
        expect(php.match(/json_encode\(rb_shape_maps\(\$rb\)\)/g).length).toBe(2);
        expect(php.match(/rb_shape_maps\(\(array\)json_decode/g).length).toBe(2);
    });

    it('the editor never writes an icon onto a list', () => {
        expect(read('public/editor/editor.js')).toContain('if (Array.isArray(rb.icons) || !rb.icons) rb.icons = {};');
        expect(read('public/assets/js/roadbook-core.js')).toContain('rb.icons = (rb.icons && !Array.isArray(rb.icons)) ? rb.icons : {};');
    });
});

describe('a refused media delete says why (#525)', () => {
    const editor = read('public/editor/editor.js');
    const php = read('app/roadbooks.php');

    it('every media delete reports its outcome on the button that was pressed', () => {
        for (const call of ["RBApi('ph_delete'", "RBApi('audio_delete'"]) {
            let at = -1;
            while ((at = editor.indexOf(call, at + 1)) !== -1) {
                const window_ = editor.slice(at - 260, at + 320);
                expect(window_, `${call} throws its answer away`).toMatch(/if \(!r\.ok\)/);
                expect(window_, `${call} gives no busy feedback`).toContain('RBBusy(');
            }
        }
        expect(editor).toContain("toast(r.error || 'Could not delete the photo.')");
        expect(editor).toContain("toast(r.error || 'Could not delete the voice note.')");
    });

    it('whoever may edit a roadbook may delete its media', () => {
        const fn = php.match(/function rb_media_delete\([\s\S]*?\n\}/)[0];
        expect(fn).toContain('rb_require_edit($user, (int)$row[\'roadbook_id\'])'); // owner OR event co-editor
        expect(fn, 'still owner-only').not.toContain('r.user_id = ?');
    });
});

describe('the note editor leads with the icons (#527 · #530)', () => {
    const html = read('public/editor/index.html');
    const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    const editor = read('public/editor/editor.js');

    it('one slim row carries the search and both ways to add an icon', () => {
        const bar = html.match(/<div class="icon-bar">([\s\S]*?)<\/div>/)[1];
        expect(bar).toContain('id="iconSearch"');
        expect(bar).toContain('id="pasteIconBtn"');
        expect(bar).toContain('id="addIconBtn"');
    });

    it('the selection\'s own tools name themselves and take no space when there is no selection', () => {
        expect(html).toContain('<div id="noteToolbar" class="icon-tools"></div>');
        expect(css).toContain('.icon-tools:empty { display: none; }');
        expect(read('public/assets/js/note-canvas.js')).toContain("label('Icon tools')");
        expect(html, 'a standing title is what the empty bar replaced').not.toContain('icon-tools-title');
    });

    it('the gallery comes before the note parameters', () => {
        const zone = html.slice(html.indexOf('class="vig-icons"'), html.indexOf('id="commentForm"'));
        expect(zone.indexOf('id="iconGrid"')).toBeGreaterThan(-1);
        expect(zone.indexOf('id="iconGrid"'), 'the parameters still come first').toBeLessThan(zone.indexOf('id="roadSlot"'));
    });

    it('the palette is a two-row strip of equal tiles that scrolls sideways', () => {
        expect(css).toContain('grid-auto-flow: column');
        expect(css).toMatch(/\.icon-grid \{[^}]*grid-template-rows: repeat\(2, 58px\)/);
        expect(css).toContain('overflow-x: auto');
        expect(css).toContain('overflow-y: hidden');
        expect(css, 'a leftover height cap keeps it a tall box').not.toMatch(/\.icon-grid \{[^}]*max-height/);
        // the tile fills its row, so no icon is cropped by a box taller than itself…
        expect(css).toMatch(/\.icon-grid img \{[^}]*height: 100%/);
        // …and the remove badge sits INSIDE the tile, where the strip's overflow cannot clip it
        const badge = css.match(/\.del-badge \{([^}]*)\}/)[1];
        expect(badge).not.toMatch(/top: -/);
        expect(badge).not.toMatch(/right: -/);
    });

    it('the strip is icons only — no sideways labels; the chips name the groups', () => {
        expect(editor).toContain('data-cat="${esc(cat)}"');       // the category rides on each tile
        expect(editor).not.toContain('class="icon-category" data-cat'); // no in-strip headers
        expect(css).not.toContain('writing-mode: vertical-rl');
    });

    it('every category chip is one word', () => {
        const cats = Object.keys(JSON.parse(read('public/assets/icons/index.json')).categories);
        expect(cats.length).toBeGreaterThan(3);
        for (const c of cats) expect(c, c).toMatch(/^\S+$/);
    });
});

describe('changing the roadbook default offers to apply it to every note (#532)', () => {
    const editor = read('public/editor/editor.js');
    const handler = editor.match(/\$\('cfgWpRadius'\)\.onchange = async \(e\) => \{([\s\S]*?)\n {4}\};/)[1];

    it('asks before rewriting radii the author set by hand', () => {
        expect(handler).toContain("RBConfirm(t('Also replace all current notes in this roadbook to {v} m?')");
        expect(handler).toContain("replace('{v}', v)");
    });

    it('never touches a note without a Yes', () => {
        const apply = handler.slice(handler.indexOf('RBConfirm'));
        expect(apply).toContain('n.wp_radius = v');
        // the old silent fill wrote the value into every note with none, unasked
        expect(handler, 'a silent fill is back').not.toContain('if (n.wp_radius == null) n.wp_radius = v');
        expect(handler.indexOf('n.wp_radius = v')).toBeGreaterThan(handler.indexOf('RBConfirm'));
    });

    it('clearing the field just drops the default', () => {
        expect(handler).toContain("delete rb.meta.default_wp_radius");
        expect(handler.indexOf('delete rb.meta.default_wp_radius')).toBeLessThan(handler.indexOf('RBConfirm'));
    });

    it('is translated everywhere', () => {
        for (const lang of ['es', 'it', 'de', 'fr']) {
            const dict = read(`public/assets/js/i18n.${lang}.js`);
            expect(dict, lang).toContain("'Also replace all current notes in this roadbook to {v} m?':");
            expect(dict, lang).toContain('{v}');           // the number survives the translation
            expect(dict, lang).toContain("'Every note now validates at this radius.':");
        }
    });
});

describe('the note says which detection radius applies (#530)', () => {
    const editor = read('public/editor/editor.js');
    const html = read('public/editor/index.html');

    it('asks the runtime for the inherited value instead of re-implementing the chain', () => {
        expect(editor).toContain('RB.detectionRadius({ wp_type: n.wp_type }, rb.meta)');
    });

    it('shows the number in force as the placeholder, with no prose under the field', () => {
        expect(editor).toContain('placeholder="${inherited}"');
        expect(editor).toContain("labelHelp('Detection radius', 'help.radius')");
        expect(editor, 'a hint line is back under the field').not.toContain('prop-hint');
    });

    it('calls the roadbook-wide one by the same name', () => {
        expect(html).toContain('data-i18n="Default detection radius (m)"');
    });

    it('is translated everywhere, and the help text states the real system default', () => {
        for (const lang of ['es', 'it', 'de', 'fr']) {
            const dict = read(`public/assets/js/i18n.${lang}.js`);
            for (const key of ['Detection radius', 'Default detection radius (m)']) {
                expect(dict, `${lang}: ${key}`).toContain(`'${key}':`);
            }
        }
        // CONST.REACH_DEFAULT_M is 50 m — the help used to promise 30
        const core = read('public/assets/js/roadbook-core.js');
        expect(core).toContain('REACH_DEFAULT_M: 50');
        expect(read('public/assets/js/i18n.js')).toContain('then the 50 m system default');
    });
});

describe('admin user roadbooks preview on a map inside the same popup (#552)', () => {
    const admin = read('public/admin/admin.js');
    const html = read('public/admin/index.html');

    it('the page loads MapLibre + RBMap', () => {
        expect(html).toContain('maplibre-gl@5.24.0/dist/maplibre-gl.js');
        expect(html).toContain('assets/js/rbmap.js');
    });

    it('the dialog holds the list and the map side by side', () => {
        expect(admin).toContain('rb-split');
        expect(admin).toContain('id="rbsMap"');
        expect(html).toContain('.rb-split');
        expect(html).toContain('#rbsMap');
        // .modal-card.wide is 520px and would crush the grid: the map variant
        // must out-specify it, and stack below desktop widths
        expect(html).toContain('.modal-card.wide.rb-list-map');
        expect(html).toContain('@media (max-width: 1024px)');
    });

    it('the list search actually filters', () => {
        expect(admin).toContain("m.q('#rbsSearch').oninput");
    });

    it('opening a roadbook previews it in the popup via admin_rb_get + RBMap', () => {
        expect(admin).toContain('data-view');
        expect(admin).toContain("api('admin_rb_get'");
        expect(admin).toContain('showRoadbook');
        expect(admin).toContain('rbMap.destroy()');
    });

    it('the new labels are translated everywhere', () => {
        for (const lang of ['es', 'it', 'de', 'fr']) {
            const dict = read(`public/assets/js/i18n.${lang}.js`);
            for (const key of ['View on map', 'Open in Reader', 'Select a roadbook to preview it on the map.', 'No route yet.']) {
                expect(dict, `${lang}: ${key}`).toContain(`'${key}':`);
            }
        }
    });
});
