-- RDBK.app — Sign in with Apple (#370). Adds the Apple subject id (`sub`) for accounts linked to an
-- Apple identity, the exact counterpart of google_sub (028). App Store guideline 4.8 requires it
-- next to Google Sign-In: a third-party login must come with a login option that lets the user keep
-- their email private, which only Sign in with Apple's relay address gives. password_hash is
-- already NULLABLE (028), so an Apple-only account needs no password. Backward-compatible: nothing
-- reads apple_sub until the Apple-auth code ships, and UNIQUE on a nullable column still allows the
-- many existing NULLs. Schema-first: apply to prod BEFORE that code.
SET NAMES utf8mb4;

ALTER TABLE users
    ADD COLUMN apple_sub VARCHAR(255) NULL AFTER google_sub,
    ADD UNIQUE KEY uq_apple_sub (apple_sub);
