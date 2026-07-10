-- RDBK.app — drop schema nothing reads anymore. Code-first (the reverse of the
-- additive golden rule): all code stopped using both long ago, so the drop ships last.
-- · event_categories: categories moved onto individual roadbooks (roadbooks.category,
--   030 / #248); the per-event table is read and written by nobody.
-- · roadbooks.is_public: superseded by roadbooks.status (015 / #96) — this is the
--   follow-up drop that 015 announced.
SET NAMES utf8mb4;

DROP TABLE IF EXISTS event_categories;

ALTER TABLE roadbooks DROP COLUMN is_public;
