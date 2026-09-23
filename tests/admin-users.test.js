import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* User management (/admin/): pinned because both came back once already. */
const html = fs.readFileSync('public/admin/index.html', 'utf8');
const js = fs.readFileSync('public/admin/admin.js', 'utf8');

describe('user management filters (#805)', () => {
    it('the quick filters are icons, their name in the hover tooltip', () => {
        for (const [id, label] of [['userRbFilter', 'With roadbooks'], ['userEvFilter', 'Event organizers']]) {
            const button = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>(.*?)</button>`));
            expect(button).not.toBeNull();
            expect(button[0]).toContain(`data-i18n-title="${label}"`);
            expect(button[1]).toMatch(/^<i class="fa-solid [^"]+"><\/i>$/); // the icon alone, no text
        }
    });
});

describe('user management roadbook preview (#806)', () => {
    it('the caption under the map reads the distance from the roadbook payload (meta), not a list-row field', () => {
        expect(js).toContain('RBSummary(rb.meta.total_distance || 0, rb.notes.length)');
        expect(js).not.toContain('RBSummary(rb.total_distance || 0, (rb.notes');
    });
});
