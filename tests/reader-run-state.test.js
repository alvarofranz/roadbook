import { describe, it, expect } from 'vitest';
import fs from 'fs';
import RB from '../public/assets/js/roadbook-core.js';

/* The Reader's run as a whole: what a resumed run keeps, what ending one does with its GPX log,
   what a note passed over still counts for, and what a run finished early is charged. */
const read = (p) => fs.readFileSync(p, 'utf8');
const js = read('public/reader/reader.js');
const html = read('public/reader/index.html');
const gpx = read('public/assets/js/gpx-recorder.js');
const fn = (name) => js.match(new RegExp('function ' + name + '\\([^)]*\\) \\{([\\s\\S]*?)\\n {4}\\}'))[1];

describe('a resumed run is the same run', () => {
    it('the checkpoint carries the roadbook slug, the event and what the visit was for', () => {
        expect(fn('saveSession')).toContain('const s = { openedAs, rbSlug, eventSlug, competition,');
        expect(fn('resumeSession')).toContain('rbSlug = s.rbSlug; eventSlug = s.eventSlug; openedAs = s.openedAs;');
    });
    it('the slug is the loaded roadbook’s own, never the last piece of the URL', () => {
        expect(js).not.toContain("location.pathname.replace(/\\/+$/, '').split('/').pop()");
        expect(fn('loadRb')).toContain("rbSlug = slug || '';");
        expect(js.match(/loadRb\(j\.roadbook, j\.id, j\.slug\)/g).length).toBe(4); // public · ?rb= · ?admin_rb= · My roadbooks
    });
    it('nothing is checkpointed once the run is over', () => {
        expect(fn('saveSession')).toContain('if (!meter || finished) return;');
    });
});

describe('opening another roadbook during a run', () => {
    it('a file from the OS asks first, naming the run, and ends it properly', () => {
        const consumer = js.match(/launchQueue\.setConsumer\(async \(params\) => \{([\s\S]*?)\n {8}\}\);/)[1];
        expect(consumer).toContain('if (meter && !finished) {');
        expect(consumer).toContain("RBConfirmDanger(t('Open this file and leave the run in progress? Your progress on the notes will be lost.') + '<br><b>' + what + '</b>')");
        expect(consumer.indexOf('await endRun();')).toBeLessThan(consumer.indexOf('resetRun();'));
    });
    it('a new navigation never leaves the previous watch running', () => {
        const start = fn('startNav');
        expect(start.indexOf('if (meter) meter.stop();')).toBeLessThan(start.indexOf('meter = new RBGpsMeter('));
    });
});

describe('notes passed over', () => {
    it('still change the speed limit, on every path that skips', () => {
        expect(js).toContain('function passOver(from, to) { for (let k = from; k < to; k++) passLimit(notes[k], isScored(k)); }');
        expect(fn('setActiveNote')).toContain('if (!competition) { passOver(activeIdx, i);');
        expect(fn('setActiveNote')).toContain('passOver(activeIdx, i);\n        validateAt(i, lastHere);');
        expect(fn('autoValidate')).toContain('passOver(activeIdx, i);');
        expect(fn('advanceNote')).toContain('passOver(i, i + 1);');
    });
});

describe('finishing early', () => {
    it('charges the unreached notes as skipped before the result is signed', () => {
        const fin = fn('finishRun');
        expect(fin).toContain('if (competition) pen.skip += RB.skipPenalty(scoredSet, activeIdx, notes.length);');
        expect(fin.indexOf('RB.skipPenalty(')).toBeLessThan(fin.indexOf('await signedResult()'));
        // five scored notes, two reached: three skips — and none once the last note is reached
        expect(RB.skipPenalty(null, 2, 5)).toBe(3 * RB.CONST.P_SKIP);
        expect(RB.skipPenalty(null, 5, 5)).toBe(0);
    });
    it('the open zone is scored only when the note it ends on is', () => {
        expect(fn('finishRun')).toContain('closeZone(isScored(Math.min(activeIdx, notes.length - 1)));');
    });
});

describe('ending a run ends its GPX log (#460)', () => {
    it('Done and Leave both go through endRun, which hands the log to its finished-track modal', () => {
        expect(fn('endRun')).toContain('if (RBGpxRecorder.recording) await RBGpxRecorder.handOver();');
        const leave = fn('leaveRun');
        expect(leave.indexOf("closeModal('reportModal');")).toBeLessThan(leave.indexOf('await endRun();'));
        expect(leave.indexOf('await endRun();')).toBeLessThan(leave.indexOf('location.href = to;'));
    });
    it('the recorder’s handOver resolves when its modal is done, and Stop is handOver after a question', () => {
        expect(gpx).toContain('if (r.pts.length >= 2) return new Promise((done) => finishedModal(r.pts, r.name, done));');
        expect(gpx).toMatch(/async function stop\(\) \{\s*if \(!\(await RBConfirm\(RBt\('Stop recording\?'\)\)\)\) return;\s*return handOver\(\);/);
    });
    it('the finished-track Discard is a danger button that confirms what it throws away', () => {
        expect(gpx).toContain(`<button class="btn btn-danger" id="trDiscard"><i class="fa-solid fa-trash"></i> \${t('Discard')}</button>`);
        expect(gpx).toContain("if (!(await RBConfirmDanger(t('Discard this recording?') + '<br>' + summary))) return;");
        expect(gpx).not.toContain('trClose');
    });
});

describe('Navigate navigates (#936)', () => {
    it('opens no dialog: no options, no GPX question, no sound switch', () => {
        for (const old of ['startModal', 'openStartDialog', 'readStartOpts', 'startGo', 'optGpx', 'optSound', 'modeModal']) {
            expect(js, old).not.toContain(old);
            expect(html, old).not.toContain(old);
        }
        expect(js).toContain('function startRun(comp) { auto = true; startNav(comp); RBGpxRecorder.begin(); }'); // the GPX log always runs
    });
    it('asks only the vehicle number, and only for a scored run; its Cancel goes back to the preview', () => {
        expect(js).toContain("if (!comp) return startRun(false);");
        expect(js).toContain("$('teamCancel').onclick = () => closeModal('teamModal'); // back to the preview");
    });
});

describe('the way back to the event', () => {
    it('is the end of the run: the report returns to the event it was opened from', () => {
        expect(fn('startNav')).not.toContain('odo-ev-bar'); // no link to leave a run halfway (#936)
        expect(js).toContain("leaveRun(eventSlug ? '/event/' + encodeURIComponent(eventSlug) : './')");
    });
});

describe('the app recommendation shows in a browser', () => {
    it('Reader and Tripmaster un-hide it as the Recorder does', () => {
        expect(js).toContain("$('rdNativeHint').hidden = $('prNativeHint').hidden = document.documentElement.classList.contains('native');");
        expect(read('public/tripmaster/tripmaster.js')).toContain("$('tmNativeHint').hidden = document.documentElement.classList.contains('native');");
    });
});

describe('checkpoints go through RBCheckpoint', () => {
    it('no page re-implements the JSON read/write', () => {
        for (const p of ['public/reader/reader.js', 'public/tripmaster/tripmaster.js', 'public/assets/js/gpx-recorder.js']) {
            const src = read(p);
            expect(src, p).not.toMatch(/JSON\.parse\(localStorage\.getItem\((SESSION_KEY|SESSION_RB_KEY|CHECKPOINT_KEY)/);
            expect(src, p).not.toMatch(/localStorage\.setItem\((SESSION_KEY|SESSION_RB_KEY|CHECKPOINT_KEY)/);
        }
    });
});

describe('the run card', () => {
    it('paints its backdrop whenever no map was drawn', () => {
        const card = read('public/assets/js/run-card.js');
        expect(card).toContain('const mapped = !!canvas;');
        expect(card).toContain("if (!mapped) { const g = ctx.createLinearGradient(");
    });
});
