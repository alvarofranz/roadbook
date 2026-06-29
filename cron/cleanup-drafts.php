<?php
/* Delete abandoned recording drafts: a roadbook is created when recording starts
 * (so photos can attach to it live); if the user never finishes it keeps
 * note_count = 0. Purge such private drafts older than 2 days, with their photos. */
function cleanupDrafts(): array {
    global $CFG;
    $rows = db()->query("SELECT id, user_id, filename FROM roadbooks WHERE note_count = 0 AND status = 'draft' AND created_at < (NOW() - INTERVAL 2 DAY) LIMIT 500")->fetchAll();
    $deleted = 0;
    foreach ($rows as $r) {
        $ph = db()->prepare('SELECT filename FROM roadbook_photos WHERE roadbook_id = ?');
        $ph->execute([$r['id']]);
        foreach ($ph->fetchAll() as $p) @unlink($CFG['photos_dir'] . '/' . $r['id'] . '/' . $p['filename']);
        @rmdir($CFG['photos_dir'] . '/' . $r['id']);
        if (!empty($r['filename']) && $r['filename'] !== 'pending') @unlink($CFG['storage'] . '/' . $r['user_id'] . '/' . $r['filename']);
        db()->prepare('DELETE FROM roadbooks WHERE id = ?')->execute([$r['id']]); // cascades to photo rows
        $deleted++;
    }
    return ['deleted' => $deleted];
}
