-- RDBK.app — which vehicles a roadbook suits (#713): car, moto, bike, any combination.
--
-- roadbooks.vehicles: chosen by the owner in the Editor's roadbook settings and used by the
--   public gallery's filter. A SET holds any combination of the three; the application never
--   stores it empty. Every existing roadbook starts as a car roadbook, the default.
--
-- Backward-compatible: nothing reads the column until the code ships. Schema-first: apply to
-- prod BEFORE it.
SET NAMES utf8mb4;

ALTER TABLE roadbooks
    ADD COLUMN vehicles SET('car','moto','bike') NOT NULL DEFAULT 'car' AFTER reusable;
