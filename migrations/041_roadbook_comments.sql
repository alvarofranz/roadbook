-- RDBK.app — public comments on a public roadbook (#809).
--
-- roadbook_comments: what signed-in readers write under a public roadbook on its page
--   (/challenge/<slug>) — never shown while navigating it. A comment goes with its roadbook and with
--   its author's account. Posting is guarded by Turnstile + a rate limit; the author, the roadbook's
--   owner and an admin may delete one.
--
-- Backward-compatible: nothing reads it until the code ships. Schema-first: apply to prod BEFORE it.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS roadbook_comments (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    roadbook_id INT UNSIGNED NOT NULL,
    user_id     INT UNSIGNED NOT NULL,
    body        TEXT         NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_comments_roadbook (roadbook_id, created_at),
    CONSTRAINT fk_comments_roadbook FOREIGN KEY (roadbook_id) REFERENCES roadbooks(id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_user     FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
