import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { spawnSync } from 'child_process';
import RB from '../public/assets/js/roadbook-core.js';

/* Live tracking for event organizers (#947): a participant's last position reaches the event's
   organizers only while they navigate one of its roadbooks, with a yes given at the start of that
   run — never before, never after, never to anyone else — and it goes with the event. */
const read = (p) => fs.readFileSync(p, 'utf8');
const live = read('app/live.php'), reader = read('public/reader/reader.js'), api = read('public/api/index.php');
const page = read('public/admin/events/live/live.js');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const fnOf = (src, name) => src.match(new RegExp('function ' + name + '\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n {0,4}\\}\\n'))[1];

describe('when the Reader shares (RB.liveAllowed)', () => {
    const ok = { eventSlug: 'rally', roadbookId: 4, activeParticipant: true, consent: true };
    it('only in the run of an event roadbook, by an active participant who said yes', () => {
        expect(RB.liveAllowed(ok)).toBe(true);
        for (const k of Object.keys(ok)) expect(RB.liveAllowed({ ...ok, [k]: k === 'roadbookId' ? null : k === 'eventSlug' ? '' : false }), k).toBe(false);
        expect(RB.liveAllowed(null)).toBe(false);
    });
});

describe('how often (RB.liveDue)', () => {
    const at = (lat) => ({ lat, lon: 9 });
    it('the first position goes at once, then every 15 s — or sooner after 50 m', () => {
        expect(RB.liveDue(null, null, at(45), 0)).toBe(true);
        const sent = { at: 0, lat: 45, lon: 9 };
        expect(RB.liveDue(sent, 0, at(45), 14000)).toBe(false);
        expect(RB.liveDue(sent, 0, at(45), 15000)).toBe(true);
        expect(RB.liveDue(sent, 0, at(45.0006), 6000)).toBe(true); // ~67 m
        expect(RB.liveDue(sent, 0, at(45.0002), 6000)).toBe(false); // ~22 m
    });
    it('a failed send is not retried sooner than 5 s, and there is no backlog — only the latest', () => {
        expect(RB.liveDue(null, 1000, at(45), 3000)).toBe(false);
        expect(RB.liveDue(null, 1000, at(45), 6000)).toBe(true);
        expect(RB.liveDue(null, null, null, 0)).toBe(false);
    });
});

describe('how fresh it reads (RB.liveFreshness)', () => {
    it('live under a minute, stale to 5 minutes, then lost; a finished run says so', () => {
        expect(RB.liveFreshness(59)).toBe('live');
        expect(RB.liveFreshness(60)).toBe('stale');
        expect(RB.liveFreshness(300)).toBe('stale');
        expect(RB.liveFreshness(301)).toBe('lost');
        expect(RB.liveFreshness(5, true)).toBe('ended');
    });
});

describe('the server', () => {
    it('takes a ping only from an active participant, on a roadbook of the event, while it runs', () => {
        const gate = fnOf(live, 'live_gate');
        expect(gate).toContain("status = 'active'");
        expect(gate).toContain('SELECT 1 FROM event_roadbooks WHERE event_id = ? AND roadbook_id = ?');
        expect(gate).toContain("if (!live_event_running($e)) fail('The event is not running.', 403);");
        const ping = fnOf(live, 'live_ping');
        expect(ping.indexOf('rate_limit(')).toBeLessThan(ping.indexOf('live_gate('));
        expect(ping.indexOf('live_gate(')).toBeLessThan(ping.indexOf('INSERT INTO event_live'));
        expect(ping).toContain('ON DUPLICATE KEY UPDATE'); // the last position, never a history
    });
    it('shows the map to the event’s organizers only', () => {
        expect(fnOf(live, 'live_list')).toContain("$e = require_event_manage($user, (int)($d['event_id'] ?? 0));");
        for (const a of ['live_ping', 'live_stop', 'live_list']) expect(api).toContain(`case '${a}':      ${a}(require_user(), $d); break;`);
    });
    it('forgets the positions with the event', () => {
        const purge = read('cron/purge-event-live.php');
        expect(purge).toContain('e.ends_on < CURDATE() - INTERVAL 1 DAY');
        expect(purge).toContain('l.updated_at < NOW() - INTERVAL 3 DAY');
        expect(read('cron/cron.php')).toContain("require_once __DIR__ . '/purge-event-live.php';");
    });
    it.skipIf(!hasPhp)('an event runs between its dates, a day of margin either side; no dates, always', () => {
        const run = (starts, ends) => spawnSync('php', ['-r', `const LIVE_MARGIN_DAYS = 1; ${live.match(/function live_event_running\([\s\S]*?\n}\n/)[0]}
            echo live_event_running(['starts_on' => ${starts}, 'ends_on' => ${ends}]) ? 'yes' : 'no';`], { encoding: 'utf8' }).stdout;
        const day = (n) => `'${new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)}'`;
        expect(run('null', 'null')).toBe('yes');
        expect(run(day(0), day(0))).toBe('yes');
        expect(run(day(1), day(3))).toBe('yes'); // tomorrow: inside the margin
        expect(run(day(2), day(3))).toBe('no');
        expect(run(day(-5), day(-1))).toBe('yes'); // ended yesterday: inside the margin
        expect(run(day(-5), day(-2))).toBe('no');
    });
});

describe('the Reader', () => {
    it('asks at the start of every run, and only a participant of the event is asked', () => {
        expect(reader).toContain('live.participant = !!(j.ok && j.event && j.event.active_participant && chainEntry());');
        expect(reader).toContain("live.consent = live.participant && await RBConfirm(t('Share your live position with the event’s organizers while you navigate?')");
        expect(reader).toContain('function liveStart() { live.on = RB.liveAllowed(liveCtx());');
    });
    it('sends from trusted fixes only, shows that it does, and stops for good with the run', () => {
        const onFix = reader.slice(reader.indexOf('function onFix(fix) {'), reader.indexOf('function publishBottomStack'));
        expect(onFix.indexOf('if (!trusted) return;')).toBeLessThan(onFix.indexOf('liveTick('));
        expect(reader).toContain("$('liveStrip').hidden = !live.on;");
        expect(fnOf(reader, 'endRun')).toContain('liveEnd();');
        expect(fnOf(reader, 'finalize')).toContain('liveEnd();');
        expect(reader).toContain("live.on = false; live.consent = false; $('liveStrip').hidden = true;");
    });
    it('a refused ping ends the sharing; a lost connection only waits', () => {
        expect(reader).toContain("else if (r.error !== 'Network error.') liveEnd(false);");
    });
});

describe('the organizers’ map', () => {
    it('polls every 10 s, paused while hidden, and colours each marker by freshness', () => {
        expect(page).toContain('const POLL_MS = 10000;');
        expect(page).toContain('if (document.hidden && !first) return;');
        expect(page).toContain('const state = (p) => RB.liveFreshness(p.age_s, p.stopped);');
        expect(page).toContain("el.classList.remove('live', 'stale', 'lost', 'ended');"); // never className: MapLibre's own classes stay
    });
});
