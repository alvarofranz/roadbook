<?php
/* /run/<id> — the shareable page of one public run (#803). The link a runner shares: rendered on the
 * server so the Open Graph tags carry the run's card (#785) as og:image — link previews come from
 * crawlers, which never run JavaScript. The page itself shows the card and the run's figures, and
 * leads to the runner's profile, the track it drove and, when it is public, the roadbook. A private or unknown run is a
 * plain 404 page: the link says nothing about it. */
require dirname(__DIR__, 2) . '/app/bootstrap.php';
require dirname(__DIR__, 2) . '/app/page.php';
global $CFG;

$id = (int)($_GET['id'] ?? 0);
$st = db()->prepare('SELECT ru.id, ru.user_id, ru.roadbook_title, ru.completed, ru.duration_s, ru.distance_m, ru.notes_total, ru.notes_reached,
        COALESCE(ru.ended_at, ru.created_at) AS ended_at, u.username, r.slug AS rb_slug, r.status AS rb_status
    FROM roadbook_runs ru JOIN users u ON u.id = ru.user_id LEFT JOIN roadbooks r ON r.id = ru.roadbook_id
    WHERE ru.id = ? AND ru.is_public = 1 AND u.blocked = 0');
$st->execute([$id]);
$run = $st->fetch() ?: null;
if (!$run) http_response_code(404);

$base = rtrim((string)$CFG['base_url'], '/');
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES);

if ($run) {
    $card = run_card_url((int)$run['id']);
    $km = number_format(((int)$run['distance_m']) / 1000, 1, '.', '');
    $s = (int)$run['duration_s']; $time = intdiv($s, 3600) ? intdiv($s, 3600) . ' h ' . str_pad((string)intdiv($s % 3600, 60), 2, '0', STR_PAD_LEFT) . ' min' : intdiv($s, 60) . ' min';
    $title = '@' . $run['username'] . ' · ' . $run['roadbook_title'];
    $figures = $km . ' km · ' . $time . ' · ' . (int)$run['notes_reached'] . '/' . (int)$run['notes_total'];
    $image = $card ? $base . $card : $base . '/assets/mockup.png';
    $url = $base . '/run/' . (int)$run['id'];
    $profile = '/u/' . rawurlencode($run['username']) . '#run-' . (int)$run['id'];
    $roadbook = ($run['rb_status'] === 'public' && $run['rb_slug']) ? '/challenge/' . rawurlencode($run['rb_slug']) : null;
    $when = substr((string)$run['ended_at'], 0, 10);
    $hasTrack = is_file(run_track_path((int)$run['user_id'], (int)$run['id'])); // the track it drove (#940)
}
header('Content-Type: text/html; charset=utf-8');
?><!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#101313">
<?php if ($run): ?>
    <title><?= $h($title) ?> · RDBK.app</title>
    <meta name="description" content="<?= $h($figures) ?>">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="<?= $h($url) ?>">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="RDBK.app">
    <meta property="og:title" content="<?= $h($title) ?>">
    <meta property="og:description" content="<?= $h($figures) ?>">
    <meta property="og:url" content="<?= $h($url) ?>">
    <meta property="og:image" content="<?= $h($image) ?>">
<?php if ($card): ?>
    <meta property="og:image:width" content="1080">
    <meta property="og:image:height" content="1350">
<?php endif; ?>
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="<?= $h($title) ?>">
    <meta name="twitter:description" content="<?= $h($figures) ?>">
    <meta name="twitter:image" content="<?= $h($image) ?>">
<?php else: ?>
    <title>RDBK.app</title>
    <meta name="robots" content="noindex">
<?php endif; ?>
<?php page_head_links(); ?>
</head>
<body>
<header class="topbar"></header>
<main class="wrap page-col page-centered">
<?php if ($run): ?>
    <?php if ($card): ?><img class="run-card-img" src="<?= $h($card) ?>" alt=""><?php endif; ?>
    <h1><?= $h($run['roadbook_title']) ?></h1>
    <p class="muted">@<?= $h($run['username']) ?> · <?= $h($when) ?></p>
    <p class="run-figures"><?= $h($figures) ?></p>
    <div class="btnrow center">
        <a class="btn btn-primary" href="<?= $h($profile) ?>"><i class="fa-solid fa-circle-user"></i> <span data-i18n="View the profile">View the profile</span></a>
        <?php if ($roadbook): ?><a class="btn btn-ghost" href="<?= $h($roadbook) ?>"><i class="fa-solid fa-book-open"></i> <span data-i18n="Open the roadbook">Open the roadbook</span></a><?php endif; ?>
        <?php if ($hasTrack): ?><button class="btn btn-ghost" type="button" data-run-track="<?= (int)$run['id'] ?>"><i class="fa-solid fa-route"></i> <span data-i18n="Driven track">Driven track</span></button><?php endif; ?>
    </div>
<?php else: ?>
    <p class="muted" data-i18n="This run is not public, or no longer exists.">This run is not public, or no longer exists.</p>
<?php endif; ?>
</main>
<?php page_scripts(); ?>
<script src="/assets/js/run-report.js?v=<?= page_version() ?>"></script>
</body>
</html>
