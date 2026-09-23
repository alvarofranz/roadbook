import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* Access, credential and storage rules of the PHP backend, pinned in its source (no PHP harness
   in CI, #327). */
const read = (p) => fs.readFileSync(p, 'utf8');
const auth = read('app/auth.php');
const admin = read('app/admin.php');
const roadbooks = read('app/roadbooks.php');
const events = read('app/events.php');
const runs = read('app/runs.php');
const router = read('public/api/index.php');
const upload = read('public/api/upload.php');
const fn = (src, name) => {
    const m = src.match(new RegExp(`function ${name}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`));
    expect(m, name).not.toBeNull();
    return m[1];
};

describe('credentials', () => {
    it('a social login that meets an UNVERIFIED account with its email takes it over cleanly', () => {
        const body = fn(auth, 'social_auth');
        expect(body).toContain("SELECT id, blocked, email_verified FROM users WHERE email = ?");
        // a verified account is only linked; its password stays
        expect(body).toContain("if ($linkEmail && (int)$u['email_verified']) {\n            db()->prepare(\"UPDATE users SET $column = ? WHERE id = ?\")");
        // an unverified one loses the password someone else may have set, and every app token
        const claim = body.slice(body.indexOf('} elseif ($linkEmail) {'));
        expect(claim).toContain('password_hash = NULL');
        expect(claim).toContain('email_verified = 1');
        expect(claim).toContain("revoke_api_tokens((int)$u['id']);");
    });
    it('every password change signs the other apps out', () => {
        expect(fn(auth, 'revoke_api_tokens')).toContain('DELETE FROM api_tokens WHERE user_id = ? AND token_hash <> ?');
        expect(fn(auth, 'reset_password')).toContain("revoke_api_tokens((int)$u['id']);");
        // the device changing its own password keeps its token
        expect(fn(auth, 'change_password')).toContain("revoke_api_tokens((int)$user['id'], empty($_SESSION['uid']) ? bearer_token() : null);");
        expect(fn(admin, 'admin_update_user')).toContain('revoke_api_tokens($id);');
    });
    it('reset is rate-limited like the other auth endpoints', () => {
        expect(fn(auth, 'reset_password')).toContain("rate_limit('reset_' . client_ip(), 10, 900);");
    });
    it('the signed-in user is looked up once per request, keyed on the credentials it carries', () => {
        const body = fn(auth, 'current_user');
        expect(body).toContain('static $cache = null;');
        expect(body).toContain("$key = (int)($_SESSION['uid'] ?? 0) . '|' . (bearer_token() ?? '');");
        expect(body).toContain('if ($cache !== null && $cache[0] === $key) return $cache[1];');
        expect(auth).toContain('function current_user_lookup(): ?array {');
    });
});

describe('roadbook media and storage', () => {
    it('gallery photos and voice notes are listed only to who may edit the roadbook (#316)', () => {
        expect(roadbooks).not.toContain('rb_media_readable');
        expect(fn(roadbooks, 'ph_list')).toContain('rb_require_edit($user, $rbId);');
        expect(fn(roadbooks, 'audio_list')).toContain('rb_require_edit($user, $rbId);');
        expect(router).toContain("case 'ph_list':     ph_list(require_user(), $d); break;");
        expect(router).toContain("case 'audio_list':   audio_list(require_user(), $d); break;");
    });
    it('uploading and moving media follows the edit right, never a trashed roadbook', () => {
        expect(upload.match(/\$rb = rb_require_edit\(\$user, \$rbId\);/g).length).toBe(2); // audio + photo
        expect(upload).not.toContain('WHERE id = ? AND user_id = ?');
        expect(upload.match(/rb_assert_quota\(\(int\)\$rb\['user_id'\]/g).length).toBe(2); // the OWNER's quota
        expect(fn(roadbooks, 'ph_move')).toContain('rb_require_edit($user, $rbId);');
    });
    it('a duplicate is charged against the quota before anything is copied', () => {
        const body = fn(roadbooks, 'rb_duplicate');
        expect(body.indexOf('rb_assert_quota(')).toBeGreaterThan(-1);
        expect(body.indexOf('rb_assert_quota(')).toBeLessThan(body.indexOf('beginTransaction'));
    });
    it('rb_list counts the .rdbk file in total_bytes, then drops its storage name', () => {
        const body = fn(roadbooks, 'rb_list');
        expect(body).toContain('slug, updated_at, filename FROM roadbooks');
        expect(body).toContain("unset($rb['filename']);");
    });
    it('co-editing never lists a trashed roadbook', () => {
        expect(fn(roadbooks, 'rb_coedit_list')).toContain("r.status <> \\'deleted\\'");
    });
    it('titles are cut by character, never mid-way through a UTF-8 sequence', () => {
        expect(fn(roadbooks, 'rb_save')).toContain("$title = mb_substr(");
        expect(fn(roadbooks, 'rb_duplicate')).toContain("$title = mb_substr(");
        const save = fn(events, 'event_save');
        for (const v of ['$title', '$desc', '$website']) expect(save).toContain(`${v} = mb_substr(`);
        expect(save).not.toMatch(/[^_]substr\(/);
    });
    it('an abandoned draft loses its row before its files, like every purge', () => {
        const cron = read('cron/cleanup-drafts.php');
        expect(cron.indexOf('DELETE FROM roadbooks')).toBeLessThan(cron.indexOf('purge_roadbook_files((int)'));
    });
});

describe('events', () => {
    it('an organizer never sees an email; a site admin does', () => {
        expect(fn(events, 'event_manage_get')).not.toContain('email');
        const list = fn(events, 'event_participants_list');
        expect(list).toContain('$withEmail = is_admin($user);');
        expect(list).toContain("+ ($withEmail ? ['email' => $x['email']] : [])");
        const page = read('public/admin/events/participants/participants.js');
        expect(page).toContain("${p.email ? '· ' + esc(p.email) + ' ' : ''}");
        expect(page).toContain("...('email' in rows[0] ? ['email'] : [])");
    });
    it('an admin’s event rights reach only roadbooks attached to an event', () => {
        const body = fn(events, 'event_rights_on_roadbook');
        expect(body).not.toContain('if (is_admin($user)) return true;');
        expect(body).toContain("SELECT 1 FROM event_roadbooks WHERE roadbook_id = ? LIMIT 1");
    });
    it('a run enters the shared ranking unverified, and the Ranking page checks its signature', () => {
        expect(fn(runs, 'run_save')).toContain('VALUES (?,?,?,?,NULL,?,?)');
        const page = read('public/ranking/ranking.js');
        expect(page).toContain('results.filter((x) => x.valid === null).map(async (x) => { x.valid = (await RB.verifyMeta(x.meta, key)).valid ? 1 : 0; })');
    });
    it('/go/ asks before it enrols: a GET renders Join, only a same-origin POST joins', () => {
        const go = read('public/go/index.php');
        const post = go.slice(go.indexOf("if ($_SERVER['REQUEST_METHOD'] === 'POST') {"));
        expect(post).toContain('require_same_origin();');
        expect(post.indexOf('require_same_origin();')).toBeLessThan(post.indexOf("event_enrol($event, (int)$user['id']);"));
        expect(go.match(/event_enrol\(/g).length).toBe(1);
        expect(go).toContain('<form method="post" action="/go/<?= $h(rawurlencode($tag)) ?>" class="btnrow center">');
        expect(go).toContain('data-i18n="Join this event as a participant."');
        // someone already in goes straight through
        expect(go).toContain('if ($st->fetch()) go_enter($event);');
    });
});

describe('server-rendered pages', () => {
    it('share one shell and carry no inline style', () => {
        for (const p of ['public/run/index.php', 'public/go/index.php']) {
            const page = read(p);
            expect(page, p).toContain("require dirname(__DIR__, 2) . '/app/page.php';");
            expect(page, p).toContain('<?php page_head_links(); ?>');
            expect(page, p).toContain('<?php page_scripts(); ?>');
            expect(page, p).not.toMatch(/<style|style="/);
        }
        const css = read('public/assets/css/app.css');
        for (const c of ['.page-centered {', '.run-card-img {', '.run-figures {']) expect(css).toContain(c);
    });
});
