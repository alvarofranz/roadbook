# Editor — Create and edit a roadbook

The **Editor** is the creation hub: here you turn a raw track (or a blank sheet) into a complete roadbook with notes, CAP, danger, road types, icons, tulip vignettes.

> **Works offline** for pure editing. A connection is needed for: login, loading/saving to profile, uploading photos/audio, importing public challenges, PDF/GPX export (uses lazy-loaded libraries).

---

## Start — Choose the source

Open **Editor** (`/editor/`). The landing (`#loadFrom`) offers 4 cards + 2 hidden sources:

> 📸 *Screenshot: Editor start screen with the 4 source cards (GPX, Draw on the map, .rdbk, Public roadbook)*

| Source | How to do it | What you get |
|--------|--------------|--------------|
| **GPX** | Tap "GPX" → choose `.gpx` file (optional `.wpt`) | `RB.parseGPX` → `buildRoadbook` → roadbook with track + waypoint |
| **Draw on the map** | Tap "Draw on the map" | Map in **Draw** mode: tap the map to add the route point by point — the first two taps create the roadbook from scratch |
| **.rdbk** | Tap ".rdbk" → choose ZIP/JSON file | Imports a complete roadbook (media in `pendingMedia`, see below) |
| **Public roadbook** | Tap "Public roadbook" → challenge picker | **Fork** of a `public` + `reusable` roadbook → new private roadbook of yours |

**Automatic sources** (at startup, priority):
1. `?trip=1` → track/waypoint/photos from Recorder/Tripmaster via `sessionStorage`
2. Unsaved draft in `localStorage` (`rb_editor_draft`) → confirm recovery
3. `?rb=<id>` → loads your saved roadbook (requires login)

> Importing (GPX, .rdbk, public) **resets the identity** (`resetIdentity`): `currentRbId=0`, status=`draft`, `reusable=false`. This prevents accidentally overwriting the original.

---

## Map View — The toolbar

The map is the heart. Two bars sit on it:

- **Top-left**: ☰ (menu) · Undo · Redo
- **Bottom-left**: the vertical **mode bar** (on a phone it runs horizontally along the bottom). Each button shows its icon and its key; the active mode is highlighted and also shows its name

> 📸 *Screenshot: Editor map with the top-left bar, the bottom-left mode bar and a loaded track*

### Modes (exclusive, bottom-left bar)

| Mode | Key | What it does |
|------|-----|--------------|
| **Move** (default) | `M` | Drag **any point**: track point, note or photo. The line follows. Metrics recalculated on release |
| **Add notes** | `N` | Tap the route → drops a note there. The mode stays on, so you can drop several in a row |
| **Add points** | `P` | Tap the existing route → inserts a point into that segment. Needs a route |
| **Draw** | `D` | Each tap adds a **new** point, extending the route from its nearest open end (start, finish or edge of an open cut); tapping the opposite edge of a cut closes it. With nothing loaded, the first two taps create the roadbook |
| **Cut** | `C` | Menu ☰ → Cut (it appears in the mode bar only while active). Tap 2 points → cut (leaves a hole = *gap*) |

Tapping the active mode again returns to **Move**; so does `Esc`. Dragging always pans the map, in every mode.

### Menu ☰

| Tool | Function |
|------|----------|
| **Cut** | Enters Cut mode (key `C`, see above) |
| **Add GPX** | Smart join: if both ends touch the route (≤200m) → replaces the inner segment; otherwise joins to the nearest end (auto-orients) |
| **Simplify** | Douglas-Peucker (tolerance 0.5–50m, default 2m). **Recalculates metrics from scratch** → total can only decrease. Notes stay on their vertices (anchors preserved) |
| **Adjust** | Live re-record of a segment (shared gps-meter). Replaces the segment between `adjP1` and `adjP2` and re-attaches the notes |
| **Shortcuts** | Lists all keyboard shortcuts |

**Undo / Redo** (top-left bar): Debounced 400ms snapshot, max 30. Ctrl/Cmd+Z / Ctrl+Y (Shift+Z)

> **Reverse** (path reversal) is in **Settings** (Config view), not here.

### Right-click menu (long-press on touch)

A dark card in the app's style. At the top it says what was hit — a note (with its number), a track point or "this spot" — and its coordinates, with a one-click copy button. Below, the commands in groups (edit · photos · open in Google Maps / Google Earth), each with its key. Arrow keys move through the commands; `Esc` or a click outside closes it.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `M` · `N` · `P` · `D` · `C` | Mode: Move · Add notes · Add points · Draw · Cut |
| `Esc` | Back to Move |
| Ctrl/Cmd+Z · Ctrl+Y (Shift+Z) | Undo · Redo |

The same letters work in the right-click menu and on a selected track point:

| Key | Action |
|-----|--------|
| `N` | Turn into / add a note |
| `P` | Add a track point |
| `I` | Intermediate point |
| `T` | Turn a note into a track point |
| `Del` | Delete |

---

## Open cut management (*gaps*)

An internal cut leaves a **real hole** (not a segment). Stored as a pair of **points** `{a,b}` (not indices) → survives index shifting.

- **Fill**: tap with Draw from one edge of the cut (tapping the opposite edge closes the gap)
- **Close straight**: at export/save → `confirmOpenCuts` asks for confirmation → closes as a straight line
- `resolveGaps()` resolves them into indices on demand

---

## Note list + inline editor

Right column: `.note-mini` rows. Tap a row → **inline editor moves** under that row (single `#noteEditZone` physically moved). Vignette canvas (`#canvasWrap`) moves INSIDE the tulip cell.

> 📸 *Screenshot: note panel with inline editor open on a note*

### Note fields

| Field | How to edit | Notes |
|-------|-------------|-------|
| **Text** | In-place `textarea` (keeps focus) | Updates model without rebuild |
| **Road type** | Select "Road" → sets `road_type_out` | Only the road you **leave** is authorized; arrival derives from `road_out` of previous note |
| **Danger** | Select `—` / `!` / `!!` / `!!!` → `n.danger` | 0 = removes |
| **CAP** | Toggle row → calculates `bearingDeg` + `haversineM` toward next note | Last note: no CAP |
| **Icons / Vignette** | `NoteCanvas` on `#noteCanvas` | Standard palette + embedded custom (see § below) |

### Drag on map (Move tool)
Note is dragged from the blue marker → moves the **track vertex** underneath → line follows. Note moves like a track point.

### Reorder / Delete
↑/↓ arrows (change `sel` ±1), `Del` → `delNote` (minimum 2 notes). **Does not recenter map** (fix #65).

---

## Icon palette

`renderIcons` merges:
- **Standard** (`assets/icons/index.json` → `loadStd`)
- **Custom** embedded in the roadbook (`rb.icons`)

> 📸 *Screenshot: icon palette with categories and live search*

Category chips + live search (`filterIcons`). Tap or **drag&drop** onto vignettes to add. Custom: upload (`#iconFile`) or paste → data-URI. If the icon sits on a plain background (e.g. a photo of white paper), the Editor asks **"Remove the background?"** (No / Yes), showing the original and the result side by side — it runs entirely in the browser, and the roadbook's icon library keeps only the version you chose. × badge to delete (blocked if in use).

> On .rdbk import from Roadbook Suite: icons renamed 1:1 (table in `editor.md` §9.5), flip Y + recentred + ×1.5 (×3 start/finish). Icons without a file → fallback `W28_general_danger.svg` + note in text *"Note: add icon <name>"*.

---

## Config View — Roadbook details

Second view (`showView('config')`), tab `#viewConfig`:

> 📸 *Screenshot: Config view with title, description, status, waypoint profile fields*

| Section | Fields |
|---------|--------|
| **Title / Description / Author / Organization** | `oninput` → `markDirty`, `stampMeta` stamps `modified` (YYYY-MM-DD) on every save/export |
| **Event logo** | `RBImg.toDataURL(f, 256)` → data-URI in `meta.logo` (self-contained) |
| **Status** | `setStatus()`: **draft · ready · public** (no longer binary). Only `public` publishes to the gallery |
| **Reusable** | `cfgReusable` → `reusable` (only if `public`) — allows fork by others (#106) |
| **Waypoint profile** | `cfgProfile` → `meta.profile`: `basic` (default) or `rally` (full FIA vocabulary) |
| **Default validation radius** | `cfgWpRadius` → `meta.default_wp_radius` (m) for notes without their own `wp_radius` |
| **Reader map access** | `cfgMapAccess` → `meta.map_access` (false = hides map, e.g. races) |
| **Photos** | Map gallery + geolocated upload + lightbox (see below) |
| **Delete roadbook** | Only if `currentRbId > 0` (saved). `RBConfirmDanger` names the title → `rb_delete` (30-day trash) |

---

## Photos: map gallery, geolocated upload, lightbox

**Requires a saved roadbook** (`currentRbId > 0` / `draftId`) + login.

> 📸 *Screenshot: photo gallery on map with pins and open lightbox*

### Upload (all converge on `addPhotos`)

1. **EXIF GPS** → `RBImg.gps(file)` reads GPS from the first 256 KB of the JPEG. If present → immediate upload with those coordinates
2. **Manual on map** → if EXIF is missing (PNG/HEIC/without GPS): photo queued → `promptPlacePhoto` → tap on map (crosshair cursor, one tap per queued photo)
3. **Copy-paste** (Ctrl/Cmd+V) → `paste` listener → same EXIF/pin flow

### Lightbox
Tap pin / thumbnail → full-screen viewer (covers only the map, **not** the note panel → you keep editing). ‹/› arrows, `←`/`→`, `Esc`. Actions:
- **Waypoint** → creates a waypoint at the photo position
- **Move on map** → *place* mode → next tap updates coords via `ph_move`
- **Delete** → `ph_delete` (with confirmation) + updates lightbox + pin

---

## Voice notes — player

Voice notes already recorded are stored server-side (`roadbook_audio`, `audio_list`/`audio_delete`). Each one appears as an **audio player** on the nearest note row (≤80m), with a **×** to delete it (the confirmation names the note).

---

## Export & Save to profile

**Export** button → pop-up with all formats. **Save** (profile save) is separate. Each export closes the pop-up, confirms open cuts **once**, recalculates metrics.

> 📸 *Screenshot: Export pop-up with available formats (.rdbk, PDF, GPX, OpenRally, KMZ)*

| Format | Function | Output |
|--------|----------|--------|
| **.rdbk** | `exportRdbk(includeMedia)` | ZIP: self-contained `roadbook.json` (`embedUsed` embeds used icons, prunes unused) + optional `photos/`/`audio/`/`media.json` |
| **PDF** | `exportPdf` | A4 via `RBPdf.generate` (lazy jsPDF, `rb-pdf.js`) |
| **GPX** | `exportCustomGpx` | Composable checkboxes (Track / Waypoint / Garmin icons / OSMAnd icons / separate OpenRally file) |
| **OpenRally** | `exportOpenRally` | `RB.openRallyDocument` → `…_OR.gpx` (GPX 1.1 + `openrally:` namespace) |
| **KMZ** | `exportKmz` | `RB.kmlDocument` + `RBZip.write({ 'doc.kml': kml })` → `.kmz` |

### embedUsed (self-contained rule)
Every used symbol ends up in `rb.icons` as a data-URI; unreferenced → removed. Guarantees portability.

### GPX options (issue #34)
Checkboxes: **Track** (required for Garmin/OSMAnd), **Waypoint**, **Garmin icons**, **OSMAnd icons**, **OpenRally**. Garmin + OSMAnd coexist in one file. Naming: `slug_data_WPT_grm_osm_OR.gpx`.

### Save to profile
`doSave` → stamps meta, recalculates, embeds icons → `RBApi('rb_save')`. Success: records `currentRbId`, clears `dirty`, clears draft, pins `?rb=<id>` in URL (reload keeps editing the same one). **"Save as"** → resets identity, adds "(copy)", saves new private entity.

---

## Co-editing, lock, closing (#123 · #154 · #166)

| Aspect | Rule |
|--------|------|
| **Ownership** | `setOwnership(isOwner, owner)`: co-editor sees note *Only the owner can change visibility*; co-editor save **preserves the owner's publication state** |
| **Soft lock** | `setLock(lock)`: if `lock.mine===false` → Editor read-only + `lockBanner` (@user is editing). The lock holder renews every 4 min (`rb_lock_refresh`), releases on close (`sendBeacon` → `rb_lock_release`). Forceable (`rb_lock_force`) |
| **Close** | `leaveEditor` (button `#closeEditor`): unsaved changes → *Save and close · Close without saving · Cancel* → returns to **Editor landing** (roadbook list), not home; clears `?rb=`/`/<slug>` |

---

## Startup, draft, recovery

- `markDirty()` → debounced 2s checkpoint in `localStorage` (`rb_editor_draft`)
- `beforeunload` + `visibilitychange` flush draft before close/kill
- **Startup precedence**: `config` → `?trip=1` (Recorder/Tripmaster) → `localStorage` draft (confirm `RBConfirm`, declining **does not** delete) → `?export=1` (opens export pop-up immediately) → `?rb=<id>` (loads saved) → default map position from profile (`default_lat/lon`)

---

## Import .rdbk Roadbook Suite — fidelity for Ranking

`RB.importRoadbook` converts: Italian keys → canonical, `bivio[]→junctions[]` (flip Y), icons flip Y + recentred + ×1.5, **metric recalculation from track** (bearing, distances, road types). For canonical `.rdbk`: **no recalculation on import** (identical fields).

**Ranking fields preserved on import:**
- `lat/lon` (accuracy/extra) ✅
- `cap/cap_distance` (CAP penalty) ✅ — `recomputeCaps` recalculates only where `cap!=null`
- `distance/partial_distance` (km, reach) ✅
- `icons` I02_partenza / I01_arrivo (score section) ✅
- `icons` Sxx_* (speed limits) ✅

On **export/save**: `recomputeMetrics` attaches notes to track (lat/lon, distance, bearing), `recomputeCaps` realigns active CAP. Consistent for scoring.

---

## Limits & quirks

- `RB.bareNote` emits `num: 0` → correct numbering after `recomputeMetrics` (rows call it immediately)
- Default author can overwrite empty field on login (depends on `account` promise order)
- `spliceByIndex` re-attaches all notes with `nearestIdx` → can move a note unintuitively if a variant passes near an "old" note
- Open cuts → closed as straight line (preceded by `confirmOpenCuts`)
- Photos require an **already saved** roadbook (`currentRbId > 0` / `draftId`)

---

## Next step

Have the roadbook ready? → [Reader: navigate →](reader.md)  
Want a GPS on-board computer? → [Tripmaster →](05-tripmaster.md)
