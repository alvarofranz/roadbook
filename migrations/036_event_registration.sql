-- RDBK.app — independent registration gate + organizer activation (#414).
-- Registration used to collapse two questions into `open_join`: HOW you get in (code vs
-- open) and WHETHER an organizer must activate you. These two columns split them:
-- `join_gate` (closed|code|open) + `require_activation` (0|1). `join_code` then carries
-- only the code itself. `open_join` stays until no code reads it (dropped in a later
-- migration). Schema-first: apply to prod BEFORE the code that reads these columns.
SET NAMES utf8mb4;

ALTER TABLE events
    ADD COLUMN join_gate ENUM('closed','code','open') NOT NULL DEFAULT 'code' AFTER open_join,
    ADD COLUMN require_activation TINYINT(1) NOT NULL DEFAULT 1 AFTER join_gate;

UPDATE events SET join_gate = 'open', require_activation = 0 WHERE open_join = 1;
UPDATE events SET join_gate = 'code', require_activation = 1 WHERE open_join = 0 AND join_code IS NOT NULL;
UPDATE events SET join_gate = 'closed', require_activation = 1 WHERE open_join = 0 AND join_code IS NULL;
