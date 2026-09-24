-- RDBK.app — in-app notifications (#971) and the live-tracking consent per event (#970).
--
-- notifications: what happened for a user while they were elsewhere — one row per recipient and
--   event, shown behind the badge on their account icon on the web and in the app alike. Read state
--   lives here, on the server, so reading one anywhere clears it everywhere. `kind` names what it is
--   (the first: 'comment', a comment on one of your roadbooks); `subject_id` is the thing it is about
--   (the comment), so a notification goes when its subject goes; `actor_id` who did it; `data` the
--   few words the list shows (JSON), written once. Read rows are purged by cron after 90 days.
--
-- event_participants.live_consent: the participant's answer, asked once per event, to sharing their
--   live position with the organizers while they navigate one of its roadbooks (#947 · #970):
--   NULL = not asked yet · 1 = yes · 0 = no.
--
-- Backward-compatible: nothing reads them until the code ships. Schema-first: apply to prod BEFORE it.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    INT UNSIGNED NOT NULL,
    kind       VARCHAR(32)  NOT NULL,
    subject_id INT UNSIGNED NULL,
    actor_id   INT UNSIGNED NULL,
    data       TEXT         NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at    DATETIME     NULL,
    PRIMARY KEY (id),
    KEY idx_notif_user (user_id, read_at, id),
    KEY idx_notif_subject (kind, subject_id),
    CONSTRAINT fk_notif_user  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_notif_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS live_consent TINYINT(1) NULL DEFAULT NULL;
