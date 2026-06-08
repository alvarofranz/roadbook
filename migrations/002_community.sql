-- RDBK.app — community: profiles + public/private roadbooks with slugs.
SET NAMES utf8mb4;

ALTER TABLE users
    ADD COLUMN bio    VARCHAR(500) NULL AFTER email,
    ADD COLUMN avatar VARCHAR(255) NULL AFTER bio;

ALTER TABLE roadbooks
    ADD COLUMN is_public TINYINT(1)  NOT NULL DEFAULT 0 AFTER note_count,
    ADD COLUMN slug      VARCHAR(80)  NULL AFTER is_public,
    ADD UNIQUE KEY uq_slug (slug);
