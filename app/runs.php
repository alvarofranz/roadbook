<?php
/* Run reports (#618), their visibility (#619), public profiles (#620) and the shared event ranking
 * (#590). A run is one navigation of a roadbook in the Reader; its report is what the Reader shows
 * at the end and what the runner may publish on /u/<username>. A competition run inside an event
 * also enters that roadbook's classification (event_results), next to the result QRs scanned at the
 * organizer's desk — one list for every device, instead of one per phone. */

const RUN_VISIBILITIES = ['ask', 'public', 'private'];

// the few numbers a run reports, clamped to what they can be
function run_int($v, int $max = 2147483647): int { return max(0, min($max, (int)$v)); }

// Save the report of a finished run. Visibility: the choice made on the report, else the runner's
// standing preference; "remember" makes the choice that preference (#619).
function run_save(array $user, array $d): void {
    $title = mb_substr(trim((string)($d['title'] ?? '')), 0, 200) ?: 'Roadbook';
    $mode = ($d['mode'] ?? '') === 'competition' ? 'competition' : 'trip';
    $pref = $user['runs_visibility'] ?? 'ask';
    $choice = in_array($d['visibility'] ?? null, ['public', 'private'], true) ? $d['visibility'] : null;
    $isPublic = ($choice ?? ($pref === 'public' ? 'public' : 'private')) === 'public' ? 1 : 0;
    if ($choice && !empty($d['remember'])) {
        db()->prepare('UPDATE users SET runs_visibility = ? WHERE id = ?')->execute([$choice, (int)$user['id']]);
    }
    // the roadbook it ran, when it is one of the server's (a local .rdbk file has none)
    $rbId = null;
    if (!empty($d['roadbook_id']) || !empty($d['roadbook_slug'])) {
        $st = !empty($d['roadbook_id'])
            ? db()->prepare("SELECT id FROM roadbooks WHERE id = ? AND status <> 'deleted'")
            : db()->prepare("SELECT id FROM roadbooks WHERE slug = ? AND status <> 'deleted'");
        $st->execute([!empty($d['roadbook_id']) ? (int)$d['roadbook_id'] : (string)$d['roadbook_slug']]);
        $rbId = ($v = $st->fetchColumn()) ? (int)$v : null;
    }
    $event = null;
    if (!empty($d['event_slug'])) {
        $st = db()->prepare('SELECT * FROM events WHERE slug = ?'); $st->execute([(string)$d['event_slug']]);
        $event = $st->fetch() ?: null;
    }
    $ms = fn($v) => ($v = (int)$v) > 0 ? date('Y-m-d H:i:s', intdiv($v, 1000)) : null;
    $skipped = array_slice(array_map('intval', (array)($d['skipped'] ?? [])), 0, 200);
    $pen = (array)($d['penalties'] ?? []);
    $penalties = $mode === 'competition' ? json_encode(array_map('intval', array_intersect_key($pen, array_flip(['acc', 'cap', 'skip', 'extra', 'speed'])))) : null;
    $meta = $mode === 'competition' ? mb_substr(trim((string)($d['result_meta'] ?? '')), 0, 255) : '';
    db()->prepare('INSERT INTO roadbook_runs (user_id, roadbook_id, event_id, roadbook_title, mode, team, completed, started_at, ended_at, duration_s,
            distance_m, notes_total, notes_reached, skipped, speed_zones, speed_exceeded, max_over_kmh, penalties, result_meta, is_public, device)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([
        (int)$user['id'], $rbId, $event ? (int)$event['id'] : null, $title, $mode,
        $mode === 'competition' ? mb_substr(preg_replace('/\D/', '', (string)($d['team'] ?? '')), 0, 8) : null,
        !empty($d['completed']) ? 1 : 0, $ms($d['started_at'] ?? 0), $ms($d['ended_at'] ?? 0), run_int($d['duration_s'] ?? 0),
        run_int($d['distance_m'] ?? 0), run_int($d['notes_total'] ?? 0, 65535), run_int($d['notes_reached'] ?? 0, 65535),
        $skipped ? implode(',', $skipped) : null, run_int($d['speed_zones'] ?? 0, 65535), run_int($d['speed_exceeded'] ?? 0, 65535),
        run_int($d['max_over_kmh'] ?? 0, 65535), $penalties, $meta !== '' ? $meta : null, $isPublic,
        mb_substr(trim((string)($d['device'] ?? '')), 0, 80) ?: null, // admins only (#870)
    ]);
    $runId = (int)db()->lastInsertId();
    // a competition run of an event roadbook enters its classification at once (#590) — unverified
    // (valid NULL): the result is whatever the device sent, so the Ranking page checks its signature
    // like a scanned QR's before it counts as valid
    if ($event && $rbId && $meta !== '' && event_results_access($user, $event, $rbId) !== null) {
        db()->prepare('INSERT IGNORE INTO event_results (event_id, roadbook_id, team, meta, valid, run_id, added_by) VALUES (?,?,?,?,NULL,?,?)')
            ->execute([(int)$event['id'], $rbId, mb_substr(preg_replace('/\D/', '', (string)($d['team'] ?? '')), 0, 8) ?: '0', $meta, $runId, (int)$user['id']]);
    }
    log_activity((int)$user['id'], 'run_save', 'run #' . $runId);
    json_out(['ok' => true, 'id' => $runId, 'is_public' => $isPublic]);
}

// The owner makes one of their runs public/private, or deletes it (#619).
function run_owned(array $user, int $id): void {
    $st = db()->prepare('SELECT 1 FROM roadbook_runs WHERE id = ? AND user_id = ?'); $st->execute([$id, (int)$user['id']]);
    if (!$st->fetch()) fail('Not found.', 404);
}
function run_update(array $user, array $d): void {
    run_owned($user, $id = (int)($d['id'] ?? 0));
    db()->prepare('UPDATE roadbook_runs SET is_public = ? WHERE id = ?')->execute([!empty($d['is_public']) ? 1 : 0, $id]);
    json_out(['ok' => true]);
}
function run_delete(array $user, array $d): void {
    run_owned($user, $id = (int)($d['id'] ?? 0));
    db()->prepare('DELETE FROM roadbook_runs WHERE id = ?')->execute([$id]);
    @unlink(run_card_path($id)); // its shareable image goes with it
    json_out(['ok' => true]);
}
/* A run's shareable image (#785), made on the runner's device at the end of the run. Its file
   name is keyed with the app secret, so the image of a private run cannot be guessed from the
   run id; the profile hands it out only with the run it belongs to. */
function run_card_name(int $id): string { global $CFG; return substr(hash_hmac('sha256', 'run-card:' . $id, (string)$CFG['app_secret']), 0, 24) . '.avif'; }
function run_card_path(int $id): string { global $CFG; return $CFG['run_cards_dir'] . '/' . run_card_name($id); }
function run_card_url(int $id): ?string {
    $path = run_card_path($id);
    return is_file($path) ? '/run-cards/' . run_card_name($id) . '?v=' . filemtime($path) : null;
}
// The standing choice for new reports, from the account settings (#619).
function runs_settings(array $user, array $d): void {
    $v = (string)($d['runs_visibility'] ?? '');
    if (!in_array($v, RUN_VISIBILITIES, true)) fail('Unknown setting.');
    db()->prepare('UPDATE users SET runs_visibility = ? WHERE id = ?')->execute([$v, (int)$user['id']]);
    json_out(['ok' => true]);
}

// /u/<username> (#620): what anyone may see of a user — the public profile fields, their public
// roadbooks and their public runs with the totals — and, for the owner, their private runs too.
// Never the real name or the email.
function profile_get(array $d): void {
    $st = db()->prepare('SELECT id, username, bio, organization, avatar, created_at FROM users WHERE username = ? AND blocked = 0');
    $st->execute([(string)($d['username'] ?? '')]);
    $u = $st->fetch();
    if (!$u) fail('Not found.', 404);
    $me = current_user();
    $isMe = $me && (int)$me['id'] === (int)$u['id'];
    $rb = db()->prepare('SELECT ' . RB_CARD_SQL . "
        FROM roadbooks r WHERE r.user_id = ? AND r.status = 'public' ORDER BY r.updated_at DESC LIMIT 60");
    $rb->execute([(int)$u['id']]);
    $runs = db()->prepare('SELECT ru.*, r.slug AS rb_slug, r.status AS rb_status, e.slug AS ev_slug, e.title AS ev_title
        FROM roadbook_runs ru LEFT JOIN roadbooks r ON r.id = ru.roadbook_id LEFT JOIN events e ON e.id = ru.event_id
        WHERE ru.user_id = ?' . ($isMe ? '' : ' AND ru.is_public = 1') . ' ORDER BY COALESCE(ru.ended_at, ru.created_at) DESC LIMIT 300');
    $runs->execute([(int)$u['id']]);
    $rows = $runs->fetchAll();
    $pub = array_filter($rows, fn($r) => (int)$r['is_public'] === 1); // the totals count what everyone sees
    // the card of every public roadbook these runs ran (#867): what the completed list shows
    $ranIds = array_values(array_unique(array_filter(array_map(fn($r) => $r['rb_status'] === 'public' ? (int)$r['roadbook_id'] : 0, $rows))));
    $ran = [];
    if ($ranIds) {
        $cards = db()->prepare('SELECT ' . RB_CARD_SQL . ", u.username
            FROM roadbooks r JOIN users u ON u.id = r.user_id WHERE r.id IN (" . implode(',', array_fill(0, count($ranIds), '?')) . ')');
        $cards->execute($ranIds);
        foreach ($cards->fetchAll() as $c) $ran['rb' . $c['id']] = rb_card_fields($c);
    }
    json_out(['ok' => true, 'is_me' => $isMe,
        'user' => ['username' => $u['username'], 'bio' => $u['bio'], 'organization' => $u['organization'], 'avatar' => $u['avatar'], 'member_since' => substr((string)$u['created_at'], 0, 10)],
        'stats' => [
            'runs' => count($pub),
            'roadbooks' => count(array_unique(array_map(fn($r) => $r['roadbook_id'] ?: 't:' . $r['roadbook_title'], $pub))),
            'completed' => count(array_filter($pub, fn($r) => (int)$r['completed'] === 1)),
            'distance_m' => array_sum(array_map(fn($r) => (int)$r['distance_m'], $pub)),
            'duration_s' => array_sum(array_map(fn($r) => (int)$r['duration_s'], $pub)),
        ],
        'roadbooks' => array_map('rb_card_fields', $rb->fetchAll()),
        'run_roadbooks' => (object)$ran, // roadbook_key → card
        'runs' => array_map(fn($r) => [
            'id' => (int)$r['id'], 'title' => $r['roadbook_title'], 'roadbook_key' => $r['roadbook_id'] ? 'rb' . $r['roadbook_id'] : 't:' . $r['roadbook_title'],
            'roadbook_slug' => $r['rb_status'] === 'public' ? $r['rb_slug'] : null, // linked only where anyone may open it
            'event' => $r['ev_slug'] ? ['slug' => $r['ev_slug'], 'title' => $r['ev_title']] : null,
            'mode' => $r['mode'], 'completed' => (int)$r['completed'], 'ended_at' => $r['ended_at'] ?: $r['created_at'],
            'duration_s' => (int)$r['duration_s'], 'distance_m' => (int)$r['distance_m'],
            'notes_total' => (int)$r['notes_total'], 'notes_reached' => (int)$r['notes_reached'],
            'skipped' => $r['skipped'] ? array_map('intval', explode(',', $r['skipped'])) : [],
            'speed_zones' => (int)$r['speed_zones'], 'speed_exceeded' => (int)$r['speed_exceeded'], 'max_over_kmh' => (int)$r['max_over_kmh'],
            'penalties' => $r['penalties'] ? json_decode($r['penalties'], true) : null, 'is_public' => (int)$r['is_public'],
            'card' => run_card_url((int)$r['id']), // the shareable image, when the run has one (#785)
        ], $rows),
    ]);
}

// The history of a public roadbook's completions, under its comments (#869): every public
// completed run with its runner, and how many private ones there were besides — a private run
// never names its runner.
function roadbook_completions(array $me, array $d): void {
    $st = db()->prepare("SELECT id FROM roadbooks WHERE slug = ? AND status = 'public'");
    $st->execute([(string)($d['slug'] ?? '')]);
    $rbId = (int)$st->fetchColumn();
    if (!$rbId) fail('This roadbook does not exist or is private.', 404);
    $runs = db()->prepare('SELECT ru.id, ru.notes_reached, ru.notes_total, COALESCE(ru.ended_at, ru.created_at) AS ended_at, u.username, u.avatar
        FROM roadbook_runs ru JOIN users u ON u.id = ru.user_id
        WHERE ru.roadbook_id = ? AND ru.completed = 1 AND ru.is_public = 1 AND u.blocked = 0 ORDER BY ended_at DESC LIMIT 100');
    $runs->execute([$rbId]);
    $private = db()->prepare('SELECT COUNT(*) FROM roadbook_runs WHERE roadbook_id = ? AND completed = 1 AND is_public = 0');
    $private->execute([$rbId]);
    json_out(['ok' => true, 'private' => (int)$private->fetchColumn(), 'runs' => array_map(fn($r) => [
        'id' => (int)$r['id'], 'username' => $r['username'], 'avatar' => $r['avatar'], 'ended_at' => $r['ended_at'],
        'notes_reached' => (int)$r['notes_reached'], 'notes_total' => (int)$r['notes_total'],
    ], $runs->fetchAll())]);
}

// A user's runs for the admin (#870): what everyone sees plus what only admins do — the device.
function admin_user_runs(array $admin, array $d): void {
    $st = db()->prepare('SELECT ru.id, ru.roadbook_title, ru.mode, ru.device, ru.completed, ru.is_public, ru.notes_reached, ru.notes_total, ru.distance_m,
            COALESCE(ru.ended_at, ru.created_at) AS ended_at
        FROM roadbook_runs ru WHERE ru.user_id = ? ORDER BY ended_at DESC LIMIT 300');
    $st->execute([(int)($d['user_id'] ?? 0)]);
    json_out(['ok' => true, 'runs' => array_map(fn($r) => [
        'id' => (int)$r['id'], 'title' => $r['roadbook_title'], 'mode' => $r['mode'], 'device' => $r['device'], 'completed' => (int)$r['completed'],
        'is_public' => (int)$r['is_public'], 'notes_reached' => (int)$r['notes_reached'], 'notes_total' => (int)$r['notes_total'],
        'distance_m' => (int)$r['distance_m'], 'ended_at' => $r['ended_at'],
    ], $st->fetchAll())]);
}

/* ---- the shared event ranking (#590 · #607 · #608) ---- */
// Who may see / edit one event roadbook's classification: its organizers edit ('org'), its active
// participants read ('read'); null = nobody else. The roadbook must be a SCORED one of that event.
function event_results_access(array $user, array $event, int $roadbookId): ?string {
    $st = db()->prepare("SELECT scoring_mode FROM event_roadbooks WHERE event_id = ? AND roadbook_id = ?");
    $st->execute([(int)$event['id'], $roadbookId]);
    $mode = $st->fetchColumn();
    if ($mode === false || $mode === 'free') return null;
    if (event_can_manage($user, $event)) return 'org';
    $st = db()->prepare("SELECT 1 FROM event_participants WHERE event_id = ? AND user_id = ? AND status = 'active'");
    $st->execute([(int)$event['id'], (int)$user['id']]);
    return $st->fetch() ? 'read' : null;
}
// Resolve (event, roadbook, access) from the slugs the Ranking page carries, or fail.
function ranking_scope(array $user, array $d, bool $needOrg): array {
    $st = db()->prepare('SELECT * FROM events WHERE slug = ?'); $st->execute([(string)($d['event'] ?? '')]);
    $event = $st->fetch();
    $st = db()->prepare('SELECT r.id, r.slug, r.title FROM roadbooks r JOIN event_roadbooks er ON er.roadbook_id = r.id WHERE er.event_id = ? AND r.slug = ?');
    $st->execute([$event ? (int)$event['id'] : 0, (string)($d['rb'] ?? '')]);
    $rb = $st->fetch();
    if (!$event || !$rb) fail('Not found.', 404);
    $access = event_results_access($user, $event, (int)$rb['id']);
    if ($access === null || ($needOrg && $access !== 'org')) fail('Not allowed.', 403);
    return [$event, $rb, $access];
}
function ranking_list(array $user, array $d): void {
    [$event, $rb, $access] = ranking_scope($user, $d, false);
    $st = db()->prepare('SELECT id, team, meta, valid, run_id, created_at FROM event_results WHERE event_id = ? AND roadbook_id = ? ORDER BY created_at');
    $st->execute([(int)$event['id'], (int)$rb['id']]);
    json_out(['ok' => true, 'is_org' => $access === 'org', 'event' => ['slug' => $event['slug'], 'title' => $event['title']], 'roadbook' => ['slug' => $rb['slug'], 'title' => $rb['title']],
        'results' => array_map(fn($r) => ['id' => (int)$r['id'], 'team' => $r['team'], 'meta' => $r['meta'], 'valid' => $r['valid'] === null ? null : (int)$r['valid'],
            'from_run' => $r['run_id'] !== null, 'at' => $r['created_at']], $st->fetchAll())]);
}
// An organizer adds a scanned/pasted result. The same signed payload is recognised and ignored
// (#607); another result for a vehicle already listed replaces it only when asked (replace=1).
function ranking_add(array $user, array $d): void {
    [$event, $rb] = ranking_scope($user, $d, true);
    $meta = mb_substr(trim((string)($d['meta'] ?? '')), 0, 255);
    $team = mb_substr(preg_replace('/\D/', '', (string)($d['team'] ?? '')), 0, 8);
    if ($meta === '' || $team === '') fail('Code not recognized.');
    $st = db()->prepare('SELECT id FROM event_results WHERE event_id = ? AND roadbook_id = ? AND meta = ?');
    $st->execute([(int)$event['id'], (int)$rb['id'], $meta]);
    if ($st->fetch()) json_out(['ok' => true, 'duplicate' => true]);
    $st = db()->prepare('SELECT COUNT(*) FROM event_results WHERE event_id = ? AND roadbook_id = ? AND team = ?');
    $st->execute([(int)$event['id'], (int)$rb['id'], $team]);
    if ((int)$st->fetchColumn() && empty($d['replace'])) json_out(['ok' => true, 'conflict' => true]);
    if (!empty($d['replace'])) db()->prepare('DELETE FROM event_results WHERE event_id = ? AND roadbook_id = ? AND team = ?')->execute([(int)$event['id'], (int)$rb['id'], $team]);
    db()->prepare('INSERT INTO event_results (event_id, roadbook_id, team, meta, valid, added_by) VALUES (?,?,?,?,?,?)')
        ->execute([(int)$event['id'], (int)$rb['id'], $team, $meta, isset($d['valid']) ? (!empty($d['valid']) ? 1 : 0) : null, (int)$user['id']]);
    json_out(['ok' => true]);
}
function ranking_remove(array $user, array $d): void {
    [$event, $rb] = ranking_scope($user, $d, true);
    db()->prepare('DELETE FROM event_results WHERE id = ? AND event_id = ? AND roadbook_id = ?')->execute([(int)($d['id'] ?? 0), (int)$event['id'], (int)$rb['id']]);
    json_out(['ok' => true]);
}
function ranking_clear(array $user, array $d): void {
    [$event, $rb] = ranking_scope($user, $d, true);
    db()->prepare('DELETE FROM event_results WHERE event_id = ? AND roadbook_id = ?')->execute([(int)$event['id'], (int)$rb['id']]);
    log_activity((int)$user['id'], 'ranking_clear', 'event #' . (int)$event['id'] . ' rb #' . (int)$rb['id']);
    json_out(['ok' => true]);
}
