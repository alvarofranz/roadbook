-- RDBK.app — events P2.3 (#123): participants + join-by-code, and per-event co-organizers
-- for the event management page. An event keeps its owner (events.organizer_id); the
-- event_organizers rows grant additional users management rights on that one event (they can
-- edit the event and its roadbook associations). Participants join with the organizer-shared
-- join_code. Backward-compatible — nothing reads these until the #123 code ships.
SET NAMES utf8mb4;

-- Free-text organization/club on the user profile: filters the organizer search on the event
-- management page (defaulting to the searcher's own); groundwork for #116 (Organizations/Clubs).
ALTER TABLE users
    ADD COLUMN organization VARCHAR(120) NULL DEFAULT NULL AFTER bio;

ALTER TABLE events
    ADD COLUMN join_code VARCHAR(16) NULL DEFAULT NULL AFTER is_public,
    ADD UNIQUE KEY uq_event_join_code (join_code);

CREATE TABLE IF NOT EXISTS event_organizers (
    event_id   INT UNSIGNED NOT NULL,
    user_id    INT UNSIGNED NOT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, user_id),
    KEY idx_eo_user (user_id),
    CONSTRAINT fk_eo_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_eo_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_participants (
    event_id   INT UNSIGNED NOT NULL,
    user_id    INT UNSIGNED NOT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, user_id),
    KEY idx_ep_user (user_id),
    CONSTRAINT fk_ep_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_ep_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Every event owner is also listed among their event's organizers.
INSERT IGNORE INTO event_organizers (event_id, user_id) SELECT id, organizer_id FROM events;
