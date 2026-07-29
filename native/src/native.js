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
 * watch via @capgo/background-geolocation), and save the files the app generates to
 * device storage (the WebView ignores `<a download>` — we write the blob with the
 * native Filesystem plugin and, on iOS, open the OS "Save to Files" sheet). RBGpsMeter
 * calls RBNative.geo when it is present, so the Reader, Tripmaster and Recorder gain
 * uninterrupted tracking with no change to their own code. */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FileSharer } from '@capgo/capacitor-file-sharer';
import { parseDeepLink } from './deeplink.js';

// The app's Google OAuth clients (all public). The WEB client is the token audience the backend
// verifies (#46) and Android's serverClientId; the iOS client drives the on-device iOS picker.
const GOOGLE_WEB_CLIENT_ID = '300694269526-qhtr54a7rvagseohbt3l5b4gdhmn9n7t.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = '300694269526-q9evtli556sb0ag4trp42b8ko7qq1ldf.apps.googleusercontent.com';
let socialReady = null;   // SocialLogin.initialize() promise, run once for every provider

// One initialize() call configures every provider this platform signs in with. A failed init must
// not poison every later attempt, so the promise is dropped on rejection and the next tap retries.
function initSocialLogin() {
    if (!socialReady) {
        const config = {
            google: {
                webClientId: GOOGLE_WEB_CLIENT_ID,      // Android serverClientId + token audience
                iOSClientId: GOOGLE_IOS_CLIENT_ID,
                iOSServerClientId: GOOGLE_WEB_CLIENT_ID,
                mode: 'online',                          // returns an ID token (not just an auth code)
            },
        };
        // Sign in with Apple (#370) is configured on iOS ONLY. There an EMPTY redirectUrl selects
        // the native path, where the OS sheet returns the identity token straight to the app (no
        // web redirect, no Services ID — the token's audience is the bundle id). On Android the
        // plugin would reject the WHOLE initialize() over the empty redirectUrl and never reach the
        // Google block, taking Google sign-in down with it.
        if (Capacitor.getPlatform() === 'ios') config.apple = { redirectUrl: '' };
        socialReady = SocialLogin.initialize(config).catch((e) => { socialReady = null; throw e; });
    }
    return socialReady;
}

// The Filesystem plugin takes bare base64 (no data: prefix); strip it off a Blob.
async function blobToBase64(blob) {
    const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
    });
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

const RBNative = {
    // Save a Blob to device storage. `<a download>` is ignored inside a WebView, so
    // this is the native path for every download the app generates (GPX, .rdbk, CSV…).
    // Resolves with where the file went — 'documents' (Android public Documents),
    // 'share' (handed to the OS share sheet) or 'canceled' (the user dismissed the
    // sheet) — and throws when nothing could save it; the caller (RBDownload) owns
    // the user feedback. The two OSes hand the file to a folder in different ways:
    //   · Android — the WebView has no folder picker (the File System Access API is
    //             desktop-Chromium only), so the file-sharer plugin writes the blob
    //             through MediaStore into the public Documents collection. It lands where
    //             the Files / Downloads apps can see it and needs no storage permission on
    //             any Android version — MediaStore is the scoped-storage-safe write path.
    //   · iOS   — apps are sandboxed; the only way to reach an arbitrary folder is the
    //             system share sheet, whose "Save to Files" entry IS the folder chooser.
    async downloadFile(blob, filename) {
        const data = await blobToBase64(blob);
        if (Capacitor.getPlatform() === 'android') {
            await FileSharer.save({ filename, base64Data: data, android: { saveDirectory: 'documents' } });
            return 'documents';
        }
        const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache, recursive: true });
        try { await Share.share({ title: filename, files: [uri] }); }
        catch (e) {
            if (/cancel/i.test((e && e.message) || '')) return 'canceled'; // dismissing the sheet is a choice, not an error
            throw e;
        }
        return 'share';
    },

    // Native Google Sign-In (#46). The web GIS button can't run inside a WebView, so the app
    // uses the OS Google account picker (Credential Manager on Android, GoogleSignIn on iOS) via
    // @capgo/capacitor-social-login, then hands the ID token to /api google_auth — the same
    // endpoint the web uses. Returns { credential } for that call, or null if the user cancelled.
    async googleSignIn() {
        await initSocialLogin();
        // No explicit scopes: the plugin already requests email/profile/openid by default, and on
        // Android passing ANY makes it reject outright (custom scopes demand a modified MainActivity).
        const res = await SocialLogin.login({ provider: 'google', options: {} });
        const idToken = res && res.result && res.result.idToken;
        return idToken ? { credential: idToken } : null;     // the name comes from the verified token, server-side
    },

    // Native Sign in with Apple (#370). iOS only: the Apple sheet is an Apple-platform feature, and
    // guideline 4.8 only asks for it there — the Android app keeps Google alone. Returns
    // { credential, first_name, last_name } for /api apple_auth, or null if the user cancelled.
    // Apple discloses the name ONLY in the first authorization (never inside the token), so it has
    // to travel next to it; the plugin remembers it for later sign-ins.
    async appleSignIn() {
        await initSocialLogin();
        const res = await SocialLogin.login({ provider: 'apple', options: { scopes: ['name', 'email'] } });
        const apple = (res && res.result) || null;
        if (!apple || !apple.idToken) return null;
        const profile = apple.profile || {};
        return { credential: apple.idToken, first_name: profile.givenName || '', last_name: profile.familyName || '' };
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

/* Universal Links / App Links (#268). When the app is installed, tapping or scanning an
 * https://rdbk.app/… link opens it here instead of the browser (the association files at
 * /.well-known/ + the iOS entitlement / Android intent-filter wire this up). A /go/<code>
 * link is an event join: there is no PHP server in the app, so the join runs through the
 * API (Bearer) and then the event page opens; any other rdbk.app link is a real bundled
 * route we just navigate to. A signed-out user's code is stashed and replayed after login,
 * so the join survives the sign-in detour. */
const PENDING_JOIN = 'rb_pending_join';

// The bundle can evaluate before app.js has defined the shared globals — wait for them.
function whenAppReady() {
    return new Promise((resolve) => {
        (function poll() {
            if (typeof window.RBApi === 'function' && typeof window.RBConfig === 'function') resolve();
            else setTimeout(poll, 50);
        })();
    });
}

async function joinEvent(code) {
    await whenAppReady();
    const cfg = await window.RBConfig();
    if (!cfg || !cfg.user) {                     // must be signed in to join — stash, log in, resume
        localStorage.setItem(PENDING_JOIN, code);
        window.location.href = '/account/';
        return;
    }
    const res = await window.RBApi('event_join', { code });
    if (res && res.ok && res.slug) {
        localStorage.removeItem(PENDING_JOIN);
        window.location.href = '/event/' + encodeURIComponent(res.slug);
    }
    // On failure the pending code is left in place; the next launch / sign-in retries it.
}

// Replay a join deferred while the user was signed out (runs on every app page load).
async function consumePendingJoin() {
    const code = localStorage.getItem(PENDING_JOIN);
    if (!code) return;
    await whenAppReady();
    const cfg = await window.RBConfig();
    if (cfg && cfg.user) { localStorage.removeItem(PENDING_JOIN); joinEvent(code); }
}

function handleDeepLink(url) {
    const action = parseDeepLink(url);
    if (!action) return;
    if (action.join) joinEvent(action.join);
    else window.location.href = action.navigate;
}

App.addListener('appUrlOpen', (e) => { if (e && e.url) handleDeepLink(e.url); });
App.getLaunchUrl().then((res) => { if (res && res.url) handleDeepLink(res.url); }).catch(() => {});
consumePendingJoin();
