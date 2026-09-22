<?php
/* Events (#6): the event entity, its roadbook associations, co-organizers and
 * participants. An event is owned by the user who created it (events.organizer_id); the
 * event_organizers rows grant more users management rights on that one event. Participants
 * join through the registration gate (closed / invite code / open). `is_public` only decides
 * whether the event is LISTED in the public gallery: an unlisted event is still reachable by
 * its link — page, /go/ link, join, activation — like an unlisted video (#573). */

// Participation rules per associated roadbook (#6): 'free' = follow it with no scoring;
// 'roadbook_suite' = the rules the current ranking engine implements. 'fia' is reserved — the
// editor shows it but disabled (not implemented), so the API refuses it and falls back to 'free'.
const EVENT_SCORING_MODES = ['free', 'roadbook_suite'];
function event_scoring_mode($m): string { return in_array($m, EVENT_SCORING_MODES, true) ? $m : 'free'; }

/* ---- helpers ---- */

function gen_activation_code(): string {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do {
        $code = '';
        for ($i = 0; $i < 6; $i++) $code .= $chars[random_int(0, strlen($chars) - 1)];
        $st = db()->prepare('SELECT 1 FROM event_participants WHERE activation_code = ?');
        $st->execute([$code]);
    } while ($st->fetchColumn());
    return $code;
}

// A user-typed search term for LIKE: its own % and _ are literal, never wildcards (#575).
function like_term(string $q): string { return '%' . addcslashes($q, '%_\\') . '%'; }
// Has the event's last day passed? No new registrations then; participants keep their access (#587).
function event_ended(array $e): bool { return !empty($e['ends_on']) && $e['ends_on'] < date('Y-m-d'); }

/* ---- registration mode transitions (#415/#416) ---- */
// Admit everyone waiting for activation. Shared by the mode-switch reconcile in
// event_save and the bulk "activate all pending" action — one query, never a
// client-side loop. Returns the admitted count for the confirm copy + activity log.
function event_admit_pending(int $eventId): int {
    $st = db()->prepare("UPDATE event_participants SET status = 'active', activation_code = NULL WHERE event_id = ? AND status = 'pending'");
    $st->execute([$eventId]);
    return $st->rowCount();
}
// Send active participants back to pending with fresh personal codes (the organizer
// chose "require QR" when enabling activation). Returns the reset count.
function event_reset_active_to_pending(int $eventId): int {
    $st = db()->prepare("SELECT user_id FROM event_participants WHERE event_id = ? AND status = 'active'");
    $st->execute([$eventId]);
    $n = 0;
    $up = db()->prepare("UPDATE event_participants SET status = 'pending', activation_code = ? WHERE event_id = ? AND user_id = ?");
    foreach ($st->fetchAll() as $row) {
        $up->execute([gen_activation_code(), $eventId, (int)$row['user_id']]);
        $n += $up->rowCount();
    }
    return $n;
}
// The registration gate: HOW you get in. Independent from require_activation (#414):
// whether an organizer must still activate you (personal QR) once you are in.
function event_join_gate($g): string {
    return in_array($g, ['closed', 'code', 'open'], true) ? $g : 'code';
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

// Event-granted rights on a roadbook attached to an event: the organizers (owner or listed
// co-organizer) can EDIT it (#123); with $includeParticipants an ACTIVE participant may also
// READ a non-public one (#25/#163 — pending participants wait for the organizer's activation).
// One query, the participant clause added only for the read check.
// Rights an EVENT gives a user over a roadbook attached to it. Takes the user row, not an id,
// because an admin is one by row (`is_admin` also honours the locked-admin email list) — and an
// admin has these rights: it is the first line of the table in docs/events.md §2. Leaving that
// branch out is what let an admin open an event's management page (`event_can_manage`, which does
// check) and then be refused by the roadbook gate, Edit button and all (#450).
function event_rights_on_roadbook(?array $user, int $roadbookId, bool $includeParticipants): bool {
    if (!$user) return false;
    if (is_admin($user)) return true;
    $uid = (int)$user['id'];
    $st = db()->prepare('SELECT 1 FROM event_roadbooks er JOIN events e ON e.id = er.event_id
        WHERE er.roadbook_id = ? AND (e.organizer_id = ?
            OR EXISTS (SELECT 1 FROM event_organizers eo WHERE eo.event_id = e.id AND eo.user_id = ?)'
            . ($includeParticipants ? " OR EXISTS (SELECT 1 FROM event_participants ep WHERE ep.event_id = e.id AND ep.user_id = ? AND ep.status = 'active')" : '') . ')
        LIMIT 1');
    $st->execute($includeParticipants ? [$roadbookId, $uid, $uid, $uid] : [$roadbookId, $uid, $uid]);
    return (bool)$st->fetch();
}
function event_grants_read(?array $user, int $roadbookId): bool { return event_rights_on_roadbook($user, $roadbookId, true); }
function event_co_edits_roadbook(?array $user, int $roadbookId): bool { return event_rights_on_roadbook($user, $roadbookId, false); }
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
    $sql = 'SELECT e.id, e.slug, e.title, e.starts_on, e.ends_on, e.is_public, e.logo, e.organizer_id, u.username AS organizer,
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
        'ended' => event_ended($r),
        // deleting (and the organizer list) is the owner's, so the list offers Delete only to them (#600)
        'is_owner' => is_admin($user) || (int)$r['organizer_id'] === (int)$user['id'],
    ], $rows)]);
}

// Everything the event management page needs (#123): parameters, organizers,
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
    $pend = db()->prepare("SELECT COUNT(*) FROM event_participants WHERE event_id = ? AND status = 'pending'");
    $pend->execute([$id]);
    json_out(['ok' => true, 'event' => [
        'id' => $id, 'slug' => $e['slug'], 'title' => $e['title'], 'description' => $e['description'],
        'organizer_website' => $e['organizer_website'], 'hq_lat' => $e['hq_lat'], 'hq_lon' => $e['hq_lon'],
        'starts_on' => $e['starts_on'], 'ends_on' => $e['ends_on'], 'is_public' => (int)$e['is_public'],
        'join_gate' => event_join_gate($e['join_gate'] ?? null), 'require_activation' => (int)($e['require_activation'] ?? 1),
        'join_code' => $e['join_code'], 'open_join' => (int)$e['open_join'], 'owner_id' => (int)$e['organizer_id'], 'logo' => $e['logo'],
        'organizers' => array_map(fn($x) => ['id' => (int)$x['id'], 'username' => $x['username'], 'email' => $x['email'], 'organization' => $x['organization']], $org->fetchAll()),
        'roadbooks' => array_map(fn($x) => ['id' => (int)$x['id'], 'title' => $x['title'], 'category' => $x['category'], 'status' => $x['status'],
            'scoring_mode' => $x['scoring_mode'], 'owner_id' => (int)$x['owner_id'], 'username' => $x['username']], $rb->fetchAll()),
        'participant_count' => (int)$pp->fetchColumn(), 'pending_count' => (int)$pend->fetchColumn(),
    ]]);
}

// Paged, searchable participant list (#144) — an event's roster can run into the hundreds, so
// the page never gets it whole. q matches the username or the full name (like user_search);
// the response row shape is the contract P2.4 (#124) will widen with the entry fields.
function event_participants_list(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    $q = trim((string)($d['q'] ?? ''));
    $status = trim((string)($d['status'] ?? ''));
    $page = max(1, (int)($d['page'] ?? 1));
    $perPage = min(100, max(1, (int)($d['per_page'] ?? 25)));
    $where = 'ep.event_id = ?';
    $args = [(int)$e['id']];
    if ($status === 'pending' || $status === 'active') {
        $where .= ' AND ep.status = ?';
        $args[] = $status;
    }
    if ($q !== '') {
        $where .= " AND (u.username LIKE ? OR CONCAT(u.first_name, ' ', u.last_name) LIKE ?)";
        $like = like_term($q);
        array_push($args, $like, $like);
    }
    $st = db()->prepare("SELECT COUNT(*) FROM event_participants ep JOIN users u ON u.id = ep.user_id WHERE $where");
    $st->execute($args);
    $total = (int)$st->fetchColumn();
    // LIMIT/OFFSET are sanitized ints inlined directly: PDO string-binds bound placeholders there
    $st = db()->prepare("SELECT u.id, u.username, u.first_name, u.last_name, u.email, ep.created_at, ep.status
        FROM event_participants ep JOIN users u ON u.id = ep.user_id
        WHERE $where ORDER BY ep.created_at, u.id LIMIT $perPage OFFSET " . ($page - 1) * $perPage);
    $st->execute($args);
    // the roster's filter chips show how many are pending / active, whatever the current filter (#603)
    $cnt = db()->prepare('SELECT status, COUNT(*) AS n FROM event_participants WHERE event_id = ? GROUP BY status');
    $cnt->execute([(int)$e['id']]);
    $counts = ['pending' => 0, 'active' => 0];
    foreach ($cnt->fetchAll() as $c) $counts[$c['status']] = (int)$c['n'];
    json_out(['ok' => true, 'total' => $total, 'page' => $page, 'per_page' => $perPage, 'counts' => $counts,
        'participants' => array_map(fn($x) => ['id' => (int)$x['id'], 'username' => $x['username'],
            'first_name' => $x['first_name'], 'last_name' => $x['last_name'], 'email' => $x['email'],
            'joined' => $x['created_at'], 'status' => $x['status']], $st->fetchAll())]);
}

// Create or update an event's own parameters. The roadbook associations and the
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
    if (array_key_exists('join_gate', $d)) {
        $gate = event_join_gate($d['join_gate']);
        $needActivation = !empty($d['require_activation']) ? 1 : 0;
    } else {
        // stale client speaking the legacy open_join flag: preserve its exact semantics
        $legacyOpen = !empty($d['open_join']) ? 1 : 0;
        $gate = $legacyOpen ? 'open' : 'code';
        $needActivation = $legacyOpen ? 0 : 1;
    }
    // rights + slug first, then save — no transaction needed for a single UPDATE/INSERT.
    // The slug follows the title while the event is being prepared (#194), and is frozen once the
    // event is listed: from then on its URL is out there, and a rename must not break it (#578).
    if ($id > 0) {
        $cur = require_event_manage($user, $id);
        $slug = (int)$cur['is_public'] ? $cur['slug'] : unique_slug('events', $title, 'event', $id);
    }
    else { if (!is_admin($user) && !is_organizer($user)) fail('Organizers only.', 403); $slug = unique_slug('events', $title, 'event', 0); }
    if ($id > 0) {
        $sql = 'UPDATE events SET title = ?, description = ?, organizer_website = ?, hq_lat = ?, hq_lon = ?, starts_on = ?, ends_on = ?, is_public = ?, join_gate = ?, require_activation = ?, open_join = ?, slug = ?';
        $args = [$title, $desc, $website, $hqLat, $hqLon, $starts, $ends, $isPublic, $gate, $needActivation, $gate === 'open' ? 1 : 0, $slug];
        // only the code gate uses a join code — any other gate clears it so it is not usable
        if ($gate !== 'code') $sql .= ', join_code = NULL';
        $sql .= ' WHERE id = ?';
        $args[] = $id;
        db()->prepare($sql)->execute($args);
        // mode switch reconcile (#415): the flags only take effect when the NEW setting no
        // longer / newly requires activation — the client confirms first with RBConfirm.
        if (!$needActivation && !empty($d['admit_pending'])) {
            $n = event_admit_pending($id);
            if ($n) log_activity((int)$user['id'], 'event_admit_pending', 'event #' . $id . ' admit ' . $n);
        }
        if ($needActivation && !empty($d['reset_active'])) {
            $n = event_reset_active_to_pending($id);
            if ($n) log_activity((int)$user['id'], 'event_reset_active', 'event #' . $id . ' reset ' . $n);
        }
    } else {
        db()->prepare('INSERT INTO events (organizer_id, slug, title, description, organizer_website, hq_lat, hq_lon, starts_on, ends_on, is_public, join_gate, require_activation, open_join) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$user['id'], $slug, $title, $desc, $website, $hqLat, $hqLon, $starts, $ends, $isPublic, $gate, $needActivation, $gate === 'open' ? 1 : 0]);
        $id = (int)db()->lastInsertId();
        // the owner is also listed among the event's organizers
        db()->prepare('INSERT IGNORE INTO event_organizers (event_id, user_id) VALUES (?,?)')->execute([$id, (int)$user['id']]);
    }
    // an invite-code registration always HAS a code: choosing it is enough, no second step (#593)
    if ($gate === 'code') {
        $st = db()->prepare('SELECT join_code FROM events WHERE id = ?'); $st->execute([$id]);
        if ($st->fetchColumn() === null) event_generate_join_code($id);
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
// User search for the add-organizer / add-participant pickers (#575). Organizer-gated, and still
// never a way to enumerate accounts: a term needs 2+ characters and its own % / _ are literal;
// username, full name and organization match partially, an email only EXACTLY (you find someone
// whose address you already know) — and emails are never returned.
function user_search(array $user, array $d): void {
    if (!is_organizer($user) && !user_manages_events((int)$user['id'])) fail('Organizers only.', 403);
    $q = trim((string)($d['q'] ?? ''));
    $org = trim((string)($d['organization'] ?? ''));
    $page = max(1, (int)($d['page'] ?? 1));
    $perPage = min(50, max(1, (int)($d['per_page'] ?? 10)));
    if (mb_strlen($q) < 2 && mb_strlen($org) < 2) json_out(['ok' => true, 'total' => 0, 'page' => $page, 'per_page' => $perPage, 'users' => []]);
    $where = 'WHERE blocked = 0';
    $args = [];
    if (mb_strlen($q) >= 2) { $where .= " AND (username LIKE ? OR CONCAT(first_name, ' ', last_name) LIKE ? OR email = ?)"; $like = like_term($q); array_push($args, $like, $like, $q); }
    if (mb_strlen($org) >= 2) { $where .= ' AND organization LIKE ?'; $args[] = like_term($org); }
    $st = db()->prepare("SELECT COUNT(*) FROM users $where"); $st->execute($args);
    $total = (int)$st->fetchColumn();
    $st = db()->prepare("SELECT id, username, first_name, last_name, organization FROM users $where ORDER BY username LIMIT $perPage OFFSET " . ($page - 1) * $perPage);
    $st->execute($args);
    json_out(['ok' => true, 'total' => $total, 'page' => $page, 'per_page' => $perPage,
        'users' => array_map(fn($r) => ['id' => (int)$r['id'], 'username' => $r['username'], 'first_name' => $r['first_name'], 'last_name' => $r['last_name'], 'organization' => $r['organization']], $st->fetchAll())]);
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
// Set or rotate the join code the organizer shares with participants. Closing registration is
// the gate's job (closed), not a missing code (#593).
function event_join_code(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    if (event_join_gate($e['join_gate'] ?? null) !== 'code') fail('A join code needs the Invite code registration.');
    // installed app binaries still carry the old "Disable joining" button: refuse, never rotate by accident
    if (!empty($d['clear'])) fail('To stop new registrations, set Registration to Closed.');
    $code = trim((string)($d['code'] ?? ''));
    if ($code !== '') {
        $code = strtoupper($code);
        // it becomes the /go/<code> link, so only what a URL segment and a keyboard agree on (#576)
        if (!preg_match('/^[A-Z0-9]{4,16}$/', $code)) fail('A join code is 4–16 letters (A–Z) or digits.');
        try {
            db()->prepare('UPDATE events SET join_code = ? WHERE id = ?')->execute([$code, (int)$e['id']]);
            json_out(['ok' => true, 'join_code' => $code]);
        } catch (\Throwable $x) { fail('Code already in use.', 409); }
    }
    json_out(['ok' => true, 'join_code' => event_generate_join_code((int)$e['id'])]);
}
// Give an event a fresh random join code and return it.
function event_generate_join_code(int $eventId): string {
    for ($try = 0; $try < 5; $try++) { // regenerate until unique (the column is UNIQUE; collisions are ~impossible)
        $code = strtoupper(bin2hex(random_bytes(4)));
        try {
            db()->prepare('UPDATE events SET join_code = ? WHERE id = ?')->execute([$code, $eventId]);
            return $code;
        } catch (\Throwable $x) { /* duplicate code — roll again */ }
    }
    fail('Could not generate a join code.', 500); // 5 straight failures = the DB is unhappy, not a collision
}

// Enrol a user in an event and return their [status, activation_code]. Shared by event_join and
// the /go/ link so both paths admit identically. Joining is IDEMPOTENT (#574): someone already
// in keeps exactly what they have — the app turns every open of the event QR into a join, and an
// active participant must never be sent back to pending by it. A newcomer lands pending with a
// personal QR when the event requires activation, else active at once (#414).
function event_enrol(array $e, int $userId): array {
    $st = db()->prepare('SELECT status, activation_code FROM event_participants WHERE event_id = ? AND user_id = ?');
    $st->execute([(int)$e['id'], $userId]);
    if ($row = $st->fetch()) return [$row['status'], $row['activation_code']];
    $status = (int)($e['require_activation'] ?? 1) ? 'pending' : 'active';
    $actCode = $status === 'pending' ? gen_activation_code() : null;
    db()->prepare('INSERT INTO event_participants (event_id, user_id, status, activation_code) VALUES (?, ?, ?, ?)')
        ->execute([(int)$e['id'], $userId, $status, $actCode]);
    log_activity($userId, 'event_join', 'event #' . (int)$e['id']);
    return [$status, $actCode];
}
// May a NEW participant come in? The gate (closed admits nobody) and the calendar (#587).
// Null when yes, else the refusal to show.
function event_registration_refusal(array $e): ?string {
    if (event_join_gate($e['join_gate'] ?? null) === 'closed') return 'Registration is closed.';
    if (event_ended($e)) return 'This event has ended.';
    return null;
}
// A signed-in user joins an event — from the event page (Join button, by slug) or from the
// native /go/<code> App-Links deep link (#268), which carries only the join code, no slug.
// The gate decides HOW you get in (closed/code/open); require_activation decides whether you
// land pending (personal QR) or active at once (#414).
function event_join(array $user, array $d): void {
    rate_limit('join_' . $user['id'], 20, 3600); // stop code guessing
    $code = strtoupper(trim((string)($d['code'] ?? '')));
    $slug = (string)($d['slug'] ?? '');
    // Locate the event by slug when the page supplies one, else by the join code alone. An
    // unlisted event is joinable by its link like a listed one (#573).
    $cols = 'SELECT id, slug, join_gate, require_activation, join_code, ends_on FROM events';
    if ($slug !== '') {
        $st = db()->prepare("$cols WHERE slug = ?"); $st->execute([$slug]);
    } elseif ($code !== '') {
        $st = db()->prepare("$cols WHERE join_code = ?"); $st->execute([$code]);
    } else {
        fail('Enter the join code.');
    }
    $e = $st->fetch();
    if (!$e) fail('Not found.', 404);
    // slug lets the native App-Links deep link (#268) open the event page after a join-by-code
    $answer = fn(array $r) => json_out(['ok' => true, 'status' => $r[0], 'activation_code' => $r[1], 'slug' => $e['slug']]);
    // already in: nothing to check and nothing to change — the same answer every time (#574)
    $st = db()->prepare('SELECT status, activation_code FROM event_participants WHERE event_id = ? AND user_id = ?');
    $st->execute([(int)$e['id'], (int)$user['id']]);
    if ($row = $st->fetch()) $answer([$row['status'], $row['activation_code']]);
    if ($refusal = event_registration_refusal($e)) fail($refusal, 403);
    // Code gate: the supplied code must match this event's own join code; the open gate needs none.
    if (event_join_gate($e['join_gate'] ?? null) === 'code'
        && ($code === '' || $e['join_code'] === null || $code !== $e['join_code'])) fail('Wrong join code.', 404);
    $answer(event_enrol($e, (int)$user['id']));
}

function event_leave(array $user, array $d): void {
    $st = db()->prepare('SELECT id FROM events WHERE slug = ?'); $st->execute([(string)($d['slug'] ?? '')]);
    $e = $st->fetch();
    if (!$e) fail('Not found.', 404);
    db()->prepare('DELETE FROM event_participants WHERE event_id = ? AND user_id = ?')->execute([(int)$e['id'], (int)$user['id']]);
    clear_participant_context();
    json_out(['ok' => true, 'clear_participant' => true]);
}

function event_participant_remove(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    db()->prepare('DELETE FROM event_participants WHERE event_id = ? AND user_id = ?')
        ->execute([(int)$e['id'], (int)($d['user_id'] ?? 0)]);
    json_out(['ok' => true]);
}

// The one way an organizer enrols someone: straight in as active, no personal code (#577).
function event_participant_add(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    $uid = (int)($d['user_id'] ?? 0);
    $st = db()->prepare('SELECT 1 FROM users WHERE id = ? AND blocked = 0'); $st->execute([$uid]);
    if (!$st->fetch()) fail('No such user.', 404);
    db()->prepare("INSERT INTO event_participants (event_id, user_id, status) VALUES (?, ?, 'active') ON DUPLICATE KEY UPDATE status = 'active', activation_code = NULL")->execute([(int)$e['id'], $uid]);
    json_out(['ok' => true]);
}
// Turn one pending participant of this event active (#577) — never enrols anyone. Returns who,
// so the desk can check the person in front of it is the one admitted (#604).
function event_activate_participant(int $eventId, int $userId): array {
    $up = db()->prepare("UPDATE event_participants SET status = 'active', activation_code = NULL WHERE event_id = ? AND user_id = ? AND status = 'pending'");
    $up->execute([$eventId, $userId]);
    if (!$up->rowCount()) fail('Not a pending participant of this event.', 404);
    $st = db()->prepare('SELECT id, username, first_name, last_name FROM users WHERE id = ?'); $st->execute([$userId]);
    $u = $st->fetch();
    return ['id' => (int)$u['id'], 'username' => $u['username'], 'name' => trim($u['first_name'] . ' ' . $u['last_name'])];
}

// The desk activates the code a participant shows, for the event on screen (#604): the code is
// looked up in THIS event only, and the answer names the person admitted.
function event_activate_by_code(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    $code = strtoupper(trim((string)($d['code'] ?? '')));
    if (!preg_match('/^[A-Z2-9]{6}$/', $code)) fail('Invalid activation code.', 400);
    $st = db()->prepare("SELECT user_id FROM event_participants WHERE event_id = ? AND activation_code = ? AND status = 'pending'");
    $st->execute([(int)$e['id'], $code]);
    $uid = (int)$st->fetchColumn();
    if (!$uid) fail('Code not found or already activated.', 404);
    json_out(['ok' => true, 'participant' => event_activate_participant((int)$e['id'], $uid)]);
}

// #416: admit everyone waiting for activation in one query (no client-side loop).
function event_participants_activate_pending(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    $n = event_admit_pending((int)$e['id']);
    log_activity((int)$user['id'], 'event_admit_pending', 'event #' . (int)$e['id'] . ' admit ' . $n);
    json_out(['ok' => true, 'admitted' => $n]);
}

// The roster's Activate button: one pending participant of this event (#577).
function participant_activate(array $user, array $d): void {
    $e = require_event_manage($user, (int)($d['event_id'] ?? 0));
    json_out(['ok' => true, 'participant' => event_activate_participant((int)$e['id'], (int)($d['user_id'] ?? 0))]);
}

/* ---- public (no auth) ---- */
function events_public_list(): void {
    // grouped LEFT JOINs count each event's roadbooks in one pass instead of a
    // correlated subquery per listed event. The count mirrors the event page's
    // visibility (#419): anyone sees PUBLIC roadbooks; participants (pending
    // included) and organizers also see READY ones; organizers see DRAFTs too.
    // Signed out, that collapses to PUBLIC only.
    $me = current_user();
    $countExpr = "COUNT(DISTINCT CASE WHEN r.status = 'public' THEN r.id END)";
    $epJoin = '';
    if ($me) {
        $mid = (int)$me['id'];
        $managed = is_admin($me) ? '1=1' : "(e.organizer_id = $mid OR EXISTS
            (SELECT 1 FROM event_organizers eo WHERE eo.event_id = e.id AND eo.user_id = $mid))";
        $epJoin = "LEFT JOIN event_participants ep ON ep.event_id = e.id AND ep.user_id = $mid";
        $countExpr = "COUNT(DISTINCT CASE WHEN r.status = 'public'
                OR (r.status = 'ready' AND (ep.user_id IS NOT NULL OR $managed))
                OR (r.status = 'draft' AND $managed)
                THEN r.id END)";
    }
    $rows = db()->query("SELECT e.slug, e.title, e.starts_on, e.ends_on, e.logo, u.username AS organizer,
            $countExpr AS roadbooks
        FROM events e JOIN users u ON u.id = e.organizer_id
        LEFT JOIN event_roadbooks er ON er.event_id = e.id
        LEFT JOIN roadbooks r ON r.id = er.roadbook_id
        $epJoin
        WHERE e.is_public = 1
        GROUP BY e.id ORDER BY COALESCE(e.starts_on, DATE(e.created_at)) DESC LIMIT 100")->fetchAll();
    json_out(['ok' => true, 'events' => array_map(fn($r) => [
        'slug' => $r['slug'], 'title' => $r['title'], 'starts_on' => $r['starts_on'], 'ends_on' => $r['ends_on'], 'ended' => event_ended($r),
        'logo' => $r['logo'], 'organizer' => $r['organizer'], 'roadbooks' => (int)$r['roadbooks'],
    ], $rows)]);
}

function event_public_get(array $d): void {
    $slug = (string)($d['slug'] ?? '');
    $st = db()->prepare('SELECT e.id, e.organizer_id, e.slug, e.title, e.description, e.organizer_website, e.hq_lat, e.hq_lon, e.starts_on, e.ends_on, e.is_public, e.join_gate, e.require_activation, e.open_join, e.join_code, e.logo, u.username AS organizer
        FROM events e JOIN users u ON u.id = e.organizer_id WHERE e.slug = ?');
    $st->execute([$slug]);
    $e = $st->fetch();
    if (!$e) fail('Not found.', 404); // listed or not, the link opens it (#573)
    // joining state for the signed-in visitor: drives the Join-with-code / Leave UI (#123)
    $me = current_user();
    $joined = false;
    $participantStatus = null;
    $activationCode = null;
    if ($me) {
        $j = db()->prepare('SELECT status, activation_code FROM event_participants WHERE event_id = ? AND user_id = ?');
        $j->execute([(int)$e['id'], (int)$me['id']]);
        $row = $j->fetch();
        if ($row) { $joined = true; $participantStatus = $row['status']; $activationCode = $row['activation_code'];
            if ($participantStatus === 'pending' && !$activationCode) {
                $activationCode = gen_activation_code();
                db()->prepare('UPDATE event_participants SET activation_code = ? WHERE event_id = ? AND user_id = ?')
                    ->execute([$activationCode, (int)$e['id'], (int)$me['id']]);
            }
        }
    }
    // Status visibility: anyone sees the PUBLIC roadbooks; event members (participants,
    // pending included, and organizers) also see the READY ones as badge-locked cards
    // ("Active participants only") until activation unlocks them; DRAFTS show to
    // organizers only. Actual roadbook access is re-checked server-side on the
    // challenge page — this list only controls what existence/metadata is disclosed.
    $orgRead = $me && event_can_manage($me, $e); // organizers always readable
    $activeParticipant = $joined && $participantStatus === 'active';
    $statuses = "'public'";
    if ($joined || $orgRead) $statuses .= ",'ready'";
    if ($orgRead) $statuses .= ",'draft'";
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
        'id' => (int)$e['id'], 'slug' => $e['slug'], 'title' => $e['title'], 'description' => $e['description'],
        'organizer_website' => $e['organizer_website'], 'hq_lat' => $e['hq_lat'], 'hq_lon' => $e['hq_lon'],
        'starts_on' => $e['starts_on'], 'ends_on' => $e['ends_on'], 'logo' => $e['logo'], 'organizer' => $e['organizer'],
        'is_public' => (int)$e['is_public'], 'ended' => event_ended($e),
        'can_join' => event_registration_refusal($e) === null, 'join_gate' => event_join_gate($e['join_gate'] ?? null),
        'require_activation' => (int)($e['require_activation'] ?? 1), 'open_join' => (int)($e['open_join'] ?? 0), 'joined' => $joined, 'participant_status' => $participantStatus,
        'activation_code' => $activationCode,
        'org_read' => $orgRead, 'active_participant' => $activeParticipant,
    ], 'roadbooks' => $roadbooks]);
}
