<?php
/* Events (#6, P1): the event entity + its roadbook associations. Events are managed by admins
 * for now (the organizer is the admin who creates it); later phases add organizer roles,
 * categories, participants/join codes, co-editing and scoring. The public listing + the
 * /event/<slug> presentation page show public events and their public roadbooks. */

// Participation rules per associated roadbook (#6): 'free' = follow it with no scoring;
// 'roadbook_suite' = the rules the current ranking engine implements. 'fia' is reserved — the
// editor shows it but disabled (not implemented), so the API refuses it and falls back to 'free'.
const EVENT_SCORING_MODES = ['free', 'roadbook_suite'];
function event_scoring_mode($m): string { return in_array($m, EVENT_SCORING_MODES, true) ? $m : 'free'; }

function event_slug(string $title, int $excludeId): string {
    $base = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($title)), '-');
    $base = substr($base ?: 'event', 0, 60);
    $slug = $base; $n = 1;
    while (true) {
        $st = db()->prepare('SELECT id FROM events WHERE slug = ? AND id <> ?');
        $st->execute([$slug, $excludeId]);
        if (!$st->fetch()) return $slug;
        $slug = $base . '-' . (++$n);
    }
}

// Management list with each event's associated roadbook ids: an admin sees every event,
// an organizer sees only their own (#121).
function events_manage(array $user): void {
    $sql = 'SELECT e.id, e.slug, e.title, e.description, e.starts_on, e.ends_on, e.is_public, u.username AS organizer
        FROM events e JOIN users u ON u.id = e.organizer_id';
    if (is_admin($user)) {
        $rows = db()->query($sql . ' ORDER BY e.created_at DESC')->fetchAll();
    } else {
        $st = db()->prepare($sql . ' WHERE e.organizer_id = ? ORDER BY e.created_at DESC');
        $st->execute([(int)$user['id']]);
        $rows = $st->fetchAll();
    }
    $rb = db()->prepare('SELECT roadbook_id, scoring_mode FROM event_roadbooks WHERE event_id = ? ORDER BY sort, roadbook_id');
    $cat = db()->prepare('SELECT id, name FROM event_categories WHERE event_id = ? ORDER BY sort, id');
    $events = array_map(function ($r) use ($rb, $cat) {
        $rb->execute([$r['id']]);
        $cat->execute([$r['id']]);
        return [
            'id' => (int)$r['id'], 'slug' => $r['slug'], 'title' => $r['title'], 'description' => $r['description'],
            'starts_on' => $r['starts_on'], 'ends_on' => $r['ends_on'], 'is_public' => (int)$r['is_public'],
            'organizer' => $r['organizer'],
            'roadbooks' => array_map(fn($x) => ['id' => (int)$x['roadbook_id'], 'scoring_mode' => $x['scoring_mode']], $rb->fetchAll()),
            'categories' => array_map(fn($x) => ['id' => (int)$x['id'], 'name' => $x['name']], $cat->fetchAll()),
        ];
    }, $rows);
    json_out(['ok' => true, 'events' => $events]);
}

// Create or update an event + replace its roadbook associations. An organizer may only touch
// their own events; admins any (#121).
function event_save(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $title = substr(trim((string)($d['title'] ?? '')) ?: 'Untitled event', 0, 200);
    $desc = substr(trim((string)($d['description'] ?? '')), 0, 5000);
    $starts = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($d['starts_on'] ?? '')) ? $d['starts_on'] : null;
    $ends = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($d['ends_on'] ?? '')) ? $d['ends_on'] : null;
    $isPublic = !empty($d['is_public']) ? 1 : 0;
    // Associated roadbooks: a list of { id, scoring_mode } (each RB carries its own rules).
    $rbs = is_array($d['roadbooks'] ?? null) ? $d['roadbooks'] : [];
    // Categories/classes: a list of names, kept in the given order.
    $cats = is_array($d['categories'] ?? null) ? $d['categories'] : [];
    if ($id > 0) {
        $st = db()->prepare('SELECT slug, organizer_id FROM events WHERE id = ?'); $st->execute([$id]);
        $row = $st->fetch();
        if (!$row) fail('Not found.', 404);
        if (!is_admin($user) && (int)$row['organizer_id'] !== (int)$user['id']) fail('Not allowed.', 403);
        $slug = $row['slug'];
        db()->prepare('UPDATE events SET title = ?, description = ?, starts_on = ?, ends_on = ?, is_public = ? WHERE id = ?')
            ->execute([$title, $desc, $starts, $ends, $isPublic, $id]);
    } else {
        $slug = event_slug($title, 0);
        db()->prepare('INSERT INTO events (organizer_id, slug, title, description, starts_on, ends_on, is_public) VALUES (?,?,?,?,?,?,?)')
            ->execute([$user['id'], $slug, $title, $desc, $starts, $ends, $isPublic]);
        $id = (int)db()->lastInsertId();
    }
    db()->prepare('DELETE FROM event_roadbooks WHERE event_id = ?')->execute([$id]);
    $insRb = db()->prepare('INSERT INTO event_roadbooks (event_id, roadbook_id, sort, scoring_mode) VALUES (?,?,?,?)');
    $seen = []; $i = 0;
    foreach ($rbs as $rb) {
        $rid = (int)($rb['id'] ?? 0);
        if ($rid <= 0 || isset($seen[$rid])) continue;
        $seen[$rid] = true;
        try { $insRb->execute([$id, $rid, $i++, event_scoring_mode($rb['scoring_mode'] ?? 'free')]); } catch (\Throwable $e) { /* skip an id that isn't a real roadbook */ }
    }
    db()->prepare('DELETE FROM event_categories WHERE event_id = ?')->execute([$id]);
    $insCat = db()->prepare('INSERT INTO event_categories (event_id, name, sort) VALUES (?,?,?)');
    $ci = 0;
    foreach ($cats as $name) {
        $name = substr(trim((string)$name), 0, 100);
        if ($name === '') continue;
        $insCat->execute([$id, $name, $ci++]);
    }
    log_activity((int)$user['id'], 'event_save', 'event #' . $id);
    json_out(['ok' => true, 'id' => $id, 'slug' => $slug]);
}

function event_delete(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $st = db()->prepare('SELECT organizer_id FROM events WHERE id = ?'); $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    if (!is_admin($user) && (int)$row['organizer_id'] !== (int)$user['id']) fail('Not allowed.', 403);
    db()->prepare('DELETE FROM events WHERE id = ?')->execute([$id]); // event_roadbooks rows cascade
    log_activity((int)$user['id'], 'event_delete', 'event #' . $id);
    json_out(['ok' => true]);
}

/* ---- public (no auth) ---- */
function events_public_list(): void {
    $rows = db()->query("SELECT e.slug, e.title, e.starts_on, e.ends_on, u.username AS organizer,
            (SELECT COUNT(*) FROM event_roadbooks er JOIN roadbooks r ON r.id = er.roadbook_id WHERE er.event_id = e.id AND r.status = 'public') AS roadbooks
        FROM events e JOIN users u ON u.id = e.organizer_id
        WHERE e.is_public = 1 ORDER BY COALESCE(e.starts_on, DATE(e.created_at)) DESC LIMIT 100")->fetchAll();
    json_out(['ok' => true, 'events' => array_map(fn($r) => [
        'slug' => $r['slug'], 'title' => $r['title'], 'starts_on' => $r['starts_on'], 'ends_on' => $r['ends_on'],
        'organizer' => $r['organizer'], 'roadbooks' => (int)$r['roadbooks'],
    ], $rows)]);
}

function event_public_get(array $d): void {
    $slug = (string)($d['slug'] ?? '');
    $st = db()->prepare('SELECT e.id, e.slug, e.title, e.description, e.starts_on, e.ends_on, e.is_public, u.username AS organizer
        FROM events e JOIN users u ON u.id = e.organizer_id WHERE e.slug = ?');
    $st->execute([$slug]);
    $e = $st->fetch();
    if (!$e || !(int)$e['is_public']) fail('Not found.', 404);
    $rb = db()->prepare("SELECT r.id, r.slug, r.title, r.total_distance, r.note_count, u.username, er.scoring_mode,
            (SELECT filename FROM roadbook_photos p WHERE p.roadbook_id = r.id ORDER BY p.sort, p.id LIMIT 1) AS thumb
        FROM event_roadbooks er JOIN roadbooks r ON r.id = er.roadbook_id JOIN users u ON u.id = r.user_id
        WHERE er.event_id = ? AND r.status = 'public' ORDER BY er.sort, er.roadbook_id");
    $rb->execute([$e['id']]);
    $roadbooks = array_map(fn($r) => [
        'slug' => $r['slug'], 'title' => $r['title'], 'total_distance' => (int)$r['total_distance'],
        'note_count' => (int)$r['note_count'], 'username' => $r['username'], 'scoring_mode' => $r['scoring_mode'],
        'thumb' => $r['thumb'] ? '/photos/' . (int)$r['id'] . '/' . $r['thumb'] : null,
    ], $rb->fetchAll());
    $cat = db()->prepare('SELECT name FROM event_categories WHERE event_id = ? ORDER BY sort, id');
    $cat->execute([$e['id']]);
    json_out(['ok' => true, 'event' => [
        'slug' => $e['slug'], 'title' => $e['title'], 'description' => $e['description'],
        'starts_on' => $e['starts_on'], 'ends_on' => $e['ends_on'], 'organizer' => $e['organizer'],
        'categories' => $cat->fetchAll(PDO::FETCH_COLUMN),
    ], 'roadbooks' => $roadbooks]);
}
