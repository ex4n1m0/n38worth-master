# Mainframe City — Building Visuals Study

**Goal:** match the visual quality of the provided reference image (cyberpunk
night isometric megablock diorama) for the live city renderer, without breaking
any of the city layer's invariants (derived-only, bounded rendering,
color-blind-safe families, reduced-motion, CDN-only assets).

**Date:** 2026-09-27 · **Status:** study (no code changed)

---

## 0. TL;DR

The reference is **not architecturally complex** — it is a stack of simple
boxes. Its quality comes almost entirely from the *presentation stack*: night
palette, emissive neon, bloom + light spill, micro-detail density (hundreds of
windows, pipes, props), wet reflective ground, atmospheric fog, and cinematic
grading. Our procedural Pixi massing is the right foundation and already
encodes the gameplay invariants; the gap is surface + light + atmosphere.

Recommended plan, in ROI order:

| Phase | Track | What | New assets? | New deps? |
|---|---|---|---|---|
| V1 | A | Relight: night palette, gradient faces, window overhaul, wet ground, depth fog, grade overlay | none | none |
| V2 | B | Selective bloom on an emissive layer + light-spill decals | none | `pixi-filters` |
| V3 | C | AI-generated building atlas (3 families MVP) through the designed `atlasByTier` swap point | WebP sprites | none (sharp already) |
| V4 | C+D | Full 7-family atlas, micro-props, sky/parallax, ambient particles | WebP sprites | none |

Every phase ships independently and is reversible (`PLACEHOLDER_ART` flip,
flag-gated). Phases V1–V2 are pure code and can be verified with the existing
image-analyst visual gate.

---

## 1. The reference, deconstructed

Vision analysis of the image (full breakdown below) identifies a **3D-rendered
cyberpunk diorama** — a Kowloon-style stacked tenement tower on a floating
ground slab, night scene, ~30–35° isometric camera, saturated void background.
The quality ingredients, in order of how much they contribute to the
"expensive" look:

1. **Night-time value structure.** 80% of every surface is near-black blue
   (#10141F…#1A2233); the eye reads form from *emissives*, not from diffuse
   shading. Contrast range is extreme (deep #05060A void → blown-white cores).
2. **Emissive neon hierarchy.** Two dominant hues (magenta #FF2E88, cyan
   #2DE2FF) + warm tungsten accents (#FFB547). Emissives are placed with
   intent: signage clusters at corners/edges, window grids on faces, ground-
   level shopfronts — not evenly spread.
3. **Bloom + light spill.** Every emissive bleeds a soft halo onto neighbors;
   neon signage tints adjacent walls and the ground slab. This single effect
   does the most "render engine" work.
4. **Micro-detail density.** Hundreds of small lit windows with *varied*
   warm/cool color and lit/unlit states; AC units, vents, pipes, cables,
   antennas, fire escapes, awnings. Irregular, organic clustering.
5. **Wet reflective ground.** Dark slab with vertical light streaks under the
   brightest emissives — cheap mirror illusion, sells "rainy night".
6. **Atmospheric perspective.** Lower/farther floors wash into fog; the tower
   emerges from haze; background dissolves to void. Depth cues everywhere.
7. **Palette grading + vignette.** Teal-shadow / magenta-highlight split tone,
   crushed blacks, corner vignette, film-like saturation.
8. **Hero framing.** Single subject filling frame, slight camera perspective,
   floating base in void → "diorama" premium feel.

### Extracted palette canon

| Role | Hex | Notes |
|---|---|---|
| Void / sky | `#05060A` → `#0A0E1A` | vertical gradient, not flat |
| Mass dark (base faces) | `#10141F` / `#141B2B` | the "80%" — blue-black, never pure gray |
| Mass mid (lit faces) | `#1A2233` / `#232D45` | |
| Neon magenta | `#FF2E88` | dominant accent 1 |
| Neon cyan | `#2DE2FF` | dominant accent 2 |
| Warm tungsten | `#FFB547` / `#FF9A3D` | window mass, shopfronts |
| Deep red | `#E5484D` | hazard accents |
| Mint / acid green | `#3DDC97` | sparse signage |
| Specular white | `#F2F7FF` | blown bloom cores |

### Why the gap is smaller than it looks

Our `art.ts` families already produce **distinct massing** (vault / gateway /
reactor / stack / rack / hangar) with a tier ladder. The reference's subject is
*boxier than our Zero-Day gateway*. Conclusion: **keep the procedural massing
as the permanent geometry base** and invest in the presentation stack (A/B),
with real art (C) reserved for hero closeups where sprites beat vectors.

---

## 2. Where we are today

Architecture facts the plan builds on (all verified in code):

- **Pixi 8.21, WebGL**, antialias, `background: 0x05070d` flat
  (`CityScene.ts:203`), render-on-demand ticker (no per-frame cost when idle).
- **Buildings are 100% procedural `Graphics`** — flat 3-tone face shading
  (`shade(c, 0.55/0.78/1)`, `art.ts:138`), stroke-only "glow" approximations,
  no textures, no filters anywhere in the scene.
- **The swap point already exists and is designed for this study**:
  `CITY_ART_MANIFEST.atlasByTier` slots (7 per family, all `null`),
  `PLACEHOLDER_ART = true` (`art.ts:44`), and `familyArt()` is the only entry
  the scene uses — "components only ever call familyArt(), so the swap touches
  this module alone."
- **Windows are a 3×5 max dot mask** (`drawWindows`, `art.ts:747`) — the
  single biggest density gap vs the reference's hundreds of varied windows.
- **LOD system** close/district/world (`lod.ts`), culling, `DETAILED_LIMIT`
  200, aggregate blocks for the rest — bounded rendering is already solved.
- **Family palette** (`district.ts:32`) is hue-spread-audited, shape-primary
  (grayscale-tellable), and deliberately avoids the protection-ring colors
  (firewall `#22d3ee`, hard-lock `#f59e0b` — these are gameplay canon, keep).
- **Precedent for offline art generation**: `scripts/gen-scifi-art.ts`
  (deterministic SVG → sharp → WebP into `public/`). `sharp@0.34.5` already a
  dependency.

Gap table (reference ingredient → current state):

| # | Ingredient | Today | Gap |
|---|---|---|---|
| 1 | Night value structure | mid-gray family fills | full — faces are colored, not dark |
| 2 | Emissive hierarchy | bright strokes/beacons | partial — no emissive *system* |
| 3 | Bloom + spill | none | full |
| 4 | Micro-detail | 6–15 dots per building | full |
| 5 | Wet ground | flat dark diamond + rim | full |
| 6 | Atmosphere | none | full |
| 7 | Grade + vignette | flat bg | full |
| 8 | Hero framing | done (Phase C HQ home view) | none ✅ |

---

## 3. Track A — Relight (pure code, no new assets) — Phase V1

The single highest-ROI change; transforms the whole scene in one pass.

### A1. Night palette canon (art.ts + district.ts)

Rebase every family on the **blue-black mass palette** and demote the current
family hue to the *emissive accent* role. Proposed mapping (keeps the audited
hue spread and the protection-ring separation):

| Family | Base mass | Emissive accent (windows/neon/edges) |
|---|---|---|
| Cryptographer | `#151327` (violet-black) | `#B491FF` neon violet |
| Zero-Day | `#1F1216` (red-black) | `#FF4A5E` neon red |
| Overclocker | `#131A12` (green-black) | `#B7FF4A` acid reactor |
| Cache Keeper | `#0F1A18` (mint-black) | `#3DDC97` mint |
| Server Marshal | `#101722` (blue-black) | `#6FC6FF` (stays clear of firewall `#22d3ee` ring, which is a platform stroke, not body fill) |
| Bot Herder | `#1C1710` (amber-black) | `#FFB547` tungsten |
| Unassigned | `#141821` | `#9CA3AF` |

`FAMILY_HEX` stays the *accent* source (DOM panel keeps working unchanged);
the base mass becomes a second entry in the same record. Face shading moves
from `shade(c, 0.55/0.78)` to gradient fills (A2) so the family hue survives
the darkness.

### A2. Gradient faces + AO seams + rim light (art.ts)

Pixi v8 `Graphics` supports `FillGradient` (linear/radial) fills natively:

- **Left/right faces**: vertical linear gradient — top lit (mass-mid +10%),
  bottom in shadow (mass ×0.5). Instantly reads as "lit from above/side",
  kills the flat-toy look.
- **Top diamonds**: subtle radial gradient (center bright) = sheen.
- **AO seams**: 1px near-black stroke along shared edges of stacked boxes
  (`drawIsoBox` gets an optional seam stroke) — the cheapest way to get the
  reference's "floors stacked in shadow" separation.
- **Rim light**: 1.5px bright accent stroke along the TOP front edges of each
  box only (screen-up edges) — reads as neon edge-lit architecture.

### A3. Window system overhaul (art.ts `drawWindows` → `drawFacade`)

Replace the 3×5 dot mask with a deterministic per-face window grid:

- **Per-side columns scale with tier** (tier 1 → ~4 cols; tier 7 → ~9 cols,
  2 faces ⇒ up to ~100 windows at close LOD). Rows already capped by family
  body height — keep that rule.
- **Seeded lit/unlit pattern** (`mulberry32(building.id)` — same RNG
  precedent as gen-scifi-art) so windows are stable across frames/visits but
  varied per building: ~55% lit, warm `#FFB547` / cool `#BFD7FF` mix (~70/30),
  occasional blown `#F2F7FF`.
- **Windows are drawn in an EMISSIVE sublayer** (`BuildingSprite` gains an
  `emissive` Graphics above `silhouette`) — this is the hook Track B blooms.
- District/world LOD keep the current behavior (layer hidden) — bounded cost,
  and at distance the *massing* carries identity, exactly as today.

### A4. Wet-slab ground + light spill (art.ts `drawPlatform` + CityScene)

- Platform becomes the **wet slab**: darker fill (`#0A0E1A`), family-accent
  radial gradient wash (low alpha) centered under the building = neon
  reflected in puddle.
- **Reflection streak**: below each professioned building, a 2–3px-wide
  vertical gradient strip in the accent color at ~25% alpha, height ∝ tier —
  the "vertical light streak" from the reference. One gradient rect per
  building, part of the platform layer, zero extra draw calls.
- Sector pads get a faint accent-gradient version of the same wash.

### A5. Atmosphere + grading (CityScene.ts)

- **Depth fog**: in iso, depth = `x+y`; tint/alpha far sprites toward
  `#0A0E1A` (a per-sprite tint computed in `IsoWorld` depth sort pass —
  reuses the existing zIndex walk, no new pass). Far rows melting into the
  background is the reference's strongest depth cue.
- **Sky**: replace flat background with a full-screen gradient sprite
  (`#05060A` → `#0A0E1A` + a faint `#1A1030` horizon band). One sprite, no
  filter.
- **Grade + vignette**: one full-screen overlay sprite — radial vignette
  (edges → `#05060A` 60% alpha) + very subtle teal-shadow tint. A DOM/CSS
  overlay over the canvas is even cheaper (zero WebGL work) and trivially
  reduced-motion safe; prefer CSS.

**V1 acceptance:** night screenshot passes the image-analyst visual gate
(lighting/atmosphere present, families still distinguishable in grayscale,
firewall/hard-lock rings still legible); perf gate: render-on-demand cadence
unchanged, no measurable per-frame regression (all changes are bake-time
Graphics work, not per-frame).

---

## 4. Track B — Bloom & emissive pipeline — Phase V2

The effect that makes the reference read "rendered". Pixi v8 path is
confirmed: the unified **`pixi-filters` v6** package targets Pixi v8 and ships
`AdvancedBloomFilter`.

### B1. Selective bloom via an emissive render layer

- `CityScene` adds a Pixi `RenderLayer` collecting every building's emissive
  sublayer (windows, coils, beacons, root beams, spill decals) + HQ/landmark
  emissives.
- One `AdvancedBloomFilter` (threshold ~0.6, blur ~8–12px, brightness ~1.2)
  on that layer, composited over the scene with normal blending — bloom
  bleeds *onto* the dark massing exactly like the reference.
- Everything stays baked/stroke-based; bloom alone supplies the halos, so we
  can DELETE the current fake-glow double-strokes (net win).

### B2. Light spill (decals, not filters)

- Additive radial-gradient sprites placed on the ground slab and on the two
  faces adjacent to each big emissive (signage corners, reactor coils).
  Generated once as tiny textures (64px radial gradient per accent color,
  7 textures total) and reused — no per-building textures.

### B3. Mobile fallback + budget

- Bloom OFF when: `lod === "world"` (massing-only zoom), WebGL renderer is
  not `webgl2`, or a runtime probe (frame-time EMA > ~11ms over 60 frames)
  trips — degrade silently to V1 look.
- Filters allocate full-screen buffers; on DPR-clamped canvases
  (`MAX_DPR` already caps resolution) the cost is bounded. Keep exactly ONE
  filtered layer in the scene (this one), never per-building filters.
- Verify the existing webglcontext-lost path with filters enabled.

**V2 acceptance:** side-by-side close/HQ screenshots pass visual gate
("glow reads as light, not as blur"); perf gate: 60fps hold on a mid-tier
Android Chrome (devtools throttle) at close LOD × 200 detailed buildings;
fallback triggers verified by forcing each condition.

---

## 5. Track C — Real art atlas (AI-generated) — Phases V3/V4

For hero closeups, pre-rendered sprites beat vectors. The designed swap point
(`atlasByTier` + `familyArt()`) means the scene code does not change.

### C1. Swap mechanics (already designed in art.ts)

1. Generate art per (family × tier 1–7) — 49 slots + unassigned 7 = 56
   sprites; optional +56 emissive-only variants (black + windows) for the
   bloom layer.
2. Fill `atlasByTier` URLs, set `PLACEHOLDER_ART = false`.
3. `BuildingSprite.redraw()` gains a texture branch: `Sprite` from the atlas
   frame instead of `drawBase/drawFloor` stacked Graphics; windows layer
   comes from the emissive variant sprite (or is baked in). Tier ladder =
   taller atlas frame, tier features bake into the art itself.
4. **Placeholder stays the fallback**: if a texture fails to load, render the
   procedural art for that building (never a hole).

### C2. Generation strategy

The reference itself is AI-era 3D-style art; generate with an image model in
**isometric sprite-sheet mode**, with these hard constraints per prompt:

- Orthographic 2:1 isometric, camera ~30°, **fixed light direction** (top-
  left key, magenta/cyan practicals from the right) across ALL sprites.
- Isolated subject on **transparent/solid-key background**, single building
  per image, centered, full silhouette in frame with margin.
- Base massing follows each family's canonical silhouette (vault / gateway /
  reactor / stack / rack / hangar) so the color-blind-shape invariant
  survives the art swap — include a description + the placeholder render as
  the style/massing reference image.
- Palette-locked: name the exact accent hexes; post-process clamps hue anyway
  (C3).
- Tier = height/floor count: generate tier 1 and tier 7 anchors per family,
  derive intermediate tiers by floor-insertion when possible (halves the
  generation count).

### C3. Deterministic post pipeline (sharp, gen-scifi-art precedent)

New `scripts/gen-city-atlas.ts` orchestrator — AI step is manual/semi-auto
(drop raw PNGs into `scripts/city-art-raw/`), everything after is
deterministic and re-runnable:

1. **Key → alpha** (chroma removal + edge de-fringe).
2. **Hue clamp**: remap accent pixels to the canonical family hex (LUT via
   sharp `tint`/`modulate` + a per-family mask from hue distance) — kills
   model palette drift across 56 images.
3. **Slice + trim** to power-of-two frames; emit the close texture (≤256px
   tall for tier 7) + mip ladder (256/128/64) as separate files (simpler than
   runtime mips; world LOD uses the 64px variant).
4. **Emissive mask pass**: threshold-extract lit pixels → black-background
   emissive variant for Track B.
5. Write `public/city/<family>-t<tier>[-e].webp` (~15–40KB each; total budget
   ≲ 2.5MB, lazy-loaded, immutable Vercel CDN caching).
6. Emit the `atlasByTier` URL table as a generated TS module (no hand-typed
   URLs).

### C4. Loading & runtime

- Pixi `Assets.load` the visible families first (own city → usually 1–3
  families), crossfade placeholder → atlas on arrival (reuse the existing
  LOD fade tween machinery). Visiting a foreign city prefetches after first
  paint, never blocking.
- VRAM: worst case 200 detailed buildings × shared family textures (7
  families × 3 mips ≈ 7×(256²+128²+64²)·4B ≈ 2.3MB GPU) — trivial.
- `prefers-reduced-motion`: crossfades become instant swaps (existing policy
  hook).

### C5. QA gates

- Every sprite passes an image-analyst audit: silhouette matches family
  canon, light direction consistent with the set, palette within clamp,
  transparent edges clean.
- Grayscale screenshot test: families still tellable with color stripped
  (invariant from `district.ts`).
- Bundle/Lighthouse: no atlas bytes on the /city critical path before
  interaction.

### C6. Hybrid fallback (if AI consistency disappoints)

Keep procedural geometry; composite AI-generated **facade texture strips**
(per-family, tileable window/pipe/AC-unit sheets) onto the iso faces as
multiply-blend fills (Pixi v8 supports texture fills on Graphics). Gets 70% of
the micro-detail win with perfect silhouette/tier control. Decide after the
V3 3-family MVP.

---

## 6. Track D — Scene composition — Phase V4

- **Micro-props at close LOD** (procedural, art.ts): rooftop AC units,
  antenna whips, cable runs between close-adjacent buildings (family-
  flavored; Overclocker getsTesla arcs it already hints at).
- **Sky**: sparse starfield (one static texture), faint distant-skyline
  silhouette strip with 0.3× parallax at world LOD.
- **Ambient particles** (all reduced-motion gated, pooled sprites, driven by
  the existing self-suspending rAF): steam wisps from vents, 2–3 drifting
  drone lights, occasional window flicker (a handful of seeded emissives
  toggling on a slow shared clock — never per-window timers).
- **Rain?** Skip in V4 — costs a full-screen effect for mood we already get
  from the wet slab; revisit only if users ask.

---

## 7. Rollout & invariants checklist

- [ ] V1 code-only relight → visual gate + perf gate → flag on
- [ ] V2 bloom layer + spill + fallbacks → gates → flag on
- [ ] V3 atlas MVP (3 families × 7 tiers) + pipeline script → gates →
      `PLACEHOLDER_ART` flips per-family (staged, placeholder fallback live)
- [ ] V4 full atlas + props + sky → gates
- Derived-only: all visuals stay a projection of server state — no new
  economy data, no client recomputation (AGENTS.md §Mainframe City).
- Bounded: LOD/culling/DETAILED_LIMIT untouched; new layers inherit budgets.
- Accessibility: silhouettes primary in every track; reduced-motion honored
  (crossfades, particles, drift); contrast of protection rings re-verified
  after V1 (rings are accent-on-dark now — the cyan/amber on near-black
  actually *improves*).
- Cost: zero new server work; atlas is static CDN bytes; no polling changes.
- i18n: no user-visible strings added by A/B/D; C adds none either.
- Kill switch: `npm run city:flag -- off` unchanged; per-phase feature flags
  for bloom (`CITY_BLOOM=off` env → skip filter layer).

## 8. Risks

| Risk | Mitigation |
|---|---|
| Mobile GPU cost of bloom | single filtered layer, world-LOD off, frame-time probe fallback (B3) |
| AI palette/silhouette drift across 56 sprites | hue-clamp LUT + silhouette reference image + per-sprite visual gate (C2/C3/C5) |
| Texture pop-in on foreign cities | placeholder fallback + post-paint prefetch (C4) |
| Dark scene hurting readability of gameplay states | protection rings & selection stay canon-bright; grayscale gate; dark-mode contrast audit in V1 acceptance |
| Scope creep into a "second economy" | this study is render-only; any state change goes through n38worth-game-systems review per AGENTS.md |

## 9. References

- PixiJS v8 `FillGradient`/`FillPattern` fills (official docs; skills.rest
  summary confirms Graphics gradient fills in v8).
- pixi-filters v6 ↔ PixiJS v8 compatibility table (pixijs.io); v8 migration
  guide: legacy `@pixi/filter-*` deprecated → unified `pixi-filters`.
- In-repo: `art.ts` (manifest + swap design), `district.ts` (palette canon),
  `lod.ts` (budgets), `scripts/gen-scifi-art.ts` (deterministic art pipeline
  precedent).
