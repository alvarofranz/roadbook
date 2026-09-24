import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* Public comments on a public roadbook (#809): pinned in the source — the server rules, the page, the shared Turnstile. */
const read = (p) => fs.readFileSync(p, 'utf8');
const php = read('app/comments.php'), api = read('public/api/index.php'), page = read('public/challenge/challenge.js');
const html = read('public/challenge/index.html'), app = read('public/assets/js/app.js'), account = read('public/account/account.js');

describe('the comments API', () => {
    it('exists only on public roadbooks: anyone reads, signed-in users write (#884)', () => {
        expect(php).toContain("WHERE slug = ? AND status = 'public'");
        for (const a of ['comment_add', 'comment_delete']) expect(api).toMatch(new RegExp(`case '${a}':\\s+${a}\\(require_user\\(\\), \\$d\\)`));
        expect(api).toContain("case 'comments_list':  comments_list(current_user(), $d); break;");
        expect(api).not.toMatch(/\$readOnly = \[[^\]]*comments_list/); // POST like every other action
    });
    it('guards posting: length, a per-user rate limit and Turnstile', () => {
        expect(php).toContain("if (mb_strlen($body) > COMMENT_MAX) fail('That comment is too long.');");
        expect(php).toContain("rate_limit('comment_' . (int)$me['id'], 10, 600);");
        expect(php).toContain("verify_turnstile($d['turnstile'] ?? null);");
    });
    it('lets only the author, the roadbook owner or an admin delete one', () => {
        expect(php).toContain("if ((int)$c['user_id'] !== (int)$me['id'] && (int)$c['owner_id'] !== (int)$me['id'] && !is_admin($me)) fail('Not allowed.', 403);");
    });
    it('has its table in the migrations, going with the roadbook and the account', () => {
        const sql = read('migrations/041_roadbook_comments.sql');
        expect(sql).toContain('REFERENCES roadbooks(id) ON DELETE CASCADE');
        expect(sql).toContain('REFERENCES users(id)     ON DELETE CASCADE');
    });
});

describe('the roadbook page', () => {
    it('shows comments on a public roadbook only, and never in the Reader', () => {
        expect(page).toContain("if (j.status === 'public') {");
        expect(html).toContain('<section class="ch-comments" id="chComments" hidden>');
        expect(read('public/reader/reader.js')).not.toMatch(/comments_list|comment_add/);
    });
    it('escapes what readers write and confirms a deletion naming it', () => {
        expect(page).toContain('<p class="comment-body">${esc(c.body)}</p>');
        expect(page).toContain("RBConfirmDanger(`${esc(t('Delete this comment by'))} <b>@${esc(c.username)}</b>?");
    });
    it('has a Comments button beside the actions that scrolls down to them, with the count (#853)', () => {
        expect(html).toContain('<a class="btn btn-ghost" id="chCommentsBtn" href="#chComments" hidden>');
        expect(page).toContain("$('chComments').scrollIntoView({ behavior: 'smooth', block: 'start' })");
        expect(page).toContain("$('chCommentCount').textContent = $('chCommentsBtnCount').textContent =");
    });
    it('posts with a one-use Turnstile token', () => {
        expect(page).toContain("RBApi('comment_add', { slug, body: text, turnstile: turnstile.token() });");
        expect(page).toContain('turnstile.reset();');
    });
});

describe('one Turnstile loader (RBTurnstile)', () => {
    it('is shared by the account forms and the comments', () => {
        expect(app).toContain('window.RBTurnstile = (el, siteKey) => {');
        expect(app).toContain("if (!el || !siteKey || isNativeApp()) return handle;");
        // api.js is loaded async: render from its load, never through turnstile.ready(), which refuses that and never fires (#863)
        expect(app).toMatch(/turnstileScript\.then\(\(\) => \{\s+widget = window\.turnstile\.render\(el,/);
        expect(app).not.toContain('turnstile.ready(');
        expect(account).toContain("ts[el.dataset.ts] = RBTurnstile(el, cfg.turnstile);");
        expect(account).not.toMatch(/__tsReady|loadTurnstile/);
    });
});

describe('the roadbook page header on a phone (#865)', () => {
    const html = fs.readFileSync('public/challenge/index.html', 'utf8');
    it('leads with the image as a rounded banner, sizes the title, and lays the actions out evenly', () => {
        const phone = html.slice(html.indexOf('@media (max-width: 640px)'));
        expect(phone).toContain('.ch-head .ch-logo { order: -1; width: 100%;');
        expect(phone).toContain('.ch-head h1 { font-size: 1.6rem;');
        expect(phone).toContain('.ch-actions .btn-primary { flex-basis: 100%; }');
        expect(html).toMatch(/\.ch-logo \{[^}]*border-radius: 12px;/);
    });
});

describe('the Post button', () => {
    const ch = fs.readFileSync('public/challenge/challenge.js', 'utf8');
    it('is pressable only with something written, and never twice while a comment is on its way', () => {
        expect(ch).toContain('const syncSend = () => { send.disabled = sending || !body.value.trim(); };');
        expect(ch).toContain("sending = true; sendLabel.textContent = t('Posting…');");
        expect(ch).toContain('const busy = RBBusy(send, { onEnd: syncSend });'); // back from the spinner, still off until new text
        expect(ch).toContain("if (!text || sending) return body.focus();");
    });
});

