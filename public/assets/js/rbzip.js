'use strict';
/* RBZip — a tiny, dependency-free ZIP codec for the .rdbk v2 container (#162).
 *
 * A .rdbk file is a ZIP holding `roadbook.json` (the unchanged roadbook schema) plus optional
 * `photos/…` and `audio/…`. Reading and writing use the platform's native deflate
 * (Compression/DecompressionStream 'deflate-raw'); there is no third-party dependency and no
 * build step. The server still stores JSON — the ZIP is only the portable export/import artifact.
 *
 * API: RBZip.read(blob) → { name: Uint8Array } · RBZip.write({ name: bytes|string }) → Blob
 *      RBZip.readRdbk(file) → the roadbook object (accepts both a v2 ZIP and a plain-JSON .rdbk)
 *      RBZip.isZip(bytes4) · RBZip.textOf(bytes) */
(function () {
    const enc = new TextEncoder(), dec = new TextDecoder();

    // CRC-32 (IEEE) — ZIP stores it per entry; we compute it on write and skip it on read.
    const CRC = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
        return t;
    })();
    function crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    // Run bytes through a (de)compression stream and gather the result.
    async function pump(bytes, stream) {
        const w = stream.writable.getWriter(); w.write(bytes); w.close();
        const chunks = []; const r = stream.readable.getReader();
        for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
        let n = 0; for (const c of chunks) n += c.length;
        const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
        return out;
    }
    const deflateRaw = (b) => pump(b, new CompressionStream('deflate-raw'));
    const inflateRaw = (b) => pump(b, new DecompressionStream('deflate-raw'));

    const bytesOf = (v) => typeof v === 'string' ? enc.encode(v) : v;
    const isZip = (b) => b && b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04; // "PK\x03\x04"
    const textOf = (b) => dec.decode(b);

    /* ---- write: files {name → bytes|string} → a ZIP Blob ---- */
    async function write(files) {
        const parts = [];      // the file body: local headers + data, in order
        const central = [];    // central-directory records
        let offset = 0;        // running offset of the next local header
        for (const name of Object.keys(files)) {
            const nameB = enc.encode(name);
            const raw = bytesOf(files[name]);
            const crc = crc32(raw);
            const deflated = await deflateRaw(raw);
            // store uncompressed if deflate didn't help (tiny/incompressible files)
            const store = deflated.length >= raw.length;
            const method = store ? 0 : 8;
            const data = store ? raw : deflated;

            const local = new Uint8Array(30 + nameB.length);
            const ld = new DataView(local.buffer);
            ld.setUint32(0, 0x04034b50, true); ld.setUint16(4, 20, true); ld.setUint16(6, 0, true);
            ld.setUint16(8, method, true); ld.setUint16(10, 0, true); ld.setUint16(12, 0, true); // fixed mod time/date
            ld.setUint32(14, crc, true); ld.setUint32(18, data.length, true); ld.setUint32(22, raw.length, true);
            ld.setUint16(26, nameB.length, true); ld.setUint16(28, 0, true);
            local.set(nameB, 30);
            parts.push(local, data);

            const cen = new Uint8Array(46 + nameB.length);
            const cd = new DataView(cen.buffer);
            cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0, true);
            cd.setUint16(10, method, true); cd.setUint16(12, 0, true); cd.setUint16(14, 0, true);
            cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, raw.length, true);
            cd.setUint16(28, nameB.length, true); cd.setUint16(30, 0, true); cd.setUint16(32, 0, true);
            cd.setUint16(34, 0, true); cd.setUint16(36, 0, true); cd.setUint32(38, 0, true); cd.setUint32(42, offset, true);
            cen.set(nameB, 46);
            central.push(cen);

            offset += local.length + data.length;
        }
        const cdStart = offset;
        let cdSize = 0; for (const c of central) cdSize += c.length;
        const eocd = new Uint8Array(22);
        const ed = new DataView(eocd.buffer);
        ed.setUint32(0, 0x06054b50, true); ed.setUint16(4, 0, true); ed.setUint16(6, 0, true);
        ed.setUint16(8, central.length, true); ed.setUint16(10, central.length, true);
        ed.setUint32(12, cdSize, true); ed.setUint32(16, cdStart, true); ed.setUint16(20, 0, true);
        return new Blob([...parts, ...central, eocd], { type: 'application/x-roadbook' });
    }

    /* ---- read: a ZIP blob → { name → bytes } ---- */
    async function read(blob) {
        const buf = new Uint8Array(await blob.arrayBuffer());
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        // locate the End Of Central Directory record (scan back over its optional comment)
        let eocd = -1;
        for (let i = buf.length - 22; i >= 0; i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
        if (eocd < 0) throw new Error('Not a ZIP');
        const count = dv.getUint16(eocd + 10, true);
        let p = dv.getUint32(eocd + 16, true);
        const out = {};
        for (let n = 0; n < count; n++) {
            if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Bad central directory');
            const method = dv.getUint16(p + 10, true);
            const compSize = dv.getUint32(p + 20, true);
            const nameLen = dv.getUint16(p + 28, true);
            const extraLen = dv.getUint16(p + 30, true);
            const commentLen = dv.getUint16(p + 32, true);
            const localOff = dv.getUint32(p + 42, true);
            const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
            const lNameLen = dv.getUint16(localOff + 26, true);
            const lExtraLen = dv.getUint16(localOff + 28, true);
            const dataStart = localOff + 30 + lNameLen + lExtraLen;
            const data = buf.subarray(dataStart, dataStart + compSize);
            out[name] = method === 0 ? data.slice() : await inflateRaw(data);
            p += 46 + nameLen + extraLen + commentLen;
        }
        return out;
    }

    // MIME from a filename extension, so re-uploaded media carries a type the server recognises.
    function mimeOf(name) {
        const ext = (String(name).split('.').pop() || '').toLowerCase();
        return ({ avif: 'image/avif', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
            webm: 'audio/webm', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav' })[ext] || 'application/octet-stream';
    }

    /* ---- open a .rdbk with its bundled media: { roadbook, media:[{type,name,lat,lon,blob}] } ----
       A plain-JSON .rdbk yields no media. media.json (if present) supplies each file's geotag. */
    async function readBundle(file) {
        const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        if (!isZip(head)) return { roadbook: JSON.parse(await file.text()), media: [] };
        const files = await read(file);
        const rbJson = files['roadbook.json'];
        if (!rbJson) throw new Error('No roadbook.json in the .rdbk container');
        const roadbook = JSON.parse(textOf(rbJson));
        let manifest = {};
        if (files['media.json']) { try { manifest = JSON.parse(textOf(files['media.json'])); } catch (e) {} }
        const coordOf = (path) => (manifest.photos || []).concat(manifest.audio || []).find((x) => x.file === path) || {};
        const media = [];
        for (const path of Object.keys(files)) {
            const type = path.startsWith('photos/') ? 'photo' : path.startsWith('audio/') ? 'audio' : null;
            if (!type) continue;
            const c = coordOf(path);
            media.push({ type, name: path.split('/').pop(), lat: c.lat != null ? c.lat : null, lon: c.lon != null ? c.lon : null, blob: new Blob([files[path]], { type: mimeOf(path) }) });
        }
        return { roadbook, media };
    }

    /* ---- open a .rdbk file: a v2 ZIP (read roadbook.json) or a plain-JSON .rdbk ---- */
    async function readRdbk(file) {
        const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        if (isZip(head)) {
            const files = await read(file);
            const json = files['roadbook.json'];
            if (!json) throw new Error('No roadbook.json in the .rdbk container');
            return JSON.parse(textOf(json));
        }
        return JSON.parse(await file.text());
    }

    const RBZip = { read, write, readRdbk, readBundle, isZip, textOf };
    if (typeof window !== 'undefined') window.RBZip = RBZip;
    if (typeof module !== 'undefined' && module.exports) module.exports = RBZip;
})();
