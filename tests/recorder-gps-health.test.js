import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The Recorder's start waits for a good GPS (#901). */
const rec = fs.readFileSync('public/recorder/recorder.js', 'utf8');

describe('the Recorder landing', () => {
    it('shows the GPS health and opens Start only on a fresh fair-or-good fix after startup', () => {
        expect(rec).toContain("return Date.now() - previewAt > GPS_STALE_MS ? 'none' : RB.gpsHealth(previewAcc);");
        expect(rec).toContain("$('recStart').disabled = !(startupDone && ready);");
    });
    it('hands the GPS over to the recording and takes it back after a discard', () => {
        expect(rec).toMatch(/stopPreview\(\); \/\/ the landing's watch hands over[\s\S]*?RBGpxRecorder\.begin\(\{ name: recName\(\) \}\);/);
        expect(rec).toMatch(/function discardRecording\(\) \{[\s\S]*?startPreview\(\);/);
    });
    it('the status bar reads the same scale', () => {
        expect(fs.readFileSync('public/assets/js/status-bar.js', 'utf8')).toContain("RB.gpsHealth(acc)");
    });
});
