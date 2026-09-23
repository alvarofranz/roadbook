import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import RB from '../public/assets/js/roadbook-core.js';

/* RBGpsMeter (gps-meter.js), driven through a fake Web Geolocation watch: which errors reach the
   page, and what a stop → resume (the Reader's Pause) does to the movement it reports. */
const src = fs.readFileSync('public/assets/js/gps-meter.js', 'utf8');
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('RBGpsMeter', () => {
    let watch, fixes, errors;
    beforeEach(() => {
        window.RB = RB;
        window.RBNativeReady = () => Promise.resolve(null); // a browser: the Web Geolocation watch
        watch = null; fixes = []; errors = [];
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: { watchPosition: (ok, fail) => { watch = { ok, fail }; return 1; }, clearWatch: () => { watch = null; } },
        });
        eval(src);
    });
    const start = async () => {
        const meter = new window.RBGpsMeter((f) => fixes.push(f), (e) => errors.push(e), () => {});
        await settle();
        return meter;
    };
    // a fix `m` metres north of a fixed origin, at time `t` (ms)
    const fixAt = (m, t) => { vi.setSystemTime(t); watch.ok({ coords: { latitude: 45 + m / 111320, longitude: 9, accuracy: 5, speed: null, heading: null } }); };
    const ERR = { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };

    it('a timeout is not an error: the watch keeps running and nothing is reported', async () => {
        await start();
        watch.fail({ code: 3, ...ERR });
        expect(errors).toEqual([]);
        expect(watch).not.toBeNull();
    });
    it('a denied permission reaches the page', async () => {
        await start();
        watch.fail({ code: 1, ...ERR });
        expect(errors.length).toBe(1);
    });
    it('the ground covered while stopped is never counted, and never tested as a segment', async () => {
        const meter = await start();
        fixAt(0, 1_000_000); fixAt(20, 1_004_000);
        expect(fixes[1].disp).toBeGreaterThan(15);
        meter.stop();                       // Pause
        meter.resume(); await settle();     // Resume, 2 km further on, ten minutes later
        fixAt(2000, 1_600_000);
        expect(fixes[2].disp).toBe(0);
        expect(fixes[2].from).toBeNull();
        fixAt(2020, 1_604_000);             // and from there on it counts again
        expect(fixes[3].disp).toBeGreaterThan(15);
        expect(fixes[3].from).not.toBeNull();
        vi.useRealTimers();
    });
    it('a GPS jump never becomes a speed: without a device speed the last real one stands', async () => {
        const meter = await start();
        fixAt(0, 2_000_000); fixAt(20, 2_004_000);        // 20 m in 4 s = 18 km/h
        expect(Math.round(meter.speedKmh)).toBe(18);
        fixAt(900, 2_005_000);                            // 880 m in a second: a teleport
        expect(fixes[2].trusted).toBe(true);
        expect(Math.round(fixes[2].speedKmh)).toBe(18);
        vi.useRealTimers();
    });
    it('a wake lock granted after the meter stopped is released at once', async () => {
        let grant, released = false;
        Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => new Promise((r) => { grant = r; }) } });
        const meter = await start();
        meter.stop();
        grant({ release: () => { released = true; return Promise.resolve(); } });
        await settle();
        expect(released).toBe(true);
        expect(meter._wakeLock).toBeNull();
        delete navigator.wakeLock;
    });
});
