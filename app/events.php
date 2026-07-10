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

/* ---- per-event management rights: admin, the owner, or a listed co-organizer (#123) ---- */
// Does this user own or co-organize at least one event? Drives the header's Events link for
// users without the global organizer role.
function user_manages_events(int $uid): bool {
    $st = db()->prepare('SELECT 1 FROM events WHERE organizer_id = ?
        UNION SELECT 1 FROM event_organizers WHERE user_id = ? LIMIT 1');
    $st->execute([$uid, $uid]);
    return (bool)$st->fetch();
}

// Event-granted rights on a roadbook attached to an event: the organizers (owner or listed
// co-organizer) can EDIT it (#123); with $includeParticipants a participant may also READ a
// non-public one (#25). One query, the participant clause added only for the read check.
function event_rights_on_roadbook(int $uid, int $roadbookId, bool $includeParticipants): bool {
    $st = db()->prepare('SELECT 1 FROM event_roadbooks er JOIN events e ON e.id = er.event_id
        WHERE er.roadbook_id = ? AND (e.organizer_id = ?
            OR EXISTS (SELECT 1 FROM event_organizers eo WHERE eo.event_id = e.id AND eo.user_id = ?)'
            . ($includeParticipants ? ' OR EXISTS (SELECT 1 FROM event_participants ep WHERE ep.event_id = e.id AND ep.user_id = ?)' : '') . ')
        LIMIT 1');
    $st->execute($includeParticipants ? [$roadbookId, $uid, $uid, $uid] : [$roadbookId, $uid, $uid]);
    return (bool)$st->fetch();
}
function event_grants_read(int $uid, int $roadbookId): bool { return event_rights_on_roadbook($uid, $roadbookId, true); }
function event_co_edits_roadbook(int $uid, int $roadbookId): bool { return event_rights_on_roadbook($uid, $roadbookId, false); }
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
// Owner-only event actions (the organizer list, deleting the event): co-organizers manage
// content, never access — those stay with the owner (or an admin).
function require_event_owner(array $user, int $id): array {
    $e = require_event_manage($user, $id);
    if (!is_admin($user) && (int)$e['organizer_id'] !== (int)$user['id']) fail('Not allowed.', 403);
    return $e;
}

// Management list: an admin sees every event; anyone else sees the events they own or
// co-organize (#123) — a plain user simply gets an empty list.
function events_manage(array $user): void {
    // grouped LEFT JOINs give the per-event roadbook/participant counts in one pass instead
    // of two correlated subqueries per listed event
    $sql = 'SELECT e.id, e.slug, e.title, e.starts_on, e.ends_on, e.is_public, e.logo, u.username AS organizer,
            COUNT(DISTINCT er.roadbook_id) AS roadbooks, COUNT(DISTINCT ep.user_id) AS participants
        FROM events e JOIN users u ON u.id = e.organizer_id
        LEFT JOIN event_roadbooks er ON er.event_id = e.id
        LEFT JOIN event_participants ep ON ep.event_id = e.id';
    $tail = ' GROUP BY e.id ORDER BY e.created_at DESC';
    if (is_admin($user)) {
        $rows = db()->query($sql . $tail)->fetchAll();
    } else {
        $st = db()->prepare($sql . ' WHERE e.organizer_id = ? OR EXISTS
            (SELECT 1 FROM event_organizers eo WHERE eo.event_id = e.id AND eo.user_id = ?)' . $tail);
        $st->execute([(int)$user['id'], (int)$user['id']]);
        $rows = $st->fetchAll();
    }
    json_out(['ok' => true, 'events' => array_map(fn($r) => [
        'id' => (int)$r['id'], 'slug' => $r['slug'], 'title' => $r['title'],
        'starts_on' => $r['starts_on'], 'ends_on' => $r['ends_on'], 'is_public' => (int)$r['is_public'],
        'logo' => $r['logo'], 'organizer' => $r['organizer'],
        'roadbooks' => (int)$r['roadbooks'], 'participants' => (int)$r['participants'],
        'ended' => $r['ends_on'] !== null && $r['ends_on'] < date('Y-m-d'),
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
    $rb = db()->prepare('SELECT r.id, r.title, r.category, r.status, er.scoring_mode, u.id AS owner_id, u.username
        FROM event_roadbooks er JOIN roadbooks r ON r.id = er.roadbook_id JOIN users u ON u.id = r.user_id
        WHERE er.event_id = ? AND r.status <> \'deleted\' ORDER BY er.sort, er.roadbook_id');
    $rb->execute([$id]);
    // The participants themselves come from the paged event_participants_list (#144) — the
    // page only needs the total here, for the section header.
    $pp = db()->prepare('SELECT COUNT(*) FROM event_participants WHERE event_id = ?');
    $pp->execute([$id]);
    json_out(['ok' => true, 'event' => [
        'id' => $id, 'slug' => $e['slug'], 'title' => $e['title'], 'description' => $e['description'],
        'organizer_website' => $e['organizer_website'], 'hq_lat' => $e['hq_lat'], 'hq_lon' => $e['hq_lon'],
        'starts_on' => $e['starts_on'], 'ends_on' => $e['ends_on'], 'is_public' => (int)$e['is_public'],
        'join_code' => $e['join_code'], 'owner_id' => (int)$e['organizer_id'], 'logo' => $e['logo'],
        'organizers' => array_map(fn($x) => ['id' => (int)$x['id'], 'username' => $x['username'], 'email' => $x['email'], 'organization' => $x['organization']], $org->fetchAll()),
        'roadbooks' => array_map(fn($x) => ['id' => (int)$x['id'], 'title' => $x['title'], 'category' => $x['category'], 'status' => $x['status'],
            'scoring_mode' => $x['scoring_mode'], 'owner_id' => (int)$x['owner_id'], 'username' => $x['username']], $rb->fetchAll()),
        'participant_count' => (int)$pp->fetchColumn(),
    ]]);
}

// Paged, searchable participant list (#144) — an event's roster can run into the hundreds, so
// the page never gets it whole. q matches the username or the full name (like user_search);
// the response row shape is the contract P2.4 (#124) will widen with the entry fields.
function event_participants_list(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    $q = trim((string)($d['q'] ?? ''));
    $page = max(1, (int)($d['page'] ?? 1));
    $perPage = min(100, max(1, (int)($d['per_page'] ?? 25)));
    $where = 'ep.event_id = ?';
    $args = [(int)$e['id']];
    if ($q !== '') {
        $where .= " AND (u.username LIKE ? OR CONCAT(u.first_name, ' ', u.last_name) LIKE ?)";
        $like = '%' . $q . '%';
        array_push($args, $like, $like);
    }
    $st = db()->prepare("SELECT COUNT(*) FROM event_participants ep JOIN users u ON u.id = ep.user_id WHERE $where");
    $st->execute($args);
    $total = (int)$st->fetchColumn();
    // LIMIT/OFFSET are sanitized ints inlined directly: PDO string-binds bound placeholders there
    $st = db()->prepare("SELECT u.id, u.username, u.first_name, u.last_name, u.email, ep.created_at
        FROM event_participants ep JOIN users u ON u.id = ep.user_id
        WHERE $where ORDER BY ep.created_at, u.id LIMIT $perPage OFFSET " . ($page - 1) * $perPage);
    $st->execute($args);
    json_out(['ok' => true, 'total' => $total, 'page' => $page, 'per_page' => $perPage,
        'participants' => array_map(fn($x) => ['id' => (int)$x['id'], 'username' => $x['username'],
            'first_name' => $x['first_name'], 'last_name' => $x['last_name'], 'email' => $x['email'],
            'joined' => $x['created_at']], $st->fetchAll())]);
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
    $website = substr(trim((string)($d['organizer_website'] ?? '')), 0, 500);
    $hqLat = isset($d['hq_lat']) && is_numeric($d['hq_lat']) ? (float)$d['hq_lat'] : null;
    $hqLon = isset($d['hq_lon']) && is_numeric($d['hq_lon']) ? (float)$d['hq_lon'] : null;
    $isPublic = !empty($d['is_public']) ? 1 : 0;
    // rights + slug first, then save — no transaction needed for a single UPDATE/INSERT.
    // The slug follows the current title (#194); excludeId keeps it unchanged when the slugified
    // title is the same, and only regenerates it after a real rename.
    if ($id > 0) { require_event_manage($user, $id); $slug = unique_slug('events', $title, 'event', $id); }
    else { if (!is_admin($user) && !is_organizer($user)) fail('Organizers only.', 403); $slug = unique_slug('events', $title, 'event', 0); }
    if ($id > 0) {
        db()->prepare('UPDATE events SET title = ?, description = ?, organizer_website = ?, hq_lat = ?, hq_lon = ?, starts_on = ?, ends_on = ?, is_public = ?, slug = ? WHERE id = ?')
            ->execute([$title, $desc, $website, $hqLat, $hqLon, $starts, $ends, $isPublic, $slug, $id]);
    } else {
        db()->prepare('INSERT INTO events (organizer_id, slug, title, description, organizer_website, hq_lat, hq_lon, starts_on, ends_on, is_public) VALUES (?,?,?,?,?,?,?,?,?,?)')
            ->execute([$user['id'], $slug, $title, $desc, $website, $hqLat, $hqLon, $starts, $ends, $isPublic]);
        $id = (int)db()->lastInsertId();
        // the owner is also listed among the event's organizers
        db()->prepare('INSERT IGNORE INTO event_organizers (event_id, user_id) VALUES (?,?)')->execute([$id, (int)$user['id']]);
    }
    log_activity((int)$user['id'], 'event_save', 'event #' . $id);
    json_out(['ok' => true, 'id' => $id, 'slug' => $slug]);
}

function event_delete(array $user, array $d): void {
    global $CFG;
    $id = (int)($d['id'] ?? 0);
    require_event_owner($user, $id); // deleting the whole event stays with the owner (or an admin)
    db()->prepare('DELETE FROM events WHERE id = ?')->execute([$id]); // associations cascade
    @unlink($CFG['event_logos_dir'] . '/' . $id . '.avif'); // the logo file goes with the event
    log_activity((int)$user['id'], 'event_delete', 'event #' . $id);
    json_out(['ok' => true]);
}

// Remove the event's logo (#151): the file and the column — the upload endpoint recreates both.
function event_logo_remove(array $user, array $d): void {
    global $CFG;
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    @unlink($CFG['event_logos_dir'] . '/' . (int)$e['id'] . '.avif');
    db()->prepare('UPDATE events SET logo = NULL WHERE id = ?')->execute([(int)$e['id']]);
    json_out(['ok' => true]);
}

/* ---- roadbook associations (#123, ownership rule #140) ---- */
// Attach a roadbook: anyone managing the event, but ONLY a roadbook they own (an admin may
// attach any) — the picker lists the signed-in user's roadbooks, and the server enforces it.
function event_rb_add(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    $rid = (int)($d['roadbook_id'] ?? 0);
    $st = db()->prepare('SELECT user_id, status FROM roadbooks WHERE id = ?'); $st->execute([$rid]);
    $rb = $st->fetch();
    if (!$rb || $rb['status'] === 'deleted') fail('Not found.', 404); // can't attach a trashed roadbook (#187)
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
    $e = require_event_owner($user, (int)($d['event_id'] ?? 0));
    $username = trim((string)($d['username'] ?? ''));
    $st = db()->prepare('SELECT id FROM users WHERE username = ?'); $st->execute([$username]);
    $u = $st->fetch();
    if (!$u) fail('No user with that username.', 404);
    db()->prepare('INSERT IGNORE INTO event_organizers (event_id, user_id) VALUES (?,?)')->execute([(int)$e['id'], (int)$u['id']]);
    json_out(['ok' => true]);
}

function event_org_remove(array $user, array $d): void {
    $e = require_event_owner($user, (int)($d['event_id'] ?? 0));
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
    // grouped LEFT JOINs count each event's PUBLIC roadbooks in one pass instead of a
    // correlated subquery per listed event
    $rows = db()->query("SELECT e.slug, e.title, e.starts_on, e.ends_on, e.logo, u.username AS organizer,
            COUNT(DISTINCT CASE WHEN r.status = 'public' THEN r.id END) AS roadbooks
        FROM events e JOIN users u ON u.id = e.organizer_id
        LEFT JOIN event_roadbooks er ON er.event_id = e.id
        LEFT JOIN roadbooks r ON r.id = er.roadbook_id
        WHERE e.is_public = 1
        GROUP BY e.id ORDER BY COALESCE(e.starts_on, DATE(e.created_at)) DESC LIMIT 100")->fetchAll();
    json_out(['ok' => true, 'events' => array_map(fn($r) => [
        'slug' => $r['slug'], 'title' => $r['title'], 'starts_on' => $r['starts_on'], 'ends_on' => $r['ends_on'],
        'logo' => $r['logo'], 'organizer' => $r['organizer'], 'roadbooks' => (int)$r['roadbooks'],
    ], $rows)]);
}

function event_public_get(array $d): void {
    $slug = (string)($d['slug'] ?? '');
    $st = db()->prepare('SELECT e.id, e.slug, e.title, e.description, e.organizer_website, e.hq_lat, e.hq_lon, e.starts_on, e.ends_on, e.is_public, e.join_code, e.logo, u.username AS organizer
        FROM events e JOIN users u ON u.id = e.organizer_id WHERE e.slug = ?');
    $st->execute([$slug]);
    $e = $st->fetch();
    if (!$e || !(int)$e['is_public']) fail('Not found.', 404);
    // joining state for the signed-in visitor: drives the Join-with-code / Leave UI (#123)
    $me = current_user();
    $joined = false;
    if ($me) {
        $j = db()->prepare('SELECT 1 FROM event_participants WHERE event_id = ? AND user_id = ?');
        $j->execute([(int)$e['id'], (int)$me['id']]);
        $joined = (bool)$j->fetch();
    }
    // Anyone sees the PUBLIC roadbooks; a member of the event (participant or organizer) also
    // sees the READY ones — finished routes delivered to entrants only (#25). Drafts never show.
    // Event organizers (#247) can always read every roadbook attached to the event.
    $member = $joined || ($me && event_can_manage($me, $e));
    $orgRead = $me && event_can_manage($me, $e); // organizers always readable
    $statuses = "'public'";
    if ($member) $statuses .= ", 'ready'";
    if ($orgRead) $statuses .= ", 'draft'";
    $rb = db()->prepare("SELECT r.id, r.slug, r.title, r.category, r.total_distance, r.note_count, r.status, u.username, er.scoring_mode,
            (SELECT filename FROM roadbook_photos p WHERE p.roadbook_id = r.id ORDER BY p.sort, p.id LIMIT 1) AS thumb
        FROM event_roadbooks er JOIN roadbooks r ON r.id = er.roadbook_id JOIN users u ON u.id = r.user_id
        WHERE er.event_id = ? AND r.status IN ($statuses) ORDER BY er.sort, er.roadbook_id");
    $rb->execute([$e['id']]);
    $roadbooks = array_map(fn($r) => [
        'slug' => $r['slug'], 'title' => $r['title'], 'category' => $r['category'], 'total_distance' => (int)$r['total_distance'],
        'note_count' => (int)$r['note_count'], 'status' => $r['status'], 'username' => $r['username'], 'scoring_mode' => $r['scoring_mode'],
        'thumb' => $r['thumb'] ? '/photos/' . (int)$r['id'] . '/' . $r['thumb'] : null,
    ], $rb->fetchAll());
    json_out(['ok' => true, 'event' => [
        'slug' => $e['slug'], 'title' => $e['title'], 'description' => $e['description'],
        'organizer_website' => $e['organizer_website'], 'hq_lat' => $e['hq_lat'], 'hq_lon' => $e['hq_lon'],
        'starts_on' => $e['starts_on'], 'ends_on' => $e['ends_on'], 'logo' => $e['logo'], 'organizer' => $e['organizer'],
        'ended' => $e['ends_on'] !== null && $e['ends_on'] < date('Y-m-d'),
        'can_join' => $e['join_code'] !== null, 'joined' => $joined,
    ], 'roadbooks' => $roadbooks]);
}
