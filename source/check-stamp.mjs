#!/usr/bin/env node
/* Stamp consistency check — the repo-side half of the cache-busting scheme.
 *
 * `stamp-version.mjs` writes public/version.json and rewrites every ?v= token in the HTML;
 * this verifies the result and never changes anything, so it is safe to run any number of
 * times (CI, a pre-push hook, `npm run check:stamp`). Two things must hold:
 *
 *   1. every first-party <script src>/<link href> .js/.css reference carries a ?v= token, and
 *   2. that token equals the CURRENT release id from version.json — `<version>-<build>`.
 *
 * Either failing means a changed asset keeps serving under an already-cached URL: the host's
 * static cache and the CDN edge both key on the URL, and the PWA only force-refreshes when
 * version.json itself moves (#407). Third-party CDN URLs (a scheme, or protocol-relative)
 * are exempt — they are not ours to stamp. */
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// A local <script src>/<link href> .js/.css reference, with its query string if any.
const ASSET_REF = /(?:src|href)="([^"]+\.(?:js|css))(\?[^"]*)?"/g;
const isThirdParty = (url) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url);

/** Every first-party asset reference in one HTML source, as {url, token}; token is null when
 *  the reference carries no ?v= at all. Pure — the unit tests drive this directly. */
export function assetRefs(html) {
    const refs = [];
    for (const m of html.matchAll(ASSET_REF)) {
        if (isThirdParty(m[1])) continue;
        const token = m[2] && m[2].startsWith('?v=') ? m[2].slice(3) : null;
        refs.push({ url: m[1], token });
    }
    return refs;
}

/** The references in one HTML source that would serve stale, given the expected release id. */
export function staleRefs(html, release) {
    return assetRefs(html).filter((r) => r.token !== release);
}

/** The release id version.json describes: the token the stamper writes into every URL. */
export const releaseId = ({ version, build }) => `${version}-${build}`;

async function htmlFiles(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...await htmlFiles(p));
        else if (entry.name.endsWith('.html')) out.push(p);
    }
    return out;
}

/** Walk public/ and report every stale or unstamped reference. Returns {release, problems}. */
export async function checkStamp(publicDir) {
    const release = releaseId(JSON.parse(await readFile(join(publicDir, 'version.json'), 'utf8')));
    const problems = [];
    for (const file of await htmlFiles(publicDir)) {
        const html = await readFile(file, 'utf8');
        for (const ref of staleRefs(html, release)) {
            problems.push({ file: relative(publicDir, file), url: ref.url, token: ref.token });
        }
    }
    return { release, problems };
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('check-stamp.mjs')) {
    const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
    const { release, problems } = await checkStamp(publicDir);
    if (!problems.length) {
        console.log(`Stamp is consistent: every first-party asset reference carries ?v=${release}.`);
        process.exit(0);
    }
    console.error(`ERROR: ${problems.length} asset reference(s) do not carry the current release token (?v=${release}):`);
    for (const p of problems) console.error(`  ${p.file} → ${p.url}  [${p.token === null ? 'no ?v= at all' : '?v=' + p.token}]`);
    console.error(`\nRun the stamper and commit the result:  node source/stamp-version.mjs $(jq -r .version public/version.json)`);
    console.error('A reference without the current token serves the OLD file from the host cache and the CDN edge (#407).');
    process.exit(1);
}
