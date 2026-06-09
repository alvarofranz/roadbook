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

## Working guidelines (read first)
- **Think, don't just obey.** Do NOT blindly do whatever the user says. If a request is
  ambiguous, **ask for clarification before writing code** — a wrong guess wastes far more
  than a question. If something is a bad idea, or there's a cleaner/simpler way, **say so**
  with your reasoning. Proactively point out DRY/refactor opportunities you notice, even
  when not asked — suggesting how to reuse and simplify is part of the job.
- **No legacy / back-compat cruft — EVER.** When something changes, change it *properly*:
  delete the old code, and rewrite the comments to describe the **current** reality as if it
  had always been that way. NEVER leave "before this was X, now Y" notes, deprecation
  shims, version notices, or `||` fallbacks for shapes the code no longer produces. There is
  exactly one way to do each thing, and the codebase always reads fresh and clean — as if
  written from scratch today. If a rename/refactor leaves dead code or stale comments, that's
  not done until they're gone.
- **PRIORITY — start from a fresh `main`.** Before making ANY change, sync the working
  copy: `git fetch origin && git reset --hard origin/main`. Production deploys hard-reset
  to `origin/main`, so never work on (or push) a stale/divergent copy — your edits would
  be discarded or clobber someone else's.
- **Don't reinvent the wheel — use the shared primitives.** Cross-page helpers live in
  ONE place and are reused everywhere; never re-implement them per page. If you need a
  new cross-cutting helper, add it here, don't copy-paste it.
  - **`app.js`** (global `RB*`, loaded on every page): `RBModal(cardHtml, cardStyle, onDismiss)`
    (every dialog — returns `{el, q(sel), close}`), `RBConfirm`/`RBNeedAuth` (built on RBModal),
    `RBImg.toBlob/toDataURL` (client-side image downscale before upload/embed),
    `RBUpload(fields, file, name)` (image → `upload.php`), `RBDownload(blobOrUrl, name)`,
    `RBesc(str)` (HTML-escape), plus the global header/footer, version auto-refresh and install button.
  - **`i18n.js`**: `RBt(key)` (translate; falls back to the key) + `data-i18n` / `data-i18n-html`
    / `data-i18n-ph` in HTML. Keep `es`/`it` at full key parity with the English source strings.
  - **`roadbook-core.js`** (`RB.*`): geo math, GPX/WPT parsing, `buildRoadbook`, metrics/CAPs,
    QR meta, signing. **`note-canvas.js`**: `NoteCanvas` editor + `NoteCanvas.toSVG` (reader)
    / `rowCols` (challenge page). **`rbmap.js`** (`RBMap`): Mapbox helper (editor).
  - **`app.css`**: shared design system — buttons (`.btn*`), `.modal`/`.modal-card`/`.modal-in`,
    `.noterow`, etc. Don't inline styles that a class already covers.
- **Module shape.** Each page is one IIFE. Page-local-only helpers (`$`, `toast`, `msg`) stay
  local and short; alias the globals at the top (`const t = RBt, esc = RBesc;`). Anything two
  pages share becomes an `RB*` global — that's the naming convention (no lowercase/per-file copies).
- **Consistent, explicit naming.** Follow the names already used in the codebase — don't
  invent a new convention each time. A name must say what the thing IS: `width` not `wd`,
  no cryptic abbreviations or one-letter mystery vars (loop indices aside). If you find
  something misnamed or inconsistent, rename it properly *everywhere* as part of your change.
- **No inline CSS.** Styling lives in stylesheets with clear, descriptive class names —
  never `style="…"` attributes in HTML or in JS-built markup. Add a well-named class to
  `app.css` (shared) or the page's `<style>` (page-specific) and use it. Inline styles are
  treated as a bug.
- **DRY, clean, and LIFT.** Keep code DRY and readable; follow LIFT — **L**ocate code
  easily, **I**dentify it at a glance, keep structure **F**lat, **T**ry to stay DRY.
- **Refactor as you go.** When you touch an area, simplify and tidy it up; remove dead
  code and stale comments instead of leaving them.
- **Commit messages are changelogs** — short English title + bullet points.

## Run locally
```
cd public && python3 -m http.server 8000   # → http://localhost:8000/
```
`node --check <file>.js` for syntax; `roadbook-core.js` has node-testable functions.
`public/assets/js/config.js` (gitignored) holds a public Mapbox token + a `signKey`
(copy `config.js.example`). The PHP API needs a local PHP+MariaDB and an `.env`
(copy `.env.example`); migrations live in `migrations/`.

## Releasing
Pushing to `main` (a direct commit or a merged pull request) triggers the **Deploy**
GitHub Action (`.github/workflows/deploy.yml`), which calls the production deploy hook —
a single authenticated POST. It needs two repository secrets: `DEPLOY_URL` and
`DEPLOY_KEY` (Settings → Secrets and variables → Actions). You can also run it manually
from the Actions tab (`workflow_dispatch`). **Bump `public/version.json` on every
release** — the app polls it and force-refreshes every open client (PWA or browser):
clears caches, updates the SW, reloads. Gitignored assets (`public/assets/fontawesome/`,
`public/assets/js/config.js`, `.env`, `vendor/`) live on the server and survive deploys.

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
- Keep the data model in clean English (no camelCase beyond unavoidable; metres, not km).
