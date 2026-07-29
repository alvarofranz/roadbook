# RDBK.app

A free PWA suite for **digital roadbooks** for any adventure (4x4, moto, bike,
running…), plus the open **`.rdbk`** file format. Live at **https://rdbk.app/**.

This file is the full reference for any agent working in this repo. **`AGENTS.md`** (root,
Italian) is a short OpenCode-specific pointer file — it links back here for everything except
a handful of things an OpenCode agent would otherwise get wrong; keep the two in sync when
either changes (in particular Sicurezza/i18n/Branch e PR/Test e lint/Versioni e deploy/API
DB/Convenzioni rapide below have counterparts there).

- **One codebase → four surfaces:** the same `public/` ships as the **website**, an
  **installable PWA**, and native **iOS** + **Android** apps.
- Front-end: vanilla HTML/CSS/JS PWA, web root `public/` (no build step on the web).
- Native apps: the same `public/` is wrapped by **Capacitor** into iOS + Android. The only
  built artifact is the native bridge (`native/src/native.js` → `public/assets/js/native.bundle.js`,
  esbuild). Both stores ship via CI, fanning out **automatically with the web deploy on a
  version bump**: Android via GitHub Actions → Play, iOS via Xcode Cloud → TestFlight (a merge to
  `main` that bumps `version.json` emits all three; see **Releasing**). See **Native apps** below
  and `NATIVE.md`.
- Back-end: small PHP 8.1 + MariaDB API under `public/api/` (+ logic in `app/`) for
  accounts, per-user roadbook storage, photos and public roadbooks. Config via `.env`
  (phpdotenv). The front-end works fully without it; the API only adds accounts/sharing.
- **Sign-in:** email/password, **Google Sign-In** (#46) or **Sign in with Apple** (#370 — App Store
  guideline 4.8 requires it next to Google). Both social flows verify their identity token
  server-side, then share one tail: `social_auth` (`app/auth.php`) links the identity by
  `google_sub`/`apple_sub`, or to an account with the same verified email, or creates a passwordless
  account — always after a **probe** phase that shows the user which email is about to be used.
  `google_auth` verifies with Google's tokeninfo; `apple_auth` verifies the RS256 JWT itself against
  Apple's JWKS. The web renders each provider's own button (GIS overlay · Apple JS popup); the app
  uses the OS sheets (`RBNative.googleSignIn`/`appleSignIn`, `@capgo/capacitor-social-login` — the
  web SDKs can't run in a WebView), and Apple is iOS-only there. `.env`: `GOOGLE_CLIENT_IDS` lists
  every OAuth client whose tokens the backend accepts as `aud` (web + Android + iOS — the client ids
  are public, in `native/src/native.js`); `APPLE_SERVICE_ID` (web Services ID, also drives the web
  button) + `APPLE_APP_ID` (iOS bundle id) are the accepted Apple audiences, each optional so a
  surface's button only appears once it is configured.
  DB schema = `migrations/*.sql` (source of truth): `users`, `roadbooks`, `roadbook_photos`,
  `roadbook_audio`, `roadbook_locks`, `api_tokens`, `activity_log`, `settings`, plus the events
  family (`events`, `event_roadbooks`, `event_categories`, `event_organizers`, `event_participants`).
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
- **NEVER SYNC OR RESET THE LOCAL DDEV ENVIRONMENT WITHOUT ASKING FIRST — EVERY SINGLE TIME.**
  ANY refresh of DDEV from prod or from `main` — importing a DB dump, pulling media/roadbook
  files, `ddev import-db`, wiping/recreating the DB, `git reset --hard origin/main` over the
  working tree — **MUST be proposed and explicitly approved by the user BEFORE it runs**. These
  sync threads burn a LOT of time, are almost never actually needed for the task at hand, and they
  DESTROY the untracked local data (test roadbooks, drafts, photos, voice notes that exist
  nowhere else — half the DDEV content is simply gone afterwards, and the DB dump carries no
  files, so what it replaces is not even restored). When you think a sync is needed: say why, say
  exactly what would be overwritten, and WAIT for a yes. Default answer is NO SYNC — work with
  the data that is already there.
- **Edit freely, but WAIT for the user's test confirmation before deploying.** You may read and
  modify the code in the dev clone as needed. But do NOT commit/stamp/push (a push to
  `main` is a production deploy) until the user has tested the change (the dev clone serves the
  working tree at `http://localhost:8806` via the SSH forward) and given an explicit go-ahead. Make
  the change, say what to test, then stop — never pre-emptively deploy, even when the user asked
  for the feature.
- **PRIORITY — start from a fresh `main`.** Before making ANY change, sync the working
  copy: `git fetch origin && git reset --hard origin/main`. Production deploys hard-reset
  to `origin/main`, so never work on (or push) a stale/divergent copy — your edits would
  be discarded or clobber someone else's.
- **A `fix:` request → open the issue and start it immediately.** When the user prefixes a
  request with `fix:`, treat it as a bug to formalize: FIRST create a GitHub issue for it
  (`gh issue create --repo alvarofranz/roadbook` — clear English title + the reported behavior
  and the expected fix), THEN immediately assign it and mark it in progress, all before writing
  any code. Only after that do you fix it, under the normal flow (test hand-off before deploy;
  drop the WIP tag when it ships to prod).
- **"do #<n>" → assign it + mark in progress before writing code.** When the user asks you to
  work on an existing issue (e.g. "do #236", "complete #239", "implement #42") — or any time
  you take on an issue — claim it FIRST, before any scoping or code: run
  `gh issue edit <n> --repo alvarofranz/roadbook --add-assignee @me --add-label "in lavorazione"`.
  This assigns the real person (never a hard-coded name) and signals to others that it's being
  worked on. Only after that do you read the issue and write code.
- **Never work an issue in parallel with its current assignee — raise the flag first.** BEFORE
  starting on an issue, check its assignee / `in lavorazione` label. If it is already assigned to
  someone else (e.g. Álvaro picks up an issue currently assigned to Maurizio, or vice-versa), you
  MUST **claim it first** — reassign it to yourself AND leave a short comment ("taking this over,
  implementing X") — so the previous owner sees the flag and stops, instead of both building the
  same thing and colliding on `main`. That signal (the reassignment + comment) is the "semaforo":
  raise it before writing code, never discover the overlap after the fact.
- **Committing an issue's fix to prod → drop the WIP tag.** Remove the `in lavorazione` label
  the moment the fix ships to production (a prod deploy = a push to `main`) — that is when it
  stops being "in progress". GitHub does NOT auto-remove labels, so clear it explicitly:
  `gh issue edit <n> --repo alvarofranz/roadbook --remove-label "in lavorazione"`. When you
  also close the issue, do it in the same step: `gh issue close <n> --repo alvarofranz/roadbook`.
  The `in lavorazione` label must reflect only what is genuinely being worked right now — never
  an issue whose fix is already deployed (or closed).
- **Epic sub-issues → update the parent epic when a sub-issue closes.** When closing a
  sub-issue of an epic, drop a short comment on the parent epic listing what shipped
  and what remains: `gh issue comment <epic> --repo alvarofranz/roadbook --body "…"`.
  The comment must name the closed sub-issue and list every still-open sub-issue so the
  next person knows exactly what to pick up. Do this in the same step as closing the
  sub-issue — never leave the epic stale.
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
    to the API), `RBConfig()` (the `config` call with an **offline fallback** — caches the signed-in
    user so the account menu + capture buttons survive no connectivity; use it, not a bare
    `RBApi('config')`, wherever sign-in state drives the UI), `RBImg.toBlob/toDataURL` (client-side image downscale before upload/embed),
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
    **`rb-media-queue.js`** (`RBMediaQueue`): offline-first buffering of geotagged photos +
    voice notes (blobs in IndexedDB) with deferred upload + retry (Recorder; Editor recording
    next).
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
- **Automated tests before manual testing — and they run in DDEV.** Before asking the user to
  test a change by hand, ADD or extend automated tests (Vitest in `tests/`) that cover the change
  and get `ddev exec npm test` green. **Every local test/lint command runs inside the DDEV web
  container** (`ddev exec …`), never on the host — the container is the one pinned toolchain
  (PHP 8.4 · Node 24 · MariaDB 10.11), so a green run there means the same thing for everyone
  and matches CI. Prefer testing pure logic in `roadbook-core.js` — and *extract* logic there so
  it is testable, rather than leaving it untestable inside a page IIFE. For server-side PHP or
  purely visual UI the harness can't unit-test, say so explicitly and state what you verified
  instead (`ddev exec node --check`/PHP lint, a manual API call, etc.). Never hand off for
  testing with new, untested logic.
- **After making changes, list what to test.** Before asking the user to deploy, propose a
  short checklist of specific things they should verify on the dev clone (`http://localhost:8806`):
  what pages to visit, what interactions to try, and what the expected result is. Keep it
  concrete — name the URLs and the visible behaviour to check.
- **Commit messages are changelogs** — short English title + bullet points.
- **Every deploy updates the docs too.** Before pushing a change to `main`, check whether it
  makes any documentation stale and update it in the same release: the architecture docs in
  `docs/*.md`, and the user-facing pages when relevant — the `.rdbk` spec at `/standard`
  (`public/standard/`), the privacy policy (`public/privacy/`), the feature/guide pages. Docs
  drift is a bug: a change isn't done until the docs describing it read as the current reality.

## Run locally
**Full stack (PHP 8.1 + MariaDB) on the VPS dev clone:** development happens on the box in a
dev clone next to prod — `/home/rdbk/dev/rdbk` (dev DB `rdbk_dev`), served privately on
`127.0.0.1:8806`, loopback-only: view it from the box itself with
`dev-shot http://localhost:8806/ out.png` (headless Chromium) or `curl -s http://localhost:8806/`. Prod
stays untouched at `/home/rdbk/rdbk`. The dev clone reuses rdbk's prod PHP-FPM pool (same
user), so the full stack is just the clone served on `127.0.0.1:8806` plus the `rdbk_dev` DB
seeded via `dev-sync rdbk rdbk_dev` (see *Production DB* below). In the dev clone `vendor`,
`config.js` and `fontawesome` are copied from prod, the DB name comes from `.env` `DB_NAME`,
and `BASE_URL=http://localhost:8806`. Edit the working tree, check `http://localhost:8806`
from the box (`dev-shot`/`curl`), and only push once the user has tested (see *Releasing*).
The dev clone on the box IS where the app is *served and exercised by hand*; the **DDEV project
(`.ddev/config.yaml`, `https://rdbk.ddev.site`) is where the automated tests run** — see *Tests
and lint* below.

`public/assets/js/config.js` (gitignored) holds the `signKey` (and optionally a MapTiler
style URL for satellite imagery; the base map runs on free, no-key MapLibre tiles)
(in the dev clone it is copied from prod, like `vendor/` and `fontawesome`). DB schema lives
in `migrations/`; the clone runs on prod's PHP-FPM pool and its own `.env` (DB_NAME
`rdbk_dev`, BASE_URL `http://localhost:8806`).

**On-box browser tools** — use them only when the task really needs to see or drive the
page (`curl` first, it's cheaper): `dev-shot <url> [out.png]` screenshot ·
`dev-shot --console <url>` JS console + uncaught errors · `dev-shot --dom <url>` rendered
post-JS DOM · `dev-drive <script.js>` interactive headless browser (puppeteer-core) to log
in as a user, click, fill forms — the script exports
`module.exports = async (page, browser) => {…}` and the page's console/errors are echoed
automatically.

## Tests and lint (always through DDEV)
**ALL local tests and lints run inside the DDEV web container — never on the host.** The
container carries the pinned toolchain (PHP 8.4 · Node 24 · MariaDB 10.11), so everyone's run is
identical and matches CI; a host Node of another version is not a valid way to check a change.
```bash
ddev start                      # once per session, if the project isn't up (ddev describe to check)
ddev exec npm install           # first run / after a package.json change
ddev exec npm test              # Vitest + happy-dom — the suite that must be green before hand-off
ddev exec npm run check         # syntax-check the whole codebase (source/check-syntax.mjs)
ddev exec node --check public/event/event.js   # one file
```
The suite covers the pure core of `roadbook-core.js` — geo math,
GPX/WPT parsing, `buildRoadbook`, metric/CAP recomputation, route ops, the GPX serializer,
the 55-char QR meta and its HMAC signing. `roadbook-core.js` stays a browser global
(`window.RB`) and additionally exports the same object to Node (`module.exports`) so the
tests can import it — no build step is introduced on the web. Tests live in `tests/`; CI
runs them on every push/PR via `.github/workflows/test.yml`.

## Production DB (migrations + fresh dev DB)
Three prod-DB workflows: **reseeding the dev DB from a fresh copy of prod**, **refreshing the
local DDEV stack with prod data** and **applying a schema migration to prod**. The dev DB reseed
runs entirely on the box (`dev-sync`, below — no panel, no key); the local DDEV refresh and
**migrations** go through the **VPS
panel** with the rdbk-scoped **`VPS_KEY`** (panel slug `rdbk`); that one key
covers the panel's migrate + dump routes — there is no separate dump secret. Keep it
in `.claude/settings.local.json` under `env` (gitignored) so Claude always has it,
and the bashy helpers read the same key from `bashy/config-rdbk.sh` (gitignored, sets
`VPS_KEY`). The live value is handed over out-of-band (it is a secret, never in this public
repo), and the longer ops note `DB.md` is likewise private/gitignored.

**Fresh dev DB → reseed from prod.** Replaces the `rdbk_dev` DB with a current copy of prod
(real users, roadbooks, photo metadata) — keep that copy private. On the box (Blink/SSH):
```bash
dev-sync rdbk rdbk_dev
```
An instant local `mysqldump | mysql` — no HTTPS round-trip. `dev-sync` is write-guarded: it
refuses any target DB not ending in `_dev`, so prod is only ever read, never a write target.
To test a schema change against dev before it ships, apply one file to the dev DB with
`dev-migrate rdbk_dev <file.sql>` (throwaway — no panel, no backup; prod is never touched).
DB access on the box is the native `mariadb` client.

**Refresh the local DDEV stack with prod data — ASK THE USER FIRST, ALWAYS (see the working
guideline above): it wipes untracked local data and is rarely needed. TWO steps, DB *and*
files.** The panel dump is
**DB-only**: roadbook payloads live on disk (`storage/users/<user_id>/<id>.rdbk`,
`app/roadbooks.php`) with photos in `public/photos/<id>/` and voice notes in `public/audio/<id>/`.
Import the dump alone and every row points at a file that isn't there — the API answers
`{"ok":false,"error":"File missing."}` on every roadbook. So:
```bash
# 1. DB — dump from the panel (key: see DB.md), import, then DELETE the file
curl -fsSL -H "X-Admin-Key: $VPS_KEY" \
  https://alvarofranz.com/api/projects/rdbk/dump -o ~/rdbk-fresh.sql.gz
ddev import-db --file=~/rdbk-fresh.sql.gz && rm -f ~/rdbk-fresh.sql.gz

# 2. files — for each PUBLIC roadbook, pull the payload prod already serves publicly
#    (repeat per slug from `public_list`; same idea for /photos/<id>/<file>,
#     /audio/<id>/<file> and /event-logos/<id>.avif)
curl -s -X POST https://rdbk.app/api/index.php -H 'Content-Type: application/json' \
  -d '{"action":"public_get","slug":"<slug>"}' | jq -c '.roadbook' \
  > storage/users/<user_id>/<id>.rdbk
```
The dump holds real emails + password hashes — keep it private and delete it right after
importing. Step 2 only reaches **public** roadbooks; drafts have no public URL and the panel has
no file route, so their pages stay "File missing" locally until someone `rsync`s
`storage/users/`, `public/photos/` and `public/audio/` off the prod host.

Verify with the API, not by eye: `public_list` should return prod's ids and `public_get` on a
slug should come back `ok` with the note/track counts prod reports. If the site still shows stale
data, check that the ddev CLI and the browser are talking to the SAME containers — compare the
ports in `ddev describe` with `docker ps`; a second web+db pair over the same folder (its own
database, `ddev exec` hitting one while `https://<project>.ddev.site` serves the other) looks
exactly like an import that "didn't work". Fix it with `ddev poweroff` + one `ddev start`.

**Migrations.** List pending and apply through the same panel key:
```bash
curl -fsS -H "X-Admin-Key: $VPS_KEY" \
  https://alvarofranz.com/api/projects/rdbk/migrations | jq '.parsed'
curl -sS -X POST -H "X-Admin-Key: $VPS_KEY" \
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
**Deploy = a commit landing on `main`, and `main` is a PROTECTED branch: NO direct pushes for
ANYONE — not collaborators, not admins, not this agent. Every change ships through a pull
request, even a one-line fix and even your own** (a direct `git push origin main` is rejected
with `GH006: … Changes must be made through a pull request`). Self-approval / self-merge IS
allowed (0 required approvals), so the flow is: branch → commit → `git push -u origin <branch>`
→ `gh pr create` → `gh pr merge <n> --merge --delete-branch`. The merge's push to `main` is what
triggers the **Deploy** GitHub Action — there is no manual server access and nothing else to run.
(Force-push and deletion of `main` are also blocked. If you ever need to change this protection,
it's set via `gh api ... /branches/main/protection`.) The Deploy Action
(`.github/workflows/deploy.yml`), which runs the unit tests and then fires the production
deploy hook via one authenticated POST with the commit SHA; the endpoint and key are repository secrets
(`DEPLOY_URL` / `DEPLOY_KEY`, under Settings → Secrets and variables → Actions), so nothing
about the host is in this repo. You can also run it from the Actions tab
(`workflow_dispatch`).

**The deploy SERVER must run `stamp-version.mjs` after checkout** so every deployment gets a fresh
build number and updated `?v=` cache-busters. Add this to the server-side deploy script:
```
node source/stamp-version.mjs "$(jq -r .version public/version.json)"
```

**On every web release run `node source/stamp-version.mjs <MAJOR.MINOR.PATCH>`**
(e.g. `1.1.0`) — it writes `public/version.json` (the app polls it and
force-refreshes every open client) AND stamps the `?v=` cache-buster on every first-party
script/style URL in the HTML, so each release gets fresh asset URLs through every cache
layer (browser, CDN edge, the host's static-file cache — which ignores `.htaccess` and
pins old JS for hours otherwise). Gitignored runtime files (`public/assets/fontawesome/`,
`public/assets/js/config.js`, `.env`, `vendor/`) are not in git and persist across deploys.

**Versioning — one semver everywhere, an auto-growing build per surface.** The **version** is
`MAJOR.MINOR.PATCH` (semver) and is the ONE human-facing number — identical on the web footer,
the Android `versionName` and the iOS `MARKETING_VERSION`. You bump it deliberately. Alongside it
each surface keeps a **build number that only ever grows** (the stores require it): `version.json`
carries `{version, build}` where `stamp-version.mjs` auto-increments `build` every run (it drives
the web cache-buster + the PWA force-refresh, so a same-version redeploy still refreshes clients);
Android's `versionCode` = `MAJOR*10000 + MINOR*100 + PATCH` (so it climbs with the semver, always
above the last upload); iOS's `CFBundleVersion` = Xcode Cloud's monotonic `CI_BUILD_NUMBER`. Never
lower the semver, never reset a build counter.

**Native releases fan out automatically with the web deploy — all three ship together, gated on a
version bump.** A push to `main` (i.e. a merged PR) whose `public/version.json` **version changed**
IS a release: the **Deploy** workflow ships the web AND (because the version bumped) the Android
workflow builds + uploads to Play, and the Deploy workflow pushes the `ios-<version>` tag that
Xcode Cloud picks up for TestFlight. A merge that does NOT bump the version just deploys the web —
no native build (which also avoids a duplicate Play `versionCode`, which Play rejects). **So the
whole release flow for anyone (incl. Maurizio) is: `node source/stamp-version.mjs <X.Y.Z>` → commit
→ branch → PR → merge. That single merge emits web + Android + iOS at the same semver.** No tags to
push by hand. (`version.json` is the single source of truth: Android reads `versionName`/`versionCode`
from it — `MAJOR*10000+MINOR*100+PATCH` for the code; iOS's `ci_pre_xcodebuild.sh` reads the semver
from the `ios-<version>` tag and takes `CFBundleVersion` from `CI_BUILD_NUMBER`.) A manual override
is still possible — push an `android-<X.Y.Z>` / `ios-<X.Y.Z>` tag, or run the Android workflow via
`workflow_dispatch` — to re-cut a build without a fresh bump. The Android build then appears under
**Closed testing – Alpha** in the Play Console; promote Closed → Production there when ready. Note:
a new personal Play account keeps Production **locked** until it has run a closed test with **≥12
testers opted in for 14 days** — testers are managed on the closed track itself (add them any time,
independent of the current build). The web deploy serves `public/` and ignores the `android/`/`ios/`
projects. See `NATIVE.md`.

## Email (`info@rdbk.app`)
The public contact address is a **forward-only alias** — no mailbox, no IMAP, no
webmail. It lives on the production host's existing postfix (Virtualmin → virtual
server `rdbk.app` → Mail Aliases; set up 2026-07-05) and forwards to the admin's
private inbox. DNS was already in place in Cloudflare: `MX 5 mail.rdbk.app`
(DNS-only, not proxied) + SPF.

Operational notes:
- Outbound SMTP on the host is pinned to IPv4 (`smtp_address_preference=ipv4`)
  because Gmail hard-rejects the host's IPv6 (no PTR/auth). Don't undo that.
- Forwarding preserves the original envelope sender, so inbox placement relies on
  the *original sender's* DKIM signature surviving the relay — true for every major
  provider. Rare unsigned senders can bounce with Gmail `5.7.26`; if that ever hits
  legitimate mail, the upgrade path is SRS (`postsrsd`).
- The app does **not** send mail as `@rdbk.app`. Before it ever does, publish the
  host's DKIM TXT for `rdbk.app` into Cloudflare (the key currently exists only in
  the host's local DNS zone) — otherwise signatures will be unverifiable.

## The tools (`public/<tool>/`)
- **Editor** — the creation hub. Load from **GPX**, **Draw on the map** (sketch a
  route from scratch), **`.rdbk`** or a public **roadbook** — and the Recorder hands its
  live capture straight in (`?trip=1`). Edit notes (text, road
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
- **Recorder** — THE live-GPS route recorder (accuracy-aware sampling, pause/resume,
  crash-safe GPX, geotagged photos + voice notes via the camera/mic); signed-in, it saves the
  route as a draft roadbook to edit later. Recording a new route lives here only; the
  Editor's recording bar serves just "Adjust on the trail".
- **Reader** — the navigator. Paper-style white roadbook table: each note is a 4-column
  `.nrow` (total/partial + number · vignette via `NoteCanvas.toSVG` · comments · per-note
  buttons), colour-coded by state (reached green · skipped pink · active red border ·
  upcoming white · <50 m to next blue) with an optional per-note
  MapLibre mini-map; a note's FIA waypoint-type badge (`wp_type`) sits beside its number.
  Load a `.rdbk`, **one of your saved roadbooks** (signed-in) or a **public roadbook** (the
  landing shows the "Open from" chooser + the public gallery inline). Opening one shows a
  **read-only preview** first (`body.rb-preview`: the note list, no GPS, tab bar still visible) —
  you might only want to look; the **"Navigate"** button is what opens the mode chooser. That
  modal sets Trip vs Competition mode, the per-note map button and optional live GPX logging, then
  navigation starts (`body.rb-immersive`: the tool owns the screen, tab bar hidden). Advancement
  is automatic by default (GPS marks a note on entering its **detection
  radius** — `RB.detectionRadius`: per-note `wp_radius` → `meta.default_wp_radius` → the type
  default → the system default `CONST.REACH_DEFAULT_M` (30 m)), with a live Auto on/off switch
  in the nav bar, or manual (tap "reached"). Competition validates with
  penalties + an HMAC-signed result QR; validating syncs the total odometer to the
  note's distance. Opens `.rdbk` from the OS on installed PWAs.
- **Tripmaster** — a GPS trip computer with no roadbook: total/partial odometer with
  ±10 m corrections and hold-to-reset, speed with configurable alert bands, heading,
  stopwatch, waypoint counter and crash-safe GPX recording; the session checkpoints
  to localStorage and resumes after a kill.
- **Ranking** — scoped to ONE competition roadbook inside an event: reached only via
  `/ranking/?event=<slug>&rb=<slug>` (the per-roadbook links on the event page), and gated to the
  event's participants/organizers. Scan/paste result QRs, verify the signature (each result QR
  carries the roadbook's slug prefix so a QR from another roadbook is rejected), build accuracy /
  CAP / speed / regularity rankings + a final score; organizers get per-row delete and CSV export.
- **Public pages** — `/roadbooks/` lists every public roadbook (search + pagination) and the
  per-roadbook public view lives at `/challenge/<slug>` (read on site · Navigate · PDF export;
  a non-owner can't fork or download the `.rdbk`). The home shows a last-6 teaser linking there.
- **Events** — `/events/` lists public events and `/event/<slug>` is the event view
  (categories, organizers, linked roadbooks). Participants join as *pending* and are activated
  by the organizer (QR token or the admin panel); `/go/<code>` is the participant deep link
  (auto-join + redirect). Admin side under `/admin/events/`. Tables: the `events` family in
  `migrations/`.

## Shared front-end (`public/assets/js/`)
- `roadbook-core.js` (`window.RB`) — backbone: geo math, `parseGPX`/`parseWPT`,
  `buildRoadbook`, `recomputeMetrics`/`recomputeCaps`, route ops
  (`simplifyTrack`/`simplifyRoadbook`, `reverseRoadbook`),
  `gpxDocument` (GPX 1.1 serializer, also used by the Reader's GPX logger),
  `parseOpenRally`/`openRallyDocument`, speed-limit helpers (`speedLimitFromName`/`speedLimitOfNote`),
  the FIA **waypoint-type** system (`WP_TYPES` catalog · `wpType`/`wpTypesForProfile`/`wpBadgeSVG` ·
  `detectionRadius` — the Reader's geofence radius), `buildMeta`/`parseMeta` (55-char QR,
  incl. the `rb` roadbook slug-prefix field), `metaRbPrefix`,
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
- `rb-media-queue.js` (`RBMediaQueue`) — offline-first media queue (#147): geotagged photos +
  voice notes buffered as blobs in IndexedDB, uploaded to the server with retry (auto-flush on
  `online` + resume across reloads/crashes). `add(kind, blob, fields, name, token)` ·
  `items()` (queued records, for a local export) · `clear()` · `flush()` (drain now, e.g. once a
  draft exists after sign-in) · `init({onDone, onChange, resolveRoadbook})`. Items may be enqueued without a `roadbook`; the
  `resolveRoadbook` hook supplies one at flush (draft created lazily, signed-in). Signed-out
  captures stay local and are bundled into a self-contained `.rdbk` (RBZip). Pure `createQueue`
  core (module.exports) is unit-tested; used by the Recorder (Editor recording next).
- `challenges.js` (`RBChallenges`) — public roadbooks (DB-backed): `listPublic`/`loadPublic`/
  `pick` (picker), `publicFromUrl` (parses the friendly `/reader/<slug>` or `/editor/<slug>`).
  ("Challenge" stays the internal name + the `/challenge/<slug>` view route; the user-facing
  label is "public roadbook", with "challenge" reserved for the events feature.)
- `rb-transcribe.js` (`RBTranscribe`, #133) — in-browser voice-note→text (Whisper via
  transformers.js/WASM, imported from a CDN only on first use; `Xenova/whisper-tiny`, browser-cached).
  `run(url, {lang, onProgress})` → text; no server, audio never leaves the device. Used by the
  Editor's per-voice-note "➜ text" button (appends to the note, never overwrites). Desktop-only:
  gated off on iOS/iPadOS (`RBIsIOS()`, app.js) since WebKit can't run the model (#340).
- `i18n.js` (+ `i18n.es/it/de/fr.js`), `app.js` (global header/footer, SW + version
  auto-refresh, Install button, account control, styled modals), `config.js`, `qrcode.min.js`.
- `i18n-edit.js` (`#118`, admin-only) — in-context UI translation editor. `app.js` loads it
  ONLY for admins; dormant until edit mode is toggled on (the floating language chip). In edit
  mode every translatable label (`data-i18n*`) is editable in place — the bottom bar edits all of
  the page's labels, right-click edits a single one — with a live preview. Edits accumulate in
  `localStorage` across pages; **Export** produces a paste-ready DELTA of the changed keys per
  language to commit into `i18n.<lang>.js` (Option B: nothing served from a DB at runtime).

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
  page. The launcher is the app's opening screen (one tile per section, explained); there is no
  "home" button back to it — navigation is the bottom tab bar.
- **Navigation — one section catalog, two presentations (`SECTION`/`WEB_NAV`/`APP_TABS` in
  `app.js`).** Sections: **Recorder · Editor · Navigate · Events · Profile** (bottom bar) plus
  **Roadbooks** (web top nav only). *Desktop web* renders the top bar (the Recorder is a
  top-level entry; Reader + Tripmaster collapse into a single **Navigate** entry → the `/navigate/`
  hub). *Every mobile-width
  view — web, PWA and the native app alike* — hides the top bar and shows a fixed icon-only
  **bottom tab bar** (Instagram-style); there is no hamburger/full-screen menu. "Navigate" covers
  `/tripmaster/` + `/reader/`; "Events" covers `/event/` + `/ranking/` (Ranking has no nav entry of
  its own — it opens per competition roadbook from the event page). The **language is
  browser-detected** and only changed at the bottom of the Profile page
  (no picker in the nav). The site footer is hidden on mobile (its About/Privacy/Terms links move
  to the Profile page); Install + unsaved-work chips float above the tab bar.
- **Auth:** the app signs in with a Bearer token (`migrations/006_api_tokens.sql`, stored
  client-side); the web keeps its httponly session cookie. `RBApi`/`RBUpload` attach the token
  only inside the app.
- **Backend host + CORS:** the app's bundled UI runs at a WebView-local origin with no backend, so
  `app.js` sets `RB_API_ROOT = https://rdbk.app/` and every API/upload/live-version call goes there
  **cross-origin**. The server whitelists the app origins (`cors_for_app` in `app/bootstrap.php` —
  CORS headers + preflight; `require_same_origin` exempts them, still Bearer-gated); `version.json`
  gets `Access-Control-Allow-Origin: *` in `public/.htaccess`. The cookie notice is web-only.
- **Deep links (Universal Links / App Links, #268):** an installed app opens `https://rdbk.app/…`
  links itself (the event QR `/go/<code>` + `/event`·`/challenge`·`/reader`·`/editor` slug pages).
  Wired via the association files `public/.well-known/apple-app-site-association` (iOS,
  `6STWTTP329.app.rdbk`) + `assetlinks.json` (Android, `app.rdbk`), the iOS `App.entitlements`
  (`applinks:rdbk.app`) and an `autoVerify` intent-filter on `MainActivity`. `native/src/deeplink.js`
  (`parseDeepLink`, unit-tested) maps a URL to an action; `native.js` runs a `/go/<code>` as an
  API join (`event_join`, Bearer — no PHP in the app) then opens `/event/<slug>`, else navigates
  to the bundled route. No true *deferred* deep link exists (links route only to an already-installed
  app; for a fresh user the web `/go/` join persists on the account). Before it verifies: fill the
  Play signing SHA-256 in `assetlinks.json` and enable Associated Domains on the iOS App ID — see
  `NATIVE.md` §4.
- **Projects:** `android/` is committed (build artifacts git-ignored); generate iOS with
  `npx cap add ios` on a Mac with Xcode.

## The `.rdbk` format (open standard, documented at /standard)
A **ZIP container** (MIME `application/x-roadbook`) holding `roadbook.json` — the
self-contained roadbook — plus optional geotagged media: `media.json`, `photos/…`,
`audio/…` (bundled only when the exporter includes them; #162). A reader detects the ZIP
by its `PK` magic; a bare JSON file is still read as a naked `roadbook.json`. Server-side
storage stays JSON — the ZIP is the export/import artifact. **All distances are integer
metres.** Spec page: `public/standard/index.html`; full reference: `docs/rdbk-format.md`.
The `roadbook.json` schema:
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
    "wp_type"?: str,                                          // FIA waypoint type (RB.WP_TYPES: masked|control|…); on disk (.rdbk/server) written as its OpenRally cap code (WPM, WPN…), normalized to internal ids on import (wpTypeByCap/importRoadbook) and re-emitted by roadbookForExport; editor badge + GPX sym
    "wp_radius"?: int,                                        // per-note validation radius (m); falls back to meta.default_wp_radius then the type default (the Reader's detection radius, #87)
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
  that is LOCAL-ONLY (`source/` is gitignored except `stamp-version.mjs` and
  `check-syntax.mjs`), so a fresh
  clone doesn't have it: edit the committed SVGs directly, keeping the change minimal and
  the set stylistically consistent. The palette is **canonical**: the Editor refreshes the
  used standard icons embedded in a roadbook on open and on save/export (#174), so art
  updates propagate to older roadbooks; custom (user-uploaded) icons are never touched.
- Photos and voice notes live **server-side** (geotagged, per roadbook) and travel in the
  `.rdbk` ZIP only as the **optional** `photos/`/`audio/` + `media.json` bundle — never
  inside `roadbook.json` itself.

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
  and the native launcher — never a different glyph for the same tool. Canonical set: **Roadbook
  Recorder** `fa-circle-dot` · **Roadbook Editor** `fa-pen-ruler` · **Roadbook Reader**
  `fa-compass` · **Tripmaster** `fa-gauge-high` · **Event classification (Ranking)**
  `fa-ranking-star`. The nav sections add **Navigate** `fa-location-arrow` (the Reader +
  Tripmaster hub) · **Events** `fa-calendar-check` · **Profile** `fa-circle-user`. The two-level-deep
  `/features/<tool>/` pages use `../../assets/…`.
