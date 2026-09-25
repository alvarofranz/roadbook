# Reader — Navigate a roadbook with GPS

The **Reader** is the digital co-pilot: it loads a roadbook and turns it into a paper-style table of notes driven by GPS. Odometers measured along the route, automatic or manual validation, a run report at the end and — in an event's competition — a signed result for the ranking.

> Navigation and validation work 100% offline. A connection is only needed to sign in, to load a roadbook from your profile or the public gallery, and to save the run report.

---

## 1. Load a roadbook

Open the Reader (`/reader/`). The start screen offers:

| Entry | What happens |
|-------|--------------|
| **Load .rdbk file** | Imports a complete roadbook (track + notes + icons) |
| **Open from My roadbooks** | Picks one of the roadbooks saved on your profile (signed in) |
| **Public gallery** | The public roadbooks, right below: tap one to open it |

**From a link**: `/reader/<slug>` opens a public roadbook, `?rb=<id>` one of your own.

**From the app**: in the RDBK app (Android and iOS), open a `.rdbk` from Files, a download or a chat and choose RDBK — it opens here.

> Opening a public roadbook requires signing in.

A roadbook first opens as a **read-only preview**: the note list, no GPS. You may just want to look. Tap **Navigate** to start.

---

## 2. Start a run

**Navigate** starts navigation straight away: no dialog, no options. The run always logs its GPS track (crash-safe): the track belongs to the run and its report carries it, as a *Driven track* map and a GPX download. A bell rings on every validated note and a fanfare on the last one, playing over your music instead of stopping it.

There is no mode to choose: a roadbook opened from an event that **scores** it runs as a **competition** (your vehicle number is asked, penalties apply, the signed result goes to the event ranking); anything else runs as a **trip**.

---

## 3. The navigation screen

The Reader takes the whole screen:

1. **Odometer dashboard** as the first row (no title): total (*prog.*) over partial (*part.*), heading, clock, GPS status and speed
2. **Note list**: one row per note, in three columns — total and partial distance with the note number (and its waypoint type, if any) · the vignette · the text, CAP, speed limit and coordinates
3. **Action bar** at the bottom, two rows of two: **Auto** switch · **Note map**, then **Pause** · **Finish**

Note states: **reached** (green) · **skipped** (pink) · **active** (red border) · upcoming (white). As you close in on the active note it turns **blue** and shows the distance still to run, in km with two decimals.

When a note is validated, the next one moves to the **top of the list**: the road ahead gets all the room.

### Distances along the route
The distance still to run is measured **along the road**, like the roadbook's own partials, not as the crow flies: the partial you have driven plus the distance left always equals the note's partial. At every change of note both odometers are re-anchored on the route, so the partial reads 0.00 exactly at the note.

### Voice notes
A note can carry a **voice note** (held in the Recorder or recorded in the Editor). While you navigate, it plays by itself as you approach the note — at the distance its author chose, 100 m before it by default, measured along the route. Each one plays once per run; when several come due, they play one after another.

---

## 4. Progress: automatic or manual

### Automatic (default)
The active note validates as soon as you drive into its **validation radius**.

- The radius comes from the note (`validation_radius`), then the roadbook's default, then its waypoint type, then 30 m; it never goes below 18 m, above GPS noise
- What is tested is the **road driven between two GPS fixes**, not just the fixes: at speed a phone can move 25 m between two positions, and a tight waypoint would otherwise slip between them
- A position the phone is not sure about (poor accuracy) is ignored: it can neither validate a note nor add distance

### Manual
Switch **Auto** off: then a tap **anywhere on the active note's row** marks it done (the whole row is the target, no small button to aim at while moving). With Auto on, only the GPS validates.

- In competition a manual validation needs you within 100 m of the note, plus whatever margin your GPS accuracy needs
- Tapping **another** note moves the run there and asks first: the notes in between stay unvalidated, and in competition each scored note skipped costs 450 points
- In competition you cannot go back to a validated note

### Hands-free with a remote controller
Any remote that sends keys — a page-turner pedal, a handlebar rally controller, a clicker — drives the Reader while you navigate. It simply works: there is nothing to switch on.

- Out of the box: → · ↓ · Page ↓ · Space · Enter validate the note, ← · ↑ · Page ↑ go back (trip only: a validated note cannot be undone in competition)
- Your own buttons: in **Profile → Remote controller**, tap **Assign** next to an action and press the button on your remote. You can bind validate / next, previous, Auto, the note map, pause, and the Tripmaster's controls
- The buttons are kept on the device, and ignored while you type or a dialog is open

---

## 5. Note map

Only when the roadbook allows a map: **Note map** in the action bar opens a mini-map under the active note; tap it again to close it.

- It shows the track, your live position and, in the corner, the note number with the distance still to go
- A short **yellow arrow** guides you: from your position it points straight at the note
- When the note is validated, the map follows you to the next one

---

## 6. Pause and finish

| Button | What it does |
|--------|--------------|
| **Pause** | Stops the GPS and the screen wake lock to save battery (a lunch stop); the odometers don't move while paused |
| **Finish** | The one way out of a run: ends it and opens its report. Before the last note it asks first: the notes not reached count as skipped |

---

## 7. The run report

Every run ends with its **report**: notes reached and skipped, speed-limit zones, time and distance, plus the **Driven track** on a map with its GPX to download. It leads with your run card, **Share** right under it and one switch to keep the run **Private** or make it **Public** (shown on your profile `/u/<username>`). Sharing before you have chosen asks first, because sharing makes the run public.

The report is stored on the device first and uploaded as soon as there is a connection.

### In competition — the signed result
A competition run also produces an **HMAC-signed result** (a QR you can share or download) and enters the event's shared ranking, where the organizers verify it.

---

## 8. Interrupted session recovery

The run checkpoints itself on the device. If it is interrupted (a call, a crash, the phone closing the app), the next visit asks **Resume the run in progress?** and continues exactly where you were. The track logged so far is recovered with it.

> Declining does not delete anything, and the question does not come back for that run. It is never asked when the link names a different roadbook.

---

## 9. Next step

Finished navigating? → [Tripmaster: GPS on-board computer →](05-tripmaster.md)
Want to create a roadbook? → [Editor: create/edit →](03-editor.md)
