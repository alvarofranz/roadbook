#!/usr/bin/env node
/* Syntax-check every first-party front-end script (the same set CI gates on), portable
 * across Windows/macOS/Linux shells. Vendor bundles (*.min.js) are skipped.
 * Usage: npm run check */
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

async function jsFiles(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...await jsFiles(p));
        else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) out.push(p);
    }
    return out;
}

let failed = 0, checked = 0;
for (const f of await jsFiles(publicDir)) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: ['ignore', 'ignore', 'inherit'] }); checked++; }
    catch { failed++; }
}
if (failed) { console.error(`${failed} file(s) with syntax errors.`); process.exit(1); }
console.log(`Syntax OK: ${checked} first-party script(s).`);
