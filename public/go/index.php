<?php
require dirname(__DIR__, 2) . '/app/bootstrap.php';

function go_error(string $msg): never {
    http_response_code(404);
    ?><!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0e1116"><title>Not found · RDBK.app</title><link rel="icon" href="/assets/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png"><link rel="stylesheet" href="/assets/fontawesome/css/all.min.css?v=2026.07.10-2"><link rel="stylesheet" href="/assets/css/app.css?v=2026.07.10-2"></head><body><header class="topbar"></header><main class="wrap" style="max-width:600px;padding:2rem 1.1rem 5rem"><div class="muted" style="text-align:center;margin-top:4rem"><i class="fa-solid fa-ban" style="font-size:3rem;opacity:.3;margin-bottom:1rem"></i><p><?=htmlspecialchars($msg)?></p><a href="/" class="btn btn-primary" style="margin-top:1.5rem">Home</a></div></main><script src="/assets/js/i18n.es.js?v=2026.07.10-2"></script><script src="/assets/js/i18n.it.js?v=2026.07.10-2"></script><script src="/assets/js/i18n.de.js?v=2026.07.10-2"></script><script src="/assets/js/i18n.fr.js?v=2026.07.10-2"></script><script src="/assets/js/i18n.js?v=2026.07.10-2"></script><script src="/assets/js/app.js?v=2026.07.10-2"></script></body></html><?php
    exit;
}

$tag = $_GET['tag'] ?? '';
if (!preg_match('/^[A-Za-z0-9_-]+$/', $tag)) go_error('Not found');

$st = db()->prepare('SELECT id, slug FROM events WHERE join_code = ? AND is_public = 1');
$st->execute([$tag]);
$event = $st->fetch();
if (!$event) go_error('Event not found');

$user = current_user();
if (!$user) {
    header('Location: /account/?next=' . urlencode('/go/' . $tag));
    exit;
}

$st = db()->prepare('SELECT status FROM event_participants WHERE event_id = ? AND user_id = ?');
$st->execute([(int)$event['id'], (int)$user['id']]);
$row = $st->fetch();

if (!$row) {
    $actCode = gen_activation_code();
    db()->prepare("INSERT INTO event_participants (event_id, user_id, status, activation_code) VALUES (?, ?, 'pending', ?) ON DUPLICATE KEY UPDATE status = 'pending', activation_code = ?")
        ->execute([(int)$event['id'], (int)$user['id'], $actCode, $actCode]);
    log_activity((int)$user['id'], 'event_join', 'event #' . (int)$event['id']);
}
// Everyone entering via the /go/ link gets participant mode (pending or active): the
// reduced surface removes irrelevant nav tools (#163). A pending participant waits on
// the event page for the organizer's activation but already sees only event-scoped UI.
set_participant_context((int)$event['id']);
setcookie('rb_participant', '1', 0, '/', '', false, false);

header('Location: /event/' . $event['slug']);
exit;
