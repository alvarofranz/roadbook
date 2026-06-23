-- RDBK.app — pending email change awaiting confirmation. When a user changes their
-- account email we store the new address here and email a confirmation link to it;
-- the address only switches once that link is opened (the current email stays active
-- until then). The confirmation link reuses verify_token/verify_expires, free for an
-- already-verified account.
SET NAMES utf8mb4;

ALTER TABLE users
    ADD COLUMN pending_email VARCHAR(190) NULL DEFAULT NULL AFTER email;
