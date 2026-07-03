-- RDBK.app — per-event logo (#151): the organizer uploads an image, re-compressed server-side
-- to AVIF and stored as /event-logos/<event_id>.avif; this column holds the web path
-- (avatar-style). Backward-compatible — nothing reads it until the #151 code ships.
SET NAMES utf8mb4;

ALTER TABLE events
    ADD COLUMN logo VARCHAR(100) NULL DEFAULT NULL AFTER is_public;
