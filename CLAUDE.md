# RDBK.app

A free PWA suite for **digital roadbooks** for any adventure (4x4, moto, bike,
running…), plus the open **`.rdbk`** file format. Live at **https://rdbk.app/**.

- Front-end: vanilla HTML/CSS/JS PWA, web root `public/` (no build step on the web).
- Native apps: the same `public/` is wrapped by **Capacitor** into iOS + Android (one
  codebase). The only built artifact is the native bridge (`native/src/native.js` →
  `public/assets/js/native.bundle.js`, esbuild). See **Native apps** below and `NATIVE.md`.
- Back-end: small PHP 8.1 + MariaDB API under `public/api/` (+ logic in `app/`) for
  accounts, per-user roadbook storage, photos and public roadbooks. Config via `.env`
  (phpdotenv). The front-end works fully without it; the API only adds accounts/sharing.
  DB schema = `migrations/*.sql` (source of truth); 4 tables: `users`, `roadbooks`,
  `roadbook_photos`, `api_tokens`.
- Repo: GitHub `alvarofranz/roadbook`. License **MIT**.
- UI languages: **English (default) · Spanish · Italian · German · French**, browser
  auto-detected. English is the source (in `i18n.js`); each other language lives in its own
  `public/assets/js/i18n.<lang>.js` (loaded before `i18n.js`, merged via `window.RBi18nLangs`).
  Source-string keys; `data-i18n` / `data-i18n-html` / `data-i18n-ph` / `data-i18n-title` /
  `data-i18n-aria` / `data-i18n-tip` in HTML; `RBt()` + auto-translating `RBToast()` in JS.

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
- **Confirm before destroying data.** ANY action that loses or overwrites user data
  (deleting a note/point, transforming something in a lossy way, clearing/replacing content,
  discarding unsaved work…) MUST ask for confirmation first via `RBConfirm` before it runs.
  No silent data loss, ever. A **deletion** confirm MUST name the object being deleted in its
  message (e.g. the note number + text), so the user knows exactly what they're removing.
- **Edit freely, but WAIT for the user's test confirmation before deploying.** You may read and
  modify the code in the local working copy as needed. But do NOT commit/stamp/push (a push to
  `main` is a production deploy) until the user has tested the change (ddev serves the working
  tree) and given an explicit go-ahead. Make the change, say what to test, then stop — never
  pre-emptively deploy, even when the user asked for the feature.
- **PRIORITY — start from a fresh `main`.** Before making ANY change, sync the working
  copy: `git fetch origin && git reset --hard origin/main`. Production deploys hard-reset
  to `origin/main`, so never work on (or push) a stale/divergent copy — your edits would
  be discarded or clobber someone else's.
- **A `fix:` request → open the issue and start it immediately.** When the user prefixes a
  request with `fix:`, treat it as a bug to formalize: FIRST create a GitHub issue for it
  (`gh issue create --repo alvarofranz/roadbook` — clear English title + the reported behavior
  and the expected fix), THEN immediately assign it and mark it in progress (see the next
  bullet), all before writing any code. Only after that do you fix it, under the normal flow
  (test hand-off before deploy; drop the WIP tag when it ships to prod).
- **Taking on a GitHub issue → assign it + mark it in progress.** The moment you start on an
  issue — including scoping/investigation, BEFORE writing any code — run `gh issue edit <n> --repo alvarofranz/roadbook --add-assignee
  @me --add-label "in lavorazione"`. `@me` assigns it to whoever is authenticated with `gh`
  (the person doing the work — you, Álvaro, whoever pulled), never a hard-coded name. This
  shows who owns it and that it is being worked on.
- **Committing an issue's fix to prod → drop the WIP tag.** Remove the `in lavorazione` label
  the moment the fix ships to production (a prod deploy = a push to `main`) — that is when it
  stops being "in progress". GitHub does NOT auto-remove labels, so clear it explicitly:
  `gh issue edit <n> --repo alvarofranz/roadbook --remove-label "in lavorazione"`. When you
  also close the issue, do it in the same step: `gh issue close <n> --repo alvarofranz/roadbook`.
  The `in lavorazione` label must reflect only what is genuinely being worked right now — never
  an issue whose fix is already deployed (or closed).
- **Process/architecture changes need an Alvaro review — ASK FIRST.** Any change that
  touches server-side processes (deploy, CI, the PHP API, the DB schema/migrations) or the
  project's architecture or way of working MUST NOT go straight to `main` on your own:
  first ASK the user whether they want a pull request reviewed by Alvaro, and wait for the
  answer. Pure client-side bug fixes that don't touch processes or architecture can proceed
  normally.
- **Don't reinvent the wheel — use the shared primitives.** Cross-page helpers live in
  ONE place and are reused everywhere; never re-implement them per page. If you need a
  new cross-cutting helper, add it here, don't copy-paste it.
  - **`app.js`** (global `RB*`, loaded on every page): `RBModal(cardHtml, cardClass, onDismiss)`
    (every dialog — `cardClass` is a `.modal-card` modifier like `narrow`/`slim`/`wide`/`center`;
    returns `{el, q(sel), close}`), `RBConfirm`/`RBNeedAuth` (built on RBModal, RBt-translated),
    `RBToast(msg)` (translated toast into the page's `#toast`), `RBApi(action, body)` (JSON POST
    to the API), `RBImg.toBlob/toDataURL` (client-side image downscale before upload/embed),
    `RBUpload(fields, file, name)` (image → `upload.php`), `RBDownload(blobOrUrl, name)`,
    `RBesc(str)` (HTML-escape), plus the global header/footer (minimal nav, full-viewport
    mobile menu), version auto-refresh and install button.
  - **`i18n.js`** (+ per-language `i18n.<lang>.js`): `RBt(key)` (translate; a missing key falls
    back to English, then to the key) + `data-i18n` / `data-i18n-html` / `data-i18n-ph` /
    `data-i18n-title` / `data-i18n-aria` / `data-i18n-tip` in HTML. Keep **every** language file
    (`es`/`it`/`de`/`fr`) at full key parity with the English source strings.
  - **`roadbook-core.js`** (`RB.*`): geo math, GPX/WPT parsing, `buildRoadbook`, metrics/CAPs,
    QR meta, signing. **`note-canvas.js`**: `NoteCanvas` editor + `NoteCanvas.toSVG` (the
    vignette, used by the Reader rows and the challenge page). **`rbmap.js`** (`RBMap`): MapLibre helper (Editor + Reader map).
    **`gps-meter.js`** (`RBGpsMeter`) + **`gpx-recorder.js`** (`RBGpxRecorder`): the shared
    GPS loop and crash-safe GPX logging (Reader · Tripmaster · Editor recording).
  - **`app.css`**: shared design system — buttons (`.btn*`), modals (`.modal`/`.modal-card`
    + modifiers/`.modal-in`), `.btnrow` + alignment modifiers, `.icon-accent`/`.icon-danger`,
    `.field-grid`, `.btn-group`, `.grow`, the note rows, etc.
- **Module shape.** Each page is one IIFE. Page-local-only helpers (`$`, `msg`) stay local
  and short; alias the globals at the top (`const t = RBt, esc = RBesc, toast = RBToast;`).
  Anything two pages share becomes an `RB*` global — that's the naming convention (no
  lowercase/per-file copies).
- **Consistent, explicit naming.** Follow the names already used in the codebase — don't
  invent a new convention each time. A name must say what the thing IS: `width` not `wd`,
  no cryptic abbreviations or one-letter mystery vars (loop indices aside). If you find
  something misnamed or inconsistent, rename it properly *everywhere* as part of your change. 
- **No inline CSS.** Styling lives in stylesheets with clear, descriptive class names -—
  never `style="…"` attributes in HTML or in JS-built markup. Inline styles are a bug.
- **Reuse CSS, don't multiply it — real DRY.** BEFORE adding a class, read the existing
  styles and reuse what fits. Name classes **abstractly** so they're reusable across features
  (`.btnrow.center`, `.icon-accent`, `.field-grid`) — never a throwaway class per feature.
  If two rules are nearly identical, factor the shared part out. Class names are explicit
  words, never abbreviations (`.icon-accent`, not `.ic-sand`). DRY is the priority — for
  real, not lip service.
- **DRY, clean, and LIFT.** Keep code DRY and readable; follow LIFT — **L**ocate code
  easily, **I**dentify it at a glance, keep structure **F**lat, **T**ry to stay DRY.
- **Refactor as you go.** When you touch an area, simplify and tidy it up; remove dead
  code and stale comments instead of leaving them.
- **Automated tests before manual testing.** Before asking the user to test a change by hand,
  ADD or extend automated tests (Vitest in `tests/`) that cover the change and get `npm test`
  green. Prefer testing pure logic in `roadbook-core.js` — and *extract* logic there so it is
  testable, rather than leaving it untestable inside a page IIFE. For server-side PHP or purely
  visual UI the harness can't unit-test, say so explicitly and state what you verified instead
  (`node --check`/PHP lint, a manual API call, etc.). Never hand off for testing with new,
  untested logic.
- **Commit messages are changelogs** — short English title + bullet points.

## Run locally
**Full stack (PHP 8.1 + MariaDB) in Docker — recommended:** `ddev start` then `ddev launch`
(first start installs Composer deps, seeds `config.js` from the example and applies every
`migrations/*.sql`; details in the README). Front-end only, no back-end:
```
cd public && python3 -m http.server 8000   # → http://localhost:8000/
```
`node --check <file>.js` for syntax. **Unit tests:** `npm install` then `npm test`
(Vitest + happy-dom). The suite covers the pure core of `roadbook-core.js` — geo math,
GPX/WPT parsing, `buildRoadbook`, metric/CAP recomputation, route ops, the GPX serializer,
the 49-char QR meta and its HMAC signing. `roadbook-core.js` stays a browser global
(`window.RB`) and additionally exports the same object to Node (`module.exports`) so the
tests can import it — no build step is introduced on the web. Tests live in `tests/`; CI
runs them on every push/PR via `.github/workflows/test.yml`.
`public/assets/js/config.js` (gitignored) holds the `signKey` (and optionally a MapTiler
style URL for satellite imagery; the base map runs on free, no-key MapLibre tiles)
(copy `config.js.example`). The PHP API needs a local PHP+MariaDB and an `.env`
(copy `.env.example`); migrations live in `migrations/`.

## Production DB (migrations + fresh pull)
Both prod-DB workflows — **pulling a fresh copy of prod into local dev** and
**applying a schema migration to prod** — go through the **VPS panel** with a
single key, the rdbk-scoped **`VPS_ADMIN_KEY`** (panel slug `rdbk`). That one key
covers DB dump + migrate; there is no separate dump secret. Keep it in
`.claude/settings.local.json` under `env` (gitignored) so Claude always has it;
the live value is handed over out-of-band (it is a secret, never in this public
repo), and the longer ops note `DB.md` is likewise private/gitignored.

**Fresh prod DB → local.** Replaces your local DB with a current copy of prod
(real users, roadbooks, photo metadata) — keep that copy private.
- **Mac (DDEV):** download from the panel dump route, then import:
  ```bash
  curl -fsSL -H "X-Admin-Key: $VPS_ADMIN_KEY" \
    https://alvarofranz.com/api/projects/rdbk/dump -o /tmp/rdbk-fresh.sql.gz
  ddev import-db --file=/tmp/rdbk-fresh.sql.gz && rm -f /tmp/rdbk-fresh.sql.gz
  ```
  or the helper that does exactly this: `bash bashy/pull-fresh-db-rdbk.sh`.
- **On the VPS (Blink/SSH dev box):** `dev-sync rdbk rdbk_dev` (clones prod into
  the on-box dev DB; no HTTPS round-trip).

**Migrations.** List pending and apply through the same panel key:
```bash
curl -fsS -H "X-Admin-Key: $VPS_ADMIN_KEY" \
  https://alvarofranz.com/api/projects/rdbk/migrations | jq '.parsed'
curl -sS -X POST -H "X-Admin-Key: $VPS_ADMIN_KEY" \
  https://alvarofranz.com/api/projects/rdbk/migrations/<file.sql>/apply | jq -r '.stdout // .'
```
or the helpers `bash bashy/migrations-pending-rdbk.sh` /
`bash bashy/migrations-apply-rdbk.sh <file.sql>`. The panel always takes a gzipped
`mysqldump` backup **before** applying, records each file's sha256 (refusing to
re-apply, or to apply a file edited after it was applied), and records success so
it never re-runs.

Golden rule for schema changes — **schema first, code second**: a new
column/table must exist in prod *before* the code that reads it ships, or
production login breaks. So a schema change ships on its own first (push the
migration-only `.sql` to `main`, which auto-deploys it, then apply it as above),
and only after that does the code that uses the column ship.

## Releasing
**Trunk-based: deploy by pushing `main`. That is the whole deploy step — there is no
manual server access and nothing else to run.** Work straight on `main`: commit, then
`git pull --ff-only` and `git push origin main` (rebase + retry if the push is rejected
as non-fast-forward; never force-push). The push triggers the **Deploy** GitHub Action
(`.github/workflows/deploy.yml`), which runs the unit tests and then fires the production
deploy hook via one authenticated POST; the endpoint and key are repository secrets
(`DEPLOY_URL` / `DEPLOY_KEY`, under Settings → Secrets and variables → Actions), so nothing
about the host is in this repo. You can also run it from the Actions tab
(`workflow_dispatch`). **On every release run `node source/stamp-version.mjs <version>`**
(e.g. `2026.06.13-1`) — it writes `public/version.json` (the app polls it and
force-refreshes every open client) AND stamps the `?v=` cache-buster on every first-party
script/style URL in the HTML, so each release gets fresh asset URLs through every cache
layer (browser, CDN edge, the host's static-file cache — which ignores `.htaccess` and
pins old JS for hours otherwise). Gitignored runtime files (`public/assets/fontawesome/`,
`public/assets/js/config.js`, `.env`, `vendor/`) are not in git and persist across deploys.
**Native app releases are separate** — built on a Mac (signed Android AAB / iOS via Xcode)
and uploaded to the stores; the web deploy serves `public/` and ignores the `android/`/`ios/`
projects. See `NATIVE.md`.

## The tools (`public/<tool>/`)
- **Editor** — the creation hub. Load from **GPX**, **Record route** (live GPS:
  accuracy-aware sampling, pause/resume, autosave/recovery, smoothing, altitude,
  geotagged photos via the camera, instant waypoints), **Draw on the map** (sketch a
  route from scratch), **`.rdbk`** or a public **roadbook**. Edit notes (text, road
  type, FIA danger grading `!`/`!!`/`!!!`, CAP, **waypoint type (`wp_type`) + validation
  radius**, declarative **speed limit** — which also tags the note a controlled zone, icons);
  drag a note on the map to
  reposition. **The GPX is edited ON the map** via a vertical tool bar (translated
  hover tooltips, maximizable): mode tools *pan · add note · draw (tap to extend the
  nearest open end) · cut (tap any two spots — the track is split exactly there,
  inserting points as needed; trims at the ends, and in the middle it leaves a real
  OPEN cut, dashed on the map, that you fill by drawing or that closes straight on
  export/save after a confirm)* plus
  one-shot *add GPX (smart join: detour-replace if both ends touch the route,
  otherwise auto-oriented join to the nearest end) · reverse · simplify
  (Douglas-Peucker, note anchors kept) · adjust on the trail (live re-record) ·
  undo/redo (debounced snapshots, Ctrl+Z/Y)*. Whatever the source pieces, the route
  is always ONE continuous track. Title, description,
  author, organization, event logo (downscaled, embedded) and a photo gallery;
  **Export `.rdbk`** (self-contained), **Export GPX** (track + notes as named
  waypoints) and **Save to profile** (public/private — saving pins `?rb=<id>` to the
  URL so re-saves update the same roadbook; importing fresh content starts a new
  one). Vignette editor in `note-canvas.js` (drag/scale/rotate/flip icons + junction
  vectors); searchable icon palette.
- **Recorder** — a standalone live-GPS route recorder (accuracy-aware sampling, pause/resume,
  crash-safe GPX, geotagged photos via the camera); signed-in, it saves the route as a draft
  roadbook to edit later. (The Editor's "Record route" is the same capture, done in-place.)
- **Reader** — the navigator. Paper-style white roadbook table: each note is a 4-column
  `.nrow` (total/partial + number · vignette via `NoteCanvas.toSVG` · comments · per-note
  buttons), colour-coded by state (reached green · skipped pink · active red border ·
  upcoming white · <50 m to next blue) with an optional per-note
  MapLibre mini-map; a note's FIA waypoint-type badge (`wp_type`) sits beside its number.
  Load a `.rdbk`, **one of your saved roadbooks** (signed-in) or a **public roadbook**. The
  start modal sets Trip vs Competition mode, the per-note map button and optional live GPX
  logging. Advancement is automatic by default (GPS marks a note on entering its **detection
  radius** — `RB.detectionRadius`: per-note `wp_radius` → `meta.default_wp_radius` → the type
  default → the system default `CONST.REACH_DEFAULT_M` (30 m)), with a live Auto on/off switch
  in the nav bar, or manual (tap "reached"). Competition validates with
  penalties + an HMAC-signed result QR; validating syncs the total odometer to the
  note's distance. Opens `.rdbk` from the OS on installed PWAs.
- **Tripmaster** — a GPS trip computer with no roadbook: total/partial odometer with
  ±10 m corrections and hold-to-reset, speed with configurable alert bands, heading,
  stopwatch, waypoint counter and crash-safe GPX recording; the session checkpoints
  to localStorage and resumes after a kill.
- **Ranking** — scan/paste result QRs, verify the signature, build accuracy / CAP /
  speed / regularity rankings + a final score; per-row delete and CSV export.
- **Public pages** — `/roadbooks/` lists every public roadbook (search + pagination) and the
  per-roadbook public view lives at `/challenge/<slug>` (read on site · Navigate · PDF export;
  a non-owner can't fork or download the `.rdbk`). The home shows a last-6 teaser linking there.

## Shared front-end (`public/assets/js/`)
- `roadbook-core.js` (`window.RB`) — backbone: geo math, `parseGPX`/`parseWPT`,
  `buildRoadbook`, `recomputeMetrics`/`recomputeCaps`, route ops
  (`simplifyTrack`/`simplifyRoadbook`, `reverseRoadbook`),
  `gpxDocument` (GPX 1.1 serializer, also used by the Reader's GPX logger),
  `parseOpenRally`/`openRallyDocument`, speed-limit helpers (`speedLimitFromName`/`speedLimitOfNote`),
  the FIA **waypoint-type** system (`WP_TYPES` catalog · `wpType`/`wpTypesForProfile`/`wpBadgeSVG` ·
  `detectionRadius` — the Reader's geofence radius), `buildMeta`/`parseMeta` (49-char QR),
  `signMeta`/`verifyMeta` (HMAC-SHA256), `iconSrc`, generic helpers (`filterByText`/`filterRoadbooks`,
  `deleteNote`, `pendingWork`), `CONST`, `ROAD_TYPES`.
- `note-canvas.js` — `NoteCanvas` (vignette editor) + the static render `NoteCanvas.toSVG`
  (the vignette, used by both the Reader rows and the challenge page).
- `rbmap.js` (`RBMap`) — MapLibre GL helper (track, waypoints, live recording, photo
  pins, draggable edit marker, satellite↔topo layer toggle). Used by the **Editor**
  (full editing) and the **Reader** (the interactive per-note map).
- `gps-meter.js` (`RBGpsMeter`) — the shared GPS dashboard loop (Reader + Tripmaster):
  position watch + wake lock, one clean `{here, disp, speedKmh, heading}` per fix. In the
  native app it uses RBNative's background-capable watch (logging survives a locked screen).
- `gpx-recorder.js` (`RBGpxRecorder`) — crash-safe GPX logging (Reader + Tripmaster):
  settings modal, localStorage checkpoint with recovery, live file handle, finished-track
  modal (download / convert into a roadbook).
- `challenges.js` (`RBChallenges`) — public roadbooks (DB-backed): `listPublic`/`loadPublic`/
  `pick` (picker), `publicFromUrl` (parses the friendly `/reader/<slug>` or `/editor/<slug>`).
  ("Challenge" stays the internal name + the `/challenge/<slug>` view route; the user-facing
  label is "public roadbook", with "challenge" reserved for the future events feature.)
- `i18n.js` (+ `i18n.es/it/de/fr.js`), `app.js` (global header/footer, SW + version
  auto-refresh, Install button, account control, styled modals), `config.js`, `qrcode.min.js`.

## Native apps (iOS + Android)
Capacitor wraps `public/` into native shells; the web stays the single source of truth.
Build/test/release steps are in `NATIVE.md`. Toolchain: Node ≥22 + JDK 21 (Capacitor 8).
- **Bridge.** `native/src/native.js` → `public/assets/js/native.bundle.js` (esbuild, `npm run
  build:native`; git-ignored). `app.js` loads it and adds `.native` to `<html>` **only inside
  the app**, so the PWA is byte-for-byte unchanged in a browser.
- **Background GPS** (the reason to go native): `RBGpsMeter` uses RBNative's foreground-service
  watch in the app, the Web Geolocation watch otherwise.
- **One contextual home:** `index.html` shows the marketing landing on the web and the
  field-tool launcher in the app — CSS toggles `.web-only`/`.app-only` via `.native`, no second
  page. App scope: **Reader · Editor · Tripmaster · Recorder · Ranking** — all tools available in the app.
- **Auth:** the app signs in with a Bearer token (`migrations/006_api_tokens.sql`, stored
  client-side); the web keeps its httponly session cookie. `RBApi`/`RBUpload` attach the token
  only inside the app.
- **Projects:** `android/` is committed (build artifacts git-ignored); generate iOS with
  `npx cap add ios` on a Mac with Xcode.

## The `.rdbk` format (open standard, documented at /standard)
One self-contained UTF-8 JSON file (MIME `application/x-roadbook`). **All distances are
integer metres.** Spec page: `public/standard/index.html`.
```jsonc
{
  "meta":  { "title": str, "total_distance": int, "note_count": int, "description"?: str,
             "author"?: str, "organization"?: str, "modified"?: str /* YYYY-MM-DD */,
             "logo"?: str /* base64 data: URI, embedded like the icons */,
             "map_access"?: bool /* may the Reader show a map? absent/true = yes, false = hidden */,
             "profile"?: "basic"|"rally" /* waypoint-type vocabulary scope; absent = basic */,
             "default_wp_radius"?: int /* roadbook-wide default validation radius (m) for waypoints without their own */ },
  "track": [ { "lat": float, "lon": float, "ele"?: int, "t"?: int /* fix time epoch ms UTC, kept from a recording */ } ], // ordered polyline
  "notes": [ {
    "num": int, "idx": int,                                   // idx → index into track[]
    "lat": float, "lon": float,
    "distance": int, "partial_distance": int,                 // metres
    "text": str,
    "cap": int|null, "cap_distance": int|null,                // CAP heading (deg) + metres
    "cap_type"?: "exit"|"average"|"calculated"|"turning",     // FIA CAP qualifier (exit = default); rendered next to the CAP
    "bearing_in": float, "bearing_out": float,
    "road_type_in": 0..4, "road_type_out": 0..4,
    "speed_limit"?: int,                                      // declarative limit km/h (0 = lifted); preferred over an S*km symbol name
    "danger"?: 1..3,                                          // FIA grading → red ! / !! / !!! in the vignette
    "wp_type"?: str,                                          // FIA waypoint type (RB.WP_TYPES: masked|control|security|navigation|precise|visible|eclipse + start/finish/zone/control markers); editor badge + GPX sym
    "wp_radius"?: int,                                        // per-note validation radius (m); falls back to meta.default_wp_radius then the type default (Reader use is deferred — issue #87)
    "icons": [ { "name": "x.svg", "pos": [x,y], "angle": deg, "size": n, "flip_x": bool } ],
    "junctions": null | [ { "pivot": [x,y], "tip": [x,y], "width": n, "road_type": 0..4 } ]
  } ],
  "icons": { "x.png": "data:image/png;base64,…" }             // EVERY used symbol, embedded
}
```
- Symbols sit on a **230×162** box; origin = centre, **+y up**; `angle` clockwise.
- **Self-contained rule:** a writer MUST embed every used symbol in top-level `icons`.
  `RB.iconSrc` resolves: inline `data:` → `rb.icons` → `assets/icons/` (standard palette).
- ROAD_TYPES: 0 default · 1 motorway · 2 asphalt · 3 track · 4 off-piste (dashed).
  Speed limits encoded in symbol names (`S03_30km` ⇒ 30, `S99_end` clears).
- Standard palette (`public/assets/icons/` + `index.json`): roadbook pictograms (PNG)
  plus a Vienna-Convention EU traffic-sign set (SVG: warning `W*`, priority `B*`,
  prohibitory `C*`/`S*`, mandatory `D*`). The sign set was produced by a generator script
  that is LOCAL-ONLY (`source/` is gitignored except `stamp-version.mjs`), so a fresh
  clone doesn't have it: edit the committed SVGs directly, keeping the change minimal and
  the set stylistically consistent. The palette is **canonical**: the Editor refreshes the
  used standard icons embedded in a roadbook on open and on save/export (#174), so art
  updates propagate to older roadbooks; custom (user-uploaded) icons are never touched.
- Photos are an **app feature only** (stored server-side, geotagged), never in the `.rdbk`.

## Conventions
- Tool pages are one level deep → relative `../assets/…`; the challenge page uses
  absolute `/assets/…`. `[hidden]{display:none!important}` in `app.css`.
- Header and footer are rendered globally by `app.js` — pages ship empty `<header
  class="topbar">`.
- Keep the data model in clean English (no camelCase beyond unavoidable; metres, not km).
- **"A destra" / right placement = top-right, on the title's row.** When the user asks to put
  something "a destra" (to the right) — a header CTA, a claim/banner link, an action — they mean
  the **top-right of that section, on the SAME row as the heading** (title left, action right),
  **not** below it. Lay it out with a flex row (`justify-content: space-between`,
  `align-items: flex-start`); if the container is a `flex-direction: column` block (e.g.
  `.rbp-head`), override it to `row` or the action stacks under the title.
- **Icon consistency — one canonical FontAwesome icon per tool, everywhere.** A tool must use
  the SAME icon across the home workflow step, its Features card, its `/features/<tool>/` page
  and the native launcher — never a different glyph for the same tool. Canonical set: **Track
  Recorder** `fa-circle-dot` · **Roadbook Editor** `fa-pen-ruler` · **Roadbook Reader**
  `fa-compass` · **Tripmaster** `fa-gauge-high` · **Event classification (Ranking)**
  `fa-ranking-star`. The two-level-deep `/features/<tool>/` pages use `../../assets/…`.
