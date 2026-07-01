-- RDBK.app — Terms of Use consent (#135). Record WHEN a user accepted the Terms of Use and
-- WHICH version, captured at registration. Backward-compatible: columns are nullable and nothing
-- reads them until the consent code ships. Schema-first — apply to prod BEFORE that code deploys.
SET NAMES utf8mb4;

ALTER TABLE users
    ADD COLUMN terms_accepted_at TIMESTAMP   NULL DEFAULT NULL AFTER email_verified,
    ADD COLUMN terms_version     VARCHAR(40)  NULL DEFAULT NULL AFTER terms_accepted_at;
