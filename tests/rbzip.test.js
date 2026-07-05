import { describe, it, expect } from 'vitest';
import RBZip from '../public/assets/js/rbzip.js';

/* The .rdbk v2 container (#162): a ZIP holding roadbook.json (+ optional media). These cover the
   codec round-trip (stored + deflated entries) and readRdbk accepting both a v2 ZIP and a
   plain-JSON .rdbk (backward compatible). */
describe('RBZip — .rdbk v2 container', () => {
    it('round-trips files through write → read (stored, deflated and binary entries)', async () => {
        const rb = { meta: { title: 'X' }, track: [{ lat: 1, lon: 2 }], notes: [{ num: 1 }], icons: {} };
        const bin = new Uint8Array([0, 1, 2, 3, 255, 128, 7, 42]);
        const big = 'roadbook '.repeat(500); // compressible → exercises the deflate/inflate path
        const zip = await RBZip.write({ 'roadbook.json': JSON.stringify(rb), 'photos/a.avif': bin, 'big.txt': big });

        const head = new Uint8Array(await zip.slice(0, 4).arrayBuffer());
        expect(RBZip.isZip(head)).toBe(true); // "PK\x03\x04"

        const files = await RBZip.read(zip);
        expect(JSON.parse(RBZip.textOf(files['roadbook.json']))).toEqual(rb);
        expect([...files['photos/a.avif']]).toEqual([...bin]); // binary survives byte-for-byte
        expect(RBZip.textOf(files['big.txt'])).toBe(big);       // deflated entry inflates cleanly
    });

    it('readRdbk accepts a v2 ZIP (reads roadbook.json)', async () => {
        const rb = { meta: { title: 'Z' }, track: [], notes: [{ num: 1 }] };
        const zip = await RBZip.write({ 'roadbook.json': JSON.stringify(rb), 'audio/x.webm': new Uint8Array([9, 9]) });
        expect(await RBZip.readRdbk(zip)).toEqual(rb);
    });

    it('readRdbk still accepts a plain-JSON .rdbk (backward compatible)', async () => {
        const rb = { meta: { title: 'J' }, track: [], notes: [{ num: 2 }] };
        const blob = new Blob([JSON.stringify(rb)], { type: 'application/x-roadbook' });
        expect(RBZip.isZip(new Uint8Array([0x7b]))).toBe(false); // starts with "{"
        expect(await RBZip.readRdbk(blob)).toEqual(rb);
    });

    it('readBundle returns the roadbook + media with geotags from media.json (#162 phase 3)', async () => {
        const rb = { meta: { title: 'M' }, track: [], notes: [{ num: 1 }] };
        const media = { photos: [{ file: 'photos/p.avif', lat: 45.1, lon: 9.2 }], audio: [{ file: 'audio/a.webm', lat: 45.2, lon: 9.3 }] };
        const zip = await RBZip.write({ 'roadbook.json': JSON.stringify(rb), 'media.json': JSON.stringify(media), 'photos/p.avif': new Uint8Array([1, 2, 3]), 'audio/a.webm': new Uint8Array([4, 5, 6, 7]) });
        const { roadbook, media: got } = await RBZip.readBundle(zip);
        expect(roadbook).toEqual(rb);
        const p = got.find((m) => m.name === 'p.avif'), a = got.find((m) => m.name === 'a.webm');
        expect(p.type).toBe('photo'); expect(p.lat).toBe(45.1); expect(p.lon).toBe(9.2); expect(p.blob.type).toBe('image/avif');
        expect([...new Uint8Array(await p.blob.arrayBuffer())]).toEqual([1, 2, 3]);
        expect(a.type).toBe('audio'); expect(a.lat).toBe(45.2); expect(a.blob.type).toBe('audio/webm');
    });

    it('readBundle on a plain-JSON .rdbk yields no media', async () => {
        const rb = { meta: { title: 'J' }, track: [], notes: [] };
        const { roadbook, media } = await RBZip.readBundle(new Blob([JSON.stringify(rb)], { type: 'application/x-roadbook' }));
        expect(roadbook).toEqual(rb); expect(media).toEqual([]);
    });
});
