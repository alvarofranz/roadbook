import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The Recorder's riding screen, the success cue and the plain error reporting (#768 · #764). */
const read = (p) => fs.readFileSync(p, 'utf8');
const html = read('public/recorder/index.html'), rec = read('public/recorder/recorder.js'), app = read('public/assets/js/app.js');

describe('the Recorder while riding (#768)', () => {
    it('is the big Note (40%), Photo over Voice note (40%) and the map’s switches (20%) (#992)', () => {
        expect(html).toMatch(/<div class="rec-capture">\s*<button class="btn btn-primary rec-note" id="recWpt"/);
        expect(html).toContain('.rec-capture { display: grid; grid-template-columns: 2fr 2fr 1fr;');
        expect(html).toMatch(/<div class="rec-col">\s*<button[^>]*id="recPhoto"[\s\S]*?id="recVoice"[\s\S]*?<\/div>\s*<div class="rec-col">\s*<button[^>]*id="recLayer"[\s\S]*?id="recHeading"/);
        expect(html).not.toContain('recUndo');
    });
    it('has no text prompt and no dictation: a voice note keeps only its sound (#992)', () => {
        expect(html + rec).not.toMatch(/recWptAudio|RBWaypointPrompt|SpeechRecognition|voiceLang/);
        expect(app).not.toContain('RBWaypointPrompt');
    });
    it('records a voice note while the button is held, and stops when it is let go (#992)', () => {
        expect(rec).toContain("$('recVoice').addEventListener('pointerdown', (e) => {");
        expect(rec).toContain("['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => $('recVoice').addEventListener(ev, releaseVoice));");
        expect(rec).toContain('dropWaypoint(spot).voice = token; saveSession();');
        expect(html).toContain('<script src="../assets/js/rb-voice.js');
    });
    it('lets an admin start with no usable GPS, fixes of any accuracy kept (#993)', () => {
        expect(rec).toContain("blindStart = !(state === 'good' || state === 'fair') && isAdmin();");
        expect(rec).toContain('if (RB.recJunkFix(c.accuracy) && !blindStart) { renderBar(); return; }');
        expect(rec).toContain('if (blindStart && map && map.map) { const c = map.map.getCenter(); return { lat: c.lat, lon: c.lng }; }');
    });
    it('drops a note at once, with the bell and the big check', () => {
        expect(rec).toMatch(/function dropWaypoint\(spot\) \{[\s\S]*?RBSuccess\.flash\(\);/);
    });
    it('a photo or a voice note drops where its button was pressed, checked only once it is kept (#998)', () => {
        expect(rec).toContain('photoSpot = markSpot();');
        expect(rec).toMatch(/try \{ await RBMediaQueue\.add\('photo'[\s\S]*?return toast\('Could not save\.'\); \}\s*[\s\S]*?if \(spot\) \{ dropWaypoint\(spot\)\.photo = token;/);
        expect(rec).toMatch(/const spot = markSpot\(\); if \(!spot\) return toast\(t\('Waiting for a GPS fix…'\)\);\s*voice = \{ spot, rec: RBVoice\.start/);
        expect(rec).toContain("return at ? { lat: at.lat, lon: at.lon, t: lastFixT || null, at_m: recordedM } : null;"); // taken at the press
        expect(rec).toContain('wpts.splice(at < 0 ? wpts.length : at, 0, note);'); // in its place along the route
    });
    it('a voice note shorter than RBVoice.MIN_S (2 s) is nothing, and says so — in the Editor too (#998)', () => {
        expect(read('public/assets/js/rb-voice.js')).toContain('const MIN_S = 2, MAX_S = 60, VOICE_BITRATE = 24000;');
        const refuse = "if (!clip || clip.seconds < RBVoice.MIN_S)";
        expect(rec).toContain(refuse + " return toast(t('Record at least 2 seconds of audio to attach it to the note.'));");
        expect(read('public/editor/editor.js')).toContain(refuse + " { toast(t('Record at least 2 seconds of audio to attach it to the note.'));");
    });
    it('has no undo on the trail: notes are deleted in the Editor (#992)', () => {
        expect(rec).not.toContain('recUndo');
    });
    it('shows the distance since the last note on the map, the number alone', () => {
        expect(html).toContain('<div class="rec-since" id="recSince">0.00</div>');
        expect(rec).toContain("$('recSince').textContent = ((recordedM - (last ? last.at_m || 0 : 0)) / 1000).toFixed(2);");
    });
    it('puts Pause · End half and half in a bar floating over the tab bar on a phone', () => {
        expect(html).toMatch(/<div class="rec-actions">\s*<button[^>]*id="recPause"[\s\S]*id="recStop"/);
        expect(html).toContain('.rec-actions { display: grid; grid-template-columns: 1fr 1fr;');
        expect(html).toMatch(/@media \(max-width: 1024px\) \{[\s\S]*\.rec-actions \{ position: fixed;[^}]*bottom: calc\(var\(--tabbar-h\) \+ env\(safe-area-inset-bottom\)\)/);
    });
});

describe('the sounds mix with the music of other apps (#842 · #843)', () => {
    it('play through Web Audio in a transient (mixable) session, never a media element', () => {
        const cue = app.slice(app.indexOf('window.RBSuccess = (function () {'), app.indexOf('// Publication-status labels'));
        expect(cue).toContain("navigator.audioSession.type = 'transient'");
        expect(cue).toContain('c.createBufferSource()');
        expect(cue).not.toContain('new Audio(');
    });
    it('resume the context inside the tap, before any await (iOS)', () => {
        expect(app).toContain("const resumed = c.state === 'running' ? null : c.resume();");
    });
    it('end a completed roadbook with the fanfare', () => {
        expect(fs.existsSync('public/assets/sounds/fanfare.mp3')).toBe(true);
        expect(app).toContain("fanfare: () => play('fanfare'),");
    });
});

describe('the success cue (#768)', () => {
    it('is one bell file, shared', () => {
        expect(fs.existsSync('public/assets/sounds/success.mp3')).toBe(true);
        expect(app).toContain("fetch(ROOT + 'assets/sounds/' + name + '.mp3')");
    });
    it('rings in the Reader on every validated note, unlocked by the start tap', () => {
        const reader = read('public/reader/reader.js');
        expect(reader).toContain('const ring = (i) => (i === notes.length - 1 ? RBSuccess.fanfare : RBSuccess.ring)();'); // always on (#936)
        expect(reader.match(/reached\.add\(i\); reanchor\(i \+ 1, [^)]*\); ring\(i\);/g)).toHaveLength(2);
        expect(reader).toContain('RBSuccess.unlock(); // inside the tap itself');
        expect(reader).not.toMatch(/AudioContext|beep\(/);
    });
    it('also marks a note dropped in the Editor’s Adjust on the trail', () => {
        expect(read('public/assets/js/../../editor/editor.js')).toMatch(/function dropWaypoint\(lat, lon\) \{[\s\S]*?RBSuccess\.flash\(\);/);
    });
});

describe('no broken battery readout (#768)', () => {
    it('shows the date where the device gives no battery level', () => {
        const bar = read('public/assets/js/status-bar.js');
        expect(bar).not.toContain("'N/A'");
        expect(bar).toContain("toLocaleDateString(RBi18n.current(), { day: 'numeric', month: 'short' })");
    });
});

describe('sign-in errors are seen and said plainly (#764)', () => {
    const account = read('public/account/account.js');
    it('keeps a failed sign-in generic: it never says which of the two was wrong', () => {
        expect(read('app/auth.php')).toContain("fail('Wrong email/username or password.', 401)");
    });
    it('brings the message into view and closes the keyboard', () => {
        expect(account).toContain("if (!ok) { if (document.activeElement) document.activeElement.blur(); m.scrollIntoView({ behavior: 'smooth', block: 'center' }); }");
        expect(read('public/account/index.html')).toContain('<div id="auth-message" class="auth-message" role="alert" aria-live="assertive" hidden></div>');
    });
    it('explains the failures that are not the user’s', () => {
        expect(account).toContain("'Network error.': 'Could not reach the server — check your connection and try again.'");
        expect(app).toContain("r.json().catch(() => ({ ok: false, error: 'The server did not answer properly — please try again in a moment.' }))");
    });
});

describe('the recording screen fits the phone (#768)', () => {
    it('is one viewport-high column that never scrolls, the map taking what is left', () => {
        expect(html).toContain('body.rec-live { height: 100dvh; overflow: hidden; display: flex; flex-direction: column; }');
        expect(html).toContain('body.rec-live .rec-map-wrap { flex: 1; min-height: 0; }');
        expect(rec).toContain("document.body.classList.toggle('rec-live', recording);");
    });
    it('keeps the shared chips off the controls while recording', () => {
        expect(html).toContain('body.rec-live .app-chip-stack { display: none; }');
    });
});
