-- RDBK.app — seed a pre-verified reviewer / test account (Google Play review + internal testing).
-- It bypasses email verification (email_verified = 1) so it works immediately. This is a normal
-- unprivileged user (it can only do what any signed-in user can). The password is shared with the
-- team out of band — only the bcrypt hash lives here. Re-running resets the password (upsert).
SET NAMES utf8mb4;

INSERT INTO users (first_name, last_name, username, email, password_hash, email_verified)
VALUES ('RDBK', 'Reviewer', 'reviewer', 'reviewer@rdbk.app',
        '$2y$12$z72SOgjohZX9HfPajpDEOeyO3KRMiruV9T4SXhi/n5laRYBZYP1UC', 1)
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), email_verified = 1;
