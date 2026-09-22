import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/* The store listing is copy that ships to Google Play and the App Store, where a description
   that does not describe the app is a POLICY VIOLATION — ours was rejected for exactly that
   after the field labels and limits of `store/listing.md` were pasted into Play's full
   description instead of the description itself (#549). So each field now lives in its own
   plain-text file holding nothing but what goes in that field, and these checks pin the two
   things that go wrong: a field over its limit, and spec text leaking into copy. */

const LOCALES = ['en', 'es', 'it', 'de', 'fr'];
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\n+$/, '');

// field → [directory, max characters]
const PLAY = { title: 30, 'short-description': 80, 'full-description': 4000 };
const APPSTORE = { name: 30, subtitle: 30, keywords: 100, 'promo-text': 170, description: 4000 };

describe('every store field is a file of its own, within its limit (#549)', () => {
    for (const [dir, fields] of [['store/play', PLAY], ['store/appstore', APPSTORE]]) {
        for (const [field, max] of Object.entries(fields)) {
            it(`${dir}/${field} exists in every language and fits`, () => {
                for (const lang of LOCALES) {
                    const file = path.join(dir, `${field}-${lang}.txt`);
                    expect(fs.existsSync(file), `${file} is missing`).toBe(true);
                    const text = read(file);
                    expect(text.length, `${file} is empty`).toBeGreaterThan(0);
                    expect([...text].length, `${file} is over ${max} characters`).toBeLessThanOrEqual(max);
                }
            });
        }
    }
});

describe('a description describes the app — never the spec (#549)', () => {
    // what Play quoted back at us: labels, character limits and the name of our own copy file
    const LEAKS = [/≤\s*\d+/, /listing\.md/i, /Descripci[oó]n (corta|larga)/i, /Short description/i,
        /Full description/i, /App Store name/i, /Subt[ií]tulo/i, /\*\*/, /^\s*[-*]\s+\*\*/m];

    const bodies = () => [...LOCALES.flatMap((l) => [`store/play/full-description-${l}.txt`, `store/appstore/description-${l}.txt`,
        `store/play/short-description-${l}.txt`, `store/appstore/promo-text-${l}.txt`])];

    it('carries no field labels, limits or file names', () => {
        for (const file of bodies()) {
            const text = read(file);
            for (const leak of LEAKS) expect(text, `${file} leaks ${leak}`).not.toMatch(leak);
        }
    });

    it('says what the app does, in its own words', () => {
        for (const lang of LOCALES) {
            const full = read(`store/play/full-description-${lang}.txt`);
            expect(full.length, `${lang} full description is too thin to describe an app`).toBeGreaterThan(400);
            expect(full.toLowerCase()).toContain('rdbk');
            expect(full.toLowerCase()).toContain('gps');
        }
    });

    it('keeps the readable source and the paste files in step', () => {
        const listing = fs.readFileSync('store/listing.md', 'utf8');
        expect(listing).toContain('store/play/');   // the source points at the files to paste
        for (const lang of LOCALES) {
            // the first line of each full description must appear verbatim in the source file
            const first = read(`store/play/full-description-${lang}.txt`).split('\n')[0];
            expect(listing, `${lang}: listing.md and the paste file have drifted`).toContain(first);
        }
    });
});
