-- RDBK.app — admin/superuser flag for user management.
SET NAMES utf8mb4;
ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER email_verified;
