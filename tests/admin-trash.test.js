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

describe('a user card says where the rest of their roadbooks are (#234)', () => {
    const admin = fs.readFileSync('app/admin.php', 'utf8'), card = fs.readFileSync('public/admin/admin.js', 'utf8');
    it('counts the trashed ones apart, and links to the trash searched for that user', () => {
        expect(admin).toContain("SUM(status <> 'deleted') live, SUM(status = 'deleted') trashed FROM roadbooks GROUP BY user_id");
        expect(admin).toContain("'trashed'    => $rbTrashed[(int)$r['id']] ?? 0,");
        expect(card).toContain('<a href="trash/?q=${encodeURIComponent(u.username)}">+${u.trashed} ${esc(t(\'in the trash\'))}</a>');
        expect(js).toContain("let items = [], days = 30, q = (new URLSearchParams(location.search).get('q') || '').trim();");
    });
});

