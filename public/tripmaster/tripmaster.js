'use strict';
/* RDBK Tripmaster — a precise GPS trip computer with no roadbook: total and
 * partial odometer (±10 m corrections, hold-to-reset), speed with configurable
 * alert bands, heading, stopwatch, waypoint counter and crash-safe GPX
 * recording. The session is checkpointed to localStorage on every fix, so a
 * call, a lock screen or an OS tab kill loses nothing. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, toast = RBToast; // shared helpers (app.js / i18n.js)
    const SESSION_KEY = 'rb_tripmaster_session';

    let totalM = 0, partialM = 0, maxKmh = 0, waypoints = 0;
    let timerOn = false, timerStart = 0, timerAcc = 0; // wall-clock: keeps counting while the app is dead
    let meter = null;

    /* ---------- session checkpoint: survive reloads and OS tab kills ---------- */
    function saveSession() {
        const s = { totalM, partialM, maxKmh, waypoints, timerAcc, timerOn, timerStart, gpxRecording: RBGpxRecorder.recording, gpxFileName: RBGpxRecorder.fileName };
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {}
    }
    function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }

    /* ---------- startup: resume → GPX crash recovery → fresh ---------- */
    (async function () {
        let session; try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) {}
        if (session && (session.totalM > 0 || session.waypoints > 0 || session.timerOn || session.timerAcc > 0 || session.gpxRecording)) {
            // Declining does NOT delete the session — a mis-tap must never destroy a
            // trip; it is replaced as soon as this one moves or cleared on exit.
            if (await RBConfirm(t('Resume the run in progress?') + '<br><b>Tripmaster</b> · ' + (session.totalM / 1000).toFixed(2) + ' km', t('Resume'))) {
                totalM = session.totalM; partialM = session.partialM; maxKmh = session.maxKmh; waypoints = session.waypoints;
                timerAcc = session.timerAcc; timerOn = session.timerOn; timerStart = session.timerStart;
                $('tmNotes').textContent = waypoints;
                renderTimerButton();
                if (session.gpxRecording) RBGpxRecorder.resume(session.gpxFileName);
            }
        } else {
            await RBGpxRecorder.offerRecovery();
        }
        start();
    })();

    function start() {
        window.RB_BUSY = true; // never auto-refresh mid-trip
        meter = new RBGpsMeter(onFix, () => toast('No geolocation'));
        setInterval(() => {
            const now = new Date();
            $('tmClock').textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
            const ms = timerAcc + (timerOn ? Date.now() - timerStart : 0), s = Math.floor(ms / 1000);
            $('tmTimer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        }, 500);
        render();
    }
    function onFix(fix) {
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
        if (!saLimit) return '';
        const c = v < saLimit - 5 ? saColors[0] : v < saLimit ? saColors[1] : v < saLimit + 5 ? saColors[2] : saColors[3];
        return SA_COLORS[c] || '';
    }
    function render() {
        const speedKmh = meter ? meter.speedKmh : 0;
        $('tmTotal').textContent = (totalM / 1000).toFixed(2);
        $('tmPartial').textContent = (partialM / 1000).toFixed(2);
        $('tmSpeed').textContent = Math.round(speedKmh);
        $('tmSpeed').style.setProperty('--speed-band', speedBandColor(speedKmh) || 'var(--text)'); // data-driven band colour
        $('tmSpeed').classList.toggle('over', !!saLimit && speedKmh >= saLimit); // non-colour over-limit cue
        $('tmMax').textContent = Math.round(maxKmh);
        $('tmCap').textContent = meter && meter.heading != null ? Math.round(meter.heading) : '—';
        saveSession();
    }
    $('tmPlus10').onclick = () => { partialM += 10; totalM += 10; render(); };
    $('tmMinus10').onclick = () => { const d = Math.min(10, partialM); partialM -= d; totalM = Math.max(0, totalM - d); render(); };
    $('tmNoteBtn').onclick = () => { waypoints++; $('tmNotes').textContent = waypoints; partialM = 0; render(); };
    // stopwatch: the button is Start/Pause; a reset button appears once it holds any time
    function renderTimerButton() {
        $('tmTimerBtn').innerHTML = timerOn ? `<i class="fa-solid fa-pause"></i> <span>${t('Pause')}</span>` : `<i class="fa-solid fa-stopwatch"></i> <span>${t('Timer')}</span>`;
        $('tmTimerBtn').classList.toggle('btn-primary', timerOn);
        $('tmTimerReset').hidden = !timerOn && timerAcc === 0;
    }
    $('tmTimerBtn').onclick = () => { timerOn = !timerOn; if (timerOn) timerStart = Date.now(); else timerAcc += Date.now() - timerStart; renderTimerButton(); saveSession(); };
    $('tmTimerReset').onclick = () => { timerOn = false; timerAcc = 0; renderTimerButton(); saveSession(); };
    $('tmExit').onclick = async () => { if (await RBConfirm(t('End the trip and reset everything?'), t('End the trip'))) { clearSession(); location.reload(); } };

    // Reset the partial trip. Pointer: hold 5 s (anti-accidental, browser + PWA);
    // a quick tap-and-release explains the gesture instead of doing nothing.
    // Keyboard (Enter/Space): confirm via a dialog, since a hold gesture is
    // unreachable without a pointer.
    function doReset() { partialM = 0; render(); toast('Trip reset.'); }
    (function holdReset() {
        const btn = $('tmReset'); let timer = null, heldAt = 0, viaKeyboard = false;
        const start = (e) => { e.preventDefault(); heldAt = Date.now(); btn.classList.add('holding'); timer = setTimeout(() => { timer = null; btn.classList.remove('holding'); doReset(); }, 5000); };
        const cancel = () => {
            if (timer) { clearTimeout(timer); if (Date.now() - heldAt < 600) toast('Hold to reset.'); }
            timer = null; btn.classList.remove('holding');
        };
        btn.addEventListener('pointerdown', start);
        ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, cancel));
        // Keyboard activation fires keydown then a synthetic click; handle it on
        // keydown and swallow the trailing click so it can't double-fire.
        btn.addEventListener('keydown', (e) => {
            if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
            e.preventDefault(); viaKeyboard = true;
            RBConfirm(t('Reset the partial trip?'), t('Reset')).then((ok) => { if (ok) doReset(); });
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
            <div class="btnrow end spaced"><button class="btn btn-ghost" id="saX">${t('Cancel')}</button><button class="btn btn-primary" id="saS">${t('Save')}</button></div>`, 'narrow');
        d.q('#saX').onclick = d.close;
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
    $('tmRecBtn').onclick = () => { if (RBGpxRecorder.recording) RBGpxRecorder.stop(); else RBGpxRecorder.settings(); };

})();
