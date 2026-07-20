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
    $st = db()->prepare('SELECT id, first_name, last_name, username, email, email_verified, blocked, is_admin, is_organizer, must_change_password, bio, organization, avatar, quota_bytes, voice_lang, ui_lang, default_lat, default_lon, (password_hash IS NOT NULL) AS has_password FROM users WHERE id = ?');
    $st->execute([$uid]);
    $u = $st->fetch() ?: null;
    if ($u && !empty($u['blocked'])) return null; // blocked user → treat as not logged in (#308 follow-up)
    if ($u) {
        $u['has_password'] = (int)$u['has_password']; // 0 = Google-created account with no password yet (#211)
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

/* ---- participant context (#163) ---- */
function participant_context(): ?array {
    $uid = $_SESSION['uid'] ?? 0;
    if (!$uid || empty($_SESSION['participant_event'])) return null;
    $st = db()->prepare('SELECT 1 FROM event_participants WHERE event_id = ? AND user_id = ?');
    $st->execute([(int)$_SESSION['participant_event'], (int)$uid]);
    if (!$st->fetch()) return null;
    $e = db()->prepare('SELECT slug, title FROM events WHERE id = ?');
    $e->execute([(int)$_SESSION['participant_event']]);
    $row = $e->fetch();
    return $row ? ['event_id' => (int)$_SESSION['participant_event'], 'event_slug' => $row['slug'], 'event_title' => $row['title']] : null;
}
function set_participant_context(int $eventId): void {
    $_SESSION['participant_event'] = $eventId;
}
function clear_participant_context(): void {
    unset($_SESSION['participant_event']);
}

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
    // Collapse internal whitespace so the same club doesn't split into "Club  X" vs "Club X" (#116).
    $organization = mb_substr(trim(preg_replace('/\s+/u', ' ', (string)($d['organization'] ?? ''))), 0, 120);
    // Voice-note speech-to-text language; '' = follow the device. Whitelisted to the UI languages.
    $voice = (string)($d['voice_lang'] ?? '');
    if (!in_array($voice, ['', 'en-US', 'es-ES', 'it-IT'], true)) $voice = '';
    db()->prepare('UPDATE users SET first_name = ?, last_name = ?, bio = ?, organization = ?, voice_lang = ? WHERE id = ?')->execute([$first, $last, $bio, $organization !== '' ? $organization : null, $voice, $user['id']]);
    json_out(['ok' => true]);
}

// Distinct existing organization names, for the profile field + the event organizer-search
// filter (#116): offering the clubs already entered lets people pick the canonical spelling
// instead of retyping it, so the same club stays grouped. Read-only; any signed-in user.
function org_suggest(array $user): void {
    $rows = db()->query("SELECT DISTINCT organization FROM users WHERE organization IS NOT NULL AND organization <> '' ORDER BY organization LIMIT 500")->fetchAll(PDO::FETCH_COLUMN);
    json_out(['ok' => true, 'organizations' => $rows]);
}

// Preferred UI language for a signed-in user, set from the header language switcher so the
// choice follows them across devices. Whitelisted to the UI languages.
function set_lang(array $user, array $d): void {
    $lang = (string)($d['lang'] ?? '');
    if (!in_array($lang, ['en', 'es', 'it', 'de', 'fr'], true)) fail('Unsupported language.');
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
// admin flagged must_change_password sets a new one WITHOUT it (the admin gave a temp one),
// and a Google-created account (no password yet, hash NULL) sets its FIRST one the same way
// (#211). Either way the flag is cleared.
function change_password(array $user, array $d): void {
    $new = (string)($d['new'] ?? '');
    if (strlen($new) < 8) fail('Password must be at least 8 characters.');
    if (empty($user['must_change_password'])) {
        $st = db()->prepare('SELECT password_hash FROM users WHERE id = ?'); $st->execute([$user['id']]);
        $h = $st->fetchColumn();
        if ($h && !password_verify((string)($d['current'] ?? ''), $h)) fail('Current password is wrong.', 403);
    }
    db()->prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $user['id']]);
    log_activity((int)$user['id'], 'password_change');
    json_out(['ok' => true, 'message' => 'Password updated.']);
}

// Self-service account deletion. Password-gated when the account has one; a Google-created
// account (hash NULL) deletes on the signed-in session + the client's explicit confirm alone —
// self-deletion must always be possible (#211). The media locations are collected BEFORE the
// row goes (the cascade wipes the roadbook rows that resolve them), the row is deleted, THEN
// the files — a failed DELETE must never leave a live account whose files are already gone.
// user_roadbook_ids/purge_user_files: admin.php.
function account_delete(array $user, array $d): void {
    $pass = (string)($d['password'] ?? '');
    $st = db()->prepare('SELECT password_hash FROM users WHERE id = ?'); $st->execute([$user['id']]);
    $h = $st->fetchColumn();
    if ($h && !password_verify($pass, $h)) fail('Wrong password.', 403);
    log_activity(null, 'account_delete'); // anonymous marker — the user's own rows cascade away with them
    reassign_roadbooks_to_graveyard((int)$user['id'], (string)$user['username']); // the roadbooks live on (#234)
    $rbIds = user_roadbook_ids((int)$user['id']); // whatever is left (nothing) — collected BEFORE the cascade
    db()->prepare('DELETE FROM users WHERE id = ?')->execute([$user['id']]);
    purge_user_files((int)$user['id'], $rbIds);
    $_SESSION = []; if (session_status() === PHP_SESSION_ACTIVE) session_destroy();
    json_out(['ok' => true]);
}

// Verify a Cloudflare Turnstile token. No-op (passes) if no secret is configured.
function verify_turnstile(?string $token): void {
    global $CFG;
    if (empty($CFG['turnstile_secret'])) return; // not enabled yet
    // The native app shells can't run the domain-locked Turnstile widget in their WebView (their
    // origin is localhost, not rdbk.app), so they never carry a token. They are a trusted origin
    // the browser stamps and a web page can't forge — the same reason they're exempt from the
    // same-origin CSRF guard — and every auth endpoint is IP rate-limited underneath, so exempt
    // them from the challenge instead of locking them out of sign-in entirely.
    if (is_app_origin($_SERVER['HTTP_ORIGIN'] ?? '')) return;
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

function validate_new_account(string $first, string $last, string $username, string $email, string $pass): void {
    if ($first === '' || $last === '') fail('First and last name are required.');
    if (!preg_match('/^[a-zA-Z0-9_.-]{3,40}$/', $username)) fail('Username must be 3–40 chars (letters, numbers, _ . -).');
    if (strcasecmp($username, GRAVEYARD_USERNAME) === 0) fail('That username or email is already in use.'); // reserved for the deleted-user system account
    if (!valid_email($email)) fail('Please enter a valid email.');
    if (strlen($pass) < 8) fail('Password must be at least 8 characters.');
    $st = db()->prepare('SELECT id FROM users WHERE username = ? OR email = ?');
    $st->execute([$username, $email]);
    if ($st->fetch()) fail('That username or email is already in use.');
}

function register_user(array $d): void {
    rate_limit('reg_' . client_ip(), 10, 3600);
    $first = trim((string)($d['first_name'] ?? ''));
    $last  = trim((string)($d['last_name'] ?? ''));
    $username = trim((string)($d['username'] ?? ''));
    $email = strtolower(trim((string)($d['email'] ?? '')));
    $pass  = (string)($d['password'] ?? '');
    validate_new_account($first, $last, $username, $email, $pass);
    if ($pass !== (string)($d['password_confirm'] ?? '')) fail("Passwords don't match.");
    if (empty($d['accept_terms'])) fail('You must accept the Terms of Use to register.');
    verify_turnstile($d['turnstile'] ?? null);

    $raw = new_token();
    // Stamp the consent server-side: NOW() + the authoritative TERMS_VERSION (never the client's).
    db()->prepare('INSERT INTO users (first_name,last_name,username,email,password_hash,verify_token,verify_expires,terms_accepted_at,terms_version) VALUES (?,?,?,?,?,?, DATE_ADD(NOW(), INTERVAL 24 HOUR), NOW(), ?)')
        ->execute([$first, $last, $username, $email, password_hash($pass, PASSWORD_DEFAULT), token_hash($raw), TERMS_VERSION]);
    log_activity((int)db()->lastInsertId(), 'register');

    global $CFG;
    $link = $CFG['base_url'] . '/account/?verify=' . $raw;
    send_mail($email, $first, 'Verify your RDBK.app account',
        mail_html('Confirm your email', '<p>Hi ' . htmlspecialchars($first) . ', welcome to RDBK.app!</p><p>Confirm your email to activate your account:</p>' . mail_button($link, 'Verify my email') . '<p style="font-size:12px;color:#93a0b4">This link expires in 24 hours.</p>'));

    json_out(['ok' => true, 'message' => 'Account created. Check your email to verify it.']);
}

function verify_email(array $d): void {
    $t = (string)($d['token'] ?? '');
    if ($t === '') fail('Missing token.');
    // pending_email set = a change-email token (verify_email_change owns those); consuming it
    // here would burn the token and silently drop the email change (#214)
    $st = db()->prepare('SELECT id FROM users WHERE verify_token = ? AND verify_expires > NOW() AND pending_email IS NULL');
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
    // a Google-created account has no password (hash NULL) → a password login can only fail (#211)
    if (!$u || !$u['password_hash'] || !password_verify($pass, $u['password_hash'])) { log_activity($u ? (int)$u['id'] : null, 'login_failed'); fail('Wrong email/username or password.', 401); }
    if ((int)($u['blocked'] ?? 0)) { log_activity((int)$u['id'], 'login_blocked'); fail('Your account has been blocked — contact the administrator.', 403); }
    if (!(int)$u['email_verified']) fail('Please verify your email first (check your inbox).', 403);
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$u['id'];
    // Force the new session cookie explicitly — session_regenerate_id() may not reliably send the
    // Set-Cookie header over fetch() POST in all PHP versions / browser combinations (#308).
    $https = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    setcookie(session_name(), session_id(), ['expires' => time() + SESSION_LIFETIME, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
    log_activity((int)$u['id'], 'login');
    // A Bearer token only for the native apps (recognised by their trusted Origin): the web uses
    // the session cookie and discards the token, so minting one there would only pile up
    // permanent orphan credentials (#213).
    $token = is_app_origin($_SERVER['HTTP_ORIGIN'] ?? '') ? issue_api_token((int)$u['id']) : null;
    json_out(['ok' => true, 'user' => current_user(), 'token' => $token]);
}

// Google Sign-In (#46). The client posts { credential: <Google ID token> } from the GIS button.
// We verify the token with Google, then: (1) an account already linked by google_sub signs in;
// (2) otherwise a verified-email match links Google to that existing account; (3) otherwise a new
// Google-only account is created (no password) — which requires accepting the Terms, exactly like
// classic registration. Issues a session + a Bearer token (the app path), same as login_user.
function google_auth(array $d): void {
    global $CFG;
    rate_limit('google_' . client_ip(), 30, 900);
    $cred = (string)($d['credential'] ?? '');
    if ($cred === '') fail('Missing Google credential.', 400);
    if (empty($CFG['google_client_ids'])) fail('Google Sign-In is not configured.', 500);

    // Verify with Google's tokeninfo endpoint: it validates the signature, issuer and expiry and
    // returns the claims. (Same curl style as the Turnstile check — no new dependency.)
    $ch = curl_init('https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($cred));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $c = json_decode((string)$body, true);
    if ($code !== 200 || !is_array($c)) fail('Could not verify Google sign-in. Please try again.', 401);

    // Trust the token only if it was minted for one of OUR client IDs, by Google, with a verified email.
    if (!in_array((string)($c['aud'] ?? ''), $CFG['google_client_ids'], true)) fail('This Google sign-in is not for RDBK.', 401);
    if (!in_array((string)($c['iss'] ?? ''), ['accounts.google.com', 'https://accounts.google.com'], true)) fail('Invalid Google token.', 401);
    $sub = (string)($c['sub'] ?? '');
    $email = strtolower(trim((string)($c['email'] ?? '')));
    $verified = ($c['email_verified'] ?? null);
    $verified = ($verified === true || $verified === 'true' || $verified === 1 || $verified === '1');
    if ($sub === '' || !valid_email($email) || !$verified) fail('Your Google account has no verified email.', 401);

    // Resolve the account this Google identity maps to: linked by google_sub, or a verified-email match.
    $st = db()->prepare('SELECT id, blocked FROM users WHERE google_sub = ?'); $st->execute([$sub]);
    $u = $st->fetch(); $linkEmail = false;
    if (!$u) {
        $st = db()->prepare('SELECT id, blocked FROM users WHERE email = ?'); $st->execute([$email]);
        $u = $st->fetch(); $linkEmail = (bool)$u;   // an existing password account with the same (Google-verified) email
    }

    // Phase 1 — PROBE: tell the client who this is and whether the account exists, WITHOUT signing in
    // or creating anything, so it can show a clear "Sign in / Create account as <email>" confirmation.
    if (empty($d['confirm'])) { json_out(['ok' => false, 'probe' => true, 'email' => $email, 'exists' => (bool)$u]); return; }

    // Phase 2 — CONFIRM: sign in (existing; link the email match) or create a passwordless account.
    if ($u) {
        if ($linkEmail) db()->prepare('UPDATE users SET google_sub = ?, email_verified = 1 WHERE id = ?')->execute([$sub, $u['id']]);
    } else {
        if (empty($d['accept_terms'])) { json_out(['ok' => false, 'need_terms' => true, 'email' => $email]); return; }
        $first = mb_substr(trim((string)($c['given_name'] ?? '')), 0, 80) ?: 'RDBK';
        $last  = mb_substr(trim((string)($c['family_name'] ?? '')), 0, 80);
        $username = google_unique_username($email);
        db()->prepare('INSERT INTO users (first_name,last_name,username,email,password_hash,google_sub,email_verified,terms_accepted_at,terms_version) VALUES (?,?,?,?,NULL,?,1,NOW(),?)')
            ->execute([$first, $last, $username, $email, $sub, TERMS_VERSION]);
        $u = ['id' => (int)db()->lastInsertId(), 'blocked' => 0];
        log_activity((int)$u['id'], 'register_google');
    }

    if ((int)($u['blocked'] ?? 0)) { log_activity((int)$u['id'], 'login_blocked'); fail('Your account has been blocked — contact the administrator.', 403); }
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$u['id'];
    // Force the new session cookie explicitly (#308)
    $https = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    setcookie(session_name(), session_id(), ['expires' => time() + SESSION_LIFETIME, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
    log_activity((int)$u['id'], 'login_google');
    // token: app logins only — same rule as the classic login (#213)
    $token = is_app_origin($_SERVER['HTTP_ORIGIN'] ?? '') ? issue_api_token((int)$u['id']) : null;
    json_out(['ok' => true, 'user' => current_user(), 'token' => $token]);
}

// A unique username seeded from the email local-part, sanitised to the register charset
// (letters, numbers, _ . -), 3–40 chars; a numeric suffix breaks any collision.
function google_unique_username(string $email): string {
    $base = strtolower(preg_replace('/[^a-z0-9_.-]/i', '', explode('@', $email)[0]));
    $base = substr($base, 0, 34);
    if (strlen($base) < 3) $base = 'rdbk' . $base;
    $name = $base;
    for ($n = 1; ; $n++) {
        $st = db()->prepare('SELECT 1 FROM users WHERE username = ?'); $st->execute([$name]);
        if (!$st->fetch() && strcasecmp($name, GRAVEYARD_USERNAME) !== 0) return $name; // the graveyard name stays reserved (#234)
        $name = substr($base, 0, 34) . $n;
    }
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
    rate_limit('change_email_' . (int)$user['id'], 3, 3600); // it mails an arbitrary address — cap it like the other mail senders (#212)
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
