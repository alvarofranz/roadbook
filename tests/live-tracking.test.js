import { describe, it, expect } from 'vitest';
import fs from 'fs';
import RB from '../public/assets/js/roadbook-core.js';

/* Live tracking for event organizers (#947 · #970): a participant's last position reaches an
   event's organizers whenever they navigate one of its roadbooks — opened from the event or not, on
   its dates or any other day (a recurring ride) — once they said yes, which is asked once per event
   and kept on the server. Never outside a run, never to anyone else, and it goes with the event. */
const read = (p) => fs.readFileSync(p, 'utf8');
const live = read('app/live.php'), reader = read('public/reader/reader.js'), api = read('public/api/index.php');
const page = read('public/admin/events/live/live.js');
const fnOf = (src, name) => src.match(new RegExp('function ' + name + '\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n {0,4}\\}\\n'))[1];

describe('when the Reader shares (RB.liveAllowed)', () => {
    it('only when an event of the roadbook has a yes', () => {
        expect(RB.liveAllowed([{ id: 1, consent: 1 }])).toBe(true);
        expect(RB.liveAllowed([{ id: 1, consent: 0 }, { id: 2, consent: 1 }])).toBe(true);
        expect(RB.liveAllowed([{ id: 1, consent: 0 }])).toBe(false);
        expect(RB.liveAllowed([{ id: 1, consent: null }])).toBe(false); // not asked yet: nothing goes
        expect(RB.liveAllowed([])).toBe(false);
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
    it('reads the events of a roadbook the user takes part in, with their answer', () => {
        const events = fnOf(live, 'live_events');
        expect(events).toContain("ep.user_id = ? AND ep.status = 'active'");
        expect(events).toContain('WHERE er.roadbook_id = ?');
        expect(events).not.toMatch(/starts_on|ends_on/); // any day: a recurring ride is shared too
    });
    it('takes a ping only for events whose participant said yes — anything else is refused, nothing stored', () => {
        expect(fnOf(live, 'live_targets')).toContain("array_filter(live_events((int)$user['id'], $rid), fn($e) => $e['consent'] === 1)");
        expect(fnOf(live, 'live_targets')).toContain("if (!$ids) fail('Not allowed.', 403);");
        const ping = fnOf(live, 'live_ping');
        expect(ping.indexOf('rate_limit(')).toBeLessThan(ping.indexOf('live_targets('));
        expect(ping.indexOf('live_targets(')).toBeLessThan(ping.indexOf('INSERT INTO event_live'));
        expect(ping).toContain('ON DUPLICATE KEY UPDATE'); // the last position, never a history
        expect(live).not.toContain('live_event_running');
    });
    it('keeps the answer per event, only for the participant themself', () => {
        expect(fnOf(live, 'live_consent')).toContain("UPDATE event_participants SET live_consent = ? WHERE event_id = ? AND user_id = ? AND status = 'active'");
        expect(read('migrations/045_notifications_live_consent.sql')).toContain('ADD COLUMN IF NOT EXISTS live_consent TINYINT(1) NULL DEFAULT NULL');
    });
    it('shows the map to the event’s organizers only', () => {
        expect(fnOf(live, 'live_list')).toContain("$e = require_event_manage($user, (int)($d['event_id'] ?? 0));");
        for (const a of ['live_status', 'live_consent', 'live_ping', 'live_stop', 'live_list']) expect(api).toContain(`case '${a}':`);
    });
    it('forgets the positions with the event', () => {
        const purge = read('cron/purge-event-live.php');
        expect(purge).toContain('e.ends_on < CURDATE() - INTERVAL 1 DAY');
        expect(purge).toContain('l.updated_at < NOW() - INTERVAL 3 DAY');
        expect(read('cron/cron.php')).toContain("require_once __DIR__ . '/purge-event-live.php';");
    });
});

describe('the Reader', () => {
    it('asks once per event, at the start of a run, however the roadbook was opened', () => {
        const start = fnOf(reader, 'liveStart');
        expect(start).toContain("RBApi('live_status', { roadbook_id: rbRef })");
        expect(start).toContain('const ask = live.events.filter((e) => e.consent === null);');
        expect(start).toContain("RBApi('live_consent', { event_id: e.id, consent: yes ? 1 : 0 })");
        expect(start).toContain('live.on = !finished && RB.liveAllowed(live.events);');
        expect(reader).toContain('function startRun(comp) { startNav(comp); RBGpxRecorder.begin(); prefetchNext(); liveStart(); }');
        expect(reader).not.toContain('live.participant');
    });
    it('sends from trusted fixes only, and stops with the run', () => {
        const onFix = reader.slice(reader.indexOf('function onFix(fix) {'), reader.indexOf('function publishBottomStack'));
        expect(onFix.indexOf('if (!trusted) return;')).toBeLessThan(onFix.indexOf('liveTick('));
        expect(fnOf(reader, 'endRun')).toContain('liveEnd();');
        expect(fnOf(reader, 'finalize')).toContain('liveEnd();');
    });
    it('the Live switch in the action bar shows it and changes it: off asks first, on starts again at once (#976)', () => {
        expect(reader).toContain("const syncLiveBtn = () => { const b = $('liveBtn'); b.hidden = !live.events.length || finished; b.classList.toggle('on', live.on);");
        expect(reader).toContain("if (!(await RBConfirm(t('Stop sharing your position with the organizers for this run?')))) return;");
        expect(reader).toContain("await Promise.all(no.map((e) => RBApi('live_consent', { event_id: e.id, consent: 1 })));"); // on again: a no for the event becomes a yes
        expect(reader).toContain("if (live.on) { toast('Live position on: the organizers see you.'); if (lastHere) liveTick(lastHere, { accuracy: lastAcc }, 0); }");
        const html = read('public/reader/index.html');
        expect(html).toContain('id="liveBtn" role="switch"');
        expect(html).not.toContain('liveStrip');
        expect(read('public/assets/css/app.css')).toContain('.fabrow:has(#liveBtn:not([hidden])) { grid-template-columns: repeat(6, minmax(0, 1fr)); }');
    });
    it('the odometer labels sit beside their numbers, a line less (#976)', () => {
        expect(read('public/reader/index.html')).toContain('.odometer-item { display: flex; align-items: baseline; gap: .4rem; }');
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
