-- RDBK.app — the signed-in user's preferred UI language (en|es|it). NULL = follow the
-- browser / the per-device localStorage choice. Distinct from voice_lang (speech-to-text).
SET NAMES utf8mb4;

ALTER TABLE users
    ADD COLUMN ui_lang VARCHAR(5) NULL DEFAULT NULL AFTER voice_lang;
