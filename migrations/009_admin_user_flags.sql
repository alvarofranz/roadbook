-- RDBK.app — admin user-management flags: force a password change at next login,
-- and block an account (login refused with a message).
SET NAMES utf8mb4;
ALTER TABLE users
    ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER is_admin,
    ADD COLUMN blocked              TINYINT(1) NOT NULL DEFAULT 0 AFTER must_change_password;
