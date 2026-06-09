<?php
/* Multipart image upload → compressed AVIF (the original is never stored).
 *   type=avatar                       → square 256px avatar
 *   type=photo  roadbook=<id>         → gallery photo (max 1600px) */
require dirname(__DIR__, 2) . '/app/bootstrap.php';
require dirname(__DIR__, 2) . '/app/images.php';
global $CFG;

$user = require_user();

if (($_SERVER['HTTP_ORIGIN'] ?? '') !== '' && parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST) !== ($_SERVER['HTTP_HOST'] ?? '')) fail('Bad origin.', 403);
if (empty($_FILES['photo']['tmp_name']) || !is_uploaded_file($_FILES['photo']['tmp_name'])) fail('No image uploaded.');
if (($_FILES['photo']['size'] ?? 0) > 12 * 1024 * 1024) fail('Image too large (max 12 MB).');
$tmp = $_FILES['photo']['tmp_name'];
$type = $_POST['type'] ?? '';

if ($type === 'avatar') {
    $dest = $CFG['avatars_dir'] . '/' . $user['id'] . '.avif';
    if (!process_to_avif($tmp, $dest, 256, true, 50)) fail('Could not process the image.');
    $url = '/avatars/' . $user['id'] . '.avif';
    db()->prepare('UPDATE users SET avatar = ? WHERE id = ?')->execute([$url, $user['id']]);
    json_out(['ok' => true, 'avatar' => $url . '?v=' . time()]);
}

if ($type === 'photo') {
    $rbId = (int)($_POST['roadbook'] ?? 0);
    $st = db()->prepare('SELECT id FROM roadbooks WHERE id = ? AND user_id = ?');
    $st->execute([$rbId, $user['id']]);
    if (!$st->fetch()) fail('Roadbook not found.', 404);
    $cnt = db()->prepare('SELECT COUNT(*) c FROM roadbook_photos WHERE roadbook_id = ?'); $cnt->execute([$rbId]);
    if ((int)$cnt->fetch()['c'] >= 60) fail('Gallery is full (60 photos max).');
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

fail('Unknown upload type.');
