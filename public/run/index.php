<?php
/* /run/<id> — the shareable page of one public run (#803). The link a runner shares: rendered on the
 * server so the Open Graph tags carry the run's card (#785) as og:image — link previews come from
 * crawlers, which never run JavaScript. The page itself shows the card and the run's figures, and
 * leads to the runner's profile and, when it is public, the roadbook. A private or unknown run is a
 * plain 404 page: the link says nothing about it. */
require dirname(__DIR__, 2) . '/app/bootstrap.php';
global $CFG;

$id = (int)($_GET['id'] ?? 0);
$st = db()->prepare('SELECT ru.id, ru.roadbook_title, ru.completed, ru.duration_s, ru.distance_m, ru.notes_total, ru.notes_reached,
        COALESCE(ru.ended_at, ru.created_at) AS ended_at, u.username, r.slug AS rb_slug, r.status AS rb_status
    FROM roadbook_runs ru JOIN users u ON u.id = ru.user_id LEFT JOIN roadbooks r ON r.id = ru.roadbook_id
    WHERE ru.id = ? AND ru.is_public = 1 AND u.blocked = 0');
$st->execute([$id]);
$run = $st->fetch() ?: null;
if (!$run) http_response_code(404);

$ver = json_decode((string)@file_get_contents(dirname(__DIR__) . '/version.json'), true) ?: [];
$v = rawurlencode(($ver['version'] ?? '0') . '-' . ($ver['build'] ?? '0')); // the same cache-buster the stamped pages carry
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
}
header('Content-Type: text/html; charset=utf-8');
?><!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#0e1116">
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
    <link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
    <link rel="manifest" href="/manifest.json">
    <link rel="stylesheet" href="/assets/fontawesome/css/all.min.css?v=<?= $v ?>">
    <link rel="stylesheet" href="/assets/css/app.css?v=<?= $v ?>">
    <style>
        .run-page { text-align: center; padding-top: 1.4rem; }
        .run-page .run-card-img { display: block; width: 100%; max-width: 420px; aspect-ratio: 4/5; object-fit: cover; margin: 0 auto 1.2rem; border-radius: 18px; border: 1px solid var(--line); background: var(--card-2); box-shadow: var(--shadow); }
        .run-page h1 { font-size: 1.5rem; margin: 0 0 .3rem; overflow-wrap: break-word; }
        .run-page .run-figures { font-size: 1.05rem; font-weight: 700; margin: .6rem 0 1.2rem; }
    </style>
</head>
<body>
<header class="topbar"></header>
<main class="wrap page-col run-page">
<?php if ($run): ?>
    <?php if ($card): ?><img class="run-card-img" src="<?= $h($card) ?>" alt=""><?php endif; ?>
    <h1><?= $h($run['roadbook_title']) ?></h1>
    <p class="muted">@<?= $h($run['username']) ?> · <?= $h($when) ?></p>
    <p class="run-figures"><?= $h($figures) ?></p>
    <div class="btnrow center">
        <a class="btn btn-primary" href="<?= $h($profile) ?>"><i class="fa-solid fa-circle-user"></i> <span data-i18n="View the profile">View the profile</span></a>
        <?php if ($roadbook): ?><a class="btn btn-ghost" href="<?= $h($roadbook) ?>"><i class="fa-solid fa-book-open"></i> <span data-i18n="Open the roadbook">Open the roadbook</span></a><?php endif; ?>
    </div>
<?php else: ?>
    <p class="muted" data-i18n="This run is not public, or no longer exists.">This run is not public, or no longer exists.</p>
<?php endif; ?>
</main>
<div id="toast" class="toast" hidden></div>
<script src="/assets/js/config.js?v=<?= $v ?>"></script>
<script src="/assets/js/roadbook-core.js?v=<?= $v ?>"></script>
<script src="/assets/js/i18n.es.js?v=<?= $v ?>"></script>
<script src="/assets/js/i18n.it.js?v=<?= $v ?>"></script>
<script src="/assets/js/i18n.de.js?v=<?= $v ?>"></script>
<script src="/assets/js/i18n.fr.js?v=<?= $v ?>"></script>
<script src="/assets/js/i18n.js?v=<?= $v ?>"></script>
<script src="/assets/js/app.js?v=<?= $v ?>"></script>
</body>
</html>
