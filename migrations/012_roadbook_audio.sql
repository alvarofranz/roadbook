-- RDBK.app — per-waypoint voice notes: the recorded audio kept alongside the
-- speech-to-text transcription, so a wrong transcription can be played back and
-- re-checked. App feature, server-side only (like roadbook_photos) — never
-- embedded in the portable .rdbk. Geolocated like photos so the Editor can tie
-- each clip to the note at that position.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS roadbook_audio (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    roadbook_id INT UNSIGNED NOT NULL,
    filename    VARCHAR(64)   NOT NULL,
    lat         DECIMAL(10,7) NULL,
    lon         DECIMAL(10,7) NULL,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_au_rb FOREIGN KEY (roadbook_id) REFERENCES roadbooks(id) ON DELETE CASCADE,
    KEY idx_au_rb (roadbook_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
