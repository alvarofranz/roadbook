<?php
/* Events (#6): the event entity, its roadbook associations, categories, co-organizers and
 * participants. An event is owned by the user who created it (events.organizer_id); the
 * event_organizers rows grant more users management rights on that one event. Participants
 * join with the organizer-shared join code. The public listing + the /event/<slug>
 * presentation page show public events and their public roadbooks. */

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

/* ---- per-event management rights: admin, the owner, or a listed co-organizer (#123) ---- */
// Does this user own or co-organize at least one event? Drives the header's Events link for
// users without the global organizer role.
function user_manages_events(int $uid): bool {
    $st = db()->prepare('SELECT 1 FROM events WHERE organizer_id = ?
        UNION SELECT 1 FROM event_organizers WHERE user_id = ? LIMIT 1');
    $st->execute([$uid, $uid]);
    return (bool)$st->fetch();
}

// Event co-editing (#123): the organizers of an event can edit the roadbooks attached to it —
// true when the user owns or co-organizes at least one event this roadbook is associated with.
function event_co_edits_roadbook(int $uid, int $roadbookId): bool {
    $st = db()->prepare('SELECT 1 FROM event_roadbooks er JOIN events e ON e.id = er.event_id
        WHERE er.roadbook_id = ? AND (e.organizer_id = ?
            OR EXISTS (SELECT 1 FROM event_organizers eo WHERE eo.event_id = e.id AND eo.user_id = ?))
        LIMIT 1');
    $st->execute([$roadbookId, $uid, $uid]);
    return (bool)$st->fetch();
}
function event_can_manage(array $user, array $eventRow): bool {
    if (is_admin($user) || (int)$eventRow['organizer_id'] === (int)$user['id']) return true;
    $st = db()->prepare('SELECT 1 FROM event_organizers WHERE event_id = ? AND user_id = ?');
    $st->execute([(int)$eventRow['id'], (int)$user['id']]);
    return (bool)$st->fetch();
}
function require_event_manage(array $user, int $id): array {
    $st = db()->prepare('SELECT * FROM events WHERE id = ?'); $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    if (!event_can_manage($user, $row)) fail('Not allowed.', 403);
    return $row;
}

// Management list: an admin sees every event; anyone else sees the events they own or
// co-organize (#123) — a plain user simply gets an empty list.
function events_manage(array $user): void {
    $sql = 'SELECT e.id, e.slug, e.title, e.starts_on, e.ends_on, e.is_public, u.username AS organizer,
            (SELECT COUNT(*) FROM event_roadbooks er WHERE er.event_id = e.id) AS roadbooks,
            (SELECT COUNT(*) FROM event_participants ep WHERE ep.event_id = e.id) AS participants
        FROM events e JOIN users u ON u.id = e.organizer_id';
    if (is_admin($user)) {
        $rows = db()->query($sql . ' ORDER BY e.created_at DESC')->fetchAll();
    } else {
        $st = db()->prepare($sql . ' WHERE e.organizer_id = ? OR EXISTS
            (SELECT 1 FROM event_organizers eo WHERE eo.event_id = e.id AND eo.user_id = ?)
            ORDER BY e.created_at DESC');
        $st->execute([(int)$user['id'], (int)$user['id']]);
        $rows = $st->fetchAll();
    }
    json_out(['ok' => true, 'events' => array_map(fn($r) => [
        'id' => (int)$r['id'], 'slug' => $r['slug'], 'title' => $r['title'],
        'starts_on' => $r['starts_on'], 'ends_on' => $r['ends_on'], 'is_public' => (int)$r['is_public'],
        'organizer' => $r['organizer'], 'roadbooks' => (int)$r['roadbooks'], 'participants' => (int)$r['participants'],
    ], $rows)]);
}

// Everything the event management page needs (#123): parameters, categories, organizers,
// associated roadbooks (with owner + scoring mode) and participants + the join code.
function event_manage_get(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['id'] ?? 0));
    $id = (int)$e['id'];
    $org = db()->prepare('SELECT u.id, u.username, u.email, u.organization FROM event_organizers eo JOIN users u ON u.id = eo.user_id
        WHERE eo.event_id = ? ORDER BY u.username');
    $org->execute([$id]);
    $rb = db()->prepare('SELECT r.id, r.title, r.status, er.scoring_mode, u.id AS owner_id, u.username
        FROM event_roadbooks er JOIN roadbooks r ON r.id = er.roadbook_id JOIN users u ON u.id = r.user_id
        WHERE er.event_id = ? ORDER BY er.sort, er.roadbook_id');
    $rb->execute([$id]);
    $cat = db()->prepare('SELECT id, name FROM event_categories WHERE event_id = ? ORDER BY sort, id');
    $cat->execute([$id]);
    $pp = db()->prepare('SELECT u.id, u.username, ep.created_at FROM event_participants ep JOIN users u ON u.id = ep.user_id
        WHERE ep.event_id = ? ORDER BY ep.created_at');
    $pp->execute([$id]);
    json_out(['ok' => true, 'event' => [
        'id' => $id, 'slug' => $e['slug'], 'title' => $e['title'], 'description' => $e['description'],
        'starts_on' => $e['starts_on'], 'ends_on' => $e['ends_on'], 'is_public' => (int)$e['is_public'],
        'join_code' => $e['join_code'], 'owner_id' => (int)$e['organizer_id'],
        'organizers' => array_map(fn($x) => ['id' => (int)$x['id'], 'username' => $x['username'], 'email' => $x['email'], 'organization' => $x['organization']], $org->fetchAll()),
        'roadbooks' => array_map(fn($x) => ['id' => (int)$x['id'], 'title' => $x['title'], 'status' => $x['status'],
            'scoring_mode' => $x['scoring_mode'], 'owner_id' => (int)$x['owner_id'], 'username' => $x['username']], $rb->fetchAll()),
        'categories' => array_map(fn($x) => ['id' => (int)$x['id'], 'name' => $x['name']], $cat->fetchAll()),
        'participants' => array_map(fn($x) => ['id' => (int)$x['id'], 'username' => $x['username'], 'joined' => $x['created_at']], $pp->fetchAll()),
    ]]);
}

// Create or update an event's own parameters + categories. The roadbook associations and the
// organizer/participant lists have their own add/remove actions. Creating requires the global
// organizer role; editing is per-event (owner / co-organizer / admin).
function event_save(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $title = substr(trim((string)($d['title'] ?? '')) ?: 'Untitled event', 0, 200);
    $desc = substr(trim((string)($d['description'] ?? '')), 0, 5000);
    $starts = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($d['starts_on'] ?? '')) ? $d['starts_on'] : null;
    $ends = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($d['ends_on'] ?? '')) ? $d['ends_on'] : null;
    $isPublic = !empty($d['is_public']) ? 1 : 0;
    // Categories/classes: [{id, name}] kept in the given order.
    $cats = is_array($d['categories'] ?? null) ? $d['categories'] : [];
    if ($id > 0) {
        $e = require_event_manage($user, $id);
        $slug = $e['slug'];
        db()->prepare('UPDATE events SET title = ?, description = ?, starts_on = ?, ends_on = ?, is_public = ? WHERE id = ?')
            ->execute([$title, $desc, $starts, $ends, $isPublic, $id]);
    } else {
        if (!is_admin($user) && !is_organizer($user)) fail('Organizers only.', 403);
        $slug = event_slug($title, 0);
        db()->prepare('INSERT INTO events (organizer_id, slug, title, description, starts_on, ends_on, is_public) VALUES (?,?,?,?,?,?,?)')
            ->execute([$user['id'], $slug, $title, $desc, $starts, $ends, $isPublic]);
        $id = (int)db()->lastInsertId();
        // the owner is also listed among the event's organizers
        db()->prepare('INSERT IGNORE INTO event_organizers (event_id, user_id) VALUES (?,?)')->execute([$id, (int)$user['id']]);
    }
    // UPSERT keeping ids stable: P2.4 entries will reference event_categories.id, so renaming
    // or reordering must never churn the id — only categories dropped from the list are deleted.
    $st = db()->prepare('SELECT id FROM event_categories WHERE event_id = ?');
    $st->execute([$id]);
    $existing = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    $updCat = db()->prepare('UPDATE event_categories SET name = ?, sort = ? WHERE id = ? AND event_id = ?');
    $insCat = db()->prepare('INSERT INTO event_categories (event_id, name, sort) VALUES (?,?,?)');
    $keep = []; $ci = 0;
    foreach ($cats as $c) {
        $cid = (int)($c['id'] ?? 0);
        $name = substr(trim((string)($c['name'] ?? '')), 0, 100);
        if ($name === '') continue;
        if ($cid > 0 && in_array($cid, $existing, true)) { $updCat->execute([$name, $ci, $cid, $id]); $keep[] = $cid; }
        else { $insCat->execute([$id, $name, $ci]); $keep[] = (int)db()->lastInsertId(); }
        $ci++;
    }
    db()->prepare('DELETE FROM event_categories WHERE event_id = ?'
        . ($keep ? ' AND id NOT IN (' . implode(',', $keep) . ')' : ''))->execute([$id]);
    log_activity((int)$user['id'], 'event_save', 'event #' . $id);
    json_out(['ok' => true, 'id' => $id, 'slug' => $slug]);
}

function event_delete(array $user, array $d): void {
    $id = (int)($d['id'] ?? 0);
    $st = db()->prepare('SELECT organizer_id FROM events WHERE id = ?'); $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) fail('Not found.', 404);
    // deleting the whole event stays with the owner (or an admin) — co-organizers can't
    if (!is_admin($user) && (int)$row['organizer_id'] !== (int)$user['id']) fail('Not allowed.', 403);
    db()->prepare('DELETE FROM events WHERE id = ?')->execute([$id]); // associations cascade
    log_activity((int)$user['id'], 'event_delete', 'event #' . $id);
    json_out(['ok' => true]);
}

/* ---- roadbook associations (#123, ownership rule #140) ---- */
// Attach a roadbook: anyone managing the event, but ONLY a roadbook they own (an admin may
// attach any) — the picker lists the signed-in user's roadbooks, and the server enforces it.
function event_rb_add(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    $rid = (int)($d['roadbook_id'] ?? 0);
    $st = db()->prepare('SELECT user_id FROM roadbooks WHERE id = ?'); $st->execute([$rid]);
    $rb = $st->fetch();
    if (!$rb) fail('Not found.', 404);
    if (!is_admin($user) && (int)$rb['user_id'] !== (int)$user['id']) fail('You can only attach your own roadbooks.', 403);
    $sort = (int)db()->query('SELECT COALESCE(MAX(sort), -1) + 1 FROM event_roadbooks WHERE event_id = ' . (int)$e['id'])->fetchColumn();
    db()->prepare('INSERT IGNORE INTO event_roadbooks (event_id, roadbook_id, sort, scoring_mode) VALUES (?,?,?,?)')
        ->execute([(int)$e['id'], $rid, $sort, event_scoring_mode($d['scoring_mode'] ?? 'free')]);
    json_out(['ok' => true]);
}

// Detach a roadbook from the event — the roadbook itself is never touched.
function event_rb_remove(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    db()->prepare('DELETE FROM event_roadbooks WHERE event_id = ? AND roadbook_id = ?')
        ->execute([(int)$e['id'], (int)($d['roadbook_id'] ?? 0)]);
    json_out(['ok' => true]);
}

function event_rb_mode(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    db()->prepare('UPDATE event_roadbooks SET scoring_mode = ? WHERE event_id = ? AND roadbook_id = ?')
        ->execute([event_scoring_mode($d['scoring_mode'] ?? 'free'), (int)$e['id'], (int)($d['roadbook_id'] ?? 0)]);
    json_out(['ok' => true]);
}

/* ---- co-organizers (#123) ---- */
// User search for the add-organizer picker: matches username or full name, optionally narrowed
// by the free-text profile organization (the client defaults that filter to the searcher's own).
function user_search(array $user, array $d): void {
    $q = trim((string)($d['q'] ?? ''));
    $org = trim((string)($d['organization'] ?? ''));
    if ($q === '' && $org === '') json_out(['ok' => true, 'users' => []]);
    $sql = "SELECT username, organization FROM users WHERE blocked = 0";
    $args = [];
    if ($q !== '') { $sql .= " AND (username LIKE ? OR CONCAT(first_name, ' ', last_name) LIKE ?)"; $like = '%' . $q . '%'; array_push($args, $like, $like); }
    if ($org !== '') { $sql .= ' AND organization LIKE ?'; $args[] = '%' . $org . '%'; }
    $st = db()->prepare($sql . ' ORDER BY username LIMIT 10');
    $st->execute($args);
    json_out(['ok' => true, 'users' => array_map(fn($r) => ['username' => $r['username'], 'organization' => $r['organization']], $st->fetchAll())]);
}

// Only the owner (or an admin) edits the organizer list; co-organizers manage content, not access.
function event_org_add(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    if (!is_admin($user) && (int)$e['organizer_id'] !== (int)$user['id']) fail('Not allowed.', 403);
    $username = trim((string)($d['username'] ?? ''));
    $st = db()->prepare('SELECT id FROM users WHERE username = ?'); $st->execute([$username]);
    $u = $st->fetch();
    if (!$u) fail('No user with that username.', 404);
    db()->prepare('INSERT IGNORE INTO event_organizers (event_id, user_id) VALUES (?,?)')->execute([(int)$e['id'], (int)$u['id']]);
    json_out(['ok' => true]);
}

function event_org_remove(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    if (!is_admin($user) && (int)$e['organizer_id'] !== (int)$user['id']) fail('Not allowed.', 403);
    $uid = (int)($d['user_id'] ?? 0);
    if ($uid === (int)$e['organizer_id']) fail('The event owner cannot be removed.');
    db()->prepare('DELETE FROM event_organizers WHERE event_id = ? AND user_id = ?')->execute([(int)$e['id'], $uid]);
    json_out(['ok' => true]);
}

/* ---- participants + join code (#123) ---- */
// Rotate (or clear) the join code the organizer shares with participants.
function event_join_code(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    if (!empty($d['clear'])) {
        db()->prepare('UPDATE events SET join_code = NULL WHERE id = ?')->execute([(int)$e['id']]);
        json_out(['ok' => true, 'join_code' => null]);
    }
    for ($try = 0; $try < 5; $try++) { // regenerate until unique (the column is UNIQUE; collisions are ~impossible)
        $code = strtoupper(bin2hex(random_bytes(4)));
        try {
            db()->prepare('UPDATE events SET join_code = ? WHERE id = ?')->execute([$code, (int)$e['id']]);
            json_out(['ok' => true, 'join_code' => $code]);
        } catch (\Throwable $x) { /* duplicate code — roll again */ }
    }
    fail('Could not generate a join code.', 500); // 5 straight failures = the DB is unhappy, not a collision
}

// A signed-in user joins the event whose page they're on by typing its join code.
function event_join(array $user, array $d): void {
    rate_limit('join_' . $user['id'], 20, 3600); // stop code guessing
    $code = strtoupper(trim((string)($d['code'] ?? '')));
    $slug = (string)($d['slug'] ?? '');
    if ($code === '') fail('Enter the join code.');
    $st = db()->prepare('SELECT id, slug FROM events WHERE join_code = ?'); $st->execute([$code]);
    $e = $st->fetch();
    if (!$e || ($slug !== '' && $e['slug'] !== $slug)) fail('Wrong join code.', 404);
    db()->prepare('INSERT IGNORE INTO event_participants (event_id, user_id) VALUES (?,?)')->execute([(int)$e['id'], (int)$user['id']]);
    log_activity((int)$user['id'], 'event_join', 'event #' . (int)$e['id']);
    json_out(['ok' => true]);
}

function event_leave(array $user, array $d): void {
    $st = db()->prepare('SELECT id FROM events WHERE slug = ?'); $st->execute([(string)($d['slug'] ?? '')]);
    $e = $st->fetch();
    if (!$e) fail('Not found.', 404);
    db()->prepare('DELETE FROM event_participants WHERE event_id = ? AND user_id = ?')->execute([(int)$e['id'], (int)$user['id']]);
    json_out(['ok' => true]);
}

function event_participant_remove(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    db()->prepare('DELETE FROM event_participants WHERE event_id = ? AND user_id = ?')
        ->execute([(int)$e['id'], (int)($d['user_id'] ?? 0)]);
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
    $st = db()->prepare('SELECT e.id, e.slug, e.title, e.description, e.starts_on, e.ends_on, e.is_public, e.join_code, u.username AS organizer
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
    // joining state for the signed-in visitor: drives the Join-with-code / Leave UI (#123)
    $me = current_user();
    $joined = false;
    if ($me) {
        $j = db()->prepare('SELECT 1 FROM event_participants WHERE event_id = ? AND user_id = ?');
        $j->execute([(int)$e['id'], (int)$me['id']]);
        $joined = (bool)$j->fetch();
    }
    json_out(['ok' => true, 'event' => [
        'slug' => $e['slug'], 'title' => $e['title'], 'description' => $e['description'],
        'starts_on' => $e['starts_on'], 'ends_on' => $e['ends_on'], 'organizer' => $e['organizer'],
        'categories' => $cat->fetchAll(PDO::FETCH_COLUMN),
        'can_join' => $e['join_code'] !== null, 'joined' => $joined,
    ], 'roadbooks' => $roadbooks]);
}
