<?php
/* Multipart upload.
 *   type=avatar                 → square 256px AVIF avatar (re-compressed; original never stored)
 *   type=event_logo event=<id>  → event logo, max 512px AVIF (manage rights; #151)
 *   type=photo   roadbook=<id>  → gallery photo, max 1600px AVIF
 *   type=audio   roadbook=<id>  → waypoint voice note, stored as-is (no transcoding)
 *   type=run_card run=<id>      → the run's shareable image, 1080px AVIF (the runner's own run, #785) */
require dirname(__DIR__, 2) . '/app/bootstrap.php';
require dirname(__DIR__, 2) . '/app/images.php';
global $CFG;

cors_for_app(); // native app: cross-origin upload (Bearer auth) — CORS headers + preflight before auth
$user = require_user();
require_same_origin();
$type = $_POST['type'] ?? '';

// The optional geotag of a media upload: a valid pair, or nulls (shared by audio + photo, #214).
function post_latlon(): array {
    $lat = (isset($_POST['lat']) && $_POST['lat'] !== '') ? (float)$_POST['lat'] : null;
    $lon = (isset($_POST['lon']) && $_POST['lon'] !== '') ? (float)$_POST['lon'] : null;
    if ($lat !== null && ($lat < -90 || $lat > 90)) $lat = null;
    if ($lon !== null && ($lon < -180 || $lon > 180)) $lon = null;
    return [$lat, $lon];
}

if ($type === 'audio') {
    // Voice note: the recorded clip kept as-is (an imported .rdbk can bundle them), so it can be
    // replayed on its note. Geolocated, so the Editor can tie it
    // to the note at that position. App/server feature only — never inside the .rdbk.
    if (empty($_FILES['audio']['tmp_name']) || !is_uploaded_file($_FILES['audio']['tmp_name'])) fail('No audio uploaded.');
    if (($_FILES['audio']['size'] ?? 0) > 12 * 1024 * 1024) fail('Audio too large (max 12 MB).');
    $rbId = (int)($_POST['roadbook'] ?? 0);
    $rb = rb_require_edit($user, $rbId); // the owner or an event co-editor; never a trashed roadbook
    $cnt = db()->prepare('SELECT COUNT(*) c FROM roadbook_audio WHERE roadbook_id = ?'); $cnt->execute([$rbId]);
    if ((int)$cnt->fetch()['c'] >= 200) fail('Too many voice notes (200 max).');
    rb_assert_quota((int)$rb['user_id'], 0, (int)$_FILES['audio']['size']); // media counts against the roadbook's OWNER
    [$lat, $lon] = post_latlon();
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
    // versioned like the event logo (#588): a re-upload shows at once, then caches normally
    $url = '/avatars/' . $user['id'] . '.avif?v=' . time();
    db()->prepare('UPDATE users SET avatar = ? WHERE id = ?')->execute([$url, $user['id']]);
    json_out(['ok' => true, 'avatar' => $url]);
}

if ($type === 'event_logo') {
    $e = require_event_manage($user, (int)($_POST['event'] ?? 0)); // owner / co-organizer / admin (#151)
    if (!is_dir($CFG['event_logos_dir'])) mkdir($CFG['event_logos_dir'], 0755, true);
    $dest = $CFG['event_logos_dir'] . '/' . (int)$e['id'] . '.avif';
    if (!process_to_avif($tmp, $dest, 512, false, 55)) fail('Could not process the image.');
    // the file keeps its name, so the stored URL carries the upload time: every page then shows
    // the new logo at once and caches it normally, instead of busting the cache on each render (#588)
    $url = '/event-logos/' . (int)$e['id'] . '.avif?v=' . time();
    db()->prepare('UPDATE events SET logo = ? WHERE id = ?')->execute([$url, (int)$e['id']]);
    json_out(['ok' => true, 'logo' => $url]);
}

if ($type === 'run_card') {
    run_owned($user, $runId = (int)($_POST['run'] ?? 0)); // only the runner's own run
    if (!is_dir($CFG['run_cards_dir'])) mkdir($CFG['run_cards_dir'], 0755, true);
    if (!process_to_avif($tmp, run_card_path($runId), 1080, false, 60)) fail('Could not process the image.');
    json_out(['ok' => true, 'card' => run_card_url($runId)]);
}

if ($type === 'photo') {
    $rbId = (int)($_POST['roadbook'] ?? 0);
    $rb = rb_require_edit($user, $rbId); // the owner or an event co-editor; never a trashed roadbook
    $cnt = db()->prepare('SELECT COUNT(*) c FROM roadbook_photos WHERE roadbook_id = ?'); $cnt->execute([$rbId]);
    if ((int)$cnt->fetch()['c'] >= 60) fail('Gallery is full (60 photos max).');
    rb_assert_quota((int)$rb['user_id'], 0, 0); // media counts against the roadbook's OWNER; the AVIF size is known only once encoded
    [$lat, $lon] = post_latlon();
    db()->prepare('INSERT INTO roadbook_photos (roadbook_id, filename, lat, lon) VALUES (?,?,?,?)')->execute([$rbId, 'pending', $lat, $lon]);
    $pid = (int)db()->lastInsertId();
    $fn = bin2hex(random_bytes(8)) . '.avif'; // unguessable → private roadbook photos can't be enumerated
    $dest = $CFG['photos_dir'] . '/' . $rbId . '/' . $fn;
    if (!process_to_avif($tmp, $dest, 1600, false, 55)) { db()->prepare('DELETE FROM roadbook_photos WHERE id = ?')->execute([$pid]); fail('Could not process the image.'); }
    db()->prepare('UPDATE roadbook_photos SET filename = ? WHERE id = ?')->execute([$fn, $pid]);
    json_out(['ok' => true, 'id' => $pid, 'url' => '/photos/' . $rbId . '/' . $fn, 'lat' => $lat, 'lon' => $lon]);
}

if ($type === 'cover') {
    // The roadbook's auto-generated route-map cover: the single reserved gallery entry at sort -1
    // (= first, so it is the home/listing thumbnail), regenerated on every save — a co-editor's
    // save regenerates it too (#123). Excluded from the public photo swipe (see roadbooks.php).
    // Generated client-side (cover-map.js). The filename is random like every stored photo, so
    // private roadbooks' route maps can't be enumerated (#206).
    $rbId = (int)($_POST['roadbook'] ?? 0);
    rb_require_edit($user, $rbId);
    $fn = bin2hex(random_bytes(8)) . '.avif';
    $dest = $CFG['photos_dir'] . '/' . $rbId . '/' . $fn;
    if (!process_to_avif($tmp, $dest, 1200, false, 55)) fail('Could not process the image.');
    $ex = db()->prepare('SELECT id, filename FROM roadbook_photos WHERE roadbook_id = ? AND sort = -1');
    $ex->execute([$rbId]);
    if ($old = $ex->fetch()) {
        @unlink($CFG['photos_dir'] . '/' . $rbId . '/' . $old['filename']);
        db()->prepare('UPDATE roadbook_photos SET filename = ? WHERE id = ?')->execute([$fn, (int)$old['id']]);
    } else {
        db()->prepare('INSERT INTO roadbook_photos (roadbook_id, filename, lat, lon, sort) VALUES (?,?,?,?,-1)')->execute([$rbId, $fn, null, null]);
    }
    json_out(['ok' => true, 'url' => '/photos/' . $rbId . '/' . $fn]);
}

fail('Unknown upload type.');
