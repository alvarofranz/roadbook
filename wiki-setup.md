# Wiki Setup — Recap & Guidelines

## Content Map (no duplication)

| Directory | Audience | Purpose |
|-----------|----------|---------|
| `docs/` | Developers / maintainers | How the app is designed, built, works (architecture, API, internals) |
| `docs/wiki/` | End users | How to use the app (guides, workflows) |
| `public/wiki/` | Site visitors | HTML-rendered wiki pages served from the web app |
| Features HTML (public/) | Visitors / marketing | Recaps of key features for landing pages |

**Rule**: never duplicate content across these directories.

## Current state

- `docs/wiki/` has 5 guides: `01-getting-started.md`, `02-recorder.md`, `03-editor.md`, `04-reader.md`, `05-tripmaster.md`
- Wiki link added to account dropdown (`public/assets/js/app.js`) — both desktop and mobile
- `public/wiki/index.html` renders markdown via marked.js, served through `md.php` proxy
- Deep linking via URL hash (`/wiki/#recorder`): refresh stays on the same page
- Dynamic page title updates for SEO

## Deep linking & SEO

| Requirement | Implementation |
|-------------|----------------|
| Linkable pages | URL hash `#recorder`, `#editor`, `#reader`, `#tripmaster`, `#welcome` (empty hash = home) |
| Refresh stays on page | `history.replaceState` on `showPage()`, init reads `location.hash` |
| Shareable URLs | `/wiki/#recorder` links directly to the Recorder guide |
| Page title | Updated dynamically via `document.title` per page |
| Search indexing | Hash-based URLs are indexable by Google; for full SEO consider server-side rendering or `<meta>` tags per page |

**Next improvement**: server-side rendering of initial page content based on URL hash for crawlers that don't execute JS.

## Technical implementation

```
docs/wiki/*.md         ← source (edit here)
       ↓
public/wiki/md.php     ← PHP proxy, reads .md from docs/wiki/, serves as text/markdown
       ↓
public/wiki/index.html ← JS fetches md.php?page=XX, renders via marked.js
       ↓
/wiki/                 ← served directly by Apache (real directory with index.html)
/wiki/#recorder        ← hash-based deep linking
```

## Architecture

The wiki is **part of the SPA**: it shares `app.js`, `app.css`, the header, the account dropdown, and the styling system.
