# Roadbook Recorder — Record a live GPS track

The **Recorder** is the tool to use **in the field**. It records the GPS track and lets you drop notes, geotagged photos and voice notes along the way. The result is a draft that goes to the Editor to become the final roadbook.

> It works **100% offline** for the GPS, the notes, the photos and the voice notes. Photos stay in a local queue until there's a network. A connection is only needed to sign in, to upload the photos and to save to your profile.

---

## Complete sequence: from opening to saving

### 1. Open the Recorder

Open the **Recorder** from the tab bar (the ⏺ icon) or go directly to `/recorder/`.

> ![Recorder start](../assets/screenshots/rec01.jpg)

The start screen says what the Recorder does and shows the **GPS health** live: *Searching for GPS…*, *GPS too weak to record* or *GPS ready* with its accuracy (±m). **Start recording** opens only once the GPS is good enough to record, so a recording never begins blind. If you're not signed in, a notice says the route and its photos wait on your device and that Save asks you to sign in — you can still record.

> **Admins** can start without waiting for the GPS (the button says so) — useful on a computer, which has none: every fix is kept whatever its accuracy, and a note with no fix at all drops where the map is centred.

---

### 2. Start

Tap **Start recording**. The recording starts at once: nothing to fill in — the roadbook gets its name later, in the Editor.

---

### 3. Live dashboard — recording in progress

> ![Recording dashboard](../assets/screenshots/rec03a.jpg)

At the top, the status bar (clock · battery · GPS accuracy) and four readouts:

| Element | What you see |
|----------|--------------|
| **Elapsed** | Recording duration (excluding pauses) |
| **km/h** | Current speed |
| **Notes** | Number of notes dropped |
| **km** | Distance travelled |

Below them come the capture buttons (step 4) and the live map (step 5). **Pause** and **End** sit in a bar at the bottom, half width each; on a phone that bar floats just above the tab bar.

---

### 4. Enrich the track during the route

> ![Capture buttons](../assets/screenshots/rec04a.jpg)

The capture row has three columns, as tall as each other: the big **Note** (40%), the captures (40%: **Photo** above **Voice note**) and the map's two switches (20%: **Map style** above **Heading up**).

| Button | Action | How to use |
|--------|--------|------------|
| **📍 Note** | Drops a note at your GPS position | Tap: the note drops instantly. A success bell sounds and a big green check appears for under a second. Nothing to type — the note's text is written later in the Editor |
| **📷 Photo** | Takes a geotagged photo | Opens the rear camera. The note is placed where you were when you pressed **Photo**, and the photo is pinned there; the bell and the big green check come once the photo is kept on the device. Close the camera without a shot and nothing drops |
| **🎤 Voice note** | Records a voice note | **Hold it down** while you speak — the button turns red with the seconds; **let go** and it stops (at most a minute). The note is placed where you were when you pressed; the bell and the big green check come when you let go and the sound is saved. A clip under 2 seconds (or a short press) drops nothing and says *Record at least 2 seconds of audio to attach it to the note.* Only the sound is kept, no transcription: it becomes the note's **Voice note** extra and, when you navigate the roadbook, it plays by itself before you reach the note (100 m before, or the distance the author sets in the Editor) |
| **🗺 Map style** | Switches the base map | Satellite ↔ topographic |
| **➤ Heading up** | Map orientation | The map turns with your course (lit) or stays north up |

The bottom bar holds the other two:

| Button | Action |
|--------|--------|
| **⏸ Pause** | Suspends the recording (stops, waits). Tap again to resume |
| **🏁 End** | Ends the recording (step 6) |

> **Tip**: tap **Note** at every junction, hazard or change of road without taking your eyes off the road, and add the words later in the Editor. Hold **Voice note** for at least 2 seconds when a few words say it better — they will play back to you on the road. **Photo** and **Voice note** place their note where you pressed, even if you have moved on by the time the photo or the sound is saved. There is no undo on the trail: a note dropped by mistake is deleted in a second in the Editor.

---

### 5. Live map

> ![Live map](../assets/screenshots/rec05.jpg)

- The track is a **continuous line**
- Notes are **numbered blue dots**
- Photos have a **📷 pin**
- Top-left, big and without a label: the **distance since the last note** (km, two decimals; since the start before the first note)
- Your GPS marker becomes a directional **chevron** when you're moving

---

### 6. End the recording

Tap **End** (bottom bar) and confirm.

> ![End of the recording](../assets/screenshots/rec06a.jpg)

A dialog shows a short summary (km · notes · photos) and asks one question, with two buttons:

| Button | What happens |
|--------|--------------|
| **💾 Save** | Signed in: the recording is saved as a **draft** roadbook (with its photos and voice notes) and the **Editor opens** on it straight away. Signed out: you're taken to the sign-in page and, once signed in, you come back and it is saved the same way, then the Editor opens |
| **🗑 Discard** | Asks for confirmation, naming what would be lost (track, notes, photos), then drops the recording |

There are no export buttons here: exporting (GPX, `.rdbk`, PDF…) is done later from the Editor.

> The dialog can't be closed by tapping outside it. Until you save or discard, the recording is kept safe — even if the app crashes, it is offered again on your next visit.

---

### 7. In the Editor

The Editor opens with the track, the notes, the photos and the voice notes already in place: give the roadbook a name, write the notes' text, listen to a voice note in its note's **Voice note** tab (and set how many metres before the note it plays), and export it if you want. The draft is saved, and you'll also find it in **My roadbooks**.

## Offline behaviour

| What | Signed in + online | Signed in + offline | Signed out |
|------|--------------------|---------------------|------------|
| GPS track | ✅ local + checkpoint | ✅ local + checkpoint | ✅ local + checkpoint |
| Notes and voice notes | ✅ local | ✅ local | ✅ local |
| Photos | ✅ queue → upload | ✅ local queue | ✅ local queue |
| Server draft | created/updated live | created at the first upload | created on **Save**, after sign-in |
| Recovery after a crash | ✅ automatic | ✅ automatic | ✅ automatic |

---

## Interrupted session recovery

The Recorder saves the session in real time. If the app closes (a call, a crash, the battery), on the next launch it offers to **resume** the recording where you left it. Declining **does not delete** it: the recording stays on the device and is only replaced when you start a new one.

---

## Next step

Have the recorded track? → [Editor: create/edit a roadbook →](03-editor.md)  
Want to navigate? → [Reader: navigate with GPS →](04-reader.md)
