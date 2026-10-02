# CITY PLACEMENT STUDY — the math behind every building position (2D + 3D)

*(2026-10-02. Read-only study: nothing in the code was changed. Every formula
below carries an ID — S/C/W/D/T — so adjustment instructions can reference them
directly, e.g. "C5: start buildings at ring 4" or "D2: flatten the footprint
ladder". File + line numbers point at the live implementation.)*

---

## 0. The one-sentence architecture

Both views render **the same geometry**: `GET /api/city/world` ships one
deterministic payload, `layoutWorld()` (pure, `src/lib/city/map2d/layout.ts`)
turns it into integer cell coordinates, and the only difference between the
"2D" and "3D" toggles is the *interpreter* — CityMap2D draws each cell as a
flat square scaled by `tierScale`, CityMap3D extrudes each cell into compiled
card-art volumes where **1 cell = 1 world unit**. Change anything in §2–§4 and
both views move together; change something in §5 (D-series) and only the 2D
view reacts; §6 (T-series) is 3D-only.

```
/api/city/world (route.ts, S1–S6)
        │  cities[] each: buildings value-desc, tier/family/protection precomputed
        ▼
layoutCity  (map2d/layout.ts, C1–C7)   per-city rings: HQ → landmarks → props → buildings
        ▼
layoutWorld (map2d/layout.ts, W1–W7)   city plots on world rings: biggest at center
        ▼
 ┌──────┴──────┐
CityMap2D      CityMap3D → map3d/engine.ts + art-geometry.ts (D-series)   (T-series)
```

---

## 1. Inputs — what the server decides before any layout runs

Nothing about *position* is stored anywhere. Position is fully derived, per
refresh, from economy state. The server computes six things per building/city:

### S1 — Visual tier (drives ALL size/height everywhere)
`src/lib/city/projection.ts:129` — `buildingTier(value, floor)`:

```
tier = clamp(1 + floor(log2(max(1, value / floor))), 1, 14)
```

`value_floor` defaults to **1** (`src/db/schema/users.ts:14`), so in practice
**tier = log2 of the card's credit value**: value 1–2¢ → t1, 1000¢ → t10,
8192¢+ → t14 (the ceiling). Each *doubling* of a card's value = +1 tier.
The client never recomputes this — it renders the shipped tier.

- **Qualitative result**: a 1M¢ card (t20 → clamped 14) and an 8k¢ card (t14)
  look identical; a 400¢ card (t9) and an 800¢ card (t10) look one step apart.
- **Knobs**: the log base (2 → coarser; 1.5 → finer gradation), the clamp
  ceiling (14), per-user `value_floor` (already a DB column — raising a
  player's floor shrinks all their buildings' tiers).

### S2 — Family index (color in 2D, massing palette in 3D)
`src/lib/city/map2d/families.ts:15` — index 0–5 = the CARD's own profession in
`PROFESSIONS` order (Cryptographer, Zero-Day, Overclocker, Cache Keeper,
Server Marshal, Bot Herder), 6 = no trade. Not the city owner's trade.

### S3 — Sort order = ring order
`src/app/api/city/world/route.ts:132` — buildings fetched
`ORDER BY player_value DESC, id ASC`. **The array order IS the layout order**
(innermost ring first). Ties break by card id ascending.

### S4 — HQ stage
`src/lib/city/projection.ts:94,100` — `heroStageOf(ownerValue, gameMax)` with
`HERO_STAGE_FRACTIONS = [0.05, 0.5]`: owner ≥ 50% of the game's max value →
stage 3, ≥ 5% → stage 2, else 1. Only affects HQ visuals (D4/T3).

### S5 — Landmark set
`route.ts:170` + `layout.ts:74` — owned Founder cards, canonicalized to the
fixed `GODDESS_USERNAMES` order so hex slots never permute between refreshes.

### S6 — Album props
`route.ts:239` — completed blueprint albums ship as prop keys
(`park, marquee, rotunda, crane, goldvault`); each will *displace* a building
cell (C4).

---

## 2. City layout — rings around the HQ (`layoutCity`, map2d/layout.ts)

A city lives on an integer square grid. Its "radius" r means the square ring
at Chebyshev distance r from the HQ center.

### C1 — Ring walk `ringCellsClockwise(r)` (layout.ts:25)
Ring r holds **8r cells**, walked clockwise from 12 o'clock: top edge
left→right, right edge top→bottom, bottom edge right→left, left edge
bottom→top. The first cell of every ring is its **top-left corner (−r, −r)**.

### C2 — HQ core (layout.ts:46)
`HQ_CORE_RADIUS = 1` → the HQ owns the full 3×3 center (rings 0–1, 9 cells).

### C3 — Founder landmark slots (layout.ts:36)
Fixed hexagon **on ring 2**: N (0,−2), NE (2,−1), SE (2,1), S (0,2),
SW (−2,1), NW (−2,−1) — filled in canonical goddess order (S5), so your first
owned Founder always takes the N slot, second the NE slot, etc. Ring 2's other
16 cells stay **permanently empty** (the "moat").

### C4 — Album prop cells (layout.ts:57)
One fixed ring-3 cell per completed album, at compass points, **reserved
before the building walk** so buildings fill around them: park N-mid (0,−3),
marquee E-mid (3,0), rotunda S-mid (0,3), crane W-mid (−3,0), goldvault NE
corner (3,−3). A completed album visibly costs exactly one innermost-ring
building slot.

### C5 — First building ring (layout.ts:190)
Buildings start at `r = HQ_CORE_RADIUS + 2 = 3`. Ring 3 is the innermost
(highest-value) building ring.

### C6 — Fill rule (layout.ts:191–208)
For each building in array order (= value desc, S3): take the **first free
cell of the current ring** in C1 walk order; only when the ring is completely
full does the walk move to r+1. This is deliberately restart-scan (the old
mockup bug of one-building-per-ring must never return).

**Ring capacities** — ring r holds 8r; cumulative from ring 3:
`4·(r+3)·(r−2)`:

| ring | 3 | 4 | 5 | 6 | 7 | 8 | … | ~35 |
|---|---|---|---|---|---|---|---|---|
| cells on ring | 24 | 32 | 40 | 48 | 56 | 64 | … | 280 |
| cumulative | 24 | 56 | 96 | 144 | 200 | 264 | … | ~5000 (mission-8 portfolio) |

With all 5 props complete, ring 3 has 19 building cells.

### C7 — City radius & plot half (layout.ts:209–214)
`radius = max(3, last ring reached)`; the city's world footprint is
`plotHalf = radius + PLOT_PAD_CELLS` with **PLOT_PAD_CELLS = 1.6** (layout.ts:154).

### Qualitative behaviors this produces (adjustment candidates)

1. **Top-left/clockwise bias.** Every ring starts walking at its NW corner and
   stops at the first free cell, so a young city (say 6 buildings) is an *arc*
   hugging the N→E of ring 3 with the whole S/W empty — not a centered
   cluster. The HQ looks off-center inside its own moat until ~24 buildings.
2. **Value = radial distance.** Priciest cards hug the landmarks; every card
   purchase/sale re-ranks the whole city (a new expensive card inserts at the
   inner arc and everything cheaper shifts one cell outward, clockwise).
3. **Stepped growth.** Plot half jumps exactly 1 cell each time a ring
   overflows (24 → 56 → 96 … buildings), which also steps the world layout.
4. **Equal footprints per ring tier mix**: ring 3 can hold a mix of t14 and t3
   cards if those are your 24 priciest — tier does NOT affect ring position,
   only drawn size (D2/T1).

---

## 3. World layout — city plots on shared rings (`layoutWorld`, layout.ts:232)

### W1 — City ranking (layout.ts:233)
Sort by **building count DESC**, ties by username ASC. Rank = placement order.

### W2 — Center (layout.ts:249)
The single biggest city sits at world (0,0). Everyone orbits it.

### W3 — Ring distance (layout.ts:256–267)
```
innerExtent = max over placed plots of (chebyshev(|cx|,|cy|) + half)
maxHalf     = biggest plot half among REMAINING cities
ringDist    = innerExtent + maxHalf + WORLD_PLOT_GAP        (WORLD_PLOT_GAP = 2)
```
If a side couldn't even hold one plot, bump to
`ringDist = innerExtent + 3·maxHalf + GAP`.

### W4 — Corner exclusion (layout.ts:263)
`exclusion = 2·maxHalf` — each side's usable length is
`2·ringDist − 2·exclusion`. This keeps plots on adjacent sides from clipping
each other at the corners (proven overlap-free by tests).

### W5 — Side packing (layout.ts:274–295)
Four sides clockwise (top L→R, right T→B, bottom R→L, left B→T). Each side is
an independent 1D packing: cursor starts at 0 (inside the exclusion zone), a
plot's center lands at `cursor + half`, cursor advances by
`center + half + WORLD_PLOT_GAP`; when the next plot would overflow the side,
filling moves to the next side, then the next ring.

### W6 — Degenerate fallback (layout.ts:296–303)
Should be unreachable; forces one plot to (far, −far) so the loop always
progresses.

### Qualitative behaviors

- **Spacing is dominated by padding + gap**, not by city size: two 1-building
  cities (plot half 4.6) sit `4.6+4.6+2 ≈ 11` cells apart center-to-center
  (only the 2-cell gap is empty space between pads). The world reads *airy* at
  the rim, *dense* near the center where the big city's plot half (a
  5000-card city ≈ half 37) dwarfs the gap constants.
- **Rank, not geography**: which world ring a city lands on is purely its
  building-count rank, so a tiny city can be adjacent to the giant if it's
  rank #2 (first slot of world ring 1, top side).
- **Corner dead-zones**: the 2·maxHalf exclusion leaves the diagonal corners
  of each world ring empty — visible as "notches" when many big cities share a
  ring.

---

## 4. The 2D interpretation — CityMap2D + map2d/draw.ts (D-series)

Screen transform (CityMap2D.tsx:143): `screen = (world − cam)·scale + size/2`,
where `scale` = **pixels per cell** (zoom). Everything below scales with it.

### D1 — Footprint ladder `tierScale(t)` (draw.ts:16)
```
tierScale(t) = 0.42 + 0.58 · clamp01((t − 1) / 13)
```
A building square occupies this fraction of its cell: t1 = 0.42, t7 ≈ 0.69,
t8 ≈ 0.73 (grand league starts), t14 = 1.00. **Linear in tier = logarithmic in
value** — the last 7 tiers only buy 0.27 of cell size. Drawn size =
`max(1.5px, tierScale·cell)` (CityMap2D.tsx:260).

### D2 — Avatar on the building (CityMap2D.tsx:261, draw.ts:86)
When the square is ≥ `AVATAR_MIN_PX = 24` px, the card's avatar renders as a
circle of **0.72·size** centered in the square. Below 24 px: plain footprint.
(Avatars on buildings are 2D-ONLY — user ruling 2026-10-02.)

### D3 — Detail thresholds (draw.ts)
Grand-tier inner "nested plate" at t ≥ 8 **and** size ≥ 12 px; deed-lock badge
at size ≥ 10 px (badge side 0.26·size); city label only when the plot is
≥ 70 px wide **and** cell ≥ 3 px (CityMap2D.tsx:281).

### D4 — HQ size (CityMap2D.tsx:277–278)
Drawn plate = **2.6·cell** px (the reserved core is 3 cells wide — the 0.4 gap
reads as a moat). Owner avatar circle 0.52·size when ≥ 22 px. Stage ≥ 2 adds
corner register, stage 3 a circle.

### D5 — Landmark hex (CityMap2D.tsx:274, draw.ts:180)
Hexagon circumradius = **0.575 · (1.15·cell) ≈ 0.66 cell** — slightly larger
than one cell, so hexes graze neighbors on ring 2.

### D6 — Props (CityMap2D.tsx:252)
Props draw at **1.15·cell** (same overhang as landmarks).

### D7 — Camera zooms (CityMap2D.tsx:321–351)
- Focus-a-city scale: `clamp((min(w,h)·0.8) / (2·(half+2)), 4, 26)` px/cell.
- Fit-whole-world: `(min(w,h)·0.92) / (2·worldBounds)` px/cell.
- Zoom limits: max 64 px/cell, min = fit·0.5. Wheel: `×e^(−deltaY·0.0012)`;
  buttons ±1.25–1.3×; focus-card jump = 40 px/cell.

### D8 — Paper & roads (draw.ts:20,45)
Screen-space drafting grid at a fixed **32 px** pitch (never swims while
panning); roads are 2.2 px dashed (7 on / 5 off) straight lines between plot
centers. Raid cracks, ×N badges, bounty crosshairs are derived overlays with
their own size thresholds (CityMap2D.tsx:183–243).

---

## 5. The 3D interpretation — map3d/engine.ts (+ art-geometry.ts, building-art.ts) (T-series)

Same cells: a building at layout cell (x,y) of plot (cx,cy) is instantiated at
world `(cx + x, 0, cy + y)` — **1 cell = 1 world unit**, y-up, ground at 0.
Buildings are never rotated (faces stay axis-aligned); the camera orbits.

### T1 — Art→volume scale `k` (engine.ts:214)
```
k = tierScale(tier) · 1.45 / 128        // cells per art-pixel
```
Building geometry is the CARD ART (`building-art.ts`) compiled to boxes by
`compileArtToVolumes`. So 3D footprint AND height both trace tierScale — the
same 0.42→1.0 ladder as 2D (D1), scaled ×1.45/128 per art pixel.

**2026-10-02 update (live):** every object's footprint — buildings (instance
x/z scale), monuments, props — now also multiplies by `OBJECT_GAP_FACTOR`
(0.85, defined in map2d/draw.ts, knob D1.5): a visual-only gap between all
objects in both renderers. Heights are NOT scaled, so the skyline silhouette
is unchanged; cell positions and ring shape are untouched.

### T2 — The height ladder (building-art.ts:106–116, 244–247)
Art height per family: civic tiers `artH = baseH + (t−1)·floorH`, grand tiers
(t ≥ 8) `artH = grandBaseH + (t−8)·grandFloorH`:

| family (art key) | baseH | floorH | grandBaseH | grandFloorH |
|---|---|---|---|---|
| Cryptographer | 26 | 9 | 96 | 12 |
| Zero-Day | 30 | 12 | 116 | 14 |
| Overclocker | 34 | 11 | 118 | 12 |
| Cache Keeper | 26 | 10 | 106 | 12 |
| Server Marshal | 36 | 13 | 130 | 12 |
| Bot Herder | 22 | 10 | 100 | 11 |
| Unassigned | 28 | 12 | 112 | 10 |

Resulting real heights (artH · k):

| family | t1 | t7 | t8 (grand starts) | t14 |
|---|---|---|---|---|
| Cryptographer (shortest) | 0.12 | 0.62 | 0.80 | 1.90 |
| Server Marshal (tallest) | 0.17 | 0.89 | 1.08 | 2.29 |

The ladder is fairly smooth — the civic→grand switch at t8 is only a ~25–30%
height step (grandBaseH ≈ civic t7 height + ~16 px, plus the tierScale bump),
NOT a cliff; family choice (baseH 22–36, hw 32–46 art px) moves massing more
than tier does. Footprint width barely changes with tier (family constant).

### T3 — HQ (engine.ts:508–548, 223)
Plate 3×0.3×3; body = the owner's own family megaform at tier
`min(14, 10 + (stage−1)·2)` → **t10 / t12 / t14** by HQ stage (S4), compiled at
`HQ_K = 2.4/128` — 1.65× the per-pixel scale of any regular building (T1), so
the HQ is always the tallest thing in its city (≈ 2.25 cells for a stage-1
Cryptographer up to ≈ 3.8 for a stage-3 Server Marshal). Gold mast
+ beacon sphere on top; stage ≥ 2 adds a gold trim.

### T4 — Monuments (engine.ts:224, 495)
Founder monuments = `monumentArt(canonicalIndex)` at `MONUMENT_K = 1.6/150`
(≈ 1.6–2 cells tall, per-founder bespoke silhouettes).

### T5 — Props (engine.ts:551)
Simple volumetric stand-ins (~0.3–1.2 cells tall) on the same C4 cells.

### T6 — Ground, grid, fog (engine.ts:320–340)
Ground plane = `maxExtent·2.6` wide; drafting grid every **2 world units**
(= 2 cells), opacity 0.16; fog from `maxExtent·2.2` to `·6`; paper palette.

### T7 — Plot pads & labels (engine.ts:349–395)
Each plot gets a flat iso-diamond pad of half `plot.half + 0.2` (opacity 0.9,
ink edges, dashed orange if you); name sprite at `(cx, 0.4, cy+half+1.8)`
scaled 5.2×1.3; raid ×N sprite and bounty torus ring just outside the pad.
Roads: dashed lines on the ground (dash 0.5 / gap 0.35).

### T8 — Camera (engine.ts:245–285, 477–487, 840–853)
Perspective 33° fov. Opens on your city at radius `max(10, (half+3)·2.4)`;
fit-world radius `min(radiusMax, maxExtent·2.1)`; zoom clamp 4…
`radiusMax = max(60, maxExtent·3.2)`; pitch (phi) clamp **0.24–1.32 rad**
(can't go below horizon or top-down); default azimuth theta = 45°.

### T9 — Motion feel (engine.ts:752–845)
Orbit inertia damping 0.82 (angles) / 0.78 (zoom); fly-to lerp 0.14/frame;
wheel zoom `e^(deltaY·0.0011)`; button zoom ±22% of current radius; pan speed
`radius·0.0016` per screen px.

### T10 — Light & shading (engine.ts:130, 288–295, 469)
Sun at (70, 110, 45), intensity 1.6 + hemisphere 1.0; one PCF shadow map
(2048²) sized to the whole world (maxExtent+12). Baked face shading in vertex
colors: left 0.62 / right 0.95 / sides 0.8 / top 1.2 / bottom 0.45. Per-card
lightness jitter **±4%** (metrics.ts:54 `familyJitter(cardId)`) so same-class
towers don't look cloned.

### T11 — Compilation quirks that shape the look (art-geometry.ts)
Boxes get depth = 0.85·width (T-shadows read slightly slab-like); lit windows
become thin quads **mirrored to all four facades** (width ×2.4 stretch);
polygons that don't parse as card-art faces become shallow pads. Changing
`depthFactor 0.85` or the 0.09-cell window threshold reshapes every building.

### ⚠ T-trap — the UNUSED height ladder (metrics.ts:25–34)
`tierHeightCells` / `tierWidthCells` (`0.38 + 1.95·((t−1)/13)^1.15`) look like
the 3D sizing law but have **no call sites outside tests** — the engine sizes
everything through T1/T2 instead. Adjusting metrics.ts changes nothing you see
on screen. If you want heights to follow a clean closed-form curve instead of
the card-art ladder, the engine would need to be pointed at it first.

---

## 6. Quick knob registry

| ID | Formula / constant | Where | Today | Raise → | Lower → |
|---|---|---|---|---|---|
| S1 | `1+floor(log2(v/floor))` clamp 14 | projection.ts:129 | base 2, cap 14 | coarser tiers (base>2) | finer gradation (base<2) |
| S3 | sort `value DESC, id ASC` | world/route.ts:132 | value rank | — | e.g. tier-then-value, or id → stable personal order |
| S4 | stage cuts 0.05 / 0.5 | projection.ts:94 | [5%,50%] of game max | fewer stage-3 HQs | more |
| C2 | HQ core radius | layout.ts:46 | 1 (3×3) | bigger core | 2×2 core |
| C3 | landmark hex on ring 2 | layout.ts:36 | fixed 6 slots | different slot geometry | — |
| C4 | prop cells | layout.ts:57 | 4 mids + NE corner of ring 3 | move to rim ring | — |
| C5 | first building ring | layout.ts:190 | 3 | wider moat, sparser inner ring | buildings touch the moat |
| C1/C6 | ring walk start / fill | layout.ts:25,196 | NW corner, clockwise | e.g. per-building spiral-out or centered growth kills the arc bias | — |
| C7 | `PLOT_PAD_CELLS` | layout.ts:154 | 1.6 | airier cities | tighter world |
| W1 | world sort | layout.ts:233 | count desc | portfolio value desc → different center city | |
| W2 | center = biggest | layout.ts:249 | biggest by count | — | — |
| W4 | `WORLD_PLOT_GAP` | layout.ts:156 | 2 | rim cities drift outward | denser rim |
| D1 | `0.42 + 0.58·u` | draw.ts:16 | linear | e.g. `0.3+0.7·u^0.7` → bigger mid-tiers | flatten |
| D1.5 | `OBJECT_GAP_FACTOR` | draw.ts (2026-10-02, live) | **0.85** | every object's footprint ×factor in BOTH views (2D sizes, 3D x/z scale — heights untouched); positions/shape unchanged. Wider gaps: lower it (0.8); tighter: raise it (1.0 = old look) | |
| D2 | `AVATAR_MIN_PX` | draw.ts:13 | 24 px | fewer avatars at low zoom | avatars appear earlier |
| D4 | HQ 2.6·cell | CityMap2D.tsx:277 | 2.6 | HQ fills the core | more moat |
| D7 | zoom clamps 4–64, fit 0.92 | CityMap2D.tsx:321–350 | — | more/less zoom room | |
| T1 | `tierScale·1.45/128` | engine.ts:214 | ×1.45 | all 3D mass bigger (footprint AND height together) | smaller |
| T2 | PV_SPEC ladder | building-art.ts:106 | see table | taller towers / bigger t8 step (raise grandBaseH) / flatter mid-league (lower floorH) | |
| T3 | HQ tier 10/12/14, `HQ_K 2.4/128` | engine.ts:519,223 | tallest | more dominance | HQ can be dwarfed |
| T8 | init radius `(half+3)·2.4`, phi 0.24–1.32 | engine.ts:481,846 | — | wider opening shot, more pitch freedom | |
| T10 | jitter ±4%, sun 1.6 | metrics.ts:54, engine.ts:289 | — | more per-card variety / harder shadows | |

---

## 7. Pinned by tests — what an adjustment must keep true

`src/lib/__tests__/city/map2d-layout.test.ts` (and map3d tests) pin:
ring r holds 8r unique cells; the 3×3 core + 6 hex slots are never built on;
every building on a unique cell; innermost-ring-first fill in array order;
props claim their fixed cells and cost exactly one building slot; biggest city
centered; determinism incl. username tiebreaks; **no plot overlaps** (the W3–W5
proof); plot half grows with count. Any change to C1–C7 / W1–W5 must update
these tests in the same commit — the overlap proof only holds for the current
exclusion arithmetic, so retuning W4 means re-proving it.

## 8. How to instruct adjustments

Name the ID and the new behavior, e.g.:
- "C6: fill rings counter-clockwise from SE" (kills the NW-arc bias)
- "C5+1: start buildings at ring 4, widen the moat"
- "D1: 0.35 + 0.65·u^0.75" (bigger mid-tier footprints, softer grand step)
- "T2: grandBaseH −15 across families" (softens the t8 skyline cliff)
- "W1: rank cities by portfolio value, not count"
- "C7/W4: PLOT_PAD_CELLS 1.2, WORLD_PLOT_GAP 1" (denser world)

S-series changes re-shape BOTH views at once (they change the data); C/W move
both views' geometry; D moves only 2D; T moves only 3D.
