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
    // Default roadbook name proposed when a recording starts: "REC YYYY-MM-DD HH-MM" (#54).
    const recName = () => { const d = new Date(); return 'REC ' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + '-' + pad2(d.getMinutes()); };

    let meter = null, map = null, meUser = null, draftId = 0;
    // Speech-to-text language for voice notes: the signed-in user's account preference
    // (set in /account/), or the device language when unset or signed out.
    const voiceLang = () => (meUser && meUser.voice_lang) || navigator.language || 'en-US';
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
    RBApi('config').then((c) => {
        meUser = c.user || null;
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
    $('recStart').onclick = () => RBGpxRecorder.settings({ defaultName: recName(), nameLabel: t('Roadbook name'), onStart: begin });

    function begin() {
        recordedM = 0; paused = false; lastAcc = null; here = null; lastSampled = null; elapsedAcc = 0;
        course = null; lastHeadingPos = null;
        track = []; wpts = []; photos = []; draftId = 0; showWpText(null);
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
    // #53: surface the latest waypoint's note (especially the dictated audio text) on the running screen.
    function showWpText(note) {
        const el = $('recLastWp');
        if (note && note.text) { el.textContent = t('Waypoint') + ' ' + note.num + ': ' + note.text; el.hidden = false; }
        else el.hidden = true;
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
        function finish() { clearInterval(timer); note.text = inp.value.trim(); showWpText(note); d.close(); }
        inp.addEventListener('input', () => { if (inp.value && !typed) { typed = true; btn.textContent = t('Save note'); } });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(); });
        btn.onclick = finish;
        // dictate the note straight into the field (tap to start, tap to stop)
        if (SR) {
            const mic = d.q('#wfMic'); let rec = null;
            mic.onclick = () => {
                if (rec) { rec.stop(); return; }
                rec = new SR();
                rec.lang = voiceLang();
                rec.interimResults = true;
                rec.onresult = (e) => { let txt = ''; for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript; inp.value = txt; typed = true; btn.textContent = t('Save note'); };
                const done = () => { mic.classList.remove('on'); rec = null; };
                rec.onend = done; rec.onerror = done;
                mic.classList.add('on'); try { rec.start(); } catch (e) { done(); }
            };
        }
    };

    // "WP audio" (#129): press and HOLD to record — drops a waypoint and records its note
    // (speech-to-text + the kept audio when signed in). On release it keeps recording for 5s
    // more, then stops, so the last words aren't clipped. Pointer events + capture so a finger
    // sliding off still releases; the touch callout / selection are suppressed in CSS.
    const SR_REC = window.SpeechRecognition || window.webkitSpeechRecognition;
    const CAN_REC_AUDIO = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    const wptBtn = $('recWptAudio');
    if (SR_REC || CAN_REC_AUDIO) wptBtn.hidden = false;
    let wptRecActive = false, wptSR = null, wptMedia = null, wptTail = null, wptHolding = false, wptCount = 3, wptFinish = null;
    const wptLabel = wptBtn.querySelector('span'); // the "WP audio" caption — also shows the release countdown
    const setWptCount = (n) => { if (wptLabel) wptLabel.textContent = (n == null) ? t('WP audio') : String(n); };

    async function startWptAudio() {
        if (wptRecActive) return; // already recording (or in the release countdown)
        if (!here) return toast(t('Waiting for a GPS fix…'));
        wptRecActive = true; wptHolding = true; wptCount = 3; // hold to record; first release counts down from 3
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
        // empty (and Android STT didn't transcribe either). Signed-in + draft only; the clip lives on
        // the server, like photos.
        if (CAN_REC_AUDIO && meUser && draftId) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (ended) { stream.getTracks().forEach((tk) => tk.stop()); return; } // released during the mic prompt
                const mr = new MediaRecorder(stream), chunks = [];
                wptMedia = mr;
                mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
                mr.onstop = async () => {
                    stream.getTracks().forEach((tk) => tk.stop());
                    if (!chunks.length) { toast(t('No audio captured.')); return; } // nothing recorded
                    const r = await RBUploadAudio({ type: 'audio', roadbook: String(draftId), lat: wptLat, lon: wptLon }, new Blob(chunks, { type: mr.mimeType }));
                    toast(r.ok ? t('Voice note saved.') : (r.error || t('Audio upload failed.')));
                };
                mr.start(1000); // periodic data chunks → robust even if stop() timing is odd on mobile
            } catch (e) { wptMedia = null; toast(t('Microphone unavailable.')); } // surface the failure, don't fail silently
        } else if (meUser && !draftId) {
            toast(t('Preparing… try the voice note again in a second.')); // the draft roadbook isn't ready yet
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

    // Release → keep recording while a countdown ticks ON the button (3s first, 2s after a re-press),
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
                if (name) sessionStorage.setItem('rb_trip_name', name); // carry the chosen roadbook name (#54)
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
