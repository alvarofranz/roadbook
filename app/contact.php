<?php
/* The contact form (/contact/): anyone may write, signed in or not. Turnstile, an IP rate limit and
 * a honeypot keep the bots out; the message reaches the team by email (SendGrid), with Reply-To set
 * to the sender so answering is one click. Nothing is stored. */

const CONTACT_TOPICS = ['question' => 'Question', 'feedback' => 'Feedback or idea', 'bug' => 'Something doesn’t work', 'events' => 'Events and organizers', 'privacy' => 'Privacy or my data', 'other' => 'Other'];
const CONTACT_MESSAGE_MIN = 10, CONTACT_MESSAGE_MAX = 5000;

function contact_send(array $d): void {
    global $CFG;
    // the honeypot: a field people never see; a bot that fills it is told it worked, and nothing is sent
    if (trim((string)($d['website'] ?? '')) !== '') json_out(['ok' => true]);
    $name = trim((string)($d['name'] ?? ''));
    $email = trim((string)($d['email'] ?? ''));
    $topic = (string)($d['topic'] ?? '');
    $message = trim(str_replace("\r\n", "\n", (string)($d['message'] ?? '')));
    if ($name === '' || mb_strlen($name) > 100) fail('Please enter your name.');
    if (!valid_email($email) || strlen($email) > 190) fail('Please enter a valid email.');
    if (!isset(CONTACT_TOPICS[$topic])) fail('Choose what it is about.');
    if (mb_strlen($message) < CONTACT_MESSAGE_MIN) fail('Tell us a little more.');
    if (mb_strlen($message) > CONTACT_MESSAGE_MAX) fail('That message is too long.');
    rate_limit('contact_' . client_ip(), 5, 3600);
    verify_turnstile($d['turnstile'] ?? null);
    $user = current_user();
    $subject = '[RDBK.app] ' . CONTACT_TOPICS[$topic] . ' — ' . $name;
    if (!send_mail($CFG['contact_to'], 'RDBK.app', $subject, contact_mail($name, $email, $topic, $message, $user, mail_lang($d['lang'] ?? ''), (string)($d['page'] ?? '')), $CFG['contact_cc'], ['email' => $email, 'name' => $name])) {
        fail('The message could not be sent. Please try again later, or write to us by email.', 502);
    }
    log_activity($user ? (int)$user['id'] : null, 'contact_send', $topic);
    json_out(['ok' => true]);
}

// The email the team reads: who wrote, about what, from where, and the message — every value escaped.
function contact_mail(string $name, string $email, string $topic, string $message, ?array $user, string $lang, string $page): string {
    global $CFG;
    $e = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES);
    $font = 'font-family:Arial,Helvetica,sans-serif;';
    $row = fn($k, $v) => '<tr><td style="padding:6px 12px 6px 0;color:#7a8290;font-size:13px;vertical-align:top;white-space:nowrap;">' . $k . '</td><td style="padding:6px 0;font-size:14px;color:#1d232c;">' . $v . '</td></tr>';
    $account = $user ? '<a href="' . $e($CFG['base_url'] . '/u/' . rawurlencode($user['username'])) . '" style="color:#a86f12;">@' . $e($user['username']) . '</a> (#' . (int)$user['id'] . ')' : 'not signed in';
    return '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:24px;background:#f2f0ec;' . $font . '">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:14px;">'
        . '<tr><td style="background:#0e1116;border-radius:14px 14px 0 0;padding:16px 24px;font-size:17px;font-weight:bold;color:#e8b059;">RDBK.app · ' . $e(CONTACT_TOPICS[$topic]) . '</td></tr>'
        . '<tr><td style="padding:20px 24px 8px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">'
        . $row('From', $e($name) . ' &lt;<a href="mailto:' . $e($email) . '" style="color:#a86f12;">' . $e($email) . '</a>&gt;')
        . $row('Account', $account)
        . $row('Language', $e($lang))
        . ($page !== '' ? $row('Page', $e(mb_substr($page, 0, 300))) : '')
        . '</table></td></tr>'
        . '<tr><td style="padding:8px 24px 24px;"><div style="border-top:1px solid #ece8e1;padding-top:16px;font-size:15px;line-height:1.6;color:#1d232c;white-space:pre-wrap;">' . $e($message) . '</div></td></tr>'
        . '<tr><td style="padding:12px 24px 18px;border-top:1px solid #ece8e1;font-size:12px;color:#7a8290;">Reply to this email to answer ' . $e($name) . ' directly.</td></tr>'
        . '</table></body></html>';
}
