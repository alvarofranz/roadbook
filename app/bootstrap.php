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
    'photos_dir'       => $ROOT . '/public/photos',   // public photos (web: /photos/)
];

require __DIR__ . '/db.php';
require __DIR__ . '/mail.php';
require __DIR__ . '/auth.php';
require __DIR__ . '/roadbooks.php';
require __DIR__ . '/admin.php';

// Long-lived, SLIDING session — feels like a native app: stays signed in and
// the window extends on every use (in the browser and the installed PWA alike).
const SESSION_LIFETIME = 60 * 24 * 3600; // 60 days
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

// Light rate limit via APCu (no-op if the extension isn't loaded).
function rate_limit(string $key, int $max, int $window): void {
    if (!function_exists('apcu_inc')) return;
    $n = apcu_inc('rl_' . sha1($key), 1, $ok, $window);
    if ($n > $max) fail('Too many attempts. Please wait a moment.', 429);
}
function client_ip(): string { return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'; }
