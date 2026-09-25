# Roadbook specs — tulip rendering & design decisions

How the RDBK roadbook **looks** and the product decisions behind it. The
machine-readable format lives in [rdbk-format.md](rdbk-format.md) and the public
[/standard](../public/standard/index.html) page; this is the "why + how it
renders" companion. Rendering code: `RB.ROAD_TYPES`
([roadbook-core.js](../public/assets/js/roadbook-core.js)) and the tulip
renderer `NoteCanvas` / `roadMarkup`
([note-canvas.js](../public/assets/js/note-canvas.js)).

---

## 1. Road types

`road_type` is an integer `1–5`: the road a note leaves on (`road_type`, default
`2`), the road it arrives on (`road_type_in`, derived: the previous note's
`road_type`) and each junction's (`road_type`, default `2`). The **strokes are
the FIA Road Book Lexicon's** (Cross Country, 2026); the **colours are the app
palette's**. Every road is `RB.ROAD_WIDTH` = **8** units wide in the vignette.

| id | type | colour | tulip line |
|----|------|--------|------------|
| 1 | Tarmac | green `#22c55e` | **double**: the 8-wide stroke with a 2-wide white centre (`RB.DOUBLE_GAP`) |
| 2 | Track (default) | red `#ff5a45` | solid |
| 3 | Low-visible track | red `#ff5a45` | long–short dashes `24 8 8 8` |
| 4 | Off track | red `#ff5a45` | short square dashes `8 8` |
| 5 | Bike lane | purple `#532b78` | solid — the format's own; the FIA knows no bicycles (#561) |

**Colour applies ONLY to the route to follow.** The trunk (the line through the
note — incoming + outgoing) is coloured by its road type; the junction branches
you don't take are **grey** (`#9aa4b2`). Grey lines still carry the **stroke**
(solid / dashed / double) of their road type, so an off-route off-track branch
is grey-dashed, a grey tarmac branch is a grey double line.

**Decisions**
- **FIA strokes, app colours.** The stroke is the standard (a reader MUST draw
  each road with its stroke); the colour is the reader's choice, and RDBK keeps
  the colours its users already read — RDBK is a multi-discipline roadbook (4x4,
  moto, bike, running). See the FIA note below.
- **Colour = route to follow only; off-route = grey** (with its stroke).
- **One width for every road.** The type reads from the stroke (and, on the
  route, the colour) — never from thickness, so the grey branches stay legible.
- **Dashed roads use butt caps**: round caps swallow the gaps at this width.
- **Arrow is a fixed ~33px** for every road type (`markerUnits="userSpaceOnUse"`,
  `markerWidth=33`). The junction end-tick stays proportional to its line.
- **One renderer.** `roadMarkup` (note-canvas) draws every road — trunk and
  junctions, in the editor canvas and in `toSVG` — from `RB.roadType(id)`.

## 2. FIA note — why not monochrome

The FIA cross-country roadbook lexicon (Annexe III §5.14) is **monochrome**:
black tulips on white, where surface is shown by **directive pictograms** (Sight
driving!, Off-track forbidden, Follow principal track…) and **line style**, not
colour — and **red is reserved for DANGER** (a red line under the km = danger 2).

RDBK draws the FIA **line styles** but deliberately **keeps its colour palette**
(including red for track / low-visible track / off track) as a product choice.
Note the resulting overlap: RDBK also draws its **danger marks in red**
(`!`/`!!`/`!!!`), so red appears for both a surface and a hazard — accepted, since
the strokes already separate the road types. FIA
compliance work (icons + data model) is tracked in
[fia-lexicon-compliance.md](fia-lexicon-compliance.md) and issue #9.

## 3. Trunk (the main tulip line)

Reference box **230×162**, centre `(115, 81)`.
- **Incoming** road enters from the bottom edge to the centre, styled by
  `road_type_in`. The first note has none (#472).
- **Outgoing** road leaves the centre with an arrow, styled by `road_type`.
  The last note has none (#447).
- **Shape (#945):** each road takes the shape the author drew into the track:
  within 30 m of the note on its side (before it for the incoming road, after it
  for the outgoing one, stopping at the neighbouring note), 4 or more track
  points mean the road was drawn on purpose, and the tulip follows them as a
  smooth `<path>` (`RB.tulipShape` · `trunkRoads`) — simplified, rotated so
  `bearing_in` points up, scaled to the fixed length (in 73 px, out 63 px). Never
  back over the note, never over a junction the author drew. To curve an arrow,
  add points on the map; to straighten it, remove them. Otherwise the road is the
  **classic straight** one: the incoming vertical, the outgoing aimed where the
  road goes over its first 20 m (the stored first-metre bearing is GPS noise on
  a recorded track) — else
  outgoing **auto-oriented** to the real turn — its angle is
  `bearing_out − bearing_in` (the heading change across previous · note · next),
  so straight-up = carry on, right = turn right…
- Nothing of the shape is stored in the `.rdbk`: it is derived at render time
  (`RB.tulipContext`), so the Editor, the Reader, the public page, the PDF and
  the OpenRally export draw the same tulip. To change a shape, edit the track.
- Colour: both roads are coloured by their **road type** (`road_type_in` /
  `road_type`) — this is *the route to follow*. The stroke comes from
  `RB.ROAD_TYPES` through `roadMarkup`.
- **Validation point:** a small open white circle where the two roads meet (the
  note's exact spot).

## 4. Junctions (bivi)

Side roads branching from the centre, each stored as
`{ from:[x,y], to:[x,y], road_type? }` (`road_type` omitted when it is the
default track).
- **Always grey** (`#9aa4b2`) — they are off-route. The road type shows only
  through its **stroke** (tarmac = grey double, off track = grey dashed, …).
- Selecting a junction shows the road-type selector and Delete — nothing else:
  the width is every road's.

## 5. Danger

`note.danger` `1–3` renders as `!` / `!!` / `!!!` in **red** (`#e01414`),
top-left **inside** the diagram box (never in the text column). Red = danger.

## 6. CAP (heading)

`cap` + `cap_distance` give the heading to hold and over what distance.
- The bearing follows the **next waypoint** when one exists, otherwise the
  trackpoint bearing; it **re-follows the point if you move it**.
- **Known caveat (document for users):** if you add a waypoint while CAP is
  active, toggle CAP **off then on** to recompute it (same as RB Editor).

## 7. Editing model — track point vs waypoint (decided; see #61)

> Decided direction; implementation tracked in #61 (not yet fully shipped).

- A **waypoint is an enriched track point** — there is never a `trk` and a `wpt`
  at the **same coordinates**.
- **add point** = add a `trk`. **add note** = add a `wpt`: promote the selected
  `trk`, or create a new one if nothing is selected.
- Shortcuts at the cursor: **W** promote `trk→wpt`, **T** demote `wpt→trk`,
  **DEL** delete.
- Default map mode is **Move**: dragging a point moves its geometry and drags the
  connected track line with it.
