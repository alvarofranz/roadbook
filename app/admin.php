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
// A user's effective disk quota in bytes: their per-user override, or the system default.
function user_quota_bytes(array $user): int {
    return isset($user['quota_bytes']) && $user['quota_bytes'] !== null ? (int)$user['quota_bytes'] : DEFAULT_QUOTA_BYTES;
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
    $rows = db()->query('SELECT id, first_name, last_name, username, email, email_verified, is_admin, is_organizer, must_change_password, blocked, quota_bytes, created_at,
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
        'is_organizer' => (int)$r['is_organizer'],
        'mustchange' => (int)$r['must_change_password'],
        'blocked'    => (int)$r['blocked'],
        'locked'     => in_array(strtolower($r['email']), $GLOBALS['CFG']['admin_emails'], true) ? 1 : 0, // .env admin: can't demote/block/delete
        'roadbooks'  => (int)$r['roadbooks'],
        'bytes'      => user_disk_bytes((int)$r['id']),
        'quota_bytes' => $r['quota_bytes'] !== null ? (int)$r['quota_bytes'] : null, // null = system default
        'quota'      => user_quota_bytes($r),                                         // effective quota (bytes)
        'created_at' => $r['created_at'],
    ], $rows);
    json_out(['ok' => true, 'me' => (int)$user['id'], 'users' => $users]);
}

// Moderation: every public roadbook with its owner, so an admin can review the public site.
function admin_public_roadbooks(array $user): void {
    $rows = db()->query("SELECT r.id, r.slug, r.title, r.total_distance, r.note_count, r.updated_at, u.username
        FROM roadbooks r JOIN users u ON u.id = r.user_id
        WHERE r.status = 'public' ORDER BY r.updated_at DESC")->fetchAll();
    $list = array_map(fn($r) => [
        'id' => (int)$r['id'], 'slug' => $r['slug'], 'title' => $r['title'], 'username' => $r['username'],
        'total_distance' => (int)$r['total_distance'], 'note_count' => (int)$r['note_count'], 'updated_at' => $r['updated_at'],
    ], $rows);
    json_out(['ok' => true, 'roadbooks' => $list]);
}

// Moderation: pull any roadbook out of public (admin, regardless of owner). It drops back to
// 'ready' (private but complete) — the content is untouched, only its public visibility.
function admin_unpublish(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $st = db()->prepare('SELECT id FROM roadbooks WHERE id = ?');
    $st->execute([$id]);
    if (!$st->fetch()) fail('Not found.', 404);
    db()->prepare("UPDATE roadbooks SET status = 'ready' WHERE id = ?")->execute([$id]);
    log_activity((int)$user['id'], 'admin_unpublish', 'roadbook #' . $id);
    json_out(['ok' => true, 'id' => $id]);
}

// Every roadbook of a given user (any status), for the admin per-user roadbook view (#126).
function admin_user_roadbooks(array $user, array $d): void {
    $uid = (int)($d['user_id'] ?? 0);
    if ($uid <= 0) fail('Bad request.');
    $st = db()->prepare('SELECT id, slug, title, status, total_distance, note_count, updated_at
        FROM roadbooks WHERE user_id = ? ORDER BY updated_at DESC');
    $st->execute([$uid]);
    $list = array_map(fn($r) => [
        'id' => (int)$r['id'], 'slug' => $r['slug'], 'title' => $r['title'], 'status' => $r['status'],
        'total_distance' => (int)$r['total_distance'], 'note_count' => (int)$r['note_count'], 'updated_at' => $r['updated_at'],
    ], $st->fetchAll());
    json_out(['ok' => true, 'roadbooks' => $list]);
}

// Admin: set any roadbook's publication status (draft/ready/public) from the per-user view (#126).
function admin_set_status(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $status = rb_clean_status($d['status'] ?? null);
    $st = db()->prepare('SELECT id FROM roadbooks WHERE id = ?');
    $st->execute([$id]);
    if (!$st->fetch()) fail('Not found.', 404);
    db()->prepare('UPDATE roadbooks SET status = ? WHERE id = ?')->execute([$status, $id]);
    log_activity((int)$user['id'], 'admin_set_status', 'roadbook #' . $id . ' → ' . $status);
    json_out(['ok' => true, 'id' => $id, 'status' => $status]);
}

// Admin: reassign a roadbook to another user. The .rdbk file is the only owner-scoped file
// (it lives under storage/<user_id>/) so it's moved between the two dirs; photos and audio are
// keyed by roadbook id, so they stay put, and the disk quota is recomputed per user (#126).
function admin_move_roadbook(array $user, array $d): void {
    global $CFG;
    $id = (int)($d['id'] ?? 0);
    $to = (int)($d['user_id'] ?? 0);
    if ($id <= 0 || $to <= 0) fail('Bad request.');
    $st = db()->prepare('SELECT user_id, filename FROM roadbooks WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    $from = (int)$row['user_id'];
    if ($to === $from) { json_out(['ok' => true, 'id' => $id]); return; }
    $tu = db()->prepare('SELECT id FROM users WHERE id = ?'); $tu->execute([$to]);
    if (!$tu->fetch()) fail('Target user not found.', 404);
    $fn = (string)$row['filename'];
    if ($fn !== '' && $fn !== 'pending') { // a draft recording with no real file yet has nothing to move
        $src = $CFG['storage'] . '/' . $from . '/' . $fn;
        if (is_file($src)) {
            $dstDir = $CFG['storage'] . '/' . $to;
            if (!is_dir($dstDir)) mkdir($dstDir, 0700, true);
            @rename($src, $dstDir . '/' . $fn);
        }
    }
    db()->prepare('UPDATE roadbooks SET user_id = ? WHERE id = ?')->execute([$to, $id]);
    log_activity((int)$user['id'], 'admin_move_roadbook', 'roadbook #' . $id . ' user #' . $from . ' → #' . $to);
    json_out(['ok' => true, 'id' => $id]);
}

// Force-activate an account (e.g. the user never clicked the verification email).
function admin_verify(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $st = db()->prepare('SELECT id FROM users WHERE id = ?');
    $st->execute([$id]);
    if (!$st->fetch()) fail('Not found.', 404);
    db()->prepare('UPDATE users SET email_verified = 1, verify_token = NULL, verify_expires = NULL WHERE id = ?')->execute([$id]);
    log_activity((int)$user['id'], 'admin_verify', 'user #' . $id);
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
    log_activity((int)$user['id'], $blocked ? 'admin_block' : 'admin_unblock', 'user #' . $id);
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
    // Disk-quota override (#99): empty → NULL (use the default), a value → bytes the client computed
    // from MB. Only touched when the form actually sent the field, so an older client can't reset it.
    if (array_key_exists('quota_bytes', $d)) {
        $q = $d['quota_bytes'];
        $quotaVal = ($q === null || $q === '') ? null : max(0, (int)$q);
        db()->prepare('UPDATE users SET quota_bytes = ? WHERE id = ?')->execute([$quotaVal, $id]);
    }
    // Organizer grant (#121): only when the form sent the field, so an older client can't clear it.
    if (array_key_exists('is_organizer', $d)) {
        db()->prepare('UPDATE users SET is_organizer = ? WHERE id = ?')->execute([!empty($d['is_organizer']) ? 1 : 0, $id]);
    }
    log_activity((int)$user['id'], 'admin_edit_user', 'user #' . $id);
    json_out(['ok' => true]);
}

// Toggle a user's role: the payload carries either is_organizer (event-organizer grant, #121)
// or is_admin (with the self/superuser guards).
function admin_set_role(array $user, array $d): void {
    global $CFG;
    $id = (int)($d['id'] ?? 0);
    $st = db()->prepare('SELECT email FROM users WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    if (array_key_exists('is_organizer', $d)) {
        $on = !empty($d['is_organizer']);
        db()->prepare('UPDATE users SET is_organizer = ? WHERE id = ?')->execute([$on ? 1 : 0, $id]);
        log_activity((int)$user['id'], $on ? 'organizer_grant' : 'organizer_revoke', 'user #' . $id);
        json_out(['ok' => true]);
    }
    $makeAdmin = !empty($d['is_admin']);
    if ($id === (int)$user['id']) fail("You can't change your own role.");
    if (!$makeAdmin && in_array(strtolower($row['email']), $CFG['admin_emails'], true)) fail('That account is a configured superuser (set in .env).');
    db()->prepare('UPDATE users SET is_admin = ? WHERE id = ?')->execute([$makeAdmin ? 1 : 0, $id]);
    log_activity((int)$user['id'], $makeAdmin ? 'admin_grant' : 'admin_revoke', 'user #' . $id);
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
    db()->prepare('DELETE FROM users WHERE id = ?')->execute([$id]); // roadbooks/photos/api_tokens/activity_log rows go via cascade
    log_activity((int)$user['id'], 'admin_delete_user', 'user #' . $id);
    json_out(['ok' => true]);
}

// Admin inspection (#86): a user's stats + their recent activity timeline (anonymised IPs).
function admin_activity(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $st = db()->prepare('SELECT username FROM users WHERE id = ?');
    $st->execute([$id]);
    $u = $st->fetch();
    if (!$u) fail('Not found.', 404);
    $rc = db()->prepare('SELECT COUNT(*) FROM roadbooks WHERE user_id = ?');
    $rc->execute([$id]);
    $a = db()->prepare('SELECT action, detail, ip, created_at FROM activity_log WHERE user_id = ? ORDER BY id DESC LIMIT 50');
    $a->execute([$id]);
    json_out(['ok' => true, 'username' => $u['username'],
        'stats' => ['roadbooks' => (int)$rc->fetchColumn(), 'bytes' => user_disk_bytes($id)],
        'events' => $a->fetchAll()]);
}
