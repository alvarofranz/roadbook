<?php
/* Roadbook trash retention (#187): a roadbook the user deleted is kept in the 'deleted' status
 * for TRASH_DAYS (recoverable from the admin trash page), then hard-deleted here — row + files.
 * A deleted row is never updated again, so its `updated_at` is when it was trashed. Runs via the
 * cron round-robin (minute % 10 == 2), a bounded batch per run. */
function purgeTrashedRoadbooks(): array {
    $rows = db()->query("SELECT id, user_id, filename FROM roadbooks
        WHERE status = 'deleted' AND updated_at < (NOW() - INTERVAL " . TRASH_DAYS . " DAY) LIMIT 200")->fetchAll();
    $deleted = 0;
    foreach ($rows as $r) {
        db()->prepare('DELETE FROM roadbooks WHERE id = ?')->execute([(int)$r['id']]); // cascades to photo/audio rows
        purge_roadbook_files((int)$r['id'], (int)$r['user_id'], (string)$r['filename']);
        $deleted++;
    }
    return ['deleted' => $deleted];
}
