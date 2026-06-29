-- RDBK.app — roadbook publication lifecycle (#96): replace the binary `is_public`
-- flag with a draft → ready → public status (in lavorazione → pronto → pubblicato).
-- `public` is the only state a non-owner can see; `draft`/`ready` are private.
--
-- Schema-first: this migration KEEPS `is_public` so the currently-live code keeps
-- working until the new code deploys. Apply it to prod first, then ship the code that
-- reads `status`; a follow-up migration drops `is_public` once nothing reads it.
SET NAMES utf8mb4;

ALTER TABLE roadbooks
    ADD COLUMN status ENUM('draft','ready','public') NOT NULL DEFAULT 'draft' AFTER note_count,
    ADD KEY idx_status (status);

-- Backfill from the existing flag: published → public, everything else → draft.
UPDATE roadbooks SET status = 'public' WHERE is_public = 1;
