# Reader — Navigate a roadbook with GPS

The **Reader** is the digital co-pilot: it loads a roadbook and turns it into a paper-style table of notes driven by GPS. Odometer, CAP compass, automatic or manual validation and — in Competition mode — a signed QR with the result.

> Works 100% offline for navigation and validation. A connection is only needed for: login, loading roadbooks from profile/public gallery, saving results.

---

## 1. Load a roadbook

Open the Reader (`/reader/`) — the start screen offers 3 entries:

| Entry | How to do it | What happens |
|-------|--------------|--------------|
| **Upload `.rdbk` file** | Tap "Upload .rdbk" → choose file | Imports a complete roadbook (track + notes + icons) |
| **Your roadbooks** | Tap "Your roadbooks" (only if logged in) | Picker of roadbooks saved on your profile |
| **Public roadbooks** | Tap "Public roadbooks" | Picker of public challenges from the gallery |

**From URL** (automatic):
- `/reader/<slug>` → loads a public roadbook directly
- `?rb=<id>` → loads one of your saved roadbooks by ID

> To open a public roadbook you must be logged in.

---

## 2. Choose the navigation mode

After loading, the start modal opens with these options:

| Option | Description |
|--------|-------------|
| **Map per note** | Shows/hides the mini-map under each note |
| **Record GPX** | Saves the GPS track of the navigation (crash-safe) |
| **Sound on note** | Short beep when a note is validated |

Then choose the **mode**:

| Mode | When to use it | What it does |
|------|----------------|--------------|
| **Trip mode** | Free use, reconnaissances, outings without scoring | Follows the roadbook freely, no score |
| **Competition** | Races, events with a leaderboard | Validates with penalties, generates signed QR for Ranking |

---

## 3. The navigation screen

```
┌─────────────────────────────────────────┐
│ Roadbook title                          │
│ Total: 12.34 km  |  Partial: 0.56 km  │
│ Compass: 045° ↗  |  GPS: ±3m 🟢         │
├─────────────────────────────────────────┤
│ #  │ Vignette │ Directions    │ [Map] │
│ 1  │  ┌───┐   │ Turn right    │  [☗]   │
│    │  │ ╱  │   │ CAP 045°     │         │
│    │  └───┘   │ Asphalt       │         │
│─── │───────── │────────────── │─────────│
│ 2  │  ┌───┐   │ Straight      │  [☗]   │
│    │  │ ↑  │   │ Dirt          │         │
│    │  └───┘   │               │         │
│    │   ✅     │ REACHED       │         │
├─────────────────────────────────────────┤
│              [⏸ Pause] [🏁 Finish]        │
└─────────────────────────────────────────┘
```

### Screen elements

1. **Odometer bar** (sticky at top): title, total, partial, CAP compass, time, GPS status, battery
2. **Note table**: each note on a row with distance, tulip vignette, text, CAP, road type
3. **Note states**: ✅ Reached (green) · ⏭ Skipped (pink) · ▶ Active (red border) · white (future)
4. **Columns**: Distances + number | Vignette | Directions | Buttons (map, reached)

---

## 4. Progress: automatic vs manual

### Automatic (default)
As soon as the GPS enters the **validation radius** of the active note, the note is marked as reached automatically.

- The radius is adaptive: it depends on the note's `wp_radius`, with a maximum that avoids overlaps
- Works regardless of speed
- Toggle with the **Auto** switch in the bar

### Manual
Tap the active note or the "Reached" button to validate.

- In Trip: marks green and syncs the odometer
- In Competition: validates with score (requires GPS within 100 m)
- Cannot validate backwards

### Hands-free with an external remote
Tick **External remote (pedal / clicker)** in the mode chooser to advance without touching the screen.

- A Bluetooth **page-turner pedal**, camera clicker or presentation remote pairs as a keyboard: nothing to configure, works offline, in the browser and in the app alike
- **Advance**: → · ↓ · Page ↓ · Space · Enter — **Back**: ← · ↑ · Page ↑ (Trip mode only; a validated note cannot be un-validated in Competition)
- A foot pedal keeps both hands on the wheel; a handlebar clicker suits moto and bike
- The setting is remembered on that device, and keys are ignored while you type or a dialog is open

---

## 5. CAP bar (between two notes)

When the previous note has a CAP, a bar appears at the bottom with:
- **Heading to keep** (e.g. CAP 045°)
- **Current speed**
- **Distance to destination**
- **Directional arrow**

It's a "compass" aid to navigate between two notes without getting lost.

---

## 6. Interactive map per note

Optional: tap the map button of a row to open a mini-map under the note.

- Centered on the note at zoom ~13
- Shows the whole track + pins for context
- Blue GPS dot in real time
- Tap the open map to close it

> The map per note is useful to confirm the position on the ground when the note text is ambiguous.

---

## 7. Additional features

| Function | How to use it |
|----------|---------------|
| **Odometer correction** | Nudge ±10 m when needed; validating a note syncs the total to that note's distance |
| **Pause** | Stops GPS and wake lock to save battery (lunch stops, waiting) |
| **Sound on note** | Short WebAudio beep when a note is validated (auto or manual) |
| **GPX recording** | Crash-safe: checkpoint at every fix, recovery if the app closes |
| **Session recovery** | If interrupted (phone call, crash), resumes exactly where you were |
| **Language change** | Change language mid-session without losing data |

---

## 8. In Competition — result QR

In Competition mode, at the end of navigation a **signed HMAC QR** (55 characters) is generated containing:
- Full result: penalties, times, speeds
- Signed against the server (not forgeable)

Hand the QR to the organizer for the leaderboard (Ranking).

---

## 9. Interrupted session recovery

At startup the Reader checks in order:
1. **Ongoing session** in `localStorage` → proposes resume
2. **Roadbook from URL** → loads it directly
3. **Orphan GPX** → proposes track recovery
4. **Nothing** → clean start

> Declining the resume **does not delete the session**: it is only overwritten when you start a new run or explicitly exit.

---

## 10. Next step

Finished navigating? → [Tripmaster: GPS on-board computer →](05-tripmaster.md)  
Want to create a roadbook? → [Editor: create/edit →](03-editor.md)
