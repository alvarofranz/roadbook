import { describe, it, expect, beforeEach } from 'vitest';
import pkg from '../public/assets/js/rb-media-queue.js';

const { createQueue } = pkg;

// In-memory stand-in for the IndexedDB adapter: same async contract, deterministic.
function memStore() {
    let seq = 0;
    const map = new Map();
    return {
        add: async (rec) => { const id = ++seq; map.set(id, Object.assign({ id }, rec)); return id; },
        all: async () => [...map.values()].map((r) => ({ ...r })), // copies, like a real read
        put: async (rec) => { map.set(rec.id, { ...rec }); return rec.id; },
        del: async (id) => { map.delete(id); },
        count: async () => map.size,
        _map: map,
    };
}

// Let the fire-and-forget flush that add() kicks off settle before asserting.
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('RBMediaQueue orchestration (createQueue)', () => {
    let store, calls, impl, schedules, offline;

    beforeEach(() => {
        store = memStore();
        calls = [];
        impl = async () => ({ ok: false });
        schedules = 0;
        offline = false;
    });

    const make = (over = {}) => createQueue(Object.assign({
        store,
        upload: async (it) => { calls.push(it.token); return impl(it); },
        schedule: () => { schedules += 1; },
        isOffline: () => offline,
    }, over));

    it('uploads oldest-first (FIFO) in a single flush', async () => {
        await store.add({ kind: 'photo', fields: {}, token: 'a', tries: 0, ts: 1 });
        await store.add({ kind: 'photo', fields: {}, token: 'b', tries: 0, ts: 2 });
        await store.add({ kind: 'photo', fields: {}, token: 'c', tries: 0, ts: 3 });
        impl = async () => ({ ok: true });
        const q = make();
        await q.flush();
        expect(calls).toEqual(['a', 'b', 'c']);
        expect(await store.count()).toBe(0);
    });

    it('removes successes and reports them via onDone with the server result', async () => {
        await store.add({ kind: 'photo', fields: {}, token: 'a', tries: 0, ts: 1 });
        impl = async () => ({ ok: true, id: 42, url: '/photos/42.avif', lat: 1.5, lon: 2.5 });
        const done = [];
        const q = make();
        q.init({ onDone: (item, res) => done.push({ token: item.token, res }) });
        await q.flush();
        expect(await store.count()).toBe(0);
        expect(done).toHaveLength(1);
        expect(done[0].token).toBe('a');
        expect(done[0].res.id).toBe(42);
        expect(done[0].res.url).toBe('/photos/42.avif');
    });

    it('keeps failures, increments tries, and schedules a retry', async () => {
        await store.add({ kind: 'audio', fields: {}, token: 'x', tries: 0, ts: 1 });
        impl = async () => ({ ok: false });
        const q = make();
        await q.flush();
        expect(await store.count()).toBe(1);
        expect([...store._map.values()][0].tries).toBe(1);
        expect(schedules).toBeGreaterThan(0);
        // a second pass increments again, item still retained
        await q.flush();
        expect([...store._map.values()][0].tries).toBe(2);
    });

    it('a poison item never blocks the rest of the queue', async () => {
        await store.add({ kind: 'photo', fields: {}, token: 'good1', tries: 0, ts: 1 });
        await store.add({ kind: 'photo', fields: {}, token: 'poison', tries: 0, ts: 2 });
        await store.add({ kind: 'photo', fields: {}, token: 'good2', tries: 0, ts: 3 });
        impl = async (it) => (it.token === 'poison' ? { ok: false } : { ok: true });
        const q = make();
        await q.flush();
        expect(await store.count()).toBe(1); // only the poison remains
        expect([...store._map.values()][0].token).toBe('poison');
    });

    it('add() enqueues, emits the pending count, and auto-flushes', async () => {
        impl = async () => ({ ok: false }); // fails → item persists so we can observe it
        const counts = [];
        const q = make();
        q.init({ onChange: (n) => counts.push(n) });
        const id = await q.add('photo', 'blob', { type: 'photo' }, 'photo.jpg', 'tok');
        await tick();
        expect(id).toBe(1);
        expect(await store.count()).toBe(1);
        expect([...store._map.values()][0].token).toBe('tok');
        expect(counts).toContain(1); // onChange fired with the pending count
    });

    it('skips the pass and schedules when offline', async () => {
        await store.add({ kind: 'photo', fields: {}, token: 'a', tries: 0, ts: 1 });
        offline = true;
        impl = async () => ({ ok: true });
        const q = make();
        await q.flush();
        expect(calls).toEqual([]);          // nothing attempted
        expect(await store.count()).toBe(1); // still queued
        expect(schedules).toBeGreaterThan(0);
    });

    it('does not run overlapping flushes (re-entry guard)', async () => {
        await store.add({ kind: 'photo', fields: {}, token: 'a', tries: 0, ts: 1 });
        let active = 0, overlap = false;
        impl = async () => { active += 1; if (active > 1) overlap = true; await Promise.resolve(); active -= 1; return { ok: false }; };
        const q = make();
        await Promise.all([q.flush(), q.flush(), q.flush()]);
        expect(overlap).toBe(false);
    });
});
