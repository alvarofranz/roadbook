<?php
/* Admin / superuser: list users with disk usage, promote/demote, delete.
 * Every endpoint is gated by require_admin() in the router. */

// Sum the file sizes directly inside a directory (photos and .rdbk live flat).
function dir_size(string $dir): int {
    if (!is_dir($dir)) return 0;
    $total = 0;
    foreach (scandir($dir) ?: [] as $f) {
        if ($f === '.' || $f === '..') continue;
        $p = $dir . '/' . $f;
        if (is_file($p)) $total += (int)@filesize($p);
    }
    return $total;
}
function rrmdir(string $dir): void {
    if (!is_dir($dir)) return;
    foreach (scandir($dir) ?: [] as $f) {
        if ($f === '.' || $f === '..') continue;
        $p = $dir . '/' . $f;
        is_dir($p) ? rrmdir($p) : @unlink($p);
    }
    @rmdir($dir);
}
// Bytes a user occupies on disk: their .rdbk files + every roadbook's photo folder.
function user_disk_bytes(int $uid): int {
    global $CFG;
    $bytes = dir_size($CFG['storage'] . '/' . $uid);
    $st = db()->prepare('SELECT id FROM roadbooks WHERE user_id = ?');
    $st->execute([$uid]);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $rid) $bytes += dir_size($CFG['photos_dir'] . '/' . (int)$rid);
    return $bytes;
}
// Delete a user's files (call BEFORE removing the row, while roadbooks still resolve).
function purge_user_files(int $uid): void {
    global $CFG;
    $st = db()->prepare('SELECT id FROM roadbooks WHERE user_id = ?');
    $st->execute([$uid]);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $rid) rrmdir($CFG['photos_dir'] . '/' . (int)$rid);
    rrmdir($CFG['storage'] . '/' . $uid);
}

function admin_users(array $user): void {
    $rows = db()->query('SELECT id, first_name, last_name, username, email, email_verified, is_admin, must_change_password, blocked, created_at,
            (SELECT COUNT(*) FROM roadbooks r WHERE r.user_id = users.id) AS roadbooks
        FROM users ORDER BY id')->fetchAll();
    $users = array_map(fn($r) => [
        'id'         => (int)$r['id'],
        'first_name' => $r['first_name'],
        'last_name'  => $r['last_name'],
        'name'       => trim($r['first_name'] . ' ' . $r['last_name']),
        'username'   => $r['username'],
        'email'      => $r['email'],
        'verified'   => (int)$r['email_verified'],
        'is_admin'   => is_admin($r) ? 1 : 0,
        'mustchange' => (int)$r['must_change_password'],
        'blocked'    => (int)$r['blocked'],
        'locked'     => in_array(strtolower($r['email']), $GLOBALS['CFG']['admin_emails'], true) ? 1 : 0, // .env admin: can't demote/block/delete
        'roadbooks'  => (int)$r['roadbooks'],
        'bytes'      => user_disk_bytes((int)$r['id']),
        'created_at' => $r['created_at'],
    ], $rows);
    json_out(['ok' => true, 'me' => (int)$user['id'], 'users' => $users]);
}

// Moderation: every public roadbook with its owner, so an admin can review the public site.
function admin_public_roadbooks(array $user): void {
    $rows = db()->query('SELECT r.id, r.slug, r.title, r.total_distance, r.note_count, r.updated_at, u.username
        FROM roadbooks r JOIN users u ON u.id = r.user_id
        WHERE r.is_public = 1 ORDER BY r.updated_at DESC')->fetchAll();
    $list = array_map(fn($r) => [
        'id' => (int)$r['id'], 'slug' => $r['slug'], 'title' => $r['title'], 'username' => $r['username'],
        'total_distance' => (int)$r['total_distance'], 'note_count' => (int)$r['note_count'], 'updated_at' => $r['updated_at'],
    ], $rows);
    json_out(['ok' => true, 'roadbooks' => $list]);
}

// Moderation: force any roadbook back to private (admin, regardless of owner). Data is untouched.
function admin_unpublish(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $st = db()->prepare('SELECT id FROM roadbooks WHERE id = ?');
    $st->execute([$id]);
    if (!$st->fetch()) fail('Not found.', 404);
    db()->prepare('UPDATE roadbooks SET is_public = 0 WHERE id = ?')->execute([$id]);
    json_out(['ok' => true, 'id' => $id]);
}

// Force-activate an account (e.g. the user never clicked the verification email).
function admin_verify(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $st = db()->prepare('SELECT id FROM users WHERE id = ?');
    $st->execute([$id]);
    if (!$st->fetch()) fail('Not found.', 404);
    db()->prepare('UPDATE users SET email_verified = 1, verify_token = NULL, verify_expires = NULL WHERE id = ?')->execute([$id]);
    json_out(['ok' => true]);
}

// Block / unblock an account (a blocked user can't sign in).
function admin_block(array $user, array $d): void {
    global $CFG;
    $id = (int)($d['id'] ?? 0);
    $blocked = !empty($d['blocked']) ? 1 : 0;
    if ($id === (int)$user['id']) fail("You can't block yourself.");
    $st = db()->prepare('SELECT email FROM users WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    if ($blocked && in_array(strtolower($row['email']), $CFG['admin_emails'], true)) fail("Can't block a configured superuser.");
    db()->prepare('UPDATE users SET blocked = ? WHERE id = ?')->execute([$blocked, $id]);
    json_out(['ok' => true]);
}

// Edit a user's identity; an optional new password forces a change at their next login.
function admin_update_user(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    if ($id <= 0) fail('Bad request.');
    $first = trim((string)($d['first_name'] ?? ''));
    $last  = trim((string)($d['last_name'] ?? ''));
    $username = trim((string)($d['username'] ?? ''));
    $email = strtolower(trim((string)($d['email'] ?? '')));
    if ($first === '' || $last === '') fail('First and last name are required.');
    if (!preg_match('/^[a-zA-Z0-9_.-]{3,40}$/', $username)) fail('Username must be 3–40 chars (letters, numbers, _ . -).');
    if (!valid_email($email)) fail('Please enter a valid email.');
    $st = db()->prepare('SELECT id FROM users WHERE (username = ? OR email = ?) AND id <> ?');
    $st->execute([$username, $email, $id]);
    if ($st->fetch()) fail('That username or email is already in use.');
    db()->prepare('UPDATE users SET first_name = ?, last_name = ?, username = ?, email = ? WHERE id = ?')
        ->execute([$first, $last, $username, $email, $id]);
    $pw = (string)($d['password'] ?? '');
    if ($pw !== '') {
        if (strlen($pw) < 8) fail('Password must be at least 8 characters.');
        db()->prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $id]);
    }
    json_out(['ok' => true]);
}

function admin_set_role(array $user, array $d): void {
    global $CFG;
    $id = (int)($d['id'] ?? 0);
    $makeAdmin = !empty($d['is_admin']);
    if ($id === (int)$user['id']) fail("You can't change your own role.");
    $st = db()->prepare('SELECT email FROM users WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    if (!$makeAdmin && in_array(strtolower($row['email']), $CFG['admin_emails'], true)) fail('That account is a configured superuser (set in .env).');
    db()->prepare('UPDATE users SET is_admin = ? WHERE id = ?')->execute([$makeAdmin ? 1 : 0, $id]);
    json_out(['ok' => true]);
}

function admin_delete_user(array $user, array $d): void {
    global $CFG;
    $id = (int)($d['id'] ?? 0);
    if ($id === (int)$user['id']) fail('Use your profile to delete your own account.');
    $st = db()->prepare('SELECT email FROM users WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    if (in_array(strtolower($row['email']), $CFG['admin_emails'], true)) fail("Can't delete a configured superuser.");
    purge_user_files($id);
    db()->prepare('DELETE FROM users WHERE id = ?')->execute([$id]); // roadbooks/photos/api_tokens rows go via cascade
    json_out(['ok' => true]);
}
