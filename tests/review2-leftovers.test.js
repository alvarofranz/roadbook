import { describe, it, expect } from 'vitest';
import fs from 'fs';

const read = (p) => fs.readFileSync(p, 'utf8');

describe('review 2 leftovers', () => {
    it('sign-in only follows a next= path on this site', () => {
        const js = read('public/account/account.js');
        const ok = (next) => next.charAt(0) === '/' && !/^[/\\]/.test(next.charAt(1)); // the rule in finishLogin
        expect(js).toContain("if (next && next.charAt(0) === '/' && !/^[/\\\\]/.test(next.charAt(1)))");
        expect(ok('/event/x')).toBe(true);
        expect(ok('//evil.com')).toBe(false);
        expect(ok('/\\evil.com')).toBe(false);
    });
    it('a share the browser refuses saves the file instead', () => {
        expect(read('public/assets/js/app.js')).toContain("catch (e) { if (e && e.name === 'NotAllowedError') RBDownload(blob, filename); }");
    });
    it('a run links only a roadbook its runner may read', () => {
        expect(read('app/runs.php')).toContain("if ($row && ($row['status'] === 'public' || (int)$row['user_id'] === (int)$user['id'] || event_grants_read($user, (int)$row['id']))) $rbId = (int)$row['id'];");
    });
});
