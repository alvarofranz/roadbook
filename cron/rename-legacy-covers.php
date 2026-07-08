<?php
/* Rename legacy route-map covers (#206): covers used to live under the fixed name
 * '_map.avif', which made every private roadbook's route map enumerable at
 * /photos/<id>/_map.avif. New covers get a random filename; this sweep renames the
 * existing ones (file + row) so old roadbooks are protected too. Self-emptying:
 * once no '_map.avif' rows remain it is a single no-op SELECT per run. */
function renameLegacyCovers(): array {
    global $CFG;
    $rows = db()->query("SELECT id, roadbook_id FROM roadbook_photos WHERE filename = '_map.avif' LIMIT 500")->fetchAll();
    $renamed = 0;
    foreach ($rows as $r) {
        $fn = bin2hex(random_bytes(8)) . '.avif';
        $dir = $CFG['photos_dir'] . '/' . $r['roadbook_id'];
        if (is_file($dir . '/_map.avif')) @rename($dir . '/_map.avif', $dir . '/' . $fn);
        db()->prepare('UPDATE roadbook_photos SET filename = ? WHERE id = ?')->execute([$fn, (int)$r['id']]);
        $renamed++;
    }
    return ['renamed' => $renamed];
}
