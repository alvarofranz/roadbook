# RBZip — ZIP container codec

Tiny, dependency-free ZIP read/write for the `.rdbk` v2 container format (#162).
Uses the platform's native `CompressionStream`/`DecompressionStream` (`deflate-raw`)
— no third-party library, no build step.

> Module: [rbzip.js](../public/assets/js/rbzip.js). Exposes `window.RBZip` (and
> `module.exports` for Node tests). Referenced by the [Editor](editor.md) for
> `.rdbk` export/import and the [Reader](reader.md) for opening `.rdbk` files.

---

## 1. API

| Method | Signature | Returns | Purpose |
|--------|-----------|---------|---------|
| `read` | `read(blob)` | `Promise<{name: Uint8Array}>` | Decompress a ZIP blob → map of filename → bytes |
| `write` | `write({name: string\|Uint8Array})` | `Promise<Blob>` | Compress files → ZIP Blob (`application/x-roadbook`) |
| `readRdbk` | `readRdbk(File)` | `Promise<object>` | Open a `.rdbk` file: ZIP (extracts `roadbook.json`) or plain JSON |
| `readBundle` | `readBundle(File)` | `Promise<{roadbook, media[]}>` | Open a `.rdbk` with optional bundled media (photos/audio + `media.json`) |
| `isZip` | `isZip(bytes4)` | `boolean` | Sniff the `PK\x03\x04` magic number |
| `textOf` | `textOf(Uint8Array)` | `string` | UTF-8 decode |

### `readBundle` media entries

Each media item is `{ type:'photo'|'audio', name, lat, lon, blob }`. Geotags come
from `media.json` inside the container; files without a manifest entry get `lat:
null, lon: null`.

---

## 2. Implementation notes

- **Compression**: `deflate-raw` via the browser's native streams. If deflate does
  not reduce size (tiny or incompressible data), the entry is stored uncompressed
  (method 0).
- **CRC-32**: computed on write for ZIP spec compliance; skipped on read.
- **Plain JSON fallback `readRdbk`**: pre-container `.rdbk` files (JSON-only,
  no ZIP) are detected by the missing `PK` magic and read directly as text.
- **MIME detection**: `mimeOf(name)` maps file extensions for media re-upload
  (avif, jpg, png, webp, webm, ogg, m4a, mp3, wav). Unknown → `application/octet-stream`.

---

## 3. Limits and quirks

- **No ZIP64**: files over 4 GiB or archives with >65535 entries are not supported.
- **No encryption**, no streaming: the entire archive is read/written in memory.
- **`readRdbk` vs `readBundle`**: the former returns only the roadbook object; the
  latter also extracts bundled media. Use `readBundle` when importing a user-supplied
  `.rdbk`, `readRdbk` for a quick open in the Reader.
- **Relies on `CompressionStream`**: available in all modern browsers (Chrome 80+,
  Firefox 113+, Safari 16.4+). Unsupported browsers will throw on `read`/`write`.
