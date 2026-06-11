'use strict';
/* RDBK Reader — the co-pilot's navigator. With a roadbook: active note centred,
 * odometer, live CAP, manual/auto validation, penalty engine and a signed result
 * QR. Without one: Tripmaster mode (GPS trip computer). A run in progress is
 * checkpointed to localStorage on every fix/state change and offered for resume
 * on the next visit, so a call, a lock screen or an OS tab kill loses nothing. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc; // shared helpers (app.js / i18n.js)
    const C = RB.CONST;

    let mode = null; // 'nav' | 'trip'
    let rb = null, notes = [], activeIdx = 0, team = '0';
    let lastPos = null, tripTotalM = 0, tripPartialM = 0, speedKmh = 0;
    let lastSpeedPos = null, lastSpeedT = null; // for speed-from-displacement when GPS speed is null
    let curLimit = null, maxSpdSeg = 0;
    let armed = false, extraAccum = 0; // P_extra: overshoot-and-return
    let pen = { acc: 0, cap: 0, skip: 0, extra: 0, speed: 0 };
    let startedAt = null, endedAt = null, auto = false, watchId = null, wakeLock = null;
    let showMap = true, approaching = false; // showMap: per-note mini-map button · approaching: auto ≤30 m (orange)
    const AUTO_REACH_M = 50, WARN_M = 30; // auto-validate radius · approaching warning
    let lastPayload = '', lastQrUrl = '';
    // tripmaster
    let tmCap = null, tmNotes = 0, tmTimerOn = false, tmTimerStart = 0, tmTimerAcc = 0;
    let tmMax = 0, tripRecOn = false, tripRecPts = [], tripRecLastT = 0;
    let tripRecFreq = 3000, tripRecName = '', tripRecHandle = null; // GPX logging: interval, file name, File System Access handle
    // session checkpoint: live counters (small, written constantly) + the roadbook (written once at start)
    const SESSION_KEY = 'rb_session', SESSION_RB_KEY = 'rb_session_roadbook';
    const GPX_KEY = 'rb_trip_gpx'; // crash-safe copy of an in-progress GPX log

    /* ---------- startup ---------- */
    $('pickRb').onclick = () => $('rbFile').click();
    $('rbFile').onchange = async (e) => { const f = e.target.files[0]; if (f) try { loadRb(JSON.parse(await f.text())); } catch (err) { toast('Could not load: ' + err.message); } };
    $('pickChallenge').onclick = () => RBChallenges.pick((r) => loadRb(r));
    $('tripMode').onclick = startTrip;
    // Resume an interrupted run first; otherwise fall back to a challenge passed
    // in the URL, then to recovering an orphaned GPX recording.
    (async function () {
        let session; try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) {}
        let savedRb = null;
        if (session && session.mode === 'nav') {
            try { savedRb = JSON.parse(localStorage.getItem(SESSION_RB_KEY) || 'null'); } catch (e) {}
            if (!savedRb || !savedRb.notes) session = null;
        }
        if (session) {
            const what = session.mode === 'trip' ? 'Tripmaster'
                : esc((savedRb.meta && savedRb.meta.title) || 'Roadbook') + ' · ' + session.activeIdx + '/' + savedRb.notes.length + ' ' + t('notes');
            // Declining does NOT delete the session — a mis-tap must never destroy a
            // run; it is replaced when a new run starts or cleared on explicit exit.
            // Its GPX log (if any) stays with it, so skip the recovery prompt too.
            if (await RBConfirm(t('Resume the run in progress?') + '<br><b>' + what + '</b> · ' + (session.totalM / 1000).toFixed(2) + ' km', t('Resume'))) resumeSession(session, savedRb);
            return;
        }
        let g; try { g = JSON.parse(localStorage.getItem(GPX_KEY) || 'null'); } catch (e) {}
        if (g && g.pts && g.pts.length >= 2) {
            const yes = await RBConfirm(t('Recover unsaved GPX recording?') + ' (' + g.pts.length + ' ' + t('points') + ')', t('Recover'));
            try { localStorage.removeItem(GPX_KEY); } catch (e) {}
            if (yes) finishTripRec(g.pts, g.name || gpxName(), false);
        }
        const pub = RBChallenges.publicFromUrl();
        if (pub) RBChallenges.loadPublic(pub).then((j) => loadRb(j.roadbook)).catch(() => toast('Could not load challenge.'));
    })();
    // File Handling API (installed PWA): open a .rdbk straight from the OS.
    if ('launchQueue' in window && window.LaunchParams) {
        launchQueue.setConsumer(async (params) => {
            if (!params.files || !params.files.length) return;
            try { loadRb(JSON.parse(await (await params.files[0].getFile()).text())); } catch (e) {}
        });
    }

    let competition = false;
    function loadRb(r) {
        if (!r.notes || !r.notes.length) return toast('Roadbook has no notes.');
        rb = r; notes = r.notes;
        $('modeModal').hidden = false;
    }
    $('advAuto').onclick = () => { $('advAuto').classList.add('on'); $('advManual').classList.remove('on'); };
    $('advManual').onclick = () => { $('advManual').classList.add('on'); $('advAuto').classList.remove('on'); };
    let optGpx = false;
    function readModeOpts() { auto = $('advAuto').classList.contains('on'); showMap = $('optMap').checked; optGpx = $('optGpx').checked; }
    $('modeTrip').onclick = () => { readModeOpts(); $('modeModal').hidden = true; startNav(false); if (optGpx) beginGpxRec(); };
    $('modeComp').onclick = () => {
        readModeOpts(); $('modeModal').hidden = true; $('teamModal').hidden = false; $('teamInput').value = '1';
        setTimeout(() => { $('teamInput').focus(); $('teamInput').select(); }, 60);
    };
    $('teamOk').onclick = () => { team = ($('teamInput').value || '1').replace(/\D/g, '').slice(0, 3) || '1'; $('teamModal').hidden = true; startNav(true); if (optGpx) beginGpxRec(); };
    $('teamCancel').onclick = () => { $('teamModal').hidden = true; $('modeModal').hidden = false; };
    $('teamInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('teamOk').click(); });
    function startNav(comp) {
        competition = comp; mode = 'nav'; window.RB_BUSY = true; // don't auto-refresh mid-run
        $('loadScreen').hidden = true; $('navScreen').hidden = false;
        $('finishBtn').hidden = !comp;
        $('autoBtn').innerHTML = '<i class="fa-solid fa-robot"></i> Auto: ' + (auto ? 'ON' : 'off');
        $('autoBtn').classList.toggle('btn-primary', auto);
        $('validateBtn').innerHTML = comp ? '<i class="fa-solid fa-circle-check"></i> Validate' : '<i class="fa-solid fa-circle-check"></i> Note done';
        $('navGpx').hidden = !optGpx;
        try { localStorage.setItem(SESSION_RB_KEY, JSON.stringify(rb)); } catch (e) {} // roadbook stored once; live counters checkpoint separately
        renderNotes(); startGps();
        setInterval(() => { const now = new Date(); $('odoClock').textContent = pad(now.getHours(), 2) + ':' + pad(now.getMinutes(), 2) + ':' + pad(now.getSeconds(), 2); }, 1000);
    }
    function startTrip() {
        mode = 'trip'; window.RB_BUSY = true;
        document.body.classList.add('trip-on'); // hide global header + footer during the trip
        $('loadScreen').hidden = true; $('tripScreen').hidden = false;
        try { localStorage.removeItem(SESSION_RB_KEY); } catch (e) {} // a tripmaster session carries no roadbook
        saveSession();
        startGps();
        setInterval(() => {
            const now = new Date();
            $('tmClock').textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
            const ms = tmTimerAcc + (tmTimerOn ? Date.now() - tmTimerStart : 0), s = Math.floor(ms / 1000);
            $('tmTimer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        }, 500);
    }

    /* ---------- session checkpoint: survive reloads and OS tab kills ---------- */
    function saveSession() {
        if (!mode) return;
        const s = mode === 'trip'
            ? { mode, totalM: tripTotalM, partialM: tripPartialM, tmMax, tmNotes, timerAcc: tmTimerAcc, timerOn: tmTimerOn, timerStart: tmTimerStart, gpxRecording: tripRecOn, gpxFileName: tripRecName }
            : { mode, competition, team, auto, showMap, gpxOption: optGpx, gpxRecording: tripRecOn, gpxFileName: tripRecName, activeIdx, totalM: tripTotalM, partialM: tripPartialM, pen, curLimit, maxSpdSeg, extraAccum, armed, startedAt: startedAt ? startedAt.getTime() : null, endedAt: endedAt ? endedAt.getTime() : null };
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {}
    }
    function clearSession() { try { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_RB_KEY); } catch (e) {} }
    function resumeSession(s, savedRb) {
        let gpxPts = [];
        if (s.gpxRecording) { let g; try { g = JSON.parse(localStorage.getItem(GPX_KEY) || 'null'); } catch (e) {} gpxPts = (g && g.pts) || []; }
        tripTotalM = s.totalM; tripPartialM = s.partialM;
        if (s.mode === 'trip') {
            tmMax = s.tmMax; tmNotes = s.tmNotes;
            tmTimerAcc = s.timerAcc; tmTimerOn = s.timerOn; tmTimerStart = s.timerStart; // wall-clock: a running stopwatch keeps counting while the app is dead
            startTrip();
            $('tmNotes').textContent = tmNotes;
            $('tmTimerBtn').classList.toggle('btn-primary', tmTimerOn);
        } else {
            rb = savedRb; notes = rb.notes;
            team = s.team; auto = s.auto; showMap = s.showMap; optGpx = s.gpxOption;
            activeIdx = s.activeIdx; pen = s.pen; curLimit = s.curLimit; maxSpdSeg = s.maxSpdSeg;
            extraAccum = s.extraAccum; armed = s.armed;
            startedAt = s.startedAt ? new Date(s.startedAt) : null;
            endedAt = s.endedAt ? new Date(s.endedAt) : null;
            startNav(s.competition);
        }
        // continue an interrupted GPX log (a live file handle cannot survive a reload)
        if (s.gpxRecording) { tripRecName = s.gpxFileName || gpxName(); beginGpxRec(); tripRecPts = gpxPts; }
        if (s.mode === 'trip') renderTrip();
    }

    /* ---------- shared GPS ---------- */
    function startGps() {
        if (!navigator.geolocation) return toast('No geolocation');
        watchId = navigator.geolocation.watchPosition(onFix, () => setGps('bad'), { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
        requestWake();
    }
    function onFix(pos) {
        const c = pos.coords, here = { lat: c.latitude, lon: c.longitude };
        setGps(c.accuracy <= 25 ? 'ok' : 'bad', Math.round(c.accuracy));
        let disp = 0;
        if (lastPos) { const d = RB.geo.haversineM(lastPos, here); if (d >= C.MIN_DISP_M) { disp = d; tripTotalM += d; tripPartialM += d; lastPos = here; } }
        else lastPos = here;
        // Speed: prefer the GPS-reported value; otherwise derive it from the
        // displacement between consecutive fixes (so it doesn't stick when stopped).
        const tnow = Date.now();
        if (c.speed != null && isFinite(c.speed) && c.speed >= 0) speedKmh = c.speed * 3.6;
        else if (lastSpeedPos && lastSpeedT) { const dt = (tnow - lastSpeedT) / 1000; if (dt > 0) speedKmh = RB.geo.haversineM(lastSpeedPos, here) / dt * 3.6; }
        lastSpeedPos = here; lastSpeedT = tnow;
        if (c.heading != null && isFinite(c.heading)) { tmCap = c.heading; }
        // GPX logging — works in both Tripmaster and navigation
        if (tripRecOn && (c.accuracy == null || c.accuracy <= 35) && (tnow - tripRecLastT >= tripRecFreq)) {
            tripRecPts.push({ lat: here.lat, lon: here.lon, ele: (c.altitude != null && isFinite(c.altitude)) ? c.altitude : null, t: tnow });
            tripRecLastT = tnow; persistGpx(); // crash-safe: localStorage + live file write
        }
        if (mode === 'trip') { if (speedKmh > tmMax) tmMax = speedKmh; renderTrip(); return; }

        // --- navigation mode ---
        const over = curLimit && curLimit > 0 && speedKmh > curLimit;
        if (over) maxSpdSeg = Math.max(maxSpdSeg, speedKmh);
        const an = notes[activeIdx];
        if (an) {
            const dist = RB.geo.haversineM(here, an);
            // P_extra: armed on entering the 100 m radius; moving away again accumulates the overshoot
            if (dist <= C.MANUAL_RADIUS_M) armed = true;
            else if (armed) extraAccum += disp;
            const wasApproaching = approaching;
            approaching = auto && dist <= WARN_M; // orange warning band
            if (auto && dist <= AUTO_REACH_M) validateAt(activeIdx, here); // auto-mark within 50 m
            else if (approaching !== wasApproaching) renderNotes();
        }
        // top odometer bar
        $('odoTotal').textContent = (tripTotalM / 1000).toFixed(2);
        $('odoPartial').textContent = (tripPartialM / 1000).toFixed(2);
        const heading = an ? Math.round(RB.geo.bearingDeg(here, an)) : (tmCap != null ? Math.round(tmCap) : null);
        $('odoBrg').textContent = heading == null ? '—°' : pad(heading, 3) + '°';
        updateCapBar(here);
        saveSession();
    }
    function setGps(state, acc) { $('gpsDot').className = 'gps-dot ' + (state === 'ok' ? 'ok' : 'bad'); $('gpsTxt').textContent = acc != null ? '±' + acc + ' m' : 'GPS…'; }

    /* ---------- navigation: notes ---------- */
    const iconSrc = (ic) => RB.iconSrc(ic, rb, '../assets/icons/');
    // Paper-style 4-column rows: total/partial+number | vignette | comments | buttons.
    // done = green · active = red border · upcoming = pink · ≤50 m to next = blue · approaching (auto) = orange.
    const fkm = (m) => ((m ?? 0) / 1000).toFixed(2);
    let lastScrollIdx = -1;
    function renderNotes() {
        $('noteList').innerHTML = notes.map((n, i) => {
            const st = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'up';
            const warn = (auto && i === activeIdx && approaching) ? ' warn' : '';
            const close = notes[i + 1] && (notes[i + 1].partial_distance ?? 1e9) < 50 ? ' close' : '';
            const hasVig = (n.icons && n.icons.length) || (n.junctions && n.junctions.length);
            const cap = n.cap != null ? `<div class="note-cap">CAP ${Math.round(n.cap)}°${n.cap_distance != null ? ' · ' + fkm(n.cap_distance) + ' km' : ''}</div>` : '';
            const reach = (!auto && i >= activeIdx) ? `<button class="note-button reach" data-reach="${i}" title="${t('Note reached')}"><i class="fa-solid fa-check"></i></button>` : '';
            const mapb = showMap ? `<button class="note-button" data-map="${i}" title="${t('Open on map')}"><i class="fa-solid fa-map-location-dot"></i></button>` : '';
            return `<div class="nrow ${st}${warn}" data-i="${i}">
                <div class="col-distance${close}"><div class="total">${fkm(n.distance)}</div><div class="partial">+${fkm(n.partial_distance)}</div><div class="num">${n.num}</div></div>
                <div class="col-vignette">${hasVig ? NoteCanvas.toSVG(n, iconSrc) : ''}</div>
                <div class="col-text"><div class="text">${esc(n.text || '')}</div>${cap}<div class="coords">${(+n.lat).toFixed(5)}, ${(+n.lon).toFixed(5)}</div></div>
                <div class="col-buttons">${reach}${mapb}</div>
            </div><div class="nmap" id="nmap${i}" hidden></div>`;
        }).join('');
        $('noteList').querySelectorAll('[data-reach]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); markReached(+b.dataset.reach); });
        $('noteList').querySelectorAll('[data-map]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); toggleNoteMap(+b.dataset.map); });
        $('noteList').querySelectorAll('.nrow').forEach((c) => c.onclick = () => tapNote(+c.dataset.i));
        // only recentre when the active note actually changed (not on every approaching/redraw)
        if (activeIdx !== lastScrollIdx) { lastScrollIdx = activeIdx; const act = $('noteList').querySelector('.nrow.active'); if (act) act.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        updateCapBar();
        saveSession();
    }
    function toggleNoteMap(i) {
        const el = $('nmap' + i); if (!el) return;
        if (!el.hidden) { el.hidden = true; el.innerHTML = ''; return; }
        const n = notes[i], tok = (window.RB_CONFIG || {}).mapboxToken;
        if (!tok) return toast('Map not configured.');
        const ll = (+n.lon).toFixed(5) + ',' + (+n.lat).toFixed(5);
        el.innerHTML = `<img alt="map" loading="lazy" src="https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/pin-s+ff2a2a(${ll})/${ll},15,0/440x220@2x?access_token=${tok}">`;
        el.hidden = false;
    }
    // Bottom CAP bar: heading to hold (prev note's CAP) · speed · live distance to
    // destination · direction arrow. Appears only while a CAP is active.
    function updateCapBar(here) {
        const bar = $('capbar'), an = notes[activeIdx], prev = notes[activeIdx - 1];
        if (!prev || prev.cap == null || !an) { bar.hidden = true; return; }
        bar.hidden = false;
        $('capHeading').textContent = Math.round(prev.cap) + '°';
        $('capSpeed').textContent = speedKmh ? Math.round(speedKmh) + ' km/h' : '--';
        if (here) {
            const dist = RB.geo.haversineM(here, an);
            $('capDist').textContent = dist >= 1000 ? (dist / 1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
            const rel = ((prev.cap - (tmCap != null ? tmCap : 0)) + 360) % 360;
            $('capArrow').style.transform = `rotate(${rel - 45}deg)`;
        }
    }
    // "Note reached" button: advance sequentially and mark green (both modes).
    function markReached(i) {
        if (competition) { tapNote(i); return; } // scored validation
        tripPartialM = 0; approaching = false;
        if (notes[i].distance != null) tripTotalM = notes[i].distance;
        activeIdx = i + 1; renderNotes();
    }
    function tapNote(i) {
        if (!competition) { activeIdx = i; tripPartialM = 0; renderNotes(); return; } // Trip mode: free navigation, no scoring
        if (i < activeIdx) return;
        if (!lastPos) return toast('Waiting for GPS…');
        if (RB.geo.haversineM(lastPos, notes[i]) > C.MANUAL_RADIUS_M) return toast('Too far from note ' + notes[i].num);
        if (i > activeIdx) { pen.skip += C.P_SKIP * (i - activeIdx); extraAccum = 0; armed = false; } // overshoot belonged to the skipped note
        validateAt(i, lastPos);
    }
    function validateAt(i, here) {
        const n = notes[i], now = new Date();
        if (startedAt == null) startedAt = now; // first validated note starts the clock (even if note 0 was skipped)
        endedAt = now;
        if (i > 0) pen.acc += RB.geo.haversineM(here, n);
        const prev = notes[i - 1];
        if (prev && prev.cap != null && prev.cap_distance != null) {
            const tgt = RB.geo.destPoint(prev.lat, prev.lon, prev.cap, prev.cap_distance);
            pen.cap += RB.geo.haversineM(here, tgt);
        }
        pen.extra += extraAccum; extraAccum = 0; armed = false;
        const lim = RB.speedLimitOfNote(n);
        if (lim != null) { if (curLimit && curLimit > 0 && maxSpdSeg > curLimit) pen.speed += C.P_SPEED_PER_KMH * (Math.floor(maxSpdSeg) - curLimit); curLimit = lim === 0 ? null : lim; maxSpdSeg = 0; }
        tripPartialM = 0; approaching = false;
        if (n.distance != null) tripTotalM = n.distance; // keep the total synced with the notes' cumulative distance (absorbs GPS drift / different trajectories)
        activeIdx = i + 1; renderNotes();
        if (activeIdx >= notes.length) toast('Last note validated! Tap Finish.');
    }
    $('validateBtn').onclick = () => {
        if (competition) { if (activeIdx < notes.length) tapNote(activeIdx); }
        else if (activeIdx < notes.length) markReached(activeIdx);
    };
    $('autoBtn').onclick = () => { auto = !auto; $('autoBtn').innerHTML = '<i class="fa-solid fa-robot"></i> Auto: ' + (auto ? 'ON' : 'off'); $('autoBtn').classList.toggle('btn-primary', auto); approaching = false; renderNotes(); };
    $('navLoad').onclick = async () => { if (await RBConfirm(t('Load another roadbook?'), t('Load'))) { clearSession(); location.reload(); } };
    $('navGpx').onclick = () => { if (tripRecOn) stopGpxRec(); else openGpxSettings(); };

    /* ---------- finish → signed META + QR ---------- */
    $('finishBtn').onclick = finish;
    async function finish() {
        // the open segment's speed penalty stays local so Finish is idempotent (re-tap, or resume + re-finish)
        const penSpeed = pen.speed + ((curLimit && curLimit > 0 && maxSpdSeg > curLimit) ? C.P_SPEED_PER_KMH * (Math.floor(maxSpdSeg) - curLimit) : 0);
        const km = Math.round(tripTotalM / 1000 * 10);
        const durH = startedAt && endedAt ? (endedAt - startedAt) / 3600000 : 0;
        const avg = durH > 0 ? Math.round((tripTotalM / 1000 / durH) * 10) : 0;
        const meta = RB.buildMeta({
            team, date: ddmmyy(endedAt || new Date()), start: hhmmss(startedAt), end: hhmmss(endedAt),
            accuracy: Math.min(9999, Math.round(pen.acc)), skip: Math.min(9999, pen.skip), extra: Math.min(9999, Math.round(pen.extra)),
            cap: Math.min(9999, Math.round(pen.cap)), speed: Math.min(9999, penSpeed), km: Math.min(99999, km), avg: Math.min(999, avg),
        });
        lastPayload = await RB.signMeta(meta, (window.RB_CONFIG || {}).signKey);
        const qr = qrcode(0, 'M'); qr.addData(lastPayload); qr.make();
        lastQrUrl = qr.createDataURL(6, 2);
        $('qrImg').innerHTML = `<img src="${lastQrUrl}" alt="QR" class="qr-image">`;
        $('qrMeta').textContent = lastPayload;
        $('qrStats').innerHTML = `Vehicle <b>${team}</b> · ${km / 10} km<br>Accuracy ${Math.round(pen.acc)} · Skips ${pen.skip} · Extra ${Math.round(pen.extra)} · CAP ${Math.round(pen.cap)} · Speed ${penSpeed} pts`;
        $('qrModal').hidden = false;
    }
    $('qrClose').onclick = () => $('qrModal').hidden = true;
    $('qrDownload').onclick = () => RBDownload(lastQrUrl, 'RB_' + team + '_' + ddmmyy(new Date()) + '.png');
    $('qrShare').onclick = async () => {
        try {
            const blob = await (await fetch(lastQrUrl)).blob();
            const file = new File([blob], 'RB_' + team + '.png', { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: 'RDBK.app result', text: lastPayload });
            if (navigator.share) return navigator.share({ title: 'RDBK.app result', text: lastPayload });
            toast('Sharing not supported here — use Save QR.');
        } catch (e) { /* user cancelled */ }
    };

    /* ---------- tripmaster ---------- */
    const SA_COLORS = { green: 'var(--ok)', orange: '#ff9f1c', red: 'var(--track)' };
    let saLimit = 0, saColors = ['green', 'orange', 'red', 'red'];
    try { const s = JSON.parse(localStorage.getItem('rb_speedalert') || 'null'); if (s) { saLimit = s.limit || 0; saColors = s.colors || saColors; } } catch (e) {}
    function speedBandColor(v) {
        if (!saLimit) return '';
        const c = v < saLimit - 5 ? saColors[0] : v < saLimit ? saColors[1] : v < saLimit + 5 ? saColors[2] : saColors[3];
        return SA_COLORS[c] || '';
    }
    function renderTrip() {
        $('tmTotal').textContent = (tripTotalM / 1000).toFixed(2);
        $('tmPartial').textContent = (tripPartialM / 1000).toFixed(2);
        $('tmSpeed').textContent = Math.round(speedKmh);
        $('tmSpeed').style.setProperty('--speed-band', speedBandColor(speedKmh) || 'var(--text)'); // data-driven band colour
        $('tmMax').textContent = Math.round(tmMax);
        $('tmCap').textContent = tmCap == null ? '—' : Math.round(tmCap);
        saveSession();
    }
    $('tmPlus10').onclick = () => { tripPartialM += 10; tripTotalM += 10; renderTrip(); };
    $('tmMinus10').onclick = () => { tripPartialM = Math.max(0, tripPartialM - 10); tripTotalM = Math.max(0, tripTotalM - 10); renderTrip(); };
    $('tmNoteBtn').onclick = () => { tmNotes++; $('tmNotes').textContent = tmNotes; tripPartialM = 0; renderTrip(); };
    $('tmTimerBtn').onclick = () => { tmTimerOn = !tmTimerOn; if (tmTimerOn) tmTimerStart = Date.now(); else tmTimerAcc += Date.now() - tmTimerStart; $('tmTimerBtn').classList.toggle('btn-primary', tmTimerOn); saveSession(); };
    $('tmExit').onclick = async () => { if (await RBConfirm(t('Exit Tripmaster?'), t('Exit'))) { clearSession(); location.reload(); } };

    // hold-to-activate (5 s) for Reset — anti-accidental, works in browser + PWA
    (function holdReset() {
        const btn = $('tmReset'); let timer = null;
        const start = (e) => { e.preventDefault(); btn.classList.add('holding'); timer = setTimeout(() => { btn.classList.remove('holding'); tripPartialM = 0; renderTrip(); toast('Trip reset.'); }, 5000); };
        const cancel = () => { if (timer) clearTimeout(timer); timer = null; btn.classList.remove('holding'); };
        btn.addEventListener('pointerdown', start);
        ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, cancel));
    })();

    // Speed alert settings
    $('tmSpeedAlert').onclick = () => {
        const opt = (sel) => ['green', 'orange', 'red'].map((c) => `<option value="${c}" ${c === sel ? 'selected' : ''}>${t(c)}</option>`).join('');
        const d = RBModal(`<h3>${t('Speed alert')}</h3>
            <label class="muted small">${t('Speed to watch (km/h · 0 = off)')}</label>
            <input id="saIn" class="modal-in" type="number" min="0" max="300" inputmode="numeric" value="${saLimit}">
            <div class="muted small">${t('Colours')}</div>
            <div class="field-grid">
                <span>&lt; L−5</span><select id="sa0" class="modal-in">${opt(saColors[0])}</select>
                <span>L−5 … L</span><select id="sa1" class="modal-in">${opt(saColors[1])}</select>
                <span>L … L+5</span><select id="sa2" class="modal-in">${opt(saColors[2])}</select>
                <span>&gt; L+5</span><select id="sa3" class="modal-in">${opt(saColors[3])}</select>
            </div>
            <div class="btnrow end spaced"><button class="btn btn-ghost" id="saX">${t('Cancel')}</button><button class="btn btn-primary" id="saS">${t('Save')}</button></div>`, 'narrow');
        d.q('#saX').onclick = d.close;
        d.q('#saS').onclick = () => {
            saLimit = Math.max(0, Math.min(300, parseInt(d.q('#saIn').value, 10) || 0));
            saColors = ['sa0', 'sa1', 'sa2', 'sa3'].map((id) => d.q('#' + id).value);
            try { localStorage.setItem('rb_speedalert', JSON.stringify({ limit: saLimit, colors: saColors })); } catch (e) {}
            d.close(); renderTrip();
        };
    };

    /* ---------- GPX logging: frequency + file name/location + crash-safe ---------- */
    const gpxName = () => 'RDBK_trip_' + ddmmyy(new Date()) + '_' + hhmmss(new Date());
    try { const g = JSON.parse(localStorage.getItem('rb_gpx_settings') || 'null'); if (g && g.freq) tripRecFreq = g.freq; } catch (e) {}
    function buildGpx(pts, name) {
        const segmented = pts.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}">${p.ele != null ? '<ele>' + Math.round(p.ele) + '</ele>' : ''}${p.t ? '<time>' + new Date(p.t).toISOString() + '</time>' : ''}</trkpt>`).join('');
        return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="RDBK.app" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(name || 'RDBK trip')}</name><trkseg>${segmented}</trkseg></trk></gpx>`;
    }
    function trackKm(pts) { let m = 0; for (let i = 1; i < pts.length; i++) m += RB.geo.haversineM(pts[i - 1], pts[i]); return m / 1000; }
    async function writeHandle() { if (!tripRecHandle) return; try { const w = await tripRecHandle.createWritable(); await w.write(buildGpx(tripRecPts, tripRecName)); await w.close(); } catch (e) {} }
    function persistGpx() { try { localStorage.setItem(GPX_KEY, JSON.stringify({ pts: tripRecPts, name: tripRecName })); } catch (e) {} writeHandle(); }
    function downloadGpx(pts, name) { RBDownload(new Blob([buildGpx(pts, name)], { type: 'application/gpx+xml' }), (name || gpxName()) + '.gpx'); }

    $('tmRecBtn').onclick = () => { if (tripRecOn) stopGpxRec(); else openGpxSettings(); };
    function openGpxSettings() {
        const fsa = 'showSaveFilePicker' in window;
        const d = RBModal(`<h3>${t('Record GPX')}</h3>
            <label class="muted small">${t('Sample every (seconds)')}</label>
            <input id="gxFreq" class="modal-in" type="number" min="1" max="60" inputmode="numeric" value="${Math.round(tripRecFreq / 1000)}">
            <label class="muted small">${t('File name')}</label>
            <input id="gxName" class="modal-in" type="text" value="${gpxName()}">
            <p class="muted small" id="gxLoc">${fsa ? t('Tip: choose a file to save live to disk (crash-safe).') : t('Auto-saved while recording, recovered if the app closes.')}</p>
            <div class="btnrow between">
                ${fsa ? `<button class="btn btn-ghost" id="gxPick"><i class="fa-solid fa-folder-open"></i> ${t('Choose file…')}</button>` : '<span></span>'}
                <span class="btn-group"><button class="btn btn-ghost" id="gxX">${t('Cancel')}</button><button class="btn btn-primary" id="gxGo"><i class="fa-solid fa-circle-dot"></i> ${t('Start')}</button></span>
            </div>`, 'narrow');
        let picked = null;
        d.q('#gxX').onclick = d.close;
        if (fsa) d.q('#gxPick').onclick = async () => {
            try { picked = await window.showSaveFilePicker({ suggestedName: d.q('#gxName').value + '.gpx', types: [{ description: 'GPX', accept: { 'application/gpx+xml': ['.gpx'] } }] }); d.q('#gxLoc').textContent = '✓ ' + picked.name; d.q('#gxName').value = picked.name.replace(/\.gpx$/i, ''); } catch (e) {}
        };
        d.q('#gxGo').onclick = () => {
            tripRecFreq = Math.max(1, Math.min(60, parseInt(d.q('#gxFreq').value, 10) || 3)) * 1000;
            tripRecName = (d.q('#gxName').value || gpxName()).trim();
            tripRecHandle = picked;
            try { localStorage.setItem('rb_gpx_settings', JSON.stringify({ freq: tripRecFreq })); } catch (e) {}
            d.close(); beginGpxRec();
        };
    }
    function beginGpxRec() {
        tripRecOn = true; tripRecPts = []; tripRecLastT = 0;
        $('tmRecBtn').classList.add('btn-primary');
        $('tmRecBtn').querySelector('span').textContent = t('Recording…');
        $('navGpx').classList.add('btn-primary');
        toast('Recording GPX track.');
        saveSession();
    }
    async function stopGpxRec() {
        tripRecOn = false;
        $('tmRecBtn').classList.remove('btn-primary');
        $('tmRecBtn').querySelector('span').textContent = t('Record GPX');
        $('navGpx').classList.remove('btn-primary');
        await writeHandle(); // final flush to the live file before we report "saved"
        const pts = tripRecPts.slice(), name = tripRecName, saved = !!tripRecHandle;
        tripRecHandle = null;
        try { localStorage.removeItem(GPX_KEY); } catch (e) {}
        saveSession();
        if (pts.length >= 2) finishTripRec(pts, name, saved); else toast('Track too short.');
    }
    function finishTripRec(pts, name, savedToFile) {
        const d = RBModal(`<h3>${t('Recorded track')}</h3>
            <p class="muted small">${pts.length} ${t('points')} · ${trackKm(pts).toFixed(2)} km${savedToFile ? '<br>✓ ' + t('Saved to file') : ''}</p>
            <div class="btnrow center wrap">
                ${savedToFile ? '' : `<button class="btn btn-ghost" id="trDl"><i class="fa-solid fa-download"></i> ${t('Download GPX')}</button>`}
                <button class="btn btn-primary" id="trEd"><i class="fa-solid fa-map-location-dot"></i> ${t('Convert into roadbook')}</button>
            </div>
            <div class="btnrow center"><button class="btn btn-ghost" id="trClose">${t('Close')}</button></div>`, 'slim center');
        const dl = d.q('#trDl'); if (dl) dl.onclick = () => { downloadGpx(pts, name); d.close(); };
        d.q('#trEd').onclick = () => { try { sessionStorage.setItem('rb_trip_track', JSON.stringify(pts)); } catch (e) {} location.href = '../editor/?trip=1'; };
        d.q('#trClose').onclick = d.close;
    }

    /* ---------- utils ---------- */
    const pad = (n, w) => String(n).padStart(w, '0');
    const ddmmyy = (d) => d ? pad(d.getDate(), 2) + pad(d.getMonth() + 1, 2) + pad(d.getFullYear() % 100, 2) : '000000';
    const hhmmss = (d) => d ? pad(d.getHours(), 2) + pad(d.getMinutes(), 2) + pad(d.getSeconds(), 2) : '000000';
    let toastT = null;
    function toast(m) { const el = $('toast'); el.textContent = RBt(m); el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2500); }
    async function requestWake() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && watchId != null) requestWake(); });
})();
