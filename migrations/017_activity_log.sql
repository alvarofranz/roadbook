-- RDBK.app — user activity logging (#86), for security / abuse review. GDPR-conscious:
-- the IP is stored ANONYMISED (last octet dropped), rows auto-purge after 90 days (cron),
-- and CASCADE-delete with the user so account deletion erases their log. Backward-
-- compatible: the live code writes nothing here until the logging code ships.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS activity_log (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    INT UNSIGNED    NULL,
    action     VARCHAR(40)     NOT NULL,
    detail     VARCHAR(255)    NULL,
    ip         VARCHAR(45)     NULL,                              -- anonymised, e.g. 203.0.113.0
    created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_user (user_id),
    KEY idx_created (created_at),
    CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
