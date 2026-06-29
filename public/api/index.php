<?php
require dirname(__DIR__, 2) . '/app/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$d = $method === 'POST' ? json_in() : $_GET;
$action = (string)($d['action'] ?? '');

// Only these read-only actions may use GET; everything that changes state needs POST
// (blocks CSRF via top-level GET navigation with a Lax session cookie).
$readOnly = ['config', 'public_list', 'public_get'];
if ($method !== 'POST' && !in_array($action, $readOnly, true)) fail('POST required.', 405);
// Same-origin guard for state-changing requests.
if ($method === 'POST') {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== ($_SERVER['HTTP_HOST'] ?? '')) fail('Bad origin.', 403);
}

try {
    switch ($action) {
        case 'config':    json_out(['ok' => true, 'turnstile' => $CFG['turnstile_site'], 'user' => current_user()]); break;
        case 'register':  register_user($d); break;
        case 'verify':    verify_email($d); break;
        case 'login':     login_user($d); break;
        case 'logout':    logout_user(); break;
        case 'forgot':    forgot_password($d); break;
        case 'reset':     reset_password($d); break;
        case 'profile':   update_profile(require_user(), $d); break;
        case 'save_location': save_location(require_user(), $d); break;
        case 'set_lang':  set_lang(require_user(), $d); break;
        case 'change_password': change_password(require_user(), $d); break;
        case 'change_email':        change_email(require_user(), $d); break;
        case 'verify_email_change': verify_email_change($d); break;
        case 'account_delete':  account_delete(require_user(), $d); break;
        case 'admin_users':     admin_users(require_admin()); break;
        case 'admin_set_role':  admin_set_role(require_admin(), $d); break;
        case 'admin_verify':    admin_verify(require_admin(), $d); break;
        case 'admin_block':     admin_block(require_admin(), $d); break;
        case 'admin_update':    admin_update_user(require_admin(), $d); break;
        case 'admin_delete':    admin_delete_user(require_admin(), $d); break;
        case 'admin_roadbooks': admin_public_roadbooks(require_admin()); break;
        case 'admin_unpublish': admin_unpublish(require_admin(), $d); break;
        case 'rb_list':   rb_list(require_user()); break;
        case 'rb_get':    rb_get(require_user(), $d); break;
        case 'rb_draft':  rb_draft(require_user()); break;
        case 'rb_save':   rb_save(require_user(), $d); break;
        case 'rb_status': rb_status(require_user(), $d); break;
        case 'rb_duplicate': rb_duplicate(require_user(), $d); break;
        case 'rb_delete': rb_delete(require_user(), $d); break;
        case 'ph_list':     ph_list(current_user(), $d); break;
        case 'ph_delete':   ph_delete(require_user(), $d); break;
        case 'ph_move':     ph_move(require_user(), $d); break;
        case 'audio_list':   audio_list(current_user(), $d); break;
        case 'audio_delete': audio_delete(require_user(), $d); break;
        case 'public_list': public_list(); break;
        case 'public_get':  public_get($d); break;
        default:            fail('Unknown action.', 404);
    }
} catch (Throwable $e) {
    error_log('API error: ' . $e->getMessage());
    fail('Server error.', 500);
}
