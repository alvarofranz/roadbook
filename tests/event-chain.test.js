import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';

/* Chained event roadbooks (#944): the organizer says what each roadbook offers at its last note;
   the Reader carries the same run on through the legs and shows one report at the very end, while
   every leg stays its own run on the server — its completions, its own classification. */
const read = (p) => fs.readFileSync(p, 'utf8');
const reader = read('public/reader/reader.js'), events = read('app/events.php'), api = read('public/api/index.php');
const edit = read('public/admin/events/edit/event-edit.js');
const fn = (name) => reader.match(new RegExp('function ' + name + '\\([^)]*\\) \\{([\\s\\S]*?)\\n {4}\\}'))[1];

describe('the chain on the server', () => {
    it('is the organizer’s: one list per roadbook, replaced whole, only between the event’s own roadbooks', () => {
        expect(api).toContain("case 'event_rb_next_set': event_rb_next_set(require_user(), $d); break;");
        const set = events.slice(events.indexOf('function event_rb_next_set('), events.indexOf('/* ---- co-organizers'));
        expect(set).toContain("$e = require_event_manage($user, (int)($d['event_id'] ?? 0));");
        expect(set).toContain('if ($nid === $rid || !isset($attached[$nid]) || isset($rows[$nid])) continue;');
        expect(set).toContain("mb_substr(trim((string)($n['label'] ?? '')), 0, 40)");
        expect(set.indexOf('DELETE FROM event_rb_next')).toBeLessThan(set.indexOf('INSERT INTO event_rb_next'));
    });
    it('reaches the visitor only between roadbooks the visitor sees', () => {
        expect(events).toContain("fn($n) => isset($seen[$n['id']])");
        expect(read('migrations/043_event_rb_next.sql')).toContain('REFERENCES event_roadbooks(event_id, roadbook_id) ON DELETE CASCADE');
    });
    it('is set on the event page: a checkbox and a short label per other roadbook, saved at once', () => {
        expect(edit).toContain("const x = await api('event_rb_next_set', { event_id: id, roadbook_id: from, next });");
        expect(edit).toContain('maxlength="40"');
    });
});

describe('the chain in the Reader', () => {
    it('comes with the event, and the next roadbooks are fetched when a leg starts, for an offline choice', () => {
        expect(reader).toContain("chain = j.ok ? (j.roadbooks || []).map((x) => ({ id: +x.id, slug: x.slug, title: x.title, scoring_mode: x.scoring_mode, next: x.next || [] })) : null;");
        expect(reader).toContain('function startRun(comp) { startNav(comp); RBGpxRecorder.begin(); prefetchNext(); }');
        expect(fn('resumeSession')).toContain('prefetchNext();');
    });
    it('closes each leg to the device first, then offers the next — only after a completed roadbook', () => {
        const fin = fn('finishRun');
        expect(fin.indexOf('await closeLeg(completed)')).toBeLessThan(fin.indexOf('pickNext('));
        expect(fin).toContain('const options = completed ? nextOptions() : [];');
        expect(fn('closeLeg')).toContain('RBRun.enqueue(report, false)'); // waits for the run's end to be public or private
    });
    it('the choice is explicit: no backdrop, no Escape — Finish here or one of the next', () => {
        expect(fn('pickNext')).toContain("'narrow', null, { dismissable: false }");
        expect(fn('pickNext')).toContain("t('Finish here')");
    });
    it('a next leg is a fresh roadbook with its own mode; the vehicle number is asked once per run', () => {
        const leg = fn('startLeg');
        expect(leg).toContain('resetRun();');
        expect(leg).toContain('const comp = isScoredEntry(entry);');
        expect(leg).toContain("if (comp && team === '0') return askTeam();");
    });
    it('a resumed run knows its legs, and they wait for its end instead of settling as private', () => {
        expect(fn('saveSession')).toContain('legs: legs.map(({ key, slug }) => ({ key, slug }))');
        expect(fn('resumeSession')).toContain('chain = s.chain || null; legs = s.legs || [];');
    });
    it('the report at the end holds every leg: one visibility for all, one signed result per scored leg', () => {
        expect(reader).toContain('const report = chained ? RBRun.combine(reports) : reports[0];');
        expect(reader).toContain('(chained ? RBRun.legsHTML(reports) : RBRun.detailsHTML(report))');
        expect(reader).toContain('const results = reports.filter((r) => r.result_meta);');
        expect(reader).toContain('saved = keys.every((k) => res[k]) ? keys.map((k) => res[k]) : null;');
    });
});

describe('RBRun.combine', () => {
    beforeAll(() => {
        window.RBt = (k) => k; window.RBesc = (s) => String(s); window.RBKm = (m) => (m / 1000).toFixed(1) + ' km';
        eval(read('public/assets/js/run-report.js'));
    });
    const leg = (o) => ({ title: 'A', completed: 1, mode: 'trip', team: null, started_at: 1000, ended_at: 61000, distance_m: 1000, notes_total: 5, notes_reached: 5, speed_zones: 1, speed_exceeded: 0, max_over_kmh: 0, skipped: [], track: [{ lat: 1, lon: 1 }], ...o });
    it('sums the legs into one run: from the first start to the last end, every note and metre', () => {
        const c = window.RBRun.combine([leg({}), leg({ title: 'B', started_at: 70000, ended_at: 181000, distance_m: 2500, notes_total: 4, notes_reached: 3, completed: 0, mode: 'competition', team: '7', speed_exceeded: 1, max_over_kmh: 12, track: [{ lat: 2, lon: 2 }] })]);
        expect(c).toMatchObject({ title: 'A → B', completed: 0, mode: 'competition', team: '7', duration_s: 180, distance_m: 3500, notes_total: 9, notes_reached: 8, speed_zones: 2, speed_exceeded: 1, max_over_kmh: 12 });
        expect(c.track).toHaveLength(2);
    });
    it('lists each leg with what went wrong in it', () => {
        const html = window.RBRun.legsHTML([leg({}), leg({ title: 'B', skipped: [3], notes_reached: 4 })]);
        expect(html).toContain('<b>A</b>');
        expect(html).toContain('<b>3</b>');
    });
});
