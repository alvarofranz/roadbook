# RBTranscribe — in-browser voice note transcription

Transcribes voice notes directly in the browser using **Whisper** via
[transformers.js](https://github.com/xenova/transformers.js) (WASM). No server,
no recurring cost, works offline once the model is cached.

> Module: [rb-transcribe.js](../public/assets/js/rb-transcribe.js). Exposes
> `window.RBTranscribe`. Referenced by the [Editor](editor.md) §6.2 for the
> "➜ text" button on voice notes.

---

## 1. API

| Method | Signature | Purpose |
|--------|-----------|---------|
| `run` | `run(audioUrl, opts?)` | Transcribe an audio URL → trimmed text |
| `ready` | `ready()` (getter) | `true` if the pipeline has been loaded |

### `run` options

| Option | Type | Default | Effect |
|--------|------|---------|--------|
| `lang` | string | auto-detect | UI language code (`en`, `es`, `it`, `de`, `fr` or `<code>-<CODE>` variants). Mapped to Whisper language names; unlisted → auto-detect |
| `onProgress` | `fn({pct})` | — | Fires during the one-time model download (0–100%) |

---

## 2. Implementation details

- **Model**: [`Xenova/whisper-tiny`](https://huggingface.co/Xenova/whisper-tiny),
  the smallest multilingual Whisper variant (~150 MB). Chosen as "good enough to
  edit" per product decision.
- **Library**: loaded from CDN (`@xenova/transformers@2.17.2`) **only on first
  use** — no upfront cost.
- **Audio never leaves the device**: the entire pipeline runs inside the browser's
  WASM runtime.
- **Language mapping** (`LANGS`): UI codes (`en`, `en-US`, `es`, `es-ES`, `it`,
  `it-IT`, `de`, `de-DE`, `fr`, `fr-FR`) → Whisper names. Unknown codes → auto-detect.
- **`getPipeline`** is memoised: subsequent calls reuse the loaded pipeline.
  A failed load resets the promise so a retry is possible.

---

## 3. Limits and quirks

- **First use downloads ~150 MB** (the model, cached by the browser). A modal
  warns the user before the download starts (handled by the Editor, not this module).
- **`whisper-tiny` quality**: adequate for short voice notes; accuracy degrades
  with background noise, strong accents, or technical terms.
- **Audio format**: the browser's `read_audio` handles resampling to 16 kHz mono;
  the original file is never uploaded (privacy by design).
- **The library is loaded from CDN**: the first transcription requires internet.
  Once cached by the browser/service worker, subsequent uses work offline.
- **Only transcription, not translation**: the `task` is always `'transcribe'`;
  Whisper outputs text in the spoken language, even when a specific `lang` is
  given.
