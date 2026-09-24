import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The contact form (/contact/): anyone may write; the server checks everything again, keeps the bots
   out (honeypot, IP rate limit, Turnstile) and emails the team with Reply-To set to the sender. */
const read = (p) => fs.readFileSync(p, 'utf8');
const srv = read('app/contact.php'), mail = read('app/mail.php'), api = read('public/api/index.php');
const page = read('public/contact/index.html'), js = read('public/contact/contact.js');

describe('the server', () => {
    it('is an anonymous action, checked in order: honeypot, fields, rate limit, Turnstile, then the mail', () => {
        expect(api).toContain("case 'contact_send': contact_send($d); break;");
        const at = (s) => srv.indexOf(s);
        expect(at("if (trim((string)($d['website'] ?? '')) !== '') json_out(['ok' => true]);")).toBeGreaterThan(-1);
        expect(at("rate_limit('contact_' . client_ip(), 5, 3600);")).toBeGreaterThan(at("fail('That message is too long.');"));
        expect(at('verify_turnstile(')).toBeGreaterThan(at('rate_limit('));
        expect(at('send_mail(')).toBeGreaterThan(at('verify_turnstile('));
        expect(srv).toContain("$CFG['contact_cc'], ['email' => $email, 'name' => $name])");
    });
    it('every value in the email is escaped', () => {
        expect(srv).toContain("$e = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES);");
        expect(srv).toContain('white-space:pre-wrap;">\' . $e($message) . \'</div>');
    });
    it('send_mail copies and sets Reply-To, never repeating the recipient in the copy', () => {
        expect(mail).toContain('array $cc = [], ?array $replyTo = null');
        expect(mail).toContain('array_filter($cc, fn($e) => strcasecmp($e, $toEmail) !== 0)');
        expect(mail).toContain("if ($replyTo) $payload['reply_to'] = $replyTo;");
    });
    it('the recipients are configuration, not code', () => {
        expect(read('app/bootstrap.php')).toContain("'contact_cc'     => array_values(array_filter(array_map('trim', explode(',', $_ENV['CONTACT_CC'] ?? '')))),");
        expect(read('.env.example')).toContain('CONTACT_CC=');
    });
});

describe('the page', () => {
    it('one topic per pill, the same catalog as the server', () => {
        const topics = [...page.matchAll(/name="topic" value="(\w+)"/g)].map((m) => m[1]);
        const server = [...srv.match(/const CONTACT_TOPICS = \[([^\]]*)\]/)[1].matchAll(/'(\w+)' =>/g)].map((m) => m[1]);
        expect(topics).toEqual(server);
    });
    it('Send is pressable only when complete, and never twice', () => {
        expect(js).toContain('send.disabled = sending || !ready();');
        expect(js).toContain('if (sending || !ready()) return;');
        expect(js).toContain('turnstile.reset(); // a token is good for one message');
        expect(page).toContain('<input class="contact-trap" name="website"');
    });
});
