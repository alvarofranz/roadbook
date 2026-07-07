<?php
/* Site settings (#103): a generic key/value store. The home-page message banner lives here
 * today (keys home_message*); future global toggles / feature flags will too. */

function setting_get(string $k, ?string $default = null): ?string {
    $st = db()->prepare('SELECT v FROM settings WHERE k = ?');
    $st->execute([$k]);
    $v = $st->fetchColumn();
    return $v === false ? $default : $v;
}

function setting_set(string $k, ?string $v): void {
    db()->prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)')->execute([$k, $v]);
}

// The active home banner for the public config payload, or null. Respects the on/off flag, a
// non-empty message and an optional expiry date (YYYY-MM-DD, shown through the end of that day).
function site_banner(): ?array {
    // One query — config is called on every page load, so don't fan out into 4 lookups.
    $s = db()->query("SELECT k, v FROM settings WHERE k LIKE 'home\\_message%'")->fetchAll(PDO::FETCH_KEY_PAIR);
    if (($s['home_message_on'] ?? '0') !== '1') return null;
    $text = trim((string)($s['home_message'] ?? ''));
    if ($text === '') return null;
    $until = trim((string)($s['home_message_until'] ?? ''));
    if ($until !== '' && $until < date('Y-m-d')) return null;
    return ['text' => $text, 'level' => ($s['home_message_level'] ?? 'info') === 'warning' ? 'warning' : 'info'];
}

// Admin: read the raw banner settings for the editor form.
function admin_settings(array $user): void {
    json_out(['ok' => true, 'settings' => [
        'home_message'       => setting_get('home_message', ''),
        'home_message_on'    => setting_get('home_message_on', '0'),
        'home_message_level' => setting_get('home_message_level', 'info'),
        'home_message_until' => setting_get('home_message_until', ''),
    ]]);
}

// Admin: save the banner settings (only the known keys; the text is plain and rendered escaped).
function admin_save_settings(array $user, array $d): void {
    $s = is_array($d['settings'] ?? null) ? $d['settings'] : [];
    setting_set('home_message', substr(trim((string)($s['home_message'] ?? '')), 0, 2000));
    setting_set('home_message_on', !empty($s['home_message_on']) ? '1' : '0');
    setting_set('home_message_level', ($s['home_message_level'] ?? 'info') === 'warning' ? 'warning' : 'info');
    $until = trim((string)($s['home_message_until'] ?? ''));
    setting_set('home_message_until', preg_match('/^\d{4}-\d{2}-\d{2}$/', $until) ? $until : '');
    log_activity((int)$user['id'], 'admin_settings');
    json_out(['ok' => true]);
}

// Admin: the cron log tail, for the Logs page (#200). The activity feed moved to its own paginated,
// searchable endpoint (admin_activity_log).
function admin_logs(array $user): void {
    $cronLog = dirname(__DIR__) . '/cron/cron.log';
    $cron = is_file($cronLog) ? substr((string)file_get_contents($cronLog), -8000) : '';
    json_out(['ok' => true, 'cron' => $cron]);
}

// Admin: paginated + searchable global activity log for the Logs page (#200). `q` matches the
// action, the (anonymised) IP, the detail or the username (LIKE); anonymous events (user_id NULL)
// keep a blank user. Returns the page rows + the total count for pagination.
function admin_activity_log(array $user, array $d): void {
    $q = trim((string)($d['q'] ?? ''));
    $per = 50;
    $page = max(1, (int)($d['page'] ?? 1));
    $off = ($page - 1) * $per;
    $where = ''; $args = [];
    if ($q !== '') {
        $where = 'WHERE (a.action LIKE ? OR a.ip LIKE ? OR a.detail LIKE ? OR u.username LIKE ?)';
        $like = '%' . $q . '%'; $args = [$like, $like, $like, $like];
    }
    $ct = db()->prepare("SELECT COUNT(*) FROM activity_log a LEFT JOIN users u ON u.id = a.user_id $where");
    $ct->execute($args);
    $total = (int)$ct->fetchColumn();
    $st = db()->prepare("SELECT a.user_id, u.username, a.action, a.detail, a.ip, a.created_at
        FROM activity_log a LEFT JOIN users u ON u.id = a.user_id $where ORDER BY a.id DESC LIMIT $per OFFSET $off");
    $st->execute($args);
    json_out(['ok' => true, 'rows' => $st->fetchAll(), 'total' => $total, 'page' => $page, 'per_page' => $per]);
}
