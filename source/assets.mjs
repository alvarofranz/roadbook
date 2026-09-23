/* The first-party asset references of public/ HTML — the one definition shared by the release
 * stamper (stamp-version.mjs) and the stamp consistency check (check-stamp.mjs), so the two can
 * never disagree about which references must carry a ?v= cache-buster. */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

// A <script src>/<link href> .js/.css reference, with its query string if any.
const ASSET_REF = /(?:src|href)="([^"]+\.(?:js|css))(\?[^"]*)?"/g;

// A third-party CDN URL (a scheme, or protocol-relative) — not ours to stamp.
export const isThirdParty = (url) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url);

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

/** The release id version.json describes: the token the stamper writes into every URL. */
export const releaseId = ({ version, build }) => `${version}-${build}`;

/** Every .html file under a directory, recursively. */
export async function htmlFiles(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...await htmlFiles(p));
        else if (entry.name.endsWith('.html')) out.push(p);
    }
    return out;
}
