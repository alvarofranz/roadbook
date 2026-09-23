import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* A public roadbook is public (#884): read, exported and navigated without an account. */
const read = (p) => fs.readFileSync(p, 'utf8');

describe('public roadbooks need no account', () => {
    it('the roadbook page and the Reader open them for anyone', () => {
        expect(read('public/challenge/challenge.js')).not.toMatch(/if \(!cfg\.user\) \{[^}]*RBNeedAuth/);
        expect(read('public/reader/reader.js')).not.toContain("if (!meUser) return RBNeedAuth(");
        expect(read('public/challenge/index.html')).toContain('<meta name="robots" content="index, follow">');
    });
    it('comments and completions read without an account; writing still needs one', () => {
        const api = read('public/api/index.php');
        expect(api).toContain("case 'comments_list':  comments_list(current_user(), $d); break;");
        expect(api).toContain("case 'roadbook_completions': roadbook_completions($d); break;");
        expect(api).toMatch(/case 'comment_add':\s+comment_add\(require_user\(\), \$d\)/);
        expect(read('app/comments.php')).toContain("'can_delete' => $me && (");
        expect(read('public/challenge/challenge.js')).toContain("$('chCommentSignIn').hidden = false; $('chCommentSignIn').href = RBLoginUrl();");
    });
});
