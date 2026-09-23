import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { spawnSync } from 'child_process';

/* Second backend review: the one card query, what the public roadbook payload says about its
   owner, and who a completion names. The card shape runs through the real PHP when the machine
   has it (CI runners do), lifted out of roadbooks.php as written. */
const read = (p) => fs.readFileSync(p, 'utf8');
const roadbooks = read('app/roadbooks.php');
const runs = read('app/runs.php');
const events = read('app/events.php');
const fn = (src, name) => {
    const m = src.match(new RegExp(`function ${name}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`));
    expect(m, name).not.toBeNull();
    return m[1];
};
const hasPhp = spawnSync('php', ['-v']).status === 0;

describe('the roadbook card (RB_CARD_SQL + rb_card_fields)', () => {
    it('every listing that draws a card selects it through the one fragment', () => {
        for (const src of [roadbooks, runs, events]) {
            expect(src).not.toContain('SELECT filename FROM roadbook_photos p WHERE p.roadbook_id = r.id ORDER BY p.sort, p.id LIMIT 1) AS thumb\n        FROM');
            expect(src).toContain("'SELECT ' . RB_CARD_SQL . ");
        }
        expect(fn(roadbooks, 'public_list')).toContain("'SELECT ' . RB_CARD_SQL . \", u.username");
        expect(fn(events, 'event_public_get')).toContain("'SELECT ' . RB_CARD_SQL . \", r.category, r.status, u.username, er.scoring_mode");
    });
    it.skipIf(!hasPhp)('shapes a row into the card the client draws', () => {
        const lift = (re) => roadbooks.match(re)[0];
        const code = lift(/const RB_VEHICLES[\s\S]*?function rb_vehicle_list[^\n]*\n/) + lift(/const RB_CARD_SQL[\s\S]*?function rb_card_fields[\s\S]*?\n\}\n/)
            + `echo json_encode([
                rb_card_fields(['id' => '7', 'slug' => 'col', 'title' => 'Col', 'total_distance' => '1200', 'note_count' => '9', 'vehicles' => 'moto,car', 'completions' => '3', 'thumb' => 'a.avif', 'username' => 'max']),
                rb_card_fields(['id' => '8', 'slug' => 'own', 'title' => 'Own', 'total_distance' => '0', 'note_count' => '0', 'vehicles' => '', 'completions' => '0', 'thumb' => null]),
            ]);`;
        const out = spawnSync('php', ['-r', code], { encoding: 'utf8' });
        expect(out.stderr).toBe('');
        expect(JSON.parse(out.stdout)).toEqual([
            { id: 7, slug: 'col', title: 'Col', total_distance: 1200, note_count: 9, username: 'max', vehicles: ['car', 'moto'], completions: 3, thumb: '/photos/7/a.avif' },
            { id: 8, slug: 'own', title: 'Own', total_distance: 0, note_count: 0, username: null, vehicles: ['car'], completions: 0, thumb: null },
        ]);
    });
});

describe('what the public roadbook payload says about its owner', () => {
    it('the username and the avatar — never the real name (#620)', () => {
        const body = fn(roadbooks, 'public_get');
        expect(body).toContain("'owner' => ['username' => $row['username'], 'avatar' => $row['avatar']]");
        expect(body).not.toMatch(/first_name|last_name|u\.bio|email/);
    });
});

describe('who a completion names (#869)', () => {
    it('never a blocked runner, whose run page is a 404', () => {
        expect(fn(runs, 'roadbook_completions')).toContain('AND ru.is_public = 1 AND u.blocked = 0');
        expect(read('public/run/index.php')).toContain('WHERE ru.id = ? AND ru.is_public = 1 AND u.blocked = 0');
    });
});
