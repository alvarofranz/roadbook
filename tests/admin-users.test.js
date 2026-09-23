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

describe('user management at a glance (#910)', () => {
    const js2 = fs.readFileSync('public/admin/admin.js', 'utf8');
    const html2 = fs.readFileSync('public/admin/index.html', 'utf8');
    it('one clean row per user, the whole row opening the user’s sheet', () => {
        expect(js2).toContain('<tr class="u-row" data-user="${u.id}" tabindex="0">');
        expect(js2).toContain('row.onclick = () => openUser(byId[+row.dataset.user]);');
        expect(js2).not.toContain('u-actions');
    });
    it('every action on a user lives in the sheet, Delete apart', () => {
        for (const a of ['edit', 'roadbooks', 'runs', 'activity', 'verify', 'block', 'delete']) expect(js2).toContain(`on('${a}'`);
        expect(js2).toContain("action('delete', 'fa-trash-can', 'Delete user', 'btn-danger')");
    });
    it('sorts on a header tap and filters with icon toggles that combine', () => {
        expect(html2).toContain('<th class="num" data-sort="runs">');
        expect(js2).toContain('for (const key of quick) filtered = filtered.filter(QUICK[key]);');
        for (const q of ['roadbooks', 'events', 'unverified', 'blocked', 'admins']) expect(html2).toContain(`data-quick="${q}"`);
    });
    it('the API gives the runs and the last activity of every user in two grouped queries', () => {
        const php = fs.readFileSync('app/admin.php', 'utf8');
        expect(php).toContain("'runs'       => $runCount[(int)$r['id']] ?? 0,");
        expect(php).toContain('SELECT user_id, MAX(created_at) t FROM activity_log WHERE user_id IS NOT NULL GROUP BY user_id');
    });
});
