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
