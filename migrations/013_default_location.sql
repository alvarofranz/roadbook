-- RDBK.app — user's default map location (profile). Used to centre the map when there is no
-- GPS fix yet: opening the Recorder, or starting to edit a route from scratch. NULL = unset.
SET NAMES utf8mb4;

ALTER TABLE users
    ADD COLUMN default_lat DECIMAL(10,7) NULL DEFAULT NULL AFTER voice_lang,
    ADD COLUMN default_lon DECIMAL(10,7) NULL DEFAULT NULL AFTER default_lat;
