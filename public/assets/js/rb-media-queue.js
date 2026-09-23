'use strict';
/* RDBK shared media queue (issue #147) — offline-first buffering for geotagged
 * photos. A capture is enqueued to IndexedDB (blobs survive a reload or an OS kill)
 * and uploaded to the server when possible, with retry, so a network drop
 * mid-recording never silently loses a photo. Used by the Recorder and the Editor's
 * "Adjust on the trail".
 *
 * The IndexedDB layer is a thin adapter; the queue orchestration (FIFO order,
 * retry, reconciliation) is a pure `createQueue` factory so it is unit-testable with
 * an in-memory store and a mock uploader — no IndexedDB needed in the tests. */
(function () {
    // Pure orchestration over an injected store + uploader.
    //   store:  { add(rec)->id, all()->[rec], put(rec), del(id), count()->n }  (all async)
    //   upload(rec): async -> { ok, ... }  (the server result; must not reject)
    //   schedule():  arrange a later retry pass (browser: a timer)
    //   isOffline(): true when a pass is pointless (known offline)
    function createQueue(deps) {
        const store = deps.store;
        const upload = deps.upload;
        const schedule = deps.schedule || function () {};
        const isOffline = deps.isOffline || function () { return false; };
        let onDone = null, onChange = null, flushing = false;
        const dropped = new Set(); // tokens discarded while a pass was already running

        function nowTs() { return (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0; }

        async function emitChange() {
            if (!onChange) return;
            try { onChange(await store.count()); } catch (e) {}
        }

        // Enqueue a capture. `token` is an opaque client id the page can use to
        // reconcile an optimistic UI (e.g. a map pin) once the upload lands. Rejects when
        // the store cannot hold the blob (IndexedDB quota, private mode): the capture is
        // NOT queued, and the caller must say so.
        async function add(kind, blob, fields, name, token) {
            const id = await store.add({
                kind, blob, fields,
                name: name || null,
                token: token != null ? token : null,
                tries: 0, ts: nowTs(),
            });
            await emitChange();
            flush(); // fire-and-forget; the pass is guarded against re-entry
            return id;
        }

        // Upload everything uploadable, oldest first. Successes are removed and
        // reported via onDone; failures are kept with an incremented `tries`. Every
        // item is attempted each pass, so a single poison item never blocks the rest;
        // if anything remains after the pass, a retry is scheduled.
        async function flush() {
            if (flushing) return;
            if (isOffline()) { schedule(); return; }
            flushing = true;
            try {
                const items = (await store.all()).sort((a, b) => (a.ts - b.ts) || (a.id - b.id));
                for (const it of items) {
                    if (it.token != null && dropped.has(it.token)) continue;
                    let res;
                    try { res = await upload(it); } catch (e) { res = null; }
                    if (res && res.ok) {
                        await store.del(it.id);
                        await emitChange();
                        if (onDone) { try { onDone(it, res); } catch (e) {} }
                    } else {
                        it.tries = (it.tries || 0) + 1;
                        await store.put(it);
                    }
                }
                await emitChange();
                if ((await store.count()) > 0) schedule();
            } finally {
                flushing = false;
            }
        }

        // The queued record of one capture (its blob included), or null once it has uploaded.
        async function get(token) {
            return (await store.all()).find((it) => it.token === token) || null;
        }

        // Discard the captures with these tokens — a recording thrown away takes its photos
        // with it, instead of leaving them to upload into whatever roadbook comes next.
        async function drop(tokens) {
            const set = new Set(tokens || []);
            set.forEach((token) => dropped.add(token));
            for (const it of await store.all()) if (set.has(it.token)) await store.del(it.id);
            await emitChange();
        }

        return {
            add, flush, get, drop,
            init: function (cb) { cb = cb || {}; onDone = cb.onDone || null; onChange = cb.onChange || null; },
        };
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = { createQueue };

    if (typeof window === 'undefined') return;

    /* ---------- browser: IndexedDB-backed store + real uploader + auto-retry ---------- */
    const DB_NAME = 'rbmedia', STORE = 'queue', VERSION = 1;
    let dbP = null;
    function db() {
        if (!dbP) {
            dbP = new Promise((res, rej) => {
                const rq = indexedDB.open(DB_NAME, VERSION);
                rq.onupgradeneeded = () => { const d = rq.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }); };
                rq.onsuccess = () => res(rq.result);
                rq.onerror = () => rej(rq.error);
            });
            // a failed open must never be memoised — the next capture retries instead of
            // silently losing every photo for the rest of the session (#218)
            dbP.catch(() => { dbP = null; });
        }
        return dbP;
    }
    function op(mode, fn) {
        return db().then((d) => new Promise((res, rej) => {
            const rq = fn(d.transaction(STORE, mode).objectStore(STORE));
            rq.onsuccess = () => res(rq.result);
            rq.onerror = () => rej(rq.error);
        }));
    }
    const idbStore = {
        add: (rec) => op('readwrite', (st) => st.add(rec)),
        all: () => op('readonly', (st) => st.getAll()).then((r) => r || []),
        put: (rec) => op('readwrite', (st) => st.put(rec)),
        del: (id) => op('readwrite', (st) => st.delete(id)),
        count: () => op('readonly', (st) => st.count()).then((n) => n || 0),
    };

    // A capture may be enqueued before the server container (draft) exists — offline or
    // pre-draft (#147 F2). In that case `fields.roadbook` is absent; at flush time we ask
    // the page's resolver for one (it creates the draft when a connection is back). Until a
    // draft can be obtained the item stays queued. The upload goes through the shared image
    // downscale (RBUpload).
    let resolveRoadbook = null;
    async function uploader(it) {
        if (!it.fields.roadbook) {
            const rb = resolveRoadbook ? await resolveRoadbook() : null;
            if (!rb) return { ok: false }; // no container yet — keep queued, retry later
            it.fields.roadbook = String(rb);
        }
        return RBUpload(it.fields, it.blob, it.name);
    }

    let retryTimer = null;
    const RETRY_MS = 20000;
    function schedule() {
        if (retryTimer) return;
        retryTimer = setTimeout(() => { retryTimer = null; queue.flush(); }, RETRY_MS);
    }
    const isOffline = () => (typeof navigator !== 'undefined' && navigator.onLine === false);

    const queue = createQueue({ store: idbStore, upload: uploader, schedule, isOffline });

    // Retry as soon as the network returns.
    window.addEventListener('online', () => queue.flush());

    window.RBMediaQueue = {
        add: (kind, blob, fields, name, token) => queue.add(kind, blob, fields, name, token),
        // Kick a drain now (e.g. right after a draft becomes available post sign-in), instead of
        // waiting for the retry timer or the next `online` event.
        flush: () => queue.flush(),
        get: (token) => queue.get(token),
        drop: (tokens) => queue.drop(tokens),
        // Wire the reconciliation/badge callbacks (+ optional roadbook resolver) and drain
        // anything left from a previous session (blobs persist in IndexedDB across reloads).
        init: (cb) => { cb = cb || {}; resolveRoadbook = cb.resolveRoadbook || null; queue.init(cb); queue.flush(); },
    };
})();
