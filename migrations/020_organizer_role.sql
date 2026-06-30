-- RDBK.app — events P2.1 (#121): the "organizer" role. A user an admin grants this flag to
-- can create and manage their OWN events; admins manage all. Backward-compatible — defaults to
-- 0 and nothing reads it until the organizer-role code ships. Schema-first: apply to prod first.
SET NAMES utf8mb4;

ALTER TABLE users ADD COLUMN is_organizer TINYINT(1) NOT NULL DEFAULT 0 AFTER is_admin;
