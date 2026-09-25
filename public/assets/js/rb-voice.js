'use strict';
/* RBVoice — records a voice note into a data: URI, the `audio` of a note's `voice` block (#992):
 * the Recorder (hold the button), the Editor (the Voice note extra). One small, speech-sized clip:
 * mono at VOICE_BITRATE, at most MAX_S seconds, so a roadbook carries its voice notes inside it.
 * RBVoice.supported · RBVoice.start({ onTick(seconds) }) → Promise<{ stop() → Promise<dataURI|null> }>
 * (rejects when there is no microphone or it is refused). */
(function () {
    const MAX_S = 60, VOICE_BITRATE = 24000;
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
                if (!chunks.length) return resolve(null);
                const blob = new Blob(chunks, { type: (recorder.mimeType || 'audio/webm').split(';')[0] });
                try { resolve(await toDataURL(blob)); } catch (e) { resolve(null); }
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
    window.RBVoice = { supported, start, MAX_S };
})();
