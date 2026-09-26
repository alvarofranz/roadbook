<?php
// Send an HTML email through the SendGrid v3 API. `$cc` copies more addresses (SendGrid refuses one
// that repeats the recipient, so those are dropped); `$replyTo` = ['email' => …, 'name' => …].
function send_mail(string $toEmail, string $toName, string $subject, string $html, array $cc = [], ?array $replyTo = null): bool {
    global $CFG;
    if (!$CFG['sendgrid_key']) { error_log('SendGrid key not configured'); return false; }
    $personalization = ['to' => [['email' => $toEmail, 'name' => $toName]]];
    $cc = array_values(array_unique(array_filter($cc, fn($e) => strcasecmp($e, $toEmail) !== 0)));
    if ($cc) $personalization['cc'] = array_map(fn($e) => ['email' => $e], $cc);
    $payload = [
        'personalizations' => [$personalization],
        'from'    => ['email' => $CFG['mail_from'], 'name' => $CFG['mail_from_name']],
        'subject' => $subject,
        'content' => [['type' => 'text/html', 'value' => $html]],
    ];
    if ($replyTo) $payload['reply_to'] = $replyTo;
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

/* The account emails (#748): one bulletproof template — tables and inline styles, the only thing
   every client (Gmail, Outlook, Apple Mail, Windows Mail) renders alike — a light card with the
   logo, and the words in the reader's language (the one they used the site in, en fallback). */
const MAIL_LANGS = ['en', 'es', 'it', 'de', 'fr'];
function mail_lang($lang): string { return in_array($lang, MAIL_LANGS, true) ? $lang : 'en'; }
const MAIL_TEXT = [
    'claim' => ['en' => 'Digital roadbooks for your adventures.', 'es' => 'Roadbooks digitales para tus aventuras.', 'it' => 'Roadbook digitali per le tue avventure.', 'de' => 'Digitale Roadbooks für deine Abenteuer.', 'fr' => 'Des roadbooks numériques pour vos aventures.'],
    'fallback' => ['en' => 'If the button does not work, open this link:', 'es' => 'Si el botón no funciona, abre este enlace:', 'it' => 'Se il pulsante non funziona, apri questo link:', 'de' => 'Wenn der Button nicht funktioniert, öffne diesen Link:', 'fr' => 'Si le bouton ne fonctionne pas, ouvrez ce lien :'],
    'verify.subject' => ['en' => 'Confirm your RDBK.app account', 'es' => 'Confirma tu cuenta de RDBK.app', 'it' => 'Conferma il tuo account RDBK.app', 'de' => 'Bestätige dein RDBK.app-Konto', 'fr' => 'Confirmez votre compte RDBK.app'],
    'verify.title' => ['en' => 'Welcome, {name}!', 'es' => '¡Bienvenido, {name}!', 'it' => 'Benvenuto, {name}!', 'de' => 'Willkommen, {name}!', 'fr' => 'Bienvenue, {name} !'],
    'verify.body' => ['en' => 'You are one step away: confirm your email address to activate your account.', 'es' => 'Estás a un paso: confirma tu dirección de email para activar tu cuenta.', 'it' => 'Manca un passo: conferma il tuo indirizzo email per attivare l’account.', 'de' => 'Nur noch ein Schritt: Bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren.', 'fr' => 'Plus qu’une étape : confirmez votre adresse e-mail pour activer votre compte.'],
    'verify.button' => ['en' => 'Confirm my email', 'es' => 'Confirmar mi email', 'it' => 'Conferma la mia email', 'de' => 'E-Mail bestätigen', 'fr' => 'Confirmer mon e-mail'],
    'verify.note' => ['en' => 'This link expires in 24 hours. If you did not create an account, ignore this email.', 'es' => 'Este enlace caduca en 24 horas. Si no has creado una cuenta, ignora este email.', 'it' => 'Il link scade tra 24 ore. Se non hai creato un account, ignora questa email.', 'de' => 'Dieser Link läuft in 24 Stunden ab. Wenn du kein Konto erstellt hast, ignoriere diese E-Mail.', 'fr' => 'Ce lien expire dans 24 heures. Si vous n’avez pas créé de compte, ignorez cet e-mail.'],
    'reset.subject' => ['en' => 'Reset your RDBK.app password', 'es' => 'Restablece tu contraseña de RDBK.app', 'it' => 'Reimposta la password di RDBK.app', 'de' => 'Setze dein RDBK.app-Passwort zurück', 'fr' => 'Réinitialisez votre mot de passe RDBK.app'],
    'reset.title' => ['en' => 'Reset your password', 'es' => 'Restablece tu contraseña', 'it' => 'Reimposta la password', 'de' => 'Passwort zurücksetzen', 'fr' => 'Réinitialisez votre mot de passe'],
    'reset.body' => ['en' => 'We received a request to reset the password of your account.', 'es' => 'Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.', 'it' => 'Abbiamo ricevuto una richiesta di reimpostare la password del tuo account.', 'de' => 'Wir haben eine Anfrage erhalten, das Passwort deines Kontos zurückzusetzen.', 'fr' => 'Nous avons reçu une demande de réinitialisation du mot de passe de votre compte.'],
    'reset.button' => ['en' => 'Set a new password', 'es' => 'Crear una contraseña nueva', 'it' => 'Imposta una nuova password', 'de' => 'Neues Passwort festlegen', 'fr' => 'Choisir un nouveau mot de passe'],
    'reset.note' => ['en' => 'This link expires in 1 hour. If you did not ask for it, ignore this email: your password stays the same.', 'es' => 'Este enlace caduca en 1 hora. Si no lo has pedido, ignora este email: tu contraseña no cambia.', 'it' => 'Il link scade tra 1 ora. Se non l’hai chiesto tu, ignora questa email: la password resta la stessa.', 'de' => 'Dieser Link läuft in 1 Stunde ab. Wenn du ihn nicht angefordert hast, ignoriere diese E-Mail: dein Passwort bleibt gleich.', 'fr' => 'Ce lien expire dans 1 heure. Si vous ne l’avez pas demandé, ignorez cet e-mail : votre mot de passe reste le même.'],
    'change.subject' => ['en' => 'Confirm your new RDBK.app email', 'es' => 'Confirma tu nuevo email de RDBK.app', 'it' => 'Conferma la nuova email di RDBK.app', 'de' => 'Bestätige deine neue RDBK.app-E-Mail', 'fr' => 'Confirmez votre nouvel e-mail RDBK.app'],
    'change.title' => ['en' => 'Confirm your new email', 'es' => 'Confirma tu nuevo email', 'it' => 'Conferma la nuova email', 'de' => 'Neue E-Mail bestätigen', 'fr' => 'Confirmez votre nouvel e-mail'],
    'change.body' => ['en' => 'Confirm this address to use it for your RDBK.app account.', 'es' => 'Confirma esta dirección para usarla en tu cuenta de RDBK.app.', 'it' => 'Conferma questo indirizzo per usarlo nel tuo account RDBK.app.', 'de' => 'Bestätige diese Adresse, um sie für dein RDBK.app-Konto zu verwenden.', 'fr' => 'Confirmez cette adresse pour l’utiliser avec votre compte RDBK.app.'],
    'change.button' => ['en' => 'Confirm new email', 'es' => 'Confirmar el nuevo email', 'it' => 'Conferma la nuova email', 'de' => 'Neue E-Mail bestätigen', 'fr' => 'Confirmer le nouvel e-mail'],
    'change.note' => ['en' => 'This link expires in 24 hours. Your current email stays active until you confirm.', 'es' => 'Este enlace caduca en 24 horas. Tu email actual sigue activo hasta que confirmes.', 'it' => 'Il link scade tra 24 ore. L’email attuale resta attiva finché non confermi.', 'de' => 'Dieser Link läuft in 24 Stunden ab. Deine aktuelle E-Mail bleibt aktiv, bis du bestätigst.', 'fr' => 'Ce lien expire dans 24 heures. Votre e-mail actuel reste actif jusqu’à votre confirmation.'],
];
function mail_t(string $lang, string $key, array $vars = []): string {
    $text = MAIL_TEXT[$key][$lang] ?? MAIL_TEXT[$key]['en'];
    foreach ($vars as $k => $v) $text = str_replace('{' . $k . '}', htmlspecialchars((string)$v), $text);
    return $text;
}
// A whole account email: `$kind` is verify · reset · change; `$name` greets where the title has one.
function mail_account(string $kind, string $lang, string $link, string $name = ''): string {
    global $CFG;
    $font = 'font-family:Arial,Helvetica,sans-serif;';
    $url = htmlspecialchars($link);
    return '<!doctype html><html lang="' . $lang . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>'
        . '<body style="margin:0;padding:0;background:#f2f0ec;">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f0ec;"><tr><td align="center" style="padding:32px 16px;">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border-radius:16px;">'
        . '<tr><td style="background:#0e1116;border-radius:16px 16px 0 0;padding:18px 28px;">'
        . '<img src="' . htmlspecialchars($CFG['base_url']) . '/assets/apple-touch-icon.png" width="30" height="30" alt="" style="border:0;border-radius:6px;vertical-align:middle;">'
        . '<span style="' . $font . 'font-size:19px;font-weight:bold;color:#e8b059;vertical-align:middle;padding-left:8px;">RDBK.app</span></td></tr>'
        . '<tr><td style="padding:28px 28px 8px;' . $font . 'font-size:16px;line-height:1.6;color:#1d232c;">'
        . '<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0e1116;">' . mail_t($lang, $kind . '.title', ['name' => $name]) . '</h1>'
        . '<p style="margin:0 0 20px;">' . mail_t($lang, $kind . '.body') . '</p>'
        . '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#e8b059;border-radius:10px;">'
        . '<a href="' . $url . '" style="display:inline-block;padding:14px 26px;' . $font . 'font-size:16px;font-weight:bold;color:#14100a;text-decoration:none;">' . mail_t($lang, $kind . '.button') . '</a></td></tr></table>'
        . '<p style="margin:22px 0 6px;font-size:13px;color:#5d6572;">' . mail_t($lang, $kind . '.note') . '</p>'
        . '<p style="margin:0 0 20px;font-size:12px;color:#7a8290;word-break:break-all;">' . mail_t($lang, 'fallback') . ' <a href="' . $url . '" style="color:#a86f12;">' . $url . '</a></p>'
        . '</td></tr>'
        . '<tr><td style="padding:16px 28px 20px;border-top:1px solid #ece8e1;' . $font . 'font-size:12px;color:#7a8290;">' . mail_t($lang, 'claim') . ' · <a href="' . htmlspecialchars($CFG['base_url']) . '" style="color:#7a8290;">rdbk.app</a></td></tr>'
        . '</table></td></tr></table></body></html>';
}
