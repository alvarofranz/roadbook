<?php
/* Multipart upload.
 *   type=avatar                 → square 256px AVIF avatar (re-compressed; original never stored)
 *   type=event_logo event=<id>  → event logo, max 512px AVIF (manage rights; #151)
 *   type=photo   roadbook=<id>  → gallery photo, max 1600px AVIF
 *   type=audio   roadbook=<id>  → waypoint voice note, stored as-is (no transcoding) */
require dirname(__DIR__, 2) . '/app/bootstrap.php';
require dirname(__DIR__, 2) . '/app/images.php';
global $CFG;

$user = require_user();
if (($_SERVER['HTTP_ORIGIN'] ?? '') !== '' && parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST) !== ($_SERVER['HTTP_HOST'] ?? '')) fail('Bad origin.', 403);
$type = $_POST['type'] ?? '';

if ($type === 'audio') {
    // Voice note: keep the recorded clip as-is alongside its transcription, so a wrong
    // transcription can be replayed and re-checked. Geolocated, so the Editor can tie it
    // to the note at that position. App/server feature only — never inside the .rdbk.
    if (empty($_FILES['audio']['tmp_name']) || !is_uploaded_file($_FILES['audio']['tmp_name'])) fail('No audio uploaded.');
    if (($_FILES['audio']['size'] ?? 0) > 12 * 1024 * 1024) fail('Audio too large (max 12 MB).');
    $rbId = (int)($_POST['roadbook'] ?? 0);
    $st = db()->prepare('SELECT id FROM roadbooks WHERE id = ? AND user_id = ?');
    $st->execute([$rbId, $user['id']]);
    if (!$st->fetch()) fail('Roadbook not found.', 404);
    $cnt = db()->prepare('SELECT COUNT(*) c FROM roadbook_audio WHERE roadbook_id = ?'); $cnt->execute([$rbId]);
    if ((int)$cnt->fetch()['c'] >= 200) fail('Too many voice notes (200 max).');
    if (user_disk_bytes($user['id']) >= user_quota_bytes($user)) fail('Storage limit reached — free up space or ask an admin for more.', 413);
    $lat = (isset($_POST['lat']) && $_POST['lat'] !== '') ? (float)$_POST['lat'] : null;
    $lon = (isset($_POST['lon']) && $_POST['lon'] !== '') ? (float)$_POST['lon'] : null;
    if ($lat !== null && ($lat < -90 || $lat > 90)) $lat = null;
    if ($lon !== null && ($lon < -180 || $lon > 180)) $lon = null;
    // Extension from the browser-reported MIME (MediaRecorder output differs by browser); default webm.
    $ext = ['audio/webm' => 'webm', 'video/webm' => 'webm', 'audio/ogg' => 'ogg', 'audio/mp4' => 'm4a', 'audio/mpeg' => 'mp3', 'audio/wav' => 'wav'][$_FILES['audio']['type'] ?? ''] ?? 'webm';
    $fn = bin2hex(random_bytes(8)) . '.' . $ext; // unguessable → private voice notes can't be enumerated
    $dir = $CFG['audio_dir'] . '/' . $rbId;
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    if (!move_uploaded_file($_FILES['audio']['tmp_name'], $dir . '/' . $fn)) fail('Could not store the audio.');
    db()->prepare('INSERT INTO roadbook_audio (roadbook_id, filename, lat, lon) VALUES (?,?,?,?)')->execute([$rbId, $fn, $lat, $lon]);
    json_out(['ok' => true, 'id' => (int)db()->lastInsertId(), 'url' => '/audio/' . $rbId . '/' . $fn, 'lat' => $lat, 'lon' => $lon]);
}

// Images (avatar / photo) → re-compressed to AVIF; the original is never stored.
if (empty($_FILES['photo']['tmp_name']) || !is_uploaded_file($_FILES['photo']['tmp_name'])) fail('No image uploaded.');
if (($_FILES['photo']['size'] ?? 0) > 12 * 1024 * 1024) fail('Image too large (max 12 MB).');
$tmp = $_FILES['photo']['tmp_name'];

if ($type === 'avatar') {
    $dest = $CFG['avatars_dir'] . '/' . $user['id'] . '.avif';
    if (!process_to_avif($tmp, $dest, 256, true, 50)) fail('Could not process the image.');
    $url = '/avatars/' . $user['id'] . '.avif';
    db()->prepare('UPDATE users SET avatar = ? WHERE id = ?')->execute([$url, $user['id']]);
    json_out(['ok' => true, 'avatar' => $url . '?v=' . time()]);
}

if ($type === 'event_logo') {
    $e = require_event_manage($user, (int)($_POST['event'] ?? 0)); // owner / co-organizer / admin (#151)
    if (!is_dir($CFG['event_logos_dir'])) mkdir($CFG['event_logos_dir'], 0755, true);
    $dest = $CFG['event_logos_dir'] . '/' . (int)$e['id'] . '.avif';
    if (!process_to_avif($tmp, $dest, 512, false, 55)) fail('Could not process the image.');
    $url = '/event-logos/' . (int)$e['id'] . '.avif';
    db()->prepare('UPDATE events SET logo = ? WHERE id = ?')->execute([$url, (int)$e['id']]);
    json_out(['ok' => true, 'logo' => $url . '?v=' . time()]);
}

if ($type === 'photo') {
    $rbId = (int)($_POST['roadbook'] ?? 0);
    $st = db()->prepare('SELECT id FROM roadbooks WHERE id = ? AND user_id = ?');
    $st->execute([$rbId, $user['id']]);
    if (!$st->fetch()) fail('Roadbook not found.', 404);
    $cnt = db()->prepare('SELECT COUNT(*) c FROM roadbook_photos WHERE roadbook_id = ?'); $cnt->execute([$rbId]);
    if ((int)$cnt->fetch()['c'] >= 60) fail('Gallery is full (60 photos max).');
    if (user_disk_bytes($user['id']) >= user_quota_bytes($user)) fail('Storage limit reached — free up space or ask an admin for more.', 413);
    $lat = (isset($_POST['lat']) && $_POST['lat'] !== '') ? (float)$_POST['lat'] : null;
    $lon = (isset($_POST['lon']) && $_POST['lon'] !== '') ? (float)$_POST['lon'] : null;
    if ($lat !== null && ($lat < -90 || $lat > 90)) $lat = null;
    if ($lon !== null && ($lon < -180 || $lon > 180)) $lon = null;
    db()->prepare('INSERT INTO roadbook_photos (roadbook_id, filename, lat, lon) VALUES (?,?,?,?)')->execute([$rbId, 'pending', $lat, $lon]);
    $pid = (int)db()->lastInsertId();
    $fn = bin2hex(random_bytes(8)) . '.avif'; // unguessable → private roadbook photos can't be enumerated
    $dest = $CFG['photos_dir'] . '/' . $rbId . '/' . $fn;
    if (!process_to_avif($tmp, $dest, 1600, false, 55)) { db()->prepare('DELETE FROM roadbook_photos WHERE id = ?')->execute([$pid]); fail('Could not process the image.'); }
    db()->prepare('UPDATE roadbook_photos SET filename = ? WHERE id = ?')->execute([$fn, $pid]);
    json_out(['ok' => true, 'id' => $pid, 'url' => '/photos/' . $rbId . '/' . $fn, 'lat' => $lat, 'lon' => $lon]);
}

if ($type === 'cover') {
    // The roadbook's auto-generated route-map cover: a single reserved gallery entry under a fixed
    // name, overwritten on every save — a co-editor's save regenerates it too (#123). It is the
    // home/listing thumbnail (sort -1 = first) but is excluded from the public photo swipe (see
    // roadbooks.php). Generated client-side (cover-map.js).
    $rbId = (int)($_POST['roadbook'] ?? 0);
    rb_require_edit($user, $rbId);
    $fn = '_map.avif';
    $dest = $CFG['photos_dir'] . '/' . $rbId . '/' . $fn;
    if (!process_to_avif($tmp, $dest, 1200, false, 55)) fail('Could not process the image.');
    $ex = db()->prepare('SELECT id FROM roadbook_photos WHERE roadbook_id = ? AND filename = ?');
    $ex->execute([$rbId, $fn]);
    if (!$ex->fetch()) db()->prepare('INSERT INTO roadbook_photos (roadbook_id, filename, lat, lon, sort) VALUES (?,?,?,?,?)')->execute([$rbId, $fn, null, null, -1]);
    json_out(['ok' => true, 'url' => '/photos/' . $rbId . '/' . $fn]);
}

fail('Unknown upload type.');
