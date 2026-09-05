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

    it('still positions the CAP bar on the action row', () => {
        expect(readerJs).toContain("setProperty('--capbar-bottom'");
    });

    it('clears the variable when nothing is pinned, so the notice drops back down', () => {
        expect(readerJs).toContain("removeProperty('--bottom-stack')");
    });

    it('re-measures whenever the CAP bar is raised or dropped', () => {
        // the CAP bar is the top of the stack while it is up, so its visibility must never be
        // flipped without a re-measure — showCapBar is the one place allowed to touch it
        const assignments = readerJs.match(/capEls\.bar\.hidden\s*=/g) || [];
        expect(assignments).toHaveLength(1);
        const showCapBar = readerJs.match(/function showCapBar\(up\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(showCapBar).toContain('capEls.bar.hidden = !up;');
        expect(showCapBar).toContain('sizeBottomBars();');
    });

    it('re-measures when the viewport changes', () => {
        expect(readerJs).toContain("window.addEventListener('resize', sizeBottomBars)");
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
