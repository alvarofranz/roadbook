import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* User management (/admin/): pinned because both came back once already. */
const html = fs.readFileSync('public/admin/index.html', 'utf8');

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
