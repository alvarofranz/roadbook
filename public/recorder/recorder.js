'use strict';
/* RDBK Recorder — the live-GPS route recorder. Records a route with the shared GPS
 * loop (RBGpsMeter) and crash-safe GPX logging (RBGpxRecorder) and shows it live on a
 * map (RBMap). A tap on Note drops a note on the spot, nothing to type (the bell and
 * the big check confirm it, #768); a photo is queued offline-first (RBMediaQueue) and
 * drops its own note carrying it (#792). The shared status bar (RBStatusBar) shows the
 * clock, battery and GPS status; the recorded kilometres show in the dashboard.
 * The end is one question (#791): Save stores the draft roadbook and opens it in the
 * Editor (signed out, through the sign-in page first); Discard asks, naming what goes,
 * and throws away the track, the notes, the queued photos and the draft. The recording
 * is checkpointed until one of the two lands, so a reload or an OS kill can resume it
 * (#460). */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, toast = RBToast;
    const pad2 = RB.pad2;
    const SESSION_KEY = 'rb_recorder_session';
    // A finished recording waiting to be saved to an account across the sign-in redirect (the app
    // has no in-page login): stashed here, then saved automatically when the user returns signed in.
    const PENDING_SAVE = 'rb_recorder_pending_save';
    // Default roadbook name proposed when a recording starts: date + time, "YYYY-MM-DD HH-MM" (#148).
    const recName = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + '-' + pad2(d.getMinutes()); };

    let meter = null, map = null, meUser = null, draftId = 0;
    let recordedM = 0, paused = false, lastAcc = null, here = null, lastSampled = null, lastFixT = 0;
    let track = [], wpts = [], photos = [];
    let mediaSeq = 0; // client tokens for optimistic photo pins reconciled by RBMediaQueue
    let elapsedAcc = 0, segStart = 0, tick = null; // recording stopwatch (pauses with the recording)
    // The finished recording on the finish options, until Save or Discard lands it: its points, its
    // name, and whether the sign-in stash (rather than the session checkpoint) is its copy.
    let finished = null;

    /* ---------- map ---------- */
    map = new RBMap('recMap', { zoom: 15 }); // its style and course-up switches live in the capture grid (#768)
    let course = null, lastHeadingPos = null; // smoothed travel heading for the heading-up map

    // Smooth a compass heading (deg) toward a new sample along the shortest arc, so the
    // map turns gently instead of snapping on every noisy fix.
    function smoothHeading(prev, next) {
        if (prev == null) return next;
        const d = ((next - prev + 540) % 360) - 180;
        return (prev + d * 0.35 + 360) % 360;
    }

    /* ---------- session checkpoint: survive reloads and OS tab kills ----------
       The track itself is checkpointed by RBGpxRecorder; here we keep the meta. */
    // The photo pins as a checkpoint keeps them: a pin still waiting to upload drops its blob URL
    // (it dies with the page) and keeps its token, which finds its blob in the queue again.
    const persistedPhotos = () => photos.map((p) => (p.local ? Object.assign({}, p, { url: null }) : p));
    // Back from a checkpoint: each waiting pin gets a fresh blob URL from its queued capture; one
    // whose capture is gone (it never reached the queue) has nothing left to show.
    async function restorePhotos(list) {
        const out = [];
        for (const p of list || []) {
            if (!p.local) { out.push(p); continue; }
            const rec = await RBMediaQueue.get(p.token).catch(() => null);
            if (rec && rec.blob) out.push(Object.assign({}, p, { url: URL.createObjectURL(rec.blob) }));
        }
        return out;
    }
    // A finished recording that has not landed anywhere yet: everything the finish options need
    // (points, notes, photo pins, the draft), so a crash with them on screen reopens them (#647).
    const finishedRecord = () => ({ finishing: true, pts: finished.pts, name: finished.name, recordedM, wpts, photos: persistedPhotos(), draftId });
    // Every change is checkpointed into the copy the recording lives in right now: the session while
    // recording; once finished, the finishing checkpoint or the sign-in stash — so a photo landing
    // or the draft being created on the finish options is not lost to a crash (#460). Before a
    // recording starts it writes nothing, so a resumable session is never clobbered.
    function saveSession() {
        if (RBGpxRecorder.recording) RBCheckpoint.write(SESSION_KEY, { recording: true, fileName: RBGpxRecorder.fileName, recordedM, elapsedAcc: elapsed(), paused, wpts, photos: persistedPhotos(), draftId });
        else if (finished) RBCheckpoint.write(finished.stashed ? PENDING_SAVE : SESSION_KEY, finishedRecord());
    }
    function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
    // The track is finished and waits on the finish options: hold it, and keep the version
    // auto-refresh away until it lands.
    function holdFinished(pts, name, stashed) {
        finished = { pts, name: name || recName(), stashed };
        window.RB_BUSY = true;
        saveSession();
    }
    // The recording reached its destination (saved) or was discarded: every copy of it goes.
    function clearRecording() {
        RBGpxRecorder.clearCheckpoint(); clearSession();
        try { localStorage.removeItem(PENDING_SAVE); } catch (e) {}
        finished = null; window.RB_BUSY = false;
    }
    // Discard, after the confirm that named the loss: the recording, its photos still queued on
    // the device and the draft holding the uploaded ones all go — nothing is left behind to
    // upload into the next roadbook. Removing the draft is best-effort (offline, it stays a draft).
    function discardRecording() {
        const id = draftId;
        RBMediaQueue.drop(photos.map((p) => p.token)).catch(() => {});
        if (id) RBApi('rb_delete', { id }).then((r) => (r && r.ok ? RBApi('rb_purge', { id }) : null)).catch(() => {});
        clearRecording();
        track = []; wpts = []; photos = []; draftId = 0; recordedM = 0;
        startPreview(); // back on the landing: its GPS health again
    }

    RBGpxRecorder.init({
        toast,
        onChange: (recording) => {
            window.RB_BUSY = recording; // never auto-refresh mid-recording
            $('recIdle').hidden = recording;
            $('recRunning').hidden = !recording;
            if (recording) RBStatusBar.show(); else RBStatusBar.hide();
            document.body.classList.toggle('rec-live', recording); // a phone: the screen becomes the tool (#768)
            if (recording && map && map.map) setTimeout(() => map.map.resize(), 60);
        },
    });

    /* ---------- startup: know the user, then pending-save → resume → rescue → idle ----------
       Start stays disabled until startup has decided: a tap before it would begin() over the
       checkpoints of an unfinished recording. The media queue starts after it too, so a photo
       uploading at load finds its pin already restored. */
    $('recStart').disabled = true;
    RBConfig().then(async (c) => {
        meUser = c.user || null; // offline falls back to the last-known user, so capture stays available (#189)
        updateRecUi(); // login known → show the sign-in hint when signed out
        // Before the first fix, centre on the user's saved default location if they set one.
        if (meUser && meUser.default_lat != null && meUser.default_lon != null && !here && map && map.map)
            map.map.jumpTo({ center: [meUser.default_lon, meUser.default_lat], zoom: 13 });

        // Returning from the sign-in redirect with a recording queued for saving: save it now (signed
        // in), or ask Save / Discard again if sign-in was skipped. The stash stays the recording's
        // checkpoint until the save lands or the user discards it (#460).
        const pend = RBCheckpoint.read(PENDING_SAVE);
        if (pend && pend.pts) {
            clearSession(); // a finished track is not resumable: the stash is its one copy
            wpts = pend.wpts || []; photos = await restorePhotos(pend.photos); draftId = pend.draftId || 0;
            recordedM = pend.recordedM || 0; // restore the odometer so the finish modal shows the real km
            holdFinished(pend.pts, pend.name, true);
            if (meUser) { await saveAfterLogin(); return; }
            finishModal(); return; // sign-in skipped — ask again
        }

        const session = RBCheckpoint.read(SESSION_KEY);
        // finished but never landed (a crash with the finish options on screen): reopen them
        if (session && session.finishing && session.pts) {
            wpts = session.wpts || []; photos = await restorePhotos(session.photos); draftId = session.draftId || 0; recordedM = session.recordedM || 0;
            holdFinished(session.pts, session.name, false);
            finishModal(); return;
        }
        // A No is remembered on both checkpoints, which stay (#436): never asked again, and the
        // next recording's checkpoints replace them.
        if (session && session.recording && !session.declined) {
            if (await RBConfirm(t('Resume the recording in progress?') + '<br><b>' + ((session.recordedM || 0) / 1000).toFixed(2) + ' km</b>')) {
                RBGpxRecorder.resume(session.fileName);
                recordedM = session.recordedM || 0; elapsedAcc = session.elapsedAcc || 0; paused = !!session.paused;
                track = []; wpts = session.wpts || []; photos = await restorePhotos(session.photos); draftId = session.draftId || 0;
                updateRecUi();
                startMeter(); renderPauseBtn(); refreshMap(); renderBar();
                return;
            }
            RBCheckpoint.decline(SESSION_KEY);
            RBGpxRecorder.decline(); // its GPX is not offered separately — one simple prompt (#260)
            return;
        }
        await RBGpxRecorder.offerRecovery(); // orphaned GPX (no session) → offer rescue
    }).catch(() => toast('Could not load.')) // a failed startup says so instead of skipping its prompts in silence (#659)
        .finally(() => { initMediaQueue(); startupDone = true; if (!RBGpxRecorder.recording && !finished) startPreview(); renderGpsHealth(); });

    /* ---------- the GPS before the start (#901) ----------
       The landing watches the GPS so the rider sees its health, and Start opens only once startup
       has decided AND the last fix — fresh, not older than GPS_STALE_MS — is good enough to record
       (RB.gpsHealth: fair or good): a recording never begins blind. The watch is the shared
       RBGpsMeter, released the moment the recording starts its own. */
    const GPS_STALE_MS = 10000;
    let preview = null, previewTick = null, previewAcc = null, previewAt = 0, previewDenied = false, startupDone = false;
    const GPS_TEXT = {
        none: ['Searching for GPS…', 'Stay outdoors, with a clear view of the sky.'],
        weak: ['GPS too weak to record', 'Move to an open area — Start opens as soon as the signal is good.'],
        fair: ['GPS ready', 'A fair signal: it sharpens as you go.'],
        good: ['GPS ready', 'A strong signal.'],
        denied: ['Location is blocked', 'Allow location for RDBK in your device settings.'],
    };
    function gpsState() {
        if (previewDenied) return 'denied';
        return Date.now() - previewAt > GPS_STALE_MS ? 'none' : RB.gpsHealth(previewAcc);
    }
    function renderGpsHealth() {
        const state = gpsState(), ready = state === 'good' || state === 'fair';
        $('recGps').dataset.health = state;
        $('recGpsTitle').textContent = t(GPS_TEXT[state][0]);
        $('recGpsHint').textContent = t(GPS_TEXT[state][1]);
        $('recGpsAcc').textContent = state !== 'none' && state !== 'denied' ? '±' + Math.round(previewAcc) + ' m' : '';
        $('recStart').disabled = !(startupDone && ready);
        $('recStartHint').textContent = t(ready ? 'The GPS starts right away' : 'Waiting for a good GPS signal');
    }
    function startPreview() {
        if (preview || RBGpxRecorder.recording) return;
        preview = new RBGpsMeter((fix) => { previewAcc = fix.coords.accuracy; previewAt = Date.now(); previewDenied = false; renderGpsHealth(); },
            (e) => { if (e && e.code === 1) previewDenied = true; renderGpsHealth(); }); // 1 = permission denied
        previewTick = setInterval(renderGpsHealth, 2000); // a signal going stale shows too
        renderGpsHealth();
    }
    function stopPreview() {
        if (preview) preview.stop();
        preview = null; clearInterval(previewTick); previewTick = null;
    }
    window.addEventListener('rb-lang', renderGpsHealth);
    renderGpsHealth(); // searching, Start locked, until the first fix

    // The rider's remote controller (#909): while recording, its mapped buttons drop a note and pause
    RBRemote.attach({
        next: () => { if (RBGpxRecorder.recording) $('recWpt').click(); },
        pause: () => { if (RBGpxRecorder.recording) $('recPause').click(); },
    });

    /* ---------- start / pause / finish ---------- */
    $('recStart').onclick = async () => {
        if (!(await RBWebGpsConfirm(false))) return; // one-time browser warning: web GPS is unreliable
        begin(); // Start records: the route is named in the Editor, when it is saved
    };

    function begin() {
        recordedM = 0; paused = false; lastAcc = null; here = null; lastSampled = null; elapsedAcc = 0;
        course = null; lastHeadingPos = null;
        track = []; wpts = []; photos = []; draftId = 0;
        stopPreview(); // the landing's watch hands over to the recording's own
        RBGpxRecorder.begin({ name: recName() }); // checkpoints the track + flips on the header bar / running view via onChange
        startMeter(); renderPauseBtn(); refreshMap(); renderBar();
        // a draft roadbook holds the geotagged photos (signed-in only), titled with the
        // chosen date+time name so it never shows as "Recording…" (#148). Best-effort now; if it can't
        // be created (offline), captures still buffer and the draft is created on the first flush (#147 F2).
        if (meUser) ensureDraft();
        setTimeout(() => RBTour('recorder', RECORDER_TOUR), 700); // the first recording, before moving off (#906)
    }
    // The Recorder's guided tour (#906): what the recording screen's controls do, once
    const RECORDER_TOUR = [
        { target: '#recWpt', title: 'Note', text: 'One tap drops a note right where you are.' },
        { target: '#recPhoto', title: 'Photo', text: 'Pinned to the track at your position.' },
        { target: '#recUndo', title: 'Undo note', text: 'Removes the last note.' },
        { target: '#recMap', title: 'Your track', text: 'The big number is the distance since the last note.' },
        { target: '#recPause', title: 'Pause', text: 'Stops recording until you resume.' },
        { target: '#recStop', title: 'End', text: 'Save it as a draft roadbook, or discard it.' },
    ];
    // Get the draft container id, creating it once when signed-in and online. Returns null when it
    // can't be made yet (offline, or signed out) so queued captures simply wait (#147 F2), and when
    // this page holds no recording: a capture left in the queue from another one must not create an
    // empty draft of its own. Memoised so a burst of queued items shares a single draft creation.
    let draftPromise = null;
    function ensureDraft() {
        if (draftId) return Promise.resolve(draftId);
        if (!meUser || (!RBGpxRecorder.recording && !finished)) return Promise.resolve(null);
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(null);
        if (!draftPromise) {
            draftPromise = RBApi('rb_draft', { name: RBGpxRecorder.fileName || recName() })
                .then((r) => { draftPromise = null; if (r && r.ok) { draftId = r.id; saveSession(); return draftId; } return null; })
                .catch(() => { draftPromise = null; return null; });
        }
        return draftPromise;
    }
    function startMeter() {
        segStart = paused ? 0 : Date.now();
        // a lost signal never stops a recording (#901 gates only the start): it says so, and the
        // recording carries on, picking the track up again when the fixes come back
        meter = new RBGpsMeter(onFix, () => toast(t('GPS signal lost — the recording carries on and picks up when it returns.'), 4000));
        tick = setInterval(renderBar, 1000);
    }
    function stopMeter() {
        if (meter) meter.stop();
        meter = null; clearInterval(tick); tick = null;
    }
    function onFix(fix) {
        const c = fix.coords;
        lastAcc = c.accuracy; RBStatusBar.setGps(lastAcc);
        // course for the heading-up map: the GPS heading while moving, else the bearing of
        // recent travel; smoothed against jitter and frozen when stopped (no value → no turn).
        const cur = { lat: fix.here.lat, lon: fix.here.lon };
        let h = null;
        if (fix.speedKmh > 3 && fix.heading != null && isFinite(fix.heading)) h = fix.heading;
        else if (lastHeadingPos && RB.geo.haversineM(lastHeadingPos, cur) > 4) h = RB.geo.bearingDeg(lastHeadingPos, cur);
        if (h != null) course = smoothHeading(course, h);
        if (!lastHeadingPos || RB.geo.haversineM(lastHeadingPos, cur) > 4) lastHeadingPos = cur;
        if (map) map.setPosition(fix.here.lat, fix.here.lon, true, course);
        if (RB.recJunkFix(c.accuracy)) { renderBar(); return; }
        here = { lat: fix.here.lat, lon: fix.here.lon, ele: (c.altitude != null && isFinite(c.altitude)) ? c.altitude : null };
        lastFixT = fix.tnow; // latest fix time — a dropped waypoint shares the track's time base (#158)
        if (paused) { renderBar(); return; }
        recordedM += fix.disp;
        const step = RB.recStepM(c.accuracy); // accuracy-scaled sampling (shared with the Editor's recording)
        if (!lastSampled || RB.geo.haversineM(lastSampled, here) >= step) {
            lastSampled = here; track.push(here);
            RBGpxRecorder.add(here, fix.tnow); // its crash-safe checkpoint owns the authoritative track
            refreshMap();
        }
        renderBar();
    }
    function elapsed() { return elapsedAcc + (segStart ? Date.now() - segStart : 0); }

    function renderPauseBtn() {
        $('recPause').classList.toggle('btn-primary', paused);
        $('recPause').querySelector('i').className = paused ? 'fa-solid fa-play' : 'fa-solid fa-pause';
        $('recPauseTxt').textContent = paused ? t('Resume') : t('Pause');
    }
    $('recPause').onclick = () => {
        paused = !paused;
        // Pause keeps the GPS watch alive (position still shown) but stops appending to the track, so
        // resuming continues from a warm, accurate fix instead of a cold-start jump (#149). The elapsed
        // clock freezes on pause; on resume lastSampled is cleared so the first new fix starts a fresh
        // sample. The pause state is checkpointed so a kill mid-pause resumes paused.
        if (paused) { elapsedAcc = elapsed(); segStart = 0; }
        else { segStart = Date.now(); lastSampled = null; }
        saveSession();
        renderPauseBtn(); renderBar();
    };
    $('recStop').onclick = async () => {
        if (!(await RBConfirm(t('Finish the recording?')))) return;
        elapsedAcc = elapsed(); segStart = 0; // the clock stops here (and a No below resumes it from here)
        stopMeter();
        // end() stops logging and hands over the track but KEEPS the crash checkpoint: from here
        // until the finish options land it somewhere, this is the only copy of the recording, so
        // the net stays on and a kill mid-modal is still recoverable (#460).
        const r = RBGpxRecorder.end();
        if (!r.pts || r.pts.length < 2) {
            // nothing to build a roadbook from — but notes and photos may have been captured: never
            // drop them in silence (#647); No goes back to recording
            const lost = wpts.length + photos.length;
            if (lost && !(await RBConfirmDanger(t('Route too short to save.') + '<br>' + t('Discard it with its notes and photos?') + ` (${wpts.length} ${t('notes')} · ${photos.length} ${t('photos')})`))) {
                RBGpxRecorder.resume(r.name, r.pts); startMeter(); return; // every point so far, not the last checkpoint
            }
            discardRecording(); return toast(t('Route too short to save.'));
        }
        holdFinished(r.pts, r.name, false); // the checkpoint holds it until the finish options land it (#460 · #647)
        finishModal();
    };

    /* ---------- waypoints ---------- */
    // RBGpxRecorder owns the authoritative (crash-safe) track; `track` is a light local
    // copy used only to draw the live map. After a resume it starts empty and refills.
    function refreshMap() { if (map) map.setLiveTrack(track, wpts, photos); }

    // A note drops the instant it is tapped — no prompt, nothing to read or type while riding
    // (#768): the bell and the big check say it is done, and its words come later in the Editor.
    // `at_m` is the odometer when it dropped, for the distance since the last note on the map.
    function dropWaypoint(lat, lon) {
        // stamp when it was dropped so the Editor can anchor it on the track by time (#158)
        const note = { lat, lon, name: 'wpt' + (wpts.length + 1), num: wpts.length + 1, text: '', t: lastFixT || null, at_m: recordedM };
        wpts.push(note); refreshMap(); saveSession(); renderBar();
        RBSuccess.flash();
        return note;
    }
    $('recWpt').onclick = () => {
        if (!here) return toast(t('Waiting for a GPS fix…'));
        dropWaypoint(here.lat, here.lon);
    };
    // Undo a note tapped by mistake: it names the note it removes and asks first
    $('recUndo').onclick = async () => {
        const last = wpts[wpts.length - 1]; if (!last) return;
        if (!(await RBConfirmDanger(t('Delete note') + ' ' + last.num + '?'))) return;
        wpts.pop(); refreshMap(); saveSession(); renderBar();
    };
    // the map's own switches, big enough to hit on the move: base style · course-up
    $('recLayer').onclick = () => { if (map) map.toggleBaseStyle(); };
    const paintHeading = () => $('recHeading').classList.toggle('on', !!(map && map.headingUp()));
    $('recHeading').onclick = () => { if (map) { map.setHeadingUp(!map.headingUp()); paintHeading(); } };
    paintHeading();
    // The photo is open to everyone: the shot is queued, uploaded when signed in and kept on the
    // device otherwise (#147 F3); the idle hint tells a signed-out user so. Called once config() is known.
    function updateRecUi() {
        const hint = $('recLoginHint'); if (hint) hint.hidden = !!meUser;
        const bg = $('recBgHint'); if (bg) bg.hidden = document.documentElement.classList.contains('native');
        const nativeHint = $('recNativeHint'); if (nativeHint) nativeHint.hidden = document.documentElement.classList.contains('native');
        RBWebGpsWarn(); // browser-only floating warning: web GPS is unreliable on phones
    }

    /* ---------- offline-first media queue (#147) ----------
       Photos are buffered in IndexedDB and uploaded with retry, so a network drop
       mid-recording never loses them. A photo shows an optimistic pin from a local blob
       URL, reconciled to the server URL (with its id) when the upload lands. Started once
       startup has restored the pins (see above). */
    const initMediaQueue = () => RBMediaQueue.init({
        // pre-draft/offline captures have no roadbook yet; the queue asks for one at flush
        // time and this creates the draft once a connection is back (#147 F2)
        resolveRoadbook: ensureDraft,
        onChange: (n) => {
            const el = $('recPending'); if (!el) return;
            el.hidden = !n;
            // signed in → uploading with retry; signed out → kept on the device for the local .rdbk
            el.textContent = n ? (n + ' ' + t(meUser ? 'awaiting upload' : 'kept on this device')) : '';
        },
        onDone: (item, res) => {
            const p = photos.find((x) => x.token === item.token);
            if (!p) return; // uploaded from a previous session — no pin in this one
            if (p.local && p.url) { try { URL.revokeObjectURL(p.url); } catch (e) {} }
            p.id = res.id; p.url = RBMediaSrc(res.url); p.local = false; p.pending = false; // absolute in the app (#232)
            if (res.lat != null) { p.lat = res.lat; p.lon = res.lon; }
            refreshMap(); saveSession();
        },
    });

    /* ---------- photos (camera → queued; uploaded when signed in, kept locally otherwise) ---------- */
    $('recPhoto').onclick = () => {
        $('recPhotoFile').click(); // open to everyone — the shot is queued; no draft/login needed (#147 F3)
    };
    $('recPhotoFile').onchange = (e) => {
        const f = e.target.files[0]; e.target.value = ''; if (!f) return;
        const lat = here ? here.lat : null, lon = here ? here.lon : null;
        const fields = { type: 'photo' };
        if (draftId) fields.roadbook = String(draftId); // else resolved at flush time
        if (lat != null) { fields.lat = lat; fields.lon = lon; }
        // optimistic pin from the local blob; reconciled to the server URL on upload (onDone)
        const token = 'p' + Date.now() + '_' + (++mediaSeq);
        const localUrl = URL.createObjectURL(f);
        const pin = { token, url: localUrl, lat, lon, local: true, pending: true };
        photos.push(pin);
        refreshMap(); saveSession(); renderBar();
        // The device could not keep it (storage full, private mode): say so. The pin is marked
        // failed — it lives in this page only, and a reload cannot bring it back.
        RBMediaQueue.add('photo', f, fields, 'photo.jpg', token).catch(() => {
            pin.pending = false; pin.failed = true; saveSession();
            toast('Could not save.');
        });
        // A photo is ALWAYS a waypoint (#282): drop one automatically so the note carries the photo
        // when the roadbook is edited later — no "convert to waypoint?" prompt, no extra confirm step.
        if (lat != null) { dropWaypoint(lat, lon).photo = token; saveSession(); } // the note knows its photo (#792)
    };

    /* ---------- finish: Save (into the draft, then the Editor) or Discard ---------- */

    // Build the roadbook from the track + waypoints and write it into the draft that holds the
    // geotagged photos (rb_save with id=draft), so nothing has to go through the Editor.
    // ensureDraft() first guarantees a single container for both the notes and the photos.
    // Returns { id, roadbook } or null (too short / save failed — a toast is shown).
    // A note dropped by a photo carries that photo as its Photo extra (#792), embedded like any
    // extra; the photo itself stays in the roadbook's gallery. One still waiting to upload is read
    // from its queued capture. A photo that cannot be read (gone from the device, offline) just
    // leaves its note without the extra.
    const PHOTO_MAX = RB.blockType({ type: 'photo' }).imageMax;
    async function photoBlob(p) {
        const rec = p.local ? await RBMediaQueue.get(p.token) : null;
        return rec && rec.blob ? rec.blob : (await fetch(p.url)).blob();
    }
    async function withPhotos(list) {
        return Promise.all(list.map(async (w) => {
            const p = w.photo && photos.find((x) => x.token === w.photo);
            if (!p || !p.url) return w;
            try { return Object.assign({}, w, { blocks: [{ type: 'photo', placement: 'after', image: await RBImg.toDataURL(await photoBlob(p), PHOTO_MAX) }] }); }
            catch (e) { return w; }
        }));
    }
    async function saveToProfile(pts, nm) {
        let roadbook;
        try { roadbook = RB.buildRoadbook({ name: nm, trkpts: pts, wpts: await withPhotos(wpts) }); }
        catch (e) { toast(t('Route too short to save.')); return null; }
        const id = await ensureDraft(); // the draft the queued photos also attach to
        const r = await RBApi('rb_save', { id: id || 0, status: 'draft', roadbook: RB.writeRoadbook(roadbook) });
        if (!r.ok) { toast(r.error || t('Could not save.')); return null; }
        draftId = r.id;
        try { RBMediaQueue.flush(); } catch (e) {} // push any still-buffered media into this draft
        return { id: r.id, roadbook };
    }

    // Back from the sign-in redirect with a recording queued for saving: save it and open it in the
    // Editor; if that fails, the question comes back (the toast has said why) and the stash stays.
    async function saveAfterLogin() {
        const built = await saveToProfile(finished.pts, finished.name);
        if (!built) return finishModal();
        clearRecording();
        location.href = '../editor/?rb=' + built.id;
    }

    // The end of a recording is one question (#791): Save or Discard. Save stores the draft roadbook
    // and opens it in the Editor — where it is named, written up and exported; signed out, it goes
    // through the sign-in page first and comes back to the same save. Discard asks first and names
    // what would be lost. Until one of the two lands, the crash checkpoint keeps the recording (#460).
    function finishModal() {
        const { pts, name: nm } = finished;
        const summary = `${RBKm(recordedM)} · ${wpts.length} ${t('notes')} · ${photos.length} ${t('photos')}`;
        const d = RBModal(`<h3>${t('Recorded track')}</h3>
            <p class="muted small">${summary}</p>
            <div class="btnrow center">
                <button class="btn btn-danger" id="rfDiscard" type="button"><i class="fa-solid fa-trash-can"></i> ${t('Discard')}</button>
                <button class="btn btn-primary" id="rfSave" type="button"><i class="fa-solid fa-floppy-disk"></i> ${t('Save')}</button>
            </div>`, 'slim center', null, { dismissable: false });
        d.q('#rfSave').onclick = async () => {
            if (!meUser) {
                // no in-page login: stash the recording and round-trip through the sign-in page, which
                // brings it back here to be saved. Leave only once it is safely stashed — a storage-quota
                // failure on a huge track must not redirect and lose it.
                let stashed = false;
                try { localStorage.setItem(PENDING_SAVE, JSON.stringify(finishedRecord())); stashed = true; } catch (e) {}
                if (!stashed) return toast(t('Could not save.'));
                finished.stashed = true;
                RBGpxRecorder.clearCheckpoint(); clearSession(); // the stash is the copy now, kept until the save lands
                location.href = RBLoginUrl();
                return;
            }
            const busy = RBBusy(d.q('#rfSave')); // the network write takes a moment
            const built = await saveToProfile(pts, nm);
            if (!built) { busy.reset(); return; } // the toast said why; the recording is still safe
            clearRecording();
            location.href = '../editor/?rb=' + built.id;
        };
        d.q('#rfDiscard').onclick = async () => {
            if (!(await RBConfirmDanger(t('Discard this recording?') + '<br>' + summary))) return;
            discardRecording();
            d.close();
        };
    }

    /* ---------- the running dashboard (the clock/battery/GPS bar is RBStatusBar) ---------- */
    function renderBar() {
        $('rbKmBox').textContent = (recordedM / 1000).toFixed(2);
        $('rbSpeed').textContent = meter ? Math.round(meter.speedKmh) : 0;
        $('rbWptsN').textContent = wpts.length;
        const last = wpts[wpts.length - 1];
        $('recSince').textContent = ((recordedM - (last ? last.at_m || 0 : 0)) / 1000).toFixed(2); // since the last note (or the start)
        $('recUndo').disabled = !last;
        const s = Math.floor(elapsed() / 1000);
        $('rbElapsed').textContent = Math.floor(s / 60) + ':' + pad2(s % 60);
        saveSession();
    }
})();
