<?php
/* Per-user roadbook storage. Metadata lives in the `roadbooks` table; the full
 * .rdbk JSON lives under storage/users/<user_id>/<id>.rdbk,
 * private (served only through these authenticated endpoints). */

function rb_dir(int $userId): string {
    global $CFG;
    $dir = $CFG['storage'] . '/' . $userId;
    if (!is_dir($dir)) mkdir($dir, 0700, true);
    return $dir;
}

// A roadbook's publication lifecycle: draft (in progress, private) → ready (done, private)
// → public (visible to anyone). Any unknown value normalises to 'draft'.
function rb_clean_status($s): string {
    return in_array($s, ['draft', 'ready', 'public'], true) ? $s : 'draft';
}

function rb_list(array $user): void {
    $st = db()->prepare('SELECT id, title, total_distance, note_count, status, slug, updated_at FROM roadbooks WHERE user_id = ? ORDER BY updated_at DESC');
    $st->execute([$user['id']]);
    json_out(['ok' => true, 'roadbooks' => $st->fetchAll(), 'used_bytes' => user_disk_bytes((int)$user['id']), 'quota_bytes' => user_quota_bytes($user)]);
}

// The edit-rights gate shared by rb_get / rb_save / the lock actions: yours, or attached to
// an event you organize (#123 co-editing). Returns the row (with the owner's username) or 404s.
function rb_require_edit(array $user, int $id): array {
    $st = db()->prepare('SELECT r.user_id, r.filename, r.status, r.slug, r.title, u.username AS owner
        FROM roadbooks r JOIN users u ON u.id = r.user_id WHERE r.id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row || ((int)$row['user_id'] !== (int)$user['id'] && !event_co_edits_roadbook((int)$user['id'], $id))) fail('Not found.', 404);
    return $row;
}

/* ---- soft edit lock (#154): one editor at a time on a co-edited roadbook ---- */
const RB_LOCK_TTL_S = 600; // a lock with no heartbeat for 10 minutes is stale — free to take

// The current holder, or null when the lock is free or stale.
function rb_lock_holder(int $rbId): ?array {
    $st = db()->prepare('SELECT l.user_id, u.username, TIMESTAMPDIFF(SECOND, l.refreshed_at, NOW()) AS age_s
        FROM roadbook_locks l JOIN users u ON u.id = l.user_id WHERE l.roadbook_id = ?');
    $st->execute([$rbId]);
    $row = $st->fetch();
    return ($row && (int)$row['age_s'] < RB_LOCK_TTL_S) ? $row : null;
}
// Take (or keep) the lock — the caller has already passed the edit-rights gate.
function rb_lock_acquire(int $rbId, int $uid): array {
    $h = rb_lock_holder($rbId);
    if ($h && (int)$h['user_id'] !== $uid) return ['mine' => false, 'by' => $h['username'], 'age_s' => (int)$h['age_s']];
    db()->prepare('INSERT INTO roadbook_locks (roadbook_id, user_id) VALUES (?,?)
        ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), acquired_at = NOW(), refreshed_at = NOW()')->execute([$rbId, $uid]);
    return ['mine' => true];
}
// Heartbeat from the Editor while a held roadbook stays open.
function rb_lock_refresh(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    rb_require_edit($user, $id);
    db()->prepare('UPDATE roadbook_locks SET refreshed_at = NOW() WHERE roadbook_id = ? AND user_id = ?')
        ->execute([$id, (int)$user['id']]);
    json_out(['ok' => true]);
}
// Leaving the Editor frees the lock right away (sent as a beacon on page hide).
function rb_lock_release(array $user, array $d): void {
    db()->prepare('DELETE FROM roadbook_locks WHERE roadbook_id = ? AND user_id = ?')
        ->execute([(int)($d['id'] ?? 0), (int)$user['id']]);
    json_out(['ok' => true]);
}
// Take over a lock someone else holds — the whole co-editing team of an event roadbook is
// trusted with this (the other editor's unsaved work is lost, so the client confirms first).
function rb_lock_force(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    rb_require_edit($user, $id);
    db()->prepare('INSERT INTO roadbook_locks (roadbook_id, user_id) VALUES (?,?)
        ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), acquired_at = NOW(), refreshed_at = NOW()')->execute([$id, (int)$user['id']]);
    log_activity((int)$user['id'], 'rb_lock_force', 'roadbook #' . $id);
    json_out(['ok' => true]);
}

function rb_get(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $row = rb_require_edit($user, $id);
    $isOwner = (int)$row['user_id'] === (int)$user['id'];
    // A recording draft that never got a route has no file yet (filename = 'pending'): hand back
    // an empty skeleton so the Editor can open it and draw the route (the first save writes the file).
    if ($row['filename'] === 'pending') {
        $rb = ['meta' => ['title' => $row['title']], 'track' => [], 'notes' => []];
    } else {
        $path = rb_dir((int)$row['user_id']) . '/' . $row['filename'];
        if (!is_file($path)) fail('File missing.', 404);
        $rb = json_decode((string)file_get_contents($path), true);
    }
    // is_owner/owner drive the Editor's co-editing UI (visibility + delete stay with the owner).
    // The soft edit lock (#154) is taken only when the caller ASKS for it (the Editor does;
    // the Reader reads the same roadbooks without blocking anyone's editing).
    $lock = !empty($d['lock']) ? rb_lock_acquire($id, (int)$user['id']) : null;
    json_out(['ok' => true, 'id' => $id, 'status' => $row['status'], 'slug' => $row['slug'],
        'is_owner' => $isOwner, 'owner' => $row['owner'], 'lock' => $lock, 'roadbook' => $rb]);
}

// The roadbooks you can edit through your events (#123): someone else's, attached to an event
// you organize — each row names its event so the Editor landing can say where it comes from.
function rb_coedit_list(array $user): void {
    $st = db()->prepare('SELECT r.id, r.title, r.status, u.username AS owner, e.title AS event_title
        FROM event_roadbooks er JOIN events e ON e.id = er.event_id
        JOIN roadbooks r ON r.id = er.roadbook_id JOIN users u ON u.id = r.user_id
        WHERE r.user_id <> ? AND (e.organizer_id = ?
            OR EXISTS (SELECT 1 FROM event_organizers eo WHERE eo.event_id = e.id AND eo.user_id = ?))
        ORDER BY e.title, er.sort, r.id');
    $st->execute([(int)$user['id'], (int)$user['id'], (int)$user['id']]);
    json_out(['ok' => true, 'roadbooks' => array_map(fn($r) => ['id' => (int)$r['id'], 'title' => $r['title'],
        'status' => $r['status'], 'owner' => $r['owner'], 'event_title' => $r['event_title']], $st->fetchAll())]);
}

function rb_slug(string $title, int $excludeId): string {
    $base = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($title)), '-');
    $base = substr($base ?: 'roadbook', 0, 60);
    $slug = $base; $n = 1;
    while (true) {
        $st = db()->prepare('SELECT id FROM roadbooks WHERE slug = ? AND id <> ?');
        $st->execute([$slug, $excludeId]);
        if (!$st->fetch()) return $slug;
        $slug = $base . '-' . (++$n);
    }
}

// Create an empty draft when recording starts, so photos can attach to it live.
// Drafts that never get finished (note_count = 0) are purged by the cron.
function rb_draft(array $user, array $d = []): void {
    // Title the draft with the recorder's date+time name; fall back to a server date if none was
    // sent — never the old "Recording…" placeholder (#148).
    $title = mb_substr(trim((string)($d['name'] ?? '')), 0, 200);
    if ($title === '') $title = date('Y-m-d H:i');
    db()->prepare("INSERT INTO roadbooks (user_id, title, total_distance, note_count, status, filename) VALUES (?,?,?,?,'draft',?)")
        ->execute([$user['id'], $title, 0, 0, 'pending']);
    json_out(['ok' => true, 'id' => (int)db()->lastInsertId()]);
}

function rb_save(array $user, array $d): void {
    $rb = $d['roadbook'] ?? null;
    if (!is_array($rb) || empty($rb['notes']) || empty($rb['track'])) fail('Invalid roadbook.');
    $title = substr(trim((string)($rb['meta']['title'] ?? '')) ?: 'Untitled', 0, 200);
    $dist = (int)($rb['meta']['total_distance'] ?? 0);
    $nc = count($rb['notes']);
    $status = rb_clean_status($d['status'] ?? null);
    $id = (int)($d['id'] ?? 0);

    if ($id > 0) {
        // yours — or attached to an event you organize (#123 co-editing); the file stays in
        // the OWNER's storage, the owner never changes, and only the owner sets the
        // publication status (a co-editor's save keeps it as it is)
        $row = rb_require_edit($user, $id);
        if ((int)$row['user_id'] !== (int)$user['id']) $status = $row['status'];
        // soft lock (#154): while someone else holds a fresh lock, their work wins
        $h = rb_lock_holder($id);
        if ($h && (int)$h['user_id'] !== (int)$user['id']) fail('This roadbook is being edited by someone else.', 409);
        $dir = rb_dir((int)$row['user_id']);
        $slug = $row['slug'] ?: rb_slug($title, $id); // every roadbook gets a slug (view page works private too)
        $fn = $row['filename'] === 'pending' ? $id . '.rdbk' : $row['filename']; // first save of a recording draft gets its real file
        if (file_put_contents($dir . '/' . $fn, json_encode($rb)) === false) fail('Could not write the roadbook file.', 500);
        db()->prepare('UPDATE roadbooks SET title = ?, total_distance = ?, note_count = ?, status = ?, slug = ?, filename = ? WHERE id = ?')
            ->execute([$title, $dist, $nc, $status, $slug, $fn, $id]);
        rb_lock_acquire($id, (int)$user['id']); // saving keeps (or takes) the lock, heartbeat included
    } else {
        $dir = rb_dir((int)$user['id']); // a brand-new roadbook is always the saver's own
        db()->prepare('INSERT INTO roadbooks (user_id, title, total_distance, note_count, status, filename) VALUES (?,?,?,?,?,?)')
            ->execute([$user['id'], $title, $dist, $nc, $status, 'pending']);
        $id = (int)db()->lastInsertId();
        $fn = $id . '.rdbk';
        $slug = rb_slug($title, $id);
        if (file_put_contents($dir . '/' . $fn, json_encode($rb)) === false) fail('Could not write the roadbook file.', 500);
        db()->prepare('UPDATE roadbooks SET filename = ?, slug = ? WHERE id = ?')->execute([$fn, $slug, $id]);
    }
    json_out(['ok' => true, 'id' => $id, 'title' => $title, 'slug' => $slug, 'status' => $status]);
}

// Set a roadbook's publication status (owner only). Every roadbook already has a slug
// from save, so publishing just sets the status — no slug work needed.
function rb_status(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $status = rb_clean_status($d['status'] ?? null);
    $st = db()->prepare('SELECT slug FROM roadbooks WHERE id = ? AND user_id = ?');
    $st->execute([$id, $user['id']]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    db()->prepare('UPDATE roadbooks SET status = ? WHERE id = ?')->execute([$status, $id]);
    json_out(['ok' => true, 'id' => $id, 'status' => $status, 'slug' => $row['slug']]);
}

// Duplicate a roadbook the user owns: copies the .rdbk file, the DB row and the
// photo gallery (files + rows) into a brand-new roadbook. The copy starts as a draft
// and gets its own title ("… (copy)") and slug.
function rb_duplicate(array $user, array $d): void {
    global $CFG;
    $srcId = (int)($d['id'] ?? 0);
    $st = db()->prepare('SELECT title, total_distance, note_count, filename FROM roadbooks WHERE id = ? AND user_id = ?');
    $st->execute([$srcId, $user['id']]);
    $src = $st->fetch();
    if (!$src) fail('Not found.', 404);
    $dir = rb_dir((int)$user['id']);
    $srcPath = $dir . '/' . $src['filename'];
    if (!is_file($srcPath)) fail('File missing.', 404);

    $title = substr(trim((string)$src['title']) . ' (copy)', 0, 200);
    db()->prepare("INSERT INTO roadbooks (user_id, title, total_distance, note_count, status, filename) VALUES (?,?,?,?,'draft',?)")
        ->execute([$user['id'], $title, (int)$src['total_distance'], (int)$src['note_count'], 'pending']);
    $newId = (int)db()->lastInsertId();
    $fn = $newId . '.rdbk';
    if (!@copy($srcPath, $dir . '/' . $fn)) fail('Could not copy the roadbook file.', 500);
    $slug = rb_slug($title, $newId);
    db()->prepare('UPDATE roadbooks SET filename = ?, slug = ? WHERE id = ?')->execute([$fn, $slug, $newId]);

    // carry the gallery over: copy each photo file and its row
    $p = db()->prepare('SELECT filename, lat, lon, sort FROM roadbook_photos WHERE roadbook_id = ? ORDER BY sort, id');
    $p->execute([$srcId]);
    $photos = $p->fetchAll();
    if ($photos) {
        $srcPhotoDir = $CFG['photos_dir'] . '/' . $srcId;
        $dstPhotoDir = $CFG['photos_dir'] . '/' . $newId;
        if (!is_dir($dstPhotoDir)) mkdir($dstPhotoDir, 0755, true);
        $ins = db()->prepare('INSERT INTO roadbook_photos (roadbook_id, filename, lat, lon, sort) VALUES (?,?,?,?,?)');
        foreach ($photos as $ph) {
            @copy($srcPhotoDir . '/' . $ph['filename'], $dstPhotoDir . '/' . $ph['filename']);
            $ins->execute([$newId, $ph['filename'], $ph['lat'], $ph['lon'], $ph['sort']]);
        }
    }
    // carry the voice notes over: copy each clip and its row
    $a = db()->prepare('SELECT filename, lat, lon FROM roadbook_audio WHERE roadbook_id = ? ORDER BY id');
    $a->execute([$srcId]);
    $clips = $a->fetchAll();
    if ($clips) {
        $srcAudioDir = $CFG['audio_dir'] . '/' . $srcId;
        $dstAudioDir = $CFG['audio_dir'] . '/' . $newId;
        if (!is_dir($dstAudioDir)) mkdir($dstAudioDir, 0755, true);
        $insA = db()->prepare('INSERT INTO roadbook_audio (roadbook_id, filename, lat, lon) VALUES (?,?,?,?)');
        foreach ($clips as $cl) {
            @copy($srcAudioDir . '/' . $cl['filename'], $dstAudioDir . '/' . $cl['filename']);
            $insA->execute([$newId, $cl['filename'], $cl['lat'], $cl['lon']]);
        }
    }
    json_out(['ok' => true, 'id' => $newId, 'title' => $title, 'slug' => $slug]);
}

function ph_list(?array $user, array $d): void {
    $rbId = (int)($d['roadbook'] ?? 0);
    $st = db()->prepare('SELECT user_id, status FROM roadbooks WHERE id = ?');
    $st->execute([$rbId]);
    $rb = $st->fetch();
    if (!$rb) fail('Not found.', 404);
    // public, yours, or a roadbook you co-edit through an event (#123 — the photos are content)
    if ($rb['status'] !== 'public' && (!$user || ((int)$user['id'] !== (int)$rb['user_id'] && !event_co_edits_roadbook((int)$user['id'], $rbId)))) fail('This roadbook is private.', 403);
    // the reserved cover ('_map.avif') is the listing thumbnail, not a gallery photo → never listed here
    $p = db()->prepare("SELECT id, filename, lat, lon FROM roadbook_photos WHERE roadbook_id = ? AND filename <> '_map.avif' ORDER BY sort, id");
    $p->execute([$rbId]);
    $photos = array_map(fn($r) => ['id' => (int)$r['id'], 'url' => '/photos/' . $rbId . '/' . $r['filename'], 'lat' => $r['lat'] !== null ? (float)$r['lat'] : null, 'lon' => $r['lon'] !== null ? (float)$r['lon'] : null], $p->fetchAll());
    json_out(['ok' => true, 'photos' => $photos]);
}

function ph_delete(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $st = db()->prepare('SELECT p.filename, p.roadbook_id FROM roadbook_photos p JOIN roadbooks r ON r.id = p.roadbook_id WHERE p.id = ? AND r.user_id = ?');
    $st->execute([$id, $user['id']]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    global $CFG;
    @unlink($CFG['photos_dir'] . '/' . $row['roadbook_id'] . '/' . $row['filename']);
    db()->prepare('DELETE FROM roadbook_photos WHERE id = ?')->execute([$id]);
    json_out(['ok' => true]);
}

// Reposition a photo's pin on the map (update its lat/lon).
function ph_move(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $lat = isset($d['lat']) && $d['lat'] !== '' ? (float)$d['lat'] : null;
    $lon = isset($d['lon']) && $d['lon'] !== '' ? (float)$d['lon'] : null;
    if ($lat === null || $lon === null || $lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) fail('Bad coordinates.');
    $st = db()->prepare('SELECT p.id FROM roadbook_photos p JOIN roadbooks r ON r.id = p.roadbook_id WHERE p.id = ? AND r.user_id = ?');
    $st->execute([$id, $user['id']]);
    if (!$st->fetch()) fail('Not found.', 404);
    db()->prepare('UPDATE roadbook_photos SET lat = ?, lon = ? WHERE id = ?')->execute([$lat, $lon, $id]);
    json_out(['ok' => true]);
}

/* ---- waypoint voice notes (recorded audio kept alongside the transcription) ---- */
function audio_list(?array $user, array $d): void {
    $rbId = (int)($d['roadbook'] ?? 0);
    $st = db()->prepare('SELECT user_id, status FROM roadbooks WHERE id = ?');
    $st->execute([$rbId]);
    $rb = $st->fetch();
    if (!$rb) fail('Not found.', 404);
    // public, yours, or a roadbook you co-edit through an event (#123 — the voice notes are content)
    if ($rb['status'] !== 'public' && (!$user || ((int)$user['id'] !== (int)$rb['user_id'] && !event_co_edits_roadbook((int)$user['id'], $rbId)))) fail('This roadbook is private.', 403);
    $a = db()->prepare('SELECT id, filename, lat, lon FROM roadbook_audio WHERE roadbook_id = ? ORDER BY id');
    $a->execute([$rbId]);
    $audio = array_map(fn($r) => ['id' => (int)$r['id'], 'url' => '/audio/' . $rbId . '/' . $r['filename'], 'lat' => $r['lat'] !== null ? (float)$r['lat'] : null, 'lon' => $r['lon'] !== null ? (float)$r['lon'] : null], $a->fetchAll());
    json_out(['ok' => true, 'audio' => $audio]);
}

function audio_delete(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $st = db()->prepare('SELECT a.filename, a.roadbook_id FROM roadbook_audio a JOIN roadbooks r ON r.id = a.roadbook_id WHERE a.id = ? AND r.user_id = ?');
    $st->execute([$id, $user['id']]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    global $CFG;
    @unlink($CFG['audio_dir'] . '/' . $row['roadbook_id'] . '/' . $row['filename']);
    db()->prepare('DELETE FROM roadbook_audio WHERE id = ?')->execute([$id]);
    json_out(['ok' => true]);
}

/* ---- public (no auth): home gallery + challenge page ---- */
function public_list(): void {
    $st = db()->query("SELECT r.id, r.slug, r.title, r.total_distance, r.note_count, u.username,
            (SELECT filename FROM roadbook_photos p WHERE p.roadbook_id = r.id ORDER BY p.sort, p.id LIMIT 1) AS thumb
        FROM roadbooks r JOIN users u ON u.id = r.user_id
        WHERE r.status = 'public' AND r.slug IS NOT NULL ORDER BY r.updated_at DESC LIMIT 60");
    $rows = array_map(fn($r) => [
        'id' => (int)$r['id'], 'slug' => $r['slug'], 'title' => $r['title'], 'total_distance' => (int)$r['total_distance'],
        'note_count' => (int)$r['note_count'], 'username' => $r['username'],
        'thumb' => $r['thumb'] ? '/photos/' . $r['id'] . '/' . $r['thumb'] : null,
    ], $st->fetchAll());
    json_out(['ok' => true, 'roadbooks' => $rows]);
}

function public_get(array $d): void {
    global $CFG;
    $slug = (string)($d['slug'] ?? '');
    $st = db()->prepare('SELECT r.id, r.title, r.total_distance, r.note_count, r.filename, r.user_id, r.status, u.username, u.first_name, u.last_name, u.bio, u.avatar
        FROM roadbooks r JOIN users u ON u.id = r.user_id WHERE r.slug = ?');
    $st->execute([$slug]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    $me = current_user();
    $isOwner = $me && (int)$me['id'] === (int)$row['user_id'];
    // Event delivery (#25): a READY roadbook attached to an event is readable by that event's
    // participants and organizers — never anonymously; drafts stay owner-only.
    $viaEvent = !$isOwner && $me && $row['status'] === 'ready' && event_grants_read((int)$me['id'], (int)$row['id']);
    if ($row['status'] !== 'public' && !$isOwner && !$viaEvent) fail('This roadbook is private.', 403);
    $path = rb_dir((int)$row['user_id']) . '/' . $row['filename'];
    if (!is_file($path)) fail('File missing.', 404);
    $rb = json_decode((string)file_get_contents($path), true);
    // gallery photos exclude the reserved route-map cover; it is returned separately as `cover`
    $p = db()->prepare("SELECT id, filename FROM roadbook_photos WHERE roadbook_id = ? AND filename <> '_map.avif' ORDER BY sort, id");
    $p->execute([$row['id']]);
    $photos = array_map(fn($r) => '/photos/' . $row['id'] . '/' . $r['filename'], $p->fetchAll());
    $cover = is_file($CFG['photos_dir'] . '/' . $row['id'] . '/_map.avif') ? '/photos/' . $row['id'] . '/_map.avif' : null;
    json_out(['ok' => true, 'id' => (int)$row['id'], 'slug' => $slug, 'is_owner' => $isOwner, 'status' => $row['status'], 'roadbook' => $rb, 'photos' => $photos, 'cover' => $cover,
        'owner' => ['username' => $row['username'], 'name' => trim($row['first_name'] . ' ' . $row['last_name']), 'bio' => $row['bio'], 'avatar' => $row['avatar']]]);
}

function rb_delete(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $st = db()->prepare('SELECT filename FROM roadbooks WHERE id = ? AND user_id = ?');
    $st->execute([$id, $user['id']]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    @unlink(rb_dir((int)$user['id']) . '/' . $row['filename']);
    db()->prepare('DELETE FROM roadbooks WHERE id = ?')->execute([$id]);
    json_out(['ok' => true]);
}
