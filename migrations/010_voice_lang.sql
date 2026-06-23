-- RDBK.app — user preference: speech-to-text language for the Recorder's voice notes.
SET NAMES utf8mb4;

ALTER TABLE users
    ADD COLUMN voice_lang VARCHAR(16) NOT NULL DEFAULT '' AFTER bio;
