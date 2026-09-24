#!/usr/bin/env node
/* Release version stamp. Writes public/version.json and bumps the ?v= cache-buster on
 * every first-party asset URL across public/ HTML, so each release gets fresh asset URLs
 * through every cache layer (browser, CDN edge, the host's static-file cache — which
 * ignores .htaccess and pins old JS for hours otherwise). The app polls version.json and
 * force-refreshes every open client when it changes.
 *
 * Versioning (unified across web + Android + iOS):
 *   · version = semver MAJOR.MINOR.PATCH — the ONE human-facing version, identical on the
 *     web footer, the Android versionName and the iOS MARKETING_VERSION. You bump it.
 *   · build   = a monotonic integer that ALWAYS grows, auto-incremented here every run. It
 *     drives the web cache-buster + the PWA force-refresh (so a same-version redeploy still
 *     refreshes clients). Each store keeps its OWN required build counter too (Android
 *     versionCode from the semver, iOS via Xcode Cloud) — the stores mandate that; the
 *     shared thing is the semver.
 *
 * Usage:  node source/stamp-version.mjs <MAJOR.MINOR.PATCH>   (e.g. 1.1.0)
 * Run on every web release — see CLAUDE.md "Releasing". */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetRefs, releaseId, htmlFiles } from './assets.mjs';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('Usage: node source/stamp-version.mjs <MAJOR.MINOR.PATCH>  (e.g. 1.1.0)');
    process.exit(1);
}
// Android's versionCode is MAJOR·1 000 000 + MINOR·1 000 + PATCH (android/app/build.gradle):
// past 999 a minor or a patch would collide with the next number up, so the stamp refuses it.
if (version.split('.').slice(1).some((n) => +n > 999)) {
    console.error(`${version}: MINOR and PATCH must stay ≤ 999 (the Android versionCode encodes them in three digits).`);
    process.exit(1);
}

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const versionFile = join(publicDir, 'version.json');
// Any existing ?v=<token> cache-buster, whatever its format: each one becomes the new release id.
const CACHE_BUST = /\?v=[\w.+-]+/g;

// build: the ever-growing counter, read from the current version.json and incremented. It never
// resets — not even when the semver bumps — so every release has a strictly larger build.
let prevBuild = 0;
try { prevBuild = JSON.parse(await readFile(versionFile, 'utf8')).build || 0; } catch { /* no version.json yet */ }
const build = prevBuild + 1;
const release = releaseId({ version, build }); // the unique per-release token (cache-buster + refresh key)

// version.json — the trigger the app polls to force-refresh open clients.
await writeFile(versionFile, JSON.stringify({ version, build }) + '\n');

let stamped = 0, files = 0;
const unstamped = []; // first-party asset refs with NO ?v= token — this stamper would never touch them
for (const file of await htmlFiles(publicDir)) {
    const src = await readFile(file, 'utf8');
    let n = 0;
    const out = src.replace(CACHE_BUST, () => { n++; return `?v=${release}`; });
    if (n) { await writeFile(file, out); stamped += n; files++; }
    for (const ref of assetRefs(out)) if (ref.token === null) unstamped.push(`${file.slice(publicDir.length + 1)} → ${ref.url}`);
}
console.log(`Stamped v${version} (build ${build}): version.json + ${stamped} cache-buster(s) across ${files} HTML file(s).`);
// A ref without a buster serves stale through the host's static cache for hours after every
// deploy — the exact bug this stamper exists to prevent. Fail the release until it gets one.
if (unstamped.length) {
    console.error(`\nERROR: ${unstamped.length} first-party asset reference(s) carry NO ?v= cache-buster:`);
    for (const u of unstamped) console.error('  ' + u);
    console.error('Add ?v=' + release + ' to each (the stamper only rewrites existing tokens), then re-run.');
    process.exit(1);
}

// Local maintenance hook: every 5th release, run the dead-code sweep — but only if the
// git-ignored local dev script source/find-orphans.mjs is present. It's a no-op anywhere
// else (the deploy server and fresh clones don't have it). The counter lives in a git-ignored
// file, so it never adds release noise.
try {
    const here = dirname(fileURLToPath(import.meta.url));
    const orphans = await import('./find-orphans.mjs');
    const countFile = join(here, '.release-count');
    let n = 0; try { n = parseInt(await readFile(countFile, 'utf8'), 10) || 0; } catch { /* first run */ }
    n += 1; await writeFile(countFile, String(n) + '\n');
    if (n % 5 === 0) { console.log(`\n[find-orphans] release #${n}: running the every-5-releases dead-code sweep…`); orphans.reportOrphans(await orphans.findOrphans()); }
    else console.log(`[find-orphans] next dead-code sweep in ${5 - (n % 5)} release(s).`);
} catch { /* find-orphans.mjs absent — skip */ }
