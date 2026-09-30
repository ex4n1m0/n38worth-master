# City SC4-Grade Graphics Study — AAA buildings & roads on the Three.js renderer

Study date: 2026-09-30. Scope: **the city visual layer only, Three.js renderer
(the current default)**. Every AGENTS.md §"Mainframe City building layer"
invariant applies unchanged: the city stays a derived projection of the trading
economy, placement stays derived (value orbits), rendering stays bounded,
credits remain the only currency, no simulation/gameplay additions — everything
below is paint, not mechanics. Nothing here requires API, schema, cron, or
economy changes.

This doc answers a different question than its predecessors:
`CITY_3D_ENGINE_STUDY.md` (2026-09-29) chose the engine (Three.js, shipped);
`CITY_VISUALS_STUDY.md` relit the 2D Pixi renderer; the 2026-09-29 user ruling
retired pixel sprite sheets and made all building art procedural. This study
asks: **what does it take to go from today's flat-shaded vector diorama to
SimCity-4-grade buildings and roads?**

## §1 Executive summary

**Recommendation: a staged "real rendering pipeline" upgrade on the existing
three.js renderer — real lighting + shadows, ACES tone mapping, procedural
runtime canvas textures for facades and roads, instanced props, a restrained
night-aware post chain, and a proper street renderer with lanes / crosswalks /
sidewalks / streetlights. Six independently shippable phases, ~3–4 focused
weeks end to end; each phase gates on the existing device-tier + QA machinery.**

The one-sentence diagnosis: **today's 3D city has no rendering pipeline in the
AAA sense — it is unlit vector art.** Verified in the current tree: zero
three.js lights, zero shadow maps, zero textures (except the avatar
billboard), zero post-processing; every surface is `MeshBasicMaterial` with
hand-authored vertex-color face shading (ThreeScene.ts:277–320,
building3d.ts:9–12). SC4's look is ~80% lighting and texture density and ~20%
geometry — and 0% of that machinery exists yet. The good news: the codebase is
unusually ready to receive it (pure MeshBuilder emitting positions/colors,
one-material-array buildings, merged world layers, render-on-demand loop,
device tiers, a perf HUD) — every insertion point exists without restructuring.

The findings that drive the recommendation:

1. **The gap is architectural but shallow.** The renderer was built P0-first
   as an exact retarget of the 2D procedural art ("same shading math as the
   2D renderer" — building3d.ts:9–12). That was the right P0 call, but it
   means the ceiling is "flat vector diorama". Upgrading means: normals +
   lit materials, a sun, a shadow solution, per-pixel surface detail
   (textures), and a compositor — all additive to the current MeshBuilder.
2. **SC4's recipe is transferable without an offline pipeline.** SC4's
   buildings were modeled in gmax/BAT with photo-sourced textures and baked
   lighting, rendered as real-time 3D with LODs; its roads are network
   geometry with lanes/crosswalks/cars; its night look is a separate light
   set per building; its identity comes from prop density + one consistent
   sun. All of that has a web equivalent: seeded procedural CanvasTextures
   (original, code-plotted — no copyrighted assets), one DirectionalLight
   with a shadow map, emissive window quads (already exist!), instanced
   props, and road geometry we can derive from data the game already has.
3. **Textures are the make-or-break.** Vertex colors alone cannot reach SC4 —
   no mullions, no material variation, no grime, no lane paint. Runtime
   canvas atlas generation (deterministic, seeded, ~2 atlases ≤1024²) gives
   photo-adjacent density for ~10–30 ms amortized inside the existing 24 ms
   time-slice pump (world3d.ts:741–776). This is a *different mechanism* from
   the retired pixel sprite sheets (no offline pipeline, no PNG assets, no
   sheet loader) — but it shares spirit-space with that ruling and with the
   2026-09-28 "remove the bloom/gloom" ruling, so both are flagged as open
   user sign-offs in §7, not silently reversed.
4. **The road data layer is already good enough.** `deriveStreets` already
   classifies every street tile `x | y | cross | stub` and flags lamp
   positions (lib/city/streets.ts:56–92); the 2D renderer already draws
   sidewalks + lane dashes + lamp glows from it (StreetsLayer.ts:78–97). The
   3D renderer draws flat asphalt diamonds with a shade multiplier and
   nothing else (world3d.ts:89–118) — a pure geometry/texture job, no data
   work.
5. **There is perf headroom.** 197 buildings render in ~54 draw calls today;
   lighting/textures/post raise per-pixel cost, not draw-call count, and the
   bounded budgets (200 detailed, 24/satellite, 140 aggregate, universe caps
   by device tier) keep the scene at a few hundred meshes. With tiered
   shadow-map resolution and a tier-gated post chain, mid mobile stays
   comfortable; low tier degrades to "today's look + normals".
6. **The night look is already halfway SC4.** The lit-window mosaic + light
   clock + facade glow system (two flicker channels, 250 ms quantization,
   reduced-motion safe) is exactly SC4's "separate night light set" concept.
   The upgrade path is emissive-on-lit-material + selective bloom, not a
   rewrite.

## §2 What SC4 actually does (the reference recipe)

Distilled from how the game is built (BAT/gmax authoring, SimTropolis modding
community knowledge) and what players actually perceive ("graphics hold up
shockingly well… crisp, charming" — Steam community consensus):

| # | SC4 pillar | How SC4 did it | Web/Three equivalent for us |
| --- | --- | --- | --- |
| 1 | **One consistent sun** | Fixed light azimuth/elevation; all baked shading agrees with it | `DirectionalLight` + `HemisphereLight` locked to the authored face-shading directions (so the 2:1 iso look survives) |
| 2 | **Textured facades** | Photo-sourced textures on gmax/BAT models, with baked detail | Seeded procedural `CanvasTexture` atlases per family league (window grids, mullions, spandrels, material swatches, grime) |
| 3 | **Baked soft lighting / AO** | Pre-baked into textures at export | Vertex-color AO (cheap, always) + optional shadow map / GTAO on high tier |
| 4 | **Night light sets** | Every building has a separate night rendition (windows, signage) | Already have: window mosaic quads + light clock; add emissive material slot + night bloom |
| 5 | **Network roads** | Road network geometry: lanes, dashes, crosswalks, intersections, sidewalks, curbs, streetlights, cars | Street tile meshes with atlas road textures keyed by existing `axis`/`lamp` data; instanced streetlight/tree props; (optional) headlight animation |
| 6 | **Prop density** | Rooftop AC/water towers/antennas, trees, hydrants, benches, parked cars — the "lived-in" feel | `InstancedMesh` prop kits, seeded placement, LOD-band budgets; rooftop kit ports the 2D `drawMicroProps` vocabulary (art.ts:1595–1635) |
| 7 | **Zoom choreography** | 5 zoom levels; closest zooms read as detailed dioramas | Existing LOD bands (close/district/world) become real LOD switches + device tiering |
| 8 | **Atmosphere** | Distance haze, rich sky at dusk/dawn | Sky gradient dome + horizon haze tied to `daylightAt` curve — **gated on the bloom/gloom ruling** |

What we deliberately do **not** copy from SC4: photo-sourced textures
(copyright), the offline BAT/radiosity pipeline (violates the code-plotted-art
ruling), terrain sculpting / citizens / utilities simulation (violates the
no-game-engine MVP ruling), and gameplay-affecting anything.

## §3 Current-state audit (verified 2026-09-30)

| Subsystem | Today (3D renderer) | Where |
| --- | --- | --- |
| Renderer | `WebGLRenderer({antialias:true})`, DPR≤2, **NoToneMapping**, no composer | ThreeScene.ts:277–289 |
| Lights | **None.** No ambient/directional/hemi; no shadow maps | grep-verified |
| Materials | All `MeshBasicMaterial` + vertexColors, DoubleSide | ThreeScene.ts:290–320 |
| Geometry | `MeshBuilder` → indexed BufferGeometry with **position+color only, no normals** | building3d.ts:132–395 |
| Shading | Hand-baked per-face constants (+x 0.95→0.55, +z 0.62→0.36, roof 1.2) | building3d.ts:105–119 |
| Textures | Only the 48×48 avatar billboard CanvasTexture | avatars3d.ts:26–58 |
| Buildings | 1 mesh + ≤5 draw calls per building; civic T1–7 families + grand T8–14 setback stacks; tier ladder = height + feature count | building3d.ts:574–771 |
| Windows | Flat quads 0.5u off walls, 2 flicker channels × 2 materials, 250 ms clock | building3d.ts:416–512, lights.ts |
| Ground | ONE flat quad, color-lerped night↔day | ThreeScene.ts:1529–1540 |
| Streets | Merged flat diamonds, inset 0.92, shade per axis, lamp dots; **no lanes/sidewalks/curbs/crosswalks** | world3d.ts:89–118 |
| Platforms | Constant dark box, same day/night | building3d.ts:523–525 |
| Day/night | 1 real h = 1 game day; 15 s poll; material-color lift `1+0.25·daylight` | daylight.ts, ThreeScene.ts:1285–1297 |
| Post | None; single AdditiveBlending use = Root beams | ThreeScene.ts:899–907 |
| LOD | Bands exist; only use in 3D = hide universe at close zoom | lod.ts:37–41, ThreeScene.ts:990–997 |
| Perf patterns | Render-on-demand, frame-time EMA + draw-call HUD, 24 ms ring pump, device tier via `hardwareConcurrency`, bounded budgets everywhere | ThreeScene.ts:1387–1405, world3d.ts:351–359 |
| Deps | three ^0.186.1; **no postprocessing deps** (EffectComposer etc. ship inside `three/examples/jsm`) | package.json |

## §4 The plan — six phases, each shippable alone

Ordering is by visual-yield-per-risk: lighting first (biggest single jump),
textures second (the SC4 identity), roads third, then props, atmosphere,
heroes. Every phase keeps the `CitySceneApi` contract, render-on-demand loop,
bounded budgets, and reduced-motion policy untouched.

### Phase A — Real lighting foundation (est. 2–3 days)

The single biggest visual jump; no art authoring required.

- Add `HemisphereLight` (sky/ground colors driven by `daylightAt`) +
  `DirectionalLight` sun at the SAME azimuth/elevation the authored face
  shading already implies — so the iso read survives and night stays
  night-native.
- Compute normals for MeshBuilder output (building3d.ts:386–394): authored
  per-face normals for boxes/prisms (crisper than `computeVertexNormals` for
  hard-edged architecture; needed anyway for lit materials).
- Swap mass/street/ground materials `MeshBasic → MeshLambert` (or
  `MeshStandard` if Phase B lands roughness maps), vertex colors become
  **albedo**. The `1+0.25·daylight` lift hack (ThreeScene.ts:1294) is replaced
  by sun intensity/color animation on the same 15 s poll (then P1: continuous
  ramp like the 2D renderer).
- `renderer.toneMapping = ACESFilmicToneMapping` + sRGB output; calibrate the
  authored palette against it (needs one image-analyst gate — ACES will shift
  the hand-tuned night palette).
- Shadows: **vertex-color AO baked at build time** (boxes darken near ground
  contact / between stacked masses — free, works on every tier) **+ PCFSoft
  shadow map on tier ≥ medium** (orthographic frustum sized to city extent;
  2048 desktop / 1024 mobile; static — no per-frame cost beyond the map
  render on dirty frames, and reduced-motion unaffected since shadows don't
  animate).
- Window quads move to `MeshBasicMaterial` (emissive-equivalent: unlit) —
  they already are; now they read as emitters against lit walls.

### Phase B — Procedural facade texture system (est. 4–5 days)

The SC4 identity phase. **Open ruling §7.2** — flagged, not silently reversed.

- Runtime `CanvasTexture` atlases (seeded `mulberry32`, deterministic per
  family × league × tier-band): window grids with mullions + spandrels,
  brick/concrete/glass swatches with per-floor variance, grime streaks,
  floor bands, ground-floor storefronts. 1–2 atlases ≤1024², SRGB, mipmaps,
  anisotropy 4.
- `MeshBuilder.box()/quad()` gain UV params; walls sample atlas cells; roofs
  get tar/gravel cells. Heights already come in px — window rows can snap to
  true floor counts.
- Derived normal map from a heightfield canvas (window recess → Sobel →
  normal), only if Phase A chose `MeshStandard`; else defer.
- Generation cost (~10–30 ms/atlas) amortized in the existing 24 ms
  time-slice pump; cached per session; **zero network fetches, zero asset
  files** — this is code-plotted art in the ruling's sense, executed per-pixel
  instead of per-polygon.
- Night windows stay the separate emissive quad layer (exactly SC4's
  day-facade vs night-light-set split) — the mosaic code is untouched.

### Phase C — Streets & roads 2.0 (est. 3–4 days)

- Street tiles become real micro-geometry per `axis`: asphalt slab + sidewalk
  frame + curb lip (~0.5u) + lane-dash texture cells; `cross` tiles get zebra
  crosswalks on all four entries; `stub` gets a driveway taper.
- Lamp flags drive instanced streetlight props: emissive head + additive
  ground light pool decal at night (rides the light clock, alpha-only).
- Country-road parity for satellite corridors (2D RoadsLayer.ts:110–163 has
  the recipe: asphalt band + shoulder + dashed centerline, slab-clipped).
- All still ONE merged mesh + ONE instanced mesh per prop type; rebuilt on
  the same sync signature (world3d.ts:451–477 pattern).
- Data work: none — `axis`/`lamp` already exist (lib/city/streets.ts:56–92).

### Phase D — Props & life (est. 2–3 days)

- `InstancedMesh` kits: rooftop set (AC units, vents, whip antennas with LED
  tips, water towers — port the 2D `drawMicroProps` vocabulary), street
  trees, parked cars. Seeded deterministic placement; budgets per LOD band;
  aggregate/satellite/universe LODs skip props entirely.
- Optional (user decision): quantized traffic — headlight/taillight quad
  pairs gliding along street tiles on the light clock. Pure decoration like
  the beacons; bounded to ≤N cars; skipped under reduced motion.

### Phase E — Post & atmosphere (est. 3–4 days)

- `EffectComposer` from `three/examples/jsm` (**no new npm dep**):
  RenderPass → night-only `UnrealBloomPass` (threshold set so ONLY windows /
  lamps / beacons / neon bloom — this is SC4's night signature) → OutputPass.
  MSAA note: composer needs `samples: 4` on its render target or swap
  antialias for SMAAPass.
- Optional `GTAOPass` (built-in) on high tier only — or skip entirely if
  Phase A's vertex AO reads well (recommended first).
- Sky gradient dome + horizon haze tied to the daylight curve — **gated on
  §7.1**; propose haze at world-zoom only, α ≤ 0.15.
- Exposure curve day↔night on the ACES tone map.

### Phase F — Hero & diorama pass (est. 3–5 days)

- HQ + Six monuments: richer bespoke massing + materials (glass crowns with
  a cheap env map — `RoomEnvironment` or gradient cubemap; bronze/stone
  tones), keeping the procedural stage ladder.
- Grand league T8–14: curtain-glass texture variant, spire light accents,
  per-family megaform elaboration (port more of the 2D `drawGrand`
  vocabulary that P0 stubbed).
- Selection: contact-shadow ring + subtle rim highlight instead of the flat
  diamond.
- Optional SC4-signature tilt-shift (BokehPass) at close zoom, high tier
  only, user-gated — the most expensive single item, saved for last.

## §5 Performance budget & device tiers

| Tier (detect: `hardwareConcurrency`, DPR, existing tier fn) | Shadows | Post | Textures | Props | Universe cap (existing) |
| --- | --- | --- | --- | --- | --- |
| High (≥6 cores) | PCFSoft 2048 | Bloom + optional GTAO + SMAA | full atlas + anisotropy 8 | full | 24 |
| Mid (4–5) | PCFSoft 1024 | Bloom only | full atlas, anisotropy 4 | reduced | 12 |
| Low (<4) | off (vertex AO only) | none | half-res atlas | rooftop-only | 6 |

- Draw calls stay ~O(hundreds): buildings ≤200×(1 mesh, ≤5 groups), streets
  1 merged mesh + ≤3 instanced prop meshes, world layers merged as today.
- Fragment cost is the real budget: shadows + bloom are the two heavy items —
  both tier-gated. Measure with the existing frame-time EMA + draw-call HUD
  (ThreeScene.ts:1447–1460); add a perf-snapshot assertion to the QA gate.
- Render-on-demand is preserved: lighting/post add nothing per idle frame;
  daylight changes already request renders (extend the 15 s poll → P1 ramp).
- GPU texture budget ≤ ~8 MB for the whole atlas set.

## §6 Testing & QA

- Existing 348 vitest cases untouched; add: atlas determinism (same seed →
  same canvas hash), street-tile tiling math (crosswalk placement, curb
  seams), LOD/tier budget helpers, normal-generation invariants.
- Visual gates per phase via image-analyst on rendered states (day/night ×
  tier), reusing the P1 recipe: `window.__city3d` dev probe + readPixels
  (e.g. night warm-pixel % regression band).
- Perf gate: frame-time EMA under threshold per tier on the largest fixture
  city; draw-call ceiling asserted from `renderer.info`.

## §7 Risks & open rulings (user sign-off needed before the named phases)

1. **"Remove the bloom/gloom" (2026-09-28, 2D ruling).** Phase E reintroduces
   bloom (night-only, threshold-gated) and haze (world-zoom, low α). Intent of
   the original ruling was the washed-out 2D day look; SC4-grade nights
   realistically need glow. Needs an explicit re-ruling, scoped to 3D night.
2. **"No sheet-based building art / code-plotted original work" (2026-09-29).**
   Phase B is runtime procedural canvas texturing — no offline pipeline, no
   PNG sheets, deterministic seeded code. It honors the letter and spirit
   (original, no copyrighted assets) but changes "vector-only" — flagging for
   an explicit yes before building the atlas system.
3. **Kenney CC0 City Kit** (city-engine-audit memory's once-leading art
   path): a legitimate accelerator for prop/road meshes (CC0, license-safe),
   but style-drifts from the procedural system and reintroduces authored
   assets. Recommendation: stay pure-procedural; revisit only if Phase D
   stalls.
4. **Palette calibration.** ACES + real lights will shift the hand-tuned
   night-native palette; budget one calibration pass with image-analyst gates
   so night windows/霓虹 accents keep their identity.
5. **Mobile GPUs.** Worst case is mid-phone at night + shadows + bloom; the
   tier table degrades those independently. QA on the largest fixture city
   before each phase ships.
6. **Pixi parity.** The AAA pass targets Three only; `?renderer=pixi` stays a
   legacy snapshot at today's look (desync already accepted in a65928c).
7. **Bundle.** EffectComposer + bloom + SMAA from `three/examples/jsm` ≈
   +40–60 KB gz on the 181 KB three chunk (lazy, city-only). Avoid N8AO
   (extra dep) — built-in GTAO or vertex AO suffice.

## §8 What this does NOT touch

Economy, ownership, placement derivation, API/schema/cron, the
`CitySceneApi` contract, i18n (no new user-visible strings beyond an optional
graphics-settings toggle), and every bounded-rendering budget. The city
remains a derived projection; roads and props remain pure decoration
(lib/city/streets.ts:18–22).

## §9 Suggested order

**A (lighting) → B (facades) → C (roads) → D (props) → E (post) → F (heroes)**,
each shipping flag-complete and independently revertible. A+C alone already
read as "SC4-adjacent daylight"; B+E deliver the night postcard; F is polish.
Total ~3–4 focused weeks with QA gates.

## References

- BAT/gmax building authoring & SC4 modding community —
  [SimTropolis SC4 BAT & Lot Workshop](https://community.simtropolis.com)
- SC4 visual longevity consensus —
  [Steam Community: SimCity 4 Deluxe discussions](https://steamcommunity.com)
- Instancing/merge practice —
  [Wael Yasmina: Instanced Rendering in Three.js](https://waelyasmina.net/articles/instanced-rendering-in-three-js/),
  [three.js Discourse: InstancedMesh vs InstancedBufferGeometry](https://discourse.threejs.org/t/instancedmesh-vs-instancedbuffergeometry/31058),
  [Procedural Pixels: three.js optimization](https://resources.proceduralpixels.com)
