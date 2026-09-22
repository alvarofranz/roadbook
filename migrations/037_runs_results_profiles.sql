-- RDBK.app — run reports, the shared event ranking and profile visibility (#617–#620 · #590 · #580).
--
-- roadbook_runs: one row per navigated run — the report the Reader shows at the end (notes
--   reached/skipped, speed-limit zones, distance, time, competition penalties + signed result). A
--   run of a local .rdbk file has no roadbook_id; a run keeps its title so it survives the roadbook.
--   is_public decides whether it shows on the runner's public profile (/u/<username>).
-- event_results: the classification of one scored event roadbook, shared by every organizer device
--   (it lived in each device's localStorage). An entry comes from a competition run of a signed-in
--   participant (run_id) or from a result QR scanned at the desk; the signed payload is unique per
--   roadbook, so scanning the same QR twice cannot rank a vehicle twice.
-- users.runs_visibility: what to do with a new report — ask each time, or always public/private.
-- api_tokens.participant_event_id: participant mode for the native app, which authenticates with a
--   Bearer token and has no PHP session to keep it in.
--
-- Backward-compatible: nothing reads these until the code ships. Schema-first: apply to prod BEFORE it.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS roadbook_runs (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id          INT UNSIGNED NOT NULL,
    roadbook_id      INT UNSIGNED NULL,
    event_id         INT UNSIGNED NULL,
    roadbook_title   VARCHAR(200) NOT NULL,
    mode             ENUM('trip','competition') NOT NULL DEFAULT 'trip',
    team             VARCHAR(8)   NULL,
    completed        TINYINT(1)   NOT NULL DEFAULT 0,
    started_at       DATETIME     NULL,
    ended_at         DATETIME     NULL,
    duration_s       INT UNSIGNED NULL,
    distance_m       INT UNSIGNED NOT NULL DEFAULT 0,
    notes_total      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    notes_reached    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    skipped          VARCHAR(1000) NULL,
    speed_zones      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    speed_exceeded   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    max_over_kmh     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    penalties        VARCHAR(255) NULL,
    result_meta      VARCHAR(255) NULL,
    is_public        TINYINT(1)   NOT NULL DEFAULT 0,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_runs_user (user_id, created_at),
    KEY idx_runs_roadbook (roadbook_id),
    KEY idx_runs_event (event_id),
    CONSTRAINT fk_runs_user     FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE,
    CONSTRAINT fk_runs_roadbook FOREIGN KEY (roadbook_id) REFERENCES roadbooks(id) ON DELETE SET NULL,
    CONSTRAINT fk_runs_event    FOREIGN KEY (event_id)    REFERENCES events(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_results (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id     INT UNSIGNED NOT NULL,
    roadbook_id  INT UNSIGNED NOT NULL,
    team         VARCHAR(8)   NOT NULL,
    meta         VARCHAR(255) NOT NULL,
    valid        TINYINT(1)   NULL,
    run_id       INT UNSIGNED NULL,
    added_by     INT UNSIGNED NULL,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_result (event_id, roadbook_id, meta),
    KEY idx_results_rb (event_id, roadbook_id),
    CONSTRAINT fk_results_event    FOREIGN KEY (event_id)    REFERENCES events(id)         ON DELETE CASCADE,
    CONSTRAINT fk_results_roadbook FOREIGN KEY (roadbook_id) REFERENCES roadbooks(id)      ON DELETE CASCADE,
    CONSTRAINT fk_results_run      FOREIGN KEY (run_id)      REFERENCES roadbook_runs(id)  ON DELETE SET NULL,
    CONSTRAINT fk_results_user     FOREIGN KEY (added_by)    REFERENCES users(id)          ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
    ADD COLUMN runs_visibility ENUM('ask','public','private') NOT NULL DEFAULT 'ask' AFTER ui_lang;

ALTER TABLE api_tokens
    ADD COLUMN participant_event_id INT UNSIGNED NULL AFTER user_id,
    ADD CONSTRAINT fk_api_tokens_event FOREIGN KEY (participant_event_id) REFERENCES events(id) ON DELETE SET NULL;
