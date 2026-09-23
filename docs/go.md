# Entry gate (`/go/<code>`)

The short‑link entry point for event participants. A participant receives a
**join code** (e.g. `DA2C0926`) at the registration desk — printed as a QR code
on a card or sent as a link. Opening `/go/<code>` handles authentication, asks the
newcomer to confirm, joins the event, and redirects to the event page in
**participant mode**.

> The handler is a single PHP script: [go/index.php](../public/go/index.php), rendered
> server-side on the shared shell of `app/page.php` (the same icons, styles, scripts and
> cache-buster as the stamped pages — the header, the tab bar and the translation of its
> `data-i18n` labels come from `app.js`). Referenced by [events.md](events.md) §8.

---

## 1. URL scheme and flow

```
/go/<join_code>  ──▶  1. validate code
                       2. authenticated?     ──no──▶  /account/?next=/go/<code>
                       3. already joined?    ──yes─▶  5.
                       4. gate open? ──no──▶ /events/?link=closed|ended
                          GET  → "Join <event>?" page (Join · Not now)
                          POST → enrol (status from the activation setting)
                       5. set participant context + cookie → /event/<slug>
```

**Steps:**

1. **Validate** — the code (A–Z 0–9, plus `-`/`_` for links printed before #576,
   matched upper-cased) must be an event's `join_code`. Listed or not, the link reaches
   the event (#573). An unknown code lands on `/events/?link=invalid`, which explains it
   in the visitor's language (#579).
2. **Authentication** — a signed-out visitor goes to `/account/` with
   `?next=/go/<code>`, signs in and comes back.
3. **Already in** — someone already a participant goes straight to step 5: joining is
   idempotent (#574) and there is nothing to ask.
4. **Confirm, then join** — a newcomer passes the same checks as `event_join`
   (`event_registration_refusal`: a `closed` gate or an ended event lands on
   `/events/?link=closed|ended`). Opening the link never enrols anyone by itself — a GET
   can be fired by a prefetch, an `<img>` on another site or a link preview — so the GET
   renders the event title with **Join** (a `<form method="post">` back to `/go/<code>`)
   and **Not now** (the event page, without joining). The POST is same-origin only
   (`require_same_origin`), rate-limited like `event_join`, and enrols through the shared
   `event_enrol`: `pending` with a personal QR when the event requires activation, else
   `active` at once (#414). The activity is logged.
5. **Participant context** — `set_participant_context()` + `setcookie('rb_participant',
   '1', …)` switch the UI to **participant mode**: reduced nav (only event‑scoped
   tools). The cookie is a UX flag the header reads in JS (so **not** `HttpOnly`); it
   carries `Secure` (on HTTPS) + `SameSite=Lax`. Then the browser lands on
   `/event/<slug>`.

The **native app** never shows this page: its App-Links deep link (`native/src/deeplink.js`)
runs `event_join` through the API with the code, then opens the event page (#268). Signed out,
the code is kept on the device (`rb_pending_join`) and the app goes through the sign-in page
(`RBLoginUrl()`, back to the page it was on), where the stored code joins on the next load.

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

- **The activation code** (`gen_activation_code()`) is a random string stored
  per-participant row; the organizer activates it from `/admin/events/participants/`
  (typed or QR-scanned), and the pending user sees their own code on the event page.
- **One join, however many opens**: `event_enrol` keeps whatever an existing participant
  already has — an active participant is never sent back to pending by a second open.
