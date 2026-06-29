-- RDBK.app — per-user disk quota (#99). A nullable override on the default quota
-- (DEFAULT_QUOTA_BYTES in bootstrap.php, 50 MB): NULL = use the default, a value =
-- a per-user override an admin grants to a trusted user. Backward-compatible — the
-- live code ignores the column until the quota-aware code ships.
SET NAMES utf8mb4;

ALTER TABLE users ADD COLUMN quota_bytes BIGINT NULL AFTER avatar;
