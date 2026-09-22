import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* Admin and trash rules in the PHP source (no PHP harness in CI, #327). */
const read = (p) => fs.readFileSync(p, 'utf8');
const admin = read('app/admin.php');
const roadbooks = read('app/roadbooks.php');
const router = read('public/api/index.php');
const cron = read('cron/purge-trashed-roadbooks.php');
const fn = (src, name) => {
    const m = src.match(new RegExp(`function ${name}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`));
    expect(m, name).not.toBeNull();
    return m[1];
};

describe('who an admin action may touch (#702)', () => {
    const target = fn(admin, 'admin_target');
    it('the system account is never changed, and another admin only by a superuser', () => {
        expect(target).toContain("if ($row['username'] === GRAVEYARD_USERNAME) fail(");
        expect(target).toContain("if (!$self && is_admin($row) && !is_locked_admin((string)$user['email'])) fail(");
    });
    it('every user-changing action goes through it', () => {
        for (const name of ['admin_verify', 'admin_block', 'admin_update_user', 'admin_set_role', 'admin_delete_user']) {
            expect(fn(admin, name), name).toContain('admin_target($user, $id)');
        }
    });
    it('a user edit validates everything before writing anything', () => {
        const body = fn(admin, 'admin_update_user');
        expect(body.indexOf("strlen($pw) < 8")).toBeLessThan(body.indexOf('UPDATE users SET first_name'));
        expect(body).toContain('strcasecmp($username, GRAVEYARD_USERNAME) === 0');
    });
    it('the UI learns what the server would refuse', () => {
        expect(fn(admin, 'admin_users')).toContain("'system'     => $r['username'] === GRAVEYARD_USERNAME ? 1 : 0");
        expect(fn(admin, 'admin_users')).toContain("'me_super' => is_locked_admin((string)$user['email']) ? 1 : 0");
    });
});

describe('trash lifecycle (#703 · #704)', () => {
    it('restoring to a user is one server step', () => {
        const body = fn(admin, 'admin_rb_restore');
        expect(body).toContain('if ($to > 0) move_roadbook_owner($id, $to);');
    });
    it('a trashed roadbook is never moved (its retention clock would restart)', () => {
        expect(fn(admin, 'admin_move_roadbook')).toContain("if ($row['status'] === 'deleted') fail(");
    });
    it('the cron and the admin button share one purge', () => {
        expect(cron).toContain('purge_expired_trash(200)');
        expect(fn(admin, 'admin_trash_purge_expired')).toContain('purge_expired_trash(200)');
    });
    it('a user can delete their own trashed roadbook forever — only from the trash', () => {
        const body = fn(roadbooks, 'rb_purge');
        expect(body).toContain("WHERE id = ? AND user_id = ? AND status = 'deleted'");
        expect(router).toContain("case 'rb_purge':      rb_purge(require_user(), $d); break;");
    });
    it('the user list and Activity count the same roadbooks', () => {
        expect(fn(admin, 'admin_activity')).toContain("status <> 'deleted'");
    });
});

describe('one trash, drawn the same everywhere (#704)', () => {
    const app = read('public/assets/js/app.js');
    it('the shared helpers exist and both trash pages use them', () => {
        for (const h of ['window.RBTrashNote', 'window.RBTrashRowHTML', 'window.RBConfirmTrash', 'window.RBConfirmPurge']) expect(app).toContain(h);
        for (const page of ['public/myroadbooks/myroadbooks.js', 'public/admin/trash/admin-trash.js']) {
            const src = read(page);
            expect(src, page).toContain('RBTrashRowHTML(');
            expect(src, page).toContain('RBConfirmPurge(');
        }
    });
});
