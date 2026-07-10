-- RDBK.app — event organiser website + headquarters location (#249)
SET NAMES utf8mb4;

ALTER TABLE events
    ADD COLUMN organizer_website VARCHAR(500) NULL DEFAULT NULL AFTER description,
    ADD COLUMN hq_lat DOUBLE NULL DEFAULT NULL AFTER organizer_website,
    ADD COLUMN hq_lon DOUBLE NULL DEFAULT NULL AFTER hq_lat;
