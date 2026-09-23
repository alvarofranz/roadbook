<?php
/* The shell of the few pages PHP renders itself (/run/<id> · /go/<code>): the same icons, styles and
 * scripts as every stamped page, behind the same cache-buster, so the header, the tab bar and the
 * translation of their data-i18n labels come from app.js like anywhere else. */

// The ?v= token the stamped pages carry (version-build), read from version.json.
function page_version(): string {
    $ver = json_decode((string)@file_get_contents(dirname(__DIR__) . '/public/version.json'), true) ?: [];
    return rawurlencode(($ver['version'] ?? '0') . '-' . ($ver['build'] ?? '0'));
}
function page_head_links(): void {
    $v = page_version(); ?>
    <link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
    <link rel="manifest" href="/manifest.json">
    <link rel="stylesheet" href="/assets/fontawesome/css/all.min.css?v=<?= $v ?>">
    <link rel="stylesheet" href="/assets/css/app.css?v=<?= $v ?>">
<?php }
function page_scripts(): void {
    $v = page_version(); ?>
<div id="toast" class="toast" hidden></div>
<script src="/assets/js/config.js?v=<?= $v ?>"></script>
<script src="/assets/js/roadbook-core.js?v=<?= $v ?>"></script>
<script src="/assets/js/i18n.es.js?v=<?= $v ?>"></script>
<script src="/assets/js/i18n.it.js?v=<?= $v ?>"></script>
<script src="/assets/js/i18n.de.js?v=<?= $v ?>"></script>
<script src="/assets/js/i18n.fr.js?v=<?= $v ?>"></script>
<script src="/assets/js/i18n.js?v=<?= $v ?>"></script>
<script src="/assets/js/app.js?v=<?= $v ?>"></script>
<?php }
