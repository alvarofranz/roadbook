import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* RBDateField (#818): the localized box it shows is a <span> — inline, its padding took no room and
 * the box spilled over the label above it and the row below it (the event dates). */
const css = fs.readFileSync('public/assets/css/app.css', 'utf8');

describe('the shared date field', () => {
    it('lays its display box out as a block', () => {
        expect(css).toMatch(/\.rb-date-display \{ display: block;/);
    });
});
