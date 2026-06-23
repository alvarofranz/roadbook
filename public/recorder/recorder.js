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

    let meter = null, map = null, meUser = null, draftId = 0;
    let recordedM = 0, paused = false, lastAcc = null, here = null, lastSampled = null;
    let track = [], wpts = [], photos = [];
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
    RBApi('config').then((c) => { meUser = c.user || null; }).catch(() => {});
    (async function () {
        let session; try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) {}
        if (session && session.recording) {
            // Declining must never destroy a run: it's replaced as it records, or cleared on Finish.
            if (await RBConfirm(t('Resume the recording in progress?') + '<br><b>' + ((session.recordedM || 0) / 1000).toFixed(2) + ' km</b>', t('Resume'))) {
                RBGpxRecorder.resume(session.fileName);
                recordedM = session.recordedM || 0; elapsedAcc = session.elapsedAcc || 0; paused = !!session.paused;
                track = []; wpts = session.wpts || []; photos = session.photos || []; draftId = session.draftId || 0;
                $('recPhoto').hidden = !draftId;
                startMeter(); renderPauseBtn(); refreshMap(); renderBar();
                return;
            }
            clearSession();
        }
        await RBGpxRecorder.offerRecovery();
    })();

    /* ---------- start / pause / finish ---------- */
    $('recStart').onclick = () => RBGpxRecorder.settings({ onStart: begin });

    function begin() {
        recordedM = 0; paused = false; lastAcc = null; here = null; lastSampled = null; elapsedAcc = 0;
        course = null; lastHeadingPos = null;
        track = []; wpts = []; photos = []; draftId = 0;
        RBGpxRecorder.begin(); // checkpoints the track + flips on the header bar / running view via onChange
        startMeter(); renderPauseBtn(); refreshMap(); renderBar();
        // a draft roadbook holds the geotagged photos (signed-in only); the camera appears once it exists
        if (meUser) RBApi('rb_draft').then((r) => { if (r.ok) { draftId = r.id; $('recPhoto').hidden = false; } }).catch(() => {});
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
        if (c.accuracy != null && c.accuracy > 35) { renderBar(); return; } // drop junk fixes
        here = { lat: fix.here.lat, lon: fix.here.lon, ele: (c.altitude != null && isFinite(c.altitude)) ? c.altitude : null };
        if (paused) { renderBar(); return; }
        recordedM += fix.disp;
        // dense detail with a good fix, no jitter with a weak one
        const step = Math.max(2.5, (c.accuracy || 10) * 0.35);
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
        if (paused) { elapsedAcc = elapsed(); segStart = 0; lastSampled = null; } else { segStart = Date.now(); }
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
        const note = { lat, lon, name: 'wpt' + (wpts.length + 1), num: wpts.length + 1, text: text || '' };
        wpts.push(note); refreshMap(); saveSession(); renderBar();
        return note;
    }
    // Waypoint: drops instantly, then a no-pressure quick-text modal that auto-dismisses
    // after 5 s ("Edit later (5)…") — unless you start typing, then it waits for you.
    $('recWpt').onclick = () => {
        if (!here) return toast(t('Waiting for a GPS fix…'));
        const note = dropWaypoint(here.lat, here.lon, '');
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition; // speech-to-text where supported
        const micBtn = SR ? `<button class="btn btn-ghost" type="button" id="wfMic" aria-label="${t('Dictate')}" title="${t('Dictate')}"><i class="fa-solid fa-microphone"></i></button>` : '';
        const d = RBModal(`<h3>${t('Waypoint')} ${note.num}</h3>
            <div class="wf-row"><input id="wfText" class="field" placeholder="${t('Quick note (optional)…')}" autocomplete="off">${micBtn}</div>
            <div class="btnrow end"><button class="btn btn-primary" id="wfBtn">${t('Edit later')} (5)</button></div>`, 'narrow', () => finish());
        const inp = d.q('#wfText'), btn = d.q('#wfBtn');
        setTimeout(() => inp.focus(), 50);
        let n = 5, typed = false;
        const timer = setInterval(() => { if (typed) return; if (--n <= 0) finish(); else btn.textContent = `${t('Edit later')} (${n})`; }, 1000);
        function finish() { clearInterval(timer); note.text = inp.value.trim(); d.close(); }
        inp.addEventListener('input', () => { if (inp.value && !typed) { typed = true; btn.textContent = t('Save note'); } });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(); });
        btn.onclick = finish;
        // dictate the note straight into the field (tap to start, tap to stop)
        if (SR) {
            const mic = d.q('#wfMic'); let rec = null;
            mic.onclick = () => {
                if (rec) { rec.stop(); return; }
                rec = new SR();
                const ui = document.documentElement.lang;
                rec.lang = ui === 'it' ? 'it-IT' : ui === 'es' ? 'es-ES' : ui === 'en' ? 'en-US' : (navigator.language || 'en-US');
                rec.interimResults = true;
                rec.onresult = (e) => { let txt = ''; for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript; inp.value = txt; typed = true; btn.textContent = t('Save note'); };
                const done = () => { mic.classList.remove('on'); rec = null; };
                rec.onend = done; rec.onerror = done;
                mic.classList.add('on'); try { rec.start(); } catch (e) { done(); }
            };
        }
    };

    // "WP audio": one tap drops a waypoint AND dictates its note straight away (no modal).
    // Tap again to stop; only shown where speech-to-text is supported.
    const SR_REC = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR_REC) $('recWptAudio').hidden = false;
    let audioRec = null, audioNote = null;
    $('recWptAudio').onclick = () => {
        if (!SR_REC) return;
        if (audioRec) { audioRec.stop(); return; } // tap again → stop listening
        if (!here) return toast(t('Waiting for a GPS fix…'));
        audioNote = dropWaypoint(here.lat, here.lon, '');
        const ui = document.documentElement.lang;
        audioRec = new SR_REC();
        audioRec.lang = ui === 'it' ? 'it-IT' : ui === 'es' ? 'es-ES' : ui === 'en' ? 'en-US' : (navigator.language || 'en-US');
        audioRec.interimResults = true;
        audioRec.onresult = (e) => { let txt = ''; for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript; if (audioNote) { audioNote.text = txt; saveSession(); } };
        const done = () => { $('recWptAudio').classList.remove('on'); audioRec = null; audioNote = null; refreshMap(); };
        audioRec.onend = done; audioRec.onerror = done;
        $('recWptAudio').classList.add('on'); toast(t('Listening… tap again to stop'));
        try { audioRec.start(); } catch (e) { done(); }
    };

    /* ---------- photos (signed-in: camera → upload → geotagged pin) ---------- */
    $('recPhoto').onclick = () => {
        if (!meUser) return RBNeedAuth(t('Sign in to attach photos.'));
        if (!draftId) return toast(t('Waiting for a GPS fix…'));
        $('recPhotoFile').click();
    };
    $('recPhotoFile').onchange = async (e) => {
        const f = e.target.files[0]; e.target.value = ''; if (!f || !draftId) return;
        const fields = { type: 'photo', roadbook: String(draftId) };
        if (here) { fields.lat = here.lat; fields.lon = here.lon; }
        toast(t('Uploading photo…'));
        const r = await RBUpload(fields, f);
        if (!r.ok) return toast(r.error || 'Photo failed.');
        photos.push({ id: r.id, url: r.url, lat: r.lat, lon: r.lon }); refreshMap(); saveSession(); renderBar();
        const lat = r.lat != null ? r.lat : (here && here.lat), lon = r.lon != null ? r.lon : (here && here.lon);
        const d = RBModal(`<img src="${r.url}" alt="" class="photo-preview">
            <div class="btnrow center">
                <button class="btn btn-ghost" id="ptOk">OK</button>
                <button class="btn btn-primary" id="ptWpt"><i class="fa-solid fa-location-dot"></i> ${t('Convert into waypoint')}</button>
            </div>`, 'slim center');
        d.q('#ptOk').onclick = d.close;
        d.q('#ptWpt').onclick = () => { if (lat != null) { dropWaypoint(lat, lon, ''); toast(t('Waypoint')); } d.close(); };
    };

    /* ---------- finish: download the GPX, or convert into a roadbook in the Editor ---------- */
    function finishModal(pts, name) {
        const km = (recordedM / 1000).toFixed(2);
        const d = RBModal(`<h3>${t('Recorded track')}</h3>
            <p class="muted small">${pts.length} ${t('points')} · ${km} km · ${wpts.length} wpt · ${photos.length} 📷</p>
            <div class="btnrow center wrap">
                <button class="btn btn-ghost" id="rfDl"><i class="fa-solid fa-download"></i> ${t('Download GPX')}</button>
                <button class="btn btn-primary" id="rfEd"><i class="fa-solid fa-map-location-dot"></i> ${t('Convert into roadbook')}</button>
            </div>
            <div class="btnrow center"><button class="btn btn-ghost" id="rfClose">${t('Close')}</button></div>`, 'slim center');
        d.q('#rfDl').onclick = () => {
            const nm = name || ('RDBK_' + pad2(new Date().getHours()));
            const gpxWpts = wpts.map((w) => ({ lat: w.lat, lon: w.lon, name: w.text || w.name }));
            RBDownload(new Blob([RB.gpxDocument(nm, pts, gpxWpts)], { type: 'application/gpx+xml' }), nm + '.gpx');
            d.close();
        };
        d.q('#rfEd').onclick = () => {
            try {
                sessionStorage.setItem('rb_trip_track', JSON.stringify(pts));
                sessionStorage.setItem('rb_trip_wpts', JSON.stringify(wpts));
                if (draftId) sessionStorage.setItem('rb_trip_draft', String(draftId));
            } catch (e) {}
            location.href = '../editor/?trip=1';
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
