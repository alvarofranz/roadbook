-- RDBK.app — events (#6, P1): the event entity + its roadbook associations. An event is
-- organised by a user, has a date window and a public presentation page, and gathers one or
-- more roadbooks. Later phases add roles/categories, participants/join codes, co-editing and
-- scoring. Backward-compatible — nothing reads these tables until the events code ships.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS events (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    organizer_id INT UNSIGNED NOT NULL,
    slug         VARCHAR(80)  NOT NULL,
    title        VARCHAR(200) NOT NULL,
    description  TEXT         NULL,
    starts_on    DATE         NULL,
    ends_on      DATE         NULL,
    is_public    TINYINT(1)   NOT NULL DEFAULT 0,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_event_slug (slug),
    KEY idx_organizer (organizer_id),
    CONSTRAINT fk_event_org FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_roadbooks (
    event_id    INT UNSIGNED NOT NULL,
    roadbook_id INT UNSIGNED NOT NULL,
    sort        INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (event_id, roadbook_id),
    KEY idx_er_rb (roadbook_id),
    CONSTRAINT fk_er_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_er_rb FOREIGN KEY (roadbook_id) REFERENCES roadbooks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
