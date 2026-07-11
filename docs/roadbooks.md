# Public roadbooks gallery (`/roadbooks/`)

The full community gallery: all public roadbooks with **client-side search + pagination**.
A companion to the home-page teaser (6 items) — here the user browses, searches, and
copies links to the entire public listing.

> The page is a thin IIFE in [roadbooks.js](../public/roadbooks/roadbooks.js) on a static
> template ([index.html](../public/roadbooks/index.html)). The data comes from
> `RBChallenges.listPublic()` — the same endpoint as the home teaser.

---

## 1. Data and rendering

`RBChallenges.listPublic()` → `public_list` API returns up to 60 public roadbooks
(`status = 'public'`) ordered by `updated_at`. Each item carries `slug`, `title`,
`total_distance`, `note_count`, `username` and `thumb` (cover or first photo).

`render()` (`roadbooks.js:33`) filters the list client-side with
`RB.filterByText(all, q, ['title', 'username'])`, paginates at **12 per page**
(`PER`), and builds cards via `RBGalleryCard` — the same shared helper used by
the home gallery and event listings. Each card links to `/challenge/<slug>`.

### Card overlays

| Button | Action | Visible to |
|--------|--------|------------|
| Copy link | `RBCopy(RBReaderLink(slug))` | everyone |
| Make private | Calls `admin_unpublish` | **admins only** (moderation, #237) |

---

## 2. Search

The search input (`#rbSearch`) appears unconditionally (unlike `RBRoadbookList`
which hides it under 5 items). It filters **both `title` and `username`**
(`roadbooks.js:34`) as the user types, re-rendering immediately. On language
switch (`rb-lang` event) the page re-renders labels.

---

## 3. Error vs empty

The API distinguishes two empty states (`roadbooks.js:47-50`):

| Condition | Message |
|-----------|---------|
| `listPublic()` returns `null` (network error) | "Could not load roadbooks." |
| `listPublic()` returns `[]` (no public roadbooks) | "No public roadbooks yet." |

Both hide the search bar.

---

## 4. Limits and quirks

- **Same endpoint as the home teaser** (`public_list`, max 60 items): the gallery
  cannot grow beyond 60 — it is a snapshot of the most recent, not a full searchable
  index.
- **No server-side pagination**: all 60 are loaded at once and filtered/paginated
  client-side.
- **Admin controls are fetched in parallel** (a second `RBApi('config')` call) to
  decide whether to show the "Make private" overlay.
- **The card link is the whole card**: overlay buttons must `stopPropagation` to
  avoid navigating to the challenge page when clicked.
