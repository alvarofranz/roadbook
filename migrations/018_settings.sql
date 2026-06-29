-- RDBK.app — site settings store (#103): a generic key/value table for site-wide
-- config (the home-page message banner today; future global toggles/flags tomorrow).
-- Backward-compatible — nothing reads it until the admin-config code ships.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
    k VARCHAR(64) NOT NULL,
    v TEXT NULL,
    PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
