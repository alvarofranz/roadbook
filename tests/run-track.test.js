import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

/* The track a run drove belongs to the run (#940): every run logs its GPX, the log travels inside
   the report — device first, then the server, public or private — and the runner sees it on a map
   and downloads it as GPX from the run. No second window after the report. */
const read = (p) => fs.readFileSync(p, 'utf8');
const reader = read('public/reader/reader.js'), runs = read('app/runs.php'), rr = read('public/assets/js/run-report.js');
const hasPhp = spawnSync('php', ['-v']).status === 0;

describe('the report carries the track', () => {
    it('ends the log into the report, and clears its checkpoint only once the report is on the device', () => {
        expect(reader).toContain('report.track = RBGpxRecorder.recording ? RBGpxRecorder.end().pts : [];');
        expect(reader).toContain('const { key, stored } = RBRun.enqueue(report, false);');
        expect(reader).toContain('if (stored) RBGpxRecorder.clearCheckpoint();');
        expect(rr).toContain('return { key, stored };');
    });
    it('opens no finished-track window after the report: the track is on the report itself', () => {
        expect(reader).not.toContain('handOver');
        expect(read('public/reader/index.html')).toMatch(/id="reportTrackView"[\s\S]*id="reportGpx"/);
        expect(reader).toContain("$('reportGpx').onclick = () => RBRun.downloadGpx(report.track, report.title);");
    });
});

describe('the server keeps it with the run', () => {
    it('stores it on save, hands it out by the run’s visibility, and deletes it with the run', () => {
        expect(runs).toContain("run_store_track((int)$user['id'], $runId, $d['track'] ?? null);");
        expect(runs).toContain("if (!$run || (!(int)$run['is_public'] && !$mine)) fail('Not found.', 404);");
        expect(runs).toContain("@unlink(run_track_path((int)$user['id'], $id));");
        expect(read('public/api/index.php')).toContain("case 'run_track':      run_track($d); break;");
    });
    it('shows it on the profile and on the run page, through one delegated button', () => {
        expect(rr).toContain("e.target.closest('[data-run-track]')");
        expect(read('public/assets/js/profile-page.js')).toContain('data-run-track="${r.id}"');
        expect(read('public/run/index.php')).toContain('data-run-track="<?= (int)$run[\'id\'] ?>"');
    });

    it.skipIf(!hasPhp)('keeps only real coordinates, capped, and nothing for a track too short', () => {
        const fns = runs.match(/function run_track_path\(.*\n/)[0] + runs.match(/function run_store_track\([\s\S]*?\n}\n/)[0];
        const helpers = read('app/roadbooks.php').match(/function rb_dir\([\s\S]*?\n}\n/)[0] + read('app/roadbooks.php').match(/function rb_write_file\([\s\S]*?\n}\n/)[0];
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbtrack-'));
        const run = (track) => spawnSync('php', ['-r', `$CFG = ['storage' => ${JSON.stringify(dir)}]; const RUN_TRACK_MAX_POINTS = 4; ${helpers}${fns}
            run_store_track(7, 42, json_decode(${JSON.stringify(JSON.stringify(track))}, true));
            $p = run_track_path(7, 42); echo is_file($p) ? file_get_contents($p) : 'none'; @unlink($p);`], { encoding: 'utf8' }).stdout;
        expect(run([{ lat: 45.1, lon: 9.2 }])).toBe('none'); // one point is no track
        const kept = JSON.parse(run([{ lat: 45.1234567, lon: 9.2, ele: 201.6, t: 1000 }, { lat: 'x', lon: 9 }, { lat: 95, lon: 9 }, { lat: 45.2, lon: 9.3 }, { lat: 45.3, lon: 9.4 }]));
        expect(kept).toEqual([{ lat: 45.123457, lon: 9.2, ele: 202, t: 1000 }, { lat: 45.2, lon: 9.3 }]); // junk dropped, and nothing past the first 4 given is read
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
