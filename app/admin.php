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
    $orgQ = trim((string)($d['organization'] ?? ''));
    $where = '';
    $args = [];
    if ($eventId > 0) {
        $where = " WHERE users.id IN (SELECT user_id FROM event_participants WHERE event_id = $eventId
            UNION SELECT user_id FROM event_organizers WHERE event_id = $eventId)";
    }
    if ($orgQ !== '') {
        $where .= ($where ? ' AND' : ' WHERE') . ' users.organization LIKE ?';
        $args[] = '%' . $orgQ . '%';
    }
    $st = db()->prepare('SELECT id, first_name, last_name, username, email, organization, avatar, email_verified, is_admin, is_organizer, must_change_password, blocked, quota_bytes, default_lat, default_lon, created_at
        FROM users' . $where . ' ORDER BY id');
    $st->execute($args);
    $rows = $st->fetchAll();
    // One query maps every user to their roadbook ids: it feeds the disk scan, instead of
    // one query per listed user. Trashed roadbooks still occupy disk until the 30-day purge,
    // so they stay in — quota enforcement counts them too.
    $rbByUser = [];
    foreach (db()->query('SELECT user_id, id FROM roadbooks')->fetchAll() as $r) $rbByUser[(int)$r['user_id']][] = (int)$r['id'];
    // The per-user count instead hides trashed roadbooks, agreeing with the per-user list
    // which excludes them (#441) — and the trashed ones are counted on their own, so a card that
    // reads "0 roadbooks" with disk in use says where the rest are (#234: a deleted user's go there).
    $rbCount = []; $rbTrashed = [];
    foreach (db()->query("SELECT user_id, SUM(status <> 'deleted') live, SUM(status = 'deleted') trashed FROM roadbooks GROUP BY user_id")->fetchAll() as $r) {
        $rbCount[(int)$r['user_id']] = (int)$r['live']; $rbTrashed[(int)$r['user_id']] = (int)$r['trashed'];
    }
    // One set for the manages-events flag: event owners + co-organizers (same rule as
    // user_manages_events, #442) — cheaper than a per-user check.
    // what the admin reads at a glance (#910): how many runs, and when the user was last active
    $runCount = [];
    foreach (db()->query('SELECT user_id, COUNT(*) c FROM roadbook_runs GROUP BY user_id')->fetchAll() as $r) $runCount[(int)$r['user_id']] = (int)$r['c'];
    $lastActive = [];
    foreach (db()->query('SELECT user_id, MAX(created_at) t FROM activity_log WHERE user_id IS NOT NULL GROUP BY user_id')->fetchAll() as $r) $lastActive[(int)$r['user_id']] = $r['t'];
    $manages = [];
    foreach (db()->query('SELECT DISTINCT organizer_id AS id FROM events UNION SELECT DISTINCT user_id FROM event_organizers')->fetchAll() as $r) $manages[(int)$r['id']] = true;
    $users = array_map(fn($r) => [
        'id'         => (int)$r['id'],
        'first_name' => $r['first_name'],
        'last_name'  => $r['last_name'],
        'name'       => trim($r['first_name'] . ' ' . $r['last_name']),
        'username'   => $r['username'],
        'email'      => $r['email'],
        'organization' => $r['organization'],
        'avatar'     => $r['avatar'],
        'verified'   => (int)$r['email_verified'],
        'is_admin'   => is_admin($r) ? 1 : 0,
        'is_organizer' => (int)$r['is_organizer'],
        'manages_events' => isset($manages[(int)$r['id']]) ? 1 : 0,
        'mustchange' => (int)$r['must_change_password'],
        'blocked'    => (int)$r['blocked'],
        'locked'     => is_locked_admin($r['email']) ? 1 : 0, // .env admin: can't demote/block/delete
        'system'     => $r['username'] === GRAVEYARD_USERNAME ? 1 : 0, // the deleted-user account: no actions (#702)
        'roadbooks'  => $rbCount[(int)$r['id']] ?? 0,
        'trashed'    => $rbTrashed[(int)$r['id']] ?? 0,
        'runs'       => $runCount[(int)$r['id']] ?? 0,
        'last_active' => $lastActive[(int)$r['id']] ?? null,
        'bytes'      => user_disk_bytes((int)$r['id'], $rbByUser[(int)$r['id']] ?? []),
        'quota_bytes' => $r['quota_bytes'] !== null ? (int)$r['quota_bytes'] : null, // null = system default
        'quota'      => user_quota_bytes($r),                                         // effective quota (bytes)
        // the default map location the user set (#939) — admin eyes only, never on a public page
        'location'   => $r['default_lat'] !== null && $r['default_lon'] !== null ? ['lat' => (float)$r['default_lat'], 'lon' => (float)$r['default_lon']] : null,
        'created_at' => $r['created_at'],
    ], $rows);
    // me_super: whether the caller may act on other admins (admin_target) — the UI hides what the server would refuse
    json_out(['ok' => true, 'me' => (int)$user['id'], 'me_super' => is_locked_admin((string)$user['email']) ? 1 : 0, 'users' => $users]);
}

// Admin: every user with a default map location, for the locations map (#499).
function admin_user_locations(array $user): void {
    $st = db()->query("SELECT id, username, first_name, last_name, default_lat, default_lon FROM users
        WHERE default_lat IS NOT NULL AND default_lon IS NOT NULL ORDER BY username");
    json_out(['ok' => true, 'users' => array_map(fn($r) => [
        'id' => (int)$r['id'], 'username' => $r['username'],
        'name' => trim($r['first_name'] . ' ' . $r['last_name']),
        'lat' => (float)$r['default_lat'], 'lon' => (float)$r['default_lon'],
    ], $st->fetchAll())]);
}

// Every versioned Android release with an APK, newest first (#742 · #894) — the release's own
// semver, nothing else (the CI's rolling apk-latest debug build is not a version and never lists) —
// each with the moment its APK was built (the asset's upload time), its size and, for the recent
// ones, its SHA-256. Resolved
// server-side, so the page needs no CSP exception and never hits the GitHub rate limit.
function admin_apk_builds(array $user): void {
    $ctx = stream_context_create(['http' => [
        'method' => 'GET', 'timeout' => 8, 'ignore_errors' => true,
        'header' => "User-Agent: RDBK-app\r\nAccept: application/vnd.github+json",
    ]]);
    $raw = @file_get_contents('https://api.github.com/repos/alvarofranz/roadbook/releases?per_page=20', false, $ctx);
    $releases = $raw ? json_decode($raw, true) : null;
    if (!is_array($releases)) fail('Could not reach the release list.');
    $builds = [];
    foreach ($releases as $rel) {
        if (!is_array($rel) || !empty($rel['draft']) || !preg_match('/^android-\d+\.\d+\.\d+$/', (string)($rel['tag_name'] ?? ''))) continue;
        $apk = null; $shaUrl = '';
        foreach ((array)($rel['assets'] ?? []) as $a) {
            $name = (string)($a['name'] ?? '');
            if (!$apk && preg_match('/\.apk$/i', $name)) $apk = $a;
            if (preg_match('/\.sha256$/i', $name)) $shaUrl = (string)($a['browser_download_url'] ?? '');
        }
        if (!$apk) continue;
        $builds[] = ['tag' => (string)$rel['tag_name'], 'prerelease' => !empty($rel['prerelease']), 'built_at' => (string)($apk['updated_at'] ?? $rel['published_at'] ?? ''),
            'url' => (string)$apk['browser_download_url'], 'size' => (int)($apk['size'] ?? 0), 'sha_url' => $shaUrl];
    }
    usort($builds, fn($x, $y) => strcmp($y['built_at'], $x['built_at']));
    foreach ($builds as $i => &$b) { // the checksum of the recent ones (each is one more fetch)
        $b['sha256'] = '';
        if ($i < 5 && $b['sha_url'] !== '') {
            $t = @file_get_contents($b['sha_url'], false, $ctx);
            if (is_string($t) && preg_match('/^[0-9a-f]{64}/i', trim($t), $m)) $b['sha256'] = strtolower($m[0]);
        }
        unset($b['sha_url']);
    }
    unset($b);
    json_out(['ok' => true, 'builds' => $builds]);
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
    $q = trim((string)($d['q'] ?? ''));
    $page = max(1, (int)($d['page'] ?? 1));
    $perPage = min(100, max(1, (int)($d['per_page'] ?? 25)));
    $where = 'user_id = ? AND status <> \'deleted\'';
    $args = [$uid];
    if ($q !== '') {
        $where .= ' AND title LIKE ?';
        $args[] = '%' . $q . '%';
    }
    $st = db()->prepare("SELECT COUNT(*) FROM roadbooks WHERE $where");
    $st->execute($args);
    $total = (int)$st->fetchColumn();
    $st = db()->prepare("SELECT id, slug, title, status, total_distance, note_count, updated_at
        FROM roadbooks WHERE $where ORDER BY updated_at DESC LIMIT $perPage OFFSET " . ($page - 1) * $perPage);
    $st->execute($args);
    $list = array_map(fn($r) => [
        'id' => (int)$r['id'], 'slug' => $r['slug'], 'title' => $r['title'], 'status' => $r['status'],
        'total_distance' => (int)$r['total_distance'], 'note_count' => (int)$r['note_count'], 'updated_at' => $r['updated_at'],
    ], $st->fetchAll());
    json_out(['ok' => true, 'roadbooks' => $list, 'total' => $total, 'page' => $page, 'per_page' => $perPage]);
}

// Admin: read ANY user's roadbook payload (draft/ready/public) so the per-user view can open
// it in the Reader. The same read as rb_get (rb_read_payload) — no ownership filter, no edit lock.
function admin_rb_get(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $st = db()->prepare('SELECT id, slug, title, status, filename, user_id FROM roadbooks WHERE id = ? AND status <> \'deleted\'');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    json_out(['ok' => true, 'id' => (int)$row['id'], 'slug' => $row['slug'], 'status' => $row['status'],
        'title' => $row['title'], 'roadbook' => rb_read_payload($row)]);
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

// Restore a trashed roadbook → it comes back as a private DRAFT (its prior published state is
// not remembered, and restoring must never silently re-publish). With `user_id` it is handed to
// that user in the same step (#703): a restore that half-succeeds would leave a draft owned by
// the deleted-user account, out of everyone's reach.
function admin_rb_restore(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $to = (int)($d['user_id'] ?? 0);
    $st = db()->prepare('SELECT status FROM roadbooks WHERE id = ?'); $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    if ($row['status'] !== 'deleted') fail('That roadbook is not in the trash.');
    if ($to > 0) {
        $tu = db()->prepare('SELECT username FROM users WHERE id = ?'); $tu->execute([$to]);
        $target = $tu->fetch();
        if (!$target || $target['username'] === GRAVEYARD_USERNAME) fail('Target user not found.', 404);
    }
    db()->prepare("UPDATE roadbooks SET status = 'draft' WHERE id = ?")->execute([$id]);
    if ($to > 0) move_roadbook_owner($id, $to);
    log_activity((int)$user['id'], 'admin_rb_restore', 'roadbook #' . $id . ($to > 0 ? ' → user #' . $to : ''));
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

// One batch of the trash past retention, hard-deleted — row first (it cascades to the photo and
// audio rows), then the files. Shared by the cron and the admin's "empty expired" button. A
// trashed row is never updated again (see admin_move_roadbook), so `updated_at` is when it was
// trashed. Returns how many went and the first ids, for the audit trail.
function purge_expired_trash(int $limit): array {
    $rows = db()->query("SELECT id, user_id, filename FROM roadbooks
        WHERE status = 'deleted' AND updated_at < (NOW() - INTERVAL " . TRASH_DAYS . " DAY) LIMIT " . max(1, $limit))->fetchAll();
    $ids = [];
    foreach ($rows as $r) {
        db()->prepare('DELETE FROM roadbooks WHERE id = ?')->execute([(int)$r['id']]);
        purge_roadbook_files((int)$r['id'], (int)$r['user_id'], (string)$r['filename']);
        $ids[] = (int)$r['id'];
    }
    return ['deleted' => count($ids), 'ids' => array_slice($ids, 0, 30)]; // the audit detail caps at 255 chars
}

// Bulk-delete everything past retention (#505), in bounded batches so one click cannot time out.
// Returns what went plus what is left (the caller offers another round while remaining > 0).
// Never touches roadbooks inside retention.
function admin_trash_purge_expired(array $user): void {
    $deleted = 0;
    $ids = [];
    for ($round = 0; $round < 5; $round++) {
        $batch = purge_expired_trash(200);
        if (!$batch['deleted']) break;
        $deleted += $batch['deleted'];
        $ids = array_slice(array_merge($ids, $batch['ids']), 0, 30);
    }
    $left = (int)db()->query("SELECT COUNT(*) FROM roadbooks
        WHERE status = 'deleted' AND updated_at < (NOW() - INTERVAL " . TRASH_DAYS . " DAY)")->fetchColumn();
    log_activity((int)$user['id'], 'admin_trash_purge_expired', 'deleted ' . $deleted . ': ' . implode(',', $ids));
    json_out(['ok' => true, 'deleted' => $deleted, 'remaining' => $left]);
}

// Admin: reassign a live roadbook to another user.
// A trashed roadbook is refused (#703): moving it would bump `updated_at` and silently restart its
// retention clock — restore it to the new owner instead (admin_rb_restore with user_id).
function admin_move_roadbook(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $to = (int)($d['user_id'] ?? 0);
    if ($id <= 0 || $to <= 0) fail('Bad request.');
    $st = db()->prepare('SELECT user_id, status FROM roadbooks WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    if ($row['status'] === 'deleted') fail('That roadbook is in the trash — restore it to a user instead.');
    $from = (int)$row['user_id'];
    if ($to === $from) { json_out(['ok' => true, 'id' => $id]); return; }
    $tu = db()->prepare('SELECT username FROM users WHERE id = ?'); $tu->execute([$to]);
    $target = $tu->fetch();
    if (!$target || $target['username'] === GRAVEYARD_USERNAME) fail('Target user not found.', 404);
    move_roadbook_owner($id, $to);
    log_activity((int)$user['id'], 'admin_move_roadbook', 'roadbook #' . $id . ' user #' . $from . ' → #' . $to);
    json_out(['ok' => true, 'id' => $id]);
}
// Hand a roadbook to another owner. The .rdbk file is the only owner-scoped file (it lives under
// storage/<user_id>/), so it moves between the two dirs; photos and audio are keyed by roadbook
// id and stay put, and the disk quota is recomputed per user (#126). The row is the source of
// truth: the owner changes FIRST, then the file moves — if the rename fails the row already points
// at the new owner and the file is recoverable by hand, never a row whose owner's dir no longer
// holds the file.
function move_roadbook_owner(int $id, int $to): void {
    global $CFG;
    $st = db()->prepare('SELECT user_id, filename FROM roadbooks WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    $from = (int)$row['user_id'];
    if ($from === $to) return;
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
}

// Who an admin action may touch (#702). The deleted-user system account holds the roadbooks of
// deleted users and never signs in, so nothing changes it — renamed, it would even break every
// later user deletion. Another admin, and above all a configured superuser (.env), is changed only
// by a superuser: otherwise any admin could reset the superuser's password, move its email out of
// ADMIN_EMAILS, or block, delete and demote the other admins.
function admin_target(array $user, int $id): array {
    $st = db()->prepare('SELECT id, email, username, is_admin FROM users WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    if ($row['username'] === GRAVEYARD_USERNAME) fail("The deleted-user system account can't be changed.");
    $self = (int)$row['id'] === (int)$user['id'];
    if (!$self && is_admin($row) && !is_locked_admin((string)$user['email'])) fail('Only a configured superuser can change another admin.', 403);
    return $row;
}

// Force-activate an account (e.g. the user never clicked the verification email).
function admin_verify(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    admin_target($user, $id);
    db()->prepare('UPDATE users SET email_verified = 1, verify_token = NULL, verify_expires = NULL WHERE id = ?')->execute([$id]);
    log_activity((int)$user['id'], 'admin_verify', 'user #' . $id);
    json_out(['ok' => true]);
}

// Block / unblock an account (a blocked user can't sign in).
function admin_block(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $blocked = !empty($d['blocked']) ? 1 : 0;
    if ($id === (int)$user['id']) fail("You can't block yourself.");
    $row = admin_target($user, $id);
    if ($blocked && is_locked_admin($row['email'])) fail("Can't block a configured superuser.");
    db()->prepare('UPDATE users SET blocked = ? WHERE id = ?')->execute([$blocked, $id]);
    log_activity((int)$user['id'], $blocked ? 'admin_block' : 'admin_unblock', 'user #' . $id);
    json_out(['ok' => true]);
}

// Edit a user's identity; an optional new password forces a change at their next login.
// Everything is validated BEFORE anything is written: a refused password must not leave the
// identity half-saved (#702).
function admin_update_user(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    if ($id <= 0) fail('Bad request.');
    admin_target($user, $id);
    $first = trim((string)($d['first_name'] ?? ''));
    $last  = trim((string)($d['last_name'] ?? ''));
    $username = trim((string)($d['username'] ?? ''));
    $email = strtolower(trim((string)($d['email'] ?? '')));
    $pw = (string)($d['password'] ?? '');
    if ($first === '' || $last === '') fail('First and last name are required.');
    if (!preg_match('/^[a-zA-Z0-9_.-]{3,40}$/', $username)) fail('Username must be 3–40 chars (letters, numbers, _ . -).');
    if (strcasecmp($username, GRAVEYARD_USERNAME) === 0) fail('That username or email is already in use.'); // reserved for the system account
    if (!valid_email($email)) fail('Please enter a valid email.');
    if ($pw !== '' && strlen($pw) < 8) fail('Password must be at least 8 characters.');
    $st = db()->prepare('SELECT id FROM users WHERE (username = ? OR email = ?) AND id <> ?');
    $st->execute([$username, $email, $id]);
    if ($st->fetch()) fail('That username or email is already in use.');
    // the rest of the form: the quota override (#99 — empty → NULL, the default; else bytes the client
    // computed from MB), the organizer grant (#121) and the club (#183, whitespace collapsed, empty → NULL)
    $q = $d['quota_bytes'] ?? '';
    $quota = ($q === null || $q === '') ? null : max(0, (int)$q);
    $org = mb_substr(trim(preg_replace('/\s+/u', ' ', (string)($d['organization'] ?? ''))), 0, 120);
    db()->prepare('UPDATE users SET first_name = ?, last_name = ?, username = ?, email = ?, organization = ?, quota_bytes = ?, is_organizer = ? WHERE id = ?')
        ->execute([$first, $last, $username, $email, $org !== '' ? $org : null, $quota, !empty($d['is_organizer']) ? 1 : 0, $id]);
    if ($pw !== '') {
        db()->prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $id]);
        revoke_api_tokens($id); // a new password set by an admin signs the account out of every app
    }
    log_activity((int)$user['id'], 'admin_edit_user', 'user #' . $id);
    json_out(['ok' => true]);
}

// Grant or revoke the admin role (the self and superuser guards); the organizer role is part of
// the user edit (admin_update_user).
function admin_set_role(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $row = admin_target($user, $id);
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
    // the club, collapsed like the profile field so the same one stays grouped (#116 · #663)
    $organization = mb_substr(trim(preg_replace('/\s+/u', ' ', (string)($d['organization'] ?? ''))), 0, 120);
    validate_new_account($first, $last, $username, $email, $pass);
    db()->prepare('INSERT INTO users (first_name, last_name, username, email, organization, password_hash, email_verified, must_change_password) VALUES (?,?,?,?,?,?,1,1)')
        ->execute([$first, $last, $username, $email, $organization !== '' ? $organization : null, password_hash($pass, PASSWORD_DEFAULT)]);
    $id = (int)db()->lastInsertId();
    log_activity((int)$user['id'], 'admin_create_user', 'user #' . $id . ' (@' . $username . ')');
    json_out(['ok' => true, 'id' => $id]);
}

function admin_delete_user(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    if ($id === (int)$user['id']) fail('Use your profile to delete your own account.');
    $row = admin_target($user, $id);
    if (is_locked_admin($row['email'])) fail("Can't delete a configured superuser.");
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
    $q = trim((string)($d['q'] ?? ''));
    $page = max(1, (int)($d['page'] ?? 1));
    $perPage = min(200, max(1, (int)($d['per_page'] ?? 50)));
    $where = 'user_id = ?';
    $args = [$id];
    if ($q !== '') {
        $where .= ' AND (action LIKE ? OR detail LIKE ?)';
        $like = '%' . $q . '%';
        $args[] = $like; $args[] = $like;
    }
    $rc = db()->prepare("SELECT COUNT(*) FROM roadbooks WHERE user_id = ? AND status <> 'deleted'"); // same count as the user list (#705)
    $rc->execute([$id]);
    $tc = db()->prepare("SELECT COUNT(*) FROM activity_log WHERE $where");
    $tc->execute($args);
    $a = db()->prepare("SELECT action, detail, ip, created_at FROM activity_log WHERE $where ORDER BY id DESC LIMIT $perPage OFFSET " . ($page - 1) * $perPage);
    $a->execute($args);
    json_out(['ok' => true, 'username' => $u['username'],
        'stats' => ['roadbooks' => (int)$rc->fetchColumn(), 'bytes' => user_disk_bytes($id)],
        'events' => $a->fetchAll(), 'total' => (int)$tc->fetchColumn(), 'page' => $page, 'per_page' => $perPage]);
}
