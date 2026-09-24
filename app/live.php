<?php
/* Live tracking for event organizers (#947). While a participant navigates one of an event's
 * roadbooks in the Reader — and agreed to share it when that run started — the Reader pings its
 * last position; the event's organizers see every participant on a map. One row per participant
 * per event (event_live), overwritten by each ping: the last position, never a history. Nothing is
 * taken outside such a run, and the rows go with the event (cron/purge-event-live.php). */

// The days around an event's dates a ping is still taken: a stage that starts early or runs late
const LIVE_MARGIN_DAYS = 1;

// Is the event running today (its dates, with the margin)? An event with no dates is always open.
function live_event_running(array $e): bool {
    $today = date('Y-m-d');
    $from = !empty($e['starts_on']) ? date('Y-m-d', strtotime($e['starts_on'] . ' -' . LIVE_MARGIN_DAYS . ' day')) : null;
    $to = !empty($e['ends_on']) ? date('Y-m-d', strtotime($e['ends_on'] . ' +' . LIVE_MARGIN_DAYS . ' day')) : null;
    return (!$from || $today >= $from) && (!$to || $today <= $to);
}

// The one gate every ping and stop goes through: an ACTIVE participant, on a roadbook of this
// event, while it runs. Anything else is refused and nothing is stored.
function live_gate(array $user, array $d): array {
    $st = db()->prepare('SELECT id, starts_on, ends_on FROM events WHERE slug = ?');
    $st->execute([(string)($d['event_slug'] ?? '')]);
    $e = $st->fetch();
    if (!$e) fail('Not found.', 404);
    $p = db()->prepare("SELECT 1 FROM event_participants WHERE event_id = ? AND user_id = ? AND status = 'active'");
    $p->execute([(int)$e['id'], (int)$user['id']]);
    if (!$p->fetch()) fail('Not allowed.', 403);
    $rid = (int)($d['roadbook_id'] ?? 0);
    $r = db()->prepare('SELECT 1 FROM event_roadbooks WHERE event_id = ? AND roadbook_id = ?');
    $r->execute([(int)$e['id'], $rid]);
    if (!$r->fetch()) fail('Not allowed.', 403);
    if (!live_event_running($e)) fail('The event is not running.', 403);
    return ['event_id' => (int)$e['id'], 'roadbook_id' => $rid];
}

function live_ping(array $user, array $d): void {
    rate_limit('live:' . (int)$user['id'], 20, 60); // one ping per 15 s, with room for a reconnect
    $g = live_gate($user, $d);
    $lat = (float)($d['lat'] ?? 999); $lon = (float)($d['lon'] ?? 999);
    if (abs($lat) > 90 || abs($lon) > 180) fail('Invalid position.');
    $small = fn($k, $max = 65535) => isset($d[$k]) && is_numeric($d[$k]) ? max(0, min($max, (int)round((float)$d[$k]))) : null;
    $team = preg_replace('/\D/', '', (string)($d['team'] ?? ''));
    db()->prepare('INSERT INTO event_live (event_id, user_id, roadbook_id, team, lat, lon, acc, speed, heading, note_idx, notes_total, reached, skipped, updated_at, stopped_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NULL)
        ON DUPLICATE KEY UPDATE roadbook_id = VALUES(roadbook_id), team = VALUES(team), lat = VALUES(lat), lon = VALUES(lon), acc = VALUES(acc),
            speed = VALUES(speed), heading = VALUES(heading), note_idx = VALUES(note_idx), notes_total = VALUES(notes_total),
            reached = VALUES(reached), skipped = VALUES(skipped), updated_at = NOW(), stopped_at = NULL')
        ->execute([$g['event_id'], (int)$user['id'], $g['roadbook_id'], $team !== '' ? substr($team, 0, 8) : null,
            round($lat, 6), round($lon, 6), $small('acc'), $small('speed', 999), $small('heading', 359),
            $small('note_idx') ?? 0, $small('notes_total') ?? 0, $small('reached') ?? 0, $small('skipped') ?? 0]);
    json_out(['ok' => true]);
}

// The run is over: its last position stays for the organizers, marked as the end
function live_stop(array $user, array $d): void {
    $g = live_gate($user, $d);
    db()->prepare('UPDATE event_live SET stopped_at = NOW() WHERE event_id = ? AND user_id = ?')->execute([$g['event_id'], (int)$user['id']]);
    json_out(['ok' => true]);
}

// The organizers' map: every participant's last position, how long ago (`age_s`, from the server's
// own clock) and whether their run is over. With `tracks`, the event's roadbooks drawn underneath.
function live_list(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    $st = db()->prepare('SELECT l.user_id, u.username, TRIM(CONCAT(COALESCE(u.first_name, \'\'), \' \', COALESCE(u.last_name, \'\'))) AS name,
            l.roadbook_id, r.title AS roadbook, l.team, l.lat, l.lon, l.acc, l.speed, l.heading, l.note_idx, l.notes_total, l.reached, l.skipped,
            TIMESTAMPDIFF(SECOND, l.updated_at, NOW()) AS age_s, l.stopped_at IS NOT NULL AS stopped
        FROM event_live l JOIN users u ON u.id = l.user_id JOIN roadbooks r ON r.id = l.roadbook_id
        WHERE l.event_id = ? ORDER BY l.updated_at DESC');
    $st->execute([(int)$e['id']]);
    $rows = array_map(fn($x) => [
        'user_id' => (int)$x['user_id'], 'username' => $x['username'], 'name' => $x['name'] !== '' ? $x['name'] : null,
        'roadbook_id' => (int)$x['roadbook_id'], 'roadbook' => $x['roadbook'], 'team' => $x['team'],
        'lat' => (float)$x['lat'], 'lon' => (float)$x['lon'], 'acc' => $x['acc'] !== null ? (int)$x['acc'] : null,
        'speed' => $x['speed'] !== null ? (int)$x['speed'] : null, 'heading' => $x['heading'] !== null ? (int)$x['heading'] : null,
        'note_idx' => (int)$x['note_idx'], 'notes_total' => (int)$x['notes_total'], 'reached' => (int)$x['reached'], 'skipped' => (int)$x['skipped'],
        'age_s' => max(0, (int)$x['age_s']), 'stopped' => (bool)$x['stopped'],
    ], $st->fetchAll());
    $out = ['ok' => true, 'event' => ['id' => (int)$e['id'], 'slug' => $e['slug'], 'title' => $e['title']], 'live' => $rows];
    if (!empty($d['tracks'])) {
        $rb = db()->prepare("SELECT r.id, r.user_id, r.filename, r.title FROM event_roadbooks er JOIN roadbooks r ON r.id = er.roadbook_id
            WHERE er.event_id = ? AND r.status <> 'deleted' ORDER BY er.sort, er.roadbook_id");
        $rb->execute([(int)$e['id']]);
        $out['tracks'] = [];
        foreach ($rb->fetchAll() as $r) {
            // an outline is a nicety: a roadbook without its file yet (or any more) is just not drawn
            if ($r['filename'] === 'pending' || !is_file(rb_dir((int)$r['user_id']) . '/' . $r['filename'])) continue;
            $payload = rb_read_payload($r);
            $track = $payload['track'] ?? [];
            $step = max(1, (int)ceil(count($track) / 800)); // a light outline: at most ~800 points a roadbook
            $pts = [];
            foreach ($track as $k => $p) if ($k % $step === 0 || $k === count($track) - 1) $pts[] = [round((float)$p['lon'], 5), round((float)$p['lat'], 5)];
            $out['tracks'][] = ['id' => (int)$r['id'], 'title' => $r['title'], 'line' => $pts];
        }
    }
    json_out($out);
}
