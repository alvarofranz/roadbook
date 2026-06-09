<?php
/* RDBK.app cron — round-robin runner: executes ONE task per minute, picked by
 * minute % N, so tasks never overlap. Schedule it once a minute via cron:
 *   * * * * * php <repo>/cron/cron.php >> <repo>/cron/cron.log 2>&1
 */
if (php_sapi_name() !== 'cli') { die("CLI only\n"); }
require_once dirname(__DIR__) . '/app/bootstrap.php';

$task = (int)date('i') % 10;
echo '[' . date('Y-m-d H:i:s') . "] task {$task}\n";

try {
    switch ($task) {
        case 0:
            require_once __DIR__ . '/cleanup-drafts.php';
            $r = cleanupDrafts();
            echo "cleanup-drafts: deleted {$r['deleted']}\n";
            // keep the log bounded (last 500 lines)
            $log = __DIR__ . '/cron.log';
            if (is_file($log) && count($l = file($log)) > 1000) file_put_contents($log, implode('', array_slice($l, -500)));
            break;
        // 1..9 reserved for future tasks
    }
} catch (Throwable $e) {
    echo 'ERROR: ' . $e->getMessage() . "\n";
}
