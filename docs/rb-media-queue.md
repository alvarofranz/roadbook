# RBMediaQueue — offline-first media upload queue

Buffers geotagged photos and voice notes in IndexedDB so a network drop mid-recording
never silently loses a capture. Used by the [Recorder](recorder.md) and the Editor's
"Record route" feature.

> Module: [rb-media-queue.js](../public/assets/js/rb-media-queue.js). Exposes
> `window.RBMediaQueue`. The pure orchestration is in `createQueue`, also exported
> for Node tests with an in-memory store.

---

## 1. Architecture

Two layers:

| Layer | File | Role |
|-------|------|------|
| **Orchestration** (`createQueue`) | pure factory | FIFO ordering, retry, reconciliation — testable with a mock store |
| **Browser adapter** | IndexedDB + `RBUpload`/`RBUploadAudio` | persistent blob storage, real upload, `online` event listener |

### `createQueue(deps)` — pure factory

| Dep | Signature | Purpose |
|-----|-----------|---------|
| `store` | `{ add, all, put, del, count }` | persistence backend (async) |
| `upload` | `async (rec) → { ok, … }` | upload function (must not reject) |
| `schedule` | `() => void` | schedule a retry pass |
| `isOffline` | `() => boolean` | gate to skip a pass when offline |

Returns `{ add, flush, clear, items, init }`.

---

## 2. API (`window.RBMediaQueue`)

| Method | Signature | Purpose |
|--------|-----------|---------|
| `init` | `init({ onDone, onChange, resolveRoadbook })` | Wire callbacks and drain any leftover items from a previous session |
| `add` | `add(kind, blob, fields, name, token)` | Enqueue a capture (`token` = client-side id for optimistic UI reconciliation) |
| `items` | `items()` | All queued records (for local `.rdbk` export) |
| `clear` | `clear()` | Empty the queue (after a signed-out user saved a local `.rdbk`) |

### Callbacks (`init`)

| Callback | Called | When |
|----------|--------|------|
| `onDone(item, response)` | per item | Upload succeeded and the item was removed from the queue |
| `onChange(count)` | per add/remove | Queue size changed (badge update in UI) |
| `resolveRoadbook()` | per item missing a roadbook id | Return a draft id for the upload (creates one if offline) |

---

## 3. Offline behaviour

| Scenario | Behaviour |
|----------|-----------|
| **Logged in, online** | Uploads immediately via `RBUpload`/`RBUploadAudio`; `onDone` reconciles the optimistic UI pin with the server id |
| **Logged in, offline** | Stays queued; retried every 20 s (`RETRY_MS`) and on the `online` event |
| **No draft yet** | `resolveRoadbook` is called (creates the draft lazily, #147 F2); item stays queued until a draft id is obtained |
| **Logged out** | Photos/audio stay on device; `resolveRoadbook` returns `null` → items remain queued; exported in the local `.rdbk` at finish (#147 F3) |

- The queue is **FIFO** but each pass attempts every item: a single poisoned item
  never blocks the rest.
- **IndexedDB survives reload/kill**: blobs persist across sessions.
- A failed IndexedDB open is **not memoised** (`dbP.catch(() => dbP = null)`), so
  a subsequent capture retries instead of silently losing everything (#218).

---

## 4. Limits and quirks

- **No upload prioritisation**: all items are attempted in timestamp order, one
  HTTP call per item. A large batch of photos uploads sequentially.
- **`RBUpload`/`RBUploadAudio` handle the actual HTTP**: the queue only decides
  *when* to upload; the image downscale and audio MIME detection are in those
  shared helpers (see [app-shell.md](app-shell.md) §8).
- **Retry is a timer, not exponential backoff**: 20 s fixed interval.
- **Clearing the queue does not cancel in-flight uploads**: `clear` deletes all
  queued items from IndexedDB but an already-started `fetch` completes normally.
