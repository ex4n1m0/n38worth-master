# City engine audit & upgrade plan (isometric renderer, SC2k-inspired)

Audit date: 2026-09-28. Scope: the Mainframe City visual layer only — the city
is a **derived projection of the trading economy** (AGENTS.md §"Mainframe City
building layer"), which constrains what an "engine upgrade" may touch.

## 1. What exists (audit)

### Framework, language, tooling

| Item | Value |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript (strict) throughout |
| Renderer | **PixiJS 8.21** custom architecture + `pixi-filters` 6 (AdvancedBloomFilter) |
| State | zustand vanilla store (`src/lib/city/scene/store.ts`) + React binding |
| Tests | vitest (`src/lib/__tests__/city/**`, incl. `scene/` for iso/culling/camera/lod/placement) |
| Build | `npm run build`; lint `npm run lint`; typecheck `npx tsc --noEmit` |
| Art tooling | `npm run gen:scifi-art` (placeholder art), `npm run gen:city-atlas` (dormant building-atlas post-processor, uses `sharp`) |

**Engine decision: retain PixiJS.** The project is PixiJS-based with a
performant custom render-on-demand architecture (see below); the upgrade brief's
own rule says a Phaser migration needs a demonstrated need, and none exists.

### Rendering architecture & game loop

- `CityScene` (`src/components/city/world/scene/CityScene.ts`) is the ONLY Pixi
  `Application` owner. `app.ticker.stop()` immediately — a self-suspending rAF
  loop renders only while dirty/camera-active/FX/daylight-ramps run
  (**zero idle rAF**).
- Scene graph: `sky` / `skyDay` (static backdrops) → `fxRoot` (screen-sized
  filterArea: ColorMatrix day lift → threshold bloom) wrapping `worldContainer`
  → `dayWash` (screen-blend daylight layer above the filters).
- Layer modules: `IsoWorld` (ground/paths/buildings/landmarks/HQ),
  `AggregateBlocks` (beyond-detail skyline slabs), `UniverseLayer` (shared
  universe map + lazy minis), `SatelliteLayer` (foreign city clusters),
  `PathLayer`, `DistrictLinks`, `RootSequenceLayer`, `FxLayer`, `CameraRig`.
- DPR capped at 2; WebGL preference with context-lost remount ladder
  (`CitySceneHost` → one remount → `DistrictOverview` DOM fallback).

### Map representation & coordinates

- **Map**: a 3×3 **macro grid of sectors**, each `GRID_SIZE = 32` × 32 tiles,
  with a 2-tile gap between sector cells (`src/lib/city/scene/iso.ts`,
  `SECTOR_MACRO` table). Global tile (gx, gy) addresses any tile; sector
  count grows 1→9 with the mission ladder (locked sectors render dimmed pads).
- **Projection**: classic **2:1 dimetric** — `TILE_W × TILE_H = 128 × 64`
  (2× the brief's default 64×32, same projection, larger art budget — kept).
  All math is centralized in `iso.ts` (pure, node-safe, tested):
  `tileToScreen` / `screenToTile` / `pickTile` / `sectorOfGlobalTile` /
  `contentBoundsOfTiles` / `sectorWorldBounds`; camera transforms in
  `camera.ts` (`clampCamera`, `screenToWorld`, zoom clamped [0.5, 2.5]).
- **Placement is DERIVED** (value orbits, 2026-09-27): `rankArrangeTiles`
  (`src/lib/city/placement.ts` over `rings.ts`) orders every owned card by
  value into clockwise square rings around the HQ + six goddess landmarks.
  There is no player placement, no ghost/queue (deleted), no persisted layout
  in use (`city_layout` machinery is legacy-retained, unused).
- **Occupancy** is a `Map<tileKey, cardId>` rebuilt per sync — the whole map
  is ≤ 9·32·32 = 9,216 addressable tiles but only occupied tiles render
  sprites, so a per-tile object system is unnecessary by construction.

### Depth sorting & draw order

- Painter's order: `buildingsLayer.sortableChildren` with `zIndex = global
  (x + y)` — assigned on sync only (no per-frame sort). Equivalent to the
  brief's `depth = worldY` baseline for 1×1 iso footprints (all buildings are
  1×1; monuments/HQ use dedicated layers above buildings with documented
  exceptions).
- Fixed layer ladder: ground pads → beneath-buildings overlays (root veil,
  data paths, district links) → buildings → goddess landmarks → HQ → sector
  label chips; siblings: aggregate slabs, universe, satellites, FX above all.

### Scalability (already implemented)

- **Viewport culling** (`culling.ts`): visible world rect + 15% margin on
  camera-settle/sync (never per frame); conservative `pointVisible` with
  up-margin for building height.
- **LOD bands** (`lod.ts`): close / district / world — detail sublayers
  (windows, identity, billboards) toggle per band with crossfades; DOM a11y
  bridge capped at 1500 nodes; aggregate skyline budgets per band.
- **Render-on-demand** ticker + one-shot wake timers for day/night ramps.
- **Bloom perf probe**: EMA frame-time monitor disables the filter pass for
  the session if the scene can't hold ~45 fps.

### Simulation ↔ renderer separation

- The **simulation is the server**: credits, ownership, values, professions,
  milestones, goddess powers, firewall/hard-lock authority all live in the
  existing economy (Neon + Drizzle + cron jobs). The scene consumes a
  read-only derived projection (`/api/city/[username]`, CDN-cached public GET)
  and never recomputes economy state. This is a *stricter* version of the
  brief's "renderer reads simulation, never owns it".
- Client-side pure derivation exists only for *visual* placement
  (`placement.ts`), daylight clock (`daylight.ts`), and projection diffs
  (`diff.ts`).

### Day/night system (already implemented, 2026-09-28)

- `daylight.ts` (pure, tested): **1 real hour = 1 game day** — day :15–:45 of
  each real hour, dawn/dusk ramps ±1 game hour; `nextDaylightBoundaryAt` lets
  the scene sleep through plateaus and track ramps continuously per frame;
  `gameClockAt` backs the HUD sim-clock chip (uncommitted 2026-09-28 work,
  preserved).
- Application: night-native art + sky crossfade (`skyDay.alpha = daylight`) +
  screen-blend day wash + **ColorMatrix day lift** (dark masses → shades of
  white, lerped to identity at night) + adaptive bloom threshold/scale.
- Windows glow at night (seeded per cardId) and feed the bloom pass; see
  §3.1 for the day-behavior upgrade implemented with this plan.

### Building art system

- `art.ts` — procedural placeholder art behind a **data-driven manifest**
  (`CITY_ART_MANIFEST`): 6 profession families + unassigned, each with a
  distinct silhouette (color-blind safe by shape), tier ladder 1–7 (modular
  floors + one feature per tier: antenna/pods/halo/crown/megastructure),
  seeded facade windows, rooftop micro-props, tier-7 identity sigils.
- Each manifest entry has `atlasByTier` slots (currently null) — the designed
  hook for real art. `scripts/gen-city-atlas.ts` is a deterministic
  post-processor (chroma key → hue clamp to family neon → trim → 256/128/64
  WebP mip ladder → `city-atlas.generated.ts` URL table) awaiting raw art in
  `scripts/city-art-raw/`.
- Protection/state visuals: firewall cyan ring, hard-lock amber ring
  (authority = server timestamps), selection brackets, ghost fill colors.

### UI, input, persistence

- `CameraRig`: drag-pan (pointer/touch), wheel/pinch zoom at cursor, camera
  bounds from `sectorWorldBounds`, reduced-motion snap; forgiving tap picking
  (exact tile → satellites → landmarks → body-rect/proximate → locked-pad
  peek).
- React shell (`CityWorld.tsx` + panels) owns i18n, inspectors, HUD; the
  scene receives pre-resolved strings only.
- No client save system — the city re-derives from the server on load
  (nothing to migrate; the brief's save-compatibility section is N/A).

## 2. Mapping the SC2k-inspired brief onto this repo

The brief assumes a standalone city-**builder** (roads, zoning, population,
utilities). This repo's city is a **derived visualization of a trading game**;
AGENTS.md invariants forbid a second economy/simulation. Mapping:

| Brief concept | Repo reality | Action |
| --- | --- | --- |
| `CitySimulation` (client sim) | Server economy + `/api/city/[username]` projection | Already separated (stricter); **do not** build a client sim |
| Roads / zoning / utilities / population / traffic | Does not exist; forbidden by invariants | **Out of scope** (would fork the economy) |
| `CityMapData` typed-array tile store | Occupied-tile map + derived orbits; only occupied tiles render | Sufficient at max city size; no change |
| `IsometricProjection` 2:1, centralized + tested | `iso.ts` (128×64) | **Exists** — matches the spec |
| Chunked rendering (16/32-tile chunks) | Per-sprite culling + LOD + render-on-demand | Culling ≽ chunks here (hundreds, not 10⁵ tiles); no change |
| `CityRenderer` viewport-only rendering | Cull rect + LOD budgets + bloom probe | Exists |
| `BuildingRenderer` variants/stages | Family silhouettes × 7 tiers, seeded per cardId (deterministic) | Exists; variants already deterministic from cardId |
| Multi-tile footprints | All 1×1 by placement-invariant design | Out of scope (would fork value-orbit placement) |
| `DayNightSystem` timeOfDay + controls | Wall-clock-synced cycle (1 real h = 1 game day, shared by all players) | Exists; time-scale controls **deliberately rejected** (shared-clock ruling) |
| Day/night building art | Night-native palette + day matrix lift | Exists; window-glow day behavior upgraded (§3.1) |
| Pixel-art atlas, nearest-neighbor | Procedural vector-ish placeholders + dormant atlas pipeline | Staged plan §3.2 |
| Debug perf overlay | Internal frame probe only | **Added** (dev-gated) in §3.3 |
| Save/load migration | No client save | N/A |
| Tests (projection, picking, depth, determinism) | `__tests__/city/scene/*` (iso, culling, camera, lod, placement, …) | Exists; extended for new pure logic |

## 3. Staged plan & what this change implements

### 3.1 Implemented (2026-09-28, first pass) — selective window glow

Lit facade windows dim toward glass at full day and bloom at night via
`facadeGlowAt(daylight)` (`daylight.ts`), with the facade pass split into
constant dark insets + a glow-modulated lit layer. **Superseded for buildings
by §3.2's art frames** (the glow factor now drives the additive LIGHTS frame)
but retained as the procedural-fallback behavior and as the shared pure
function.

### 3.2 Implemented (2026-09-28) — original pixel-art day/night building atlas

**v2 (same day, evening — user ruling "make a normal city first, like
SimCity 2000/3000"):** the cyberpunk vocabulary is GONE. Buildings are
normal architecture (stone civic + copper dome, concrete twin towers +
bridge, brick silos, stepped beige offices, glass corporate slab, warehouse
+ sheds, pitched-roof houses); day frames are TRUE COLOR; night = dark
masses + warm lit windows, door lamps and tiny red antenna beacons only.
The global day ColorMatrix was REMOVED — every element owns authored
day/night states: a grass TERRAIN PLATE under the whole macro grid
(mow bands + street grid, day/night Graphics pair in IsoWorld), concrete
platform slabs (day/night pair in art.ts), and scoped soft-lift filters for
the still-procedural heroes (HQ / monuments / aggregate slabs). Paths are
neutral asphalt; the HQ palette was de-neon'd (civic tower, warm windows).
Functional game states keep their colors: firewall/hard-lock rings,
selection, Root Sequence tints, locked-sector discovery overlays (now
neutral slate).

v1 notes (superseded): day frames used to be pre-compensated for a global
day matrix lift — that coupling no longer exists; do not reintroduce a
global matrix, add authored day/night pairs instead.

- **`scripts/gen-city-pixel-art.ts`** (`npm run gen:city-pixel-art`,
  deterministic, re-runnable, sharp only): plots ORIGINAL pixel art per
  (family × tier) — scanline iso boxes, 2:1 diamonds, seeded window
  patterns, family silhouettes, tier ladder (antenna / annexes / setback /
  water tank / crown), rooftop clutter. Each sheet carries 3 deterministic
  variants × 3 frames: day / night / lights. Output:
  `public/city/pixel/*.png` (49 sheets) + `city-pixel-art.generated.ts`.
  A QA contact sheet lands in `scripts/city-pixel-preview.png` (dev
  artifact, gitignored).
- **`scene/pixel-art.ts`**: sheet loader (nearest-neighbor textures, frame
  splitting, cache + ready-listeners, `NEXT_PUBLIC_CITY_PIXEL_ART=off` kill
  switch) and `src/lib/city/scene/pixel-variant.ts` (deterministic
  cardId→variant, unit-tested).
- **`BuildingSprite`**: day/night/lights `Sprite` layers crossfaded by the
  daylight clock — `setDaylight(v)` sets day-frame alpha = v and lights
  alpha = `facadeGlowAt(v)` (additive). While sheets load (or if disabled)
  the procedural layers stay visible — zero pop-in regression.
- Verified: 234 city tests, contact-sheet visual review, live night render
  on `/city/IgorCarlier` (62 buildings, all families; cyan marks confirmed
  as functional firewall status rings, not art).

The Kenney CC0 route (§below) remains a future alternative art source — the
generator would be replaced by iso renders of the models; the loader,
manifest contract and scene integration stay identical.

#### Kenney CC0 alternative (user-suggested, 2026-09-28)

kenney.nl *City Kit* packs (Commercial / Industrial / Roads) are CC0 3D
model packs, license-identical to the Kenney audio already shipped. They
cannot drop into the 2D renderer directly; they would feed the same
manifest via an offline iso render step (three.js orthographic camera at
the 2:1 angle, night lighting rig). Recommended implementation if chosen: a
dev-only `/dev/city-render` page that batch-renders and downloads PNGs
(real GPU, zero native deps). Kenney low-poly renders read as clean
retro-iso rather than pixel-art — an explicit art-direction choice.

### 3.3 Implemented now — dev performance overlay

Brief-required debug overlay, dev builds only (`NODE_ENV !== "production"`
strips it from prod bundles): FPS, frame-time EMA, rendered/total building
sprites, LOD band, bloom state, daylight factor, camera zoom. Pushed from
the scene ticker at ≤2 Hz into `cityWorldStore.perf`; mounted by the React
shell as a fixed chip.

### 3.4 Later candidates (only if the user asks)

- Streetlight-equivalent light pools along data paths at night (small
  emissive dots at path bends — the paths already glow via Root-mix tints).
- Vehicle-analogue "data packets" flowing on the path layer (bounded, culled).
- Both are visuals only; no gameplay/simulation changes.

## 4. Files preserved vs changed (this change set)

Preserved (untouched architecture): `iso.ts`, `camera.ts`, `culling.ts`,
`lod.ts`, placement/orbit modules, all server/economy code, all panel UI.

Changed: `daylight.ts` (+`facadeGlowAt`), `art.ts` (facade split),
`BuildingSprite.ts` (facade base/lit/props layers + `setFacadeGlow`),
`IsoWorld.ts` (glow passthrough), `CityScene.ts` (daylight → glow plumbing,
perf sampling), `store.ts` (+perf slice), scene-mount UI (+dev overlay chip),
tests (+`facadeGlowAt` cases), this document.

## 5. Risks & compatibility

- Window-glow: alpha-only, applied on the existing ramp cadence; reduced
  motion unaffected (no motion added); LOD fade (`setDetailAlpha`) multiplies
  at the container level so the two systems compose instead of fighting.
- Perf overlay: dev-only, ≤2 Hz store writes, no per-frame React renders
  (the chip polls the store snapshot, not the ticker).
- No API, schema, i18n-key, or economy-file changes; no new user-visible
  strings (dev overlay is dev-tooling, English-only by design).
