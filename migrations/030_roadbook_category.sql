-- RDBK.app — roadbook category (#248): a free-text category on each roadbook,
-- replacing the per-event category system. Categories move from events to individual
-- roadbooks, so the same roadbook carries its category across events.
SET NAMES utf8mb4;

ALTER TABLE roadbooks
    ADD COLUMN category VARCHAR(100) NULL DEFAULT NULL AFTER title;
