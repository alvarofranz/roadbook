-- RDBK.app — Google Sign-In (#46). Adds the Google subject id (`sub`) for accounts linked to a
-- Google identity, and makes password_hash NULLABLE so a Google-only account can exist without a
-- password (P3 later lets such users also set one for classic login). Backward-compatible:
-- nothing reads google_sub and no existing account has a NULL hash until the Google-auth code
-- ships. UNIQUE on a nullable column still allows the many existing NULLs. Schema-first: apply to
-- prod BEFORE the code that reads google_sub.
SET NAMES utf8mb4;

ALTER TABLE users
    MODIFY COLUMN password_hash VARCHAR(255) NULL,
    ADD COLUMN google_sub VARCHAR(255) NULL AFTER password_hash,
    ADD UNIQUE KEY uq_google_sub (google_sub);
