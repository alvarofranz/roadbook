<?php
/* Roadbook trash retention (#187): a roadbook the user deleted is kept in the 'deleted' status
 * for TRASH_DAYS (restorable from the user's and the admin's trash), then hard-deleted here —
 * row + files, through the same purge_expired_trash() the admin's button uses (#703). Runs via
 * the cron round-robin (minute % 10 == 2), a bounded batch per run. */
function purgeTrashedRoadbooks(): array {
    $batch = purge_expired_trash(200);
    if ($batch['deleted']) log_activity(null, 'cron_trash_purge', 'deleted ' . $batch['deleted'] . ': ' . implode(',', $batch['ids']));
    return ['deleted' => $batch['deleted']];
}
