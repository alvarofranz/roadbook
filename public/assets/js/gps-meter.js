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
    constructor(onFix, onError) {
        this._onFix = onFix; this._onError = onError || (() => {});
        this.pos = null; this.accuracy = null; this.speedKmh = 0; this.heading = null; this.watchId = null;
        this._anchor = null; // last trusted position + fix time — the odometer's reference
        this._lastSpeedPos = null; this._lastSpeedT = null; this._wakeLock = null;
        this._native = false; this._running = false;
        this._onVis = () => { if (document.visibilityState === 'visible' && this._running) this._wake(); }; // re-acquire the wake lock when the tab comes back
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
        document.addEventListener('visibilitychange', this._onVis);
        RBNativeReady().then((native) => {
            if (!this._running) return; // stopped while the bridge was loading
            this._native = !!(native && native.geo);
            if (this._native) {
                RBNative.geo.start((c) => this._fix(c, Date.now()), this._onError);
            } else if (navigator.geolocation) {
                this.watchId = navigator.geolocation.watchPosition(
                    (pos) => this._fix(pos.coords, Date.now()),
                    (err) => {
                        if (err && err.TIMEOUT && this._running) {
                            // Cold-start GPS on Android can take >30s; retry once.
                            this._retryTimer = setTimeout(() => { if (this._running) this.resume(); }, 5000);
                        } else this._onError(err);
                    },
                    { enableHighAccuracy: true, maximumAge: 1000, timeout: 45000 });
            } else this._onError();
        });
        this._wake();
    }
    // One position fix from either source (coords: latitude, longitude, accuracy, altitude,
    // speed in m/s, heading in degrees), judged by the odometer gate before it reaches anyone.
    _fix(c, tnow) {
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
        document.removeEventListener('visibilitychange', this._onVis);
        if (this._native) RBNative.geo.stop();
        if (this.watchId != null) { navigator.geolocation.clearWatch(this.watchId); this.watchId = null; }
        if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
        if (this._wakeLock) { this._wakeLock.release().catch(() => {}); this._wakeLock = null; }
    }
};
