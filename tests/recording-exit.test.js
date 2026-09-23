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

const finishModal = recorder.match(/function finishModal\(\) \{[\s\S]*?\n {4}\}\n/)[0];
const finishedModal = gpx.match(/function finishedModal\(finished, name, onDone = \(\) => \{\}\) \{[\s\S]*?\n {4}\}\n/)[0];

describe('the crash checkpoint stays on until the recording lands somewhere', () => {
    it('Stop hands over the track without clearing it', () => {
        // end() keeps the checkpoint; the old finish() cleared it the instant recording stopped,
        // which switched the net off while the finish options were still the only copy on screen
        expect(recorder).toContain('RBGpxRecorder.end()');
        expect(recorder).not.toContain('RBGpxRecorder.finish()');
        expect(gpx).not.toMatch(/function finish\(\)/);        // and the clearing variant is gone
        expect(gpx).toContain('settings, begin, stop, handOver, end, clearCheckpoint,');
    });

    it('a track too short to keep clears it, since no modal will offer it', () => {
        const stop = recorder.match(/\$\('recStop'\)\.onclick = async \(\) => \{[\s\S]*?\n {4}\};/)[0];
        // …after naming what would be lost when notes/photos were captured (#647), No going back to recording
        expect(stop).toContain("discardRecording(); return toast(t('Route too short to save.'));");
        // …and a No resumes from every point end() handed over, with the clock frozen meanwhile
        expect(stop).toContain('RBGpxRecorder.resume(r.name, r.pts); startMeter(); return;');
        expect(stop).toMatch(/Finish the recording\?'\)\)\)\) return;\n\s+elapsedAcc = elapsed\(\); segStart = 0;/);
    });

    it('every outcome clears it, and nothing else does (#791)', () => {
        // saved into the draft · discarded after the confirm; the sign-in stash replaces the two
        // others and stays until the save lands
        expect((finishModal.match(/clearRecording\(\);/g) || []).length).toBe(1);
        expect((finishModal.match(/discardRecording\(\);/g) || []).length).toBe(1);
        expect(finishModal).toContain('RBGpxRecorder.clearCheckpoint(); clearSession(); // the stash is the copy now');
        // a failed save keeps it: the button resets and the recording is still there
        expect(finishModal).toContain("if (!built) { busy.reset(); return; }");
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

    it('the Recorder asks one question: Save or Discard (#791)', () => {
        expect(finishModal).toContain('id="rfDiscard"');
        expect(finishModal).toContain('id="rfSave"');
        expect(finishModal).not.toMatch(/rfClose|rfDl|rfEd|rfRdbk|Export/);
        // saving opens the Editor on the saved draft
        expect(finishModal).toContain("location.href = '../editor/?rb=' + built.id;");
    });

    it('no exit is wired straight to dismiss', () => {
        expect(finishModal).toContain("if (!(await RBConfirmDanger(t('Discard this recording?') + '<br>' + summary))) return;");
    });
});

describe('the save spins through the shared primitive', () => {
    it('uses RBBusy rather than a hand-rolled spinner', () => {
        expect(finishModal).toContain("const busy = RBBusy(d.q('#rfSave'));");
        expect(finishModal).not.toContain('fa-spinner fa-spin');
    });
});

describe('a finished recording survives a crash until it lands (#647 · #686)', () => {
    const fs = require('fs');
    const rec = fs.readFileSync('public/recorder/recorder.js', 'utf8');
    const gpx = fs.readFileSync('public/assets/js/gpx-recorder.js', 'utf8');
    it('Stop keeps notes, photos and the draft in a finishing checkpoint, reopened on the next visit', () => {
        expect(rec).toContain('holdFinished(r.pts, r.name, false);');
        expect(rec).toContain('if (session && session.finishing && session.pts)');
    });
    it('what changes on the finish options (a photo landing, the draft created) reaches that checkpoint', () => {
        const save = rec.match(/function saveSession\(\) \{[\s\S]*?\n {4}\}/)[0];
        expect(save).toContain('if (RBGpxRecorder.recording) RBCheckpoint.write(SESSION_KEY,');
        expect(save).toContain('else if (finished) RBCheckpoint.write(finished.stashed ? PENDING_SAVE : SESSION_KEY, finishedRecord());');
        // the finish options keep the version auto-refresh away until the recording lands
        expect(rec).toMatch(/function holdFinished\(pts, name, stashed\) \{[\s\S]*?window\.RB_BUSY = true;[\s\S]*?saveSession\(\);/);
        expect(rec).toMatch(/function clearRecording\(\) \{[\s\S]*?finished = null; window\.RB_BUSY = false;/);
    });
    it('a queued capture creates no draft on a page that holds no recording', () => {
        const ensure = rec.match(/function ensureDraft\(\) \{[\s\S]*?\n {4}\}/)[0];
        expect(ensure).toContain('if (!meUser || (!RBGpxRecorder.recording && !finished)) return Promise.resolve(null);');
    });
    it('a new log replaces the old checkpoint at once, so a crash before its first point never resumes the old track', () => {
        const begin = gpx.match(/function begin\(opts = \{\}\) \{[\s\S]*?\n {4}\}/)[0];
        expect(begin).toContain('if (useCheckpoint) RBCheckpoint.write(CHECKPOINT_KEY, { pts, name: fileName });');
    });
    it('declining the GPX recovery keeps the recording, and Yes does not drop it early', () => {
        const offer = gpx.match(/async function offerRecovery\(\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(offer).not.toContain('removeItem');
        expect(offer).toContain('decline();'); // marked, never deleted (#436)
        expect(gpx).toContain('const decline = () => RBCheckpoint.decline(CHECKPOINT_KEY);');
        expect(offer).toContain('saved.declined) return;');
    });
    it('a declined Reader run still offers back the GPX it was logging', () => {
        const reader = fs.readFileSync('public/reader/reader.js', 'utf8');
        expect(reader).toMatch(/declineSession\(\);\s*await RBGpxRecorder\.offerRecovery\(\);/);
    });
});
