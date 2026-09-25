'use strict';
/* RBVoice — records a voice note into a data: URI, the `audio` of a note's `voice` block (#992):
 * the Recorder (hold the button), the Editor (the Voice note extra). One small, speech-sized clip:
 * mono at VOICE_BITRATE, at most MAX_S seconds, so a roadbook carries its voice notes inside it; a
 * clip under MIN_S seconds is not a voice note (a slip of the finger), and both callers refuse it.
 * RBVoice.supported · RBVoice.start({ onTick(seconds) }) → Promise<{ stop() → Promise<{ audio, seconds }|null> }>
 * (rejects when there is no microphone or it is refused).
 * A clip waiting on the device (the Recorder's, until the recording is saved into its roadbook) lives
 * in IndexedDB, never in a localStorage checkpoint — that one is small (~5 MB) and rewritten every
 * second: RBVoice.keep(audio) → token · RBVoice.clip(token) → audio · RBVoice.forget(tokens). */
(function () {
    const MIN_S = 2, MAX_S = 60, VOICE_BITRATE = 24000;
    const supported = !!(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined');
    const toDataURL = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
    async function start({ onTick } = {}) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
        let recorder;
        try { recorder = new MediaRecorder(stream, { audioBitsPerSecond: VOICE_BITRATE }); }
        catch (e) { recorder = new MediaRecorder(stream); } // a browser that refuses the bitrate records at its own
        const chunks = [], started = Date.now();
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        const finished = new Promise((resolve) => {
            recorder.onstop = async () => {
                stream.getTracks().forEach((tr) => tr.stop());
                clearInterval(timer);
                const seconds = (Date.now() - started) / 1000;
                if (!chunks.length) return resolve(null);
                const blob = new Blob(chunks, { type: (recorder.mimeType || 'audio/webm').split(';')[0] });
                try { resolve({ audio: await toDataURL(blob), seconds }); } catch (e) { resolve(null); }
            };
        });
        const stop = () => { if (recorder.state !== 'inactive') recorder.stop(); return finished; };
        const timer = setInterval(() => {
            const s = Math.floor((Date.now() - started) / 1000);
            if (onTick) onTick(s);
            if (s >= MAX_S) stop();
        }, 250);
        recorder.start();
        if (onTick) onTick(0);
        return { stop, started };
    }
    const STORE = 'clips';
    let opening = null;
    const open = () => opening || (opening = new Promise((resolve, reject) => {
        const req = indexedDB.open('rb_voice', 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { opening = null; reject(req.error); };
    }));
    // one transaction; resolves with the request's result once it is committed
    async function inStore(mode, work) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode), req = work(tx.objectStore(STORE));
            tx.oncomplete = () => resolve(req ? req.result : undefined);
            tx.onerror = tx.onabort = () => reject(tx.error);
        });
    }
    async function keep(audio) {
        const token = 'v' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        await inStore('readwrite', (store) => store.put(audio, token));
        return token;
    }
    const clip = (token) => inStore('readonly', (store) => store.get(token));
    const forget = (tokens) => inStore('readwrite', (store) => { tokens.forEach((token) => store.delete(token)); });
    window.RBVoice = { supported, start, MIN_S, MAX_S, keep, clip, forget };
})();
