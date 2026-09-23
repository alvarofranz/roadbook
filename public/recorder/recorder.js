'use strict';
/* RDBK Recorder — a dedicated live GPX track recorder. Records a route with the
 * shared GPS loop (RBGpsMeter) and crash-safe GPX logging (RBGpxRecorder), shows
 * it live on a map (RBMap), and lets you drop named waypoints and snap geotagged
 * photos along the way. The shared status bar (RBStatusBar) shows the clock,
 * battery and satellite/GPS status; the recorded kilometres show in the dashboard.
 * On Finish you can download the GPX or convert the whole thing (track + waypoints
 * + photos) into a roadbook in the Editor. The session is checkpointed so a reload
 * or an OS kill can resume. */
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
    function saveSession() {
        if (!RBGpxRecorder.recording) return; // don't clobber a resumable session before recording starts
        try { localStorage.setItem(SESSION_KEY, JSON.stringify({ recording: true, fileName: RBGpxRecorder.fileName, recordedM, elapsedAcc: elapsed(), paused, wpts, photos, draftId })); } catch (e) {}
    }
    function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
    // A finished recording that has not landed anywhere yet: everything the finish options need
    // (points, notes, photo pins, the draft), so a crash with them on screen reopens them (#647).
    function saveFinishing(pts, name) {
        try { localStorage.setItem(SESSION_KEY, JSON.stringify({ finishing: true, pts, name, recordedM, wpts, photos: photos.filter((p) => !p.local), draftId })); } catch (e) {}
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

    /* ---------- startup: know the user, then pending-save → resume → rescue → idle ---------- */
    RBConfig().then(async (c) => {
        meUser = c.user || null; // offline falls back to the last-known user, so capture stays available (#189)
        updateRecUi(); // login known → show the sign-in hint when signed out
        // Before the first fix, centre on the user's saved default location if they set one.
        if (meUser && meUser.default_lat != null && meUser.default_lon != null && !here && map && map.map)
            map.map.jumpTo({ center: [meUser.default_lon, meUser.default_lat], zoom: 13 });

        // Returning from the sign-in redirect with a recording queued for saving: save it now (signed
        // in), or ask Save / Discard again if sign-in was skipped. This finished track
        // is not resumable, so clear the in-progress session either way.
        let pend; try { pend = JSON.parse(localStorage.getItem(PENDING_SAVE) || 'null'); } catch (e) {}
        if (pend && pend.pts) {
            localStorage.removeItem(PENDING_SAVE);
            clearSession();
            wpts = pend.wpts || [];
            recordedM = pend.recordedM || 0; // restore the odometer so the finish modal shows the real km
            if (meUser) { await saveAfterLogin(pend); return; }
            finishModal(pend.pts, pend.name); return; // sign-in skipped — ask again
        }

        let session; try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) {}
        // finished but never landed (a crash with the finish options on screen): reopen them
        if (session && session.finishing && session.pts) {
            wpts = session.wpts || []; photos = session.photos || []; draftId = session.draftId || 0; recordedM = session.recordedM || 0;
            finishModal(session.pts, session.name); return;
        }
        if (session && session.recording) {
            if (await RBConfirm(t('Resume the recording in progress?') + '<br><b>' + ((session.recordedM || 0) / 1000).toFixed(2) + ' km</b>')) {
                RBGpxRecorder.resume(session.fileName);
                recordedM = session.recordedM || 0; elapsedAcc = session.elapsedAcc || 0; paused = !!session.paused;
                track = []; wpts = session.wpts || []; photos = (session.photos || []).filter((p) => !p.local); draftId = session.draftId || 0;
                updateRecUi();
                startMeter(); renderPauseBtn(); refreshMap(); renderBar();
                return;
            }
            clearSession();
            RBGpxRecorder.clearCheckpoint(); // the orphaned GPX data goes with it — one simple prompt (#260)
        }
        await RBGpxRecorder.offerRecovery(); // orphaned GPX (no session) → offer rescue
    }).catch(() => toast('Could not load.')); // a failed startup says so instead of skipping its prompts in silence (#659)

    /* ---------- start / pause / finish ---------- */
    $('recStart').onclick = async () => {
        if (!(await RBWebGpsConfirm(false))) return; // one-time browser warning: web GPS is unreliable
        RBGpxRecorder.settings({ defaultName: recName(), nameLabel: t('Roadbook name'), onStart: begin });
    };

    function begin() {
        recordedM = 0; paused = false; lastAcc = null; here = null; lastSampled = null; elapsedAcc = 0;
        course = null; lastHeadingPos = null;
        track = []; wpts = []; photos = []; draftId = 0;
        RBGpxRecorder.begin(); // checkpoints the track + flips on the header bar / running view via onChange
        startMeter(); renderPauseBtn(); refreshMap(); renderBar();
        // a draft roadbook holds the geotagged photos/voice notes (signed-in only), titled with the
        // chosen date+time name so it never shows as "Recording…" (#148). Best-effort now; if it can't
        // be created (offline), captures still buffer and the draft is created on the first flush (#147 F2).
        if (meUser) ensureDraft();
    }
    // Get the draft container id, creating it once when signed-in and online. Returns null when it
    // can't be made yet (offline, or signed out) so queued captures simply wait (#147 F2). Memoised
    // so a burst of queued items shares a single draft creation.
    let draftPromise = null;
    function ensureDraft() {
        if (draftId) return Promise.resolve(draftId);
        if (!meUser || (typeof navigator !== 'undefined' && navigator.onLine === false)) return Promise.resolve(null);
        if (!draftPromise) {
            draftPromise = RBApi('rb_draft', { name: RBGpxRecorder.fileName || recName() })
                .then((r) => { draftPromise = null; if (r && r.ok) { draftId = r.id; saveSession(); return draftId; } return null; })
                .catch(() => { draftPromise = null; return null; });
        }
        return draftPromise;
    }
    function startMeter() {
        segStart = paused ? 0 : Date.now();
        meter = new RBGpsMeter(onFix, () => toast(t('GPS could not get a fix. Move to an open area and restart the recording.')));
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
            RBGpxRecorder.add(here, fix.tnow); // the crash-safe checkpoint + live file own the authoritative track
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
                RBGpxRecorder.resume(r.name); startMeter(); return;
            }
            clearSession(); RBGpxRecorder.clearCheckpoint(); return toast(t('Route too short to save.'));
        }
        saveFinishing(r.pts, r.name); // the checkpoint holds it until the finish options land it (#460 · #647)
        finishModal(r.pts, r.name);
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
    const paintHeading = () => $('recHeading').classList.toggle('on', !!(map && map._headingUp));
    $('recHeading').onclick = () => { if (map) { map.setHeadingUp(!map._headingUp); paintHeading(); } };
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
       Photos and voice notes are buffered in IndexedDB and uploaded with retry, so a
       network drop mid-recording never loses them. A photo shows an optimistic pin from
       a local blob URL, reconciled to the server URL (with its id) when the upload lands. */
    RBMediaQueue.init({
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
            if (item.kind !== 'photo') return; // voice notes have no map pin to reconcile
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
        photos.push({ token, url: localUrl, lat, lon, local: true, pending: true });
        refreshMap(); saveSession(); renderBar();
        RBMediaQueue.add('photo', f, fields, 'photo.jpg', token);
        // A photo is ALWAYS a waypoint (#282): drop one automatically so the note carries the photo
        // when the roadbook is edited later — no "convert to waypoint?" prompt, no extra confirm step.
        if (lat != null) dropWaypoint(lat, lon);
    };

    /* ---------- finish: Save (into the draft, then the Editor) or Discard ---------- */

    // Build the roadbook from the track + waypoints and write it into the draft that holds the
    // geotagged photos and voice notes (rb_save with id=draft), so nothing has to go through the
    // Editor. ensureDraft() first guarantees a single container for both the notes and the media.
    // Returns { id, roadbook } or null (too short / save failed — a toast is shown).
    async function saveToProfile(pts, nm) {
        let roadbook;
        try { roadbook = RB.buildRoadbook({ name: nm, trkpts: pts, wpts }); }
        catch (e) { toast(t('Route too short to save.')); return null; }
        const id = await ensureDraft(); // the draft the queued photos/voice notes also attach to
        const r = await RBApi('rb_save', { id: id || draftId || 0, status: 'draft', roadbook: RB.roadbookForExport(roadbook) });
        if (!r.ok) { toast(r.error || t('Could not save.')); return null; }
        draftId = r.id;
        try { RBMediaQueue.flush(); } catch (e) {} // push any still-buffered media into this draft
        return { id: r.id, roadbook };
    }

    // Back from the sign-in redirect with a recording queued for saving: save it and open it in the
    // Editor; if that fails, the question comes back (the toast has said why).
    async function saveAfterLogin(pend) {
        const built = await saveToProfile(pend.pts, pend.name);
        if (built) location.href = '../editor/?rb=' + built.id; else finishModal(pend.pts, pend.name);
    }

    // The end of a recording is one question (#791): Save or Discard. Save stores the draft roadbook
    // and opens it in the Editor — where it is named, written up and exported; signed out, it goes
    // through the sign-in page first and comes back to the same save. Discard asks first and names
    // what would be lost. Until one of the two lands, the crash checkpoint keeps the recording (#460).
    function finishModal(pts, name) {
        const nm = name || recName();
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
                try { localStorage.setItem(PENDING_SAVE, JSON.stringify({ pts, wpts, name: nm, recordedM })); stashed = true; } catch (e) {}
                if (!stashed) return toast(t('Could not save.'));
                RBGpxRecorder.clearCheckpoint(); clearSession(); // the stash is the copy now
                location.href = RBLoginUrl();
                return;
            }
            const busy = RBBusy(d.q('#rfSave')); // the network write takes a moment
            const built = await saveToProfile(pts, nm);
            if (!built) { busy.reset(); return; } // the toast said why; the recording is still safe
            RBGpxRecorder.clearCheckpoint(); clearSession();
            location.href = '../editor/?rb=' + built.id;
        };
        d.q('#rfDiscard').onclick = async () => {
            if (!(await RBConfirmDanger(t('Discard this recording?') + '<br>' + summary))) return;
            RBGpxRecorder.clearCheckpoint(); clearSession();
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
