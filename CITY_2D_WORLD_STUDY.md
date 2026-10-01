# CITY 2D WORLD STUDY — one shared flat map

- Date: 2026-10-01
- Status: STYLE PICKED — **A · Blueprint**, plus the avatar ruling below.
  Implementation awaits final go; mockups
  `mockup-blueprint-{world,zoom}-avatars.png` are the approved reference.

## 1a. Style + avatar rulings (2026-10-01, user)

- **Style A · Blueprint** is the chosen look (paper + drafting grid +
  outlined footprints + dashed roads).
- **Avatars take the center square** (2026-10-01): every building IS a player
  card — when a building square is legible (draw size ≥ ~24px), the card's
  avatar renders as a circular photo centered in its square, ringed in the
  family color; smaller squares stay plain footprints (natural at world
  zoom). Each city's **HQ center square carries the city OWNER's avatar**
  (gold ring) — visible even at whole-map zoom, so every city on the shared
  map is instantly "whose it is".
- Real-system note: avatars are drawn from the existing avatarUrl pipeline
  (`/api/avatar/[username]`); canvas drawImage of cross-origin images is fine
  because the map never reads pixels back (no canvas-taint impact — see the
  2026-09-28 Pixi taint lesson; the 2D map has no readback path).

## 1. The rulings this design encodes (2026-10-01, user)

1. **2D only.** No 2.5D iso, no 3D. Easier to render, fewer issues.
2. **Static draw, zero animation.** One renderer, no rAF loop, no light
   clock, no LOD/instancing machinery. Redraw only on pan/zoom/data refresh.
   **Always day** — one palette, no day/night.
3. **Same absolute map for everyone; camera opens on YOUR city.** Biggest
   city at the map center; everyone can see everyone's city (the whole point
   of cities is being seen).
4. **Literally every visible city, fully rendered** — no aggregation, no
   caps, no dot fallback. (Only the existing *visibility* rule applies:
   completed-avatar players and NPCs; hidden humans and the onboarding pool
   stay off the map.)
5. Old renderers (PixiJS + Three.js scenes, their tests, the Kenney GLB kit)
   get **deleted**; /catalog is rebuilt from the same 2D draw functions.

Plus the layout rules, verbatim intent:

- Core building (HQ) **in the middle**; the **6 landmarks around the core**;
  owned buildings around them **from most valuable to cheapest, clockwise**.
- **No roads inside a city.** **Roads between cities when there is ownership**
  (a road is drawn from a player's city to the city of a player they own).
- World placement: **the player with the most buildings at the center of the
  whole map**, other cities placed around it **with the same clockwise logic**
  (by building count, descending).
- Viewport: **1:1 aspect ratio**.

## 2. Current engine inventory (verified 2026-10-01)

| Piece | Size | Fate |
|---|---|---|
| `world/scene3d/` (Three.js, default) | 10 files, ~6,900 LOC | **DELETE** |
| `world/scene/` (PixiJS 8 iso) | 18 files, ~9,500 LOC | **DELETE** |
| `world/` shell (CityWorld, HUD, mount, panels) | ~3,200 LOC | rewrite slim (~600) |
| `lib/city/scene/` shared math/store | ~1,300 LOC | mostly delete (camera3d/iso die); keep store |
| city tests `__tests__/city/` | 31 files, 334 its | scene3d suite (7/55) dies; most `scene/` + root suites die with placement/streets/universe/neighbors (~250+ its) |
| Kenney kit assets `public/city-assets/` | **117 .glb** files | **DELETE** (~large repo weight) |
| deps `three`, `pixi.js`, `@types/three` | ~436 KB gz lazy JS | **REMOVE from package.json** |
| `renderer-flag.ts` (renderer/art/daylight flags) | ~120 LOC | DELETE (one style, always day) |
| `/api/city/[username]` projection | 398 LOC | **KEEP** (inspector/profile data; world map reuses its per-city building fields) |
| `/api/city/universe` (top-24 skyline tuples) | 138 LOC | **REPLACE** with `/api/city/world` (§4) |
| `lib/city/` placement/streets/river/universe/satellites/neighbors | ~1,500 LOC | DELETE (superseded by the 2D layout) |
| `BuildingsCatalogMount` (/catalog) + `/dev-catalog` | ~850 LOC | rebuild as 2D static plates from the same draw module; delete dev-catalog |
| DOM fallback `CityGrid`/`BuildingSprite.tsx`/`PublicCityView` | — | keep PublicCityView shell (page/SEO), render 2D map inside |

Known breakage points if deleted cold (from the inventory): `scene-api.ts`
re-exports Pixi types; `/catalog` imports `scene3d/assets3d` + three;
`/dev-catalog` imports Pixi sprites; store selection channels consumed by
`BuildingInspector`/panels; ~15 i18n keys only used by the scene mounts.

## 3. What the 2D world IS (spec)

### 3.1 The unit: a city plot

Deterministic pure function `layoutCity(projection) → cells` (shared module,
unit-tested, same result for every viewer):

- **HQ** = 3×3 cell core at (0,0) — visual tier from `hqStage`.
- **Landmarks**: the six Founder monuments occupy six fixed hexagon slots on
  ring 2 — (0,−2), (2,−1), (2,1), (0,2), (−2,1), (−2,−1). Only OWNED
  Founders render; empty slots stay empty (a visible "how close are they"
  tell, same as today).
- **Owned buildings**: fill square rings 3, 4, 5… **clockwise from 12
  o'clock**, in **value-descending order** — priciest innermost, cheapest at
  the rim (exactly the user rule). Ring *r* holds 8·r cells. A value change
  re-ranks on the next projection — no glide animation, cells just appear at
  their new rank (static ruling).
- Cell rendering: rect whose **size scales with building tier** (the existing
  1–14 ladder), **fill = trade family color** (7 families incl. "no trade"),
  deed-lock/iron-deed = small lock badge. No roofs, no shadows, no windows,
  no roads inside.

### 3.2 The world: cities on the same spiral

`layoutWorld(cities[]) → plots` — the same spiral one level up:

- Cities sorted by **owned-building count descending**; #1 at map center.
- The rest fill square rings 1, 2, 3… clockwise (8·r plots per ring), each
  plot spaced so plots never overlap (plot half-size = ring radius + pad).
- **Roads**: one line per ownership edge, drawn from the owner's plot center
  to the owned player's plot center (under the plots). Owner→owned direction
  is implicit in who holds the card; drawn once, no arrowheads (v1).
- Absolute coordinates → **every viewer renders the identical map**; the
  viewer's own city gets a highlight ring + opens centered on it.

### 3.3 Data: `/api/city/world` (replaces `/api/city/universe`)

One response, CDN-cached (`public, s-maxage=60, swr=300`), `epoch`-keyed:

```
{ epoch, generatedAt, cities: [{
    username, profession, ownedCount, hqStage,
    landmarks: [username ×≤6],            // owned Founders
    buildings: [{ id, tier, family, protection }]   // ALL of them — no aggregation
  }],
  roads: [{ from: username, to: username }]  // ownership edges between mapped players
}
```

- Source: same visible-players SQL as the leaderboard/rank snapshot; building
  fields from the existing per-city projection query generalized to all
  visible cities in a bounded number of queries (window + IN chunks — the
  pattern `city/universe` already uses).
- Size today: ~85 visible cities, a few thousand buildings ≈ **~150–300 KB
  JSON / ~40–70 KB gzipped** — fine. At 10× scale (~800 cities, ~40k
  buildings): ~2 MB / ~400 KB gz, one cached fetch per 60 s — still fine.
  Canvas draws 40k rects in a few ms. This is why "literally everything, no
  fallback" (ruling 4) is affordable in 2D where it never was in 3D.
- OWN city detail (inspector, sectors) still comes from
  `/api/city/[username]` — unchanged.

### 3.4 Renderer: one static Canvas 2D

- **One `<canvas>`, square (1:1), full stage width, capped by viewport
  height** — the whole new view is: canvas + city-name plate + legend row +
  two camera buttons (`My City`, `Whole Map`) + tap-to-inspect.
- **Draw once** per data epoch / camera change. Pan = pointer drag, zoom =
  wheel/pinch, both just re-run the same draw with a transform (throttled to
  animation-frame-on-event, NOT a loop). No sprites, no textures, no chunks,
  no fallback renderer — a canvas that fails is a canvas that failed.
- Hit-testing: same transform inverted; tap → cell → (city, building) → the
  EXISTING `BuildingInspector` panel via the existing store selection
  channel (kept from the shell rewrite).
- Reduced-motion: trivially satisfied (nothing animates). a11y: canvas gets
  `role="img"` + aria-label; the inspector + BuildingMirrorList remain the
  DOM/keyboard surface (existing pattern).
- **Camera opens centered on the viewer's own city**, fitted to the plot +
  margin (ruling 3). `Whole Map` zooms to fit everything.

### 3.5 Always day, one style

- Day palette only. No clock, no `facadeGlowAt`, no flicker, no bloom, no
  lights — those modules die with the scenes.
- HUD art-style + day/night buttons deleted; the HUD shrinks to the two
  camera buttons + legend.

## 4. Deletion & migration plan (2 ships)

**Ship 1 — the 2D world (additive, flag-free):**
1. `src/lib/city/map2d/` — `layout.ts` (ring/city/world spirals), `draw.ts`
   (style primitives: building rect, HQ, landmark hex, road line, lock
   badge), `palette.ts`. Pure, fully unit-tested (ring math, clockwise
   order, value ranking, world spacing, road edges) — ~30 tests.
2. `/api/city/world` route + tests (payload shape, visibility filter, cache
   headers, epoch).
3. `CityWorld2D` component (canvas + camera + hit-test + inspector wiring +
   i18n en/zh keys) replacing the scene mount inside the existing
   `CityWorld` shell; PublicCityView renders the same canvas for
   `/city/[username]` share pages.
4. `/catalog` rebuilt: static plates rendered by `draw.ts` (families × tiers
   grid, HQ, landmarks, protection states) — no three, no GLBs.
5. Typecheck/lint/build + full suite green; game-systems review (formulas
   untouched — projection only) + visual QA screenshots.

**Ship 2 — the big delete (after 2D verified live):**
- Delete `world/scene/`, `world/scene3d/`, `renderer-flag.ts`,
  `lib/city/{placement,rings,streets,river,universe,satellites,neighbors}.ts`,
  `public/city-assets/**` (117 GLBs), `/api/city/universe`, `/dev-catalog`,
  the old city test files, `pixi.js` + `three` + `@types/three` deps, dead
  i18n keys (~15). Also discards the in-flight road-color WIP in
  `scene3d/*` (moot with the engine).
- Net: roughly **−18,000 LOC, −31 test files, −117 binary assets, −436 KB
  lazy JS, −1 API route; +1 small module (~700 LOC + tests) and one route.**

Effort: ship 1 ≈ a focused day; ship 2 ≈ half a day (deletion + sweep).

## 5. Style proposals (mockups, 1024×1024 = the 1:1 viewport)

Generated by `scripts/gen-2d-city-mockups.ts` (deterministic; the layout code
in the script is a working prototype of §3.1/§3.2 — same ring math ships in
`map2d/layout.ts`). Same 9-city sample world in every style: 420-building
city at center (6 landmarks), 8 cities on the ring, 8 ownership roads.

| Style | Files | Look |
|---|---|---|
| **A · Blueprint** | `docs/city-2d-mockups/mockup-blueprint-{world,zoom}.png` | Survey-plate drafting: paper + grid, outlined footprints, nested tiers, dashed roads. Reads "city planning document". |
| **B · Flat pastel** | `docs/city-2d-mockups/mockup-pastel-{world,zoom}.png` | Friendly tycoon: rounded rects, soft family pastels, green plot pads, golden landmarks. Closest to Coin Master energy. |
| **C · Pixel day** | `docs/city-2d-mockups/mockup-pixel-{world,zoom}.png` | Chunky 8-bit: saturated families, top-lip shading, grass checker, gold hex landmarks, dirt roads. |
| **D · Ink + accent** | `docs/city-2d-mockups/mockup-ink-{world,zoom}.png` | Editorial monochrome: line-work + tier hatching + family glyph letters; ONE orange accent (your city + roads). Calmest, most "designed". |

## 6. Open items (decide at build time, none blocking)

1. Road routing: straight lines (mockups) vs L-shaped ortho — recommend
   straight for v1.
2. Should zoomed-out cities clip their building rects below ~2px into solid
   color blocks? (Still "fully rendered" — just pixel-scale merging; canvas
   does it naturally at small scale. Recommend yes, it's free.)
3. City name plates at far zoom: keep only on hover/selection (declutter).
4. Founder landmark shape: hexagon in all styles (mockups) — open to
   per-style variation.
