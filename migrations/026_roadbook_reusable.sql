-- RDBK.app — #106: a public roadbook can opt into being "reusable" — copyable into another
-- user's profile via the Editor's "Start from a public RB" search. Default 0 = NOT reusable:
-- public roadbooks stay readable/navigable (Reader, gallery, /challenge) but cannot be forked.
-- Backward-compatible (new column, read by nobody until the code ships). Schema-first — apply
-- to prod BEFORE the code that reads it.
SET NAMES utf8mb4;

ALTER TABLE roadbooks
    ADD COLUMN reusable TINYINT(1) NOT NULL DEFAULT 0 AFTER status;
