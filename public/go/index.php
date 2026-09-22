<?php
/* /go/<join code> — the participant link printed as the event QR (#163). Signs in first, enrols
 * (idempotently, #574), switches on participant mode and lands on the event page. A link that
 * leads nowhere — unknown code, closed registration, finished event — lands on the Events page,
 * which explains it in the visitor's language (#579): no second HTML template to keep in sync. */
require dirname(__DIR__, 2) . '/app/bootstrap.php';

function go_away(string $why): never {
    header('Location: /events/?link=' . $why);
    exit;
}

// new codes are A–Z 0–9 (#576); - and _ stay readable so links printed before that keep working
$tag = strtoupper((string)($_GET['tag'] ?? ''));
if (!preg_match('/^[A-Z0-9_-]{1,32}$/', $tag)) go_away('invalid');

// Listed or not, the link reaches the event (#573).
$st = db()->prepare('SELECT id, slug, join_gate, require_activation, ends_on FROM events WHERE join_code = ?');
$st->execute([$tag]);
$event = $st->fetch();
if (!$event) go_away('invalid');

$user = current_user();
if (!$user) {
    header('Location: /account/?next=' . urlencode('/go/' . $tag));
    exit;
}

$st = db()->prepare('SELECT 1 FROM event_participants WHERE event_id = ? AND user_id = ?');
$st->execute([(int)$event['id'], (int)$user['id']]);
if (!$st->fetch()) {
    // a newcomer passes the same checks as event_join; someone already in just goes through
    $refusal = event_registration_refusal($event);
    if ($refusal) go_away(event_join_gate($event['join_gate'] ?? null) === 'closed' ? 'closed' : 'ended');
    event_enrol($event, (int)$user['id']);
}
// Everyone entering via the /go/ link gets participant mode (pending or active): the
// reduced surface removes irrelevant nav tools (#163). A pending participant waits on
// the event page for the organizer's activation but already sees only event-scoped UI.
set_participant_context((int)$event['id']);
// A UX flag the header reads (document.cookie) to show the participant-scoped nav — not an auth
// credential (that's the session). HttpOnly stays off because the client JS reads it; Secure follows
// the request scheme so it isn't sent in clear over HTTP, and SameSite=Lax matches the session cookie.
setcookie('rb_participant', '1', ['expires' => 0, 'path' => '/', 'secure' => request_is_https(), 'httponly' => false, 'samesite' => 'Lax']);

header('Location: /event/' . $event['slug']);
exit;
