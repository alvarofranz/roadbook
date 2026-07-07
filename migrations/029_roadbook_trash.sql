-- RDBK.app — roadbook trash / soft-delete (#187). Deleting a roadbook no longer removes it: it
-- moves to a `deleted` status. A deleted roadbook drops out of every user-facing view (the public
-- listings already filter status='public'); only an admin trash page lists it, can restore it
-- (→ draft) or purge it now. The cron hard-deletes rows + files 30 days after deletion —
-- `updated_at` is the deletion time, since a deleted row is never updated again.
--
-- Backward-compatible: this only widens the enum; nothing produces 'deleted' until the code ships.
-- Schema-first: apply to prod BEFORE the code that sets/reads the 'deleted' status.
SET NAMES utf8mb4;

ALTER TABLE roadbooks
    MODIFY COLUMN status ENUM('draft','ready','public','deleted') NOT NULL DEFAULT 'draft';
