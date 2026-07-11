# Entry gate (`/go/<code>`)

The short‑link entry point for event participants. A participant receives a
**join code** (e.g. `DA2C0926`) at the registration desk — printed as a QR code
on a card or sent as a link. Opening `/go/<code>` handles authentication, joins
the event, and redirects to the event page in **participant mode**.

> The handler is a single PHP script: [go/index.php](../public/go/index.php). It is
> the only public page rendered entirely server-side (no JS IIFE). Referenced by
> [events.md](events.md) §8.

---

## 1. URL scheme and flow

```
/go/<join_code>  ──▶  1. validate code
                       2. authenticated?  ──no──▶  /account/?next=/go/<code>
                       3. already joined? ──no──▶  INSERT as pending
                       4. set participant context + cookie
                       5. redirect →  /event/<slug>
```

**Steps:**

1. **Validate** — the `join_code` must match an existing `events` row with
   `is_public = 1`. Unknown codes get a 404 with a minimal HTML error page
   (`go_error()`), styled the same as the app shell.
2. **Authentication** — unauthenticated users are redirected to `/account/` with
   `?next=/go/<code>` so they log in and come back.
3. **Join** — if the user is not yet an `event_participant`, an `INSERT` creates
   a **pending** row (with a generated `activation_code`, #163). If they already
   exist the row is **upserted** (reset to pending). The activity is logged.
4. **Participant context** — `set_participant_context()` + `setcookie('rb_participant',
   '1')` switch the UI to **participant mode**: reduced nav (only event‑scoped
   tools), home redirects to the event page.
5. **Redirect** — the browser lands on `/event/<slug>` where the participant sees
   the full roadbook gallery (public + `ready`) and the ranking link if applicable.

---

## 2. Participation status (#163)

| State | Meaning | Next step |
|-------|---------|-----------|
| `pending` | Joined but not yet activated | Organiser must activate from `/admin/events/participants/` |
| `active` | Activated, can consume roadbooks | Redirected to event page in participant mode |

The `/go/` handler always sets the participant cookie, even for `pending` users:
a pending participant already sees the reduced UI while waiting for activation.

---

## 3. Limits and quirks

- **Server-side only**, no JS: the error page includes the standard `app.js` shell
  but does not depend on it for the flow.
- **The activation code** (`gen_activation_code()`) is a random numeric string;
  it is stored per-participant row but not yet used by a self‑service activation
  flow (pending `P2.4`, #124).
- **Join code is case-sensitive**: the regex `^[A-Za-z0-9_-]+$` allows mixed case;
  matching against the DB is exact.
- **One click = one join**: the upsert means the same link can be clicked twice
  without error — it resets the row to `pending` and generates a new activation
  code each time.
