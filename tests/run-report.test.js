import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';

/* The run report (#617 · #618 · #619): the Reader's context-driven mode and end of run, and RBRun
   (run-report.js) — the tiles and the device queue a report goes through before the server. */
const read = (p) => fs.readFileSync(p, 'utf8');
const reader = read('public/reader/reader.js');
const html = read('public/reader/index.html');

describe('the mode comes from the context (#617)', () => {
    it('nothing asks the mode', () => {
        expect(html).not.toMatch(/id="modeTrip"|modeGrid|modeLocked|Competition mode/);
    });
    it('a scored event roadbook runs in competition, everything else as a trip', () => {
        expect(reader).toContain("const isScoredEntry = (er) => !!(er && er.scoring_mode && er.scoring_mode !== 'free');");
        expect(reader).toContain('const comp = isScoredEntry(chainEntry());');
        expect(reader).toContain('if (!comp) return startRun(false);');
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
        const fin = reader.match(/async function closeLeg\(completed\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(fin.indexOf('RBRun.enqueue(report')).toBeGreaterThan(-1);
        expect(fin.indexOf('RBRun.enqueue(report')).toBeLessThan(fin.indexOf('clearSession()'));
    });
    it('the report modal has no dismiss — its exits are explicit outcomes', () => {
        expect(reader).toContain("openModal('reportModal', () => {});");
    });
    it('who sees the run is a Private/Public switch: the first pick saves it, with Remember my choice (#619 · #820)', () => {
        expect(reader).toContain("segment('private', 'fa-lock', 'Private')}${segment('public', 'fa-globe', 'Public')}");
        expect(reader).toContain("if (first) { keys.forEach((k) => RBRun.update(k, { ready: true, visibility: v, remember: !!(vis.querySelector('#reportRemember') || {}).checked })); return upload(); }");
    });
    it('a saved run flips visibility from the same switch, and an unpicked one cannot be left behind (#820 · #460)', () => {
        expect(reader).toContain("saved.map((run) => RBApi('run_update', { id: run.id, is_public: v === 'public' ? 1 : 0 }))");
        expect(reader).toContain("$('reportDone').disabled = !choice || busy;"); // and never mid-save: that sends it twice
    });
    it('the card is the hero, Share under it, with a placeholder at its size while it renders (#820)', () => {
        const html = fs.readFileSync('public/reader/index.html', 'utf8');
        expect(html).toMatch(/<div class="report-card" id="reportCard">\s*<div class="report-card-frame"><img id="reportCardImg" alt="" hidden><\/div>/);
        expect(html).toContain('.report-card-frame:has(img[hidden])::after');
    });
});

describe('RBRun', () => {
    let calls;
    beforeEach(() => {
        localStorage.clear();
        calls = [];
        window.RBt = (k) => k;
        window.RBesc = (s) => String(s);
        window.RBKm = (m, digits = 2) => ((m || 0) / 1000).toFixed(digits) + ' km';
        window.RBApi = async (action, body) => { calls.push(body); return body.title === 'offline' ? { ok: false, error: 'Network error.' } : { ok: true, id: calls.length, is_public: body.visibility === 'public' ? 1 : 0 }; };
        eval(read('public/assets/js/run-report.js'));
    });
    const queued = (key) => JSON.parse(localStorage.getItem('rb_pending_runs') || '[]').find((i) => i.key === key) || null;
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
        const waiting = window.RBRun.enqueue(run, false).key;
        const ready = window.RBRun.enqueue({ ...run, title: 'Y' }, true).key;
        const done = await window.RBRun.flush();
        expect(Object.keys(done)).toEqual([ready]);
        expect(queued(waiting)).not.toBeNull();
        window.RBRun.update(waiting, { ready: true, visibility: 'public', remember: true });
        const done2 = await window.RBRun.flush();
        expect(done2[waiting].is_public).toBe(1);
        expect(calls[1].remember).toBe(1);
        expect(queued(waiting)).toBeNull();
    });
    it('keeps a report that could not reach the server', async () => {
        const k = window.RBRun.enqueue({ ...run, title: 'offline' }, true).key;
        await window.RBRun.flush();
        expect(queued(k)).not.toBeNull();
    });
    it('a flush asked for during another one still uploads what became ready meanwhile', async () => {
        const first = window.RBRun.enqueue(run, true).key;
        const running = window.RBRun.flush();          // reads the queue now: only `first`
        const later = window.RBRun.enqueue({ ...run, title: 'Y' }, false).key;
        window.RBRun.update(later, { ready: true });  // the runner picks while the first upload runs
        const done = await window.RBRun.flush();
        expect(Object.keys(await running)).toEqual([first]);
        expect(Object.keys(done)).toEqual([later]);
        expect(queued(later)).toBeNull();
    });
    it('owns the average speed the run card shows too', () => {
        expect(window.RBRun.avgKmh(run)).toBe('12.4');
        expect(window.RBRun.avgKmh({ ...run, duration_s: 0 })).toBe('—');
        expect(read('public/assets/js/run-card.js')).toContain("RBRun.avgKmh(report) + ' km/h'");
        expect(read('public/assets/js/run-card.js')).not.toContain('report.duration_s > 0');
    });
});

describe('the report says only what the run had, and shares happily (#848 · #852)', () => {
    beforeEach(() => {
        window.RBt = (k) => k; window.RBesc = (s) => String(s); window.RBKm = (m) => m + ' m';
        eval(fs.readFileSync('public/assets/js/run-report.js', 'utf8'));
    });
    it('a run through no speed-limit zone says nothing about limits', () => {
        const run = { distance_m: 1000, duration_s: 600, notes_reached: 3, notes_total: 3, speed_zones: 0, speed_exceeded: 0 };
        expect(RBRun.statsHTML(run)).not.toContain('Speed limits respected');
        expect(RBRun.detailsHTML(run)).toContain('Every note reached.');
        expect(RBRun.statsHTML({ ...run, speed_zones: 2 })).toContain('Speed limits respected');
        expect(RBRun.detailsHTML({ ...run, speed_zones: 2 })).toContain('Every note reached and every limit respected.');
    });
    it('shares in the runner’s own glad words', () => {
        expect(RBRun.shareText({ completed: 1, title: 'Giro' }, 'https://rdbk.app/run/6')).toBe('Check out the roadbook I completed! “Giro” https://rdbk.app/run/6');
        expect(RBRun.shareText({ completed: 0, title: 'Giro' }, null)).toBe('Check out my run! “Giro”');
    });
    it('Share before a choice asks first and picks Public on a Yes', () => {
        const reader = fs.readFileSync('public/reader/reader.js', 'utf8');
        expect(reader).toContain("if (!(await RBConfirm(t('Sharing makes this run public. Share it?')))) return false;");
        expect(reader).toContain("await pick('public');");
        expect(reader).toContain('if (!cardBlob || !(await shareGate())) return;');
    });
});

describe('a report left without a choice (#460)', () => {
    it('settles as private at the next start and goes up', () => {
        localStorage.clear();
        window.RBt = (k) => k; window.RBesc = (s) => String(s);
        eval(fs.readFileSync('public/assets/js/run-report.js', 'utf8'));
        const key = RBRun.enqueue({ title: 'x' }, false).key;
        RBRun.settleAbandoned();
        const item = JSON.parse(localStorage.getItem('rb_pending_runs')).find((i) => i.key === key);
        expect(item).toMatchObject({ ready: true, visibility: 'private' });
        expect(fs.readFileSync('public/reader/reader.js', 'utf8')).toContain("RBRun.settleAbandoned(session && !session.declined ? (session.legs || []).map((l) => l.key) : []); RBRun.flush();");
        // the legs of a chained run that may still resume wait for its end (#944)
        const leg = RBRun.enqueue({ title: 'leg' }, false).key;
        RBRun.settleAbandoned([leg]);
        expect(JSON.parse(localStorage.getItem('rb_pending_runs')).find((i) => i.key === leg)).toMatchObject({ ready: false });
    });
});
