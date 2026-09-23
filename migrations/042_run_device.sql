-- RDBK.app — the device a run was made on (#870).
--
-- roadbook_runs.device: a coarse model / OS string ("iPhone 15 · iOS 17.5", "Safari · iOS 17"),
--   internal data shown to admins only, public run or private — diagnostics, never an identifier.
--
-- Backward-compatible: nothing reads it until the code ships. Schema-first: apply to prod BEFORE it.
ALTER TABLE roadbook_runs ADD COLUMN device VARCHAR(80) NULL AFTER mode;
