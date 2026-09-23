import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The Recorder's riding screen, the success cue and the plain error reporting (#768 · #764). */
const read = (p) => fs.readFileSync(p, 'utf8');
const html = read('public/recorder/index.html'), rec = read('public/recorder/recorder.js'), app = read('public/assets/js/app.js');

describe('the Recorder while riding (#768)', () => {
    it('is one big Note beside a 2×2 grid: photo · undo · map style · course-up', () => {
        expect(html).toMatch(/<div class="rec-capture">\s*<button class="btn btn-primary rec-note" id="recWpt"/);
        for (const id of ['recPhoto', 'recUndo', 'recLayer', 'recHeading']) expect(html).toMatch(new RegExp(`<div class="rec-grid">[\\s\\S]*id="${id}"`));
    });
    it('has no text prompt, no dictation and no voice note', () => {
        expect(html + rec).not.toMatch(/recWptAudio|RBWaypointPrompt|SpeechRecognition|MediaRecorder|voiceLang/);
        expect(app).not.toContain('RBWaypointPrompt');
    });
    it('drops a note at once, with the bell and the big check', () => {
        expect(rec).toMatch(/function dropWaypoint\(lat, lon\) \{[\s\S]*?RBSuccess\.flash\(\);/);
    });
    it('undoes the last note only after a confirm that names it', () => {
        expect(rec).toContain("if (!(await RBConfirmDanger(t('Delete note') + ' ' + last.num + '?'))) return;");
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
        expect(reader).toContain('const ring = (i) => { if (sound) (i === notes.length - 1 ? RBSuccess.fanfare : RBSuccess.ring)(); };');
        expect(reader.match(/reached\.add\(i\); reanchor\(i \+ 1, [^)]*\); ring\(i\);/g)).toHaveLength(2);
        expect(reader).toContain('if (sound) RBSuccess.unlock();');
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
