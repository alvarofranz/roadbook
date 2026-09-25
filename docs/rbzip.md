# RBZip — ZIP container codec

Tiny, dependency-free ZIP read/write for the `.rdbk` container (#162).
Uses the platform's native `CompressionStream`/`DecompressionStream` (`deflate-raw`)
— no third-party library, no build step.

> Module: [rbzip.js](../public/assets/js/rbzip.js). Exposes `window.RBZip` (and
> `module.exports` for Node tests). Referenced by the [Editor](editor.md) for
> `.rdbk` export/import, the [Reader](reader.md) for opening `.rdbk` files and the
> `/validator/` page. The format itself is in [rdbk-format.md](rdbk-format.md).

---

## 1. API

| Method | Signature | Returns | Purpose |
|--------|-----------|---------|---------|
| `read` | `read(blob)` | `Promise<{name: Uint8Array}>` | Decompress a ZIP blob → map of filename → bytes |
| `write` | `write({name: string\|Uint8Array})` | `Promise<Blob>` | Compress files → ZIP Blob (`application/x-roadbook`) |
| `inspect` | `inspect(File)` | `Promise<{container, names, files, doc, docError, manifest, manifestError}>` | What the file holds, unjudged: `container` `'zip'`/`'json'`, every entry name, the parsed `roadbook.json` (`doc`, or `null` + `docError` when missing/not JSON) and `media.json` (`manifest`, `null` when absent, `manifestError` when not JSON) — the validator's input |
| `readRdbk` | `readRdbk(File)` | `Promise<object>` | The raw `.rdbk` document alone (ZIP or bare `roadbook.json`) |
| `readBundle` | `readBundle(File)` | `Promise<{roadbook, media[]}>` | The raw document plus the bundled media (photos/audio + `media.json`); throws `docError` when there is no document |
| `isZip` | `isZip(bytes4)` | `boolean` | Sniff the `PK\x03\x04` magic number |
| `textOf` | `textOf(Uint8Array)` | `string` | UTF-8 decode |

The document these return is **raw**: the caller passes it to `RB.readRoadbook`, which validates it
and derives the computed values.

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
- **Bare `roadbook.json`**: a file without the `PK` magic is read directly as the
  JSON document (`container: 'json'`, no entries, no media).
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
