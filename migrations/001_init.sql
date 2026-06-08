-- RDBK.app — initial schema (accounts + per-user roadbooks).
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    first_name      VARCHAR(80)  NOT NULL,
    last_name       VARCHAR(80)  NOT NULL,
    username        VARCHAR(40)  NOT NULL,
    email           VARCHAR(190) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    email_verified  TINYINT(1)   NOT NULL DEFAULT 0,
    verify_token    CHAR(64)     NULL,        -- sha256(raw token); raw is emailed
    verify_expires  DATETIME     NULL,
    reset_token     CHAR(64)     NULL,        -- sha256(raw token)
    reset_expires   DATETIME     NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_username (username),
    UNIQUE KEY uq_email (email),
    KEY idx_verify (verify_token),
    KEY idx_reset (reset_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roadbooks (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id      INT UNSIGNED NOT NULL,
    title        VARCHAR(200) NOT NULL DEFAULT 'Untitled',
    km_total     DECIMAL(8,2) NOT NULL DEFAULT 0,
    note_count   INT          NOT NULL DEFAULT 0,
    filename     VARCHAR(64)  NOT NULL,       -- <uuid>.rdbk on the volume, per user
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rb_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
