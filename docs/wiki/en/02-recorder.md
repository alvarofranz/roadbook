# Roadbook Recorder — Record a live GPS track

The **Recorder** is the tool to use **in the field**. It records the GPS track and lets you drop notes and geotagged photos along the way. The result is a draft that goes to the Editor to create the final roadbook.

> It works **100% offline** for GPS + waypoint + media. Media stays in a local queue until there's a network. A connection is only needed for: initial login, deferred upload, saving to profile.

---

## Complete sequence: from opening to saving

### 1. Open the Recorder

Open the **Recorder** from the main menu or go directly to `/recorder/`.

> ![Recorder start](../assets/screenshots/rec01.jpg)

You'll see the start screen with the **Start recording** button. If you're not logged in, a notice appears: *"Not signed in: the route and its photos wait on this device, and Save asks you to sign in."* — you can still record.

---

### 2. Start a new recording

Tap **Start recording**.

> ![Session name](../assets/screenshots/rec02.jpg)

A modal opens for the session **name** (default: date/time `YYYY-MM-DD HH-MM`). You can change it. Tap **Confirm**.

---

### 3. Live dashboard — recording in progress

While recording, the screen shows four readouts at the top:

> ![Recording dashboard](../assets/screenshots/rec03a.jpg)

| Element | What you see |
|----------|--------------|
| **Elapsed** | Recording duration (excluding pauses) |
| **km/h** | Current speed |
| **Notes** | Number of notes dropped |
| **km** | Distance traveled |

Below them come the capture buttons (step 4) and the live map (step 5). **Pause** and **End** sit in a bar at the bottom, half width each; on a phone that bar floats just above the bottom tab bar.

---

### 4. Enrich the track during the route

The capture row has one big **Note** button on the left and, on its right, a 2×2 grid of icon buttons as tall as it:

| Button | Action | How to use |
|--------|--------|------------|
| **📍 Note** | Drops a note at the current GPS position | Tap: the note is placed instantly (needs a GPS fix). A success bell sounds and a big green check appears on screen for under a second. There is nothing to type — the note's text is written later in the Editor |
| **📷 Photo** | Takes a geotagged photo | Opens the rear camera. The photo is attached to the current GPS position and always drops a note there too |
| **↩ Undo last note** | Removes the last note | Asks for confirmation first, naming the note it removes |
| **🗺 Map style** | Switches the base map | Satellite ↔ topographic |
| **🧭 Heading up** | Map orientation | The map turns with your course (heading up) or stays north up |

The bottom bar holds the other two:

| Button | Action |
|--------|--------|
| **⏸ Pause** | Suspends GPS and stopwatch (stops, waits). Tap again to resume |
| **🏁 End** | Ends the recording (step 6) |

> ![Waypoint and media buttons](../assets/screenshots/rec04a.jpg)

> **Tip**: tap **Note** at every junction, hazard or road change without taking your eyes off the road, and add the words later in the Editor. Use **Photo** for signs and visual points.

---

### 5. Live map

> ![Live map](../assets/screenshots/rec05.jpg)

- The track is a **continuous line**
- Notes are **numbered blue dots**
- Photos have a **📷 pin**
- Top-left, big and without a label: the **distance since the last note** (km, two decimals; since the start before the first note)
- Your GPS marker becomes a directional **chevron** when you're moving

---

### 6. End recording

Tap **End** (bottom bar) and confirm to end the recording.

> ![Recording summary](../assets/screenshots/rec06a.jpeg)

A dialog shows a short summary (km · notes · photos) and asks one question, with two buttons:

| Button | What happens |
|--------|--------------|
| **💾 Save** | Signed in: the recording is saved as a **draft** roadbook (with its photos) and the **Editor opens** on it straight away. Signed out: you're taken to the sign-in page and, once signed in, you come back and it is saved the same way, then the Editor opens |
| **🗑 Discard** | Asks for confirmation, naming what would be lost (track, notes, photos), then drops the recording |

There are no export buttons here: exporting (GPX, `.rdbk`, PDF…) is done later from the Editor.

> The dialog can't be closed by tapping outside it. Until you save or discard, the recording is kept safe — even if the app crashes, it is offered again on your next visit.

---

### 7. In the Editor

The Editor opens with the track, the notes and the photos already loaded: give the roadbook a name, write the notes' text and export it if you want. The draft is saved and you'll also find it in **My roadbooks** from the main menu.

## Offline behavior

| What | Logged in + online | Logged in + offline | Logged out |
|------|--------------------|---------------------|------------|
| GPS track | ✅ local + checkpoint | ✅ local + checkpoint | ✅ local + checkpoint |
| Notes | ✅ local | ✅ local | ✅ local |
| Photos | ✅ queue → upload | ✅ local queue | ✅ local queue |
| Server draft | created/updated live | created at first flush | created on **Save**, after sign-in |
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

## Next step

Have the recorded track? → [Editor: create/edit a roadbook →](03-editor.md)  
Want to navigate? → [Reader: navigate with GPS →](04-reader.md)
