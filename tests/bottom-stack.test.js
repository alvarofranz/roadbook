import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The bottom stack (#401). The cookie notice is pinned to the viewport bottom by the shared layer,
   and the Reader pins its action row and CAP bar to that same spot — with the notice's z-index far
   above them, so anything that goes wrong here hands the driver a screen whose Validate button
   cannot be tapped. CSS fails silently and no unit test can measure a real layout, but the contract
   that keeps the two apart IS checkable: the Reader publishes the stack's height and the notice
   offsets by it. Break either half and the notice lands back on the buttons. */

const read = (p) => fs.readFileSync(p, 'utf8');
const appCss = read('public/assets/css/app.css');
const readerJs = read('public/reader/reader.js');

// The `bottom` declaration of a rule, as authored.
const bottomOf = (rule) => rule.match(/(?:^|;)\s*bottom:\s*([^;]+)/)[1].trim();
const baseRule = appCss.match(/^\.cookie-notice \{([^}]*)\}/m)[1];
const mobileRule = appCss.match(/@media \(max-width: 1024px\) \{ \.cookie-notice \{([^}]*)\}/)[1];

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
