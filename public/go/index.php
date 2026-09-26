<?php
/* /go/<join code> — the participant link printed as the event QR (#163). Signs in first, then asks:
 * opening a link must never enrol anyone by itself (a GET can be fired by a prefetch, an <img> on
 * another site, a link preview), so a newcomer sees the event and a Join button that POSTs back
 * here; someone already in goes straight through. Joining is idempotent (#574), switches on
 * participant mode and lands on the event page. A link that leads nowhere — unknown code, closed
 * registration, finished event — lands on the Events page, which explains it in the visitor's
 * language (#579). The native app never reaches this page: its deep link runs event_join itself. */
require dirname(__DIR__, 2) . '/app/bootstrap.php';
require dirname(__DIR__, 2) . '/app/page.php';

function go_away(string $why): never {
    header('Location: /events/?link=' . $why);
    exit;
}
// In: participant mode on, and on to the event page.
function go_enter(array $event): never {
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
}

// new codes are A–Z 0–9 (#576); - and _ stay readable so links printed before that keep working
$tag = strtoupper((string)($_GET['tag'] ?? ''));
if (!preg_match('/^[A-Z0-9_-]{1,32}$/', $tag)) go_away('invalid');

// Listed or not, the link reaches the event (#573).
$st = db()->prepare('SELECT id, slug, title, join_gate, require_activation, ends_on FROM events WHERE join_code = ?');
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
if ($st->fetch()) go_enter($event); // already in: nothing to ask

// a newcomer passes the same checks as event_join
if (event_registration_refusal($event)) go_away(event_join_gate($event['join_gate'] ?? null) === 'closed' ? 'closed' : 'ended');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_same_origin(); // the Join button of this very page, never a form posted from elsewhere
    rate_limit('join_' . $user['id'], 20, 3600);
    event_enrol($event, (int)$user['id']);
    go_enter($event);
}

$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES);
header('Content-Type: text/html; charset=utf-8');
?><!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#101313">
    <meta name="robots" content="noindex">
    <title><?= $h($event['title']) ?> · RDBK.app</title>
<?php page_head_links(); ?>
</head>
<body>
<header class="topbar"></header>
<main class="wrap page-col page-centered">
    <h1><?= $h($event['title']) ?></h1>
    <p class="muted" data-i18n="Join this event as a participant.">Join this event as a participant.</p>
    <form method="post" action="/go/<?= $h(rawurlencode($tag)) ?>" class="btnrow center">
        <button class="btn btn-primary" type="submit"><i class="fa-solid fa-right-to-bracket"></i> <span data-i18n="Join">Join</span></button>
        <a class="btn btn-ghost" href="/event/<?= $h(rawurlencode($event['slug'])) ?>" data-i18n="Not now">Not now</a>
    </form>
</main>
<?php page_scripts(); ?>
</body>
</html>
