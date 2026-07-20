# Quick Start — Getting started with RDBK.app

Welcome! RDBK.app is a PWA (Progressive Web App) for creating, sharing and following digital roadbooks. It runs **entirely in the browser** — nothing to install, but you can also "install" it as an app on your phone.

The app works **offline** for recording, editing and navigation. A connection is only needed for: login, saving to your profile, uploading photos/audio, and public pages.

---

## 1. Choose what to do — the 4 main tools and options

| Tool | What it's for | When to use it |
|------|---------------|----------------|
| **Roadbook Recorder** | Records a live GPS track, which you can enrich with waypoint in the points you want to set as notes; you can also attach junction photos and handy voice notes to jot down how the tulip should be drawn or any other warnings | During the reconnaissance / field survey |
| **Editor** | Create or edit a roadbook from a recording, a GPX or an openrally roadbook; optimize the track, review the voice notes and survey photos, complete the notes and tulip by drawing them; arrow and CAP management is automatic based on the underlying track. When done you can export it to RDBK, openrally and PDF if you prefer to print it | After recording (or from scratch) to prepare the final roadbook |
| **Roadbook Reader** | Enables navigation of digital roadbooks in tourist or competition mode, can automatically mark reached notes and additionally an (optional) map can be enabled showing each note's position relative to the vehicle | During the event / outing — it's the "co-pilot" |
| **Roadbook Player** | GPS on-board computer without a roadbook: total/partial odometer, speed, heading, stopwatch, waypoint counter, GPX recording | Free reconnaissances, tests, outings without a predefined roadbook |

> **OTHER OPTIONS**:  
> - in the **HOME PAGE** you'll find a gallery of public roadbooks you can browse or follow
> - if you register you can save your own roadbooks (draft/ready/public) on RDBK.app and share them between phone and PC
> - in the **Events** section you'll find events organized by Clubs
> - ... and you can always organize an event using the digital management of your own roadbooks!

---

## 2. Typical "zero to race" flow

```
┌─────────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  Recorder   │ ──→ │ Editor  │ ──→ │  Save   │ ──→ │ Reader  │ ←── │  Event  │
│  (field)    │     │ (write) │     │ (profile)│    │ (navigate)│   │ (organize)│
└─────────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘
      │                   │                │                │              │
  live GPS           Draw/          Saved to          Follow         Create event,
  waypoint           import         cloud +          notes +         link RB,
  photo/audio        GPX/.rdbk      optional         CAP +          invite with
                      icons/symbols  local .rdbk     score          join code
```

---

## 3. Why create an account

Logging in lets you save your roadbooks to the cloud and find them on any device — you can record a track with your phone during a survey and then comfortably edit it on your PC without the hassle of moving files.

1. Tap **Account** (top right) → **Sign up**
2. Enter: first name, last name, username, email, password (≥ 8 characters)
3. Check **I accept the Terms of use**
4. Complete the Turnstile challenge (if active)
5. You'll receive an email: click **Verify my email** within 24 h
6. Return to the app and **Log in** with email/username + password

> **Google Sign-In**: if you see the "Continue with Google" button, you can use it to create/log in without a password.

---

## 4. Key concepts to know right away

| Concept | What it means |
|----------|---------------|
| **Roadbook status** | `draft` = private draft · `ready` = ready but private · `public` = visible to everyone in the gallery |
| **Local vs cloud save** | In the Editor: **Export .rdbk** = ZIP file on your device (offline, portable). **Save to profile** = saved on the server, found on any logged-in device |
| **Photos & voice notes** | They don't go into the `.rdbk` unless you check "Include photos and audio" at export. They live on the server (login required). When logged out they stay on the device and go into the local `.rdbk` |
| **Event join code** | Short code (e.g. `DA2C09`) given to you by the organizer. Open `/go/DA2C09` → you enter the event and see the `ready` roadbooks reserved for participants |
| **Race score (Ranking)** | Only in **Competition** mode in the Reader. Generates a signed 55-character QR at the end of the stage. |

---

## 5. First things to try (5 minutes)

1. **Record a track** → Recorder → "Start recording" → walk/drive → "Finish" → "Open in Editor"
2. **Draw a route** → Editor → "Draw on the map" → tap two points → add notes (tap a row → inline editor)
3. **Export .rdbk** → Editor → Export → .rdbk → download the ZIP file
4. **Open in Reader** → Reader → "Upload .rdbk file" → choose the file → "Trip mode" → start navigating
5. **Try Tripmaster** → Tripmaster → Start → see odometer, speed, live heading

---

## 6. Where to find help

| What | Where |
|------|------|
| Terms of use | `/terms/` (link in footer) |
| Privacy | `/privacy/` |
| `.rdbk` standard | `/standard/` — full format specification |
| Report bug / request feature | GitHub Issues (link in footer → About) |
| Contact | `/contact/` |

---

## 7. Next step

Choose the tool you need and read its guide:

- 📍 [Record a track →](02-recorder.md)
- ✏️ [Create/edit a roadbook →](03-editor.md)
- 🧭 [Navigate with the Reader →](04-reader.md)
- 📊 [Use the Tripmaster →](05-tripmaster.md)
