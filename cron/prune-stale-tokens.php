<?php
/* Prune stale Bearer tokens (#213): a token unused for 180 days is dead weight — the app
 * re-logs in seamlessly if its token ever gets pruned. This also ages out the orphan rows
 * that web logins used to mint (they never carry a last_used_at). */
function pruneStaleTokens(): array {
    $st = db()->query("DELETE FROM api_tokens WHERE COALESCE(last_used_at, created_at) < (NOW() - INTERVAL 180 DAY)");
    return ['deleted' => $st->rowCount()];
}
