-- RDBK.app — geolocated photos (capture position on the map).
SET NAMES utf8mb4;
ALTER TABLE roadbook_photos
    ADD COLUMN lat DECIMAL(10,7) NULL AFTER filename,
    ADD COLUMN lon DECIMAL(10,7) NULL AFTER lat;
