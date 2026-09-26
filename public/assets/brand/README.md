# RDBK web brand assets

Original artwork supplied by Álvaro, generated with ChatGPT on 26 September 2026.
These are resized/compressed web exports, with no changes to the logo or photographs.
The original PNG files remain in Downloads.

| Web asset | Original filename |
| --- | --- |
| `offroad.webp` | `Imagen de ChatGPT 26 sept 2026, 19_09_37-1.png` |
| `moto.webp` | `0b10a47b-7fb5-4bc0-a51e-07a00aabec1c.png` |
| `bike.webp` | `Imagen de ChatGPT 26 sept 2026, 19_39_26.png` |
| `field.webp` | `Imagen de ChatGPT 26 sept 2026, 19_09_39-3.png` |

Every surface (website, PWA, iOS and Android apps) uses the transparent monochrome logo, charcoal
`#101313`, warm white `#f4f5f1` and orange `#ff7a1a` (slightly lighter than the artwork for legible
UI accents) — one palette in `app.css` `:root`. Orange fills use dark text. The tool illustrations
sit behind the option cards (`.card-art`: the app home, the Navigate hub, the page intros) on every
surface. Native launcher and store icons remain in their existing assets.

## Minimal website logo

Source: `Imagen de ChatGPT 26 sept 2026, 21_25_42.png`, supplied by Álvaro.
The built-in image_gen tool removes the black background and interior negative
space, leaving the white emblem on genuine alpha transparency.

- `logo-minimal.png`: full-resolution transparent master, 1254 × 1254.
- `logo-minimal.webp`: lossless 192 × 192 export for the web header and footer.
- `logo-minimal-prompt.txt`: the selected background-removal prompt.

Original generated master: `exec-8f54337e-554f-4401-b325-81dd7e0df51c.png`
in the generated_images directory below. The user’s original PNG is unchanged.

## Orange trail favicon

`favicon-trail.png` is a 96 × 96 export of Álvaro’s supplied
`Imagen de ChatGPT 26 sept 2026, 21_35_25.png`. The orange road and circle already
have alpha transparency in the source. The export preserves the artwork and its
transparent background, with no generation or recolouring. The white emblem
remains the website header/footer logo.

## Generated website illustrations

Created with the built-in `image_gen` tool. The complete prompt set is in
[`image-prompts.json`](image-prompts.json). The tool illustrations are conceptual
backgrounds, not screenshots of the application. They contain no language-dependent
labels; titles, descriptions, controls and FontAwesome icons remain HTML.

| Export | Subject |
| --- | --- |
| `tools/recorder.webp` | GPS trail, photo and audio markers |
| `tools/editor.webp` | Junction sketches, pencil and route planning |
| `tools/reader.webp` | Sequential roadbook notes and navigation bearing |
| `tools/tripmaster.webp` | Distance, heading and timing instruments |
| `tools/ranking.webp` | Checkpoint paths and results |
| `tools/events.webp` | Routes coming together for an organised event |
| `convoy.webp` | Three expedition vehicles, using the supplied logo reference |

Tool images are 900 × 600 WebP exports, loaded lazily. The convoy is a 1600 px
wide WebP used on `/4x4-overland/`. The supplied moto and bike photographs are
reused on `/moto-enduro/` and `/bike-mtb/`.

Original generated PNG files are preserved under
`~/.codex/generated_images/01a0decd-fb8a-7bf2-b98f-1810451c9615/`.

The three discipline pages include static English content, unique metadata,
canonical URLs, WebPage/BreadcrumbList structured data and sitemap entries.
Runtime translations use the existing EN/ES/IT/DE/FR language selector; there
are no separate language URLs or artificial hreflang alternates.
