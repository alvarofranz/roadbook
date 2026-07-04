-- RDBK.app — audit P4 (#171): composite indexes for the hot listing queries, replacing the
-- single-column indexes they supersede (the composite's leftmost column serves the old
-- lookups, and FK index requirements stay satisfied by the new leading columns).
-- Index-only, backward-compatible. Schema-first — apply to prod BEFORE the code merge.
SET NAMES utf8mb4;

-- public gallery/home: WHERE status='public' ORDER BY updated_at DESC (public_list,
-- admin_public_roadbooks) · per-user lists: WHERE user_id=? ORDER BY updated_at DESC
-- (rb_list, admin_user_roadbooks) — both filesorted until now
ALTER TABLE roadbooks
    DROP KEY idx_status,
    DROP KEY idx_user,
    ADD KEY idx_status_updated (status, updated_at),
    ADD KEY idx_user_updated (user_id, updated_at);

-- the listing thumbnail subquery: WHERE roadbook_id=? ORDER BY sort, id LIMIT 1 — runs once
-- per listed roadbook (up to 60×/page), each filesorting until now
ALTER TABLE roadbook_photos
    DROP KEY idx_rb,
    ADD KEY idx_rb_sort (roadbook_id, sort, id);

-- roster pagination: WHERE event_id=? ORDER BY created_at (event_participants_list) — an
-- event's roster can run into the hundreds
ALTER TABLE event_participants
    ADD KEY idx_ep_event_joined (event_id, created_at);

-- the admin activity timeline: WHERE user_id=? ORDER BY id DESC LIMIT 50
ALTER TABLE activity_log
    DROP KEY idx_user,
    ADD KEY idx_user_timeline (user_id, id);
