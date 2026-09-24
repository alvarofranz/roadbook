<?php
/* Purge old notifications (#971): a read one is kept 90 days, then goes; an unread one a year. */
function purgeNotifications(): array {
    $st = db()->query("DELETE FROM notifications WHERE (read_at IS NOT NULL AND read_at < NOW() - INTERVAL 90 DAY) OR created_at < NOW() - INTERVAL 365 DAY LIMIT 5000");
    return ['deleted' => $st->rowCount()];
}
