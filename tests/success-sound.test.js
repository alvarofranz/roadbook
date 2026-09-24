import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The validation sound survives audio interruptions (#937). iOS interrupts the Web Audio context
   whenever something else touches the audio session (screen lock, a notification, a call…) and
   only a touch may resume it: a GPS validation then waited forever on a resume that never came,
   and the Reader stayed silent for the rest of the run. RBSuccess is lifted out of app.js and run
   against a stub AudioContext. */
const app = fs.readFileSync('public/assets/js/app.js', 'utf8');
const src = app.slice(app.indexOf('window.RBSuccess = (function () {'), app.indexOf('// Publication-status labels'));

function setup() {
    const contexts = [], listeners = {};
    let played = 0;
    class Context {
        constructor() { this.state = 'suspended'; this.destination = {}; contexts.push(this); }
        resume() {
            if (this.state === 'interrupted') return new Promise(() => {}); // iOS: never settles outside a touch
            this.state = 'running'; return Promise.resolve();
        }
        close() { this.state = 'closed'; }
        decodeAudioData(bytes, resolve) { resolve({ decoded: true }); }
        createBufferSource() { return { connect() {}, start() { played++; } }; }
    }
    const window = { AudioContext: Context };
    const document = { addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); }, visibilityState: 'visible', createElement: () => ({}) };
    const fetch = async () => ({ arrayBuffer: async () => new ArrayBuffer(8) });
    const RBSuccess = new Function('window', 'document', 'navigator', 'fetch', 'ROOT', src + '; return window.RBSuccess;')(window, document, {}, fetch, '/');
    const touch = () => (listeners.pointerdown || []).forEach((fn) => fn());
    return { RBSuccess, contexts, touch, played: () => played };
}

describe('the validation sound survives an audio interruption (#937)', () => {
    it('rings after the start tap', async () => {
        const { RBSuccess, played } = setup();
        RBSuccess.unlock();
        await RBSuccess.ring();
        expect(played()).toBe(1);
    });

    it('never hangs on an interrupted context, and one touch brings the sound back', async () => {
        const { RBSuccess, contexts, touch, played } = setup();
        RBSuccess.unlock();
        await RBSuccess.ring();
        contexts[0].state = 'interrupted'; // the screen locked, a notification rang…
        const started = Date.now();
        await RBSuccess.ring(); // a GPS validation: no touch to resume with
        expect(Date.now() - started).toBeLessThan(1500); // it gave up instead of waiting forever
        expect(played()).toBe(1);
        touch(); // any tap on the screen
        expect(contexts).toHaveLength(2); // the interrupted context was replaced, inside the touch
        expect(contexts[0].state).toBe('closed');
        await RBSuccess.ring();
        expect(played()).toBe(2); // and every later validation rings again
    });

    it('a suspended context resumes on the next touch, without a new one', async () => {
        const { RBSuccess, contexts, touch, played } = setup();
        RBSuccess.unlock();
        contexts[0].state = 'suspended';
        touch();
        expect(contexts).toHaveLength(1);
        expect(contexts[0].state).toBe('running');
        await RBSuccess.ring();
        expect(played()).toBe(1);
    });
});
