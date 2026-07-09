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
    // Default roadbook name proposed when a recording starts: date + time, "YYYY-MM-DD HH-MM" (#148).
    const recName = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + '-' + pad2(d.getMinutes()); };

    let meter = null, map = null, meUser = null, draftId = 0;
    // Speech-to-text language for voice notes: the signed-in user's account preference
    // (set in /account/), or the device language when unset or signed out.
    const voiceLang = () => (meUser && meUser.voice_lang) || navigator.language || 'en-US';
    let recordedM = 0, paused = false, lastAcc = null, here = null, lastSampled = null, lastFixT = 0;
    let track = [], wpts = [], photos = [];
    let mediaSeq = 0; // client tokens for optimistic photo pins reconciled by RBMediaQueue
    let elapsedAcc = 0, segStart = 0, tick = null; // recording stopwatch (pauses with the recording)

    /* ---------- map ---------- */
    map = new RBMap('recMap', { zoom: 15, headingToggle: true });
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

    RBGpxRecorder.init({
        toast,
        onChange: (recording) => {
            window.RB_BUSY = recording; // never auto-refresh mid-recording
            $('recIdle').hidden = recording;
            $('recRunning').hidden = !recording;
            if (recording) RBStatusBar.show(); else RBStatusBar.hide();
            if (recording && map && map.map) setTimeout(() => map.map.resize(), 60);
        },
    });

    /* ---------- startup: know the user, then resume → rescue → idle ---------- */
    RBConfig().then((c) => {
        meUser = c.user || null; // offline falls back to the last-known user, so capture stays available (#189)
        updateRecUi(); // login known → reveal WP audio (signed-in) or show the sign-in hint
        // Before the first fix, centre on the user's saved default location if they set one.
        if (meUser && meUser.default_lat != null && meUser.default_lon != null && !here && map && map.map)
            map.map.jumpTo({ center: [meUser.default_lon, meUser.default_lat], zoom: 13 });
    }).catch(() => {});
    (async function () {
        let session; try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) {}
        if (session && session.recording) {
            // Declining must never destroy a run: it's replaced as it records, or cleared on Finish.
            if (await RBConfirm(t('Resume the recording in progress?') + '<br><b>' + ((session.recordedM || 0) / 1000).toFixed(2) + ' km</b>', t('Resume'))) {
                RBGpxRecorder.resume(session.fileName);
                recordedM = session.recordedM || 0; elapsedAcc = session.elapsedAcc || 0; paused = !!session.paused;
                track = []; wpts = session.wpts || []; photos = (session.photos || []).filter((p) => !p.local); draftId = session.draftId || 0;
                updateRecUi(); // photo/audio buttons follow sign-in, not the draft (#147 F2)
                startMeter(); renderPauseBtn(); refreshMap(); renderBar();
                return;
            }
            clearSession();
        }
        await RBGpxRecorder.offerRecovery();
    })();

    /* ---------- start / pause / finish ---------- */
    $('recStart').onclick = () => RBGpxRecorder.settings({ defaultName: recName(), nameLabel: t('Roadbook name'), onStart: begin });

    function begin() {
        recordedM = 0; paused = false; lastAcc = null; here = null; lastSampled = null; elapsedAcc = 0;
        course = null; lastHeadingPos = null;
        track = []; wpts = []; photos = []; draftId = 0; showWpText(null);
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
        meter = new RBGpsMeter(onFix, () => toast(t('No geolocation on this device.')));
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
        if (!(await RBConfirm(t('Finish the recording?'), t('Finish')))) return;
        stopMeter();
        const r = await RBGpxRecorder.finish(); // stops logging, returns the full track, onChange(false) → idle
        clearSession();
        if (!r.pts || r.pts.length < 2) return toast(t('Route too short to save.'));
        finishModal(r.pts, r.name);
    };

    /* ---------- waypoints ---------- */
    // RBGpxRecorder owns the authoritative (crash-safe) track; `track` is a light local
    // copy used only to draw the live map. After a resume it starts empty and refills.
    function refreshMap() { if (map) map.setLiveTrack(track, wpts, photos); }

    function dropWaypoint(lat, lon, text) {
        // stamp when it was dropped so the Editor can anchor it on the track by time (#158)
        const note = { lat, lon, name: 'wpt' + (wpts.length + 1), num: wpts.length + 1, text: text || '', t: lastFixT || null };
        wpts.push(note); refreshMap(); saveSession(); renderBar();
        return note;
    }
    // #53: surface the latest waypoint's note (especially the dictated audio text) on the running screen.
    function showWpText(note) {
        const el = $('recLastWp');
        if (note && note.text) { el.textContent = t('Waypoint') + ' ' + note.num + ': ' + note.text; el.hidden = false; }
        else el.hidden = true;
    }
    // Waypoint: drops instantly, then the shared quick-text prompt (auto-dismisses in 5 s),
    // with the dictation mic where speech-to-text is supported.
    $('recWpt').onclick = () => {
        if (!here) return toast(t('Waiting for a GPS fix…'));
        const note = dropWaypoint(here.lat, here.lon, '');
        RBWaypointPrompt(note.num, (text) => { note.text = text; showWpText(note); }, { mic: true, lang: voiceLang });
    };

    // "WP audio" (#129): press and HOLD to record — drops a waypoint and records its note
    // (speech-to-text + the kept audio when signed in). On release it keeps recording for 5s
    // more, then stops, so the last words aren't clipped. Pointer events + capture so a finger
    // sliding off still releases; the touch callout / selection are suppressed in CSS.
    const SR_REC = window.SpeechRecognition || window.webkitSpeechRecognition;
    const CAN_REC_AUDIO = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    const wptBtn = $('recWptAudio');
    // WP photo / WP audio are available to EVERYONE, signed in or not (#147 F3): captures buffer in
    // the local queue. Signed in, they upload to the draft; signed out, they're kept on the device and
    // saved into a self-contained .rdbk at the end (audio only where the device can record). The idle
    // hint tells signed-out users their media is kept locally. Called once config() is known.
    function updateRecUi() {
        wptBtn.hidden = !(SR_REC || CAN_REC_AUDIO);
        $('recPhoto').hidden = false;
        const hint = $('recLoginHint'); if (hint) hint.hidden = !!meUser;
        const bg = $('recBgHint'); if (bg) bg.hidden = document.documentElement.classList.contains('native'); // only the native app records in the background
    }
    let wptRecActive = false, wptSR = null, wptMedia = null, wptTail = null, wptHolding = false, wptCount = 5, wptFinish = null;
    const wptLabel = wptBtn.querySelector('span'); // the "WP audio" caption — also shows the release countdown
    const setWptCount = (n) => { if (wptLabel) wptLabel.textContent = (n == null) ? t('WP audio') : String(n); };

    async function startWptAudio() {
        if (wptRecActive) return; // already recording (or in the release countdown)
        if (!here) return toast(t('Waiting for a GPS fix…'));
        wptRecActive = true; wptHolding = true; wptCount = 5; // hold to record; first release counts down from 5
        const note = dropWaypoint(here.lat, here.lon, '');
        const wptLat = here.lat, wptLon = here.lon;
        let ended = false;
        wptFinish = () => {
            if (ended) return; ended = true; wptRecActive = false; wptHolding = false;
            if (wptTail) { clearInterval(wptTail); wptTail = null; }
            wptBtn.classList.remove('on'); setWptCount(null);
            if (wptSR) { try { wptSR.stop(); } catch (e) {} }
            if (wptMedia && wptMedia.state !== 'inactive') wptMedia.stop(); // → onstop uploads the clip
            wptSR = null; wptMedia = null; wptFinish = null; refreshMap();
        };
        // Record the audio clip FIRST, so it claims the microphone. On mobile the mic is exclusive:
        // starting speech-to-text first was stealing it, so getUserMedia failed and the clip came out
        // empty (and Android STT didn't transcribe either). The clip is buffered and handled later, so
        // it works offline, before the draft exists, and signed out (kept locally) (#147 F2/F3).
        if (CAN_REC_AUDIO) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (ended) { stream.getTracks().forEach((tk) => tk.stop()); return; } // released during the mic prompt
                const mr = new MediaRecorder(stream), chunks = [];
                wptMedia = mr;
                mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
                mr.onstop = () => {
                    stream.getTracks().forEach((tk) => tk.stop());
                    if (!chunks.length) { toast(t('No audio captured.')); return; } // nothing recorded
                    // buffer + upload with retry (#147); roadbook is resolved at flush (draft may not exist yet)
                    const fields = { type: 'audio', lat: wptLat, lon: wptLon };
                    if (draftId) fields.roadbook = String(draftId);
                    RBMediaQueue.add('audio', new Blob(chunks, { type: mr.mimeType }), fields);
                    toast(t('Voice note saved.'));
                };
                mr.start(1000); // periodic data chunks → robust even if stop() timing is odd on mobile
            } catch (e) { wptMedia = null; toast(t('Microphone unavailable.')); } // surface the failure, don't fail silently
        }
        // Speech-to-text → note.text: best-effort, started AFTER the recorder has the mic, so it only
        // runs where the platform allows a second mic consumer (e.g. desktop). It never controls the
        // lifecycle — if it ends/errors (as on Android) we just keep recording the clip.
        if (SR_REC) {
            try {
                wptSR = new SR_REC();
                wptSR.lang = voiceLang();
                wptSR.interimResults = true; wptSR.continuous = true;
                wptSR.onresult = (e) => { let txt = ''; for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript; note.text = txt; saveSession(); showWpText(note); };
                wptSR.onend = () => { wptSR = null; };
                wptSR.onerror = () => { wptSR = null; };
                wptSR.start();
            } catch (e) { wptSR = null; }
        }
        if (!wptSR && !wptMedia) { wptRecActive = false; wptFinish = null; return; } // nothing to record
        wptBtn.classList.add('on'); toast(t('Recording… release to finish'));
    }

    // Release → keep recording while a countdown ticks ON the button (5s first, 2s after a re-press),
    // then save automatically at 0 (the waypoint was already dropped on press — no confirm).
    function releaseWptAudio() {
        if (!wptRecActive || !wptHolding) return; // not recording, or already counting down
        wptHolding = false;
        let n = wptCount; setWptCount(n);
        wptTail = setInterval(() => {
            n -= 1;
            if (n <= 0) { clearInterval(wptTail); wptTail = null; if (wptFinish) wptFinish(); }
            else setWptCount(n);
        }, 1000);
    }

    // Press to start; release anywhere (document-level, so a finger sliding off still releases) to
    // begin the countdown. Re-pressing during the countdown cancels it and keeps recording, with the
    // next countdown shortened to 2. No setPointerCapture — it's flaky on Android.
    wptBtn.addEventListener('pointerdown', (e) => {
        if (e.button && e.button !== 0) return; // primary button / touch only
        e.preventDefault();                     // no text selection / iOS long-press callout / synthetic click
        if (wptRecActive) { // re-press during the release countdown → resume recording, next countdown is 2
            if (wptTail) { clearInterval(wptTail); wptTail = null; }
            wptHolding = true; wptCount = 2; setWptCount(null);
            return;
        }
        startWptAudio();
    });
    document.addEventListener('pointerup', releaseWptAudio);
    document.addEventListener('pointercancel', releaseWptAudio);
    wptBtn.addEventListener('contextmenu', (e) => e.preventDefault());

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
        RBPhotoPreview(localUrl, () => { if (lat != null) { dropWaypoint(lat, lon, ''); toast(t('Waypoint')); } });
    };

    /* ---------- finish: save to the server, export GPX, or open in the Editor ---------- */
    // File extension for a queued media blob, by MIME (photos keep their original type; voice-note
    // container varies by browser). Falls back sensibly so the bundle always has a usable name.
    function mediaExt(mime, kind) {
        const m = (mime || '').split(';')[0];
        return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/avif': 'avif', 'image/webp': 'webp', 'image/heic': 'heic',
            'audio/webm': 'webm', 'video/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' })[m] || (kind === 'audio' ? 'webm' : 'jpg');
    }
    // Build a self-contained .rdbk (roadbook.json + bundled photos/audio + media.json geotags) from
    // the current recording and the locally-queued media, and download it — the signed-out save path
    // (#147 F3), same container format as the Editor's export (#162). Returns the number of media
    // files bundled, or null if the track was too short to build.
    async function exportLocalRdbk(pts, name) {
        let roadbook;
        try { roadbook = RB.buildRoadbook({ name, trkpts: pts, wpts }); }
        catch (e) { toast(t('Route too short to save.')); return null; }
        const files = { 'roadbook.json': JSON.stringify(roadbook) };
        const media = { photos: [], audio: [] };
        let n = 0;
        for (const it of await RBMediaQueue.items()) {
            if (!it.blob) continue;
            const dir = it.kind === 'audio' ? 'audio' : 'photos';
            const file = dir + '/' + it.kind + '-' + (++n) + '.' + mediaExt(it.blob.type, it.kind);
            files[file] = new Uint8Array(await it.blob.arrayBuffer());
            const f = it.fields || {};
            (it.kind === 'audio' ? media.audio : media.photos).push({ file, lat: f.lat != null ? f.lat : null, lon: f.lon != null ? f.lon : null });
        }
        const bundled = media.photos.length + media.audio.length;
        if (bundled) files['media.json'] = JSON.stringify(media);
        RBDownload(await RBZip.write(files), RB.slug(name) + '.rdbk');
        return bundled;
    }

    // Signed in, the primary action SAVES the recording to the profile in one tap (#143): it
    // builds the roadbook from the track + waypoints and writes it into the draft that already
    // holds the geotagged photos and voice notes (rb_save with id=draftId), so nothing has to go
    // through the Editor. Signed out, the primary action exports a self-contained .rdbk (with the
    // buffered media). Export GPX is a local file without media; "Open in the editor" refines it.
    function finishModal(pts, name) {
        const km = (recordedM / 1000).toFixed(2);
        const nm = name || recName();
        const signedIn = !!meUser;
        const d = RBModal(`<h3>${t('Recorded track')}</h3>
            <p class="muted small">${pts.length} ${t('points')} · ${km} km · ${wpts.length} wpt · ${photos.length} 📷</p>
            <div class="btnrow center wrap">
                ${signedIn
                    ? `<button class="btn btn-primary" id="rfSave"><i class="fa-solid fa-cloud-arrow-up"></i> ${t('Save to server')}</button>`
                    : `<button class="btn btn-primary" id="rfRdbk"><i class="fa-solid fa-file-zipper"></i> ${t('Export .rdbk')}</button>`}
                <button class="btn btn-ghost" id="rfEd"><i class="fa-solid fa-map-location-dot"></i> ${t('Open in the editor')}</button>
                <button class="btn btn-ghost" id="rfDl"><i class="fa-solid fa-file-arrow-down"></i> ${t('Export GPX')}</button>
            </div>
            <p class="muted small">${signedIn ? t('Saving keeps your photos and voice notes; GPX is a local file without them.') : t('The .rdbk keeps your photos and voice notes in one file; GPX has the track only.')}</p>
            <div class="btnrow center"><button class="btn btn-ghost" id="rfClose">${t('Close')}</button></div>`, 'slim center');
        if (signedIn) d.q('#rfSave').onclick = async () => {
            let roadbook;
            try { roadbook = RB.buildRoadbook({ name: nm, trkpts: pts, wpts }); }
            catch (e) { return toast('Track too short to save.'); }
            const btn = d.q('#rfSave'); btn.disabled = true;
            // reuse the draft (id) so the already-uploaded photos/audio stay attached
            const r = await RBApi('rb_save', { id: draftId || 0, status: 'draft', roadbook });
            btn.disabled = false;
            if (!r.ok) return toast(r.error || 'Could not save.');
            d.close();
            // stay on the Recorder — a small confirmation with a link to refine in the Editor
            const c = RBModal(`<h3><i class="fa-solid fa-circle-check icon-accent"></i> ${t('Saved to your profile.')}</h3>
                <p class="muted small">${RBesc(roadbook.meta.title)} · ${roadbook.notes.length} ${t('notes')}</p>
                <div class="btnrow center wrap">
                    <a class="btn btn-primary" href="../editor/?rb=${r.id}"><i class="fa-solid fa-pen-ruler"></i> ${t('Edit')}</a>
                    <button class="btn btn-ghost" id="scClose">${t('Close')}</button>
                </div>`, 'slim center');
            c.q('#scClose').onclick = c.close;
        };
        else d.q('#rfRdbk').onclick = async () => {
            const btn = d.q('#rfRdbk'); btn.disabled = true;
            const n = await exportLocalRdbk(pts, nm);
            btn.disabled = false;
            if (n == null) return; // track too short — toast already shown
            d.close();
            // the media now lives in the downloaded file → offer to free it from the device
            if (n > 0 && await RBConfirm(t('Saved a local .rdbk with your photos and voice notes. Remove them from this device now?'), t('Remove')))
                await RBMediaQueue.clear();
        };
        d.q('#rfEd').onclick = () => {
            try {
                sessionStorage.setItem('rb_trip_track', JSON.stringify(pts));
                sessionStorage.setItem('rb_trip_wpts', JSON.stringify(wpts));
                if (name) sessionStorage.setItem('rb_trip_name', name); // carry the chosen roadbook name (#54)
                if (draftId) sessionStorage.setItem('rb_trip_draft', String(draftId));
            } catch (e) {}
            location.href = '../editor/?trip=1';
        };
        d.q('#rfDl').onclick = () => {
            const gpxWpts = wpts.map((w) => ({ lat: w.lat, lon: w.lon, name: w.text || w.name, t: w.t }));
            RBDownload(new Blob([RB.gpxDocument(nm, pts, gpxWpts)], { type: 'application/gpx+xml' }), nm + '.gpx');
            d.close();
        };
        d.q('#rfClose').onclick = d.close;
    }

    /* ---------- the running dashboard (the clock/battery/GPS bar is RBStatusBar) ---------- */
    function renderBar() {
        $('rbKmBox').textContent = (recordedM / 1000).toFixed(2);
        $('rbSpeed').textContent = meter ? Math.round(meter.speedKmh) : 0;
        $('rbWptsN').textContent = wpts.length;
        const s = Math.floor(elapsed() / 1000);
        $('rbElapsed').textContent = Math.floor(s / 60) + ':' + pad2(s % 60);
        saveSession();
    }
})();
