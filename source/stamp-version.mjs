#!/usr/bin/env node
/* Release version stamp. Writes public/version.json and bumps the ?v= cache-buster on
 * every first-party asset URL across public/ HTML, so each release gets fresh asset URLs
 * through every cache layer (browser, CDN edge, the host's static-file cache — which
 * ignores .htaccess and pins old JS for hours otherwise). The app polls version.json and
 * force-refreshes every open client when it changes.
 *
 * Usage:  node source/stamp-version.mjs <YYYY.MM.DD-N>   (e.g. 2026.06.23-5)
 * Run on every release — see CLAUDE.md "Releasing". */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version || !/^\d{4}\.\d{2}\.\d{2}-\d+$/.test(version)) {
    console.error('Usage: node source/stamp-version.mjs <YYYY.MM.DD-N>  (e.g. 2026.06.23-5)');
    process.exit(1);
}

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
// Every ?v=<version> cache-buster token, whatever its current value — so a release stamps
// them all to the new version even if some HTML drifted out of sync.
const CACHE_BUST = /\?v=\d{4}\.\d{2}\.\d{2}-\d+/g;

async function htmlFiles(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...await htmlFiles(p));
        else if (entry.name.endsWith('.html')) out.push(p);
    }
    return out;
}

// version.json — the trigger the app polls to force-refresh open clients.
await writeFile(join(publicDir, 'version.json'), `{ "version": "${version}" }\n`);

let stamped = 0, files = 0;
for (const file of await htmlFiles(publicDir)) {
    const src = await readFile(file, 'utf8');
    let n = 0;
    const out = src.replace(CACHE_BUST, () => { n++; return `?v=${version}`; });
    if (n) { await writeFile(file, out); stamped += n; files++; }
}
console.log(`Stamped ${version}: version.json + ${stamped} cache-buster(s) across ${files} HTML file(s).`);

// Local maintenance hook: every 5th release, run the dead-code sweep — but only if the
// git-ignored local dev script source/find-orphans.mjs is present. It's a no-op for anyone
// without it (CI never runs this stamper; fresh clones don't have find-orphans.mjs). The
// counter lives in a git-ignored file, so it never adds release noise.
try {
    const here = dirname(fileURLToPath(import.meta.url));
    const orphans = await import('./find-orphans.mjs');
    const countFile = join(here, '.release-count');
    let n = 0; try { n = parseInt(await readFile(countFile, 'utf8'), 10) || 0; } catch { /* first run */ }
    n += 1; await writeFile(countFile, String(n) + '\n');
    if (n % 5 === 0) { console.log(`\n[find-orphans] release #${n}: running the every-5-releases dead-code sweep…`); orphans.reportOrphans(await orphans.findOrphans()); }
    else console.log(`[find-orphans] next dead-code sweep in ${5 - (n % 5)} release(s).`);
} catch { /* find-orphans.mjs absent (CI / other devs) — skip */ }
