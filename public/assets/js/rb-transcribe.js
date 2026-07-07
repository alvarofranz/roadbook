'use strict';
/* In-browser voice-note transcription (#133). Whisper via transformers.js (WASM), imported from a
 * CDN ONLY on first use — no server, no recurring cost, works offline once the model is cached by
 * the browser, and the audio never leaves the device. Used by the Editor's "➜ text" button on a
 * note's voice note (Álvaro's ruling: engine (c), smallest multilingual model, lazy-loaded). */
(function () {
    const LIB = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
    const MODEL = 'Xenova/whisper-tiny'; // smallest multilingual; quality is "good enough to edit"
    // Our UI/voice language codes → Whisper language names; anything else → let Whisper auto-detect.
    const LANGS = { en: 'english', 'en-US': 'english', es: 'spanish', 'es-ES': 'spanish', it: 'italian', 'it-IT': 'italian', de: 'german', 'de-DE': 'german', fr: 'french', 'fr-FR': 'french' };

    let libP = null, pipeP = null, readAudio = null;

    function loadLib() {
        if (!libP) libP = import(LIB).then((m) => { readAudio = m.read_audio; return m; });
        return libP;
    }
    // Build the ASR pipeline once; progress_callback reports the one-time model download (0–100%).
    function getPipeline(onProgress) {
        if (!pipeP) pipeP = loadLib().then((m) => m.pipeline('automatic-speech-recognition', MODEL, {
            progress_callback: (p) => { if (onProgress && p && p.status === 'progress') onProgress({ pct: Math.round(p.progress || 0) }); },
        })).catch((e) => { pipeP = null; throw e; }); // let a failed load be retried on the next click
        return pipeP;
    }

    // Transcribe an audio URL (or object URL) → trimmed text. `lang` is one of our codes, or falsy
    // to auto-detect. `onProgress({pct})` fires while the model downloads (first use only).
    async function run(url, opts) {
        opts = opts || {};
        const transcriber = await getPipeline(opts.onProgress);
        const audio = await readAudio(url, 16000);         // decode + resample to 16 kHz mono
        const lang = LANGS[opts.lang] || null;
        const out = await transcriber(audio, Object.assign({ task: 'transcribe', chunk_length_s: 30 }, lang ? { language: lang } : {}));
        return ((out && out.text) || '').trim();
    }

    window.RBTranscribe = { run, ready: () => !!pipeP };
})();
