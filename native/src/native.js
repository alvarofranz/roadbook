'use strict';
/* RBNative — the native capability bridge for the Capacitor shells (iOS + Android).
 *
 * It is bundled (esbuild, see package.json `build:native`) into
 * public/assets/js/native.bundle.js and loaded by app.js ONLY when the page runs
 * inside a Capacitor app. In a plain browser it is never fetched, so the PWA is
 * byte-for-byte unchanged — every feature degrades to the standard Web API.
 *
 * Today it owns the one thing the browser cannot do: keep logging GPS while the
 * screen is locked / the app is backgrounded (a native foreground-service location
 * watch via @capgo/background-geolocation). RBGpsMeter calls RBNative.geo when it
 * is present, so the Reader, Tripmaster and Recorder gain uninterrupted tracking
 * with no change to their own code. */
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { SocialLogin } from '@capgo/capacitor-social-login';

// The app's Google OAuth clients (all public). The WEB client is the token audience the backend
// verifies (#46) and Android's serverClientId; the iOS client drives the on-device iOS picker.
const GOOGLE_WEB_CLIENT_ID = '300694269526-qhtr54a7rvagseohbt3l5b4gdhmn9n7t.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = '300694269526-q9evtli556sb0ag4trp42b8ko7qq1ldf.apps.googleusercontent.com';
let googleReady = null;   // SocialLogin.initialize() promise, run once

const RBNative = {
    available: true,                       // the bundle only loads inside a native shell

    // Native Google Sign-In (#46). The web GIS button can't run inside a WebView, so the app
    // uses the OS Google account picker (Credential Manager on Android, GoogleSignIn on iOS) via
    // @capgo/capacitor-social-login, then hands the ID token to /api google_auth — the same
    // endpoint the web uses. Returns the ID token string, or null if the user cancelled.
    async googleSignIn() {
        if (!googleReady) {
            googleReady = SocialLogin.initialize({
                google: {
                    webClientId: GOOGLE_WEB_CLIENT_ID,      // Android serverClientId + token audience
                    iOSClientId: GOOGLE_IOS_CLIENT_ID,
                    iOSServerClientId: GOOGLE_WEB_CLIENT_ID,
                    mode: 'online',                          // returns an ID token (not just an auth code)
                },
            });
        }
        await googleReady;
        const res = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
        return (res && res.result && res.result.idToken) || null;
    },

    geo: {
        // Start background-capable location updates. `onUpdate` receives a coords
        // object shaped exactly like the browser's GeolocationCoordinates (speed in
        // m/s, heading in degrees) so RBGpsMeter treats the native and web feeds
        // identically. A single watch runs at a time (start replaces, stop ends it).
        async start(onUpdate, onError) {
            try {
                await BackgroundGeolocation.start({
                    backgroundTitle: 'RDBK',
                    backgroundMessage: 'Recording your route',  // its presence is what keeps updates alive in the background
                    requestPermissions: true,
                    stale: false,
                    distanceFilter: 0,                           // every fix; RBGpsMeter does its own displacement gating
                }, (loc, err) => {
                    if (err) { if (onError) onError(err); return; }
                    if (!loc) return;
                    onUpdate({
                        latitude: loc.latitude,
                        longitude: loc.longitude,
                        accuracy: loc.accuracy,
                        altitude: loc.altitude,
                        speed: loc.speed,        // m/s or null
                        heading: loc.bearing,    // degrees or null (the Web API name)
                    });
                });
            } catch (e) { if (onError) onError(e); }
        },
        async stop() { try { await BackgroundGeolocation.stop(); } catch (e) {} },
    },
};

window.RBNative = RBNative;
