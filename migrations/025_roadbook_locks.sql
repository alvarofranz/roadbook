-- RDBK.app — events P3 (#154): soft edit lock for co-edited roadbooks. One lock per roadbook
-- (PK): the Editor acquires it on open, heartbeats refreshed_at while editing and releases it
-- on leave; a lock without a heartbeat for 10 minutes is stale and free to take. rb_save
-- refuses while someone else holds a fresh lock. Backward-compatible — nothing reads this
-- until the #154 code ships.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS roadbook_locks (
    roadbook_id  INT UNSIGNED NOT NULL,
    user_id      INT UNSIGNED NOT NULL,
    acquired_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    refreshed_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (roadbook_id),
    KEY idx_lock_user (user_id),
    CONSTRAINT fk_lock_rb   FOREIGN KEY (roadbook_id) REFERENCES roadbooks(id) ON DELETE CASCADE,
    CONSTRAINT fk_lock_user FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
