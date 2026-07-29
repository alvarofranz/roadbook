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
    // Google Sign-In (#46): comma-separated OAuth client IDs, WEB first then Android. Every id is
    // an accepted `aud` when verifying a Google ID token; the first (web) drives the GIS button.
    'google_client_ids' => array_values(array_filter(array_map('trim', explode(',', $_ENV['GOOGLE_CLIENT_IDS'] ?? '')))),
    // Sign in with Apple (#370): the web Services ID (it also drives the Apple JS button) and the
    // iOS bundle id. An Apple identity token's `aud` is whichever of the two minted it, so both are
    // accepted; each is optional — configure only the surfaces that are set up.
    'apple_service_id'  => trim($_ENV['APPLE_SERVICE_ID'] ?? ''),
    'apple_client_ids'  => array_values(array_filter([trim($_ENV['APPLE_SERVICE_ID'] ?? ''), trim($_ENV['APPLE_APP_ID'] ?? '')])),
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
    $https = request_is_https();
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

// Light rate limit. APCu is the fast path; where it isn't loaded a file-based counter keeps the
// limit enforced regardless — login/register/forgot/reset/join must never silently become
// unlimited. On the first hit of a window we record when it ends, so a blocked response can tell
// the client how long to wait (retry_after, seconds) — the login form turns that into a countdown.
function rate_limit(string $key, int $max, int $window): void {
    [$n, $exp] = function_exists('apcu_inc') ? rate_hit_apcu($key, $window) : rate_hit_file($key, $window);
    if ($n > $max) {
        $retry = $exp ? max(1, $exp - time()) : $window;
        json_out(['ok' => false, 'error' => 'Too many attempts. Please wait a moment.', 'retry_after' => $retry], 429);
    }
}
// APCu counter: an atomic per-window increment plus a paired _exp key holding the window's end.
// Returns [hits-this-window, window-end-epoch].
function rate_hit_apcu(string $key, int $window): array {
    $k = 'rl_' . sha1($key);
    $n = apcu_inc($k, 1, $ok, $window);
    if ($n === 1) apcu_store($k . '_exp', time() + $window, $window);
    return [(int)$n, (int)apcu_fetch($k . '_exp')];
}
// File counter (APCu absent): one small file per key under the temp dir holding "windowEnd count";
// flock serialises concurrent hits and an elapsed window resets it. Fails open (never blocks a
// legitimate request) if the file can't be opened. Returns [hits-this-window, window-end-epoch].
function rate_hit_file(string $key, int $window): array {
    $now = time();
    $fh = @fopen(sys_get_temp_dir() . '/rdbk_rl_' . sha1($key), 'c+');
    if (!$fh) return [1, $now + $window];
    flock($fh, LOCK_EX);
    $raw = trim((string)stream_get_contents($fh));
    [$exp, $count] = $raw !== '' ? array_map('intval', explode(' ', $raw) + [0, 0]) : [0, 0];
    if ($exp <= $now) { $exp = $now + $window; $count = 0; } // window elapsed → start a fresh one
    $count++;
    ftruncate($fh, 0); rewind($fh); fwrite($fh, $exp . ' ' . $count);
    flock($fh, LOCK_UN); fclose($fh);
    return [$count, $exp];
}
function client_ip(): string { return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'; }

// True when the request reached the user over HTTPS — directly, or via the production proxy whose
// internal hop to PHP is plain HTTP (so trust X-Forwarded-Proto). Drives the Secure cookie flag:
// Secure in production (https) but off on the plain-http dev clone, which would otherwise drop the
// cookie. Used by the session cookie and the participant-mode cookie (public/go/index.php).
function request_is_https(): bool {
    return (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

// The native app shells (Capacitor) serve their bundled UI from a WebView-local origin, so their
// API calls reach us cross-origin. These are the only non-web origins we trust: a real website
// cannot forge them (the browser sets Origin and script can't override it), so they are safe to
// exempt from the same-origin CSRF guard — and every state-changing action still requires a Bearer
// token. The web is unaffected: it is same-origin and never presents one of these.
const APP_ORIGINS = ['http://localhost', 'https://localhost', 'capacitor://localhost', 'ionic://localhost'];
function is_app_origin(string $origin): bool { return $origin !== '' && in_array($origin, APP_ORIGINS, true); }

// CORS for the native app: let a trusted app origin call the API/uploads (Bearer-authenticated,
// never cookies) and answer its preflight. A no-op for same-origin web requests (no Origin match).
function cors_for_app(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (is_app_origin($origin)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type');
        header('Access-Control-Max-Age: 86400');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
}

// Same-origin guard for state-changing requests (the POST API + uploads): a cross-site page can
// fire the request, but the browser stamps its Origin — refuse when it names another host. A
// missing Origin (some same-origin requests) and the trusted app shells (Bearer-authed) pass.
function require_same_origin(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '' || is_app_origin($origin)) return;
    if (parse_url($origin, PHP_URL_HOST) !== ($_SERVER['HTTP_HOST'] ?? '')) fail('Bad origin.', 403);
}

// A URL slug unique within a table (roadbooks · events): the slugified title, then -2, -3, …
// The table name is whitelisted — it is interpolated into the query.
function unique_slug(string $table, string $title, string $fallback, int $excludeId): string {
    if (!in_array($table, ['roadbooks', 'events'], true)) fail('Server error.', 500);
    $base = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($title)), '-');
    $base = substr($base ?: $fallback, 0, 60);
    $slug = $base; $n = 1;
    while (true) {
        $st = db()->prepare("SELECT id FROM $table WHERE slug = ? AND id <> ?");
        $st->execute([$slug, $excludeId]);
        if (!$st->fetch()) return $slug;
        $slug = $base . '-' . (++$n);
    }
}

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
