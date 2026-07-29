<?php
require dirname(__DIR__, 2) . '/app/bootstrap.php';
cors_for_app(); // native app shells call cross-origin (Bearer auth) — set CORS headers + answer preflight

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$d = $method === 'POST' ? json_in() : $_GET;
$action = (string)($d['action'] ?? '');

// Only these read-only actions may use GET; everything that changes state needs POST
// (blocks CSRF via top-level GET navigation with a Lax session cookie).
$readOnly = ['config', 'public_list', 'public_get', 'events_list', 'event_get'];
if ($method !== 'POST' && !in_array($action, $readOnly, true)) fail('POST required.', 405);
if ($method === 'POST') require_same_origin(); // state-changing requests must come from our own pages

try {
    switch ($action) {
        case 'config':
            $u = current_user();
            // a plain user who co-organizes an event still needs the Events entry point (#123)
            if ($u && !is_admin($u) && empty($u['is_organizer'])) $u['manages_events'] = user_manages_events((int)$u['id']) ? 1 : 0;
            json_out(['ok' => true, 'turnstile' => $CFG['turnstile_site'], 'google_client' => $CFG['google_client_ids'][0] ?? '', 'apple_client' => $CFG['apple_service_id'], 'user' => $u, 'participant' => participant_context(), 'banner' => site_banner()]);
            break;
        case 'register':  register_user($d); break;
        case 'verify':    verify_email($d); break;
        case 'login':     login_user($d); break;
        case 'google_auth': google_auth($d); break;
        case 'apple_auth':  apple_auth($d); break;
        case 'logout':    logout_user(); break;
        case 'forgot':    forgot_password($d); break;
        case 'reset':     reset_password($d); break;
        case 'profile':   update_profile(require_user(), $d); break;
        case 'org_suggest': org_suggest(require_user()); break;
        case 'save_location': save_location(require_user(), $d); break;
        case 'set_lang':  set_lang(require_user(), $d); break;
        case 'change_password': change_password(require_user(), $d); break;
        case 'change_email':        change_email(require_user(), $d); break;
        case 'verify_email_change': verify_email_change($d); break;
        case 'account_delete':  account_delete(require_user(), $d); break;
        case 'admin_users':     admin_users(require_admin(), $d); break;
        case 'admin_set_role':  admin_set_role(require_admin(), $d); break;
        case 'admin_verify':    admin_verify(require_admin(), $d); break;
        case 'admin_block':     admin_block(require_admin(), $d); break;
        case 'admin_update':    admin_update_user(require_admin(), $d); break;
        case 'admin_create':    admin_create_user(require_admin(), $d); break;
        case 'admin_delete':    admin_delete_user(require_admin(), $d); break;
        case 'admin_activity':  admin_activity(require_admin(), $d); break;
        case 'admin_settings':  admin_settings(require_admin()); break;
        case 'admin_save_settings': admin_save_settings(require_admin(), $d); break;
        case 'admin_logs':      admin_logs(require_admin()); break;
        case 'admin_activity_log': admin_activity_log(require_admin(), $d); break;
        // Event management (#123): the list/edit rights are per event (owner / co-organizer /
        // admin — checked inside), so these only need a signed-in user; creating an event
        // still requires the organizer role (checked in event_save).
        case 'events_manage':   events_manage(require_user()); break;
        case 'event_manage_get': event_manage_get(require_user(), $d); break;
        case 'event_save':      event_save(require_user(), $d); break;
        case 'event_delete':    event_delete(require_user(), $d); break;
        case 'event_rb_add':    event_rb_add(require_user(), $d); break;
        case 'event_rb_remove': event_rb_remove(require_user(), $d); break;
        case 'event_rb_mode':   event_rb_mode(require_user(), $d); break;
        case 'user_search':     user_search(require_user(), $d); break;
        case 'event_org_add':   event_org_add(require_user(), $d); break;
        case 'event_org_remove': event_org_remove(require_user(), $d); break;
        case 'event_join_code': event_join_code(require_user(), $d); break;
        case 'event_join':      event_join(require_user(), $d); break;
        case 'event_leave':     event_leave(require_user(), $d); break;
        case 'event_participant_remove': event_participant_remove(require_user(), $d); break;
        case 'event_participant_add': event_participant_add(require_user(), $d); break;
        case 'event_activate_by_code': event_activate_by_code(require_user(), $d); break;
        case 'participant_activate': participant_activate(require_user(), $d); break;
        case 'event_participants_list': event_participants_list(require_user(), $d); break;
        case 'event_logo_remove': event_logo_remove(require_user(), $d); break;
        case 'leave_participant_mode': clear_participant_context(); json_out(['ok' => true]); break;
        case 'admin_roadbooks': admin_public_roadbooks(require_admin()); break;
        case 'admin_unpublish': admin_unpublish(require_admin(), $d); break;
        case 'admin_user_roadbooks': admin_user_roadbooks(require_admin(), $d); break;
        case 'admin_set_status':    admin_set_status(require_admin(), $d); break;
        case 'admin_move_roadbook': admin_move_roadbook(require_admin(), $d); break;
        case 'admin_trash_list':  admin_trash_list(require_admin()); break;
        case 'admin_rb_trash':    admin_rb_trash(require_admin(), $d); break;
        case 'admin_rb_restore':  admin_rb_restore(require_admin(), $d); break;
        case 'admin_rb_purge':    admin_rb_purge(require_admin(), $d); break;
        case 'rb_list':   rb_list(require_user()); break;
        case 'rb_coedit_list': rb_coedit_list(require_user()); break;
        case 'rb_lock_refresh': rb_lock_refresh(require_user(), $d); break;
        case 'rb_lock_release': rb_lock_release(require_user(), $d); break;
        case 'rb_lock_force':   rb_lock_force(require_user(), $d); break;
        case 'rb_get':    rb_get(require_user(), $d); break;
        case 'rb_draft':  rb_draft(require_user(), $d); break;
        case 'rb_save':   rb_save(require_user(), $d); break;
        case 'rb_status': rb_status(require_user(), $d); break;
        case 'rb_duplicate': rb_duplicate(require_user(), $d); break;
        case 'rb_delete': rb_delete(require_user(), $d); break;
        case 'rb_trash_list': rb_trash_list(require_user()); break;
        case 'rb_restore':    rb_restore(require_user(), $d); break;
        case 'ph_list':     ph_list(current_user(), $d); break;
        case 'ph_delete':   ph_delete(require_user(), $d); break;
        case 'ph_move':     ph_move(require_user(), $d); break;
        case 'audio_list':   audio_list(current_user(), $d); break;
        case 'audio_delete': audio_delete(require_user(), $d); break;
        case 'public_list': public_list($d); break;
        case 'public_get':  public_get($d); break;
        case 'events_list': events_public_list(); break;
        case 'event_get':   event_public_get($d); break;
        default:            fail('Unknown action.', 404);
    }
} catch (Throwable $e) {
    error_log('API error: ' . $e->getMessage());
    fail('Server error.', 500);
}
