<?php
/* Public comments on a public roadbook (#809): anyone reads them (#884), signed-in readers write them under the roadbook on
 * its page (/challenge/<slug>) — never while navigating it. Posting is guarded by Turnstile and a
 * rate limit; the author, the roadbook's owner and an admin may delete one. */

const COMMENT_MAX = 2000;

// The public roadbook a comment belongs to — comments exist only where everyone can read.
function comment_roadbook(string $slug): array {
    $st = db()->prepare("SELECT id, user_id, slug, title FROM roadbooks WHERE slug = ? AND status = 'public'");
    $st->execute([$slug]);
    $row = $st->fetch();
    if (!$row) fail('This roadbook does not exist or is private.', 404);
    return $row;
}

// $me is null for a reader who is not signed in: a public roadbook's comments are public (#884)
function comment_shape(array $r, ?array $me, int $ownerId): array {
    $uid = $me ? (int)$me['id'] : 0;
    return ['id' => (int)$r['id'], 'body' => $r['body'], 'created_at' => $r['created_at'],
        'username' => $r['username'], 'avatar' => $r['avatar'],
        'can_delete' => $me && ((int)$r['user_id'] === $uid || $ownerId === $uid || is_admin($me))];
}

function comments_list(?array $me, array $d): void {
    $rb = comment_roadbook((string)($d['slug'] ?? ''));
    $st = db()->prepare('SELECT c.id, c.user_id, c.body, c.created_at, u.username, u.avatar
        FROM roadbook_comments c JOIN users u ON u.id = c.user_id WHERE c.roadbook_id = ? ORDER BY c.created_at, c.id');
    $st->execute([$rb['id']]);
    json_out(['ok' => true, 'comments' => array_map(fn($r) => comment_shape($r, $me, (int)$rb['user_id']), $st->fetchAll())]);
}

function comment_add(array $me, array $d): void {
    $rb = comment_roadbook((string)($d['slug'] ?? ''));
    $body = trim(str_replace("\r\n", "\n", (string)($d['body'] ?? '')));
    if ($body === '') fail('Write something first.');
    if (mb_strlen($body) > COMMENT_MAX) fail('That comment is too long.');
    rate_limit('comment_' . (int)$me['id'], 10, 600);
    verify_turnstile($d['turnstile'] ?? null);
    db()->prepare('INSERT INTO roadbook_comments (roadbook_id, user_id, body) VALUES (?,?,?)')->execute([$rb['id'], $me['id'], $body]);
    $id = (int)db()->lastInsertId();
    log_activity((int)$me['id'], 'comment_add', 'roadbook ' . $rb['id']);
    // the roadbook's owner hears about it (#971) — unless they wrote it themselves
    notify((int)$rb['user_id'], 'comment', $id, (int)$me['id'], ['slug' => $rb['slug'], 'title' => $rb['title'], 'excerpt' => mb_substr($body, 0, 140)]);
    $st = db()->prepare('SELECT c.id, c.user_id, c.body, c.created_at, u.username, u.avatar FROM roadbook_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?');
    $st->execute([$id]);
    json_out(['ok' => true, 'comment' => comment_shape($st->fetch(), $me, (int)$rb['user_id'])]);
}

function comment_delete(array $me, array $d): void {
    $st = db()->prepare('SELECT c.id, c.user_id, r.user_id AS owner_id, r.id AS roadbook_id FROM roadbook_comments c JOIN roadbooks r ON r.id = c.roadbook_id WHERE c.id = ?');
    $st->execute([(int)($d['id'] ?? 0)]);
    $c = $st->fetch();
    if (!$c) fail('Not found.', 404);
    if ((int)$c['user_id'] !== (int)$me['id'] && (int)$c['owner_id'] !== (int)$me['id'] && !is_admin($me)) fail('Not allowed.', 403);
    db()->prepare('DELETE FROM roadbook_comments WHERE id = ?')->execute([$c['id']]);
    notifications_forget('comment', (int)$c['id']); // a comment gone is no news
    log_activity((int)$me['id'], 'comment_delete', 'roadbook ' . $c['roadbook_id']);
    json_out(['ok' => true]);
}
