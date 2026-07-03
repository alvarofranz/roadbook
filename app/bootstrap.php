<?php
declare(strict_types=1);

$ROOT = dirname(__DIR__);                       // repo root
require $ROOT . '/vendor/autoload.php';
Dotenv\Dotenv::createImmutable($ROOT)->safeLoad();

$CFG = [
    'db' => [
        'host' => $_ENV['DB_HOST'] ?? '127.0.0.1',
        'name' => $_ENV['DB_NAME'] ?? 'rdbk',
        'user' => $_ENV['DB_USER'] ?? 'rdbk',
        'pass' => $_ENV['DB_PASS'] ?? '',
    ],
    'sendgrid_key'   => $_ENV['SENDGRID_KEY'] ?? '',
    'mail_from'      => $_ENV['MAIL_FROM'] ?? 'info@rdbk.app',
    'mail_from_name' => $_ENV['MAIL_FROM_NAME'] ?? 'RDBK.app',
    'base_url'         => rtrim($_ENV['BASE_URL'] ?? 'https://rdbk.app', '/'),
    'app_secret'       => $_ENV['APP_SECRET'] ?? '',
    'turnstile_site'   => $_ENV['TURNSTILE_SITE_KEY'] ?? '',
    'turnstile_secret' => $_ENV['TURNSTILE_SECRET'] ?? '',
    'admin_emails'     => array_values(array_filter(array_map('trim', explode(',', strtolower($_ENV['ADMIN_EMAILS'] ?? ''))))),
    'storage'          => $ROOT . '/storage/users',   // per-user private storage (volume-backed)
    'avatars_dir'      => $ROOT . '/public/avatars',  // public avatars (web: /avatars/)
    'event_logos_dir'  => $ROOT . '/public/event-logos', // public event logos (web: /event-logos/)
    'photos_dir'       => $ROOT . '/public/photos',   // public photos (web: /photos/)
    'audio_dir'        => $ROOT . '/public/audio',    // public voice notes (web: /audio/)
];

require __DIR__ . '/db.php';
require __DIR__ . '/mail.php';
require __DIR__ . '/auth.php';
require __DIR__ . '/roadbooks.php';
require __DIR__ . '/admin.php';
require __DIR__ . '/settings.php';
require __DIR__ . '/events.php';

// Long-lived, SLIDING session — feels like a native app: stays signed in and
// the window extends on every use (in the browser and the installed PWA alike).
const SESSION_LIFETIME = 60 * 24 * 3600; // 60 days
// Per-user disk quota (#99): the default cap on a user's stored content (their .rdbk files +
// photos). A user's `quota_bytes` column overrides it (NULL = use this default). Images are
// AVIF-compressed on upload, so 50 MB holds hundreds of photos.
const DEFAULT_QUOTA_BYTES = 50 * 1024 * 1024;
if (PHP_SAPI !== 'cli' && session_status() !== PHP_SESSION_ACTIVE) {
    // Secure cookie on real HTTPS only. Behind a TLS-terminating router (ddev locally,
    // the proxy in production) the internal hop to PHP is plain HTTP, so trust
    // X-Forwarded-Proto: this keeps the cookie Secure in production (https) while letting
    // it work on a local http ddev URL — otherwise the session is dropped over http.
    $https = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    @ini_set('session.gc_maxlifetime', (string)SESSION_LIFETIME);
    session_set_cookie_params(['lifetime' => SESSION_LIFETIME, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
    session_name('rdbksid');
    session_start();
    if (!empty($_SESSION['uid'])) { // refresh the cookie expiry on each request
        setcookie(session_name(), session_id(), ['expires' => time() + SESSION_LIFETIME, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
    }
}

function json_out($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}
function json_in(): array { $d = json_decode(file_get_contents('php://input'), true); return is_array($d) ? $d : []; }
function fail(string $msg, int $code = 400): void { json_out(['ok' => false, 'error' => $msg], $code); }

// Light rate limit via APCu (no-op if the extension isn't loaded). On the first hit of a
// window we record when it ends, so a blocked response can tell the client how long to wait
// (retry_after, seconds) — the login form turns that into a countdown.
function rate_limit(string $key, int $max, int $window): void {
    if (!function_exists('apcu_inc')) return;
    $k = 'rl_' . sha1($key);
    $n = apcu_inc($k, 1, $ok, $window);
    if ($n === 1) apcu_store($k . '_exp', time() + $window, $window);
    if ($n > $max) {
        $exp = (int) apcu_fetch($k . '_exp');
        $retry = $exp ? max(1, $exp - time()) : $window;
        json_out(['ok' => false, 'error' => 'Too many attempts. Please wait a moment.', 'retry_after' => $retry], 429);
    }
}
function client_ip(): string { return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'; }

// Anonymise an IP before logging (GDPR, #86): drop the last octet of an IPv4 address, or all
// but the first three groups of an IPv6 one, so a logged address can't single out a person.
function anon_ip(string $ip): string {
    if (strpos($ip, '.') !== false) return preg_replace('/\.\d+$/', '.0', $ip);
    if (strpos($ip, ':') !== false) return implode(':', array_slice(explode(':', $ip), 0, 3)) . '::';
    return $ip;
}

// The client IP for logging: behind the production proxy the real client is the first entry of
// X-Forwarded-For (REMOTE_ADDR is the proxy). Used ONLY for anonymised logging, never for a
// security decision, so trusting the proxy header here is fine — and rate-limiting keeps using
// the un-proxied client_ip(), so anonymisation here doesn't widen its buckets.
function logged_ip(): string {
    $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if ($xff !== '') { $first = trim(explode(',', $xff)[0]); if ($first !== '') return $first; }
    return client_ip();
}

// Record a security/activity event (#86). The IP is anonymised; rows auto-purge after 90 days
// and CASCADE-delete with the user. Best-effort: logging must never break the actual request.
function log_activity(?int $userId, string $action, ?string $detail = null): void {
    try {
        db()->prepare('INSERT INTO activity_log (user_id, action, detail, ip) VALUES (?,?,?,?)')
            ->execute([$userId, substr($action, 0, 40), $detail !== null ? substr($detail, 0, 255) : null, anon_ip(logged_ip())]);
    } catch (\Throwable $e) { /* never let logging fail the request */ }
}
