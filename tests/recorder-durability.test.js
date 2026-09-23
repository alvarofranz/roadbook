import { describe, it, expect } from 'vitest';
import fs from 'fs';
import pkg from '../public/assets/js/rb-media-queue.js';

/* The Recorder keeps a recording, and everything captured with it, until it lands or is
   discarded (#460 · #436 · #792): the sign-in round-trip, a declined resume, a discard, a
   crash with photos still waiting to upload. */
const { createQueue } = pkg;
const read = (p) => fs.readFileSync(p, 'utf8');
const rec = read('public/recorder/recorder.js');
const fn = (name) => rec.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n {4}\\}\\n`))[0];

function memStore() {
    let seq = 0;
    const map = new Map();
    return {
        add: async (r) => { const id = ++seq; map.set(id, Object.assign({ id }, r)); return id; },
        all: async () => [...map.values()].map((r) => ({ ...r })),
        put: async (r) => { map.set(r.id, { ...r }); },
        del: async (id) => { map.delete(id); },
        count: async () => map.size,
        map,
    };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('the media queue gives a capture back, drops it, and says when it cannot hold it', () => {
    it('get(token) returns the queued record with its blob, null once it has uploaded', async () => {
        const store = memStore();
        const q = createQueue({ store, upload: async () => ({ ok: false }) });
        await q.add('photo', 'BLOB', {}, 'p.jpg', 't1');
        expect((await q.get('t1')).blob).toBe('BLOB');
        expect(await q.get('nope')).toBe(null);
    });
    it('drop(tokens) deletes those captures only', async () => {
        const store = memStore();
        const q = createQueue({ store, upload: async () => ({ ok: false }) });
        await q.add('photo', 'a', {}, 'a.jpg', 'keep');
        await q.add('photo', 'b', {}, 'b.jpg', 'gone');
        await tick();
        await q.drop(['gone']);
        expect([...store.map.values()].map((r) => r.token)).toEqual(['keep']);
    });
    it('a pass already running skips a dropped capture instead of uploading it', async () => {
        const store = memStore();
        const uploaded = [];
        let release;
        const gate = new Promise((r) => { release = r; });
        const q = createQueue({ store, upload: async (it) => { if (it.token === 'first') await gate; uploaded.push(it.token); return { ok: true }; } });
        await store.add({ kind: 'photo', blob: 1, fields: {}, token: 'first', ts: 1 });
        await store.add({ kind: 'photo', blob: 2, fields: {}, token: 'second', ts: 2 });
        const pass = q.flush();
        await tick();
        await q.drop(['second']);
        release(); await pass;
        expect(uploaded).toEqual(['first']);
    });
    it('add rejects when the store cannot hold the blob — nothing is queued', async () => {
        const store = memStore();
        store.add = async () => { throw new Error('QuotaExceededError'); };
        const q = createQueue({ store, upload: async () => ({ ok: true }) });
        await expect(q.add('photo', 'x', {}, 'x.jpg', 't')).rejects.toThrow();
    });
    it('uploads photos only: the voice-note branch is gone', () => {
        const src = read('public/assets/js/rb-media-queue.js');
        expect(src).not.toMatch(/RBUploadAudio|audio|voice/);
        expect(src).toContain('return RBUpload(it.fields, it.blob, it.name);');
    });
});

describe('the Recorder keeps the recording through the sign-in round-trip (#460)', () => {
    const startup = rec.match(/RBConfig\(\)\.then\(async \(c\) => \{[\s\S]*?\n {4}\}\)\.catch/)[0];
    it('reads the stash without removing it, and only a landed save clears it', () => {
        expect(startup).toContain('const pend = RBCheckpoint.read(PENDING_SAVE);');
        expect(startup).not.toContain('removeItem(PENDING_SAVE)');
        expect(fn('saveAfterLogin')).toMatch(/if \(!built\) return finishModal\(\);\s+clearRecording\(\);/);
        expect(startup).toContain('holdFinished(pend.pts, pend.name, true);');
        expect(fn('clearRecording')).toContain('localStorage.removeItem(PENDING_SAVE)');
    });
    it('stashes the photo pins and the draft with the track', () => {
        expect(rec).toContain('localStorage.setItem(PENDING_SAVE, JSON.stringify(finishedRecord()))');
        expect(rec).toContain('const finishedRecord = () => ({ finishing: true, pts: finished.pts, name: finished.name, recordedM, wpts, photos: persistedPhotos(), draftId });');
        expect(startup).toContain('photos = await restorePhotos(pend.photos); draftId = pend.draftId || 0;');
    });
    it('the stash is durable in the app, like every checkpoint', async () => {
        const { DURABLE_KEYS } = await import('../native/src/durable.js');
        expect(rec).toContain("const PENDING_SAVE = 'rb_recorder_pending_save';");
        expect(DURABLE_KEYS).toContain('rb_recorder_pending_save');
        expect(DURABLE_KEYS).toContain('rb_editor_draft');
    });
});

describe('a declined resume is marked, never deleted (#436)', () => {
    const startup = rec.match(/RBConfig\(\)\.then\(async \(c\) => \{[\s\S]*?\n {4}\}\)\.catch/)[0];
    it('asks only about a session not declined before, and a No marks both checkpoints', () => {
        expect(startup).toContain('if (session && session.recording && !session.declined) {');
        expect(startup).toMatch(/RBCheckpoint\.decline\(SESSION_KEY\);\s+RBGpxRecorder\.decline\(\);/);
        expect(startup).not.toMatch(/clearSession\(\);\s+RBGpxRecorder\.clearCheckpoint\(\)/);
    });
});

describe('Start waits for startup (a tap must not begin() over an unfinished recording)', () => {
    it('is disabled until the startup sequence has decided, and the queue starts after it', () => {
        expect(rec).toContain("$('recStart').disabled = true;\n    RBConfig().then(");
        expect(rec).toContain(".finally(() => { initMediaQueue(); startupDone = true; if (!RBGpxRecorder.recording && !finished) startPreview(); renderGpsHealth(); });");
        expect(rec).toContain('const initMediaQueue = () => RBMediaQueue.init({');
    });
});

describe('Discard takes the queued photos and the draft with it', () => {
    const discard = fn('discardRecording');
    it('drops this recording’s captures by token and deletes its draft for good', () => {
        expect(discard).toContain('RBMediaQueue.drop(photos.map((p) => p.token))');
        expect(discard).toContain("RBApi('rb_delete', { id }).then((r) => (r && r.ok ? RBApi('rb_purge', { id }) : null))");
        expect(discard).toContain('clearRecording();');
    });
    it('runs on both discard paths, each after a confirm naming what goes', () => {
        expect(rec.match(/discardRecording\(\);/g)).toHaveLength(2);
        expect(rec).toContain("t('Discard it with its notes and photos?') + ` (${wpts.length} ${t('notes')} · ${photos.length} ${t('photos')})`");
    });
});

describe('photos waiting to upload survive a crash and the sign-in return (#792)', () => {
    it('checkpoints keep the pins by token, without their dead blob URL', () => {
        expect(rec).toContain('const persistedPhotos = () => photos.map((p) => (p.local ? Object.assign({}, p, { url: null }) : p));');
        expect(fn('saveSession')).toContain('photos: persistedPhotos()');
        expect(rec).not.toContain('filter((p) => !p.local)');
    });
    it('a restored pin finds its blob in the queue again', () => {
        expect(fn('restorePhotos')).toContain('await RBMediaQueue.get(p.token)');
        expect(fn('restorePhotos')).toContain('URL.createObjectURL(rec.blob)');
        expect(rec.match(/photos = await restorePhotos\(/g)).toHaveLength(3); // stash · finishing · resume
    });
    it('the note’s Photo extra reads a waiting photo from the queue', () => {
        expect(fn('photoBlob')).toContain('p.local ? await RBMediaQueue.get(p.token) : null');
        expect(fn('withPhotos')).toContain('await photoBlob(p)');
    });
    it('a photo the device could not keep is said and marked failed', () => {
        expect(rec).toMatch(/RBMediaQueue\.add\('photo', f, fields, 'photo\.jpg', token\)\.catch\(\(\) => \{\s+pin\.pending = false; pin\.failed = true; saveSession\(\);\s+toast\('Could not save\.'\);/);
    });
});

describe('small Recorder fixes', () => {
    it('saves into the draft ensureDraft returned', () => {
        expect(rec).toContain("RBApi('rb_save', { id: id || 0,");
    });
    it('reads the course-up state through the public RBMap method', () => {
        expect(rec).not.toContain('_headingUp');
        expect(rec).toContain('map.setHeadingUp(!map.headingUp())');
        const rbmap = read('public/assets/js/rbmap.js');
        expect(rbmap).toContain('headingUp() { return this._headingUp; }');
        expect(rbmap.match(/rbmap\._headingUp/g)).toBe(null);
    });
    it('describes photos only — no voice notes, no live file', () => {
        expect(rec).not.toMatch(/voice|live file/);
    });
    it('a lost GPS signal never stops the recording, and says so in every language (#901)', () => {
        expect(rec).toContain("meter = new RBGpsMeter(onFix, () => toast(t('GPS signal lost — the recording carries on and picks up when it returns.'), 4000));");
        for (const lang of ['es', 'it', 'de', 'fr']) expect(read(`public/assets/js/i18n.${lang}.js`)).toContain('"GPS signal lost — the recording carries on and picks up when it returns."');
    });
});

describe('no page advertises voice memos any more (#768)', () => {
    it('in the HTML or in any language file', () => {
        for (const f of ['public/index.html', 'public/recorder/index.html', 'public/assets/js/i18n.js', 'public/assets/js/i18n.es.js', 'public/assets/js/i18n.it.js', 'public/assets/js/i18n.de.js', 'public/assets/js/i18n.fr.js'])
            expect(read(f)).not.toMatch(/voice memos|feat\.[12]\.d/);
    });
});

describe('the service worker caches only good responses', () => {
    const sw = read('public/sw.js');
    it('every cache write goes through keep(), which checks res.ok', () => {
        expect(sw).toContain('if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }');
        expect(sw.match(/c\.put\(/g)).toHaveLength(1);
        expect(sw.match(/\.then\(keep\(request\)\)/g)).toHaveLength(3);
    });
});

describe('the app claims the same deep-link paths on both platforms (#268)', () => {
    it('Android pathPrefixes end in a slash, like the iOS association paths', () => {
        const manifest = read('android/app/src/main/AndroidManifest.xml');
        const aasa = JSON.parse(read('public/.well-known/apple-app-site-association'));
        const ios = aasa.applinks.details[0].components.map((c) => c['/'].replace(/\*$/, ''));
        const android = [...manifest.matchAll(/android:pathPrefix="([^"]+)"/g)].map((m) => m[1]);
        expect(android.sort()).toEqual(ios.sort());
        for (const p of android) expect(p.endsWith('/')).toBe(true);
    });
});

describe('a deferred event join is retried until it lands', () => {
    it('drops a join code the server refused for good, and keeps one that only met no network', () => {
        const native = fs.readFileSync('native/src/native.js', 'utf8');
        const join = native.match(/async function joinEvent\(code\) \{[\s\S]*?\n\}/)[0];
        expect(join).toContain("if (res && res.error !== 'Network error.') {");
        expect(join).toContain('localStorage.removeItem(PENDING_JOIN);\n        window.RBToast(');
    });
    it('a signed-out join goes through the sign-in page and comes back to replay the code', () => {
        const join = read('native/src/native.js').match(/async function joinEvent\(code\) \{[\s\S]*?\n\}/)[0];
        expect(join).toContain('window.location.href = window.RBLoginUrl();');
        expect(join).not.toContain("'/account/'");
    });
    it('keeps the stored code for joinEvent to remove on success', () => {
        const native = read('native/src/native.js');
        const consume = native.match(/async function consumePendingJoin\(\) \{[\s\S]*?\n\}/)[0];
        expect(consume).not.toContain('removeItem');
        expect(consume).toContain('await joinEvent(code);');
        expect(native).toContain('consumePendingJoin().catch(() => {});');
    });
});
