-- RDBK.app — events P2 (#6 participation rules per associated roadbook + #122 categories).
-- Each roadbook attached to an event carries its OWN scoring mode, so one event can mix free
-- roadbooks and scored ones. Categories/classes are per-event. Backward-compatible (new column
-- defaults to 'free', new table read by nobody until the code ships). Schema-first — apply to
-- prod BEFORE the code that reads these.
SET NAMES utf8mb4;

ALTER TABLE event_roadbooks
    ADD COLUMN scoring_mode VARCHAR(20) NOT NULL DEFAULT 'free' AFTER sort;

CREATE TABLE IF NOT EXISTS event_categories (
    id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id INT UNSIGNED NOT NULL,
    name     VARCHAR(100) NOT NULL,
    sort     INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_ec_event (event_id),
    CONSTRAINT fk_ec_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
