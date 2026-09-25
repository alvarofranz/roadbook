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
- Back-end: small PHP 8.4 + MariaDB API under `public/api/` (+ logic in `app/`) for
  accounts, per-user roadbook storage, photos and public roadbooks. Config via `.env`
  (phpdotenv). The front-end works fully without it; the API only adds accounts/sharing.
- **Sign-in:** email/password, **Google Sign-In** (#46) or **Sign in with Apple** (#370 — App Store
  guideline 4.8 requires it next to Google). Both social flows verify their identity token
  server-side, then share one tail: `social_auth` (`app/auth.php`) links the identity by
  `google_sub`/`apple_sub`, or to an account with the same verified email, or creates a passwordless
  account — **in one call**: picking the account in Google's chooser or Apple's sheet IS the
  decision, so there is no second confirmation to click, and the Terms sit beside the buttons
  (pressing one accepts them).
  `google_auth` verifies with Google's tokeninfo; `apple_auth` verifies the RS256 JWT itself against
  Apple's JWKS. The web renders each provider's own button (GIS overlay · Apple JS popup); the app
  uses the OS sheets (`RBNative.googleSignIn`/`appleSignIn`, `@capgo/capacitor-social-login` — the
  web SDKs can't run in a WebView), and Apple is iOS-only there. `.env`: `GOOGLE_CLIENT_IDS` lists
  every OAuth client whose tokens the backend accepts as `aud` (web + Android + iOS — the client ids
  are public, in `native/src/native.js`); `APPLE_SERVICE_ID` (web Services ID, also drives the web
  button) + `APPLE_APP_ID` (iOS bundle id) are the accepted Apple audiences, each optional so a
  surface's button only appears once it is configured. `TRUSTED_PROXIES` (IPs/CIDRs, default
  loopback + private ranges) names the reverse proxies whose `X-Forwarded-For` `client_ip()` believes
  — the key of every rate limit; behind Cloudflare's proxy, add its ranges.
  DB schema = `migrations/*.sql` (source of truth): `users`, `roadbooks`, `roadbook_photos`,
  `roadbook_audio`, `roadbook_locks`, `roadbook_runs`, `roadbook_comments`, `api_tokens`,
  `activity_log`, `settings`, plus the events family (`events`, `event_roadbooks`,
  `event_rb_next`, `event_organizers`, `event_participants`, `event_results`, `event_live`).
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
- **A dialog is one of two things (#966).** One you can leave without deciding anything closes from
  the red ✕ disc centred on its top-right corner (`RBModal` adds it — `RBModalX`), the backdrop or
  Escape, and carries NO Close / Cancel button of its own. One that asks for a decision
  (`dismissable: false`: a confirm, a choice, the only copy of the user's work) has no ✕ at all.
  A form whose typing a stray tap must not lose: `{ dismissable: false, corner: true }`.
- **A confirm answers a question: the buttons are always No / Yes.** `RBConfirm(msg, danger)`
  takes no button label — whatever is specific belongs in the message, which for a deletion must
  name the object anyway. "Cancel" is the wrong word for the negative half of a question (#435).
- **A prompt the user declines must not come back.** Mark the checkpoint declined (never delete
  it — that would be the data loss the prompt exists to prevent) and stop asking; and never ask
  about a saved run/draft when the URL explicitly names a different roadbook (#436).
- **Confirm before destroying data.** ANY action that loses or overwrites user data
  (deleting a note/point, transforming something in a lossy way, clearing/replacing content,
  discarding unsaved work…) MUST ask for confirmation first via `RBConfirm` before it runs.
  No silent data loss, ever. A **deletion** confirm MUST name the object being deleted in its
  message (e.g. the note number + text), so the user knows exactly what they're removing.
- **A modal holding the only copy of the user's work has no "Close".** It is NOT dismissable
  (no backdrop tap, no Escape), and its exit is an explicit outcome that says what it does: a
  **Discard** (`btn-danger` + trash) that confirms and names exactly what would be lost. The
  moment the work reaches a safe destination the same exit becomes an ordinary **Close**. And
  the crash checkpoint stays on until that destination is reached — never cleared when the work
  merely *stops*. The Recorder's finish options had a bare Close wired to dismiss, and its Stop
  had already dropped the checkpoint, so one tap silently abandoned the track, the waypoints,
  the photos and the voice notes with nothing left to recover (#217 · #460). Pinned by
  `tests/recording-exit.test.js`.
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
  - **`app.js`** (global `RB*`, loaded on every page): `RBModal(cardHtml, cardClass, onDismiss, opts)`
    (every dialog — `cardClass` is a `.modal-card` modifier like `narrow`/`slim`/`wide`/`center`/`split`;
    a dismissable one gets the corner ✕, `opts.dismissable: false` makes it a decision — no ✕, no
    backdrop, no Escape; returns `{el, q(sel), close}`), `RBConfirm`/`RBNeedAuth` (built on RBModal, RBt-translated),
    `RBToast(msg)` (translated toast; the `#toast` element is created on first use), `RBApi(action, body)` (JSON POST
    to the API), `RBConfig()` (the `config` call with an **offline fallback** — caches the signed-in
    user so the account menu + capture buttons survive no connectivity; use it, not a bare
    `RBApi('config')`, wherever sign-in state drives the UI), `RBImg.toBlob/toDataURL` (client-side image downscale before upload/embed),
    `RBNotifications` (the in-app notifications: `start(user)` · `refresh()` · `open()` · `KINDS`, #971),
    `RBShareFile(blob, name, text)` (share a generated file: the OS sheet in the app, Web Share in
    the browser, a download otherwise, #785) — in the app `RBDownload` goes to the same OS sheet, so
    every file the app makes (GPX, `.rdbk`, CSV, PDF) lets the user choose where it goes, `RBPublicLink(path)` (an absolute, shareable link to a
    site page — the real domain inside the app), `RBRoadbookCard(r, opts)` / `RBEventCard(e)` (the ONE card design of every gallery, on top of
    `RBGalleryCard`; `RBFillRoutes(container)` draws the route of a photo-less roadbook card, #770),
    `RBPagedList({pager, per, source, filter, draw, label})` (ONE filtered, paged list — the
    galleries, My roadbooks and user management all drive their search + pager through it),
    `RBUpload(fields, file, name)` (image → `upload.php`), `RBDownload(blobOrUrl, name)`,
    `RBesc(str)` (HTML-escape), `RBSuccess.flash()`/`ring()`/`fanfare()`/`unlock()` (the "done" bell +
    big check — a Recorder note, a Reader validation, #768 — and the arrival fanfare; Web Audio in a
    mixable session, so the music of another app keeps playing, #842), `RBDebounce(fn, ms)` (with `.cancel()`), `RBCsv(rows)` (a CSV Blob with a BOM, so Excel reads the accents — every export), `RBTurnstile(el, siteKey)` (the one Turnstile loader → `{token(), reset()}`), `RBTour(id, steps)` (a tool's guided tour: asked once ever, each tool once, always skippable, #906), `RBDeviceLabel()` (a coarse surface · browser · model/OS string from the user agent, never an identifier — stored with every run as `roadbook_runs.device`, shown to admins only, #870), help tips (a `.help-tip` ⓘ with `data-tip` / `data-i18n-tip`: one shared bubble above it, inside the screen, #859 — no call needed), `RBBusy(el, {onEnd})` (the button that launched an async job
    reports it: spinner while it runs, green tick for 3 s on `ok()`, back as it was on `reset()`),
    plus the global chrome (desktop top bar + footer, the mobile bottom tab bar), version
    auto-refresh and the Install chip.
  - **`i18n.js`** (+ per-language `i18n.<lang>.js`): `RBt(key)` (translate; a missing key falls
    back to English, then to the key) + `data-i18n` / `data-i18n-html` / `data-i18n-ph` /
    `data-i18n-title` / `data-i18n-aria` / `data-i18n-tip` in HTML. Keep **every** language file
    (`es`/`it`/`de`/`fr`) at full key parity with the English source strings.
  - **`roadbook-core.js`** (`RB.*`): geo math, GPX/WPT parsing, `buildRoadbook`, metrics/CAPs,
    QR meta, signing. **`note-canvas.js`**: `NoteCanvas` editor + `NoteCanvas.toSVG` (the
    vignette, used by the Reader rows and the challenge page). **`rbmap.js`** (`RBMap`): MapLibre helper (Editor + Reader map).
    **`gps-meter.js`** (`RBGpsMeter`) + **`gpx-recorder.js`** (`RBGpxRecorder`): the shared
    GPS loop and crash-safe GPX logging (Reader · Tripmaster · Editor recording).
    **`rb-media-queue.js`** (`RBMediaQueue`): offline-first buffering of geotagged photos (blobs
    in IndexedDB) with deferred upload + retry (Recorder + the Editor's Adjust on the trail).
  - **`app.css`**: shared design system — option cards (`.choice-grid` / `.choice-card`, `.row` ·
    `.center` · `.compact`: every "ways in" — the Editor's start and Export, the app home, the
    Navigate hub, #979), buttons (`.btn*`), modals (`.modal`/`.modal-card`
    + modifiers/`.modal-in`), `.btnrow` + alignment modifiers, `.head-row` (a heading with its
    actions on the same row — title left, actions right, stacking on a phone), `.toolbar` (a
    wrapping control row), `.icon-accent`/`.icon-danger`, `.field-grid`, `.btn-group`, `.grow`,
    the note rows, etc. **Before inventing a class, look for the pattern here**: the heading row
    alone had been re-invented four times under four names, one of which was never styled at all
    (#482).
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
- **Only use CSS variables that exist.** `var(--accent)` and `var(--primary)` painted NOTHING
  for months — the palette calls that colour `--sand` — so an "active" filter looked identical
  on and off and two page borders were invisible (#422). CSS never complains about a token that
  was never declared, so `tests/ui-contracts.test.js` does: every `var(--x)` without a fallback
  must be declared in `:root` or be one of the handful published at runtime by JS.
- **Nothing makes the page scroll sideways.** A word too long for its box (German's
  "Datenschutzerklärung"), a grid cell that cannot shrink below its longest word, a 540 px spec
  table on a 390 px screen — each one widened the layout viewport, and with it every bar the
  shared layer pins to it, dragging the tab bar and the language chip off-screen. Running text
  breaks (`overflow-wrap: break-word`), a grid item that holds a title carries `min-width: 0`,
  and wide content (tables, code) scrolls INSIDE its own box (#480). Pinned by
  `tests/ui-contracts.test.js`.
- **The page never zooms — only the maps do (#933).** Every page's viewport meta carries
  `maximum-scale=1, user-scalable=no`, `app.css` gives every element `touch-action: manipulation`
  (no double-tap zoom) and `app.js` refuses iOS Safari's pinch (`gesturestart`) outside a MapLibre
  map. A new page copies the same viewport meta; `tests/simpler-field-tools.test.js` checks them all.
- **Every translatable label is translated in all five languages — on EVERY page.** The `/standard/`
  spec page shipped fully translated into German and French and untranslated into Spanish and
  Italian for months, because the i18n test only looked at a hand-kept list of pages (#480). It now
  walks every `.html` under `public/`, so a new page is covered the day it lands. Note that the
  browser DECODES the attribute: `data-i18n="End &amp; close"` reaches `RBt` as `End & close`, and
  an apostrophe must be the typographic `’` everywhere (a straight `'` is a different key, #114).
- **A responsive `@media` block goes AFTER the rules it overrides.** Same selector = same
  specificity, so the one written LAST wins at every width and the other is dead code CSS never
  complains about. Written above its base rule, `@media (max-width: 640px) { .roadbook-row .meta
  { min-width: 100% } }` never applied: every saved-roadbook card collapsed to 6 px on a phone and
  its summary line ran straight across the action buttons, and two more overrides (the compact
  cookie notice, the action row that clears the tab bar) were dead the same way (#476). Pinned by
  `tests/ui-contracts.test.js`.
- **One way to reach the clipboard: `RBCopy(text, okMsg)`.** A bare
  `navigator.clipboard.writeText()` throws where the API is absent (non-secure context, older
  WebView, refused write) — outside any promise chain, so the copy silently fails and not even
  the error toast shows (#423). RBCopy checks, falls back, and always reports.
- **Shared chrome NEVER covers a tool's controls.** A bar the shared layer pins to a viewport
  edge (the cookie notice, the web-GPS banner) either sits **in the flow** and takes its own
  space, or **publishes its height** for the page to reserve (`--notice-h`, and the Reader's
  `--bottom-stack`); a dialog (`.modal`) is always the top layer. Four bugs came from getting
  this wrong (#401 · #403 · #404 · #405) — each one left a button that could not be tapped
  while driving. `tests/shared-chrome.test.js` pins the contract; `docs/app-shell.md` explains it.
- **A tool that owns the screen is an app SHELL, not a set of pinned bars.** The Reader in
  navigation is `position: fixed; inset: 0` as a flex column whose only scroller is the note
  list, with every bar an ordinary flow row and the safe-area insets on the shell (#429). Never
  pin a bar and compute its offset from `window.innerHeight`: on iOS that viewport settles after
  load, changes on resize/rotation and moves with Safari's toolbar, so the value is stale the
  moment it is taken — that is how the CAP bar ended up floating mid-list on a phone. The
  document must not scroll at all in that mode, so scrolling code works in the scroller's
  coordinates, never `window.scrollY`.
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
  (PHP 8.4 · Node 22 · MariaDB 10.11), so a green run there means the same thing for everyone
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
**Full stack (PHP 8.4 + MariaDB) on the VPS dev clone:** development happens on the box in a
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

`public/assets/js/config.js` (gitignored) holds the `signKey` (and optionally licensed map
styles, `styleSatellite`/`styleTopo`/`styleOsm`; the base maps run on free, no-key tiles)
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
container carries the pinned toolchain (PHP 8.4 · Node 22 · MariaDB 10.11 — `.ddev/config.yaml`,
the same Node every CI workflow uses), so everyone's run is identical and matches CI; a host Node
of another version is not a valid way to check a change.
```bash
ddev start                      # once per session, if the project isn't up (ddev describe to check)
ddev exec npm install           # first run / after a package.json change
ddev exec npm test              # Vitest + happy-dom — the suite that must be green before hand-off
ddev exec npm run check         # node --check every public/**/*.js except *.min.js (source/check-syntax.mjs)
ddev exec node --check public/event/event.js   # one file
```
The suite covers the pure core of `roadbook-core.js` — geo math,
GPX/WPT parsing, `buildRoadbook`, metric/CAP recomputation, route ops, the GPX serializer,
the 55-char QR meta and its HMAC signing. `roadbook-core.js` stays a browser global
(`window.RB`) and additionally exports the same object to Node (`module.exports`) so the
tests can import it — no build step is introduced on the web. Tests live in `tests/`. CI runs
the same syntax check + `npm test` on every pull request (and on manual dispatch) via
`.github/workflows/test.yml`, and again on every push to `main` in the Deploy workflow's `test`
job, which gates the deploy.

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

**Every PR that touches `public/` carries its own stamp, committed in the PR.** For an ordinary
change that is `node source/stamp-version.mjs "$(jq -r .version public/version.json)"` — same semver,
`build` incremented: `version.json` advances, every `?v=` token is rewritten, so the changed assets
arrive fresh through every cache and open PWA clients force-refresh. Use
`node source/stamp-version.mjs <X.Y.Z>` **only** when the change is worth a release on the stores,
because moving the semver is what fires the Android + iOS builds — bumping `build` alone does not.
The **`stamp` CI check** (`.github/workflows/stamp.yml`) fails any PR that changes a first-party
asset without a stamp, so the rule holds even when the server-side stamp is missing (#407).

**A semver release writes its own release note first.** `public/assets/js/changelog.js` is the
single source of "What's new" — one entry per release (version · date · headline · what changed),
newest first — rendered on the dedicated changelog page (`/changelog/`, linked from the App Info
pop-up and teasered on About). Add
the entry for the new `X.Y.Z` BEFORE stamping it: `tests/about-page.test.js` fails a build whose
`version.json` is ahead of the list, and fails a note that isn't translated into all five
languages. The strings are English source strings, translated through `RBt` like the rest of the
UI, so a new entry is readable everywhere the moment it is written.

**On every web release run `node source/stamp-version.mjs <MAJOR.MINOR.PATCH>`**
(e.g. `1.1.0`) — it writes `public/version.json` (the app polls it and
force-refreshes every open client) AND stamps the `?v=` cache-buster on every first-party
script/style URL in the HTML, so each release gets fresh asset URLs through every cache
layer (browser, CDN edge, the host's static-file cache — which ignores `.htaccess` and
pins old JS for hours otherwise). Gitignored runtime files (`public/assets/fontawesome/`,
`public/assets/js/config.js`, `.env`, `vendor/`) are not in git and persist across deploys.

**NEVER raise the semver without the user's EXPLICIT permission — ASK, every time.** A version
bump is a release on the App Store and on Play, it is the user's call alone, and "ship this to
prod" is NOT that permission: it authorises the deploy, not the number. So the default for any
change is the build-only stamp (`node source/stamp-version.mjs "$(jq -r .version public/version.json)"`),
which ships the web + PWA and nothing else. When a change is worth a store release, say so and ask
for the semver in so many words — then bump only the one the user names. 1.9.0 and 1.9.1 were
authorised that way.

**Versioning — one semver everywhere, an auto-growing build per surface.** The **version** is
`MAJOR.MINOR.PATCH` (semver) and is the ONE human-facing number — identical on the web footer,
the Android `versionName` and the iOS `MARKETING_VERSION`. You bump it deliberately. Alongside it
each surface keeps a **build number that only ever grows** (the stores require it): `version.json`
carries `{version, build}` where `stamp-version.mjs` auto-increments `build` every run (it drives
the web cache-buster + the PWA force-refresh, so a same-version redeploy still refreshes clients);
Android's `versionCode` = `MAJOR*1000000 + MINOR*1000 + PATCH`, computed by `android/app/build.gradle`
from `version.json` itself (so it climbs with the semver and never collides: MINOR and PATCH stay
≤ 999 — the stamp and the build both refuse more — and every code is above the 11000 already on
Play); iOS's `CFBundleVersion` = Xcode Cloud's monotonic `CI_BUILD_NUMBER`. Never
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
from it in `build.gradle` — `MAJOR*1000000+MINOR*1000+PATCH` for the code; iOS's `ci_pre_xcodebuild.sh` reads the semver
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
  route from scratch), **`.rdbk`** or a public **roadbook** — a finished Recorder session arrives
  as its saved draft (`?rb=<id>`), a GPX logged in the Reader/Tripmaster via `?trip=1`. Edit notes (text, road
  type, FIA danger grading `!`/`!!`/`!!!`, CAP, **waypoint type (`waypoint_type`) + validation
  radius**, declarative **speed limit** (`speed_limit_kmh`) — which also tags the note a controlled
  zone and places the matching sign, icons);
  drag a note on the map to
  reposition. **The GPX is edited ON the map.** The four everyday modes have their own
  rail bottom-left, one letter each, the active one lit and — for 3 s after a change — named (#692 · #754): *M move (drag any
  track point, note or photo) · N add notes · P add points (a tap inserts one into the
  existing track) · D draw (each tap adds a new point from the nearest open end; a drag
  always pans the map, #712)*; the ☰ panel holds *cut (C — tap any two spots — the track is split
  exactly there, inserting points as needed; trims at the ends, and in the middle it leaves
  a real OPEN cut, dashed on the map, that you fill by drawing or that closes straight on
  export/save after a confirm)* plus
  one-shot *add GPX (smart join: detour-replace if both ends touch the route,
  otherwise auto-oriented join to the nearest end) · reverse · simplify
  (Douglas-Peucker, note anchors kept) · adjust on the trail (live re-record) ·
  undo/redo (debounced snapshots, Ctrl+Z/Y)*. Whatever the source pieces, the route
  is always ONE continuous track. Title, description,
  author, organization, event logo (downscaled, embedded) and a photo gallery; uploaded or
  pasted **custom icons live in the roadbook's own library (`rb.symbols`) and are offered to
  every note** — only unused *standard* art is pruned on export, since a custom icon has no
  other copy (#454); one on a flat backdrop is offered a browser-side background removal
  (`RB.iconBackground`/`removeIconBackground`, No / Yes with a before/after preview, #694);
  **Export `.rdbk`** (self-contained, written by `RB.writeRoadbook` and refused with the validator's
  errors when it would not pass `RB.validateRoadbook` — Save goes through the same check),
  **Export GPX** (track + notes as named
  waypoints) and **Save to profile** (public/private — saving pins `?rb=<id>` to the
  URL so re-saves update the same roadbook; importing fresh content starts a new
  one). Vignette editor in `note-canvas.js` (drag/scale/rotate/flip icons + junction
  vectors); searchable icon palette.
- **Recorder** — THE live-GPS route recorder (accuracy-aware sampling, pause/resume,
  crash-safe GPX, one-tap notes confirmed by a bell + a big check (`RBSuccess`), geotagged photos,
  **voice notes held down to record** (#992 — only the sound, saved as the note's Voice note extra),
  the distance since the last note on the map; no undo on the trail — that is the Editor's job; an
  admin may start with no usable GPS to test on a computer, #993); signed-in, it saves the
  route as a draft roadbook to edit later. Recording a new route lives here only; the
  Editor's recording bar serves just "Adjust on the trail".
- **Reader** — the navigator. Paper-style white roadbook table drawn by the shared
  `NoteCanvas.rowsHTML` (#635): each note is a 3-column `.nrow` (total/partial + number with its
  FIA waypoint-type badge (`waypoint_type`) · vignette via `NoteCanvas.toSVG` · text, CAP, speed limit,
  coordinates) with no buttons on the row (#569), colour-coded by state (reached green · skipped
  pink · active red border · upcoming white) — and the ACTIVE row alone takes the live GPS
  proximity state (blue as you close in, with the distance still to run). Advancing puts the next
  note exactly at the **top** of the list (#844). Distances are measured **along the GPX track**, like
  the roadbook's own partials: `RB.routeAhead` projects the fix onto the track around the active
  note, so partial driven + distance left = the note's partial, shown in km with two decimals, and
  every change of note re-anchors both odometers on the route (#846 · #847); only the validation
  radius stays a straight line. One **Note map** toggle in the action bar opens the MapLibre
  mini-map under the active note and follows it (only where the roadbook allows a map); its guide is
  one short straight arrow of fixed size from your position pointing at the note — a direction,
  never a line to it (`RBMap.setGuide`, #890).
  Load a `.rdbk`, **one of your saved roadbooks** (signed-in) or a **public roadbook** (the
  landing shows the "Open from" chooser + the public gallery inline). Opening one shows a
  **read-only preview** first (`body.rb-preview`: the note list, no GPS, tab bar still visible) —
  you might only want to look; **"Navigate" navigates** (#936): no dialog, no options — the run
  always logs its GPX, which belongs to the run (the report carries it: *Driven track* on a map and
  a GPX download for the runner, public or private run alike — no second window) and always rings. The mode is
  never asked (#617): a roadbook opened from an event that scores it runs in competition (the
  vehicle number, the one thing asked), anything else as a trip. Then
  navigation starts (`body.rb-immersive`: the tool owns the screen — `#navScreen` becomes the app
  shell, a fixed flex column whose only scroller is the note list, #429). Advancement
  is automatic by default: the note validates the moment the **driven segment** between two GPS
  fixes enters its **detection radius** (`RB.noteReached` — testing the single fix let a waypoint
  slip between two of them at speed; the radius is `RB.detectionRadius`: per-note `validation_radius` →
  `meta.default_validation_radius` → the type default → the system default `CONST.REACH_DEFAULT_M`
  (30 m), floored at `REACH_MIN_M`). There's a live Auto on/off switch in the nav bar; with Auto
  off, validation is manual: a tap on the whole active row marks it done (with Auto on, only the
  GPS validates) — or hands-free from an **external remote**, a Bluetooth pedal/clicker that pairs as a keyboard
  (`RBRemote`, mapped in the Profile, #20 · #909). Tapping any OTHER row moves the run cursor and
  always asks first — it leaves notes unvalidated and in competition costs 450 pts each. With Auto
  on, a missed note never strands the run (#931): once the rider has driven past it and is
  following the track towards the next ones (`RB.routeResync`: several fixes chained along the
  route, continuity with where the run is, so a closed circuit's start never reads as its finish),
  the cursor moves to the first note ahead and the ones passed are skipped — a skipped note is a
  skipped note, however it was skipped, with the same penalty in competition. No title row: the
  dashboard is the first row, and the action bar is two rows of two — Auto · Note map, Pause ·
  **Finish**, the one way out of a run (#936). The live distance to go is on the note map only (#935).
  Each validation rings `RBSuccess`; the last note plays the arrival fanfare (#843). A note's voice
  notes (`voice` blocks) play by themselves `RB.voiceLead(block)` metres before it (100 by default),
  once per run (#992).
  Every run ends with its **report** (#618 — notes reached/skipped, speed-limit zones, time;
  `RBRun`, stored on the device first, then `run_save`): the finish screen leads with the run card,
  Share and a Private/Public switch (sharing before choosing asks to make the run public, #820 ·
  #852), and a public run shows on the runner's profile `/u/<username>` (#619/#620); a competition run also enters the event's shared
  ranking (`event_results`, #590). The run also stores the device it was made on
  (`RBDeviceLabel`), which only admins see, in user management's Runs view (#870), and the track it
  drove: `storage/users/<uid>/runs/<id>.json`, sent with the report (`run_save` `track`), read back by
  `run_track` (anyone for a public run, the runner always) — `RBRun.showTrack`/`openTrack` draw it on
  the report, the profile and `/run/<id>`, through one `[data-run-track]` button.
  Competition validates with penalties + an HMAC-signed result QR (its 100 m proximity gate is
  widened by the fix's own accuracy).
  Opens `.rdbk` from the OS on installed PWAs.
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
  **Comments (#809):** signed-in users comment on a public roadbook on its `/challenge/<slug>`
  page (Turnstile-guarded, rate-limited); comments are never shown in navigation, and the author,
  the roadbook's owner or an admin may delete one. A **Comments** button beside Navigate · PDF ·
  Edit, with the count, scrolls down to them (#853). Table `roadbook_comments`; API
  `comments_list` / `comment_add` / `comment_delete` (`app/comments.php`).
  **Validator:** `/validator/` checks a `.rdbk` (or a bare `roadbook.json`) in the browser with the
  same functions every surface reads one with (`RBZip.inspect` · `RB.validateRoadbook` ·
  `RB.validateMedia`) — nothing is uploaded or stored — and shows the verdict, the file's facts and
  the first 100 errors and warnings, each with its exact path. Linked from the `/standard` landing
  (its first button) and its conformance list.
  **Completed by (#869):** under the comments, the public completed runs (runner, notes, date, link
  to `/run/<id>`) and only a count of the private ones (`roadbook_completions`). Every roadbook card
  carries the same number as a *Times completed* pill (#868): `rb_card_fields($row)` is the one card
  shape of `public_list` / `profile_get` / `event_get`, its `completions` counted by
  `RB_COMPLETIONS_SQL` (`app/runs.php`).
- **Events** — `/events/` lists public events and `/event/<slug>` is the event view
  (categories, organizers, linked roadbooks). Participants join as *pending* and are activated
  by the organizer (QR token or the admin panel); `/go/<code>` is the participant deep link
  (asks to join, then joins + redirects; the app joins through the API). Admin side under `/admin/events/`. Tables: the `events` family in
  `migrations/`. **Chained roadbooks (#944):** the organizer says what each event roadbook offers at
  its last note (`event_rb_next`, a short label each); the Reader offers them there and carries the
  same run on — every leg its own run on the server, one report at the end. **Live map (#947 · #970):**
  `/admin/events/live/?id=` shows the organizers each participant's LAST position, sent by the Reader
  whenever an active participant navigates one of the event's roadbooks (any day, however opened),
  once they said yes — asked once per event, kept in `event_participants.live_consent`
  (`app/live.php`: `live_status` / `live_consent` / `live_ping` / `live_stop` / `live_list`, table
  `event_live`, purged by cron a day after the event). Organizers and admins are not tracked.
- **Notifications (#971)** — in-app only (no native push): a badge on the account icon and the app's
  Profile tab, and a Notifications entry at the top of the account menu; seeing the list reads it (`RBNotifications` in
  `app.js`: `KINDS` is the one catalog of how a kind reads and where it leads). The read state lives
  on the server (`app/notifications.php`: `notify()` · `notifications_forget()` · `notifications_list`
  / `notifications_read` / `notifications_unread`, table `notifications`), so the web and the app
  agree; every page refreshes its badge on load, each minute while visible and on coming back. The
  first kind: a comment on one of your roadbooks. A new kind = one name in `NOTIFY_KINDS`, one entry
  in `KINDS`, one `notify()` where it happens.

## Shared front-end (`public/assets/js/`)
- `roadbook-core.js` (`window.RB`) — backbone: the **`.rdbk` format** (`FORMAT_VERSION` ·
  `validateRoadbook` → `{ valid, errors, warnings }` · `readRoadbook` (validates, hydrates the derived
  values; also imports a Roadbook Suite file) · `writeRoadbook` (the canonical document) ·
  `validateMedia`), geo math, `parseGPX`/`parseWPT`, `buildRoadbook`/`newRoadbook`/`blankNote`,
  `trackPoint`/`trackFixes` (GPS fix `{ele, t}` ⇄ track point `{elevation, time_ms}`),
  `recomputeMetrics` (every derived value)/`recomputeCaps`, route ops
  (`simplifyRoadbook`, `reverseRoadbook`, `joinTrack`), `routeAhead` (the live fix
  projected onto the route around a note: the along-route position, the road left to the note and
  how far off the route the fix is — the Reader's distances and its note-map guide),
  `gpxDocument` (GPX 1.1 serializer, also used by the Reader's GPX logger),
  `parseOpenRally`/`openRallyDocument`, speed-limit helpers (`speedLimitOfNote` reads
  `speed_limit_kmh`; `speedLimitFromName` reads a sign's name), `gpxCompatibility`,
  the FIA **waypoint-type** system (`WP_TYPES` catalog · `wpType`/`wpTypeByCap` (OpenRally codes)/`wpTypesForProfile`/`wpBadgeSVG` ·
  `detectionRadius` — the Reader's geofence radius), the live-GPS gates `odometerStep` (what may
  count as distance travelled) and `noteReached` (auto-validation on the driven segment),
  `buildMeta`/`parseMeta` (55-char QR,
  incl. the `rb` roadbook slug-prefix field), `metaRbPrefix`,
  `signMeta`/`verifyMeta` (HMAC-SHA256), `symbolSrc`, generic helpers (`filterByText`/`filterRoadbooks`,
  `deleteNote`, `pickerAccept` (inside the app a file input that names an extension opens every file — Android's picker knows no `.gpx`/`.rdbk`, #996), `pendingWork` (a checkpoint holding a roadbook counts only at the current `rdbk_version`), `isEndNote` — the last note, whose tulip draws no exit road because
  past the finish there is nothing to follow, #447 — and `isFirstNote`), `tulipShape`/`tulipContext`
  (the shape the author drew into the track around a note — 4 or more points within 30 m on
  a side — derived at render time and never stored, #945),
  `CONST`, `ROAD_TYPES` (+ `ROAD_WIDTH`, `DOUBLE_GAP`, `DEFAULT_ROAD_TYPE`, `roadType`).
- `note-canvas.js` — `NoteCanvas` (vignette editor) + the static render `NoteCanvas.toSVG`
  (the vignette, used by the Reader rows, the challenge page, the PDF and the OpenRally export).
  Every render takes `ctx = RB.tulipContext(rb, i)` (`toSVG(note, resolveIcon, ctx)` ·
  `setNote(note, ctx)`), so the tulip's roads (`<path>`s) follow the drawn track the same everywhere;
  `roadMarkup()` is the one road renderer (trunk and junctions: each type's FIA stroke, junctions
  grey); a note's `imported_tulip` is drawn full-box while shown (#943).
- `rbmap.js` (`RBMap`) — MapLibre GL helper (track, waypoints, live recording, photo
  pins, draggable edit marker, satellite → topo → OSM layer toggle). Used by the **Editor**
  (full editing) and the **Reader** (the interactive per-note map).
- `gps-meter.js` (`RBGpsMeter`) — the shared GPS dashboard loop (Reader + Tripmaster):
  position watch + wake lock, one *judged* `{here, trusted, disp, from, speedKmh, heading}` per
  fix — `RB.odometerStep` decides whether a fix is trustworthy and whether its step is real
  movement, so `disp` is only ever ground actually covered (a junk or jittering fix used to add
  phantom kilometres, #383). In the native app it uses RBNative's background-capable watch
  (logging survives a locked screen).
- `gpx-recorder.js` (`RBGpxRecorder`) — crash-safe GPX logging (Reader · Tripmaster · Recorder):
  starts at once, nothing asked (`begin({ name })`, one point every 2 s — a kept track is named
  where it is saved), localStorage checkpoint with recovery (a declined one is marked, never deleted),
  finished-track modal (download / convert into a roadbook) for the Tripmaster's log (`stop()` →
  `handOver()`), `end()` for a caller that keeps the points itself (the Recorder's route, the
  Reader's run — whose points go into its report);
  the file is written once at the end via `RBDownload`.
- `rb-remote.js` (`RBRemote`, #20 · #909) — the **remote controller**: any remote that sends keys
  (page-turner pedals, handlebar rally controllers, clickers) drives the hands-free tools, so the
  whole transport is `keydown` — no permissions, no plugin, identical in the browser, the PWA and
  the app. Which button does what is the rider's own mapping (key → action, kept on the device),
  set in the profile's **Remote controller** table (Assign → press the button; × unbinds; Restore
  defaults); without one it is `DEFAULT_MAP` (→ ↓ Page↓ Space Enter = next · ← ↑ Page↑ = prev).
  `ACTIONS` (next · prev · auto · map · pause · reset · plus10 · minus10 · timer) · `mapping()` /
  `saveMapping()` / `resetMapping()` · `commandFor(event)` · `attach(commands)` → detach ·
  `capture(onKey)` (the settings' press-a-button). The page owns what an action DOES and attaches
  only its own: the **Reader** while navigating (validate, previous, Auto, note map, pause), the
  **Tripmaster** (mark note, reset partial, ±10 m, timer), the **Recorder** while recording (drop a
  note, pause). The module owns the guards (silent while typing or with a modal open, and
  Space/Enter left to a focused button so it never acts twice).
- `rb-media-queue.js` (`RBMediaQueue`) — offline-first media queue (#147): geotagged photos
  buffered as blobs in IndexedDB, uploaded to the server with retry (auto-flush on
  `online` + resume across reloads/crashes). `add(kind, blob, fields, name, token)` ·
  `get(token)` · `drop(tokens)` (a discarded recording's photos) · `flush()` (drain now, e.g. once a draft exists after sign-in) ·
  `init({onDone, onChange, resolveRoadbook})`. Items may be enqueued without a `roadbook`; the
  `resolveRoadbook` hook supplies one at flush (draft created lazily, signed-in), and until it
  can, a signed-out capture stays queued on the device. Pure `createQueue` core
  (module.exports) is unit-tested; used by the Recorder and the Editor's Adjust on the trail.
- `rb-voice.js` (`RBVoice`, #992) — records a voice note into an audio `data:` URI (mono, 24 kbit/s,
  at most `MAX_S` = 60 s): `supported` · `start({ onTick })` → `{ stop() → Promise<dataURI|null> }`.
  The Recorder (hold the microphone) and the Editor (the Voice note extra) share it.
- `rbzip.js` (`RBZip`) — the dependency-free ZIP codec of the `.rdbk` container (native
  `deflate-raw`): `write(files)` · `read(blob)` · `inspect(file)` → `{ container, names, files, doc,
  docError, manifest, manifestError }` (what a file holds, unjudged — the validator's input) ·
  `readBundle(file)` → `{ roadbook, media }` · `readRdbk(file)`; the document they return is raw,
  the caller passes it to `RB.readRoadbook`.
- `changelog.js` (`RBChangelog`) — the release notes, one entry per release, newest first;
  rendered on `/changelog/` by `public/changelog/changelog.js` and linked from App Info. See
  **Releasing**.
- `challenges.js` (`RBChallenges`) — public roadbooks (DB-backed): `listPublic`/`loadPublic`/
  `pick` (picker), `publicFromUrl` (parses the friendly `/reader/<slug>` or `/editor/<slug>`).
  ("Challenge" stays the internal name + the `/challenge/<slug>` view route; the user-facing
  label is "public roadbook", with "challenge" reserved for the events feature.)
- `i18n.js` (+ `i18n.es/it/de/fr.js`), `app.js` (global header/footer, SW + version
  auto-refresh, Install button, account control, styled modals), `config.js`, `qrcode.min.js`.
- `rb-qr.js` (`RBQr`) — every QR in the product, drawn on a canvas: `draw(canvas, payload)`
  (the event activation code, on screen) · `dataURL(payload, size)` → a **PNG** data URI (the
  Reader's signed result — the vendor library only emits GIF, and a GIF under a `.png` name is
  rejected by the OS pickers the app hands files to, #392). Loaded next to `qrcode.min.js` on
  the pages that show a QR; the vendor global is read at call time, so it is unit-testable.
- `i18n-edit.js` (`#118`, admin-only) — in-context UI translation editor. `app.js` loads it
  ONLY for admins; dormant until an admin turns edit mode on from **Site settings**
  (`/admin/config/` → `RBI18nSetEdit`). In edit mode every translatable label (`data-i18n*`) is
  editable in place — the bottom bar edits all of the page's labels, right-click edits a single
  one — with a live preview. Edits accumulate in
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
- **Durable storage + status bar (#778):** the session token and every crash checkpoint are
  mirrored from `localStorage` into native Preferences (`native/src/durable.js`) and restored if the
  OS wipes the WebView storage; the system status bar is light-on-dark, and on Android hides while
  a tool owns the screen (`body.rb-immersive` · `body.gps-live`). **Nothing ever sits under the
  status bar (#787):** one fixed opaque strip covers the top inset (`body::before`, above everything)
  and every dialog pads itself by the safe areas.
- **One contextual home:** `index.html` shows the marketing landing on the web and an app home in
  the app — CSS toggles `.web-only`/`.app-only` via `.native`, no second page. The web landing
  leads with the official-style store badges (`RBGetAppHTML`, from `RBStore`) and "Start in the
  browser"; the app home is an app's opening screen (#720): a greeting, the one big action
  (Record a route), quick tiles (Navigate · Editor · Events), the user's last roadbooks with
  Navigate / Edit, and the public ones as a carousel. There is no "home" button back to it —
  navigation is the bottom tab bar. The Install chip exists only on the web and opens `/install/`.
- **Navigation — one section catalog, two presentations (`SECTION`/`WEB_NAV`/`APP_TABS` in
  `app.js`).** One order everywhere (#807): **Roadbooks · Editor · Recorder · Navigate · Events ·
  Profile** — the roadbooks first, the Recorder in the middle. *Desktop web* renders the top bar (the Recorder is a
  top-level entry; Reader + Tripmaster collapse into a single **Navigate** entry → the `/navigate/`
  hub). *Every mobile-width
  view — web, PWA and the native app alike* — hides the top bar and shows a fixed icon-only
  **bottom tab bar** (Instagram-style): Back, then the same six sections; there is no
  hamburger/full-screen menu. "Navigate" covers
  `/tripmaster/` + `/reader/`; "Events" covers `/event/` + `/ranking/` (Ranking has no nav entry of
  its own — it opens per competition roadbook from the event page). The **language is
  browser-detected** and changed from the flag picker in the desktop footer — on mobile, where the
  footer is hidden, from the bottom of the Profile page (no picker in the nav). The Profile page is
  three tabs, Profile · Preferences (default map location, guided tours, remote controller) ·
  Security, `#<tab>` in the address (#925). The site footer's site links move to the Profile page on mobile; Install + unsaved-work chips float above the tab bar. Full matrix:
  `docs/menu.md`.
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
  app; for a fresh user the web `/go/` join persists on the account). `assetlinks.json` carries
  the Play App Signing + upload-key SHA-256; the iOS App ID must have Associated Domains (and Sign
  in with Apple) enabled, or the build fails at signing — see `NATIVE.md` §4.
- **Projects:** `android/` and `ios/` are both committed (build artifacts git-ignored), so a fresh
  clone needs only `npm run sync`; iOS builds on a Mac with Xcode (or in Xcode Cloud).

## The `.rdbk` format (open standard, documented at /standard)
**Version 1** (`"rdbk_version": 1`, `RB.FORMAT_VERSION`). A **ZIP container** (MIME
`application/x-roadbook`) holding `roadbook.json` — the self-contained roadbook — plus optional
geotagged media: `media.json` (`{ photos: [{ file: "photos/…", lat?, lon? }], audio: [...] }`),
`photos/…`, `audio/…` (bundled only when the exporter includes them; #162). A reader detects the ZIP
by its `PK` magic; a bare JSON file is read as a naked `roadbook.json`. Server-side storage is JSON
— the document as the client sent it; the ZIP is the export/import artifact. Spec page:
`public/standard/index.html`; full reference: `docs/rdbk-format.md`; in-browser checker:
`/validator/`.

**The file holds only authored data.** Every derived value is computed by the reader
(`RB.recomputeMetrics`; haversine on a 6 371 000 m sphere, integer metres) and NEVER written: note
`num`, `lat`/`lon` (its track point), `distance`, `partial_distance`, `bearing_in`/`bearing_out`,
`road_type_in` (the previous note's `road_type`; the first arrives on its own), `cap_distance` (with a
CAP: straight-line metres to the next note), `meta.total_distance`, `meta.note_count`. In memory the
app keeps them (`RB.readRoadbook` hydrates). A value at its default is left out; keys in a fixed
order; coordinates at most 6 decimals. **All distances are integer metres.** The `roadbook.json`
schema:
```jsonc
{
  "rdbk_version": 1,
  "meta":  { "title": str, "description"?: str, "author"?: str, "organization"?: str,
             "modified"?: str /* YYYY-MM-DD */, "logo"?: str /* data: URI */,
             "map_allowed"?: false /* the Reader may not show a map; absent = allowed */,
             "default_validation_radius"?: int /* m, for notes without their own */,
             "generator"?: str /* RDBK.app writes "RDBK.app" */ },
  "track": [ { "lat": float, "lon": float, "elevation"?: int, "time_ms"?: int /* fix time epoch ms UTC */ } ], // ≥ 2 points
  "notes": [ {                                                // ≥ 1, track_index strictly increasing
    "track_index": int,                                       // the track point the note sits on
    "text"?: str,
    "road_type"?: 1..5,                                       // the road the note leaves on (default 2, track)
    "cap"?: 0..359,                                           // authored CAP heading
    "cap_type"?: "average"|"calculated"|"turning",           // only with a cap (default exit)
    "speed_limit_kmh"?: int,                                  // in force from this note; 0 = lifted
    "danger"?: 1..3,                                          // FIA grading → red ! / !! / !!! in the vignette
    "waypoint_type"?: str,                                    // RB.WP_TYPES id (masked|navigation|dz|…), written as it is
    "validation_radius"?: int,                                // m; else meta.default_validation_radius → type default → 30 m
    "symbols"?: [ { "name": "x.svg", "position": [x,y], "size": n, "angle"?: deg, "mirrored"?: true } ],
    "junctions"?: [ { "from": [x,y], "to": [x,y], "road_type"?: 1..5 } ],
    "imported_tulip"?: { "image": str /* data: URI */, "shown"?: false }, // e.g. OpenRally's; while shown it is the whole vignette (#943)
    "blocks"?: [ { "type": "photo"|"ad"|"text", "placement": "before"|"after", "image"?: str, "text"?: str }
                 | { "type": "voice", "audio": str /* audio data: URI */, "lead_distance"?: int /* m, default 100 */ } ],
                                                              // RB.NOTE_BLOCKS: material around the note; never a waypoint
    "compatibility"?: { "openrally"?: [...], "gpx"?: { "sym", "osmand_icon", "osmand_color" } }
  } ],
  "symbols"?: { "x.png": "data:image/png;base64,…" },        // the library: EVERY used symbol (custom ones kept, #454)
  "compatibility"?: { … }                                     // one block per other format, kept on round trip
}
```
- `RB.validateRoadbook(doc)` is the one judge (`{ valid, errors, warnings }`, each `{ path, message,
  values? }`; a default present or an unknown key is a warning). `RB.readRoadbook` throws
  (`error.report`) on an invalid document; there is no importer of other `.rdbk` shapes, only of
  Roadbook Suite files (another program's JSON). `RB.writeRoadbook` writes the canonical document.
  `rb_save` accepts only a structurally valid version-1 document (`rb_valid_document`) and computes
  `total_distance` (`rb_track_length`) and `note_count` itself.
- Symbols sit on a **230×162** box; origin = centre, **+y up**; `angle` clockwise.
- **Self-contained rule:** every symbol a note uses MUST be in top-level `symbols`.
  `RB.symbolSrc(symbol, rb, basePath)` resolves: `rb.symbols` → the standard palette under
  `basePath` (a palette symbol not embedded yet, while editing).
- ROAD_TYPES (FIA Road Book Lexicon strokes, app colours; every road `RB.ROAD_WIDTH` = 8 wide):
  1 Tarmac (double line, 2-wide white centre, green) · 2 Track (solid, default) · 3 Low-visible track
  (dash `24 8 8 8`) · 4 Off track (dash `8 8`) · 5 Bike lane (solid purple, #561). Junctions draw grey
  with their type's stroke.
- The waypoint-type scope (basic / rally) is not stored: the Editor infers it (a rally-tier type in
  use ⇒ rally). OpenRally codes (`WPM`, `WPN`…) exist only in the OpenRally import/export
  (`wpTypeByCap`, `WP_TYPES[].cap`).
- Standard palette (`public/assets/icons/` + `index.json`): roadbook pictograms (PNG)
  plus a Vienna-Convention EU traffic-sign set (SVG: warning `W*`, priority `B*`,
  prohibitory `C*`/`S*`, mandatory `D*`). The sign set was produced by a generator script
  that is LOCAL-ONLY (`source/` is gitignored except `stamp-version.mjs`, `check-syntax.mjs`,
  `check-stamp.mjs` and `assets.mjs` — the asset-reference rules the stamper and the stamp check
  share), so a fresh
  clone doesn't have it: edit the committed SVGs directly, keeping the change minimal and
  the set stylistically consistent. The palette is **canonical**: the Editor refreshes the
  used standard symbols embedded in a roadbook on open and on save/export (#174), so art
  updates propagate to older roadbooks; custom (user-uploaded) symbols are never touched.
- The roadbook's geotagged **photos** and its server-side audio clips (`roadbook_audio`) live
  **server-side** (per roadbook) and travel in the `.rdbk` ZIP only as the **optional**
  `photos/`/`audio/` + `media.json` bundle — never inside `roadbook.json`. A note's **voice note** is part
  of the note itself: a `voice` block whose `audio` is a `data:` URI inside `roadbook.json` (#992).

## Conventions
- Tool pages are one level deep → relative `../assets/…`; the challenge page uses
  absolute `/assets/…`. `[hidden]{display:none!important}` in `app.css`.
- Header and footer are rendered globally by `app.js` — pages ship empty `<header
  class="topbar">`.
- Keep the data model in clean English (no camelCase beyond unavoidable; metres, not km).
- **"A destra" / right placement = top-right, on the title's row.** When the user asks to put
  something "a destra" (to the right) — a header CTA, a claim/banner link, an action — they mean
  the **top-right of that section, on the SAME row as the heading** (title left, action right),
  **not** below it. Use the shared `.head-row` (or `.tool-titlebar` for a tool page) — never a
  page-local heading wrapper (#482 · #642).
- **Icon consistency — one canonical FontAwesome icon per tool, everywhere.** A tool must use
  the SAME icon across the home workflow step, its Features card, its `/features/<tool>/` page
  and the native launcher — never a different glyph for the same tool. Canonical set: **Roadbook
  Recorder** `fa-circle-dot` · **Roadbook Editor** `fa-pen` · **Roadbook Reader**
  `fa-compass` · **Tripmaster** `fa-gauge-high` · **Event classification (Ranking)**
  `fa-ranking-star`. The nav sections add **Navigate** `fa-location-arrow` (the Reader +
  Tripmaster hub) · **Events** `fa-calendar-check` · **Profile** `fa-circle-user`. The two-level-deep
  `/features/<tool>/` pages use `../../assets/…`.
