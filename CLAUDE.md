# RDBK.app

A free PWA suite for **digital roadbooks** for any adventure (4x4, moto, bike,
running…), plus the open **`.rdbk`** file format. Live at **https://rdbk.app/**.

- Front-end: vanilla HTML/CSS/JS PWA (no build step), web root `public/`.
- Back-end: small PHP 8.1 + MariaDB API under `public/api/` (+ logic in `app/`) for
  accounts, per-user roadbook storage, photos and public challenges. Config via `.env`
  (phpdotenv). The front-end works fully without it; the API only adds accounts/sharing.
- Repo: GitHub `alvarofranz/roadbook`. License **WTFPL**.
- UI languages: **English (default) · Spanish · Italian**, browser auto-detected. All
  translation lives in `public/assets/js/i18n.js` (source-string keys; `data-i18n`,
  `data-i18n-html`, `data-i18n-ph` in HTML; `RBi18n.t()` + auto-translating `toast()` in JS).

## Run locally
```
cd public && python3 -m http.server 8000   # → http://localhost:8000/
```
`node --check <file>.js` for syntax; `roadbook-core.js` has node-testable functions.
`public/assets/js/config.js` (gitignored) holds a public Mapbox token + a `signKey`
(copy `config.js.example`). The PHP API needs a local PHP+MariaDB and an `.env`
(copy `.env.example`); migrations live in `migrations/`.

## Releasing
`git push origin main`, then run the production deploy hook (handled outside this
repo). **Bump `public/version.json` on every release** — the app polls it and force-
refreshes every open client (PWA or browser): clears caches, updates the SW, reloads.
Gitignored assets (`public/assets/fontawesome/`, `public/assets/js/config.js`,
`.env`, `vendor/`) live on the server and survive deploys.

## The tools (`public/<tool>/`)
- **Editor** — the creation hub. Load from **GPX**, **`.rdbk`**, **Record route**
  (live GPS: accuracy-aware sampling, pause/resume, autosave/recovery, smoothing,
  altitude, geotagged photos via the camera, instant waypoints) or a public
  **Challenge**. Edit notes (text, road type, CAP, icons), drag a note on the map to
  reposition, **splice** another GPX, **Adjust on the trail** (live re-record that
  replaces a segment or the tail). Title/description, photo gallery, **Export `.rdbk`**
  (self-contained) and **Save to profile** (public/private). Vignette editor in
  `note-canvas.js` (drag/scale/rotate/flip icons + junction vectors).
- **Reader** — the navigator (no map; the roadbook *is* the notes). Trip mode or
  Competition mode (vehicle №, validation + penalties + HMAC-signed result QR).
  Canonical 3-column layout (`NoteCanvas.rowCols`). No roadbook → Tripmaster (GPS
  trip computer). Opens `.rdbk` from the OS on installed PWAs.
- **Ranking** — scan/paste result QRs, verify the signature, build accuracy / CAP /
  speed / regularity rankings + a final score; per-row delete and CSV export.

## Shared front-end (`public/assets/js/`)
- `roadbook-core.js` (`window.RB`) — backbone: geo math, `parseGPX`/`parseWPT`,
  `buildRoadbook`, `reduceTrack`, `recomputeMetrics`/`recomputeCaps`, speed-limit
  helpers, `buildMeta`/`parseMeta` (49-char QR), `signMeta`/`verifyMeta` (HMAC-SHA256),
  `iconSrc`, `CONST`, `ROAD_TYPES`.
- `note-canvas.js` — `NoteCanvas` (vignette editor) + `NoteCanvas.toSVG` / `.rowCols`
  (static renders shared by Reader and the challenge page).
- `rbmap.js` (`RBMap`) — Mapbox GL helper (track, waypoints, live recording, photo
  pins, draggable edit marker). Used by the **Editor only**.
- `challenges.js` (`RBChallenges`) — public challenges (DB-backed): list/load/picker,
  `publicFromUrl` (parses `/reader/<slug>`, `/editor/<slug>`, `?challenge=`).
- `i18n.js`, `app.js` (global header/footer, SW + version auto-refresh, Install button,
  account control, styled modals), `config.js`, `qrcode.min.js`.

## The `.rdbk` format (open standard, documented at /standard)
One self-contained UTF-8 JSON file (MIME `application/x-roadbook`). **All distances are
integer metres.** Spec page: `public/standard/index.html`.
```jsonc
{
  "meta":  { "title": str, "total_distance": int, "note_count": int, "description"?: str },
  "track": [ { "lat": float, "lon": float, "ele"?: int } ],   // ordered polyline
  "notes": [ {
    "num": int, "idx": int,                                   // idx → index into track[]
    "lat": float, "lon": float,
    "distance": int, "partial_distance": int,                 // metres
    "text": str,
    "cap": int|null, "cap_distance": int|null,                // CAP heading (deg) + metres
    "bearing_in": float, "bearing_out": float,
    "road_type_in": 0..4, "road_type_out": 0..4,
    "icons": [ { "name": "x.png", "pos": [x,y], "angle": deg, "size": n, "flip_x": bool } ],
    "junctions": null | [ { "pivot": [x,y], "tip": [x,y], "width": n, "road_type": 0..4 } ]
  } ],
  "icons": { "x.png": "data:image/png;base64,…" }             // EVERY used symbol, embedded
}
```
- Symbols sit on a **230×162** box; origin = centre, **+y up**; `angle` clockwise.
- **Self-contained rule:** a writer MUST embed every used symbol in top-level `icons`.
  `RB.iconSrc` resolves: inline `data:` → `rb.icons` → `assets/icons/` (standard palette).
- ROAD_TYPES: 0 default · 1 motorway · 2 asphalt · 3 track · 4 off-piste (dashed).
  Speed limits encoded in symbol names (`s03_30km` ⇒ 30, `s99_end` clears).
- Photos are an **app feature only** (stored server-side, geotagged), never in the `.rdbk`.

## Conventions
- Tool pages are one level deep → relative `../assets/…`; the challenge page uses
  absolute `/assets/…`. `[hidden]{display:none!important}` in `app.css`.
- Header and footer are rendered globally by `app.js` — pages ship empty `<header
  class="topbar">`.
- **Commit messages are changelogs**: short title + bullet points, in English.
- Keep the data model in clean English (no camelCase beyond unavoidable; metres, not km).
