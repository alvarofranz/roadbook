-- RDBK.app — drop events.open_join (#732). Registration is `join_gate` + `require_activation`
-- since migration 036, which moved every event over; no code reads or writes open_join any more
-- (shipped first, per the schema rule: code before the drop).
ALTER TABLE events DROP COLUMN open_join;
