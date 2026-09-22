import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* Run reports, public profiles, the shared event ranking and app participant mode — the rules in
   the PHP source (no PHP harness in CI, #327). */
const read = (p) => fs.readFileSync(p, 'utf8');
const runs = read('app/runs.php');
const auth = read('app/auth.php');
const events = read('app/events.php');
const router = read('public/api/index.php');
const fn = (src, name) => {
    const m = src.match(new RegExp(`function ${name}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`));
    expect(m, name).not.toBeNull();
    return m[1];
};

describe('run reports (#618 · #619)', () => {
    it('visibility is the report\'s choice, else the standing preference; remember stores it', () => {
        const save = fn(runs, 'run_save');
        expect(save).toContain("$isPublic = ($choice ?? ($pref === 'public' ? 'public' : 'private')) === 'public' ? 1 : 0;");
        expect(save).toContain("if ($choice && !empty($d['remember']))");
    });
    it('a competition run of a scored event roadbook enters its classification', () => {
        expect(fn(runs, 'run_save')).toContain('event_results_access($user, $event, $rbId) !== null');
    });
    it('only the owner changes or deletes a run', () => {
        expect(fn(runs, 'run_update')).toContain('run_owned($user');
        expect(fn(runs, 'run_delete')).toContain('run_owned($user');
    });
    it('the current user carries the runs preference', () => {
        expect(auth).toContain('runs_visibility, default_lat');
    });
});

describe('public profiles (#620)', () => {
    const body = fn(runs, 'profile_get');
    it('never exposes the real name or the email', () => {
        expect(body).toContain('SELECT id, username, bio, organization, avatar, created_at FROM users');
        expect(body).not.toMatch(/first_name|last_name|email/);
    });
    it('shows private runs to their owner only, and counts only public ones', () => {
        expect(body).toContain("($isMe ? '' : ' AND ru.is_public = 1')");
        expect(body).toContain("$pub = array_filter($rows, fn($r) => (int)$r['is_public'] === 1);");
    });
    it('is a public GET', () => {
        expect(router).toMatch(/\$readOnly = \[[^\]]*'profile_get'/);
    });
});

describe('the shared event ranking (#590 · #607 · #608)', () => {
    it('rights are per event: organizers edit, active participants read, scored roadbooks only', () => {
        const access = fn(runs, 'event_results_access');
        expect(access).toContain("if ($mode === false || $mode === 'free') return null;");
        expect(access).toContain("if (event_can_manage($user, $event)) return 'org';");
        expect(access).toContain("status = 'active'");
    });
    it('the same signed result is recognised, another one for a listed vehicle asks first', () => {
        const add = fn(runs, 'ranking_add');
        expect(add).toContain("json_out(['ok' => true, 'duplicate' => true]);");
        expect(add).toContain("json_out(['ok' => true, 'conflict' => true]);");
    });
});

describe('participant mode in the app (#580)', () => {
    it('lives on the Bearer token when there is no session', () => {
        expect(fn(auth, 'participant_context')).toContain('SELECT participant_event_id FROM api_tokens WHERE token_hash = ?');
        expect(fn(auth, 'set_participant_context')).toContain('UPDATE api_tokens SET participant_event_id = ? WHERE token_hash = ?');
    });
    it('a join by code alone (the app\'s /go/ deep link) switches it on', () => {
        expect(fn(events, 'event_join')).toContain("if ($slug === '') set_participant_context((int)$e['id']);");
    });
    it('the client flag follows the server', () => {
        expect(read('public/assets/js/app.js')).toContain("if (participant) { try { localStorage.setItem('rb_participant', '1'); } catch (e) {} }");
    });
});
