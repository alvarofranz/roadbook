-- RDBK.app — roadbook photo galleries (AVIF on the volume).
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS roadbook_photos (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    roadbook_id INT UNSIGNED NOT NULL,
    filename    VARCHAR(64)  NOT NULL,
    sort        INT          NOT NULL DEFAULT 0,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ph_rb FOREIGN KEY (roadbook_id) REFERENCES roadbooks(id) ON DELETE CASCADE,
    KEY idx_rb (roadbook_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
