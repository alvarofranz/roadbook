<?php
/* In-app notifications (#971): what happened for a user while they were elsewhere, behind the badge
 * on their account icon — on the web and in the app alike. The read state lives here, on the
 * server, so reading one anywhere clears it everywhere.
 *
 * One way in (notify), one way out when the thing it is about goes (notifications_forget). A kind is
 * a name in NOTIFY_KINDS plus the few words its row shows (`data`, written once); the client's
 * RBNotifications catalog says how each kind reads and where it leads. Adding a kind = one name
 * here, one entry there, one notify() where it happens. */

const NOTIFY_KINDS = ['comment']; // a comment on one of your roadbooks
const NOTIFY_PAGE = 20;

// Tell $userId that $kind happened ($subjectId: the thing it is about; $actorId: who did it).
// Nobody is told about what they did themselves.
function notify(int $userId, string $kind, ?int $subjectId, ?int $actorId, array $data): void {
    if (!in_array($kind, NOTIFY_KINDS, true)) throw new InvalidArgumentException('Unknown notification kind: ' . $kind);
    if ($actorId !== null && $actorId === $userId) return;
    db()->prepare('INSERT INTO notifications (user_id, kind, subject_id, actor_id, data) VALUES (?,?,?,?,?)')
        ->execute([$userId, $kind, $subjectId, $actorId, json_encode($data, JSON_UNESCAPED_UNICODE)]);
}

// The thing a notification was about is gone (a deleted comment): so is the notification
function notifications_forget(string $kind, int $subjectId): void {
    db()->prepare('DELETE FROM notifications WHERE kind = ? AND subject_id = ?')->execute([$kind, $subjectId]);
}

function notifications_unread_count(int $userId): int {
    $st = db()->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL');
    $st->execute([$userId]);
    return (int)$st->fetchColumn();
}

// The badge's number, polled by every open page
function notifications_unread(array $me): void {
    json_out(['ok' => true, 'unread' => notifications_unread_count((int)$me['id'])]);
}

// A page of the user's notifications, newest first (`before`: the last id already shown)
function notifications_list(array $me, array $d): void {
    $before = (int)($d['before'] ?? 0);
    $st = db()->prepare('SELECT n.id, n.kind, n.data, n.created_at, n.read_at, u.username AS actor, u.avatar AS actor_avatar
        FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
        WHERE n.user_id = ?' . ($before > 0 ? ' AND n.id < ?' : '') . ' ORDER BY n.id DESC LIMIT ' . (NOTIFY_PAGE + 1));
    $st->execute($before > 0 ? [(int)$me['id'], $before] : [(int)$me['id']]);
    $rows = $st->fetchAll();
    $more = count($rows) > NOTIFY_PAGE;
    $items = array_map(fn($r) => [
        'id' => (int)$r['id'], 'kind' => $r['kind'], 'data' => json_decode((string)$r['data'], true) ?: [],
        'actor' => $r['actor'], 'actor_avatar' => $r['actor_avatar'], 'created_at' => $r['created_at'], 'read' => $r['read_at'] !== null,
    ], array_slice($rows, 0, NOTIFY_PAGE));
    json_out(['ok' => true, 'items' => $items, 'more' => $more, 'unread' => notifications_unread_count((int)$me['id'])]);
}

// Seeing the list is reading it: every unread one of the user's own is marked read
function notifications_read(array $me, array $d): void {
    $uid = (int)$me['id'];
    db()->prepare('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL')->execute([$uid]);
    json_out(['ok' => true, 'unread' => notifications_unread_count($uid)]);
}
