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

function rb_list(array $user): void {
    $st = db()->prepare('SELECT id, title, total_distance, note_count, is_public, slug, updated_at FROM roadbooks WHERE user_id = ? ORDER BY updated_at DESC');
    $st->execute([$user['id']]);
    json_out(['ok' => true, 'roadbooks' => $st->fetchAll()]);
}

function rb_get(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $st = db()->prepare('SELECT filename, is_public, slug, title FROM roadbooks WHERE id = ? AND user_id = ?');
    $st->execute([$id, $user['id']]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    // A recording draft that never got a route has no file yet (filename = 'pending'): hand back
    // an empty skeleton so the Editor can open it and draw the route (the first save writes the file).
    if ($row['filename'] === 'pending') {
        $rb = ['meta' => ['title' => $row['title']], 'track' => [], 'notes' => []];
    } else {
        $path = rb_dir((int)$user['id']) . '/' . $row['filename'];
        if (!is_file($path)) fail('File missing.', 404);
        $rb = json_decode((string)file_get_contents($path), true);
    }
    json_out(['ok' => true, 'id' => $id, 'is_public' => (int)$row['is_public'], 'slug' => $row['slug'], 'roadbook' => $rb]);
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
function rb_draft(array $user): void {
    db()->prepare('INSERT INTO roadbooks (user_id, title, total_distance, note_count, is_public, filename) VALUES (?,?,?,?,?,?)')
        ->execute([$user['id'], 'Recording…', 0, 0, 0, 'pending']);
    json_out(['ok' => true, 'id' => (int)db()->lastInsertId()]);
}

function rb_save(array $user, array $d): void {
    $rb = $d['roadbook'] ?? null;
    if (!is_array($rb) || empty($rb['notes']) || empty($rb['track'])) fail('Invalid roadbook.');
    $title = substr(trim((string)($rb['meta']['title'] ?? '')) ?: 'Untitled', 0, 200);
    $dist = (int)($rb['meta']['total_distance'] ?? 0);
    $nc = count($rb['notes']);
    $isPublic = !empty($d['is_public']) ? 1 : 0;
    $id = (int)($d['id'] ?? 0);
    $dir = rb_dir((int)$user['id']);

    if ($id > 0) {
        $st = db()->prepare('SELECT filename, slug FROM roadbooks WHERE id = ? AND user_id = ?');
        $st->execute([$id, $user['id']]);
        $row = $st->fetch();
        if (!$row) fail('Not found.', 404);
        $slug = $row['slug'] ?: rb_slug($title, $id); // every roadbook gets a slug (view page works private too)
        $fn = $row['filename'] === 'pending' ? $id . '.rdbk' : $row['filename']; // first save of a recording draft gets its real file
        if (file_put_contents($dir . '/' . $fn, json_encode($rb)) === false) fail('Could not write the roadbook file.', 500);
        db()->prepare('UPDATE roadbooks SET title = ?, total_distance = ?, note_count = ?, is_public = ?, slug = ?, filename = ? WHERE id = ?')
            ->execute([$title, $dist, $nc, $isPublic, $slug, $fn, $id]);
    } else {
        db()->prepare('INSERT INTO roadbooks (user_id, title, total_distance, note_count, is_public, filename) VALUES (?,?,?,?,?,?)')
            ->execute([$user['id'], $title, $dist, $nc, $isPublic, 'pending']);
        $id = (int)db()->lastInsertId();
        $fn = $id . '.rdbk';
        $slug = rb_slug($title, $id);
        if (file_put_contents($dir . '/' . $fn, json_encode($rb)) === false) fail('Could not write the roadbook file.', 500);
        db()->prepare('UPDATE roadbooks SET filename = ?, slug = ? WHERE id = ?')->execute([$fn, $slug, $id]);
    }
    json_out(['ok' => true, 'id' => $id, 'title' => $title, 'slug' => $slug, 'is_public' => $isPublic]);
}

// Toggle a roadbook's public/private visibility (owner only). Every roadbook already has a slug
// from save, so publishing just flips the flag — no slug work needed.
function rb_visibility(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $isPublic = !empty($d['is_public']) ? 1 : 0;
    $st = db()->prepare('SELECT slug FROM roadbooks WHERE id = ? AND user_id = ?');
    $st->execute([$id, $user['id']]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    db()->prepare('UPDATE roadbooks SET is_public = ? WHERE id = ?')->execute([$isPublic, $id]);
    json_out(['ok' => true, 'id' => $id, 'is_public' => $isPublic, 'slug' => $row['slug']]);
}

// Duplicate a roadbook the user owns: copies the .rdbk file, the DB row and the
// photo gallery (files + rows) into a brand-new roadbook. The copy starts private
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
    db()->prepare('INSERT INTO roadbooks (user_id, title, total_distance, note_count, is_public, filename) VALUES (?,?,?,?,?,?)')
        ->execute([$user['id'], $title, (int)$src['total_distance'], (int)$src['note_count'], 0, 'pending']);
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
    $st = db()->prepare('SELECT user_id, is_public FROM roadbooks WHERE id = ?');
    $st->execute([$rbId]);
    $rb = $st->fetch();
    if (!$rb) fail('Not found.', 404);
    if (!(int)$rb['is_public'] && (!$user || (int)$user['id'] !== (int)$rb['user_id'])) fail('This roadbook is private.', 403);
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
    $st = db()->prepare('SELECT user_id, is_public FROM roadbooks WHERE id = ?');
    $st->execute([$rbId]);
    $rb = $st->fetch();
    if (!$rb) fail('Not found.', 404);
    if (!(int)$rb['is_public'] && (!$user || (int)$user['id'] !== (int)$rb['user_id'])) fail('This roadbook is private.', 403);
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
    $st = db()->query('SELECT r.id, r.slug, r.title, r.total_distance, r.note_count, u.username,
            (SELECT filename FROM roadbook_photos p WHERE p.roadbook_id = r.id ORDER BY p.sort, p.id LIMIT 1) AS thumb
        FROM roadbooks r JOIN users u ON u.id = r.user_id
        WHERE r.is_public = 1 AND r.slug IS NOT NULL ORDER BY r.updated_at DESC LIMIT 60');
    $rows = array_map(fn($r) => [
        'slug' => $r['slug'], 'title' => $r['title'], 'total_distance' => (int)$r['total_distance'],
        'note_count' => (int)$r['note_count'], 'username' => $r['username'],
        'thumb' => $r['thumb'] ? '/photos/' . $r['id'] . '/' . $r['thumb'] : null,
    ], $st->fetchAll());
    json_out(['ok' => true, 'roadbooks' => $rows]);
}

function public_get(array $d): void {
    global $CFG;
    $slug = (string)($d['slug'] ?? '');
    $st = db()->prepare('SELECT r.id, r.title, r.total_distance, r.note_count, r.filename, r.user_id, r.is_public, u.username, u.first_name, u.last_name, u.bio, u.avatar
        FROM roadbooks r JOIN users u ON u.id = r.user_id WHERE r.slug = ?');
    $st->execute([$slug]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    $me = current_user();
    $isOwner = $me && (int)$me['id'] === (int)$row['user_id'];
    if (!(int)$row['is_public'] && !$isOwner) fail('This roadbook is private.', 403);
    $path = rb_dir((int)$row['user_id']) . '/' . $row['filename'];
    if (!is_file($path)) fail('File missing.', 404);
    $rb = json_decode((string)file_get_contents($path), true);
    // gallery photos exclude the reserved route-map cover; it is returned separately as `cover`
    $p = db()->prepare("SELECT id, filename FROM roadbook_photos WHERE roadbook_id = ? AND filename <> '_map.avif' ORDER BY sort, id");
    $p->execute([$row['id']]);
    $photos = array_map(fn($r) => '/photos/' . $row['id'] . '/' . $r['filename'], $p->fetchAll());
    $cover = is_file($CFG['photos_dir'] . '/' . $row['id'] . '/_map.avif') ? '/photos/' . $row['id'] . '/_map.avif' : null;
    json_out(['ok' => true, 'id' => (int)$row['id'], 'slug' => $slug, 'is_owner' => $isOwner, 'is_public' => (int)$row['is_public'], 'roadbook' => $rb, 'photos' => $photos, 'cover' => $cover,
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
