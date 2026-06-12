'use strict';
/* RBGpsMeter — the shared GPS dashboard loop (Reader navigation + Tripmaster):
 * starts a high-accuracy position watch, keeps the screen awake (re-acquired
 * when the tab becomes visible again) and reports one clean object per fix:
 * position, odometer-grade displacement (gated by RB.CONST.MIN_DISP_M), speed
 * (the GPS value, or derived from displacement so it never sticks when the
 * device stops reporting) and the device heading when available. */
window.RBGpsMeter = class RBGpsMeter {
    // onFix({ here, coords, disp, speedKmh, heading, tnow }) · onError() once if unavailable/denied
    constructor(onFix, onError) {
        this.lastPos = null; this.speedKmh = 0; this.heading = null; this.watchId = null;
        this._lastSpeedPos = null; this._lastSpeedT = null; this._wakeLock = null;
        if (!navigator.geolocation) { if (onError) onError(); return; }
        this.watchId = navigator.geolocation.watchPosition((pos) => {
            const c = pos.coords, here = { lat: c.latitude, lon: c.longitude }, tnow = Date.now();
            let disp = 0;
            if (this.lastPos) {
                const d = RB.geo.haversineM(this.lastPos, here);
                if (d >= RB.CONST.MIN_DISP_M) { disp = d; this.lastPos = here; }
            } else this.lastPos = here;
            if (c.speed != null && isFinite(c.speed) && c.speed >= 0) this.speedKmh = c.speed * 3.6;
            else if (this._lastSpeedPos && this._lastSpeedT) {
                const dt = (tnow - this._lastSpeedT) / 1000;
                if (dt > 0) this.speedKmh = RB.geo.haversineM(this._lastSpeedPos, here) / dt * 3.6;
            }
            this._lastSpeedPos = here; this._lastSpeedT = tnow;
            if (c.heading != null && isFinite(c.heading)) this.heading = c.heading;
            onFix({ here, coords: c, disp, speedKmh: this.speedKmh, heading: this.heading, tnow });
        }, onError || (() => {}), { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
        this._wake();
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && this.watchId != null) this._wake(); });
    }
    async _wake() { try { if ('wakeLock' in navigator) this._wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
};
