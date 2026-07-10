<?php
require dirname(__DIR__, 2) . '/app/bootstrap.php';

$tag = $_GET['tag'] ?? '';
if (!preg_match('/^[A-Za-z0-9_-]+$/', $tag)) { http_response_code(404); echo 'Not found'; exit; }

$st = db()->prepare('SELECT id, slug FROM events WHERE join_code = ? AND is_public = 1');
$st->execute([$tag]);
$event = $st->fetch();
if (!$event) { http_response_code(404); echo 'Event not found'; exit; }

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
// Only ACTIVE participants enter participant mode: the context plus the UI-hint cookie
// (read by app.js to show the participant bar — deliberately not httponly). A pending
// visitor just lands on the event page and waits for the organizer's activation.
if ($row && $row['status'] === 'active') {
    set_participant_context((int)$event['id']);
    setcookie('rb_participant', '1', 0, '/', '', false, false);
}

header('Location: /event/' . $event['slug']);
exit;
