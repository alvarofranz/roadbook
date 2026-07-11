# i18n-edit — in-context translation editor

An **admin-only** tool that turns every translatable label on the current page into
an in-place editable field. Edits preview live, accumulate across pages in
`localStorage`, and can be exported as a paste‑ready delta for the i18n source
files.

> Module: [i18n-edit.js](../public/assets/js/i18n-edit.js). Loaded dynamically by
> `app.js` only for admin users. Part of the i18n system documented in [i18n.md](i18n.md).

---

## 1. Activation

- **Toggle button**: a floating `fa-language` icon in the bottom‑right corner of
  the page. Click toggles edit mode on/off. Its state (`rb_i18n_edit` in
  `localStorage`) persists across navigation.
- The toggle is only injected when `RBt`, `RBModal`, `RBi18nLangs` and `RBi18n`
  are all available — meaning it only activates on pages that load the full i18n
  stack.

When **edit mode is on**:

- A floating bar appears at the bottom with:
  - **Page labels** — opens an editor for all translatable keys on the current page
  - **Export** — opens the delta export modal (with a pending‑count badge)
  - **Done** — turns edit mode off
  - A hint: *right‑click a label to edit it*
- **Right‑clicking** any translatable element opens a single‑key editor popup.

---

## 2. Editing workflow

1. **Edit**: type the new translation in any language field. The page updates live
   (the `RBi18n.set` call re-applies the current language with the edited dict).
2. **Persist**: every keystroke saves to every language's delta in `localStorage`
   (key `rb_i18n_delta`). Edits survive page reload and navigation.
3. **Reset a key**: clears all language deltas for that key; the live dicts still
   hold the typed value until the next reload.

### Works on 7 attribute types

`data-i18n`, `data-i18n-html`, `data-i18n-ph`, `data-i18n-title`, `data-i18n-aria`,
`data-i18n-tip`, `data-i18n-content`.

---

## 3. Export

The **Export** button produces a text block with the changed keys per language,
annotated with the target file path:

- English → `T.en` in `i18n.js`
- Other languages → `window.RBi18nLangs.<lang>` in `i18n.<lang>.js`

The exported text includes a **UTF-8 BOM** so Windows tools correctly read
accents. From the export modal the admin can **Copy**, **Download** (as
`i18n-delta.txt`), or **Clear** all pending edits.

---

## 4. Limits and quirks

- **Admin-only**: the script exits early if `RBt`, `RBModal` or `RBi18nLangs` are
  absent. It is loaded by `app.js` only for admin sessions.
- **Nothing is served from a DB**: translations are always served from static JS
  files. The editor only produces a delta to commit — it never writes to the
  server.
- **English editing**: English keys work the same way — edits go into the `delta`,
  and the export targets `T.en` in `i18n.js`. The source phrase is shown as the
  key itself (because English fallback = key).
- **Batch export only**: there is no per‑key publish; the admin edits many pages,
  then exports once and commits the resulting diff.
- **`innerHTML` on `data-i18n-html`**: the edited value is set via `innerHTML` on
  the live page. Since only admins can activate edit mode this is acceptable.
