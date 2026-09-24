<?php
/* Live tracking for event organizers (#947 · #970). A participant of an event shares their last
 * position with its organizers whenever they navigate one of its roadbooks — opened from the event
 * or not, on the event's dates or any other day (a recurring ride) — once they said yes, which is
 * asked once per event (event_participants.live_consent). The Reader pings its last position; the
 * organizers see every participant on a map. One row per participant per event (event_live),
 * overwritten by each ping: the last position, never a history. Nothing is taken outside such a
 * run, and the rows go with the event (cron/purge-event-live.php). */

// The events of a roadbook the user takes part in (an ACTIVE participant), with their answer to
// sharing: consent null = not asked yet, 1 = yes, 0 = no
function live_events(int $userId, int $roadbookId): array {
    $st = db()->prepare("SELECT e.id, e.slug, e.title, ep.live_consent AS consent
        FROM event_roadbooks er JOIN events e ON e.id = er.event_id
        JOIN event_participants ep ON ep.event_id = e.id AND ep.user_id = ? AND ep.status = 'active'
        WHERE er.roadbook_id = ? ORDER BY e.id");
    $st->execute([$userId, $roadbookId]);
    return array_map(fn($r) => ['id' => (int)$r['id'], 'slug' => $r['slug'], 'title' => $r['title'], 'consent' => $r['consent'] === null ? null : (int)$r['consent']], $st->fetchAll());
}

// What the Reader asks when a run starts: which events would see this run, and who has answered
function live_status(array $user, array $d): void {
    json_out(['ok' => true, 'events' => live_events((int)$user['id'], (int)($d['roadbook_id'] ?? 0))]);
}

// The participant's answer for one event — asked once, kept until they change it
function live_consent(array $user, array $d): void {
    $st = db()->prepare("UPDATE event_participants SET live_consent = ? WHERE event_id = ? AND user_id = ? AND status = 'active'");
    $st->execute([!empty($d['consent']) ? 1 : 0, (int)($d['event_id'] ?? 0), (int)$user['id']]);
    if (!$st->rowCount() && !live_is_participant((int)$user['id'], (int)($d['event_id'] ?? 0))) fail('Not allowed.', 403);
    json_out(['ok' => true]);
}
function live_is_participant(int $userId, int $eventId): bool {
    $st = db()->prepare("SELECT 1 FROM event_participants WHERE event_id = ? AND user_id = ? AND status = 'active'");
    $st->execute([$eventId, $userId]);
    return (bool)$st->fetch();
}

// The events a ping goes to: those of this roadbook where the user is an active participant who said yes
function live_targets(array $user, array $d): array {
    $rid = (int)($d['roadbook_id'] ?? 0);
    $ids = array_map(fn($e) => $e['id'], array_filter(live_events((int)$user['id'], $rid), fn($e) => $e['consent'] === 1));
    if (!$ids) fail('Not allowed.', 403); // refused and nothing stored
    return [$rid, array_values($ids)];
}

function live_ping(array $user, array $d): void {
    rate_limit('live:' . (int)$user['id'], 20, 60); // one ping per 15 s, with room for a reconnect
    [$rid, $events] = live_targets($user, $d);
    $lat = (float)($d['lat'] ?? 999); $lon = (float)($d['lon'] ?? 999);
    if (abs($lat) > 90 || abs($lon) > 180) fail('Invalid position.');
    $small = fn($k, $max = 65535) => isset($d[$k]) && is_numeric($d[$k]) ? max(0, min($max, (int)round((float)$d[$k]))) : null;
    $team = preg_replace('/\D/', '', (string)($d['team'] ?? ''));
    $ins = db()->prepare('INSERT INTO event_live (event_id, user_id, roadbook_id, team, lat, lon, acc, speed, heading, note_idx, notes_total, reached, skipped, updated_at, stopped_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NULL)
        ON DUPLICATE KEY UPDATE roadbook_id = VALUES(roadbook_id), team = VALUES(team), lat = VALUES(lat), lon = VALUES(lon), acc = VALUES(acc),
            speed = VALUES(speed), heading = VALUES(heading), note_idx = VALUES(note_idx), notes_total = VALUES(notes_total),
            reached = VALUES(reached), skipped = VALUES(skipped), updated_at = NOW(), stopped_at = NULL');
    foreach ($events as $eid) $ins->execute([$eid, (int)$user['id'], $rid, $team !== '' ? substr($team, 0, 8) : null,
        round($lat, 6), round($lon, 6), $small('acc'), $small('speed', 999), $small('heading', 359),
        $small('note_idx') ?? 0, $small('notes_total') ?? 0, $small('reached') ?? 0, $small('skipped') ?? 0]);
    json_out(['ok' => true]);
}

// The run is over: its last position stays for the organizers, marked as the end
function live_stop(array $user, array $d): void {
    [$rid, $events] = live_targets($user, $d);
    $in = implode(',', array_fill(0, count($events), '?'));
    db()->prepare("UPDATE event_live SET stopped_at = NOW() WHERE user_id = ? AND event_id IN ($in)")->execute(array_merge([(int)$user['id']], $events));
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
