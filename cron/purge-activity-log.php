<?php
/* Activity-log retention (#86) — GDPR: keep security/activity events for 90 days, then
 * delete them. Runs via the cron round-robin (minute % 10 == 1), a bounded batch per run. */
function purgeActivityLog(): array {
    $st = db()->prepare('DELETE FROM activity_log WHERE created_at < (NOW() - INTERVAL 90 DAY) LIMIT 5000');
    $st->execute();
    return ['deleted' => $st->rowCount()];
}
