'use strict';
/* RB Reader — navegador del copiloto. Con roadbook: nota activa centrada,
 * odómetro, CAP en vivo, validación manual/auto, motor de penalizaciones y QR
 * firmado. Sin roadbook: modo Tripmaster (cuentakilómetros GPS). */
(function () {
    const $ = (id) => document.getElementById(id);
    const C = RB.CONST;

    let mode = null; // 'nav' | 'trip'
    let rb = null, notes = [], activeIdx = 0, team = '0';
    let lastPos = null, tripTotalM = 0, tripPartialM = 0, speedKmh = 0;
    let lastSpeedPos = null, lastSpeedT = null; // for speed-from-displacement when GPS speed is null
    let curLimit = null, maxSpdSeg = 0;
    let armed = false, extraAccum = 0; // P_extra: overshoot-and-return
    let pen = { acc: 0, cap: 0, skip: 0, extra: 0, speed: 0 };
    let startedAt = null, endedAt = null, auto = false, watchId = null, wakeLock = null;
    let lastPayload = '', lastQrUrl = '';
    // tripmaster
    let tmTotal = 0, tmPartial = 0, tmCap = null, tmNotes = 0, tmTimerOn = false, tmTimerStart = 0, tmTimerAcc = 0;

    /* ---------- arranque ---------- */
    $('pickRb').onclick = () => $('rbFile').click();
    $('rbFile').onchange = async (e) => { const f = e.target.files[0]; if (f) try { loadRb(JSON.parse(await f.text())); } catch (err) { toast('Could not load: ' + err.message); } };
    $('pickCh').onclick = () => window.RBChallenges && RBChallenges.pick((r) => loadRb(r));
    $('tripMode').onclick = startTrip;
    (function () {
        const pub = window.RBChallenges && RBChallenges.publicFromUrl();
        if (pub) { RBChallenges.loadPublic(pub).then((j) => loadRb(j.roadbook)).catch(() => {}); return; }
        const slug = window.RBChallenges && RBChallenges.fromUrl(); if (slug) RBChallenges.load(slug).then(loadRb).catch(() => {});
    })();
    // File Handling API (PWA): abrir un .rdbk desde el sistema operativo.
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
    $('modeViaje').onclick = () => { $('modeModal').hidden = true; startNav(false); };
    $('modeComp').onclick = () => {
        $('modeModal').hidden = true; $('teamModal').hidden = false; $('teamInput').value = '1';
        setTimeout(() => { $('teamInput').focus(); $('teamInput').select(); }, 60);
    };
    $('teamOk').onclick = () => { team = ($('teamInput').value || '1').replace(/\D/g, '').slice(0, 3) || '1'; $('teamModal').hidden = true; startNav(true); };
    $('teamCancel').onclick = () => { $('teamModal').hidden = true; $('modeModal').hidden = false; };
    $('teamInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('teamOk').click(); });
    function startNav(comp) {
        competition = comp; mode = 'nav'; window.RB_BUSY = true; // don't auto-refresh mid-run
        $('loadScreen').hidden = true; $('navScreen').hidden = false;
        $('autoBtn').hidden = !comp; $('finishBtn').hidden = !comp;
        $('validateBtn').innerHTML = comp ? '<i class="fa-solid fa-circle-check"></i> Validate' : '<i class="fa-solid fa-circle-check"></i> Note done';
        renderNotes(); startGps();
        setInterval(() => { const now = new Date(); $('odoClock').textContent = pad(now.getHours(), 2) + ':' + pad(now.getMinutes(), 2) + ':' + pad(now.getSeconds(), 2); }, 1000);
    }
    function startTrip() {
        mode = 'trip'; window.RB_BUSY = true;
        $('loadScreen').hidden = true; $('tripScreen').hidden = false;
        startGps();
        setInterval(() => {
            const now = new Date();
            $('tmClock').textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
            const ms = tmTimerAcc + (tmTimerOn ? Date.now() - tmTimerStart : 0), s = Math.floor(ms / 1000);
            $('tmTimer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        }, 500);
    }

    /* ---------- GPS común ---------- */
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
        if (mode === 'trip') { renderTrip(); return; }

        // --- modo navegación ---
        tmTotal = tripTotalM; tmPartial = tripPartialM;
        const over = curLimit && curLimit > 0 && speedKmh > curLimit;
        if (over) maxSpdSeg = Math.max(maxSpdSeg, speedKmh);
        const an = notes[activeIdx];
        if (an) {
            const dist = RB.geo.haversineM(here, an);
            // P_extra: armado al entrar en 100 m; si te alejas, acumula el sobrepaso
            if (dist <= C.MANUAL_RADIUS_M) armed = true;
            else if (armed) extraAccum += disp;
            if (competition && auto && dist <= C.AUTO_RADIUS_M) validateAt(activeIdx, here);
        }
        // top odometer bar
        $('odoTotal').textContent = (tripTotalM / 1000).toFixed(2);
        $('odoPartial').textContent = (tripPartialM / 1000).toFixed(2);
        const brg = an ? Math.round(RB.geo.bearingDeg(here, an)) : (tmCap != null ? Math.round(tmCap) : null);
        $('odoBrg').textContent = brg == null ? '—°' : pad(brg, 3) + '°';
        updateCapBar(here);
    }
    function setGps(state, acc) { $('gpsDot').className = 'gps-dot ' + (state === 'ok' ? 'ok' : 'bad'); $('gpsTxt').textContent = acc != null ? '±' + acc + ' m' : 'GPS…'; }

    /* ---------- navegación: notas ---------- */
    const iconSrc = (ic) => RB.iconSrc(ic, rb, '../assets/icons/');
    // Canonical roadbook layout (shared with the challenge page via NoteCanvas.rowCols):
    // green = validated · yellow = active (centred) · white = upcoming.
    function renderNotes() {
        $('noteList').innerHTML = notes.map((n, i) => {
            const cls = 'noterow' + (i === activeIdx ? ' active' : '') + (i < activeIdx ? ' done' : '');
            return `<div class="${cls}" data-i="${i}">${NoteCanvas.rowCols(n, iconSrc, true)}</div>`;
        }).join('');
        $('noteList').querySelectorAll('.noterow').forEach((c) => c.onclick = () => tapNote(+c.dataset.i));
        const act = $('noteList').querySelector('.noterow.active');
        if (act) act.scrollIntoView({ block: 'center', behavior: 'smooth' });
        updateCapBar();
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
    function tapNote(i) {
        if (!competition) { activeIdx = i; tripPartialM = 0; renderNotes(); return; } // Viaje: navegación libre, sin puntuar
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
        tripPartialM = 0; activeIdx = i + 1; renderNotes();
        if (activeIdx >= notes.length) toast('Last note validated! Tap Finish.');
    }
    $('validateBtn').onclick = () => {
        if (competition) { if (activeIdx < notes.length) tapNote(activeIdx); }
        else if (activeIdx < notes.length - 1) { activeIdx++; tripPartialM = 0; renderNotes(); }
    };
    $('autoBtn').onclick = () => { auto = !auto; $('autoBtn').innerHTML = '<i class="fa-solid fa-robot"></i> Auto: ' + (auto ? 'ON' : 'off'); $('autoBtn').classList.toggle('btn-primary', auto); };

    /* ---------- fin → META firmado + QR ---------- */
    $('finishBtn').onclick = finish;
    async function finish() {
        if (curLimit && curLimit > 0 && maxSpdSeg > curLimit) pen.speed += C.P_SPEED_PER_KMH * (Math.floor(maxSpdSeg) - curLimit);
        const km = Math.round(tripTotalM / 1000 * 10);
        const durH = startedAt && endedAt ? (endedAt - startedAt) / 3600000 : 0;
        const avg = durH > 0 ? Math.round((tripTotalM / 1000 / durH) * 10) : 0;
        const meta = RB.buildMeta({
            team, date: ddmmyy(endedAt || new Date()), start: hhmmss(startedAt), end: hhmmss(endedAt),
            accuracy: Math.min(9999, Math.round(pen.acc)), skip: Math.min(9999, pen.skip), extra: Math.min(9999, Math.round(pen.extra)),
            cap: Math.min(9999, Math.round(pen.cap)), speed: Math.min(9999, pen.speed), km: Math.min(99999, km), avg: Math.min(999, avg),
        });
        lastPayload = await RB.signMeta(meta, (window.RB_CONFIG || {}).signKey);
        const qr = qrcode(0, 'M'); qr.addData(lastPayload); qr.make();
        lastQrUrl = qr.createDataURL(6, 2);
        $('qrImg').innerHTML = `<img src="${lastQrUrl}" alt="QR" style="width:260px;height:260px;image-rendering:pixelated;border-radius:8px">`;
        $('qrMeta').textContent = lastPayload;
        $('qrStats').innerHTML = `Vehicle <b>${team}</b> · ${km / 10} km<br>Accuracy ${Math.round(pen.acc)} · Skips ${pen.skip} · Extra ${Math.round(pen.extra)} · CAP ${Math.round(pen.cap)} · Speed ${pen.speed} pts`;
        $('qrModal').hidden = false;
    }
    $('qrClose').onclick = () => $('qrModal').hidden = true;
    $('qrDownload').onclick = () => { const a = document.createElement('a'); a.href = lastQrUrl; a.download = 'RB_' + team + '_' + ddmmyy(new Date()) + '.png'; document.body.appendChild(a); a.click(); a.remove(); };
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
    function renderTrip() {
        $('tmPartial').textContent = (tripPartialM / 1000).toFixed(2);
        $('tmTotal').textContent = (tripTotalM / 1000).toFixed(2);
        $('tmSpeed').textContent = Math.round(speedKmh);
        $('tmCap').textContent = tmCap == null ? '—' : Math.round(tmCap);
    }
    $('tmResetPartial').onclick = () => { tripPartialM = 0; renderTrip(); };
    $('tmPlus10').onclick = () => { tripPartialM += 10; tripTotalM += 10; renderTrip(); };
    $('tmMinus10').onclick = () => { tripPartialM = Math.max(0, tripPartialM - 10); tripTotalM = Math.max(0, tripTotalM - 10); renderTrip(); };
    $('tmNoteBtn').onclick = () => { tmNotes++; $('tmNotes').textContent = tmNotes; tripPartialM = 0; renderTrip(); };
    $('tmTimerBtn').onclick = () => { tmTimerOn = !tmTimerOn; if (tmTimerOn) tmTimerStart = Date.now(); else tmTimerAcc += Date.now() - tmTimerStart; };
    $('tmExit').onclick = () => location.reload();

    /* ---------- utils ---------- */
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const pad = (n, w) => String(n).padStart(w, '0');
    const ddmmyy = (d) => d ? pad(d.getDate(), 2) + pad(d.getMonth() + 1, 2) + pad(d.getFullYear() % 100, 2) : '000000';
    const hhmmss = (d) => d ? pad(d.getHours(), 2) + pad(d.getMinutes(), 2) + pad(d.getSeconds(), 2) : '000000';
    let toastT = null;
    function toast(m) { if (window.RBi18n) m = RBi18n.t(m); const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2500); }
    async function requestWake() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && watchId != null) requestWake(); });
})();
