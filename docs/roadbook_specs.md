# Roadbook specs — tulip rendering & design decisions

How the RDBK roadbook **looks** and the product decisions behind it. The
machine-readable format lives in [rdbk-format.md](rdbk-format.md) and the public
[/standard](../public/standard/index.html) page; this is the "why + how it
renders" companion. Rendering code: `RB.ROAD_TYPES`
([roadbook-core.js](../public/assets/js/roadbook-core.js#L40)) and the tulip
renderer `NoteCanvas` / `ROAD_STYLE`
([note-canvas.js](../public/assets/js/note-canvas.js)).

---

## 1. Road types

`road_type` is an integer `0–4` on `road_type_in`, `road_type_out` and each
junction. Colours follow the **RB System roadbook palette**; the **road type is
read from line thickness** (with dash/double as extra cues).

| id | type | colour | tulip line |
|----|------|--------|------------|
| 0 | default | grey `#9aa4b2` | width 6, solid |
| 1 | motorway | blue `#3b82f6` | width 14, **double** |
| 2 | asphalt | green `#22c55e` | width 11, solid |
| 3 | track | red `#ff5a45` | width 8, solid |
| 4 | off-piste | red `#ff5a45` | width 5, **dashed** |

**Colour applies ONLY to the route to follow.** The trunk (the line through the
note — incoming + outgoing) is coloured by its road type; **everything else is
grey** — the junction branches you don't take, and the first note's empty
provenance. Grey lines still carry the **style** (single / dashed / double /
thickness) of their road type, so an off-route off-piste branch is grey-dashed,
a grey motorway branch is a grey double line, etc. (`default` 0 is grey, so a
default-type route segment is grey too.)

**Decisions**
- **Keep the RB System colours** (not a FIA-monochrome scheme) — RDBK is a
  multi-discipline roadbook (4x4, moto, bike, running) and these colours are the
  ones our users already read. See the FIA note below.
- **Colour = route to follow only; off-route = grey** (with style). See above.
- **Thickness carries the road type.** Widths step up in clear ~3px jumps so the
  type is legible at a glance — and it's the *only* type cue on grey off-route
  lines. (Previously track=5 / off-piste=4 differed by 1px → indistinguishable.)
- **Motorway = double line** (a white centre line splits the thick stroke).
- **Off-piste = dashed** — **butt caps** + `DASH` = `12 9` (red dash 12, white gap
  9). Butt caps because round caps swallow the gap at these widths.
- **Arrow is a fixed ~33px** for every road type (`markerUnits="userSpaceOnUse"`,
  `markerWidth=33`), large enough to protrude past the thick motorway line. The
  junction end-tick stays proportional to its (thin) line.
- **Two width sources, on purpose.** The **tulip** uses `ROAD_STYLE`
  (note-canvas); the **map polyline** uses `RB.ROAD_TYPES` widths. They are kept
  independent. Junctions are tulip elements → **width/dash/double from
  `ROAD_STYLE`**, colour always grey (off-route).

## 2. FIA note — why not monochrome

The FIA cross-country roadbook lexicon (Annexe III §5.14) is **monochrome**:
black tulips on white, where surface is shown by **directive pictograms** (Sight
driving!, Off-track forbidden, Follow principal track…) and **line style**, not
colour — and **red is reserved for DANGER** (a red line under the km = danger 2).

RDBK deliberately **keeps the RB System colour palette** (including red for
track/off-piste) as a product choice. Note the resulting overlap: RDBK also draws
its **danger marks in red** (`!`/`!!`/`!!!`), so red appears for both a surface and
a hazard — accepted, since thickness/dash already separate the road types. FIA
compliance work (icons + data model) is tracked in
[fia-lexicon-compliance.md](fia-lexicon-compliance.md) and issue #9.

## 3. Trunk (the main tulip line)

Reference box **230×162**, centre `(115, 81)`.
- **Incoming** segment enters straight from the bottom edge to the centre, styled
  by `road_type_in`.
- **Outgoing** segment leaves the centre with an arrow, **auto-oriented** to the
  real turn — its angle is `bearing_out − bearing_in` (the heading change across
  previous · note · next), so straight-up = carry on, right = turn right…  Styled
  by `road_type_out`.
- Colour: both segments are coloured by their **road type** (`road_type_in` /
  `road_type_out`) — this is *the route to follow*. The first note's incoming has
  no provenance and is drawn **grey**. Width/dash/double come from `ROAD_STYLE`.
- **Validation point:** a small open white circle where the two segments meet (the
  note's exact spot).

## 4. Junctions (bivi)

Side roads branching from the centre, each stored as
`{ pivot:[x,y], tip:[x,y], width, road_type }`.
- **Always grey** (`#9aa4b2`) — they are off-route. The road type shows only
  through **width/dash/double** from `ROAD_STYLE` (motorway = grey double,
  off-piste = grey dashed, …).
- Selecting a junction shows a road-type selector; picking a type sets its width
  from the ramp, and the +/- buttons fine-tune `width`.
- *(#67)* Junctions previously ignored road type for everything but the dash
  (hardcoded grey, fixed width) — now the **thickness/dash/double** track the
  type, while the colour stays grey per the route-only colour rule.

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
