# RBMediaQueue — offline-first media upload queue

Buffers geotagged photos in IndexedDB so a network drop mid-recording never silently
loses a capture. Used by the [Recorder](recorder.md) and the Editor's "Adjust on the
trail".

> Module: [rb-media-queue.js](../public/assets/js/rb-media-queue.js). Exposes
> `window.RBMediaQueue`. The pure orchestration is in `createQueue`, also exported
> for Node tests with an in-memory store.

---

## 1. Architecture

Two layers:

| Layer | File | Role |
|-------|------|------|
| **Orchestration** (`createQueue`) | pure factory | FIFO ordering, retry, reconciliation — testable with a mock store |
| **Browser adapter** | IndexedDB + `RBUpload` | persistent blob storage, real upload, `online` event listener |

### `createQueue(deps)` — pure factory

| Dep | Signature | Purpose |
|-----|-----------|---------|
| `store` | `{ add, all, put, del, count }` | persistence backend (async) |
| `upload` | `async (rec) → { ok, … }` | upload function (must not reject) |
| `schedule` | `() => void` | schedule a retry pass |
| `isOffline` | `() => boolean` | gate to skip a pass when offline |

Returns `{ add, flush, get, drop, init }`.

---

## 2. API (`window.RBMediaQueue`)

| Method | Signature | Purpose |
|--------|-----------|---------|
| `init` | `init({ onDone, onChange, resolveRoadbook })` | Wire callbacks and drain any leftover items from a previous session |
| `add` | `add(kind, blob, fields, name, token)` | Enqueue a capture (`token` = client-side id for optimistic UI reconciliation). Rejects when IndexedDB cannot store it (quota, private mode): nothing is queued and the caller says so (the Recorder toasts *Could not save.* and marks the pin failed) |
| `flush` | `flush()` | Drain now, e.g. once a draft exists, instead of waiting for the retry timer or `online` |
| `get` | `get(token)` | The queued record (blob included) of one capture, or `null` once it has uploaded — how the Recorder gets a waiting photo back after a reload |
| `drop` | `drop(tokens)` | Delete the captures with these tokens, and skip them in a pass already running — a discarded recording takes its photos with it instead of leaving them to upload into the next roadbook |

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
| **Logged in, online** | Uploads immediately via `RBUpload`; `onDone` reconciles the optimistic UI pin with the server id |
| **Logged in, offline** | Stays queued; retried every 20 s (`RETRY_MS`) and on the `online` event |
| **No draft yet** | `resolveRoadbook` is called (creates the draft lazily, #147 F2); item stays queued until a draft id is obtained |
| **Logged out** | Photos stay on the device; `resolveRoadbook` returns `null` → items remain queued until Save goes through sign-in and the draft exists, then they upload into it (#791) |

- The queue is **FIFO** but each pass attempts every item: a single poisoned item
  never blocks the rest.
- **IndexedDB survives reload/kill**: blobs persist across sessions.
- A failed IndexedDB open is **not memoised** (`dbP.catch(() => dbP = null)`), so
  a subsequent capture retries instead of silently losing everything (#218).

---

## 4. Limits and quirks

- **No upload prioritisation**: all items are attempted in timestamp order, one
  HTTP call per item. A large batch of photos uploads sequentially.
- **`RBUpload` handles the actual HTTP**: the queue only decides *when* to upload;
  the image downscale is in that shared helper (see [app-shell.md](app-shell.md) §8).
- **Retry is a timer, not exponential backoff**: 20 s fixed interval.
- **Dropping does not cancel an in-flight upload**: `drop` deletes the queued items
  and skips them in the running pass, but a `fetch` already started completes.
