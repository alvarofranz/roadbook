import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* A modal holding the only copy of a recording (#460).
   The Recorder's finish options ended in a plain "Close" wired to dismiss: pressing it abandoned
   the track, the waypoints, the photos and the voice notes in silence — and the Stop before it had
   already cleared the crash checkpoint, so the safety net was off too. Both finish modals now hold
   one contract, and this pins it. */

const read = (p) => fs.readFileSync(p, 'utf8');
const recorder = read('public/recorder/recorder.js');
const gpx = read('public/assets/js/gpx-recorder.js');

const finishModal = recorder.match(/function finishModal\(pts, name, savedId\) \{[\s\S]*?\n {4}\}\n/)[0];
const finishedModal = gpx.match(/function finishedModal\(finished, name\) \{[\s\S]*?\n {4}\}\n/)[0];

describe('the crash checkpoint stays on until the recording lands somewhere', () => {
    it('Stop hands over the track without clearing it', () => {
        // end() keeps the checkpoint; the old finish() cleared it the instant recording stopped,
        // which switched the net off while the finish options were still the only copy on screen
        expect(recorder).toContain('RBGpxRecorder.end()');
        expect(recorder).not.toContain('RBGpxRecorder.finish()');
        expect(gpx).not.toMatch(/function finish\(\)/);        // and the clearing variant is gone
        expect(gpx).toContain('settings, begin, stop, end, clearCheckpoint,');
    });

    it('a track too short to keep clears it, since no modal will offer it', () => {
        const stop = recorder.match(/\$\('recStop'\)\.onclick = async \(\) => \{[\s\S]*?\n {4}\};/)[0];
        // …after naming what would be lost when notes/photos were captured (#647), No going back to recording
        expect(stop).toContain("clearSession(); RBGpxRecorder.clearCheckpoint(); return toast(t('Route too short to save.'));");
        expect(stop).toContain('RBGpxRecorder.resume(r.name); startMeter(); return;');
    });

    it('every destination clears it, and nothing else does', () => {
        // save · export .rdbk · export GPX · open in the editor · the stash before sign-in
        expect((finishModal.match(/\bland\(\)/g) || []).length).toBe(5);
        expect(finishModal).toContain('const land = () => { landed = true; RBGpxRecorder.clearCheckpoint(); clearSession(); renderExit(); };');
    });
});

describe('both finish modals share one exit contract (#217 · #460)', () => {
    for (const [name, src] of [['the Recorder', finishModal], ['Reader/Tripmaster', finishedModal]]) {
        it(`${name}: cannot be dismissed by a backdrop tap or Escape`, () => {
            expect(src).toContain('{ dismissable: false }');
        });

        it(`${name}: the destructive exit asks first and names what goes`, () => {
            expect(src).toContain('RBConfirmDanger');
            expect(src).toContain("t('Discard this recording?') + '<br>' + summary");
            expect(src).toContain('fa-trash');
        });
    }

    it('the Recorder exit reads Discard while the recording is the only copy, Close once it is safe', () => {
        expect(finishModal).toContain("b.innerHTML = landed ? t('Close') : '<i class=\"fa-solid fa-trash-can\"></i> ' + t('Discard');");
        expect(finishModal).toContain("b.className = 'btn ' + (landed ? 'btn-ghost' : 'btn-danger');");
        // …and a recording already saved (back from the sign-in redirect) starts in that safe state
        expect(finishModal).toContain('let landed = !!savedId;');
    });

    it('no exit is wired straight to dismiss', () => {
        expect(recorder).not.toContain("d.q('#rfClose').onclick = d.close;");
        expect(finishModal).toContain("if (!landed && !(await RBConfirmDanger(");
    });
});

describe('the finish options spin through the shared primitive', () => {
    it('both async actions use RBBusy rather than a fourth hand-rolled spinner', () => {
        expect(finishModal).toContain('const busy = RBBusy(btn);');
        expect((finishModal.match(/busy\.reset\(\);/g) || []).length).toBe(2); // save · export .rdbk
        expect(finishModal).not.toContain('fa-spinner fa-spin');
    });

    it('a completed destination keeps its own tick — the modal is a checklist', () => {
        // RBBusy's tick is transient by design; here each destination stays marked while the
        // modal is open, so you can see what you have already done and still do the rest
        expect(finishModal).toContain('markDone(btn, ');
    });
});

describe('a finished recording survives a crash until it lands (#647 · #686)', () => {
    const fs = require('fs');
    const rec = fs.readFileSync('public/recorder/recorder.js', 'utf8');
    const gpx = fs.readFileSync('public/assets/js/gpx-recorder.js', 'utf8');
    it('Stop keeps notes, photos and the draft in a finishing checkpoint, reopened on the next visit', () => {
        expect(rec).toContain('saveFinishing(r.pts, r.name);');
        expect(rec).toContain('if (session && session.finishing && session.pts)');
    });
    it('declining the GPX recovery keeps the recording, and Yes does not drop it early', () => {
        const offer = gpx.match(/async function offerRecovery\(\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(offer).not.toContain('removeItem');
        expect(offer).toContain('declined: true');
        expect(offer).toContain('saved.declined) return;');
    });
});
