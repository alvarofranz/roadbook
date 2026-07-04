<?php
/* Authentication: register (+ email verification), login, logout, forgot/reset
 * password. Tokens are random and stored hashed (sha256 + app secret pepper).
 * Cloudflare Turnstile guards register/login/forgot when configured. */

// Current Terms of Use version — MUST match <meta name="terms-version"> on /terms/. Recorded
// server-side at registration (authoritative; the client-sent value is never trusted). Bump both
// this and the page's meta/visible date whenever the Terms change (#135).
const TERMS_VERSION = '2026-07-01T15:50Z';

function valid_email(string $e): bool { return filter_var($e, FILTER_VALIDATE_EMAIL) !== false; }
function new_token(): string { return bin2hex(random_bytes(32)); }
function token_hash(string $t): string { global $CFG; return hash('sha256', $t . '|' . $CFG['app_secret']); }

// Bearer API token: the native apps authenticate with this instead of the session
// cookie (which a Capacitor webview can't carry across its origin). The web is unaffected —
// it has a session and never reaches the token path.
function bearer_token(): ?string {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($h === '' && function_exists('apache_request_headers')) {
        $hs = apache_request_headers();
        $h = $hs['Authorization'] ?? $hs['authorization'] ?? '';
    }
    return preg_match('/^Bearer\s+(\S+)$/i', trim((string)$h), $m) ? $m[1] : null;
}
function issue_api_token(int $uid): string {
    $raw = new_token();
    db()->prepare('INSERT INTO api_tokens (token_hash, user_id) VALUES (?, ?)')->execute([token_hash($raw), $uid]);
    return $raw;
}

function current_user(): ?array {
    $uid = !empty($_SESSION['uid']) ? (int)$_SESSION['uid'] : 0;
    if (!$uid && ($tok = bearer_token())) {            // no cookie session → try a Bearer token (native apps)
        $st = db()->prepare('SELECT user_id FROM api_tokens WHERE token_hash = ?');
        $st->execute([token_hash($tok)]);
        if ($row = $st->fetch()) {
            $uid = (int)$row['user_id'];
            db()->prepare('UPDATE api_tokens SET last_used_at = NOW() WHERE token_hash = ?')->execute([token_hash($tok)]);
        }
    }
    if (!$uid) return null;
    $st = db()->prepare('SELECT id, first_name, last_name, username, email, email_verified, is_admin, is_organizer, must_change_password, bio, organization, avatar, quota_bytes, voice_lang, ui_lang, default_lat, default_lon FROM users WHERE id = ?');
    $st->execute([$uid]);
    $u = $st->fetch() ?: null;
    if ($u) {
        $u['is_admin'] = is_admin($u) ? 1 : 0; // effective: the DB flag OR an .env ADMIN_EMAILS match
        $u['is_organizer'] = (int)($u['is_organizer'] ?? 0); // raw grant flag (admins manage events regardless)
        $u['email_verified'] = (int)$u['email_verified'];
        $u['must_change_password'] = (int)$u['must_change_password']; // int, so the JS truthiness check is right
        // Default map location → numbers (or null), never DECIMAL strings, for the client.
        $u['default_lat'] = $u['default_lat'] !== null ? (float)$u['default_lat'] : null;
        $u['default_lon'] = $u['default_lon'] !== null ? (float)$u['default_lon'] : null;
    }
    return $u;
}

function require_user(): array { $u = current_user(); if (!$u) fail('Not signed in.', 401); return $u; }

// A configured .env superuser (ADMIN_EMAILS): the bootstrap admins, who stay admin even if
// "demoted" in the panel and can never be blocked or deleted — the failsafe for the owner.
function is_locked_admin(string $email): bool {
    global $CFG;
    return in_array(strtolower($email), $CFG['admin_emails'], true);
}
// Effective admin = the DB flag, or a configured superuser.
function is_admin(?array $u): bool {
    if (!$u) return false;
    if ((int)($u['is_admin'] ?? 0) === 1) return true;
    return is_locked_admin((string)($u['email'] ?? ''));
}
function require_admin(): array { $u = require_user(); if (!is_admin($u)) fail('Admins only.', 403); return $u; }
// Effective organizer = an admin (manages every event) OR a user granted the organizer flag
// (manages their own events). Used to gate the event-management endpoints (#121).
function is_organizer(?array $u): bool { return is_admin($u) || (int)($u['is_organizer'] ?? 0) === 1; }

function update_profile(array $user, array $d): void {
    $first = mb_substr(trim((string)($d['first_name'] ?? '')), 0, 80);
    $last  = mb_substr(trim((string)($d['last_name'] ?? '')), 0, 80);
    if ($first === '' || $last === '') fail('First and last name are required.');
    $bio = mb_substr(trim((string)($d['bio'] ?? '')), 0, 500);
    $organization = mb_substr(trim((string)($d['organization'] ?? '')), 0, 120);
    // Voice-note speech-to-text language; '' = follow the device. Whitelisted to the UI languages.
    $voice = (string)($d['voice_lang'] ?? '');
    if (!in_array($voice, ['', 'en-US', 'es-ES', 'it-IT'], true)) $voice = '';
    db()->prepare('UPDATE users SET first_name = ?, last_name = ?, bio = ?, organization = ?, voice_lang = ? WHERE id = ?')->execute([$first, $last, $bio, $organization !== '' ? $organization : null, $voice, $user['id']]);
    json_out(['ok' => true]);
}

// Preferred UI language for a signed-in user, set from the header language switcher so the
// choice follows them across devices. Whitelisted to the UI languages.
function set_lang(array $user, array $d): void {
    $lang = (string)($d['lang'] ?? '');
    if (!in_array($lang, ['en', 'es', 'it'], true)) fail('Unsupported language.');
    db()->prepare('UPDATE users SET ui_lang = ? WHERE id = ?')->execute([$lang, $user['id']]);
    json_out(['ok' => true]);
}

// Default map location (its own profile card): a valid lat/lon pair, or NULL to clear it
// (anything missing or out of range clears it). Used to centre the map when there's no GPS
// fix yet — opening the Recorder, or drawing a new route from scratch in the Editor.
function save_location(array $user, array $d): void {
    $lat = $d['default_lat'] ?? null; $lon = $d['default_lon'] ?? null;
    $hasLoc = is_numeric($lat) && is_numeric($lon) && abs((float)$lat) <= 90 && abs((float)$lon) <= 180;
    db()->prepare('UPDATE users SET default_lat = ?, default_lon = ? WHERE id = ?')
        ->execute([$hasLoc ? (float)$lat : null, $hasLoc ? (float)$lon : null, $user['id']]);
    json_out(['ok' => true]);
}

// Change password while signed in. Normally the current password is required; a user the
// admin flagged must_change_password sets a new one WITHOUT it (the admin gave a temp one).
// Either way the flag is cleared.
function change_password(array $user, array $d): void {
    $new = (string)($d['new'] ?? '');
    if (strlen($new) < 8) fail('Password must be at least 8 characters.');
    if (empty($user['must_change_password'])) {
        $st = db()->prepare('SELECT password_hash FROM users WHERE id = ?'); $st->execute([$user['id']]);
        $h = $st->fetchColumn();
        if (!$h || !password_verify((string)($d['current'] ?? ''), $h)) fail('Current password is wrong.', 403);
    }
    db()->prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $user['id']]);
    log_activity((int)$user['id'], 'password_change');
    json_out(['ok' => true, 'message' => 'Password updated.']);
}

// Self-service account deletion (requires the current password). The media locations are
// collected BEFORE the row goes (the cascade wipes the roadbook rows that resolve them), the
// row is deleted, THEN the files — a failed DELETE must never leave a live account whose
// files are already gone. user_roadbook_ids/purge_user_files: admin.php.
function account_delete(array $user, array $d): void {
    $pass = (string)($d['password'] ?? '');
    $st = db()->prepare('SELECT password_hash FROM users WHERE id = ?'); $st->execute([$user['id']]);
    $h = $st->fetchColumn();
    if (!$h || !password_verify($pass, $h)) fail('Wrong password.', 403);
    log_activity(null, 'account_delete'); // anonymous marker — the user's own rows cascade away with them
    $rbIds = user_roadbook_ids((int)$user['id']);
    db()->prepare('DELETE FROM users WHERE id = ?')->execute([$user['id']]);
    purge_user_files((int)$user['id'], $rbIds);
    $_SESSION = []; if (session_status() === PHP_SESSION_ACTIVE) session_destroy();
    json_out(['ok' => true]);
}

// Verify a Cloudflare Turnstile token. No-op (passes) if no secret is configured.
function verify_turnstile(?string $token): void {
    global $CFG;
    if (empty($CFG['turnstile_secret'])) return; // not enabled yet
    if (!$token) fail('Please complete the challenge.', 400);
    $ch = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query(['secret' => $CFG['turnstile_secret'], 'response' => $token, 'remoteip' => client_ip()]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 12,
    ]);
    $res = json_decode((string)curl_exec($ch), true);
    curl_close($ch);
    if (empty($res['success'])) fail('Challenge failed. Please try again.', 403);
}

function register_user(array $d): void {
    rate_limit('reg_' . client_ip(), 10, 3600);
    $first = trim((string)($d['first_name'] ?? ''));
    $last  = trim((string)($d['last_name'] ?? ''));
    $username = trim((string)($d['username'] ?? ''));
    $email = strtolower(trim((string)($d['email'] ?? '')));
    $pass  = (string)($d['password'] ?? '');
    if ($first === '' || $last === '') fail('First and last name are required.');
    if (!preg_match('/^[a-zA-Z0-9_.-]{3,40}$/', $username)) fail('Username must be 3–40 chars (letters, numbers, _ . -).');
    if (!valid_email($email)) fail('Please enter a valid email.');
    if (strlen($pass) < 8) fail('Password must be at least 8 characters.');
    if ($pass !== (string)($d['password_confirm'] ?? '')) fail("Passwords don't match.");
    if (empty($d['accept_terms'])) fail('You must accept the Terms of Use to register.');
    verify_turnstile($d['turnstile'] ?? null);

    $st = db()->prepare('SELECT id FROM users WHERE username = ? OR email = ?');
    $st->execute([$username, $email]);
    if ($st->fetch()) fail('That username or email is already in use.');

    $raw = new_token();
    // Stamp the consent server-side: NOW() + the authoritative TERMS_VERSION (never the client's).
    db()->prepare('INSERT INTO users (first_name,last_name,username,email,password_hash,verify_token,verify_expires,terms_accepted_at,terms_version) VALUES (?,?,?,?,?,?, DATE_ADD(NOW(), INTERVAL 24 HOUR), NOW(), ?)')
        ->execute([$first, $last, $username, $email, password_hash($pass, PASSWORD_DEFAULT), token_hash($raw), TERMS_VERSION]);
    log_activity((int)db()->lastInsertId(), 'register');

    global $CFG;
    $link = $CFG['base_url'] . '/account/?verify=' . $raw;
    send_mail($email, $first, 'Verify your RDBK.app account',
        mail_html('Confirm your email', "<p>Hi {$first}, welcome to RDBK.app!</p><p>Confirm your email to activate your account:</p>" . mail_button($link, 'Verify my email') . '<p style="font-size:12px;color:#93a0b4">This link expires in 24 hours.</p>'));

    json_out(['ok' => true, 'message' => 'Account created. Check your email to verify it.']);
}

function verify_email(array $d): void {
    $t = (string)($d['token'] ?? '');
    if ($t === '') fail('Missing token.');
    $st = db()->prepare('SELECT id FROM users WHERE verify_token = ? AND verify_expires > NOW()');
    $st->execute([token_hash($t)]);
    $u = $st->fetch();
    if (!$u) fail('That verification link is invalid or has expired.');
    db()->prepare('UPDATE users SET email_verified = 1, verify_token = NULL, verify_expires = NULL WHERE id = ?')->execute([$u['id']]);
    log_activity((int)$u['id'], 'verify_email');
    json_out(['ok' => true, 'message' => 'Email verified — you can sign in now.']);
}

function login_user(array $d): void {
    rate_limit('login_' . client_ip(), 20, 900);
    $id = strtolower(trim((string)($d['email'] ?? '')));
    $pass = (string)($d['password'] ?? '');
    verify_turnstile($d['turnstile'] ?? null);
    $st = db()->prepare('SELECT id, password_hash, blocked, email_verified FROM users WHERE email = ? OR username = ?');
    $st->execute([$id, $id]);
    $u = $st->fetch();
    if (!$u || !password_verify($pass, $u['password_hash'])) { log_activity($u ? (int)$u['id'] : null, 'login_failed'); fail('Wrong email/username or password.', 401); }
    if ((int)($u['blocked'] ?? 0)) { log_activity((int)$u['id'], 'login_blocked'); fail('Your account has been blocked — contact the administrator.', 403); }
    if (!(int)$u['email_verified']) fail('Please verify your email first (check your inbox).', 403);
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$u['id'];
    log_activity((int)$u['id'], 'login');
    // Also hand back a Bearer token for the native apps (the browser ignores it and uses the cookie).
    json_out(['ok' => true, 'user' => current_user(), 'token' => issue_api_token((int)$u['id'])]);
}

function logout_user(): void {
    $uid = !empty($_SESSION['uid']) ? (int)$_SESSION['uid'] : null;
    if ($tok = bearer_token()) db()->prepare('DELETE FROM api_tokens WHERE token_hash = ?')->execute([token_hash($tok)]);
    log_activity($uid, 'logout');
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) session_destroy();
    json_out(['ok' => true]);
}

function forgot_password(array $d): void {
    rate_limit('forgot_' . client_ip(), 8, 900);
    $email = strtolower(trim((string)($d['email'] ?? '')));
    verify_turnstile($d['turnstile'] ?? null);
    $st = db()->prepare('SELECT id, first_name FROM users WHERE email = ?');
    $st->execute([$email]);
    if ($u = $st->fetch()) {
        $raw = new_token();
        db()->prepare('UPDATE users SET reset_token = ?, reset_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?')->execute([token_hash($raw), $u['id']]);
        global $CFG;
        $link = $CFG['base_url'] . '/account/?reset=' . $raw;
        send_mail($email, $u['first_name'], 'Reset your RDBK.app password',
            mail_html('Reset your password', '<p>We received a request to reset your password.</p>' . mail_button($link, 'Set a new password') . "<p style=\"font-size:12px;color:#93a0b4\">Expires in 1 hour. If you didn't request it, ignore this email.</p>"));
    }
    // Always succeed — don't reveal whether an email exists.
    json_out(['ok' => true, 'message' => 'If that email is registered, a reset link is on its way.']);
}

function reset_password(array $d): void {
    $t = (string)($d['token'] ?? '');
    $pass = (string)($d['password'] ?? '');
    if (strlen($pass) < 8) fail('Password must be at least 8 characters.');
    $st = db()->prepare('SELECT id FROM users WHERE reset_token = ? AND reset_expires > NOW()');
    $st->execute([token_hash($t)]);
    $u = $st->fetch();
    if (!$u) fail('That reset link is invalid or has expired.');
    db()->prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?')->execute([password_hash($pass, PASSWORD_DEFAULT), $u['id']]);
    log_activity((int)$u['id'], 'password_reset');
    json_out(['ok' => true, 'message' => 'Password updated — you can sign in now.']);
}

// Change the account email, re-verifying ownership of the new address: the new email is
// stored as pending_email and a confirmation link is sent to it; the address only switches
// once that link is opened (verify_email_change). The current email stays active until then.
// The confirmation link reuses verify_token/verify_expires (free on a verified account).
function change_email(array $user, array $d): void {
    $email = strtolower(trim((string)($d['email'] ?? '')));
    if (!valid_email($email)) fail('Please enter a valid email.');
    if ($email === strtolower((string)$user['email'])) fail('That is already your email.');
    $st = db()->prepare('SELECT id FROM users WHERE (email = ? OR pending_email = ?) AND id <> ?');
    $st->execute([$email, $email, $user['id']]);
    if ($st->fetch()) fail('That email is already in use.');
    $raw = new_token();
    db()->prepare('UPDATE users SET pending_email = ?, verify_token = ?, verify_expires = DATE_ADD(NOW(), INTERVAL 24 HOUR) WHERE id = ?')
        ->execute([$email, token_hash($raw), $user['id']]);
    global $CFG;
    $link = $CFG['base_url'] . '/account/?verifyemail=' . $raw;
    send_mail($email, $user['first_name'], 'Confirm your new RDBK.app email',
        mail_html('Confirm your new email', '<p>Confirm this address to use it for your RDBK.app account:</p>' . mail_button($link, 'Confirm new email') . '<p style="font-size:12px;color:#93a0b4">This link expires in 24 hours. Your current email stays active until you confirm.</p>'));
    json_out(['ok' => true, 'message' => 'Check your new inbox to confirm the change.']);
}

// Open the confirmation link from change_email: switch email → pending_email. Token-based
// (no session needed, like reset). Guards against the address being taken in the meantime.
function verify_email_change(array $d): void {
    $t = (string)($d['token'] ?? '');
    if ($t === '') fail('Missing token.');
    $st = db()->prepare('SELECT id, pending_email FROM users WHERE verify_token = ? AND verify_expires > NOW() AND pending_email IS NOT NULL');
    $st->execute([token_hash($t)]);
    $u = $st->fetch();
    if (!$u) fail('That confirmation link is invalid or has expired.');
    $chk = db()->prepare('SELECT id FROM users WHERE email = ? AND id <> ?');
    $chk->execute([$u['pending_email'], $u['id']]);
    if ($chk->fetch()) fail('That email is now in use by another account.');
    db()->prepare('UPDATE users SET email = ?, pending_email = NULL, email_verified = 1, verify_token = NULL, verify_expires = NULL WHERE id = ?')
        ->execute([$u['pending_email'], $u['id']]);
    json_out(['ok' => true, 'message' => 'Email updated.']);
}
