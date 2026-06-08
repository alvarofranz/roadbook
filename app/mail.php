<?php
// Send an HTML email through the SendGrid v3 API.
function send_mail(string $toEmail, string $toName, string $subject, string $html): bool {
    global $CFG;
    if (!$CFG['sendgrid_key']) { error_log('SendGrid key not configured'); return false; }
    $payload = [
        'personalizations' => [['to' => [['email' => $toEmail, 'name' => $toName]]]],
        'from'    => ['email' => $CFG['mail_from'], 'name' => $CFG['mail_from_name']],
        'subject' => $subject,
        'content' => [['type' => 'text/html', 'value' => $html]],
    ];
    $ch = curl_init('https://api.sendgrid.com/v3/mail/send');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $CFG['sendgrid_key'], 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
    ]);
    curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code < 200 || $code >= 300) { error_log("SendGrid failed: HTTP $code"); return false; }
    return true;
}

// Minimal branded email wrapper.
function mail_html(string $title, string $body): string {
    return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;background:#0e1116;color:#eef2f7;border-radius:14px;padding:28px">'
        . '<div style="font-size:20px;font-weight:800;color:#e8b059;margin-bottom:12px">RDBK.app</div>'
        . '<h2 style="font-size:18px;margin:0 0 12px">' . $title . '</h2>'
        . '<div style="line-height:1.6;color:#c7ccd6">' . $body . '</div>'
        . '<div style="margin-top:20px;font-size:12px;color:#93a0b4">Digital roadbooks for your adventures.</div></div>';
}

function mail_button(string $href, string $label): string {
    return '<p style="margin:18px 0"><a href="' . htmlspecialchars($href) . '" style="display:inline-block;background:#e8b059;color:#14100a;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px">' . $label . '</a></p>'
        . '<p style="font-size:12px;color:#93a0b4;word-break:break-all">' . htmlspecialchars($href) . '</p>';
}
