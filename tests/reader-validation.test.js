import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The Reader in navigation is the roadbook itself: the notes ARE the interface (#529).
   Validation happens on the note, never on a button competing with it; with Auto on nothing
   but the GPS validates; a note driven past is red; and the readouts the note already carries
   (distance to go, CAP) are not repeated in a bar of their own. */

const read = (p) => fs.readFileSync(p, 'utf8');
const html = read('public/reader/index.html');
const js = read('public/reader/reader.js');
const appCss = read('public/assets/css/app.css');
const LANGS = ['es', 'it', 'de', 'fr'];

describe('validation lives on the note (#529)', () => {
    it('ships no bottom validate button', () => {
        expect(html).not.toContain('validateBtn');
        expect(js).not.toContain('validateBtn');
    });

    it('the active row and its check button are what validate', () => {
        expect(js).toContain('if (i === activeIdx) advanceNote(); else jumpToNote(i);');
        expect(js).toContain('b.onclick = (e) => { e.stopPropagation(); advanceNote(); }');
    });

    it('refuses every manual validation while Auto is on', () => {
        // the guard sits in advanceNote itself, so the row tap, the check button and the
        // remote's next command are all covered by one rule
        const body = js.match(/async function advanceNote\(\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(body).toMatch(/if \(auto\) return toast\(/);
        expect(body.indexOf('if (auto)')).toBeLessThan(body.indexOf('markReached'));
    });

    it('offers the check button only in manual mode', () => {
        expect(js).toContain("!preview && !auto && i === activeIdx");   // rendered row
        expect(js).toContain('if (!auto && notes[activeIdx]');          // state update in place
    });

    it('says how to take over, in every language', () => {
        const msg = 'Auto validation is on — switch it off to validate notes by hand.';
        expect(js).toContain(msg);
        for (const lang of LANGS) expect(read(`public/assets/js/i18n.${lang}.js`), lang).toContain(msg);
    });
});

describe('auto-advance never strands the run (#529)', () => {
    it('asks the core which note the driven segment validates, looking one ahead', () => {
        expect(js).toContain('RB.autoReachedIdx(notes, activeIdx, nextNav(activeIdx + 1), fix.from, here, reachRadius)');
        expect(js).not.toContain('RB.noteReached(an,'); // the single-note gate is no longer the whole rule
    });

    it('prices a note left behind exactly like a skip asked for by hand', () => {
        const body = js.match(/function autoValidate\(i, here\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(body).toContain('RB.skipPenalty(scoredSet, activeIdx, i)');
        expect(body).toContain('extraAccum = 0; armed = false;'); // the overshoot belonged to the note given up
        expect(body).toContain('validateAt(i, here)');
    });

    it('paints a note passed over RED, not a pink easily read as done', () => {
        const hex = appCss.match(/\.nrow\.skipped \{ background: (#[0-9a-f]{6});/)[1];
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        expect(r).toBeGreaterThan(g + 60);
        expect(r).toBeGreaterThan(b + 60);
        expect(g).toBe(b); // a red tint, not a pink one
    });
});

describe('the navigation bars repeat nothing (#529)', () => {
    it('has no CAP bar: the distance to go is on the note, the CAP is printed on it', () => {
        for (const needle of ['capbar', 'capHeading', 'capSpeed', 'capDist', 'capArrow']) {
            expect(html, needle).not.toContain(needle);
            expect(js, needle).not.toContain(needle);
        }
        expect(js).toContain("row.querySelector('.togo')"); // the live distance, on the active row
    });

    it('reads the current speed where the battery used to be', () => {
        expect(html).toContain('id="odoSpeed"');
        expect(html).not.toContain('odoBatt');
        expect(js).not.toContain('watchBattery');
        expect(js).toContain("odoEls.speed.textContent = Math.round(speedKmh || 0) + ' km/h'");
    });
});

describe("the note map is YOUR map: centred on you, turned your way (#536)", () => {
    const rbmap = read('public/assets/js/rbmap.js');

    it('follows every trusted fix instead of freezing where it opened', () => {
        expect(js).toContain('inlineMap.setPosition(here.lat, here.lon, true, meter.heading)');
        expect(js).not.toContain('inlineMap.setPosition(here.lat, here.lon, false');
    });

    it('opens on your position, already turned to your course', () => {
        const open = js.match(/function toggleNoteMap\(i\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(open).toContain('bearing: lastHere ? heading : 0');
        expect(open).toContain('headingToggle: true');                       // north can still be locked
        expect(open).toContain('inlineMap.setPosition(lastHere.lat, lastHere.lon, true,');
        expect(open).toContain('inlineMap.setGuide(lastHere, n)');
    });

    it('a fix that lands before the map can draw is not lost', () => {
        // a course-up map that missed the only fix it had would open north-up with no chevron
        expect(rbmap).toContain('this._lastPos = { lat, lon, follow, heading };');
        expect(rbmap).toContain('_replayPosition()');
        expect(rbmap.match(/if \(this\._lastPos\) this\._replayPosition\(\);/g).length).toBe(2); // load + style swap
        expect(rbmap).toContain('this._lastPos = null;'); // and dropped with the map
    });

    it('the guidance arrow is anchored to the map, so it reads against your own heading', () => {
        const guide = rbmap.match(/setGuide\(from, to\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(guide).toContain("rotationAlignment: 'map'");
        expect(guide).toContain('RB.geo.bearingDeg(from, to) - 90');
    });

    it('asks the core for the course, so a phone with no heading still has one', () => {
        expect(read('public/assets/js/gps-meter.js')).toContain('RB.courseFrom(this.heading, from, here, step.disp, c.heading)');
    });
});
