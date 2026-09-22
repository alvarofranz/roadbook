import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';

/* The run report (#617 · #618 · #619): the Reader's context-driven mode and end of run, and RBRun
   (run-report.js) — the tiles and the device queue a report goes through before the server. */
const read = (p) => fs.readFileSync(p, 'utf8');
const reader = read('public/reader/reader.js');
const html = read('public/reader/index.html');

describe('the mode comes from the context (#617)', () => {
    it('the start dialog asks no mode', () => {
        expect(html).not.toMatch(/id="modeTrip"|modeGrid|modeLocked|Competition mode/);
        expect(html).toContain('id="modeStart"');
    });
    it('a scored event roadbook runs in competition, everything else as a trip', () => {
        expect(reader).toContain("runComp = !!(er && er.scoring_mode && er.scoring_mode !== 'free');");
        expect(reader).toContain('if (!runComp) { startNav(false);');
    });
});

describe('the end of a run (#618)', () => {
    it('speed zones are followed in every run, trip included', () => {
        expect(reader.match(/function markReached\(i\) \{([\s\S]*?)\n {4}\}/)[1]).toContain('passLimit(notes[i], false);');
        expect(reader.match(/function validateAt\(i, here\) \{([\s\S]*?)\n {4}\}/)[1]).toContain('passLimit(n, scored);');
    });
    it('the last note finishes the run by itself, and Finish exists in every run', () => {
        expect(reader).not.toContain("$('finishBtn').hidden = !comp;");
        expect(reader.match(/if \(activeIdx >= notes\.length\) finishRun\(true\);/g).length).toBeGreaterThanOrEqual(3);
    });
    it('the report reaches the device queue BEFORE the session checkpoint goes (#460)', () => {
        const fin = reader.match(/async function finishRun\(completed\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(fin.indexOf('RBRun.enqueue(report')).toBeGreaterThan(-1);
        expect(fin.indexOf('RBRun.enqueue(report')).toBeLessThan(fin.indexOf('clearSession()'));
    });
    it('the report modal has no dismiss — its exits are explicit outcomes', () => {
        expect(reader).toContain("openModal('reportModal', () => {});");
    });
    it('with the "ask" preference both answers save it, with Remember my choice (#619)', () => {
        expect(reader).toContain('data-vis="private"');
        expect(reader).toContain('data-vis="public"');
        expect(reader).toContain("RBRun.update(key, { ready: true, visibility: b.dataset.vis, remember: box.querySelector('#reportRemember').checked });");
    });
});

describe('RBRun', () => {
    let calls;
    beforeEach(() => {
        localStorage.clear();
        calls = [];
        window.RBt = (k) => k;
        window.RBesc = (s) => String(s);
        window.RBApi = async (action, body) => { calls.push(body); return body.title === 'offline' ? { ok: false, error: 'Network error.' } : { ok: true, id: calls.length, is_public: body.visibility === 'public' ? 1 : 0 }; };
        eval(read('public/assets/js/run-report.js'));
    });
    const run = { title: 'X', distance_m: 12400, duration_s: 3600, notes_total: 10, notes_reached: 9, skipped: [4], speed_zones: 2, speed_exceeded: 1, max_over_kmh: 8, penalties: null };

    it('renders the tiles and says what went wrong', () => {
        const tiles = window.RBRun.statsHTML(run);
        expect(tiles).toContain('12.4 km');
        expect(tiles).toContain('9/10');
        expect(tiles).toContain('1/2');
        expect(tiles).toContain('12.4 km/h');
        const details = window.RBRun.detailsHTML(run);
        expect(details).toContain('<b>4</b>');
        expect(details).toContain('+8 km/h');
    });
    it('uploads only ready items and removes them once saved', async () => {
        const waiting = window.RBRun.enqueue(run, false);
        const ready = window.RBRun.enqueue({ ...run, title: 'Y' }, true);
        const done = await window.RBRun.flush();
        expect(Object.keys(done)).toEqual([ready]);
        expect(window.RBRun.pending(waiting)).not.toBeNull();
        window.RBRun.update(waiting, { ready: true, visibility: 'public', remember: true });
        const done2 = await window.RBRun.flush();
        expect(done2[waiting].is_public).toBe(1);
        expect(calls[1].remember).toBe(1);
        expect(window.RBRun.pending(waiting)).toBeNull();
    });
    it('keeps a report that could not reach the server', async () => {
        const k = window.RBRun.enqueue({ ...run, title: 'offline' }, true);
        await window.RBRun.flush();
        expect(window.RBRun.pending(k)).not.toBeNull();
    });
});
