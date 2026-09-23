import { describe, it, expect, beforeEach } from 'vitest';
import { createMirror, DURABLE_KEYS, SENTINEL, isDurable } from '../native/src/durable.js';

/* Durable storage (#778): the keys that matter survive a wiped WebView storage, and nothing the
   user discarded comes back. */
const memoryStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m }; };
const memoryPrefs = () => { const m = new Map(); return { get: async ({ key }) => ({ value: m.has(key) ? m.get(key) : null }), set: async ({ key, value }) => { m.set(key, value); }, remove: async ({ key }) => { m.delete(key); }, map: m }; };
const manualTimers = () => { const q = new Map(); let id = 0; return { set: (fn) => { q.set(++id, fn); return id; }, clear: (i) => q.delete(i), run: () => { const fns = [...q.values()]; q.clear(); fns.forEach((f) => f()); }, size: () => q.size }; };

let storage, prefs, timers, mirror;
beforeEach(() => { storage = memoryStorage(); prefs = memoryPrefs(); timers = manualTimers(); mirror = createMirror({ storage, prefs, timers }); });

describe('which keys are durable', () => {
    it('are the session, the signed-in user, the pending runs and every crash checkpoint', () => {
        for (const k of ['rb_token', 'rb_cfg_user', 'rb_pending_runs', 'rb_session', 'rb_session_roadbook', 'rb_recorder_session', 'rb_recorder_pending_save', 'rb_tripmaster_session', 'rb_trip_gpx', 'rb_editor_draft']) expect(isDurable(k)).toBe(true);
        expect(isDurable('rb_lang')).toBe(false);
        expect(DURABLE_KEYS).not.toContain(SENTINEL);
    });
});

describe('mirroring writes', () => {
    it('debounces a key rewritten again and again, then writes its latest value', async () => {
        storage.setItem('rb_trip_gpx', 'a'); mirror.onSet('rb_trip_gpx');
        storage.setItem('rb_trip_gpx', 'b'); mirror.onSet('rb_trip_gpx');
        expect(timers.size()).toBe(1);
        timers.run(); await Promise.resolve();
        expect(prefs.map.get('rb_trip_gpx')).toBe('b');
    });
    it('flushes everything pending at once (the app going to the background)', async () => {
        storage.setItem('rb_token', 't'); mirror.onSet('rb_token');
        await mirror.flush();
        expect(prefs.map.get('rb_token')).toBe('t');
        expect(timers.size()).toBe(0);
    });
    it('removes at once, cancelling a pending write (a sign-out never lingers)', async () => {
        prefs.map.set('rb_token', 'old'); storage.setItem('rb_token', 'new'); mirror.onSet('rb_token');
        storage.removeItem('rb_token'); await mirror.onRemove('rb_token');
        expect(prefs.map.has('rb_token')).toBe(false);
        expect(timers.size()).toBe(0);
    });
    it('ignores keys that are not durable', () => {
        mirror.onSet('rb_lang'); mirror.onRemove('rb_lang');
        expect(timers.size()).toBe(0);
    });
});

describe('startup', () => {
    it('restores the keys after a purge, and marks the storage', async () => {
        prefs.map.set('rb_token', 't'); prefs.map.set('rb_recorder_session', '{"recording":true}');
        expect(await mirror.reconcile()).toBe(2);
        expect(storage.getItem('rb_token')).toBe('t');
        expect(storage.getItem('rb_recorder_session')).toBe('{"recording":true}');
        expect(storage.getItem(SENTINEL)).toBe('1');
    });
    it('restores nothing on a first launch', async () => {
        expect(await mirror.reconcile()).toBe(0);
        expect(storage.getItem(SENTINEL)).toBe('1');
    });
    it('with the storage intact, realigns the mirror to it: a discarded checkpoint is dropped, never resurrected', async () => {
        storage.setItem(SENTINEL, '1'); storage.setItem('rb_token', 'current');
        prefs.map.set('rb_token', 'stale'); prefs.map.set('rb_session', '{"old":1}');
        expect(await mirror.reconcile()).toBe(0);
        expect(prefs.map.get('rb_token')).toBe('current');
        expect(prefs.map.has('rb_session')).toBe(false);
        expect(storage.getItem('rb_session')).toBe(null);
    });
});
