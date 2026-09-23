import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { spawnSync } from 'child_process';

/* client_ip() behind a reverse proxy: the key of every rate limit. Run through the real PHP when
 * the machine has it (CI runners do); the function is lifted out of bootstrap.php as written. */
const src = fs.readFileSync('app/bootstrap.php', 'utf8');
const fns = src.match(/function client_ip\(\)[\s\S]*?\n}\nfunction ip_trusted[\s\S]*?\n}\n[\s\S]*?function ip_in_cidr[\s\S]*?\n}\n/)[0];
const hasPhp = spawnSync('php', ['-v']).status === 0;

const run = (remote, xff) => {
    const code = `$CFG = ['trusted_proxies' => ['127.0.0.0/8','::1/128','10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','fc00::/7']];
        $_SERVER['REMOTE_ADDR'] = ${JSON.stringify(remote)}; $_SERVER['HTTP_X_FORWARDED_FOR'] = ${JSON.stringify(xff)};
        ${fns} echo client_ip();`;
    return spawnSync('php', ['-r', code], { encoding: 'utf8' }).stdout;
};

describe('client_ip', () => {
    it('reads X-Forwarded-For only from a trusted proxy, from the right', () => {
        expect(src).toContain("$hops = array_reverse(array_map('trim', explode(',', (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''))));");
        expect(src).not.toContain('function logged_ip');
    });
    it.skipIf(!hasPhp)('picks the address our proxy saw, never a client-written one', () => {
        expect(run('1.2.3.4', '')).toBe('1.2.3.4');
        expect(run('127.0.0.1', '5.6.7.8')).toBe('5.6.7.8');
        expect(run('127.0.0.1', '9.9.9.9, 5.6.7.8')).toBe('5.6.7.8');   // a spoofed left entry is ignored
        expect(run('127.0.0.1', '5.6.7.8, 10.0.0.2')).toBe('5.6.7.8');  // a trusted inner hop is skipped
        expect(run('1.2.3.4', '5.6.7.8')).toBe('1.2.3.4');              // an untrusted peer's header is ignored
        expect(run('127.0.0.1', 'garbage')).toBe('127.0.0.1');
        expect(run('::1', '2001:db8::1')).toBe('2001:db8::1');
        expect(run('172.32.0.1', '8.8.8.8')).toBe('172.32.0.1');        // outside 172.16/12
    });
});
