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
// Every roadbook id a user owns — the media dirs (photos/audio) are keyed by roadbook id.
function user_roadbook_ids(int $uid): array {
    $st = db()->prepare('SELECT id FROM roadbooks WHERE user_id = ?');
    $st->execute([$uid]);
    return array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
}
// Bytes a user occupies on disk: their .rdbk files + every roadbook's photo AND audio folders
// (#210 — voice notes count like photos). Pass the pre-fetched roadbook ids when listing many
// users (admin_users) — one query, not one each.
function user_disk_bytes(int $uid, ?array $rbIds = null): int {
    global $CFG;
    $bytes = dir_size($CFG['storage'] . '/' . $uid);
    foreach ($rbIds ?? user_roadbook_ids($uid) as $rid) {
        $bytes += dir_size($CFG['photos_dir'] . '/' . (int)$rid);
        $bytes += dir_size($CFG['audio_dir'] . '/' . (int)$rid);
    }
    return $bytes;
}
// A user's effective disk quota in bytes: their per-user override, or the system default.
function user_quota_bytes(array $user): int {
    return isset($user['quota_bytes']) && $user['quota_bytes'] !== null ? (int)$user['quota_bytes'] : DEFAULT_QUOTA_BYTES;
}
// Delete a user's files. The caller collects $rbIds BEFORE deleting the user row (the cascade
// wipes the roadbook rows that resolve them) and purges AFTER the row is gone — a failed
// DELETE must never leave a live account whose files are already gone.
function purge_user_files(int $uid, array $rbIds): void {
    global $CFG;
    foreach ($rbIds as $rid) { rrmdir($CFG['photos_dir'] . '/' . (int)$rid); rrmdir($CFG['audio_dir'] . '/' . (int)$rid); }
    @unlink($CFG['avatars_dir'] . '/' . $uid . '.avif'); // the avatar is profile data — it goes with the account (#234)
    rrmdir($CFG['storage'] . '/' . $uid);
}

/* ---- the "deleted user" graveyard (#234): a deleted account's roadbooks live on ---- */
// The system account that inherits them. It can never log in (no password + blocked) and its
// username is reserved at registration. Created lazily on the first deletion that needs it.
const GRAVEYARD_USERNAME = 'deleted-user';
function graveyard_user_id(): int {
    $st = db()->prepare('SELECT id FROM users WHERE username = ?');
    $st->execute([GRAVEYARD_USERNAME]);
    $id = $st->fetchColumn();
    if ($id) return (int)$id;
    db()->prepare("INSERT INTO users (first_name, last_name, username, email, password_hash, email_verified, blocked) VALUES ('Deleted', 'User', ?, 'deleted-user@rdbk.app', NULL, 1, 1)")
        ->execute([GRAVEYARD_USERNAME]);
    return (int)db()->lastInsertId();
}
// Move a user's roadbooks to the graveyard before their account dies (#234): every roadbook
// gets the former username prefixed to its title, its .rdbk file moves to the graveyard's
// storage, and it lands in the TRASH (status 'deleted') — visible in /admin/trash/, restorable
// for the standard 30 days (the UPDATE bumps updated_at, restarting the countdown at account
// deletion), then purged for good by the cron. The photo/audio folders are roadbook-keyed and
// stay put until that purge.
function reassign_roadbooks_to_graveyard(int $uid, string $username): void {
    global $CFG;
    $st = db()->prepare('SELECT id, title, filename FROM roadbooks WHERE user_id = ?');
    $st->execute([$uid]);
    $rows = $st->fetchAll();
    if (!$rows) return;
    $gid = graveyard_user_id();
    $dstDir = rb_dir($gid);
    $up = db()->prepare("UPDATE roadbooks SET user_id = ?, title = ?, status = 'deleted' WHERE id = ?");
    foreach ($rows as $r) {
        $title = mb_substr($username . ' — ' . $r['title'], 0, 200);
        if (!empty($r['filename']) && $r['filename'] !== 'pending') @rename($CFG['storage'] . '/' . $uid . '/' . $r['filename'], $dstDir . '/' . $r['filename']);
        $up->execute([$gid, $title, (int)$r['id']]);
    }
}
// Remove ONE roadbook's files: its owner-scoped .rdbk + its id-scoped photo/audio folders. Used
// when permanently purging a trashed roadbook (#187) — admin "delete now" and the 30-day cron.
function purge_roadbook_files(int $rbId, int $ownerId, string $filename): void {
    global $CFG;
    if ($filename !== '' && $filename !== 'pending') @unlink($CFG['storage'] . '/' . $ownerId . '/' . $filename);
    rrmdir($CFG['photos_dir'] . '/' . $rbId);
    rrmdir($CFG['audio_dir'] . '/' . $rbId);
}

function admin_users(array $user, array $d = []): void {
    // Optional event filter: only the users belonging to that event (participants + organizers).
    $eventId = (int)($d['event_id'] ?? 0);
    $where = $eventId > 0 ? " WHERE users.id IN (SELECT user_id FROM event_participants WHERE event_id = $eventId
        UNION SELECT user_id FROM event_organizers WHERE event_id = $eventId)" : '';
    $rows = db()->query('SELECT id, first_name, last_name, username, email, organization, email_verified, is_admin, is_organizer, must_change_password, blocked, quota_bytes, created_at
        FROM users' . $where . ' ORDER BY id')->fetchAll();
    // One query maps every user to their roadbook ids: it feeds both the per-user roadbook
    // count and the disk scan, instead of two queries per listed user.
    $rbByUser = [];
    foreach (db()->query('SELECT user_id, id FROM roadbooks')->fetchAll() as $r) $rbByUser[(int)$r['user_id']][] = (int)$r['id'];
    $users = array_map(fn($r) => [
        'id'         => (int)$r['id'],
        'first_name' => $r['first_name'],
        'last_name'  => $r['last_name'],
        'name'       => trim($r['first_name'] . ' ' . $r['last_name']),
        'username'   => $r['username'],
        'email'      => $r['email'],
        'organization' => $r['organization'],
        'verified'   => (int)$r['email_verified'],
        'is_admin'   => is_admin($r) ? 1 : 0,
        'is_organizer' => (int)$r['is_organizer'],
        'mustchange' => (int)$r['must_change_password'],
        'blocked'    => (int)$r['blocked'],
        'locked'     => is_locked_admin($r['email']) ? 1 : 0, // .env admin: can't demote/block/delete
        'roadbooks'  => count($rbByUser[(int)$r['id']] ?? []),
        'bytes'      => user_disk_bytes((int)$r['id'], $rbByUser[(int)$r['id']] ?? []),
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
    // a trashed roadbook is out of reach here — acting on it would silently restore it,
    // bypassing the trash's restore path (#214); only admin_rb_restore brings it back
    $st = db()->prepare("SELECT id FROM roadbooks WHERE id = ? AND status <> 'deleted'");
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
    $st = db()->prepare("SELECT id, slug, title, status, total_distance, note_count, updated_at
        FROM roadbooks WHERE user_id = ? AND status <> 'deleted' ORDER BY updated_at DESC");
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
    // never on a trashed roadbook — that would un-trash it outside admin_rb_restore (#214)
    $st = db()->prepare("SELECT id FROM roadbooks WHERE id = ? AND status <> 'deleted'");
    $st->execute([$id]);
    if (!$st->fetch()) fail('Not found.', 404);
    db()->prepare('UPDATE roadbooks SET status = ? WHERE id = ?')->execute([$status, $id]);
    log_activity((int)$user['id'], 'admin_set_status', 'roadbook #' . $id . ' → ' . $status);
    json_out(['ok' => true, 'id' => $id, 'status' => $status]);
}

/* ---- roadbook trash (#187): soft-deleted roadbooks, admin-only ---- */
const TRASH_DAYS = 30; // a trashed roadbook is kept this long, then the cron purges it for good

// List every trashed roadbook (any owner) with how long until it is purged. Admin trash page.
function admin_trash_list(array $user): void {
    $rows = db()->query("SELECT r.id, r.slug, r.title, r.total_distance, r.note_count, r.updated_at, u.username,
            TIMESTAMPDIFF(DAY, r.updated_at, NOW()) AS days_in_trash
        FROM roadbooks r JOIN users u ON u.id = r.user_id
        WHERE r.status = 'deleted' ORDER BY r.updated_at DESC")->fetchAll();
    $list = array_map(fn($r) => [
        'id' => (int)$r['id'], 'slug' => $r['slug'], 'title' => $r['title'], 'username' => $r['username'],
        'total_distance' => (int)$r['total_distance'], 'note_count' => (int)$r['note_count'],
        'deleted_at' => $r['updated_at'], 'days_left' => max(0, TRASH_DAYS - (int)$r['days_in_trash']),
        'graveyard' => $r['username'] === GRAVEYARD_USERNAME, // restoring one of these must ask WHO gets it (the owner can't log in)
    ], $rows);
    json_out(['ok' => true, 'trash_days' => TRASH_DAYS, 'roadbooks' => $list]);
}

// Restore a trashed roadbook → it comes back as a private DRAFT (its prior published state is
// not remembered, and restoring must never silently re-publish). Owner unchanged.
// Admin: move ANY live roadbook to the trash (#237) — the moderation counterpart of the
// owner's rb_delete, and the only way to trash a graveyard-owned roadbook (its "owner" can
// never log in). Same lifecycle as every trashed roadbook: restore or 30-day purge.
function admin_rb_trash(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $st = db()->prepare("SELECT id FROM roadbooks WHERE id = ? AND status <> 'deleted'");
    $st->execute([$id]);
    if (!$st->fetch()) fail('Not found.', 404);
    db()->prepare("UPDATE roadbooks SET status = 'deleted' WHERE id = ?")->execute([$id]);
    log_activity((int)$user['id'], 'admin_rb_trash', 'roadbook #' . $id);
    json_out(['ok' => true, 'id' => $id]);
}

function admin_rb_restore(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $st = db()->prepare('SELECT status FROM roadbooks WHERE id = ?'); $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    if ($row['status'] !== 'deleted') fail('That roadbook is not in the trash.');
    db()->prepare("UPDATE roadbooks SET status = 'draft' WHERE id = ?")->execute([$id]);
    log_activity((int)$user['id'], 'admin_rb_restore', 'roadbook #' . $id);
    json_out(['ok' => true, 'id' => $id]);
}

// Permanently delete a trashed roadbook now (row + files). Only from the trash, so a live
// roadbook can never be hard-deleted by mistake.
function admin_rb_purge(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $st = db()->prepare("SELECT user_id, filename FROM roadbooks WHERE id = ? AND status = 'deleted'");
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail('That roadbook is not in the trash.', 404);
    // row first — a failed DELETE must not leave a live row whose files are already gone
    db()->prepare('DELETE FROM roadbooks WHERE id = ?')->execute([$id]);
    purge_roadbook_files($id, (int)$row['user_id'], (string)$row['filename']);
    log_activity((int)$user['id'], 'admin_rb_purge', 'roadbook #' . $id);
    json_out(['ok' => true, 'id' => $id]);
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
    // The row is the source of truth: reassign the owner FIRST, then move the file — if the
    // rename fails the row already points at the new owner and the file is recoverable by
    // hand, never a row whose owner's dir no longer holds the file.
    db()->prepare('UPDATE roadbooks SET user_id = ? WHERE id = ?')->execute([$to, $id]);
    $fn = (string)$row['filename'];
    if ($fn !== '' && $fn !== 'pending') { // a draft recording with no real file yet has nothing to move
        $src = $CFG['storage'] . '/' . $from . '/' . $fn;
        if (is_file($src)) {
            $dstDir = $CFG['storage'] . '/' . $to;
            if (!is_dir($dstDir)) mkdir($dstDir, 0700, true);
            @rename($src, $dstDir . '/' . $fn);
        }
    }
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
    $id = (int)($d['id'] ?? 0);
    $blocked = !empty($d['blocked']) ? 1 : 0;
    if ($id === (int)$user['id']) fail("You can't block yourself.");
    $st = db()->prepare('SELECT email FROM users WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    if ($blocked && is_locked_admin($row['email'])) fail("Can't block a configured superuser.");
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
    // Organization (free-text club, #183): only when sent; trim + collapse whitespace, empty → NULL.
    if (array_key_exists('organization', $d)) {
        $org = mb_substr(trim(preg_replace('/\s+/u', ' ', (string)$d['organization'])), 0, 120);
        db()->prepare('UPDATE users SET organization = ? WHERE id = ?')->execute([$org !== '' ? $org : null, $id]);
    }
    log_activity((int)$user['id'], 'admin_edit_user', 'user #' . $id);
    json_out(['ok' => true]);
}

// Toggle a user's role: the payload carries either is_organizer (event-organizer grant, #121)
// or is_admin (with the self/superuser guards).
function admin_set_role(array $user, array $d): void {
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
    if (!$makeAdmin && is_locked_admin($row['email'])) fail('That account is a configured superuser (set in .env).');
    db()->prepare('UPDATE users SET is_admin = ? WHERE id = ?')->execute([$makeAdmin ? 1 : 0, $id]);
    log_activity((int)$user['id'], $makeAdmin ? 'admin_grant' : 'admin_revoke', 'user #' . $id);
    json_out(['ok' => true]);
}

// Admin: create a user directly (#242). Same rules as self-service registration
// (validate_new_account), but no email round-trip: the account is born verified, and the
// temporary password the admin hands over is flagged must_change_password — the user
// replaces it at the first sign-in.
function admin_create_user(array $user, array $d): void {
    $first = mb_substr(trim((string)($d['first_name'] ?? '')), 0, 80);
    $last  = mb_substr(trim((string)($d['last_name'] ?? '')), 0, 80);
    $username = trim((string)($d['username'] ?? ''));
    $email = strtolower(trim((string)($d['email'] ?? '')));
    $pass  = (string)($d['password'] ?? '');
    validate_new_account($first, $last, $username, $email, $pass);
    db()->prepare('INSERT INTO users (first_name, last_name, username, email, password_hash, email_verified, must_change_password) VALUES (?,?,?,?,?,1,1)')
        ->execute([$first, $last, $username, $email, password_hash($pass, PASSWORD_DEFAULT)]);
    $id = (int)db()->lastInsertId();
    log_activity((int)$user['id'], 'admin_create_user', 'user #' . $id . ' (@' . $username . ')');
    json_out(['ok' => true, 'id' => $id]);
}

function admin_delete_user(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    if ($id === (int)$user['id']) fail('Use your profile to delete your own account.');
    $st = db()->prepare('SELECT email, username FROM users WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    if (is_locked_admin($row['email'])) fail("Can't delete a configured superuser.");
    if ($row['username'] === GRAVEYARD_USERNAME) fail("Can't delete the deleted-user system account.");
    reassign_roadbooks_to_graveyard($id, (string)$row['username']); // the roadbooks live on (#234)
    $rbIds = user_roadbook_ids($id); // whatever is left (nothing) — collected BEFORE the cascade
    db()->prepare('DELETE FROM users WHERE id = ?')->execute([$id]); // photos/api_tokens/activity_log rows go via cascade
    purge_user_files($id, $rbIds);
    log_activity((int)$user['id'], 'admin_delete_user', 'user #' . $id . ' (@' . $row['username'] . ')');
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
