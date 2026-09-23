import { describe, it, expect } from 'vitest';
import fs from 'fs';
import RBcore from '../public/assets/js/roadbook-core.js';

/* The events API rules that decide who gets in and what they may see. There is no PHP harness
   in CI (#327), so these pin the rules in the source, the way the rest of the suite pins PHP. */

const read = (p) => fs.readFileSync(p, 'utf8');
const php = read('app/events.php');
const go = read('public/go/index.php');
const fn = (name) => {
    const m = php.match(new RegExp(`function ${name}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`));
    expect(m, name).not.toBeNull();
    return m[1];
};

describe('an unlisted event is reachable by its link (#573)', () => {
    it('is_public never gates the event page, a join, an activation or the /go/ link', () => {
        expect(fn('event_public_get')).not.toMatch(/is_public'\]\)\s*\)?\s*fail/);
        expect(fn('event_public_get')).toContain("if (!$e) fail('Not found.', 404);");
        expect(fn('event_join')).not.toContain('is_public');
        expect(fn('event_activate_by_code')).not.toContain('is_public');
        expect(go).not.toContain('is_public');
    });
    it('still keeps unlisted events out of the public gallery', () => {
        expect(fn('events_public_list')).toContain('WHERE e.is_public = 1');
    });
});

describe('joining is idempotent (#574)', () => {
    it('enrolment never overwrites an existing participant', () => {
        const enrol = fn('event_enrol');
        expect(enrol).toContain('if ($row = $st->fetch()) return [$row[\'status\'], $row[\'activation_code\']];');
        expect(enrol).not.toContain('ON DUPLICATE KEY');
    });
    it('both entry points go through it', () => {
        expect(fn('event_join')).toContain('event_enrol($e, (int)$user[\'id\'])');
        expect(go).toContain('event_enrol($event, (int)$user[\'id\'])');
    });
});

describe('user_search cannot enumerate accounts (#575)', () => {
    const body = fn('user_search');
    it('escapes the user\'s own wildcards and needs 2+ characters', () => {
        expect(php).toContain("function like_term(string $q): string { return '%' . addcslashes($q, '%_\\\\') . '%'; }");
        expect(body).toContain('mb_strlen($q) < 2 && mb_strlen($org) < 2');
    });
    it('matches an email only exactly and never returns one', () => {
        expect(body).toContain('OR email = ?');
        expect(body).not.toMatch(/SELECT id, username[^"]*email/);
        expect(body).not.toContain("'email' =>");
    });
});

describe('codes, activation and slugs', () => {
    it('a join code is 4–16 A–Z/0–9, because it becomes the /go/ link (#576)', () => {
        expect(fn('event_join_code')).toContain("preg_match('/^[A-Z0-9]{4,16}$/', $code)");
    });
    it('activation only turns a pending participant of THIS event active, and names them (#577 · #604)', () => {
        const act = fn('event_activate_participant');
        expect(act).toContain("AND status = 'pending'");
        expect(act).toContain("fail('Not a pending participant of this event.', 404)");
        expect(fn('participant_activate')).not.toContain('INSERT');
        expect(fn('event_activate_by_code')).toContain("WHERE event_id = ? AND activation_code = ? AND status = 'pending'");
    });
    it('the slug freezes once the event is listed (#578)', () => {
        expect(fn('event_save')).toContain("$slug = (int)$cur['is_public'] ? $cur['slug'] : unique_slug('events', $title, 'event', $id);");
    });
    it('a finished event takes no new participants (#587)', () => {
        expect(fn('event_registration_refusal')).toContain("if (event_ended($e)) return 'This event has ended.';");
        expect(fn('event_join')).toContain('event_registration_refusal($e)');
        expect(go).toContain('event_registration_refusal($event)');
    });
    it('a /go/ link that leads nowhere lands on the Events page, which explains it (#579)', () => {
        expect(go).toContain("header('Location: /events/?link=' . $why);");
        expect(go).not.toMatch(/style="|<style/);
        const list = read('public/events/events.js');
        for (const why of ['invalid', 'closed', 'ended']) expect(list).toMatch(new RegExp(`${why}: '`));
    });
    it('the management list says who owns each event (#600)', () => {
        expect(fn('events_manage')).toContain("'is_owner' => is_admin($user) || (int)$r['organizer_id'] === (int)$user['id']");
    });
});

describe('import a participants list (#153)', () => {
    it('finds every email once, in any column, header or not', () => {
        const csv = 'username,first_name,last_name,email,status\npilot,Paola,Pilot,Pilot@Test.local,active\n"x, y",A,B,orga@test.local,pending\nnot an email\norga@test.local';
        expect(RBcore.parseEmailList(csv)).toEqual(['pilot@test.local', 'orga@test.local']);
    });
    it('enrols existing accounts as active, reports the rest, never creates accounts', () => {
        const src = fs.readFileSync('app/events.php', 'utf8');
        const body = src.match(/function event_participants_import\([^)]*\)[^{]*\{([\s\S]*?)\n\}/)[1];
        expect(body).toContain('require_event_manage($user');
        expect(body).toContain("VALUES (?, ?, 'active') ON DUPLICATE KEY UPDATE status = 'active'");
        expect(body).toContain('$missing[] = $email;');
        expect(body).not.toMatch(/INSERT INTO users/);
    });
});
