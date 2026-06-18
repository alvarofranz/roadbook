-- RDBK.app — API tokens for Bearer auth (the native apps; the web keeps the session cookie).
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS api_tokens (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    token_hash    CHAR(64)     NOT NULL,        -- sha256(raw token + app secret); the raw token lives only on the device
    user_id       INT UNSIGNED NOT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at  DATETIME     NULL,
    UNIQUE KEY uq_token (token_hash),
    KEY idx_user (user_id),
    CONSTRAINT fk_api_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
