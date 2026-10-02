# CITY FLOOR STUDY — grey plots on a dark-green field (2D + 3D)

**Date:** 2026-10-02 · **Status:** IMPLEMENTED same day with all defaults (D1 plot-boundary
grey, D2-A fills-before-roads, D3 Lambert+shadows, `#808080`/`#2F5226`) — verified in both
views via image-analyst (all checks PASS); UNCOMMITTED / not deployed.
**Ask (user):** *"modify the floor of the 2D and 3D city views, so that the floor where
there are buildings is 50% grey and between cities where there are no buildings is
dark green."*

Decoded: two floor zones on the shared world map —

| Zone | Meaning | New color |
|---|---|---|
| **City floor** | the ground of every city plot (under HQ, landmarks, props, buildings) | **50% grey** (`#808080`) |
| **Field** | everything else — the space between/around city plots | **dark green** (suggested `#2F5226`) |

This is a pure DRAW-TIME change: no layout, API, DB, or i18n involvement. Both
renderers already derive identical plot geometry from `layoutWorld()`, so the two
views can stay in exact parity.

---

## 1. Where the floor lives today

### 1.1 — 2D (Blueprint canvas)

| What | Where | Today |
|---|---|---|
| World background | `drawPaperBackground` — `src/lib/city/map2d/draw.ts:37` | whole canvas filled `BLUEPRINT.paper` `#F4F1E8` + a screen-space 32px drafting grid (`#9FB4C4`, alpha 0.5) |
| Per-city ground | `drawPlotPad` — `draw.ts:375` | **no fill at all** — only the dashed orange "you" ring and the orange selection rect |
| Draw order | `CityMap2D.draw()` — `src/components/city/world/CityMap2D.tsx:133` | background → **roads** (l.155) → per-plot loop (pad → heist marks → props → buildings → landmarks → HQ → labels) |
| Stage backing | `.city-map-2d-stage` — `src/app/globals.css:1284` | `background: #f4f1e8` (visible pre-first-draw / behind overlays) |

There is exactly **one** floor paint in 2D (the background) — city plots have no
floor color of their own today.

### 1.2 — 3D (CityMap3D engine)

| What | Where | Today |
|---|---|---|
| Scene background + fog | `engine.ts:613` (constructor) and `engine.ts:655` (per `setWorld`) | `PAPER_BG` `#F4F1E8` |
| Ground plane | `engine.ts:658-662` | ONE big `PlaneGeometry(maxExtent·2.6)` `MeshLambertMaterial(PAPER_GROUND #EFE9DA)`, `receiveShadow` |
| Drafting grid | `engine.ts:663-668` | `GridHelper`, `GRID_INK` at opacity 0.16 |
| Per-city pad | `engine.ts:677-696` | `diamondGeometry(cx, cz, half+0.2)` — a **DIAMOND** (45°-rotated square), `MeshBasic #EAE4D3` @ 0.9, + ink edge border + dashed "you" edge |
| Catalog plates | `map3d/plate.ts:24-26,195,219` | **imports** `PAPER_BG`/`PAPER_GROUND`/`GRID_INK` from the engine for its own paper scenes |
| Label chips | `labelTexture` — `engine.ts:88` | paper chip + ink text — already readable on any ground |

### 1.3 — Load-bearing discovery: the 3D diamond pads don't cover corner buildings

`diamondGeometry` is a rhombus through (±half, 0)/(0, ±half), so a point is inside
when `|dx|+|dy| ≤ half`. A ring-*r* corner building sits at `(r, r)`:
inside only if `2r ≤ r + 1.8`, i.e. **r ≤ 1.8** — every real city (min radius 3,
see `layoutCity`'s `HQ_CORE_RADIUS + 2` floor in `layout.ts:209`) has corner
buildings **outside its 3D pad**. It's invisible today because the pad is a faint
decorative tint; the moment the pad becomes "the grey floor where the buildings
are", cities would read as grey diamonds with corner towers standing on green.
**The 3D city floor must switch to an axis-aligned square** (which is also what
the 2D pads, the hit-testing, and the ring geometry itself all use — see §3).

---

## 2. Geometry decision — where the grey ends (D1)

The plot system already has a canonical per-city boundary:

```
plotHalf(layout) = layout.radius + PLOT_PAD_CELLS   // layout.ts:213 — radius + 1.6
```

* `drawPlotPad` strokes its rect at `(half + 0.2)` cells,
* `hitTest` selects the "plot" inside `half + 0.3` cells (`CityMap2D.tsx:464`),
* `layoutWorld` guarantees ≥ `WORLD_PLOT_GAP = 2` cells of separation between
  plot edges (plus the 2×maxHalf corner exclusion — `layout.ts:262-267`).

**D1 (recommended): grey floor = the plot square, half = `plotHalf + 0.2`.**
The grey area then *is* the tappable area — tap anywhere on grey, the city is
selected — and the you-ring/selection strokes sit exactly on the grey edge.
Guaranteed ≥2-cell green corridors between cities come free from the packing.

Alternative rejected — *snug* `radius + 0.5` (just past the outermost footprint
≈ `radius + 0.42`): tighter grey, but then the visible floor is smaller than the
hit/selection rectangle and the you-ring floats on green. If you ever want the
snug look, add a pure `floorHalf(layout)` helper in `layout.ts` **with a unit
test** (`src/lib/__tests__/city/map2d-layout.test.ts`) instead of a magic number
in two renderers. With D1 no new geometry helper and no test churn are needed —
both renderers already receive `p.half`.

## 3. 2D implementation plan

Palette first (`src/lib/city/map2d/palette.ts`) — add a `floor` block, don't
scatter hexes:

```ts
floor: {
  city: "#808080",   // 50% grey — the built plot ground
  field: "#2F5226",  // dark green — the world between cities (= park lawnDark)
},
```

`#2F5226` is deliberately `BLUEPRINT.props.park.lawnDark` — the field and the
park prop read as the same vegetation family. (Lighter alternates if the first
screenshot feels like a void: `#35502F`, `#3B5A36`.)

1. **Background → field.** In `drawPaperBackground` (rename to
   `drawFieldBackground`), fill `BLUEPRINT.floor.field`; keep the drafting grid
   (it reads as a surveyor's grid over terrain) but drop `gridAlpha` 0.5 → **0.25**
   so it whispers over green. Update the one import in `CityMap2D.tsx:9`.
2. **City floor fill.** Add the fill as the first stroke of `drawPlotPad`
   (`draw.ts:375`), reusing the `halfPx` it already computes:
   ```ts
   ctx.fillStyle = BLUEPRINT.floor.city;
   ctx.fillRect(cx - halfPx, cy - halfPx, halfPx * 2, halfPx * 2);
   ```
   One function, zero new call sites.
3. **Roads vs the grey — call-order choice (D2).** Roads are drawn *before* the
   plot loop today, so with fills added there they'd be **clipped at plot edges**
   (roads then read as connectors between grey squares; zero extra code).
   **Recommended (A):** hoist a fill-only pass over *visible* plots above the
   road loop (l.155) — roads stay visible crossing the grey like boulevards,
   matching today's center-to-center continuity. Alternative (B): keep the order,
   accept edge-clipped roads. Same visibility gate (`visible(p)`) as the main loop.
4. **Contrast retunes forced by the two new grounds** (all in `palette.ts` /
   `draw.ts`):

   | Element | Today | On grey/green | Fix |
   |---|---|---|---|
   | City labels (`BLUEPRINT.label` `#3A3630`) | dark on paper | invisible on the green field (labels sit below the plot) | flip to light bone `#E9E4D6` |
   | Family fills (`#7FA8C9`…, drawn @ alpha 0.85) | pastels on paper | moderate vs `#808080`; shapes still carried by their dark strokes | ship as-is; optional per-family +5% lightness bump only if QA flags it (Zero-Day `#89B49B` is the weakest) |
   | You-ring / selection `#E8590C` | orange on paper | OK on grey (~2.5:1, it's a 2px accent) | optional 2 → 2.5px bump |
   | Roads `#5A7186` dashed | on paper | ~2.9:1 on green — acceptable | optional lighten to `#8FA3B5` |
   | Raid cracks `#8B2E2E` + paper-stroked badges | on paper | fine on grey | none |
   | Paper-colored prop internals (crane pad, rotunda base, marquee stripes use `BLUEPRINT.paper`) | on paper | will pop as light plates on grey | acceptable (reads as "paper registry plate"); retune to `#C9C4B4` only if noisy |
   | Loading/empty overlay text `text-[#33506B]` (`CityMap2D.tsx:603,611`) | ink on paper stage | ink on green canvas after first draw | switch both to `text-[#E9E4D6]` |
   | Stage CSS `.city-map-2d-stage` bg (`globals.css:1290`) | `#f4f1e8` | letterbox/first-paint flash | switch to `#2F5226` |

5. **Unchanged:** hit-testing (grey == plot already), legend chips (DOM, outside
   the canvas), avatars, protection badges, i18n (no new strings), performance
   (+1 `fillRect` per visible plot per static draw — noise).

## 4. 3D implementation plan (`src/lib/city/map3d/engine.ts`)

**Do not mutate `PAPER_BG`/`PAPER_GROUND`** — `plate.ts` (the /catalog 3D
plates) imports them, and the catalog should keep its paper-registry identity.
Add new sibling constants and switch only the world engine:

```ts
export const FIELD = "#2F5226";      // world field (matches 2D BLUEPRINT.floor.field)
export const CITY_FLOOR = "#808080"; // built plot ground (matches 2D)
```

(Keep them literal next to `PAPER_*` for the "scene-look constants shared with
the catalog" block comment's promise; the 2D side stays the canonical palette —
either import from `palette.ts` or mirror with a comment, mirroring is what
`PAPER_GROUND` already does.)

1. **Background + fog → field.** `engine.ts:613-614` (constructor) and `:655`
   (`setWorld`) both build fog from `PAPER_BG`; switch both to `FIELD`, otherwise
   the horizon fades green ground into a paper sky. The ground plane's outer
   margin (`groundSize = maxExtent·2.6`) then dissolves seamlessly.
2. **Ground plane → field.** `engine.ts:659`: `MeshLambertMaterial({ color: FIELD })`,
   keep `receiveShadow = true`. GridHelper stays (0.16 opacity is already a
   whisper on green; retint only if it turns mossy — optional `0x4e6b4a`).
3. **Replace the diamond pads with square grey floors** (§1.3 — the diamond
   mathematically cannot cover corner buildings). In the pad loop
   (`engine.ts:677-696`):
   * swap `diamondGeometry(p.cx, p.cy, half)` for an axis-aligned quad — either
     `new THREE.PlaneGeometry(half*2, half*2).rotateX(-Math.PI/2)` positioned at
     `(p.cx, y, p.cy)`, or a 2-tri `BufferGeometry` mirroring `diamondGeometry`'s
     style (kept exported if anything else still imports it — grep says only the
     engine + plate.ts signature use it; plate.ts doesn't, so it can be inlined
     or left as-is for the catalog);
   * material **D3: `MeshLambertMaterial({ color: CITY_FLOOR })` with
     `receiveShadow = true`** (recommended) — building shadows keep landing on
     the city floor, matching the ground's treatment. Lambert shifts the rendered
     tone slightly off the literal hex (the current `#EFE9D4`-ish ground reads
     near-true under the calibrated hemi+sun), so verify one screenshot and, if
     it drifts, calibrate the hex (expect `#6E6E6E`-ish ≈ renders as 50% grey).
     The alternative — `MeshBasicMaterial` for the exact hex — is rejected
     because it silently deletes shadows from every city floor;
   * keep `position.y = 0.02` (above ground, below borders/roads at 0.03-0.05);
   * keep the ink `EdgesGeometry` border and the dashed YOU edge unchanged —
     they already trace the same square once the geometry is a square.
4. **Labels:** `labelTexture` chips are paper plates — they read *better* on
   green; no change. The CityMap3D overlay texts (`CityMap3D.tsx:237,245,257`,
   ink-on-light Tailwind classes) get the same `#E9E4D6` flip as 2D.
5. **Unchanged:** instancing/classes, raycast registration (floors join
   `raycastables`? — no: plot-tap is derived from building/HQ hits and the 2D
   plot hit has no 3D twin today; adding one is out of scope), camera, fog
   distances, shadow camera, catalog plates, teardown (`clearWorld` already
   disposes group geometries/materials — the new planes ride along).

## 5. Parity + invariant checklist

- [ ] Same grey extent in both views: `p.half + 0.2` cells, same constant source
      (2D reads `BLUEPRINT.floor.*`; 3D mirrors with a "matches palette" comment
      — same pattern the renderers already use for `#EAE4D3`/`PAPER_GROUND`).
- [ ] Deterministic: fills derive from the existing `layoutWorld` output; no
      new state, no randomness, no clock — static-draw ruling untouched.
- [ ] Bounded rendering untouched: 2D fills gated by `visible(p)`; 3D adds one
      mesh per plot while removing one (diamond) per plot — net-zero.
- [ ] No economy/DB/API/i18n surface. `/api/city/world` payload unchanged.
- [ ] Catalog (/catalog) deliberately DIVERGES (keeps paper plates) — it is a
      registry of subjects, not the world; call this out in review so nobody
      "fixes" it back.
- [ ] Public city view (`PublicCityView` → CityGrid DOM tiles) unaffected.

## 6. Verification plan (when implemented)

1. `npx tsc --noEmit` + `npm run lint` + `npm run build`.
2. Existing suites must stay green untouched:
   `src/lib/__tests__/city/map2d-layout.test.ts`,
   `map3d-art-geometry.test.ts`, `map3d-metrics.test.ts`.
3. Dev-server visual pass on `/city` in BOTH views (`?view=3d`):
   * grey square hugs each city's you-ring; corner ring buildings ON grey;
   * ≥2-cell green corridors between neighboring plots; green horizon in 3D
     (fog no longer paper);
   * city labels legible on green; roads visible (D2-A);
   * shadows still land on grey plots (3D, D3);
   * raid cracks / bounty markers / props still read on grey.
4. image-analyst pass on 2D + 3D screenshots (local PNG paths) before shipping;
   pixel-probe the grey (#808080 ± lighting drift) and field (#2F5226) once.

## 7. Open knobs for the user (defaults chosen above)

| Knob | Default | Alternatives |
|---|---|---|
| Field green | `#2F5226` (park lawnDark) | `#35502F` / `#3B5A36` (airier) |
| Grey | `#808080` literal 50% | `#8A8A8A` softer vs pastel fills |
| Grey extent D1 | plot boundary (`radius+1.8` drawn) | snug `radius+0.5` (needs helper+test, breaks grey==tappable) |
| Roads D2 | A: fills first, roads cross the grey | B: zero-diff, roads clip at plot edges |
| Drafting grid | keep at alpha 0.25 | drop it over the field entirely |
| 3D floor shading D3 | Lambert + shadows (hex may drift a shade) | Basic = exact hex, no shadows on plots |
