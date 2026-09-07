import { describe, it, expect } from 'vitest';
import { assetRefs, staleRefs, releaseId, checkStamp } from '../source/check-stamp.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* The stamp guard (#407). A false negative here is the bug it exists to catch — a changed
   asset served from the host cache and the CDN edge under an already-fetched URL, with the
   PWA version poll never firing. A false positive blocks every PR, so both directions are
   pinned. */

const RELEASE = '1.7.2-24';

describe('assetRefs', () => {
    it('collects first-party scripts and stylesheets with their token', () => {
        const html = `<link rel="stylesheet" href="../assets/app.css?v=${RELEASE}">
            <script src="../assets/js/app.js?v=${RELEASE}"></script>`;
        expect(assetRefs(html)).toEqual([
            { url: '../assets/app.css', token: RELEASE },
            { url: '../assets/js/app.js', token: RELEASE },
        ]);
    });

    it('reports a missing cache-buster as a null token', () => {
        expect(assetRefs('<script src="editor.js"></script>')).toEqual([{ url: 'editor.js', token: null }]);
    });

    it('ignores third-party URLs — absolute and protocol-relative alike', () => {
        const html = `<script src="https://cdn.example.com/lib.js"></script>
            <link href="//fonts.example.com/f.css" rel="stylesheet">
            <script src="/assets/js/app.js?v=${RELEASE}"></script>`;
        expect(assetRefs(html).map((r) => r.url)).toEqual(['/assets/js/app.js']);
    });

    it('ignores references that are not a stamped asset kind', () => {
        const html = '<a href="../standard/">spec</a><img src="../assets/icon.svg"><link rel="manifest" href="/manifest.webmanifest">';
        expect(assetRefs(html)).toEqual([]);
    });

    it('keeps a query string that is not a cache-buster out of the token', () => {
        expect(assetRefs('<script src="a.js?async=1"></script>')).toEqual([{ url: 'a.js', token: null }]);
    });
});

describe('staleRefs', () => {
    it('is empty when every reference carries the current release', () => {
        expect(staleRefs(`<script src="app.js?v=${RELEASE}"></script>`, RELEASE)).toEqual([]);
    });

    it('flags a token left behind by an earlier release', () => {
        expect(staleRefs('<script src="app.js?v=1.7.2-23"></script>', RELEASE))
            .toEqual([{ url: 'app.js', token: '1.7.2-23' }]);
    });

    it('flags a reference added by hand with no token at all', () => {
        expect(staleRefs(`<script src="app.js?v=${RELEASE}"></script><script src="new.js"></script>`, RELEASE))
            .toEqual([{ url: 'new.js', token: null }]);
    });
});

describe('releaseId', () => {
    it('is the token the stamper writes: version-build', () => {
        expect(releaseId({ version: '1.7.2', build: 24 })).toBe('1.7.2-24');
    });
});

describe('checkStamp over public/', () => {
    it('finds the shipped tree consistent', async () => {
        const { release, problems } = await checkStamp(join(dirname(fileURLToPath(import.meta.url)), '..', 'public'));
        expect(release).toMatch(/^\d+\.\d+\.\d+-\d+$/);
        expect(problems).toEqual([]);
    });
});
