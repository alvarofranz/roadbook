# Roadbook Recorder — Record a live GPS track

The **Recorder** is the tool to use **in the field**. It records the GPS track and lets you enrich it with waypoint, geotagged photos and voice notes. The result is a draft that goes to the Editor to create the final roadbook.

> It works **100% offline** for GPS + waypoint + media. Media stays in a local queue until there's a network. A connection is only needed for: initial login, deferred upload, saving to profile.

---

## Complete sequence: from opening to saving

### 1. Open the Recorder

Open the **Recorder** from the main menu or go directly to `/recorder/`.

> ![Recorder start](../assets/screenshots/rec01.jpg)

You'll see the start screen with the **Start recording** button. If you're not logged in, a warning appears: *"Photos and audio require login"* — you can still record, but media will stay on the device only.

---

### 2. Start a new recording

Tap **Start recording**.

> ![Session name](../assets/screenshots/rec02.jpg)

A modal opens for the session **name** (default: date/time `YYYY-MM-DD HH-MM`). You can change it. Tap **Confirm**.

---

### 3. Live dashboard — recording in progress

The live dashboard shows all data in real time:

> ![Recording dashboard](../assets/screenshots/rec03a.jpg)

| Element | What you see |
|----------|--------------|
| **Time** | Recording duration (excluding pauses) |
| **Speed** | Instantaneous speed + maximum |
| **Waypoint** | Placed waypoint counter |
| **Distance** | Km traveled |
| **Map** | Heading-up map (direction of travel at top) with track and waypoint |

> The map is **heading-up** by default — the direction of travel is always pointing up. Tap the control at top right to lock to North.

---

### 4. Enrich the track during the route

During recording you have 4 buttons available:

| Button | Action | How to use |
|--------|--------|------------|
| **⏸ Pause** | Suspends GPS and stopwatch | Tap to pause (stops, waiting). Resume with the same button |
| **📍 Waypoint** | Creates a waypoint at the current GPS position | Tap → type the text (auto-closes after 5 s). Use the mic to dictate |
| **🎤 WP audio** | Records a voice clip | **Press and hold** to record. Release → countdown 5→0 → saves. On desktop it transcribes automatically |
| **📷 WP Foto** | Takes a geotagged photo | Opens the rear camera. The photo is attached to the current GPS position |

> ![Waypoint and media buttons](../assets/screenshots/rec04a.jpg)

> **Tip**: use **Waypoint** for written references (junctions, hazards, road changes), **WP audio** for long notes while driving, **WP Foto** for signs and visual points.

---

### 5. Live map

> ![Live map](../assets/screenshots/rec05.jpg)

- The track is a **continuous line**
- Waypoint are **numbered blue dots**
- Photos have a **📷 pin**
- Your GPS marker becomes a directional **chevron** when you're moving
- Tap a waypoint/photo → info and actions (delete, edit text)

---

### 6. End recording

Tap **Finish** to end the recording.

> ![Recording summary](../assets/screenshots/rec06a.jpeg)

A summary modal opens with the session data: route points, km, waypoint, photos. Here you choose what to do:

| Option | When to use it | What happens |
|--------|----------------|--------------|
| **💾 Save to server** | You're logged in and want to find everything on your profile | Saves the **draft** to the server (track + waypoint + media). You stay in the Recorder with the **Edit** button to open in the Editor |
| **📦 Export .rdbk** | You want a portable offline file | Creates a `.rdbk` ZIP (roadbook.json + photos + audio). Downloads the file |
| **✏️ Open in Editor** | You want to refine the route right away | Passes track and waypoint to the Editor. Photos already on the server stay linked |
| **📍 Export GPX** | You only need it for other software | Downloads standard `.gpx` (track + waypoint with name). Photos and audio are **not** included |

> 📸 *Screenshot: save options — Save to server, Export .rdbk, Open in Editor, Export GPX*

> **Best practice**: if logged in → **Save to server** → then **Open in Editor**.  
> If logged out → **Export .rdbk** → then at home: log in → Editor → import `.rdbk` → Save to profile.

---

### 7. After saving

If you chose **Save to server**, the Recorder shows the **Edit** button that takes you directly to the Editor with the track and waypoint already loaded. The draft is saved and you'll also find it in **My roadbooks** from the main menu.

## Offline behavior

| What | Logged in + online | Logged in + offline | Logged out |
|------|--------------------|---------------------|------------|
| GPS track | ✅ local + checkpoint | ✅ local + checkpoint | ✅ local + checkpoint |
| Text waypoint | ✅ local | ✅ local | ✅ local |
| Photos | ✅ queue → upload | ✅ local queue | ✅ local queue |
| Audio | ✅ queue → upload | ✅ local queue | ✅ local queue |
| Server draft | created/updated live | created at first flush | never created |
| Post-crash recovery | ✅ automatic | ✅ automatic | ✅ automatic |

---

## Interrupted session recovery

The Recorder saves the session in real time. If the app closes (phone call, crash, battery), at the next launch it offers:

1. **Resume** — resume recording from where you left off
2. **GPX recovery** — if the session is lost, recover the orphan GPX track
3. **Clean start** — ignore and restart

> 📸 *Screenshot: interrupted session recovery modal*

> Declining the resume **does not delete** the session: it is only overwritten when you start a new recording or exit with "End the trip".

---

## Keyboard shortcuts (desktop)

| Key | Action |
|-----|--------|
| `Space` | Waypoint (requires GPS fix) |
| `A` | WP audio (press and hold) |
| `F` | WP Foto |
| `P` | Pause / Resume |
| `Esc` | Finish / close modal |

---

## Next step

Have the recorded track? → [Editor: create/edit a roadbook →](03-editor.md)  
Want to navigate? → [Reader: navigate with GPS →](04-reader.md)
