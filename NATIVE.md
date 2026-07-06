# RDBK — native apps (iOS + Android)

This repo is now a **monorepo**: the web app in `public/` stays the single source of
truth, and the same `public/` is wrapped into real native apps with **Capacitor**.
One codebase → web + iOS + Android.

**App scope:** the native app is a **field companion** — **Reader · Tripmaster · Recorder**
(navigate, trip computer, GPX + geotagged photos), plus sign-in (your & public challenges)
and opening a `.rdbk`. The **Editor and Ranking stay web-only**. The app boots into a small
launcher at `public/app/`; the website's marketing home redirects there only when running
natively, and the header nav shows just the three field tools inside the app.

The whole point of going native is **GPS that survives a locked screen**: inside the
app, location logging keeps running with the screen off / app in the background, so the
recorded track has no gaps. The browser PWA cannot do this; the app can.

> Everything that does **not** need Xcode / Android Studio is already done and verified.
> What's left needs those GUI toolchains and your developer accounts — that's this guide.

---

## 1. What's already wired (no action needed)

- **`package.json`** — Capacitor 8 + `@capgo/background-geolocation` (the free, accurate
  background-GPS plugin) + esbuild, with helper scripts.
- **`capacitor.config.json`** — `appId: app.rdbk`, `appName: RDBK`, `webDir: public`,
  `android.useLegacyBridge: true` (required so background tracking doesn't stop after 5 min).
- **`native/src/native.js` → `public/assets/js/native.bundle.js`** — the `RBNative` bridge.
  It's bundled by esbuild and loaded by `app.js` **only inside the app**; in a browser it's
  never fetched, so the live PWA is byte-for-byte unchanged.
- **`gps-meter.js`** — when running natively it uses `RBNative` (background watch); in the
  browser it uses the standard Web Geolocation watch. Same data contract either way, so the
  Reader, Tripmaster and Recorder gained background GPS with no changes to their own code.
- **`app.css`** — safe-area inset for the header under the notch (`.native` body class).
- **Token auth** — `app/auth.php` issues a Bearer token on login (alongside the web session
  cookie) and `current_user()` accepts it; `RBApi`/`RBUpload` send & store it **only in the
  app**, so accounts, save-to-profile, challenges and photo upload work inside the app while
  the browser stays cookie-only and unchanged. Requires migration `006_api_tokens.sql` (§4).
- **MapLibre** — `rbmap.js` now uses MapLibre GL (no Mapbox, no paid token) with a free,
  no-key topo style (OpenFreeMap) and free 3D terrain (AWS Terrarium). The satellite toggle
  uses `RB_CONFIG.styleSatellite` (a MapTiler style URL); unset, it falls back to topo (§4).
- **Camera & share** — already native through the webview: photo capture is a file input
  (opens the OS camera/picker) and the result QR uses Web Share (the OS share sheet). Only
  the iOS usage-description keys are needed (§4).
- **App scope / launcher** — `public/app/index.html` is the app's home (Reader · Tripmaster ·
  Recorder + the public-challenges gallery); `public/index.html` redirects there when native;
  `app.js` renders the field-only nav in the app. Editor and Ranking remain on the web but
  aren't surfaced in the app.

You don't run anything for the above; it's committed and verified (the map and camera need a
quick visual check on a device — see §6).

---

## 2. Prerequisites (one-time, on this Mac)

| Tool | For | Install |
|------|-----|---------|
| **Node ≥ 22** | Capacitor 8 CLI | `brew install node@22` (the CLI rejects Node 20) |
| **JDK 21** | Android & iOS build | `brew install openjdk@21` (Capacitor 8 compiles at Java 21, not 17) |
| **Android Studio** *(optional)* | Android GUI | https://developer.android.com/studio — or just the headless SDK (`android-commandlinetools`) |
| **Xcode** (latest) | iOS build | Mac App Store, then `xcode-select --install` |
| **CocoaPods** | iOS deps | `sudo gem install cocoapods` (or `brew install cocoapods`) |

You have the two developer accounts (Apple $99/yr, Google $25 once). ✓

> **Android is already set up on this Mac and builds.** Node 22, JDK 21 and the Android
> command-line SDK (platform 35 · build-tools 35) are installed, the `android/` project is
> generated **and committed**, and a **debug APK builds cleanly** (§6). Only **iOS** still
> needs you (Xcode can't be installed headlessly).

---

## 3. First-time setup

From the repo root:

```bash
npm install                 # JS deps (Capacitor CLI, plugins, esbuild)
npm run build:native        # builds public/assets/js/native.bundle.js
npx cap add ios             # creates the ios/ Xcode project (runs pod install)
npx cap add android         # creates the android/ Android Studio project
npx cap sync                # copies public/ + plugins into both native projects
```

`cap add` generates the `ios/` and `android/` folders — **commit them** to the repo
(their internal build artifacts are git-ignored already). From now on, `npm run sync`
rebuilds the bridge and re-syncs both platforms in one step.

---

## 4. Required native config (do this once, after `cap add`)

These make the background GPS work and let the apps pass store review.

### iOS — `ios/App/App/Info.plist`
Add these keys (the usage strings are shown to the user — keep them honest):

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>RDBK uses your location to navigate and record your route.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>RDBK keeps recording your route while the screen is locked.</string>
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
</array>
<key>NSCameraUsageDescription</key>
<string>RDBK uses the camera to add geotagged photos and scan result QR codes.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>RDBK lets you attach photos from your library to a roadbook.</string>
```

The location keys power the background GPS (and clear App Store guideline 4.2); the camera /
photo-library keys let the in-app photo capture and QR scan work. In Xcode you can also set
Background Modes via **Signing & Capabilities → Background Modes → Location updates**.

### Android
- Nothing to add for the GPS: the plugin requests foreground location itself and runs a
  **foreground service** (a "Recording your route" notification) — that's why we do **not**
  need the `ACCESS_BACKGROUND_LOCATION` permission, which keeps Play review simple.
- On Android 13+ the app asks for the notification permission at runtime automatically.
- Optional polish — set the notification channel name/icon/color in
  `android/app/src/main/res/values/strings.xml`:
  ```xml
  <string name="capacitor_background_geolocation_notification_channel_name">RDBK tracking</string>
  ```

### Backend — token auth (one-time)
The native apps sign in with a Bearer token instead of the cross-origin session cookie. The
code is in `app/auth.php` + `public/api`; to make it live you must:
1. **Deploy the backend change** — merge `native-apps` into `main` (the normal push-to-`main`
   deploy ships `app/` and `public/`). The web is unaffected (it keeps using the cookie).
2. **Apply the migration** on the server's MariaDB:
   ```sh
   mysql rdbk < migrations/006_api_tokens.sql
   ```
   Until both are done, in-app login returns an error; the offline tools (editor, reader,
   tripmaster, GPX recording, background GPS) work regardless.

### Maps — satellite layer (optional)
Topo + 3D terrain work out of the box (free, no key). For real satellite imagery, set a
MapTiler style in your `public/assets/js/config.js`:
```js
styleSatellite: 'https://api.maptiler.com/maps/satellite/style.json?key=YOUR_MAPTILER_KEY'
```

---

## 5. App icon & splash

1. Put a 1024×1024 PNG icon at `assets/icon.png` and (optionally) a splash at
   `assets/splash.png` in the repo root.
2. `npm i -D @capacitor/assets && npx capacitor-assets generate` — it produces every icon
   and splash size for both platforms. (The splash background colour is already `#0e1116`.)

---

## 6. Run & test

**Android — a debug APK is already built and ready to install:**
```bash
ls android/app/build/outputs/apk/debug/app-debug.apk     # ← built on this Mac
adb install -r android/app/build/outputs/apk/debug/app-debug.apk   # phone in USB-debug mode
# or just copy that .apk to the phone and tap it (allow "install unknown apps")
```
To rebuild after any web change (env already installed on this Mac):
```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH=/opt/homebrew/opt/node@22/bin:$JAVA_HOME/bin:$PATH
npm run sync && ( cd android && ./gradlew assembleDebug )
```

**iOS — needs you (Xcode):**
```bash
npm run sync && npx cap open ios   # Xcode → pick a simulator or your iPhone → ▶ Run
```

For a **real GPS test you need a physical phone** (simulators fake location).

### The screen-lock test (the whole reason we did this)
1. Open **Recorder** (or the Reader with GPX logging on) and start recording.
2. Grant location permission → "Allow while using" then **"Change to Always"** if asked.
3. **Lock the phone** and walk/drive for a few minutes. A "Recording your route"
   notification stays visible.
4. Unlock → the odometer kept counting and the GPX track is continuous (no gap). ✅

### Also worth a quick check on device
- **Map** (Editor/Reader): the MapLibre topo map + 3D terrain render; the layer toggle flips
  to satellite once you've set a MapTiler key (§4), otherwise it stays on topo.
- **Camera/photos** (signed-in Editor/Recorder): the photo button opens the OS camera/picker
  and the photo uploads.
- **Account**: signing in stores the Bearer token, so you stay signed in across restarts and
  can save/load roadbooks (needs the backend deployed + migration applied, §4).
- **Share**: the result QR's share button opens the native share sheet.

---

## 7. Day-to-day workflow

- Edit the web app in `public/` exactly as before.
- `npm run sync` → reopen / re-run in Xcode / Android Studio to see it in the app.
- The live website keeps deploying the normal way (push to `main`); it is unaffected by
  any of the native tooling.

---

## 8. Publishing (the "finish launching" steps — done from the GUIs)

### iOS → TestFlight / App Store (CI/CD on Xcode Cloud)
Releases build in the cloud — no local archive step. The pipeline lives in
`ios/App/ci_scripts/` (Xcode Cloud picks the folder up automatically because it
sits next to `App.xcodeproj`; the `App` scheme is shared for the same reason):

- **`ci_post_clone.sh`** rebuilds everything gitignored that the app bundle needs:
  Node 22 + `npm ci`, then `config.js` and the licensed FontAwesome Pro files
  fetched from the live site (public client assets by design — no workflow
  secrets), then the native bridge + `npx cap sync ios`.
- **Build numbers are managed by Xcode Cloud itself**: each build gets the next
  integer (1, 2, 3…) and App Store Connect uses that number for the TestFlight /
  App Store build, overriding the project's `CURRENT_PROJECT_VERSION`. Change the
  counter under App Store Connect → Xcode Cloud → Settings → Build Number; bump
  the user-facing version by editing `MARKETING_VERSION` in the Xcode project.

**One-time setup:**
1. Register the App ID: https://developer.apple.com → Certificates, Identifiers &
   Profiles → **Identifiers → + → App IDs → App** → Explicit **`app.rdbk`**,
   description "RDBK" (no extra capabilities — background location is an
   Info.plist key, not an App ID capability).
2. https://appstoreconnect.apple.com → Apps → **+ New app** → iOS, name
   **RDBK**, bundle id `app.rdbk` (appears once step 1 is done), SKU `rdbk`.
3. Xcode (`npx cap open ios`) → menu **Integrate → Create Workflow** → pick the
   **App** scheme. If the repo doesn't show up, grant the **Xcode Cloud** GitHub
   app access to `alvarofranz/roadbook` (github.com → Settings → Applications).
4. Edit the workflow: **start condition = Tag changes, pattern `ios-*`** — NOT
   branch changes, because every web release pushes `main` and must not burn an
   iOS build. Action **Archive** (Release) → post-action **TestFlight (internal
   group)**. No environment variables needed.

**Cutting a TestFlight build:** `git tag ios-<version> && git push origin ios-<version>`
— or press ▶ Start Build on the workflow in Xcode / App Store Connect. Promote
to App Store review from TestFlight when happy.

**First submission:** fill the privacy nutrition labels (you collect **Location**
for app functionality, and account email if signed in), add screenshots, and
include the review note that clears guideline 4.2 "minimum functionality":
it's a GPS roadbook navigator with **background location recording**, camera
capture and offline use — native capabilities, not a website.

### Android → Play (CI/CD on GitHub Actions)
Releases build in the cloud from a tag — no local archive step — mirroring the iOS `ios-*` flow.
The pipeline is `.github/workflows/android-release.yml`: it rehydrates the gitignored client
assets from the live site (config.js + FontAwesome, public by design), builds the native bridge,
`cap sync android`, restores the signing keystore from secrets, `bundleRelease` (versionCode from
the run number, versionName from the tag), and uploads the `.aab` to the **Internal testing**
track via the service account. It fires **only on an `android-*` tag**, so a web release never
triggers an app build.

**Cutting a release:** `git tag android-1.0.4 && git push origin android-1.0.4` (or run the
workflow from the Actions tab). Promote Internal → Production in the Play Console when happy.

**One-time setup:**
1. **Signing** — the upload keystore lives at `android/rdbk-upload.jks` (+ `android/keystore.properties`),
   both git-ignored. Its base64 and passwords are the repo secrets `ANDROID_KEYSTORE_BASE64`,
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Keep the `.jks` safe —
   it's needed for every update.
2. **Play Console** — create the app `app.rdbk`, upload one `.aab` **manually** to Internal testing
   first (the API can't create the very first release), and enable **Play App Signing**.
3. **Service account** — create one in the Cloud project, enable the **Google Play Android
   Publisher API**, download its JSON key → repo secret `PLAY_SERVICE_ACCOUNT_JSON`, then invite the
   service-account email in Play Console → **Users and permissions** with release permissions.
4. **Data safety form** — declare Location (plus email if accounts). We use a **foreground service**
   (not background-location), so only the foreground-service location use is declared — no
   background-location video/justification needed.

---

## 9. Optional refinements (everything from the plan is integrated)

Background GPS, token auth, the MapLibre migration and native camera/share are all done. What
remains is polish, best done with the app running:

- **Self-hosted / offline tiles** — point `RB_CONFIG.styleTopo` at the nginx PMTiles cache on
  Hetzner and download per-route packs to the device, so the topo map works with no signal.
  (Today the map streams tiles online, as before.)
- **Vendor MapLibre** — it loads from a CDN (as Mapbox did), so the map needs a connection on
  first load. Vendor `maplibre-gl` into `public/assets/` for a fully offline shell.
- **Native QR scanner** — live QR scanning uses the Web `BarcodeDetector`, which iOS WebViews
  lack; the Ranking page's **paste** fallback covers it. Add a barcode plugin for live scan.
- **`.rdbk` open-from-OS** — wire `@capacitor/app` `appUrlOpen` to the Reader so tapping a
  `.rdbk` file opens it in the app (the web already handles this via `launchQueue`).

---

## 10. Troubleshooting

- **`cap add` fails on iOS** → CocoaPods missing: `sudo gem install cocoapods`, then
  `cd ios/App && pod install`.
- **`cap` fails with "requires NodeJS >=22"** → use Node 22 (`brew install node@22`; it's
  keg-only, so prepend `/opt/homebrew/opt/node@22/bin` to PATH).
- **Gradle: `invalid source release: 21`** → you're on an older JDK; Capacitor 8 needs
  **JDK 21** (`brew install openjdk@21`, set `JAVA_HOME` to it).
- **Background GPS stops after a few minutes (Android)** → confirm
  `android.useLegacyBridge: true` is in `capacitor.config.json` (it is) and that the
  "Recording your route" notification is showing.
- **Changes in `public/` don't show in the app** → you forgot `npm run sync`.
