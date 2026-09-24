-- RDBK.app — live tracking for event organizers (#947).
--
-- event_live: the LAST known position of a participant navigating one of the event's roadbooks —
--   one row per participant per event, overwritten by every ping, never a history. Written only
--   while the participant runs an event roadbook in the Reader and agreed to share it at the start
--   of that run; read only by the event's organizers (and admins). `stopped_at` marks the run's
--   end. Rows go away with the event (cron: a day after it ends, and never older than 3 days).
--
-- Backward-compatible: nothing reads it until the code ships. Schema-first: apply to prod BEFORE it.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS event_live (
    event_id    INT UNSIGNED      NOT NULL,
    user_id     INT UNSIGNED      NOT NULL,
    roadbook_id INT UNSIGNED      NOT NULL,
    team        VARCHAR(8)        NULL,
    lat         DECIMAL(9,6)      NOT NULL,
    lon         DECIMAL(9,6)      NOT NULL,
    acc         SMALLINT UNSIGNED NULL,
    speed       SMALLINT UNSIGNED NULL,
    heading     SMALLINT UNSIGNED NULL,
    note_idx    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    notes_total SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    reached     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    skipped     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at  DATETIME          NOT NULL,
    stopped_at  DATETIME          NULL,
    PRIMARY KEY (event_id, user_id),
    KEY idx_live_updated (updated_at),
    CONSTRAINT fk_live_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_live_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
    CONSTRAINT fk_live_rb    FOREIGN KEY (roadbook_id) REFERENCES roadbooks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
