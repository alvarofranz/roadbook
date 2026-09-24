'use strict';
/* RDBK Tripmaster — a precise GPS trip computer with no roadbook: total and
 * partial odometer (±10 m corrections, hold the tile 2 s to reset), speed with configurable
 * alert bands, heading, stopwatch, waypoint counter and crash-safe GPX
 * recording. The session is checkpointed to localStorage on every fix, so a
 * call, a lock screen or an OS tab kill loses nothing. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, toast = RBToast, pad2 = RB.pad2; // shared helpers (app.js / i18n.js / roadbook-core)
    const SESSION_KEY = 'rb_tripmaster_session';

    let totalM = 0, partialM = 0, maxKmh = 0, waypoints = 0;
    let timerOn = false, timerStart = 0, timerAcc = 0; // wall-clock: keeps counting while the app is dead
    let meter = null;
    let keepDeclined = false; // a declined checkpoint is not overwritten until this trip has data

    /* ---------- session checkpoint: survive reloads and OS tab kills ---------- */
    function saveSession() {
        if (keepDeclined && !(totalM > 0 || waypoints > 0 || timerOn || timerAcc > 0 || RBGpxRecorder.recording)) return;
        keepDeclined = false;
        const s = { totalM, partialM, maxKmh, waypoints, timerAcc, timerOn, timerStart, gpxRecording: RBGpxRecorder.recording, gpxFileName: RBGpxRecorder.fileName };
        RBCheckpoint.write(SESSION_KEY, s);
    }
    function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }

    /* ---------- startup: resume → GPX crash recovery → fresh ---------- */
    (async function () {
        const session = RBCheckpoint.read(SESSION_KEY);
        if (session && !session.declined && (session.totalM > 0 || session.waypoints > 0 || session.timerOn || session.timerAcc > 0 || session.gpxRecording)) {
            // A declined resume is MARKED, never deleted (#436 · #644): asking twice is nagging,
            // overwriting it is data loss. It stays as it is until this trip has data of its own.
            if (await RBConfirm(t('Resume the run in progress?') + '<br><b>Tripmaster</b> · ' + RBKm(session.totalM))) {
                totalM = session.totalM; partialM = session.partialM; maxKmh = session.maxKmh; waypoints = session.waypoints;
                timerAcc = session.timerAcc; timerOn = session.timerOn; timerStart = session.timerStart;
                $('tmNotes').textContent = waypoints;
                renderTimer();
                if (session.gpxRecording) RBGpxRecorder.resume(session.gpxFileName);
            } else {
                keepDeclined = true;
                RBCheckpoint.decline(SESSION_KEY);
                await RBGpxRecorder.offerRecovery(); // a declined trip that was recording still gets its GPX back
            }
        } else {
            await RBGpxRecorder.offerRecovery();
        }
        start();
    })();

    function start() {
        window.RB_BUSY = true; // never auto-refresh mid-trip
        RBWebGpsWarn(); // browser-only floating warning: web GPS is unreliable on phones
        $('tmNativeHint').hidden = document.documentElement.classList.contains('native'); // the "use the app" recommendation, in a browser only (as in the Recorder)
        RBStatusBar.show(); // shared bar: clock · battery · satellite/GPS
        meter = new RBGpsMeter(onFix, () => toast('No geolocation'));
        setInterval(() => { // the stopwatch (the clock is the status bar's)
            const ms = timerAcc + (timerOn ? Date.now() - timerStart : 0), s = Math.floor(ms / 1000);
            $('tmTimer').textContent = Math.floor(s / 60) + ':' + pad2(s % 60);
        }, 500);
        render();
        // the rider's remote controller (#909): its mapped buttons run the dashboard's own controls
        RBRemote.attach({
            next: () => $('tmNoteBtn').click(), reset: doReset,
            plus10: () => $('tmPlus10').click(), minus10: () => $('tmMinus10').click(),
            timer: () => $('tmTimerBtn').click(),
        });
        setTimeout(() => RBTour('tripmaster', TRIPMASTER_TOUR), 700); // the first visit (#906)
    }
    // The Tripmaster's guided tour (#906): what the dashboard's controls do, once
    const TRIPMASTER_TOUR = [
        { target: '.tm-odo', title: 'Odometers', text: 'Total and partial. ±10 m corrects them; hold the partial 2 s to reset it.' },
        { target: '#tmSpeedAlert', title: 'Speed', text: 'Tap it to set speed alerts.' },
        { target: '#tmTimerBtn', title: 'Timer', text: 'Tap to start and stop it.' },
        { target: '#tmNoteBtn', title: 'Mark note', text: 'Counts a note and resets the partial.' },
        { target: '#tmRecBtn', title: 'Record GPX', text: 'Logs the whole run as a GPX track.' },
        { target: '#tmExit', title: 'Leave', text: 'Ends the session.' },
    ];
    function onFix(fix) {
        RBStatusBar.setGps(fix.coords.accuracy);
        totalM += fix.disp; partialM += fix.disp;
        if (fix.speedKmh > maxKmh) maxKmh = fix.speedKmh;
        RBGpxRecorder.feed(fix.coords, fix.here, fix.tnow);
        render();
    }

    /* ---------- dashboard ---------- */
    const SA_COLORS = { green: 'var(--ok)', orange: '#ff9f1c', red: 'var(--track)' };
    let saLimit = 0, saColors = ['green', 'orange', 'red', 'red'];
    try { const s = JSON.parse(localStorage.getItem('rb_speedalert') || 'null'); if (s) { saLimit = s.limit || 0; saColors = s.colors || saColors; } } catch (e) {}
    function speedBandColor(v) {
        const band = RB.speedBand(v, saLimit); // 0..3 vs the alert limit, null when unset (core, #169)
        return band == null ? '' : SA_COLORS[saColors[band]] || '';
    }
    // The dashboard is static markup, redrawn on every GPS fix — cache the refs once.
    const tmEls = { total: $('tmTotal'), partial: $('tmPartial'), speed: $('tmSpeed'), main: $('tmMain'), max: $('tmMax'), cap: $('tmCap'), capArrow: $('tmCapArrow'), speedKey: $('tmSpeedKey') };
    function render() {
        const speedKmh = meter ? meter.speedKmh : 0;
        const band = speedBandColor(speedKmh);
        tmEls.total.textContent = (totalM / 1000).toFixed(2);
        tmEls.partial.textContent = (partialM / 1000).toFixed(2);
        tmEls.speed.textContent = Math.round(speedKmh);
        tmEls.speed.style.setProperty('--speed-band', band || 'var(--text)'); // data-driven band colour
        tmEls.speed.classList.toggle('over', !!saLimit && speedKmh >= saLimit); // non-colour over-limit cue
        tmEls.main.style.setProperty('--tm-band', band || 'transparent'); // tint the central column with the alert colour
        tmEls.max.textContent = Math.round(maxKmh);
        tmEls.speedKey.textContent = saLimit ? t('Alert') + ' ' + saLimit : t('Speed'); // the speed tile says what tapping it set
        const hdg = meter && meter.heading != null ? Math.round(meter.heading) : null;
        tmEls.cap.textContent = hdg == null ? '—' : hdg;
        // directional needle: 0° = up = North, rotates to the travel heading; parked until a heading exists
        tmEls.capArrow.classList.toggle('idle', hdg == null);
        if (hdg != null) tmEls.capArrow.style.setProperty('--cap-rotation', hdg + 'deg');
        saveSession();
    }
    // partial ±10 m correctors adjust the partial trip ONLY — the lifetime total is untouched
    $('tmPlus10').onclick = () => { partialM += 10; render(); };
    $('tmMinus10').onclick = () => { partialM = Math.max(0, partialM - 10); render(); };
    // total has its own ±10 m correctors (adjust the lifetime total only)
    $('tmTotPlus10').onclick = () => { totalM += 10; render(); };
    $('tmTotMinus10').onclick = () => { totalM = Math.max(0, totalM - 10); render(); };
    $('tmNoteBtn').onclick = () => { waypoints++; $('tmNotes').textContent = waypoints; partialM = 0; render(); };
    // stopwatch (#721): its tile is the Start/Pause control; the reset appears once it holds any time
    function renderTimer() {
        $('tmTimerIcon').className = 'fa-solid ' + (timerOn ? 'fa-pause' : 'fa-stopwatch');
        const lbl = t(timerOn ? 'Pause the timer' : 'Start the timer');
        $('tmTimerBtn').setAttribute('aria-label', lbl); $('tmTimerBtn').setAttribute('title', lbl);
        $('tmTimerBtn').closest('.tm-timer').classList.toggle('running', timerOn);
        $('tmTimerReset').hidden = !timerOn && timerAcc === 0;
    }
    renderTimer();
    $('tmTimerBtn').onclick = () => { timerOn = !timerOn; if (timerOn) timerStart = Date.now(); else timerAcc += Date.now() - timerStart; renderTimer(); saveSession(); };
    $('tmTimerReset').onclick = () => { timerOn = false; timerAcc = 0; renderTimer(); saveSession(); };
    $('tmExit').onclick = async () => { if (await RBConfirmDanger(t('End the trip and reset everything?'))) { clearSession(); window.RB_BUSY = false; location.reload(); } }; // unblock the version auto-refresh before leaving


    // Reset the partial trip (#983). Pointer: press anywhere on the partial tile (its ±10 m aside) and
    // hold 2 s — anti-accidental, and the finger can land on the big number instead of the small ↺, so
    // the hint and the arrow stay above it. Keyboard (Enter/Space on ↺): a confirm, since a hold gesture
    // is unreachable without a pointer.
    const HOLD_MS = 2000, DONE_MS = 500;
    function doReset() { partialM = 0; render(); toast('Trip reset.'); }
    (function holdReset() {
        const tile = $('tmPartialTile'), btn = $('tmReset'); let timer = null, doneTimer = null, viaKeyboard = false;
        const show = (holding) => { tile.classList.toggle('holding', holding); $('tmHoldHint').hidden = !holding; $('tmPartialCaption').hidden = holding; };
        const start = (e) => {
            if (e.button > 0 || e.target.closest('.corr')) return;
            e.preventDefault(); clearTimeout(doneTimer); tile.classList.remove('done'); show(true);
            timer = setTimeout(() => {
                timer = null; show(false); doReset();
                tile.classList.add('done'); doneTimer = setTimeout(() => tile.classList.remove('done'), DONE_MS);
            }, HOLD_MS);
        };
        const cancel = () => { if (timer) { clearTimeout(timer); timer = null; show(false); } };
        tile.addEventListener('pointerdown', start);
        ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => tile.addEventListener(ev, cancel));
        tile.addEventListener('contextmenu', (e) => e.preventDefault()); // a long press is the gesture, not a menu
        // Keyboard activation fires keydown then a synthetic click; handle it on
        // keydown and swallow the trailing click so it can't double-fire.
        btn.addEventListener('keydown', (e) => {
            if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
            e.preventDefault(); viaKeyboard = true;
            RBConfirmDanger(t('Reset the partial trip?')).then((ok) => { if (ok) doReset(); });
        });
        btn.addEventListener('click', (e) => { if (viaKeyboard) { viaKeyboard = false; e.preventDefault(); } });
    })();

    // Speed alert settings
    $('tmSpeedAlert').onclick = () => {
        const opt = (sel) => ['green', 'orange', 'red'].map((c) => `<option value="${c}" ${c === sel ? 'selected' : ''}>${t(c)}</option>`).join('');
        const band = (label) => t('Colour for the band {band}').replace('{band}', label);
        const d = RBModal(`<h3>${t('Speed alert')}</h3>
            <label class="muted small">${t('Speed to watch (km/h · 0 = off)')}</label>
            <input id="saIn" class="modal-in" type="number" min="0" max="300" inputmode="numeric" value="${saLimit}" aria-label="${t('Speed to watch (km/h · 0 = off)')}">
            <div class="muted small">${t('Colours')}</div>
            <div class="field-grid">
                <span>&lt; L−5</span><select id="sa0" class="modal-in" aria-label="${band('< L−5')}">${opt(saColors[0])}</select>
                <span>L−5 … L</span><select id="sa1" class="modal-in" aria-label="${band('L−5 … L')}">${opt(saColors[1])}</select>
                <span>L … L+5</span><select id="sa2" class="modal-in" aria-label="${band('L … L+5')}">${opt(saColors[2])}</select>
                <span>&gt; L+5</span><select id="sa3" class="modal-in" aria-label="${band('> L+5')}">${opt(saColors[3])}</select>
            </div>
            <div class="btnrow end spaced"><button class="btn btn-primary" id="saS">${t('Save')}</button></div>`, 'narrow', null, { dismissable: false, corner: true }); // a form: left from its corner, never by a stray tap
        d.q('#saS').onclick = () => {
            saLimit = Math.max(0, Math.min(300, parseInt(d.q('#saIn').value, 10) || 0));
            saColors = ['sa0', 'sa1', 'sa2', 'sa3'].map((id) => d.q('#' + id).value);
            try { localStorage.setItem('rb_speedalert', JSON.stringify({ limit: saLimit, colors: saColors })); } catch (e) {}
            d.close(); render();
        };
    };

    /* ---------- GPX recording ---------- */
    RBGpxRecorder.init({
        toast,
        onChange: (recording) => { // recording = an unmistakable red STOP button
            $('tmRecBtn').classList.toggle('btn-danger', recording);
            $('tmRecBtn').innerHTML = recording ? `<i class="fa-solid fa-stop"></i> <span>${t('Stop recording')}</span>` : `<i class="fa-solid fa-circle-dot"></i> <span>${t('Record GPX')}</span>`;
            saveSession();
        },
    });
    $('tmRecBtn').onclick = () => { if (RBGpxRecorder.recording) RBGpxRecorder.stop(); else RBGpxRecorder.begin(); };

})();
