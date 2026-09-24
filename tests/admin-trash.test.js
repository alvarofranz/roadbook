import { describe, it, expect } from 'vitest';
import fs from 'fs';
import RB from '../public/assets/js/roadbook-core.js';

/* Admin · Roadbook trash (#187 · #969): searchable by title, author and the day it was deleted,
   paged like every other list, and a deleted user's roadbook is handed to someone real on restore. */
const js = fs.readFileSync('public/admin/trash/admin-trash.js', 'utf8');
const html = fs.readFileSync('public/admin/trash/index.html', 'utf8');

describe('the trash search (#969)', () => {
    it('reads the title, the author and the deletion day — as shown and as ISO', () => {
        expect(js).toContain("filter: (list) => (q ? RB.filterByText(list, q, ['title', 'username', 'deleted_day']) : list),");
        const items = [
            { title: 'Giro del lago', username: 'maurizio', deleted_day: '2026-09-20 20/9/2026' },
            { title: 'Via del Sale', username: 'alvaro', deleted_day: '2026-09-01 1/9/2026' },
        ];
        expect(RB.filterByText(items, 'mauri', ['title', 'username', 'deleted_day']).map((r) => r.title)).toEqual(['Giro del lago']);
        expect(RB.filterByText(items, '2026-09-01', ['title', 'username', 'deleted_day']).map((r) => r.title)).toEqual(['Via del Sale']);
        expect(RB.filterByText(items, 'sale', ['title', 'username', 'deleted_day']).map((r) => r.title)).toEqual(['Via del Sale']);
    });
    it('is paged by the shared list, with the search on the heading row', () => {
        expect(js).toContain('const paged = RBPagedList({');
        expect(html).toContain('id="trashSearch"');
        expect(html).toContain('<div class="pager" id="trashPager"></div>');
    });
    it('a deleted user’s roadbook asks who gets it back', () => {
        expect(js).toContain('if (rb.graveyard) return restoreToUser(rb);');
    });
});
