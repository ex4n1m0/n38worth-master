# City 3D Engine Study — converting the Mainframe City renderer to Three.js / Babylon.js

Study date: 2026-09-29. Scope: **the city visual layer only**. The city stays
a derived projection of the trading economy — every AGENTS.md §"Mainframe
City building layer" invariant applies unchanged to any outcome: no second
economy, placement stays derived (value orbits), bounded rendering, server
authority untouched, restrained transitions. Nothing proposed here requires
API, schema, cron, or economy changes. This doc supersedes nothing — the
2026-09-28 engine audit (`docs/city-engine-refactor-plan.md`) ruled "retain
PixiJS" for a 2D upgrade; this study answers the different question "what
would REAL 3D take?".

## §1 Executive summary

**Recommendation: Three.js — not Babylon.js — phased behind a renderer flag,
orthographic 2:1 pixel-parity first, perspective/tilt as the payoff feature.
Estimated 2.5–3.5 focused weeks to a shippable flag-on default.**

The five findings that drive that recommendation:

1. **The bundle objection is dead.** Measured (bundlephobia, 2026-09-29):
   `three@0.186.1` is **719 KB min / 181 KB gzipped** — *smaller* than the
   `pixi.js@8.21.0` chunk it would replace (**892 KB min / 255 KB gzipped**).
   Babylon is the opposite: `@babylonjs/core@9.28.0` is **7.8 MB min /
   1.74 MB gzipped** full, ~1–1.5 MB min even properly tree-shaken via deep
   imports. Since pixi already loads as a lazy client-only chunk on `/city`
   only, a swap is bandwidth-neutral (three) or ~5× heavier (Babylon).
2. **The architecture is unusually swap-friendly.** ~3,600 lines of pure,
   node-safe, vitest-covered TypeScript (all of `src/lib/city/` +
   `src/lib/city/scene/`, 22 test files) are renderer-agnostic and survive
   untouched: placement/value orbits, ring walks, iso math, camera math,
   culling, LOD bands, the 250 ms light clock, daylight curves, the zustand
   bridge, and the whole React panel shell. Picking is **already pure math**
   (zero Pixi eventMode). Only the scene layer — 18 files, ~9,590 lines —
   is rewritten.
3. **The art system retargets instead of being thrown away.** Buildings are
   live parametric vector code (~21-child Graphics trees, no texture
   atlases): `drawIsoBox`/`drawCylinder`/`drawFacadeWindows` map almost 1:1
   onto extruded-box/cylinder mesh builders + instanced emissive window
   quads, preserving the deterministic per-cardId seeding and the 14-tier
   ladder. The ONE genuinely new authoring cost is the grand league (T8–14
   bespoke megaforms) and the hero monuments in true 3D.
4. **Pixel parity is exact, not approximate.** Verified numerically for this
   study: an orthographic camera at **yaw 45°, elevation 30°** projects both
   ground axes at slope exactly 0.5000 (the 128×64 tile), with equal axis
   magnitudes (true dimetric). The existing `CameraState {x,y,zoom,rotation}`
   maps 1:1 onto that camera; quarter-turn rotation becomes a literal camera
   yaw. The game can ship 3D that looks identical to today, then tilt.
5. **Babylon loses on fit, not on capability.** It is an engine that wants
   to own the loop, camera, GUI, and scene conventions — precisely the
   things this repo deliberately built itself (render-on-demand ticker,
   pure camera math, DOM panels, own picking ladder). Three.js is a
   library that drops into the existing `CityScene`-class architecture
   unchanged in shape.

The honest counter-case (§4): nothing in the game's *mechanics* needs 3D.
It is a spectacle / camera-freedom / retention bet — the city is the shop
window of the trading game. That makes this a product decision, not a
technical one; this doc prices both sides.

## §2 What exists and what a swap actually touches

### §2.1 Code inventory (audited 2026-09-29, current working tree)

| Layer | Size | Fate in a 3D swap |
| --- | --- | --- |
| `src/lib/city/**` (placement, rings, projection, streets, neighbors, satellites, universe, types…) | ~2,400 lines, pure TS | **Untouched** |
| `src/lib/city/scene/**` (iso, camera, culling, lod, lights, daylight, motion, diff, summary, zustand store) | ~1,200 lines, pure TS, node-safe | **Untouched** |
| Tests: 22 vitest files, ~355 cases (projection, camera, placement, iso, lights, daylight…) | all against pure modules | **Untouched** |
| React shell: `world/*.tsx` panels, inspector, HUD, a11y mirror, i18n | ~2,950 lines | **Untouched** (only `CitySceneMount` gains a renderer switch) |
| Scene layer: `world/scene/*` (CityScene, IsoWorld, BuildingSprite, art, landmarks, HqSprite, civic, Satellite/Universe/Streets/Roads layers, Fx, CameraRig, avatars…) | 18 files, ~9,590 lines | **Rewritten** (patterns port; drawing calls retarget) |

### §2.2 Load-bearing facts from the audit

- **All building art is live vector Graphics**, memoized by a
  `drawnKey = profession|tier|protection` — there are no building texture
  atlases at all. The only GPU textures in the whole scene are 2 sky
  canvases (regenerated per resize) + one 48×48 canvas per username for
  avatar billboards (`scene/avatars.ts`, `crossOrigin="anonymous"` — the
  documented canvas-taint postmortem).
- A 200-building city is ~4,500 display objects; ~21 children per building.
- **Picking is manual math** with a forgiveness ladder (exact tile →
  satellites → landmarks → body-rect/proximate ~40 px → locked-pad peek);
  input is DOM Pointer Events + wheel + keys, pinch-zoom hand-rolled
  (`CameraRig`). No Pixi hit-testing to migrate.
- **Depth is painter's order**: one sortable layer, `zIndex = x + y`, plus a
  fixed layer ladder and screen-space chips that must never be occluded
  (sector chips, selection name chips, satellite plates, billboards).
- **Animation is a 250 ms quantized light clock** (alpha/position-only
  mutations, one render per step) + short-lived FX bursts; the rAF loop is
  self-suspending (zero idle rAF; idle cost ≈ 4 renders/s from the light
  clock).
- **Day/night = authored art-state pairs** (day/night Graphics crossfaded by
  the daylight clock) + 4 scoped per-object ColorMatrix lifts + sky
  crossfade. No global day matrix (user ruling — keep it that way).
- pixi-filters is a **dead dependency** (zero imports since the bloom
  removal) — see §11.

## §3 Engine evaluation: Three.js vs Babylon.js vs stay-Pixi

Measured/current as of 2026-09-29.

| Criterion | three 0.186.1 (r186, 2026-09-08) | Babylon 9.28.0 | Pixi 8.21 (status quo) |
| --- | --- | --- | --- |
| Bundle (min / gzip) | 719 KB / **181 KB** | 7,847 KB / 1,739 KB full; ~1,000–1,500 KB min tree-shaken | 892 KB / 255 KB |
| Tree-shaking ergonomics | `three` ESM; addons opt-in | **Fragile**: requires precise deep imports (`@babylonjs/core/Engines/engine`) + side-effect imports; a single barrel import pulls megabytes | n/a |
| Backends | WebGL2 (default) + WebGPURenderer/TSL (production-ready in 2026, WebGPU is now cross-browser incl. Safari 26); WebGPU build is the bigger bundle | WebGL2 + mature WebGPU engine since v5 | WebGL2 (+ WebGPU experimental) |
| Character | **Library** — renderer + scene graph; you own the loop | **Engine** — owns loop, cameras (ArcRotate…), GUI, inspectors, optimizer | Library (2D) |
| Fit with current architecture | Direct: same imperative scene-class + zustand + DOM panels shape; render-on-demand ports 1:1 (`renderer.render()` on dirty, no implicit loop) | Fights it: replacing their camera/GUI/loop with ours is throwaway; or adopt theirs and rewrite the shell | — |
| Instancing / batching | `InstancedMesh`, `BufferGeometryUtils.mergeGeometries`, instanceColor — exactly the toolkit for procedural cities | Thin instances + freeze APIs, equally capable | Sprite batching (2D) |
| Ortho 2:1 camera | Trivial (`OrthographicCamera`, yaw 45°/elev 30° — verified exact) | Equally trivial (`FreeCamera` ortho mode) | Manual (current) |
| Picking | Raycaster / ray∩plane + AABBs — or keep our pure math | Built-in `scene.pick` (richer out of box) | Own math (current) |
| Text/UI in-scene | None built-in → DOM overlay (we already have the shell) | Babylon GUI (in-engine, but duplicates our DOM/i18n panels) | Pixi Text (current) |
| React story | Optional R3F v9 (peers React ≥19 <19.4 — our 19.2.3 ✓); not required | No first-party React story | n/a |
| glTF / CC0 asset path | First-class `GLTFLoader` — **Kenney City Kit CC0 packs load natively in 3D** | Equally first-class | Impossible without an offline iso-render farm |
| Release cadence / risk | ~8–11-week minor releases, huge ecosystem | Steady releases, Microsoft-stewarded foundation | Active; v8 healthy |

**Verdict — Three.js.** It is smaller on the wire than what we ship today,
matches the hand-rolled architecture instead of replacing it, keeps the DOM
panel/i18n/a11y investment, and opens the Kenney CC0 3D asset path the 2D
renderer structurally cannot take. Babylon's genuine strengths (built-in
GUI, scene inspector, particles/physics, WebGPU-first maturity) mostly
duplicate things this codebase already has or has deliberately rejected —
and its 1.7 MB-gzip full core with fragile deep-import tree-shaking is the
wrong trade for a lazy-loaded game route.

**Status quo (stay Pixi) remains defensible**: the current scene is fast,
stylized, shipped, and costs zero further weeks. §4 prices what 3D buys.

## §4 What "real 3D" buys — and what it doesn't

**Buys (player-visible):**
- **Camera freedom**: tilt/orbit/zoom beyond today's simulated quarter
  turns; a perspective mode where the skyline parallaxes as you pan.
- **Value legibility**: building height literally IS the value tier — the
  orbit rings read in silhouette; grand-league towers dominate physically.
- **Spectacle ceiling**: coronation / tier-up / sector-unlock cinematics,
  dusk shadows, depth-fog, real glow — the Root Sequence countdown becomes
  a skyline event, not a beam overlay.
- **Asset ceiling**: Kenney CC0 3D city kits (license-identical to the
  shipped Kenney audio) load natively as glTF — an optional future art
  upgrade path that 2D forecloses (the 2026-09-28 audit needed an offline
  iso-render pipeline to even try it).
- **Long-term**: day/night relighting, seasonal/event theming, and any
  future "walk the city" idea become feasible.

**Doesn't buy:** no mechanics, no new economy loops, no gameplay the 2D
scene can't already express — the invariants cap the city at a derived
projection. It also *costs*: ~9.6k lines rewritten, a restyle risk (§9),
low-end-GPU exposure, and 2.5–3.5 weeks of focused effort that could go to
game features instead.

## §5 Art pipeline: procedural 2D vector → 3D geometry

**Path A (recommended) — retarget the parametric system.** The art code is
a data-driven manifest of draw functions, not bitmaps:

| 2D today | 3D retarget |
| --- | --- |
| `drawIsoBox` (2 faces + top diamond + AO seam + vertical `FillGradient`) | `BoxGeometry` stacks / custom extruded prisms; the gradient → per-face material tint or vertex colors; AO seam → baked vertex-color darkening |
| Civic league (T1–7): base + (tier−1) floors + tier feature + rooftop | Identical modular composition in meshes — this league ports almost mechanically |
| `drawFacadeWindows` seeded 2-channel lit mosaic | **One global `InstancedMesh` of window quads** with per-instance color (unlit `MeshBasicMaterial` + `instanceColor`); the same cardId seed keeps every building's light identity; flicker = instance color updates on the 250 ms clock |
| `drawGrand(step)` megaforms (T8–14) + HQ/monument stages | **The real authoring cost**: 7 families × 7 steps of bespoke 3D megaforms + 3-stage heroes. Still code-plotted (original geometry, no copyrighted assets — AGENTS rule), but it is new design work, ~3–5 days alone |
| Day/night authored Graphics pairs + 4 scoped ColorMatrix lifts | Per-material base-color/emissive uniform pairs lerped by the same `daylight.ts` clock — one mechanism replaces two |
| Beacons/halos/rise dots (alpha/position) | Emissive intensity / sprite position — identical quantized-clock pattern, no per-frame redraws |
| 2 sky canvas textures | Keep them: `scene.background` / backdrop plane pair, crossfaded exactly as today |

**Path B — Kenney CC0 glTF city kit.** Instant, license-safe, but it
abandons the deterministic per-cardId procedural identity, the 14-tier
bespoke ladder, and the color-blind-safe family silhouettes the game just
committed to (2026-09-29 "all-procedural art" ruling). Wrong as the base;
**right later as optional props/hero dressing on top of Path A**.

All 3D geometry stays original code-plotted work, same as the 2D policy.

## §6 Renderer architecture mapping

The swap point is `CitySceneMount`/`CitySceneHost`: today it dynamically
imports the Pixi `CityScene` (client-only lazy chunk). A 3D build adds a
`CitySceneThree` with the **same public contract** —
`create/sync/syncUniverse/setSelected*/setReducedMotion/focusCard/
focusSatellite/focusLandmark/zoomBy/resetCamera/rotateBy/destroy` — so the
React shell, zustand store, panels, and context-lost remount ladder are
shared, and a `CITY_RENDERER=three|pixi` flag chooses the chunk. The Pixi
scene is retained until the parity gate passes, then retired (or kept one
release cycle as fallback). `DistrictOverview` DOM fallback stays the final
ladder rung either way; the `city_enabled` kill switch is untouched.

| Pixi concept (today) | Three.js concept |
| --- | --- |
| `worldContainer` pivot transform from `CameraState` | `OrthographicCamera` at yaw 45°/elev 30°; `zoom` → frustum height = viewport/zoom; `rotation` → camera yaw (quarter turns become free); pan unbounded, zoom clamp preserved |
| Painter `zIndex = x + y` + one sortable layer | **Z-buffer** — sorting disappears; buildings are real 3D so occlusion is correct by construction |
| Screen-space chips (sector labels, selection names, "+N more" plates, HQ plate) | **DOM overlay layer**: project anchor world→screen on camera settle (same on-demand cadence; the count is tiny). Keeps Pixi-Text crispness, i18n-in-React, and a11y for free — do NOT rebuild text in WebGL |
| Avatar billboards (48×48 canvas, `crossOrigin`) | `Sprite` + `CanvasTexture` from the **same** downscale pipeline — the canvas-taint rule carries over verbatim |
| Per-building ~21-child Container tree | Per-building merged `BufferGeometry` (1 draw call per building) + global instanced meshes for windows/beacons → a 200-building home city ≈ **≤ ~60 draw calls** (vs ~4,500 display objects); satellites/universe minis merge per cluster under the same 24-cap |
| FX bursts (construct/loss/tier-up…, 320–600 ms one-shots) | Same one-shot pattern; `Points` where particles earn their keep — restrained per the transitions ruling |
| Removed bloom pass | Optional `UnrealBloomPass` behind the old perf-probe idea — default OFF (user removed it for perf) |
| `webglcontextlost` → remount ladder | Same listener on `renderer.domElement` → same ladder |
| Dev perf overlay via `perf` store slice | Identical wiring from the three render loop |

Picking keeps its ladder: screen→ground via `Raycaster ∩ y=0 plane` (affine
equivalent of today's `screenToWorld` — under ortho the results are
identical), then the same ordered passes (exact tile → satellites →
universe → landmark/civic/HQ bodies → proximate forgiveness → locked-pad
peek). Body-rect tests become world-space AABBs at the same tolerances.
`CameraRig` (DOM input → pure camera math) is reused nearly verbatim.

Windows-in-3D note: the lit-window mosaic renders at every LOD today
("light identity, not texture") — instanced quads keep that true at trivial
cost; close-LOD extras (mullions, micro-props) can stay 2D-facing quads.

## §7 Performance & bounded rendering

The bounded-rendering invariants all survive by construction: satellite
cap 24, detail limit 200, aggregate skyline slabs, LOD bands (now driving
geometry detail + overlay counts + window-quad culling). Frustum culling is
free. DPR cap 2 unchanged. Baseline backend = **WebGL2 everywhere**
(incl. iOS); WebGPURenderer is a later flag (bigger bundle, no gameplay
need). The render-on-demand loop ports exactly — three has no implicit
loop; idle stays ≈ 4 renders/s (light clock) with zero rAF churn. Mid-tier
mobile holds 60 fps at a full home city in comparable three.js iso-city
workloads; P0 exists to prove it on *our* low-end profile before any
commitment (§8). Vercel impact: none server-side; the lazy chunk gets
*smaller* (255 → 181 KB gz).

## §8 Phased migration plan (flag-gated, kill-switched)

Flag: `CITY_RENDERER=three|pixi` (env/localStorage, like `city_enabled`).
Pixi stays default until the P2 gate; both chunks coexist lazily — users
only download the selected one.

- **P0 — spike & perf proof (1–2 d).** Dev-only route: ortho 30°/45°
  camera over REAL `placement.ts` output, ~200 instanced/merged boxes,
  streets/terrain plate, pan/zoom via existing `CameraRig` math, ground-ray
  picking, the perf overlay. **Gate: 60 fps @ 200 buildings + satellites on
  the low-end device profile, and pixel-parity screenshot vs the Pixi view
  at the same camera.** If this fails, stop — the study dies here for
  ~2 days' cost.
- **P1 — home city parity (4–6 d, incl. 3–5 d grand-league art).** Civic
  league geometry builders, grand megaforms, HQ + six monuments (3 stages),
  window/beacon instancing, day/night material pairs, light clock, avatar
  billboards, selection + inspector bridge, DOM chips. **Gate: visual
  side-by-side vs Pixi, n38worth-game-systems review (zero economy drift),
  image-analyst pass on major states.**
- **P2 — world layers (3–5 d).** Satellites (24-cap minis), universe layer
  + lazy minis, aggregate slabs, root beams, district links, FX one-shots,
  value-orbit glide tweens (same smoothstep, capped 96). **Gate: parity +
  flip default to `three` behind the flag; Pixi chunk kept as fallback.**
- **P3 — hardening (2–4 d).** Reduced-motion snaps, keyboard parity,
  a11y mirror budget, context-lost ladder, zh/en chips, vitest for the new
  pure geometry builders (deterministic outputs, mirroring `scene/` test
  style), perf budget test à la `phase-d-bench`.
- **P4 — the payoff (optional, unpriced).** Perspective tilt mode, free
  orbit, coronation cinematic, shadows (off on mobile), WebGPU flag,
  optional bloom behind the perf probe.

**Total to shippable default: ~2.5–3.5 focused weeks.** The long pole is
not the engine — it is authoring T8–14 megaforms and the six monuments in
true 3D (Path A).

## §9 Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Restyle changes the game's look (art regression, zh/en chips, monument identity) | High | P1 side-by-side gate + image-analyst review per phase; keep palettes/silhouette rules; ortho parity mode as reference |
| Low-end mobile GPU (fill rate, overheating) | High | P0 perf gate on the real low-end profile before committing; ortho default; no shadows/bloom on mobile; aggregate band + DPR cap |
| Grand-league 3D authoring exceeds estimate | Medium | P1 can ship with parametric extruded towers first; bespoke elaborations iterate per tier like today's `step` ladder |
| Avatar canvas taint recurs in WebGL | Medium | Keep the exact `crossOrigin` + 48×48 canvas pipeline (`scene/avatars.ts` contract); test against the prod `/api/avatar` CDN redirect early |
| Bundle creep via addons / WebGPU build | Low | Import discipline (`three` core + `OrbitControls`-class addons only); WebGL2 baseline; WebGPU build deferred |
| Double-renderer maintenance during transition | Medium | Short window, typed scene contract shared by both, flag default flips once P2 passes |
| Three.js API churn (8–11-week minors) | Low | Pin exact version; upgrade deliberately; the scene layer is ours |
| Babylon-specific (if chosen anyway): 1.7 MB gz full core, barrel-import landmines | — | Deep-import lint rule + bundle-size CI budget |

## §10 Decision points

1. **Go / no-go on real 3D at all** — it is a spectacle/retention bet, not
   a mechanics need (§4). Status quo remains defensible.
2. **Engine**: Three.js (recommended, §3) vs Babylon.js.
3. **Art path**: procedural retarget Path A (recommended) vs Kenney CC0
   glTF base vs hybrid (A + CC0 props).
4. **Projection at launch**: orthographic 2:1 parity first (recommended),
   perspective/tilt as P4 — or full perspective immediately.
5. **React binding**: plain three in the imperative `CityScene` shape
   (recommended — no R3F dependency) vs R3F v9 (supported on React 19.2).
6. **Timing**: which weeks, and whether P4 is in the first release.

## §11 Free wins found during the audit (do regardless of the decision)

- **`pixi-filters` is a dead dependency** — declared in package.json
  (`^6.1.5`) with zero imports anywhere in `src/` since the bloom pass was
  removed (2026-09-28). Drop it.
- The scene's picking/camera/daylight purity noted in §2 is worth keeping
  sacred: any new scene code that stays out of Pixi types keeps a future
  swap (or a WebGPU-era Pixi 9) cheap.

## Appendix — measured numbers & sources (2026-09-29)

| Package | Version | Minified | Gzipped |
| --- | --- | --- | --- |
| `pixi.js` (current) | 8.21.0 | 913,088 B (892 KB) | 261,014 B (255 KB) |
| `three` | 0.186.1 (r186, 2026-09-08) | 736,231 B (719 KB) | 184,898 B (181 KB) |
| `@babylonjs/core` | 9.28.0 | 8,035,285 B (7,847 KB) | 1,780,395 B (1,739 KB) |

- Bundle sizes: bundlephobia.com API (`/package/three`, `/package/pixi.js`,
  `/package/@babylonjs/core`), fetched 2026-09-29.
- Babylon tree-shaking floor (~1–1.5 MB min properly shaken) and deep-import
  requirements: Babylon docs "ES6 Support with Tree Shaking" + forum
  thread "What are good tools for minimizing bundle size?".
- Three r186 cadence, WebGPURenderer/TSL production status, WebGPU
  cross-browser (incl. Safari 26, Sept 2025): npm registry + 2026 three.js
  ecosystem overviews.
- `@react-three/fiber` 9.8.1 peer deps (`react >=19 <19.4`, `three >=0.156`)
  — compatible with this repo's React 19.2.3.
- 2:1 dimetric parity (yaw 45°, elevation 30° ⇒ projected ground-axis slope
  exactly 0.5000, equal axis magnitudes; true isometric 35.264° ⇒ 0.5774):
  verified numerically for this study (camera-basis projection math).
- Repository facts: `src/lib/city/**`, `src/components/city/world/scene/**`
  audit of the current working tree (2026-09-29), including the uncommitted
  streets/civic batch.
