# Tripmaster — GPS on-board computer

The **Tripmaster** is a GPS on-board computer without a roadbook: no notes, no route to follow, no score. It shows in real time total and partial odometer, speed with alert bands, heading (CAP), stopwatch and waypoint counter — useful for reconnaissances, tests or outings where only on-board instrumentation is needed.

> Works 100% offline. The session is saved at every fix, so a phone call or screen lock loses nothing.

---

## 1. Start

Open **Tripmaster** (`/tripmaster/`) and tap **Start**. You immediately see the live dashboard with all the instruments.

At startup the Tripmaster automatically checks:
1. **Interrupted session** in progress → proposes resume
2. **Orphan GPX track** → proposes recovery
3. **Nothing** → clean start

---

## 2. The dashboard

```
┌──────────────────────────────────┐
│ ⏰ 14:32   🔋 85%   🛰 ±3m      │
├──────────────────────────────────┤
│                                  │
│  TOTAL           PARTIAL        │
│  12.34 km        0.56 km         │
│  [−10] [+10]    [−10] [+10]      │
│                                  │
│  SPEED           CAP             │
│  45 km/h ▲      045° ↗           │
│  ⚠ max: 78 km/h                  │
│                                  │
│  STOPWATCH       WAYPOINT        │
│  12:34 ▶         5              │
│                                  │
├──────────────────────────────────┤
│ [🔴 STOP GPX] [🏁 End trip]     │
└──────────────────────────────────┘
```

### Instruments:

| Instrument | Description |
|------------|-------------|
| **Total odometer** | Distance traveled since the start of the session |
| **Partial odometer** | Distance since the last reset or waypoint |
| **Speed** | Current speed + recorded maximum |
| **Heading (CAP)** | Direction of travel in degrees with needle |
| **Stopwatch** | Start/pause/reset timer |
| **Waypoint** | Counter (number only, no position saved) |

---

## 3. Odometer: total, partial and corrections

Two independent odometers, both with manual correctors ±10 m:

| Button | Action |
|--------|--------|
| **+10 / −10** (partial) | Corrects the partial |
| **+10 / −10** (total) | Corrects the total |

> The correctors cannot go below 0.

### Partial reset

Press and hold the reset button for **5 seconds** (protection against accidental touch). The partial also auto-zeroes when you press **Mark waypoint**.

---

## 4. Speed and alert bands

Set a **speed to monitor** to receive visual signals:

| Band | Condition | Color (default) |
|------|-----------|-----------------|
| Under limit | `v < limit − 5` | Green |
| Approaching | `limit − 5 ≤ v < limit` | Orange |
| Exceeding | `v ≥ limit` | Red with ⚠ |

> The band configuration (limit and colors) is set from the speed settings button. Colors and limit are saved and restored on the next session.

---

## 5. Stopwatch

The stopwatch uses the system clock, so it keeps counting even if the app goes to the background.

| Button | Action |
|--------|--------|
| **Start/Pause** | Starts or pauses |
| **Reset** | Zeroes (only with stopwatch stopped) |

> The displayed time includes the background period: if you pause and resume hours later, the count restarts from where it was.

---

## 6. Waypoint counter

Press **Mark waypoint** to:
- Increment the waypoint counter
- Zero the **partial**

> The counter is just a number — it doesn't save coordinates. To record the actual position, enable **GPX recording**.

---

## 7. GPX recording

Enable GPX recording from the dedicated button to have a track of your outing:

- **Crash-safe**: checkpoint at every fix, recovery if the app closes
- The button turns red **STOP** during recording
- Settings modal to configure file name and options

---

## 8. Interrupted session recovery

At startup it checks in order:
1. **Ongoing session** in `localStorage` → proposes resume with all data (odometers, stopwatch, waypoint, GPX)
2. **Orphan GPX** → proposes interrupted track recovery
3. **Nothing** → clean start

> Declining the resume **does not delete** the session: it is overwritten as soon as you start moving, or explicitly deleted with "End the trip".

---

## 9. Keyboard shortcuts (desktop)

| Key | Action |
|-----|--------|
| `Space` | Mark waypoint |
| `P` | Pause/Resume stopwatch |
| `Esc` | End trip |

---

## 10. Next step

Finished the reconnaissance? → [Recorder: record a track →](02-recorder.md)  
Want to create a roadbook? → [Editor: create/edit →](03-editor.md)
