# Cron jobs

RDBK runs **background maintenance tasks** via a round‑robin runner. A single
`cron.php` entry point executes one task per minute, picked by `minute % 10`, so
tasks never overlap. Configured as a system `* * * * *` cron entry.

> Runner: [cron/cron.php](../cron/cron.php). Individual tasks live in the same
> directory. Referenced by [backend-api.md](backend-api.md) §10.

---

## 1. Round‑robin schedule

| Slot | Task | File | What it does |
|:----:|------|------|-------------|
| 0 | **Cleanup drafts** | [cleanup-drafts.php](../cron/cleanup-drafts.php) | Delete abandoned recording drafts (`note_count = 0`, `status = 'draft'`, older than 2 days) with all files |
| 1 | **Purge activity log** | [purge-activity-log.php](../cron/purge-activity-log.php) | Delete security/activity events older than 90 days (GDPR retention, #86) |
| 2 | **Purge trashed roadbooks** | [purge-trashed-roadbooks.php](../cron/purge-trashed-roadbooks.php) | Hard‑delete roadbooks in `deleted` status past `TRASH_DAYS` retention (#187) |
| 3 | **Rename legacy covers** | [rename-legacy-covers.php](../cron/rename-legacy-covers.php) | Rename old `_map.avif` covers to random filenames (protection against enumeration, #206) |
| 4 | **Prune stale tokens** | [prune-stale-tokens.php](../cron/prune-stale-tokens.php) | Delete Bearer tokens unused for 180 days (#213) |
| 5–9 | *Reserved* | — | Future tasks |

Each task runs a **bounded batch** per invocation (e.g. 500 drafts, 5000 log rows,
200 trashed roadbooks) so a single run never holds the DB for too long.

---

## 2. Individual tasks

### Slot 0 — Cleanup drafts (`cleanup-drafts.php`)

The Recorder and Editor create a `rb_draft` at the start of recording so photos
and voice notes can attach live. If the user never finishes, the draft stays with
`note_count = 0`. This task purges such orphans **older than 2 days**, calling
`purge_roadbook_files()` to remove the `.rdbk` file, photos and audio directories.

- **Limit**: 500 rows per run
- **Guard**: `note_count = 0 AND status = 'draft' AND created_at < NOW() - 2 DAY`

### Slot 1 — Purge activity log (`purge-activity-log.php`)

Retention policy: security actions (login, join, admin actions) are kept for
**90 days** (`activity_log.created_at`). Batch delete of expired rows.

- **Limit**: 5000 rows per run

### Slot 2 — Purge trashed roadbooks (`purge-trashed-roadbooks.php`)

When a user deletes a roadbook (`rb_delete` → `status = 'deleted'`), it enters the
trash for `TRASH_DAYS` days (configurable, default 30). After that this task
hard‑deletes the row (cascading to photos and audio via FK) and removes the files.

- **Limit**: 200 rows per run
- **Guard**: `status = 'deleted' AND updated_at < NOW() - TRASH_DAYS`
- The `updated_at` column is frozen at trash time (deleted rows are never updated).

### Slot 3 — Rename legacy covers (`rename-legacy-covers.php`)

One‑time sweep (#206): old covers used a fixed filename `_map.avif`, making every
private roadbook's route map enumerable at `/photos/<id>/_map.avif`. This renames
each to `bin2hex(random_bytes(8)).avif` and updates the DB row.

- **Limit**: 500 rows per run
- Self‑emptying: once no `_map.avif` rows remain, it is a single no‑op SELECT per run.

### Slot 4 — Prune stale tokens (`prune-stale-tokens.php`)

Bearer tokens (`api_tokens`) that have not been used for **180 days** are dead
weight. The app re‑logs in seamlessly if a token is pruned. Also cleans up orphan
rows from web logins (they never carry a `last_used_at` — falls back to
`created_at`).

- **Guard**: `COALESCE(last_used_at, created_at) < NOW() - 180 DAY`

---

## 3. Setup

```
* * * * * php <repo>/cron/cron.php >> <repo>/cron/cron.log 2>&1
```

Each run logs a one‑line timestamp + result. The log is trimmed to 500 lines
(slot 0 also handles log rotation: it keeps the last 500 lines when the file
exceeds 1000 lines).

---

## 4. Limits and quirks

- **Round‑robin means a full cycle takes 10 minutes**: each task runs at most once
  every 10 minutes. For tasks with small batches (200–500) this is fine; if the
  backlog grows faster than the drain, the batch size or schedule must be adjusted.
- **No locking**: if the same task runs twice (e.g. two overlapping cron processes),
  the bounded batch and `LIMIT` ensure no double‑delete — the second run simply
  processes fewer rows.
- **CLI only**: `cron.php` exits if not called from the CLI (`php_sapi_name()`).
- **Slots 5–9 reserved**: new tasks should be added here, incrementing the modulo
  divisor in `cron.php` if more than 10 slots are needed.
