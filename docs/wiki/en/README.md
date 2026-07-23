# RDBK.app User Guide

Welcome to the RDBK.app user guide. RDBK.app is a free PWA suite for **digital roadbooks** for any adventure (4x4, moto, bike, running…), plus the open `.rdbk` file format.

> **Live at [https://rdbk.app](https://rdbk.app)**

---

## Quick Start

New to RDBK.app? Start here:

- [**Getting Started**](01-getting-started.md) — install, create an account, first steps

---

## The Tools

| Tool | What it does | Guide |
|------|-------------|-------|
| **Recorder** | Record a live GPS track with waypoints, photos and voice notes | [Recorder guide](02-recorder.md) |
| **Editor** | Create or edit roadbooks from recordings, GPX files or from scratch | [Editor guide](03-editor.md) |
| **Reader** | Navigate a roadbook with GPS — tourist or competition mode | [Reader guide](04-reader.md) |
| **Tripmaster** | GPS on-board computer without a roadbook | [Tripmaster guide](05-tripmaster.md) |

---

## Events

Organise rallies, meet-ups and competitions with digital roadbooks:

- [**Event Management**](06-event-management.md) — create events, manage participants, run competitions

### Event workflow

```
┌─────────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Recorder   │ ──→ │  Editor  │ ──→ │  Event   │ ──→ │  Reader  │
│  (record)   │     │ (prepare)│     │ (manage) │     │ (navigate)│
└─────────────┘     └──────────┘     └──────────┘     └──────────┘
       │                 │                │                │
   live GPS          Edit notes       Attach RB,       Follow route,
   + waypoints       + tulips         invite via       auto-validate,
   + photos          + export         join code        score (QR)
```

---

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Roadbook** | A digital navigation document: track + numbered notes with vignettes, CAP and road types |
| **`.rdbk` format** | Open standard — a ZIP container holding `roadbook.json` + optional media ([spec](https://rdbk.app/standard/)) |
| **Roadbook status** | `draft` → `ready` → `public` (visible in gallery) |
| **Competition mode** | Reader validates with penalties and generates a signed result QR |
| **Join code** | Short code participants use to enter an event |
| **Native apps** | iOS/Android apps with background GPS — recommended for field use |

---

## Further Reading

- [`.rdbk` standard](https://rdbk.app/standard/) — full format specification
- [Technical docs](../../README.md) — developer documentation for contributors
- [Privacy policy](https://rdbk.app/privacy/) — how we handle your data
- [Terms of use](https://rdbk.app/terms/) — usage terms
