import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* In-app notifications (#971): one catalog of kinds, one way in, one way out; the read state lives
   on the server so the web and the app always agree; the badge sits on the account icon and the
   app's Profile tab. The first kind: a comment on one of your roadbooks. */
const read = (p) => fs.readFileSync(p, 'utf8');
const srv = read('app/notifications.php'), comments = read('app/comments.php'), api = read('public/api/index.php');
const app = read('public/assets/js/app.js'), css = read('public/assets/css/app.css');
const fnOf = (src, name) => src.match(new RegExp('function ' + name + '\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}\\n'))[1];

describe('the server', () => {
    it('knows its kinds, and never tells anyone about what they did themselves', () => {
        expect(srv).toContain("const NOTIFY_KINDS = ['comment'];");
        const notify = fnOf(srv, 'notify');
        expect(notify).toContain("if (!in_array($kind, NOTIFY_KINDS, true)) throw new InvalidArgumentException(");
        expect(notify).toContain('if ($actorId !== null && $actorId === $userId) return;');
    });
    it('reads and marks only the user’s own', () => {
        expect(fnOf(srv, 'notifications_list')).toContain('WHERE n.user_id = ?');
        const mark = fnOf(srv, 'notifications_read');
        expect(mark).toContain("db()->prepare('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL')->execute([$uid]);");
        expect(mark).toContain("json_out(['ok' => true, 'unread' => notifications_unread_count($uid)]);"); // every change answers with the new count
    });
    it('a comment tells the roadbook’s owner, and a deleted comment takes its notification with it', () => {
        expect(comments).toContain("notify((int)$rb['user_id'], 'comment', $id, (int)$me['id'], ['slug' => $rb['slug'], 'title' => $rb['title'], 'excerpt' => mb_substr($body, 0, 140)]);");
        expect(comments).toContain("notifications_forget('comment', (int)$c['id']);");
    });
    it('the badge comes with the first paint, and every action is signed-in only', () => {
        expect(api).toContain("if ($u) $u['notifications'] = notifications_unread_count((int)$u['id']);");
        for (const a of ['notifications_unread', 'notifications_list', 'notifications_read']) expect(api).toMatch(new RegExp(`case '${a}':\\s+${a}\\(require_user\\(\\)`));
    });
    it('old ones go: read after 90 days, any after a year', () => {
        expect(read('cron/purge-notifications.php')).toContain('(read_at IS NOT NULL AND read_at < NOW() - INTERVAL 90 DAY) OR created_at < NOW() - INTERVAL 365 DAY');
        expect(read('cron/cron.php')).toContain("require_once __DIR__ . '/purge-notifications.php';");
        expect(read('migrations/045_notifications_live_consent.sql')).toContain('CREATE TABLE IF NOT EXISTS notifications (');
    });
});

describe('the client', () => {
    it('one catalog: how a kind reads and where it leads, and an unknown kind is left alone', () => {
        expect(app).toContain('window.RBNotifications = (() => {');
        expect(app).toMatch(/const KINDS = \{\s*comment: \{\s*icon: 'fa-comment',/);
        expect(app).toContain("href: (n) => '/challenge/' + encodeURIComponent(n.data.slug || '') + '#chComments'");
        expect(app).toContain("if (!k) return ''; // a kind this copy of the app does not know yet");
        expect(read('public/challenge/challenge.js')).toContain("if (location.hash === '#chComments') $('chComments').scrollIntoView({ block: 'start' });");
    });
    it('keeps every open page in step with the server: on load, every minute while visible, on coming back', () => {
        expect(app).toContain('const POLL_MS = 60000;');
        expect(app).toContain("setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);");
        expect(app).toContain("document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });");
    });
    it('seeing the list is reading it: no button, everything shown is read, on every device', () => {
        expect(app).toContain("if (r.unread) { const x = await RBApi('notifications_read', {}); if (x.ok) set(x.unread); } else set(0);");
        expect(app).not.toContain('Mark all as read');
        expect(fnOf(srv, 'notifications_read')).not.toContain('ids');
        expect(css).toContain('.notif-row, .notif-row:hover, .notif-row * { text-decoration: none; }');
    });
    it('the badge on the account icon and the Profile tab, and the entry at the top of the account menu', () => {
        expect(app).toContain('<i class="fa-solid fa-circle-user"></i>${RBNotifications.badgeHTML()}');
        expect(app).toContain("tabProfileBtn.insertAdjacentHTML('beforeend', RBNotifications.badgeHTML());");
        expect(app).toContain("const mine = `<button id=\"${p}Notifs\">${menuLabel('fa-bell', 'Notifications')} <span class=\"notif-count\" hidden></span></button>`");
        expect(app).toContain("on('Notifs', () => { closeMenu(); RBNotifications.open(); });");
        expect(css).toContain('.notif-badge { position: absolute;');
        expect(css).toContain('.app-tabbar .tabbar-link { position: relative;');
    });
});
