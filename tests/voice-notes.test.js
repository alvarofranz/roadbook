import { describe, it, expect } from 'vitest';
import fs from 'fs';
import RB from '../public/assets/js/roadbook-core.js';

/* Maurizio's round (#988–#994): voice notes as a note's extra, the Recorder's admin blind start, the
   Turnstile that must show in Firefox, the event header on a phone, the run links in the app and one
   icon per tool. */
const read = (p) => fs.readFileSync(p, 'utf8');
const trkpts = [{ lat: 45, lon: 9 }, { lat: 45, lon: 9.001 }, { lat: 45.001, lon: 9.002 }];
const AUDIO = 'data:audio/webm;base64,GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKChHdlYm0=';

describe('a voice note is a note’s extra, inside the roadbook (#992)', () => {
    it('is written with its sound and its lead distance, nothing else', () => {
        const rb = RB.buildRoadbook({ name: 'v', trkpts, wpts: [{ lat: 45, lon: 9.001, name: 'x', blocks: [{ type: 'voice', audio: AUDIO, lead_distance: 150 }] }] });
        const doc = RB.writeRoadbook(rb);
        const note = doc.notes.find((n) => n.blocks);
        expect(note.blocks).toEqual([{ type: 'voice', audio: AUDIO, lead_distance: 150 }]);
        expect(RB.validateRoadbook(doc).valid).toBe(true);
        expect(RB.voiceLead(note.blocks[0])).toBe(150);
        expect(RB.voiceLead({ type: 'voice', audio: AUDIO })).toBe(100); // by default 100 m before
    });
    it('the default distance is left out, and a voice block without sound is refused', () => {
        const rb = RB.buildRoadbook({ name: 'v', trkpts, wpts: [{ lat: 45, lon: 9.001, name: 'x', blocks: [{ type: 'voice', audio: AUDIO, lead_distance: 100 }] }] });
        expect(RB.writeRoadbook(rb).notes.find((n) => n.blocks).blocks[0]).toEqual({ type: 'voice', audio: AUDIO });
        const doc = RB.writeRoadbook(rb);
        doc.notes.find((n) => n.blocks).blocks[0].audio = 'data:image/png;base64,AA';
        expect(RB.validateRoadbook(doc).errors[0].message).toBe('Must be an audio data: URI.');
    });
    it('is never drawn as a row or printed: it is heard', () => {
        expect(RB.blockHasContent({ type: 'voice', audio: AUDIO })).toBe(true);
        for (const p of ['public/assets/js/note-canvas.js', 'public/editor/editor.js']) expect(read(p)).toContain('filter((b) => b.image || b.text)');
        expect(read('public/assets/js/rb-pdf.js')).toContain("if (b.image || b.text) sheet.push({ block: b });");
    });
    it('the Reader plays each voice note once, at its distance before the note', () => {
        const reader = read('public/reader/reader.js');
        expect(reader).toContain("if (b.type !== 'voice' || !b.audio || voicePlayed.has(key) || left > RB.voiceLead(b)) return;");
        expect(reader).toContain('voiceTick(here);');
        expect(reader).toContain('voicePlayed = new Set(); // a new run hears every voice note again');
        expect(reader).toContain('liveEnd(); stopVoiceNotes();');
    });
    it('the Editor records it as the fourth extra, with its lead distance', () => {
        const editor = read('public/editor/editor.js');
        expect(editor).toContain('if (kind.audio) return renderVoicePanel(n, kind, b);');
        expect(editor).toContain("if (isFinite(v) && v > 0 && v !== RB.VOICE_LEAD_M) b.lead_distance = v; else delete b.lead_distance;");
        expect(read('public/editor/index.html')).toContain('<script src="../assets/js/rb-voice.js');
    });
    it('one recorder for both: a speech-sized clip, at most a minute', () => {
        const voice = read('public/assets/js/rb-voice.js');
        expect(voice).toContain('const MAX_S = 60, VOICE_BITRATE = 24000;');
        expect(voice).toContain('new MediaRecorder(stream, { audioBitsPerSecond: VOICE_BITRATE })');
    });
});

describe('the rest of the round', () => {
    it('Turnstile renders when its box is on screen, and a failure says so with a retry (#988)', () => {
        const app = read('public/assets/js/app.js');
        expect(app).toContain('if (el.offsetParent) render();');
        expect(app).toContain('const seen = new IntersectionObserver(');
        expect(app).toContain("'error-callback': () => { failed(); return true; }");
    });
    it('the event header gives the Manage button its own row on a phone (#989)', () => {
        expect(read('public/event/index.html')).toContain('@media (max-width: 640px) { .ev-head { flex-wrap: wrap; } .ev-head .btn { flex-basis: 100%; justify-content: center; } }');
    });
    it('a completed run links to the site’s own page, opened outside the app (#990)', () => {
        const ch = read('public/challenge/challenge.js');
        expect(ch).toContain("RBPublicLink('/run/' + r.id)");
        expect(ch).toContain("(RBIsNativeApp() ? ' target=\"_blank\" rel=\"noopener\"' : '')");
    });
    it('the Editor wears the pencil everywhere, the same as every Edit (#994)', () => {
        expect(read('public/assets/js/app.js')).toContain("editor:    { path: 'editor/',    label: 'Editor',    icon: 'fa-pen' },");
        for (const p of ['public/index.html', 'public/features/editor/index.html', 'public/wiki/index.html']) expect(read(p), p).not.toContain('fa-pen-ruler');
    });
});
