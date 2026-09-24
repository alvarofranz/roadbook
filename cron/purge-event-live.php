<?php
/* Purge live positions (#947): an event's live positions go a day after it ends, and none is ever
 * kept longer than 3 days — live means now, and the organizers' map needs nothing older. */
function purgeEventLive(): array {
    $st = db()->query("DELETE l FROM event_live l JOIN events e ON e.id = l.event_id
        WHERE (e.ends_on IS NOT NULL AND e.ends_on < CURDATE() - INTERVAL 1 DAY) OR l.updated_at < NOW() - INTERVAL 3 DAY");
    return ['deleted' => $st->rowCount()];
}
