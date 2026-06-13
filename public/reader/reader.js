'use strict';
/* RDBK Reader — the co-pilot's navigator: active note centred, odometer, live
 * CAP, manual/auto validation, penalty engine and a signed result QR. A run in
 * progress is checkpointed to localStorage on every fix/state change and offered
 * for resume on the next visit, so a call, a lock screen or an OS tab kill loses
 * nothing. GPS plumbing lives in RBGpsMeter; GPX logging in RBGpxRecorder. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast; // shared helpers (app.js / i18n.js)
    const C = RB.CONST;

    let rb = null, notes = [], activeIdx = 0, team = '0';
    let reached = new Set(); // indices actually validated — a passed-over note that is not in here was skipped
    let tripTotalM = 0, tripPartialM = 0;
    let curLimit = null, maxSpdSeg = 0;
    let armed = false, extraAccum = 0; // P_extra: overshoot-and-return
    let pen = { acc: 0, cap: 0, skip: 0, extra: 0, speed: 0 };
    let startedAt = null, endedAt = null, auto = false, meter = null;
    let showMap = true, approaching = false; // showMap: per-note map button · approaching: auto ≤30 m (orange)
    let inlineMap = null, inlineMapIdx = -1; // the one interactive per-note map currently open (RBMap)
    const AUTO_REACH_M = 50, WARN_M = 30; // auto-validate radius · approaching warning
    let lastPayload = '', lastQrUrl = '';
    // session checkpoint: live counters (small, written constantly) + the roadbook (written once at start)
    const SESSION_KEY = 'rb_session', SESSION_RB_KEY = 'rb_session_roadbook';

    /* ---------- startup ---------- */
    $('pickRb').onclick = () => $('rbFile').click();
    $('rbFile').onchange = async (e) => { const f = e.target.files[0]; if (f) try { loadRb(JSON.parse(await f.text())); } catch (err) { toast('Could not load: ' + err.message); } };
    $('pickChallenge').onclick = () => RBChallenges.pick((r) => loadRb(r));
    RBGpxRecorder.init({ toast, onChange: (recording) => { // recording = an unmistakable red STOP button
        const b = $('navGpx');
        b.classList.toggle('btn-danger', recording);
        b.innerHTML = recording ? '<i class="fa-solid fa-stop"></i>' : '<i class="fa-solid fa-circle-dot"></i>';
        saveSession();
    } });
    // Resume an interrupted run first; otherwise fall back to a challenge passed
    // in the URL, then to rescuing an orphaned GPX recording.
    (async function () {
        let session; try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) {}
        let savedRb = null;
        if (session && session.pen) {
            try { savedRb = JSON.parse(localStorage.getItem(SESSION_RB_KEY) || 'null'); } catch (e) {}
            if (!savedRb || !savedRb.notes) session = null;
        } else session = null;
        if (!session) clearSession(); // an unrecoverable checkpoint is just litter
        if (session) {
            const what = esc((savedRb.meta && savedRb.meta.title) || 'Roadbook') + ' · ' + session.activeIdx + '/' + savedRb.notes.length + ' ' + t('notes');
            // Declining does NOT delete the session — a mis-tap must never destroy a
            // run; it is replaced when a new run starts or cleared on explicit exit.
            // Its GPX log (if any) stays with it, so skip the recovery prompt too.
            if (await RBConfirm(t('Resume the run in progress?') + '<br><b>' + what + '</b> · ' + (session.totalM / 1000).toFixed(2) + ' km', t('Resume'))) resumeSession(session, savedRb);
            return;
        }
        await RBGpxRecorder.offerRecovery();
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
        // "Map access from player" is a roadbook-level setting (default allowed when absent)
        $('optMap').checked = mapAllowed();
        $('optMapRow').hidden = !mapAllowed();
        $('modeModal').hidden = false;
    }
    const mapAllowed = () => !(rb && rb.meta && rb.meta.map_access === false);
    $('advAuto').onclick = () => { $('advAuto').classList.add('on'); $('advManual').classList.remove('on'); };
    $('advManual').onclick = () => { $('advManual').classList.add('on'); $('advAuto').classList.remove('on'); };
    let optGpx = false;
    function readModeOpts() { auto = $('advAuto').classList.contains('on'); showMap = $('optMap').checked && mapAllowed(); optGpx = $('optGpx').checked; }
    $('modeTrip').onclick = () => { readModeOpts(); $('modeModal').hidden = true; startNav(false); if (optGpx) RBGpxRecorder.begin(); };
    $('modeComp').onclick = () => {
        readModeOpts(); $('modeModal').hidden = true; $('teamModal').hidden = false; $('teamInput').value = '1';
        setTimeout(() => { $('teamInput').focus(); $('teamInput').select(); }, 60);
    };
    $('teamOk').onclick = () => { team = ($('teamInput').value || '1').replace(/\D/g, '').slice(0, 3) || '1'; $('teamModal').hidden = true; startNav(true); if (optGpx) RBGpxRecorder.begin(); };
    $('teamCancel').onclick = () => { $('teamModal').hidden = true; $('modeModal').hidden = false; };
    $('teamInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('teamOk').click(); });
    function startNav(comp) {
        competition = comp; window.RB_BUSY = true; // don't auto-refresh mid-run
        $('loadScreen').hidden = true; $('navScreen').hidden = false;
        $('finishBtn').hidden = !comp;
        $('autoBtn').innerHTML = '<i class="fa-solid fa-robot"></i> Auto: ' + (auto ? 'ON' : 'off');
        $('autoBtn').classList.toggle('btn-primary', auto);
        $('validateBtn').innerHTML = comp ? '<i class="fa-solid fa-circle-check"></i> Validate' : '<i class="fa-solid fa-circle-check"></i> Note done';
        $('navGpx').hidden = !optGpx;
        try { localStorage.setItem(SESSION_RB_KEY, JSON.stringify(rb)); } catch (e) {} // roadbook stored once; live counters checkpoint separately
        renderNotes();
        meter = new RBGpsMeter(onFix, () => setGps('bad'));
        setInterval(() => { const now = new Date(); $('odoClock').textContent = pad(now.getHours(), 2) + ':' + pad(now.getMinutes(), 2) + ':' + pad(now.getSeconds(), 2); }, 1000);
    }

    /* ---------- session checkpoint: survive reloads and OS tab kills ---------- */
    function saveSession() {
        if (!meter) return; // nothing to checkpoint until a run starts
        const s = { competition, team, auto, showMap, gpxOption: optGpx, gpxRecording: RBGpxRecorder.recording, gpxFileName: RBGpxRecorder.fileName, activeIdx, reached: [...reached], totalM: tripTotalM, partialM: tripPartialM, pen, curLimit, maxSpdSeg, extraAccum, armed, startedAt: startedAt ? startedAt.getTime() : null, endedAt: endedAt ? endedAt.getTime() : null };
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {}
    }
    function clearSession() { try { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_RB_KEY); } catch (e) {} }
    function resumeSession(s, savedRb) {
        tripTotalM = s.totalM; tripPartialM = s.partialM;
        rb = savedRb; notes = rb.notes;
        team = s.team; auto = s.auto; showMap = s.showMap && mapAllowed(); optGpx = s.gpxOption;
        activeIdx = s.activeIdx; reached = new Set(s.reached); pen = s.pen; curLimit = s.curLimit; maxSpdSeg = s.maxSpdSeg;
        extraAccum = s.extraAccum; armed = s.armed;
        startedAt = s.startedAt ? new Date(s.startedAt) : null;
        endedAt = s.endedAt ? new Date(s.endedAt) : null;
        startNav(s.competition);
        if (s.gpxRecording) RBGpxRecorder.resume(s.gpxFileName);
    }

    /* ---------- GPS (RBGpsMeter drives one onFix per position) ---------- */
    function onFix(fix) {
        const { here, coords, disp, speedKmh } = fix;
        setGps(coords.accuracy <= 25 ? 'ok' : 'bad', Math.round(coords.accuracy));
        tripTotalM += disp; tripPartialM += disp;
        RBGpxRecorder.feed(coords, here, fix.tnow);
        if (curLimit && curLimit > 0 && speedKmh > curLimit) maxSpdSeg = Math.max(maxSpdSeg, speedKmh);
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
        const heading = an ? Math.round(RB.geo.bearingDeg(here, an)) : (meter.heading != null ? Math.round(meter.heading) : null);
        $('odoBrg').textContent = heading == null ? '—°' : pad(heading, 3) + '°';
        updateCapBar(here);
        saveSession();
    }
    function setGps(state, acc) { $('gpsDot').className = 'gps-dot ' + (state === 'ok' ? 'ok' : 'bad'); $('gpsTxt').textContent = acc != null ? '±' + acc + ' m' : 'GPS…'; }

    /* ---------- navigation: notes ---------- */
    const iconSrc = (ic) => RB.iconSrc(ic, rb, '../assets/icons/');
    // Paper-style 4-column rows: total/partial+number | vignette | comments | buttons.
    // reached = green · skipped (passed over, never reached) = pink · active = red border ·
    // upcoming = white · ≤50 m to next = blue · approaching (auto) = orange.
    const fkm = (m) => ((m ?? 0) / 1000).toFixed(2);
    let lastScrollIdx = -1;
    function renderNotes() {
        closeInlineMap(); // the list HTML is rebuilt wholesale — tear the GL map down cleanly first
        $('noteList').innerHTML = notes.map((n, i) => {
            const cls = ['nrow'];
            if (reached.has(i)) cls.push('done'); else if (i < activeIdx) cls.push('skipped');
            if (i === activeIdx) { cls.push('active'); if (auto && approaching) cls.push('warn'); }
            const close = notes[i + 1] && (notes[i + 1].partial_distance ?? 1e9) < 50 ? ' close' : '';
            const cap = n.cap != null ? `<div class="note-cap">CAP ${Math.round(n.cap)}°${n.cap_distance != null ? ' · ' + fkm(n.cap_distance) + ' km' : ''}</div>` : '';
            const reach = (!auto && i === activeIdx) ? `<button class="note-button reach" data-reach="${i}" title="${t('Note reached')}"><i class="fa-solid fa-check"></i></button>` : '';
            const mapb = showMap ? `<button class="note-button" data-map="${i}" title="${t('Open on map')}"><i class="fa-solid fa-map-location-dot"></i></button>` : '';
            return `<div class="${cls.join(' ')}" data-i="${i}">
                <div class="col-distance${close}"><div class="total">${fkm(n.distance)}</div><div class="partial">+${fkm(n.partial_distance)}</div><div class="num">${n.num}</div></div>
                <div class="col-vignette">${NoteCanvas.toSVG(n, iconSrc)}</div>
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
    // One interactive map at a time: zoom buttons + satellite/topo toggle (RBMap),
    // centred on the note at zoom ~13, with the whole route + pins for context.
    function toggleNoteMap(i) {
        if (inlineMapIdx === i) { closeInlineMap(); return; } // tapping the open one closes it
        closeInlineMap();
        if (!window.mapboxgl || !(window.RB_CONFIG || {}).mapboxToken) return toast('Map not configured.');
        const el = $('nmap' + i); if (!el) return;
        const n = notes[i];
        el.innerHTML = '<div id="nmapMap" class="rb-inline-map"></div>';
        el.hidden = false; inlineMapIdx = i;
        inlineMap = new RBMap('nmapMap', { zoom: 13, center: [+n.lon, +n.lat], layerToggle: true });
        inlineMap.showRoadbook(rb, true); // no auto-fit: keep our centre on this note
        inlineMap.select(n, true);        // highlight the note
    }
    function closeInlineMap() {
        if (inlineMap) { inlineMap.destroy(); inlineMap = null; }
        if (inlineMapIdx >= 0) { const el = $('nmap' + inlineMapIdx); if (el) { el.hidden = true; el.innerHTML = ''; } inlineMapIdx = -1; }
    }
    // Bottom CAP bar: heading to hold (prev note's CAP) · speed · live distance to
    // destination · direction arrow. Appears only while a CAP is active.
    function updateCapBar(here) {
        const bar = $('capbar'), an = notes[activeIdx], prev = notes[activeIdx - 1];
        if (!prev || prev.cap == null || !an) { bar.hidden = true; return; }
        bar.hidden = false;
        $('capHeading').textContent = Math.round(prev.cap) + '°';
        $('capSpeed').textContent = meter && meter.speedKmh ? Math.round(meter.speedKmh) + ' km/h' : '--';
        if (here) {
            const dist = RB.geo.haversineM(here, an);
            $('capDist').textContent = dist >= 1000 ? (dist / 1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
            const rel = ((prev.cap - (meter.heading != null ? meter.heading : 0)) + 360) % 360;
            $('capArrow').style.setProperty('--cap-rotation', (rel - 45) + 'deg'); // data-driven arrow direction
        }
    }
    // "Note reached" button: advance sequentially and mark green (both modes).
    function markReached(i) {
        if (competition) { tapNote(i); return; } // scored validation
        reached.add(i); tripPartialM = 0; approaching = false;
        if (notes[i].distance != null) tripTotalM = notes[i].distance;
        activeIdx = i + 1; renderNotes();
    }
    function tapNote(i) {
        if (!competition) { activeIdx = i; tripPartialM = 0; renderNotes(); return; } // Trip mode: free navigation, no scoring
        if (i < activeIdx) return;
        if (!meter || !meter.lastPos) return toast('Waiting for GPS…');
        if (RB.geo.haversineM(meter.lastPos, notes[i]) > C.MANUAL_RADIUS_M) return toast('Too far from note ' + notes[i].num);
        if (i > activeIdx) { pen.skip += C.P_SKIP * (i - activeIdx); extraAccum = 0; armed = false; } // overshoot belonged to the skipped note
        validateAt(i, meter.lastPos);
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
        reached.add(i); tripPartialM = 0; approaching = false;
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
    $('navGpx').onclick = () => { if (RBGpxRecorder.recording) RBGpxRecorder.stop(); else RBGpxRecorder.settings(); };

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

    /* ---------- utils ---------- */
    const pad = (n, w) => String(n).padStart(w, '0');
    const ddmmyy = (d) => d ? pad(d.getDate(), 2) + pad(d.getMonth() + 1, 2) + pad(d.getFullYear() % 100, 2) : '000000';
    const hhmmss = (d) => d ? pad(d.getHours(), 2) + pad(d.getMinutes(), 2) + pad(d.getSeconds(), 2) : '000000';
})();
