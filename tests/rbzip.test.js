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

describe('RBZip — foreign ZIPs (extra fields, comments, data descriptors)', () => {
    const enc = new TextEncoder();
    // Write a minimal ZIP with one stored entry, an EOCD comment, extra fields in the
    // central directory, and a data descriptor after the local file (bit 3 set on
    // the general-purpose flags). This exercises the EOCD back-scan (comment shifts the
    // 0x06054b50 signature) and the reader's extra-field / descriptor handling.

    function le16(n) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; }
    function le32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; }
    function sig(s) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, s, true); return b; }

    function foreignZip(comment, extraField) {
        const name = 'roadbook.json';
        const nameBytes = enc.encode(name);
        const body = enc.encode(JSON.stringify({ v: 1 }));
        const extra = extraField || new Uint8Array(0);
        // local file header: bit 3 set → data descriptor follows
        const gpFlags = le16(0x0008);
        const local = new Uint8Array(30 + nameBytes.length + body.length + 16);
        let p = 0;
        local.set(sig(0x04034b50), p); p += 4;          // local file header sig
        local.set(le16(20), p); p += 2;                   // version (2.0)
        local.set(gpFlags, p); p += 2;                    // general-purpose flags (bit 3)
        local.set(le16(0), p); p += 2;                    // compression (stored)
        local.set(le32(0), p); p += 4;                    // mod time/date (zero)
        local.set(le32(body.length), p); p += 4;          // crc32 (in descriptor)
        local.set(le32(body.length), p); p += 4;          // compressed size
        local.set(le32(body.length), p); p += 4;          // uncompressed size
        local.set(le16(nameBytes.length), p); p += 2;     // name length
        local.set(le16(0), p); p += 2;                    // extra length (no extra in local)
        local.set(nameBytes, p); p += nameBytes.length;
        local.set(body, p); p += body.length;
        // data descriptor
        local.set(sig(0x08074b50), p); p += 4;
        local.set(le32(0), p); p += 4;                    // crc32
        local.set(le32(body.length), p); p += 4;          // compressed size
        local.set(le32(body.length), p); p += 4;          // uncompressed size
        // central directory entry
        const cd = new Uint8Array(46 + nameBytes.length + extra.length);
        let c = 0;
        cd.set(sig(0x02014b50), c); c += 4;               // central dir sig
        cd.set(le16(20), c); c += 2;                       // version made by
        cd.set(le16(20), c); c += 2;                       // version needed
        cd.set(gpFlags, c); c += 2;                        // flags
        cd.set(le16(0), c); c += 2;                        // compression
        cd.set(le32(0), c); c += 4;                        // mod time
        cd.set(le32(0), c); c += 4;                        // crc32
        cd.set(le32(body.length), c); c += 4;              // compressed size
        cd.set(le32(body.length), c); c += 4;              // uncompressed size
        cd.set(le16(nameBytes.length), c); c += 2;         // name length
        cd.set(le16(extra.length), c); c += 2;             // extra length
        cd.set(le16(comment.length), c); c += 2;           // file comment length
        cd.set(le32(0), c); c += 4;                        // disk start
        cd.set(le32(0), c); c += 4;                        // internal attrs
        cd.set(le32(0), c); c += 4;                        // external attrs
        cd.set(le32(0), c); c += 4;                        // local header offset
        cd.set(nameBytes, c); c += nameBytes.length;
        cd.set(extra, c); c += extra.length;
        // EOCD with comment
        const commentBytes = enc.encode(comment);
        const eocd = new Uint8Array(22 + commentBytes.length);
        let e = 0;
        eocd.set(sig(0x06054b50), e); e += 4;
        eocd.set(le16(0), e); e += 2;
        eocd.set(le16(0), e); e += 2;
        eocd.set(le16(1), e); e += 2;                      // entries on this disk
        eocd.set(le16(1), e); e += 2;                      // total entries
        eocd.set(le32(cd.length), e); e += 4;              // cd size
        eocd.set(le32(local.length), e); e += 4;           // cd offset
        eocd.set(le16(commentBytes.length), e); e += 2;
        eocd.set(commentBytes, e);
        return new Uint8Array([...local, ...cd, ...eocd]);
    }

    it('reads a ZIP with an EOCD comment (back-scan works around the trailing text)', async () => {
        const buf = foreignZip('This archive was made by OpenCPN.', new Uint8Array(0));
        const files = await RBZip.read(new Blob([buf]));
        expect(JSON.parse(RBZip.textOf(files['roadbook.json']))).toEqual({ v: 1 });
    });

    it('reads a ZIP with extra fields in the central directory (reader skips past them)', async () => {
        const extra = new Uint8Array([0x41, 0x00, 4, 0, 0, 0, 0, 0]); // a fake extra-field record (8 bytes)
        const buf = foreignZip('test', extra);
        const files = await RBZip.read(new Blob([buf]));
        expect(JSON.parse(RBZip.textOf(files['roadbook.json']))).toEqual({ v: 1 });
    });

    it('reads a ZIP with both extra fields AND an EOCD comment', async () => {
        const extra = new Uint8Array([0x55, 0x54, 5, 0, 0x07, 0xe6, 0x07, 0x0a, 0x10, 0x00, 0x00]); // typical Unix timestamp extra
        const buf = foreignZip('Generated by OSX zip', extra);
        const files = await RBZip.read(new Blob([buf]));
        expect(JSON.parse(RBZip.textOf(files['roadbook.json']))).toEqual({ v: 1 });
    });

    it('throws "Not a ZIP" for a plain non-ZIP blob', async () => {
        await expect(RBZip.read(new Blob([enc.encode('hello world')]))).rejects.toThrow('Not a ZIP');
    });
});
