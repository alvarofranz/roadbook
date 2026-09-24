import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { spawnSync } from 'child_process';

/* Android's versionCode (#941): Play rejects a code it already holds, and one lower than the last.
   MAJOR·10000 + MINOR·100 + PATCH gave 1.9.10 and 1.10.0 the same 11000. The code is now
   MAJOR·1 000 000 + MINOR·1 000 + PATCH, computed by the build from version.json itself, with
   MINOR and PATCH capped at 999 by both the build and the stamp. */
const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
const code = (v) => { const [a, b, c] = v.split('.').map(Number); return a * 1000000 + b * 1000 + c; };

describe('the Android versionCode', () => {
    it('is computed by the build from public/version.json, not handed in from outside', () => {
        expect(gradle).toContain("new groovy.json.JsonSlurper().parse(rootProject.file('../public/version.json')).version");
        expect(gradle).toContain('def rdbkVc = rdbkMajor * 1000000 + rdbkMinor * 1000 + rdbkPatch');
        expect(gradle).not.toContain("findProperty('rdbkVersionCode')");
        expect(gradle).toContain('if (rdbkMinor > 999 || rdbkPatch > 999 || rdbkMajor > 2099)');
        expect(gradle).toContain('if (rdbkVc <= 11000)');
    });
    it('grows with every version and never repeats, always above what Play holds', () => {
        const versions = ['1.9.11', '1.9.12', '1.9.99', '1.9.100', '1.10.0', '1.10.1', '1.99.999', '2.0.0'];
        for (let i = 1; i < versions.length; i++) expect(code(versions[i]), versions[i]).toBeGreaterThan(code(versions[i - 1]));
        expect(code('1.9.11')).toBeGreaterThan(11000); // the last code uploaded under the old scheme (1.9.10)
        expect(code('2099.999.999')).toBeLessThanOrEqual(2100000000); // Play's ceiling
    });
    it('the stamp refuses a MINOR or PATCH the code cannot hold', () => {
        const r = spawnSync('node', ['source/stamp-version.mjs', '1.1000.0'], { encoding: 'utf8' });
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('≤ 999');
    });
});
