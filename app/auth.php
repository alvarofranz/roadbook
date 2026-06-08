<?php
/* Authentication: register (+ email verification), login, logout, forgot/reset
 * password. Tokens are random and stored hashed (sha256 + app secret pepper).
 * Cloudflare Turnstile guards register/login/forgot when configured. */

function valid_email(string $e): bool { return filter_var($e, FILTER_VALIDATE_EMAIL) !== false; }
function new_token(): string { return bin2hex(random_bytes(32)); }
function token_hash(string $t): string { global $CFG; return hash('sha256', $t . '|' . $CFG['app_secret']); }

function current_user(): ?array {
    if (empty($_SESSION['uid'])) return null;
    $st = db()->prepare('SELECT id, first_name, last_name, username, email, email_verified, bio, avatar FROM users WHERE id = ?');
    $st->execute([$_SESSION['uid']]);
    return $st->fetch() ?: null;
}

function require_user(): array { $u = current_user(); if (!$u) fail('Not signed in.', 401); return $u; }

function update_profile(array $user, array $d): void {
    $bio = substr(trim((string)($d['bio'] ?? '')), 0, 500);
    db()->prepare('UPDATE users SET bio = ? WHERE id = ?')->execute([$bio, $user['id']]);
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
    verify_turnstile($d['turnstile'] ?? null);

    $st = db()->prepare('SELECT id FROM users WHERE username = ? OR email = ?');
    $st->execute([$username, $email]);
    if ($st->fetch()) fail('That username or email is already in use.');

    $raw = new_token();
    db()->prepare('INSERT INTO users (first_name,last_name,username,email,password_hash,verify_token,verify_expires) VALUES (?,?,?,?,?,?, DATE_ADD(NOW(), INTERVAL 24 HOUR))')
        ->execute([$first, $last, $username, $email, password_hash($pass, PASSWORD_DEFAULT), token_hash($raw)]);

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
    json_out(['ok' => true, 'message' => 'Email verified — you can sign in now.']);
}

function login_user(array $d): void {
    rate_limit('login_' . client_ip(), 20, 900);
    $id = strtolower(trim((string)($d['email'] ?? '')));
    $pass = (string)($d['password'] ?? '');
    verify_turnstile($d['turnstile'] ?? null);
    $st = db()->prepare('SELECT * FROM users WHERE email = ? OR username = ?');
    $st->execute([$id, $id]);
    $u = $st->fetch();
    if (!$u || !password_verify($pass, $u['password_hash'])) fail('Wrong email/username or password.', 401);
    if (!(int)$u['email_verified']) fail('Please verify your email first (check your inbox).', 403);
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$u['id'];
    json_out(['ok' => true, 'user' => ['username' => $u['username'], 'email' => $u['email'], 'first_name' => $u['first_name']]]);
}

function logout_user(): void { $_SESSION = []; session_destroy(); json_out(['ok' => true]); }

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
    json_out(['ok' => true, 'message' => 'Password updated — you can sign in now.']);
}
