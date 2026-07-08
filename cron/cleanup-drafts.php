<?php
/* Delete abandoned recording drafts: a roadbook is created when recording starts
 * (so photos/voice notes can attach to it live); if the user never finishes it keeps
 * note_count = 0. Purge such private drafts older than 2 days with ALL their files —
 * .rdbk + photo + audio folders — via the shared purge_roadbook_files() (#210). */
function cleanupDrafts(): array {
    $rows = db()->query("SELECT id, user_id, filename FROM roadbooks WHERE note_count = 0 AND status = 'draft' AND created_at < (NOW() - INTERVAL 2 DAY) LIMIT 500")->fetchAll();
    $deleted = 0;
    foreach ($rows as $r) {
        purge_roadbook_files((int)$r['id'], (int)$r['user_id'], (string)$r['filename']);
        db()->prepare('DELETE FROM roadbooks WHERE id = ?')->execute([$r['id']]); // cascades to the photo/audio rows
        $deleted++;
    }
    return ['deleted' => $deleted];
}
