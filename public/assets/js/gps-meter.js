'use strict';
/* RBGpsMeter — the shared GPS dashboard loop (Reader navigation + Tripmaster):
 * starts a high-accuracy position watch, keeps the screen awake (re-acquired
 * when the tab becomes visible again) and reports one clean object per fix.
 *
 * What it guarantees to its consumers is a *judged* stream, not the raw one the OS
 * hands over: RB.odometerStep decides whether a fix is trustworthy and whether the
 * step it implies is real movement, so `disp` only ever holds ground actually covered
 * and `pos` only ever holds a position worth acting on (#383). Speed is the GPS value,
 * or derived from displacement so it never sticks when the device stops reporting, and
 * the device heading is passed through when available.
 *
 * Inside a Capacitor app the watch is the native background-capable one (logging
 * survives a locked screen); in the browser it's the standard Web Geolocation watch. */
window.RBGpsMeter = class RBGpsMeter {
    // onFix({ here, coords, disp, from, trusted, speedKmh, heading, tnow }) · onError() once if unavailable/denied
    //   here    — this fix's position (raw: for the accuracy readout and the GPX logger, which filters itself)
    //   trusted — the fix is accurate enough to act on; the note logic must ignore anything else
    //   disp    — metres to add to an odometer (0 unless the step was real movement)
    //   from    — the previous trusted position when this fix continues from it, else null: the
    //             travel SEGMENT, so a consumer can test what it drove through between two fixes
    // onAlert(kind) — optional readiness warnings (default: built-in toast/modal, so tools get them
    //   for free): 'stalled' (no fix 30 s after start — location off? #445), 'coarse' (fixes stuck
    //   above 1 km accuracy — approximate-only grant? #446), 'battery' (Android optimization may
    //   kill background GPS, #443), 'notifications' (Android notification permission denied, #444).
    constructor(onFix, onError, onAlert) {
        this._onFix = onFix; this._onError = onError || (() => {});
        this._onAlert = (typeof onAlert === 'function') ? onAlert : (kind) => this._defaultAlert(kind);
        this.pos = null; this.accuracy = null; this.speedKmh = 0; this.heading = null; this.watchId = null;
        this._anchor = null; // last trusted position + fix time — the odometer's reference
        this._lastSpeedPos = null; this._lastSpeedT = null; this._wakeLock = null;
        this._native = false; this._running = false; this._wasRunning = false;
        this._warned = {}; // one-shot alert latches, per meter lifetime (no nagging on pause cycles)
        this._onVis = () => { if (document.visibilityState === 'visible' && this._running) this._wake(); }; // re-acquire the wake lock when the tab comes back
        /* The watch must not outlive the page (#430). In a browser the teardown takes the
         * Geolocation watch with it, but in the app it is a native foreground service: it kept
         * running after the user left the tool, and the next run then asked for a watch while
         * that stale one was still registered and got an error instead of fixes — GPS simply
         * never came alive, with permission already granted. `pagehide` is the right hook:
         * unlike `visibilitychange` it does NOT fire when the app is merely backgrounded, which
         * is exactly when logging must keep going. A page restored from the back/forward cache
         * comes back with its JS state intact, so it also has to be re-armed. */
        this._onHide = () => { if (this._running) { this._wasRunning = true; this.stop(); } };
        this._onShow = (e) => { if (e.persisted && this._wasRunning) { this._wasRunning = false; this.resume(); } };
        window.addEventListener('pagehide', this._onHide);
        window.addEventListener('pageshow', this._onShow);
        this.resume();
    }
    // (Re)start the watch and re-acquire the screen wake lock — also used to resume after
    // stop() (e.g. the Reader's Pause button). No-op if already running. Native and web both
    // feed _fix() a GeolocationCoordinates-shaped object, so the rest is identical.
    // The native bridge loads async, so the source is picked through RBNativeReady — a meter
    // started right at page load (the Tripmaster) must still get the background-capable watch.
    resume() {
        if (this._running) return;
        this._running = true;
        this._gotFix = false; this._gotError = false; this._coarseN = 0;
        this._armStall();
        document.addEventListener('visibilitychange', this._onVis);
        const err = (e) => { this._gotError = true; this._clearStall(); this._onError(e); };
        RBNativeReady().then((native) => {
            if (!this._running) return; // stopped while the bridge was loading
            this._native = !!(native && native.geo);
            if (this._native) {
                RBNative.geo.start((c) => this._fix(c, Date.now()), err);
                // preflight once per meter lifetime (not every resume — no nagging on pause cycles)
                if (!this._preflightDone) {
                    this._preflightDone = true;
                    RBNative.geo.readiness().then((r) => {
                        if (!this._running || !r) return;
                        if (r.battery === false && !this._warned.battery) { this._warned.battery = true; this._onAlert('battery'); }
                        if (r.notifications === 'denied' && !this._warned.notifications) { this._warned.notifications = true; this._onAlert('notifications'); }
                    }).catch(() => {});
                }
            } else if (navigator.geolocation) {
                this.watchId = navigator.geolocation.watchPosition(
                    (pos) => this._fix(pos.coords, Date.now()),
                    (e) => {
                        if (e && e.TIMEOUT && this._running) {
                            // Cold-start GPS on Android can take >30s; retry once.
                            this._retryTimer = setTimeout(() => { if (this._running) this.resume(); }, 5000);
                        } else err(e);
                    },
                    { enableHighAccuracy: true, maximumAge: 1000, timeout: 45000 });
            } else err();
        });
        this._wake();
    }
    // Stall watchdog (#445): silence is also a signal — a GPS master switch left off (or a
    // permission that never resolves) produces neither fixes nor errors. Advisory only: the
    // first fix or error clears it, and a later cold fix still counts.
    _armStall() {
        this._clearStall();
        this._stallTimer = setTimeout(() => {
            this._stallTimer = 0;
            if (this._running && !this._gotFix && !this._gotError && !this._warned.stalled) {
                this._warned.stalled = true; this._onAlert('stalled');
            }
        }, 30000);
    }
    _clearStall() { if (this._stallTimer) { clearTimeout(this._stallTimer); this._stallTimer = 0; } }
    // Built-in alert UI so tools get readiness warnings for free (override via onAlert).
    // Toasts for the advisory ones; a modal with a settings action where the user must act.
    // Every global is guarded — under test there is no app shell.
    _defaultAlert(kind) {
        const t = (typeof window.RBt === 'function') ? window.RBt : ((k) => k);
        const toast = (typeof window.RBToast === 'function') ? window.RBToast : null;
        const modal = (typeof window.RBModal === 'function') ? window.RBModal : null;
        const nativeGeo = (typeof window.RBNative !== 'undefined' && window.RBNative && window.RBNative.geo) || null;
        if (kind === 'stalled') { if (toast) toast(t('No GPS fixes yet — check that location is turned on.')); return; }
        if (kind === 'coarse') { if (toast) toast(t('Position too coarse for a reliable track — grant precise location.')); return; }
        if (!modal) return;
        const battery = kind === 'battery';
        const m = modal(`<p class="modal-text">${t(battery
            ? 'Battery optimization is on and may stop GPS in the background, leaving gaps in your track.'
            : 'Notifications are off, so background recording may stop with the screen off.')}</p>
            <div class="btnrow end">
                <button class="btn btn-ghost" data-no>${t('Not now')}</button>
                <button class="btn btn-primary" data-yes>${t(battery ? 'Open battery settings' : 'Open settings')}</button>
            </div>`, 'narrow', () => {});
        m.q('[data-no]').onclick = m.close;
        m.q('[data-yes]').onclick = () => {
            m.close();
            if (!nativeGeo) return;
            if (battery && nativeGeo.openBatterySettings) nativeGeo.openBatterySettings();
            else if (nativeGeo.openSettings) nativeGeo.openSettings();
        };
    }
    // One position fix from either source (coords: latitude, longitude, accuracy, altitude,
    // speed in m/s, heading in degrees), judged by the odometer gate before it reaches anyone.
    _fix(c, tnow) {
        this._gotFix = true; this._clearStall();
        // Coarse-fix latch (#446): approximate-only grants read kilometres-wide. Three in a
        // row above a kilometre cannot be real GPS — warn once, on the raw accuracy (a junk
        // verdict must not hide it).
        if (c && typeof c.accuracy === 'number' && isFinite(c.accuracy)) {
            if (c.accuracy > 1000) {
                this._coarseN = (this._coarseN || 0) + 1;
                if (this._coarseN >= 3 && !this._warned.coarse) { this._warned.coarse = true; this._onAlert('coarse'); }
            } else this._coarseN = 0;
        }
        const here = { lat: c.latitude, lon: c.longitude };
        const step = RB.odometerStep(this._anchor, { lat: here.lat, lon: here.lon, acc: c.accuracy, t: tnow });
        const trusted = step.verdict !== 'junk';
        // A plausible continuation of the last trusted position: the pair is a segment we drove.
        // A teleport is not (its anchor only re-syncs), and a junk fix has no position at all.
        const from = (step.verdict === 'ok' || step.verdict === 'noise') ? this._anchor : null;
        this._anchor = step.anchor;
        if (trusted) {
            this.pos = here; this.accuracy = c.accuracy;
            if (c.speed != null && isFinite(c.speed) && c.speed >= 0) this.speedKmh = c.speed * 3.6;
            else if (this._lastSpeedPos && this._lastSpeedT) {
                const dt = (tnow - this._lastSpeedT) / 1000;
                if (dt > 0) this.speedKmh = RB.geo.haversineM(this._lastSpeedPos, here) / dt * 3.6;
            }
            this._lastSpeedPos = here; this._lastSpeedT = tnow;
            if (c.heading != null && isFinite(c.heading)) this.heading = c.heading;
        }
        this._onFix({ here, coords: c, disp: step.disp, from: from && { lat: from.lat, lon: from.lon }, trusted, speedKmh: this.speedKmh, heading: this.heading, tnow });
    }
    async _wake() { try { if ('wakeLock' in navigator) this._wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
    // Stop the watch and release the screen wake lock (resume() re-arms everything).
    stop() {
        this._running = false;
        this._clearStall();
        document.removeEventListener('visibilitychange', this._onVis);
        if (this._native) RBNative.geo.stop();
        if (this.watchId != null) { navigator.geolocation.clearWatch(this.watchId); this.watchId = null; }
        if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
        if (this._wakeLock) { this._wakeLock.release().catch(() => {}); this._wakeLock = null; }
    }
};
