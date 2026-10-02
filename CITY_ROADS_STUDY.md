# CITY ROADS STUDY — asphalt streets between buildings (2D + 3D)

**Date:** 2026-10-02 · **Status:** NET-F chosen by user + **IMPLEMENTED
(uncommitted, not deployed)** — see §3 NET-F.
**Ask (user):** *"do a study on how to add these types of roads design between
buildings in the 2D and 3D views, only where have buildings"* + first reference
image (orthogonal grid, double yellow, crosswalks). **Refined (same day):**
*"all buildings use a square space, i would like the roads to go around each
building"* + second reference image (each block framed on all four sides by
solid asphalt, shared roads between blocks, no markings).

## 0. What the reference image specifies

A classic orthogonal street grid (iso city-builder screenshot). The road anatomy,
element by element:

| Element | In the image | Translation for our map |
|---|---|---|
| Asphalt | medium-dark grey surface, subtle grain | flat dark fill (`#4A4F52`-ish); grain optional (skip — the map language is flat) |
| Centerline | **double solid yellow** lines down the middle | two thin `GOLD`-family lines (reuse `#F5C518`) |
| Lane dashes | white dashed side markings | white (`paper #F4F1E8`) dashes, zoom-gated |
| Crosswalks | white zebra stripes at every intersection | zebra of 4 stripes at street intersections |
| Sidewalks | light tiled pavement flanking every road | light beige strips (`#E8E2D2`); in 3D a raised curb |
| Intersections | plain boxes, no roundabouts | asphalt simply overlaps — nothing to build |
| Network shape | orthogonal grid connecting built blocks | must be adapted — see §3 (our cities are radial rings) |

**"Only where have buildings"** decoded as three hard rules (formalized in §4):
M1 no asphalt outside a city's plot; M2 a street segment renders only when it is
adjacent to at least one real building cell; M3 zero-building cities (0-hire
players) get no streets at all. The green field never gets asphalt.

Style note: photoreal asphalt on the Blueprint map is NOT a contradiction — the
map already mixes media (avatar photos on ink footprints). Streets become the
map's "infrastructure" layer, like the avatars' photo layer.

## 1. Where roads live today

| What | Where | Today |
|---|---|---|
| 2D ownership roads | `drawRoad` — `src/lib/city/map2d/draw.ts:68` | thin dashed `#5A7186` line, plot-center → plot-center |
| 2D draw order | `CityMap2D.draw()` — `CityMap2D.tsx:143` | field bg → **city floors** (grey pre-pass) → ownership roads → per-plot (pad → heist marks → props → buildings → landmarks → HQ → label) |
| 3D ownership roads | `engine.ts:735` | `LineDashedMaterial` center-to-center, y=0.03 |
| 3D build order | `setWorld` — `engine.ts:644` | ground+grid → pads/labels → roads → instanced buildings → protection rings → landmarks/props/HQ |
| Space between buildings | `OBJECT_GAP_FACTOR 0.85` — `draw.ts:24` (knob D1.5) | footprint × 0.85 per cell → shared edge gap of exactly **0.15 cell** between neighbors — an alley, not a road |
| Floors (in flight, uncommitted) | `drawCityFloor` draw.ts:387 / `FIELD`,`CITY_FLOOR` engine.ts:47 | grey plot squares on the green field — streets will sit ON this grey (consistent with the floor study's D2-A "roads cross the grey") |

Key structural fact: **there are no streets inside a city today.** Buildings fill
every cell of every ring 3..radius wall-to-wall (`layoutCity` walk —
`layout.ts:189`), ring 2 is the airy landmark moat, rings 0–1 the HQ core.
"Roads between buildings" therefore requires either reserving street cells in
the layout (NET-1/NET-2 below) or painting roads into the visual gaps (NET-3).

## 2. Load-bearing facts the design must respect

- **Rings fill completely** — a ring is either absent, partial (only the
  outermost one, filled clockwise from 12 o'clock), or full. `radius` = the last
  ring that received a building (`layout.ts:209`).
- **Fixed special cells on ring 3**: the five `PROP_CELLS` sit at the compass
  mids + NE corner (`layout.ts:57`) — any street line crossing ring 3 must break
  at prop cells (the prop becomes street frontage). Landmarks hold ring 2.
- **Determinism is the product**: every viewer derives the identical map from
  the same payload. Any street derivation must be a pure function of
  `CityLayout` — no randomness beyond seeded, no viewer state.
- **The value-ring metaphor is the game's core visual** (priciest innermost).
  All options below keep the fill ORDER untouched — streets only add skip rules,
  so the value gradient stays radial.
- **Static-draw ruling** (2D) and **minimal-engine ruling** (3D: no textures, no
  addons, no LOD ladders) — streets must be plain canvas fills and merged
  vertex-colored geometry.
- **Bounded rendering**: 2D streets gated per visible plot; 3D streets one
  merged mesh per world rebuild, disposed by the existing `clearWorld` traverse.

## 3. Network shape — CHOSEN: NET-F (roads around each building)

**USER PICK (2026-10-02 evening, second reference image): NET-F — the block
frame lattice.** Every occupied cell keeps its square; roads FRAME each square
on all four sides; adjacent buildings share one road; empty ground gets
nothing. This supersedes the shape question below — implemented as:

- **Derivation** `src/lib/city/map2d/streets.ts` (pure): the occupied set =
  building cells ∪ prop cells ∪ landmark slots ∪ the 3×3 HQ core (ONE
  superblock — interior core edges suppressed). A boundary line segment is
  road iff AT LEAST ONE adjacent side is occupied; consecutive cells merge
  into maximal runs (`StreetPlan {v[], h[]}`). Width `STREET_WIDTH = 0.15` =
  1 − OBJECT_GAP_FACTOR, so the frame fills the existing visual alley
  EXACTLY — zero layout change, zero position change, no footprint ever
  touches asphalt (widest grand tier leaves 0.0875 half-gap vs 0.075 road
  half-width). Changing OBJECT_GAP_FACTOR must re-price STREET_WIDTH.
- **2D** `drawStreets` (draw.ts): opaque asphalt rects per run, ends extended
  STREET_WIDTH/2 so perpendicular runs join corners gaplessly; width clamps
  at 0.8px so the grid still reads at whole-world zoom. Drawn per visible
  plot after the pad, before heist marks/props/buildings. Plans memoized
  (O(radius²) — never re-derived during drag frames).
- **3D** (engine.ts `setWorld`): ONE merged vertex-colored slab mesh for the
  whole world via the GeoWriter (runs → flat boxes y 0.02→0.04, Lambert,
  receiveShadow — building shadows land across the paving; ends extended
  STREET_WIDTH/2 to close corners; not raycastable). The dashed ownership
  roads lifted y 0.03 → 0.045 so they thread above the slabs.
- **Colors**: asphalt `#4A4F52` (`BLUEPRINT.street.asphalt` canonical, engine
  `STREET_ASPHALT` mirror). No markings (the block-frame reference has none)
  — double yellow / zebra from the first reference remain an optional later
  layer on the same runs.
- **Tests**: `src/lib/__tests__/city/map2d-streets.test.ts` (8 cases: lone
  building framed, shared interior roads, empty city = HQ-only frame, core
  superblock suppression, unbuilt arcs clean, props/landmarks framed,
  determinism, boundary-lines-only).

The three originally studied shapes, kept for the record:

### NET-1 — Ring boulevards + diagonal spokes (was the recommendation)

Keep the radial identity. Bands of 2 building rings separated by 1 full street
ring; 4 diagonal spokes connect the bands.

- **Street rings**: 5, 8, 11, … (stride S=3: build rings 3,4 | street 5 |
  build 6,7 | street 8 | …). The walk in `layoutCity` skips street rings exactly
  like it skips prop cells today.
- **Spokes**: the four corner columns `(r,−r) (r,r) (−r,r) (−r,−r)` for r ≥ 3 —
  4 cells per build ring. Only collision: `goldvault` at `(3,−3)` — the spoke
  breaks there (prop = frontage). Compass axes are NOT used because all four
  ring-3 mids are prop cells.
- **Moat ring road (RD-M)**: ring 2's ten non-landmark cells become a ring road
  around the HQ core — this is what gives SMALL cities (< 57 buildings, no
  street ring yet) a road at all. Requires ≥1 building (M3).
- Look: a proper radioconcentric street network — square ring roads with double
  yellow following the ring, crosswalks where spokes cross street rings. Reads
  as "these types of roads" while staying OUR city shape.

### NET-2 — Orthogonal block grid (most literal to the image)

Street cells = every cell with `x ≡ 0 (mod 3)` OR `y ≡ 0 (mod 3)` in CITY-LOCAL
coords, within the build region (chebyshev ≥ 3 — the HQ core + moat stay a
car-free superblock). Blocks are 2×2 building cells. The ring walk skips street
cells; value order unchanged.

- Look: the reference exactly — a rectangular street grid with intersections
  every 3 cells, crosswalks at each, double yellow along every line.
- Cost: capacity drops to ≈ 4/9 of the annulus → cities grow ≈ ×1.5 radius
  (table below); the most test churn; the radial value gradient is slightly
  harder to read through the grid.

### NET-3 — Gap underlay (zero layout change, lowest fidelity)

Paint asphalt INTO the existing `OBJECT_GAP_FACTOR` lattice: for every pair of
adjacent building cells, the shared 0.15-cell strip becomes asphalt (optionally
deepen D1.5 0.85 → ~0.72 for 0.28-cell streets). No positions change, no test
churn, no world spread. Look: streets-as-grout — a connected alley lattice under
the footprints; no room for double yellow or crosswalks until zoomed far in.
Cheapest, weakest match to the reference.

### Spread cost (plot half = `radius + 1.6`, drives world packing)

| Buildings | today R / half | NET-1 R / half | NET-2 R / half |
|---|---|---|---|
| 24 | 3 / 4.6 | 4 / 5.6 (moat road only) | 4 / 5.6 |
| 100 | 6 / 7.6 | 7 / 8.6 | 8 / 9.6 |
| 400 | 10 / 11.6 | 13 / 14.6 | 15 / 16.6 |

NET-1 ≈ +13–22% radius (interacts with the CITY_PLACEMENT_STUDY spread knobs
C5/C7/W4 — same trade axis, one decision). NET-3: +0%.

## 4. Core mechanism — the street segment raster (shared by BOTH renderers)

One new pure module, `src/lib/city/map2d/streets.ts`, so 2D and 3D can never
drift (the same device as `layout.ts`):

```ts
interface StreetSeg { x: number; y: number; w: number; h: number; kind: "ring" | "spoke" | "grid" | "alley" }
interface StreetCross { x: number; y: number }          // intersection centers
interface StreetPlan { segs: StreetSeg[]; crossings: StreetCross[] }

export function planStreets(plot: WorldPlot): StreetPlan
```

Pipeline inside `planStreets` (all pure, all unit-testable):

1. **Candidate cells** — the street cells the chosen NET defines (street rings /
   spoke columns / grid lines / adjacency gaps).
2. **Adjacency mask (M2, the ask's core rule)** — split candidates into
   unit-length axis-aligned segments; keep a segment only if it borders ≥ 1
   actual building cell (landmarks/props count as frontage for the moat ring
   only). This is what makes partial outer rings, small cities and every "only
   where have buildings" case come out right by construction.
3. **Occupancy exclusion** — segments never overlap building/prop/landmark/HQ
   cells (streets break at the five ring-3 props, goldvault's spoke cell, …).
4. **Run merging** — merge collinear adjacent segments into maximal rects
   (a full street ring = 4 rects, not 8r) → cheap draws, few crossings.
5. **Crossings** — emitted where perpendicular runs intersect (crosswalk spots).

Determinism: derived from `CityLayout` only. Zero-building cities return an
empty plan (M3). The plan is computed inside the existing `layoutWorld` memo /
`setWorld` — no new fetch, no payload change, no API/DB/i18n surface.

## 5. Road style layer (RD knobs — shared vocabulary)

Palette block in `map2d/palette.ts` (2D canonical; 3D mirrors with
"matches palette" comments, exactly like `FIELD`/`CITY_FLOOR` do today):

```ts
street: {
  asphalt: "#4A4F52",   // on grey #808080 floor — reads as paving, not shadow
  sidewalk: "#E8E2D2",  // the reference's light tiled pavement
  yellow: "#F5C518",    // = GOLD — one yellow family map-wide
  white: "#F4F1E8",     // = paper — dashes + zebra
},
```

| Knob | Default | Notes / alternatives |
|---|---|---|
| RD-W asphalt width | 0.62 of the street cell | sidewalks 0.19 each side fill the rest; 0.75 = heavier traffic look |
| RD-S sidewalks | on, both sides, 0.19 | off = raw asphalt edge-to-edge |
| RD-L centerline | double solid yellow, on ring/grid runs | single line at low zoom; skip on alleys (NET-3) |
| RD-D lane dashes | white, long runs only | 0.35-on / 0.35-off cell units |
| RD-X crosswalks | zebra ×4 stripes at crossings | NET-1: spoke×ring only (few, readable); NET-2: every intersection (zoom-gated) |
| RD-M moat ring road | ON (small-city coverage) | off = ring 2 stays green moat |
| RD-G grain | off | flat fills — the Blueprint language; a seeded speckle pass is possible but not recommended |
| RD-K ownership roads | keep today's dashed `#5A7186` | they are a different semantic (ownership edges between cities); restyling them as asphalt highways is a separate later decision |

**2D zoom gates** (the `AVATAR_MIN_PX` pattern): asphalt paints whenever a
street is visible at ≥ 2 px/cell; sidewalks ≥ 4 px street width; double yellow
≥ 5 px; dashes/zebra ≥ 8 px. At whole-world zoom streets read as dark paving
lines crossing the grey — the "built-up" texture — with zero marking noise.

**3D height ladder** (z-fight-safe, fits the existing one):
ground 0 → grid 0.01 → city floor 0.02 → **asphalt plane 0.03** → **markings
0.04 (flat quads)** → **sidewalk curb boxes h=0.04 (top 0.06)** → existing
you-edge 0.05 / protection rings 0.07 unchanged.

## 6. 2D implementation plan

1. `palette.ts`: add the `street` block above.
2. `streets.ts`: the pure planner (§4).
3. `draw.ts`: three flat painters — `drawStreetRun` (asphalt rect + sidewalk
   rects + double yellow + dashes, all gated by px width), `drawCrosswalk`
   (4 white stripes spanning the asphalt), and a `drawStreets(plan, …)` wrapper.
   Static strokes only — no clock, no rAF.
4. `CityMap2D.draw()`: per visible plot, immediately after `drawPlotPad`
   (before heist marks/props/buildings) — streets sit ON the grey floor, UNDER
   everything built. The world ownership-road loop is untouched.
5. Hit-testing unchanged — street cells have no building so a tap falls through
   to the existing "plot" branch (selects the city). No new i18n strings.

## 7. 3D implementation plan (`map3d/engine.ts`)

1. Mirror the street colors next to `FIELD`/`CITY_FLOOR`.
2. In `setWorld`, after the pad loop: build **two merged meshes for the whole
   world** from the per-plot plans —
   - paving mesh: asphalt quads + sidewalk curb boxes, `MeshLambertMaterial(
     vertexColors: true)`, `receiveShadow = true` (building shadows land ON the
     streets — the reference's look, free);
   - markings mesh: yellow/white quads at +0.01 above asphalt,
     `MeshBasicMaterial(vertexColors: true)` so paint stays bright unlit.
   Write both with the existing GeoWriter quad style (flat boxes/planes — no
   textures, no addons; minimal-engine ruling respected). Not added to
   `raycastables` (tapping a street behaves like tapping the floor today).
3. `clearWorld` already disposes group geometries/materials via its traverse —
   the merged meshes ride along; nothing else changes (camera, fog, sun,
   instancing, catalog plates untouched).

## 8. Parity + invariant checklist

- [ ] One derivation (`streets.ts`) consumed by both renderers — parity by
      construction; 3D mirrors only hexes (established pattern).
- [ ] Deterministic: pure function of `layoutWorld` output; every viewer
      identical; static-draw + render-on-demand rulings untouched.
- [ ] "Only where have buildings" enforced by M1–M3 + the adjacency mask, and
      pinned by tests (empty city ⇒ empty plan; partial ring ⇒ no street on the
      unbuilt arc; prop/landmark cells never paved).
- [ ] No street cell is a building cell (guaranteed by the skip rules; pinned).
- [ ] Bounded: 2D visible-gated; 3D +2 merged meshes per world rebuild.
- [ ] No economy/DB/API/i18n/sound surface; `/api/city/world` payload unchanged.
- [ ] NET-1/2 update `src/lib/__tests__/city/map2d-layout.test.ts` (fill
      expectations, radius, plot half) + add `map2d-streets.test.ts`; NET-3
      changes no layout test.
- [ ] /catalog, PublicCityView (DOM tiles), plate renderer: unaffected — do not
      "fix" streets into the catalog.

## 9. Verification plan (when implemented)

1. `npx tsc --noEmit` + `npm run lint` + `npm run build`; vitest suites green
   (`map2d-layout`, new `map2d-streets`, `map3d-*` untouched).
2. Dev-server pass on `/city` in BOTH views (`?view=3d`):
   - streets only where buildings are (zoom to a small city, a 0-hire city, a
     partial-ring city, the field between cities);
   - double yellow reads on ring/grid runs; zebra visible at high zoom;
     sidewalks/curbs present; ownership dashes still distinct;
   - 3D: shadows fall across asphalt; no z-fighting at any zoom; one-frame
     rebuild cost sane on the big world.
3. image-analyst pass on 2D + 3D screenshots vs the reference before shipping.

## 10. Knob registry — post-NET-F state

| Knob | Value shipped | Notes |
|---|---|---|
| Network NET | **NET-F block frame lattice** (user pick) | NET-1/2/3 remain in §3 as rejected alternatives |
| Street width | `STREET_WIDTH 0.15` = 1 − OBJECT_GAP_FACTOR | fills the existing alley exactly; re-price if D1.5 changes |
| Framed objects | buildings + props + landmarks + HQ superblock | HQ always framed (anchor building); "buildings only" would need a plan flag |
| Asphalt | `#4A4F52` | 2D `BLUEPRINT.street.asphalt` canonical, 3D `STREET_ASPHALT` mirror |
| Markings | **solid slim white centerline** (user asks 2026-10-03: "white line in the middle" → "dashes too big, slim constant line" → "half the thickness") — `STREET_MARK {width 0.0125}` shared by both views; 2D hairline stroke gated at cell ≥ 7px, 3D one unlit paint strip per run at y 0.048–0.052 | 0.025 = previous weight · 0.03–0.04 heavier |
| Ownership roads RD-K | keep dashed (lifted to y 0.045 in 3D) | asphalt restyle still a separate decision |
