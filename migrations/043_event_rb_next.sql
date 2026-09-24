-- RDBK.app — chained event roadbooks (#944).
--
-- event_rb_next: what an event roadbook offers when its last note is reached — the organizer's
--   chain. A participant finishing `roadbook_id` picks one of its `next_roadbook_id`s (or ends the
--   run there) and carries on in the same run; each roadbook stays independent and is scored on its
--   own. Both ends must be roadbooks attached to the event, so detaching one drops its links too.
--   `label` is the short name the choice shows ("A", "B", "Facile", "Difficile"…): one free text
--   the organizer writes, the same in every language; empty = the roadbook's title.
--
-- Backward-compatible: nothing reads it until the code ships. Schema-first: apply to prod BEFORE it.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS event_rb_next (
    event_id         INT UNSIGNED NOT NULL,
    roadbook_id      INT UNSIGNED NOT NULL,
    next_roadbook_id INT UNSIGNED NOT NULL,
    label            VARCHAR(40)  NULL,
    sort             INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (event_id, roadbook_id, next_roadbook_id),
    KEY idx_ern_next (event_id, next_roadbook_id),
    CONSTRAINT fk_ern_from FOREIGN KEY (event_id, roadbook_id)      REFERENCES event_roadbooks(event_id, roadbook_id) ON DELETE CASCADE,
    CONSTRAINT fk_ern_to   FOREIGN KEY (event_id, next_roadbook_id) REFERENCES event_roadbooks(event_id, roadbook_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
