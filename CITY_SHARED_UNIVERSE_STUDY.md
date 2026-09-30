# City Shared Universe Study — ONE absolute world, every city fully rendered

> **STATUS: IMPLEMENTED 2026-09-30 (same day, uncommitted).** U1+U2+U3 all
> shipped: fixed `WORLD_BASE_RING` (64) congruence in both renderers, the
> skyline-extended `/api/city/universe` payload, and full 3D skylines
> (ring-chunked progressive meshes, device tiers, LOD gating). Both reviewer
> gates passed; the game-systems review's F1 also uncovered and fixed a
> PRE-EXISTING 3D bug (world-layer builders passed `tileToGround(...).y` —
> always 0 — as the ground z, collapsing streets/satellites onto one axis;
> now `.z` + a z-pinning regression test). Known divergence kept: universe
> slot ranks are DENSE-RENUMBERED (RANK() ties get distinct slots, so the
> HUD "your rank" can differ by one from a tied leaderboard rank).

Study date: 2026-09-30. Scope: **the city visual layer only** (universe map,
its payload, and its rendering). The city stays a derived projection of the
trading economy — every AGENTS.md §"Mainframe City building layer" invariant
applies unchanged: no second economy, placement stays derived, bounded
rendering, server authority untouched, CDN cost doctrine respected. Nothing
proposed here touches economy tables, ownership rules, or protection logic.

This doc prices the **"all"** branch of the 2026-09-30 user ruling "either
all or nothing" (the shipped answer was "nothing+": one tower per foreign
city, commit `273e81b`), extended with the second half of the ask: **everyone
sees the SAME universe** instead of per-viewer ones.

## §1 Executive summary

**Recommendation: adopt, in two decoupled steps.**
**Step U1 — congruence** (fixed world base ring, one shared constellation):
~0.5–1 focused day, zero new data, mostly deleting viewer-specific math.
**Step U2+U3 — full rendering** (every ranked city renders its real top-24
skyline, the already-blessed definition of "fully rendered"): ~2–3 focused
days more, one new CDN-cached payload (~35–45 KB gz) and ring-chunked merged
meshes. Estimated total **3–4 focused days** to a shippable default.

The findings that drive that recommendation:

1. **The two asks are independent axes.** "Same universe for everyone" is a
   placement/camera change (kill the per-viewer base ring + translation);
   "all cities fully rendered" is a payload/rendering change (ship skylines,
   draw minis). Each is shippable alone; together they answer the full ask.
2. **Congruence is nearly free because the layout is already pure.** The
   constellation is a pure function of the rank snapshot
   (`universeCityAnchor`); only `universeBaseRing(sectorCount)` (per-viewer
   scale) and the translate-to-viewer-origin step make it viewer-specific.
   Fixing one constant + deleting one subtraction restores the 2026-09-28
   "same constellation" design; making the camera world-anchored (fly to
   your city instead of recentering the world) upgrades it to *shareable*
   geography ("I'm on ring 5 east of the Capital").
3. **"Fully rendered" already has a user-blessed bounded definition.** The
   2026-09-29 satellite ruling ("render all their buildings" → top-24 by
   value + a "+N more" plate, `NEIGHBOR_BUILDING_LIMIT`) is exactly the line
   between full and bounded. Applying it to all 500 ranked cities =
   **12,000 windowless mini buildings** — feasible *because* the 3D renderer
   merges everything into static vertex-colored geometry: draw calls stay
   O(rings) (~+12), not O(buildings) (+12,000).
4. **The data is affordable only because of congruence.** A viewer-dependent
   world cannot be CDN-shared; a rank-derived world can. One
   `/api/city/world` payload (500 × {rank, username, family, hqStage, count,
   24 skyline tuples}) ≈ 110 KB raw / ~35–45 KB gz — the same cost class as
   today's summary-only universe payload (~35 KB raw), fetched on the same
   5-minute poll, `s-maxage=60`, no per-city request fan-out.
5. **The one real UX regression:** the 2026-09-29 "dynamic distance" ruling
   dies. A fixed base ring sized for the largest home city (64 tiles) puts
   the universe twice as far away for early-game viewers as their current
   32. Home-view framing compensates (you start zoomed on your city), but
   it must be said: this is the trade being bought.
6. **The one real engineering cost is churn.** Rank order shifts every
   10-minute snapshot, and dense ring slots cascade (one insertion at rank
   50 re-slots everyone after it). Mitigation: epoch-gated, ring-chunked
   rebuilds (only dirty rings), progressive inner-rings-first build, snap
   (not glide) for far rings. Ongoing steady-state frame cost stays zero
   (render-on-demand unchanged).

The honest counter-case (§5.5): TRUE full fidelity — every building of
every city with windows — is 100k+ buildings and MB-scale payloads; it
violates the bounded-rendering invariant and dies on mobile. The 24-cap is
not a compromise invented here; it is the line the user already drew for
foreign cities.

## §2 Baseline — what "individual universes" means today

Audited 2026-09-30 against the working tree (`src/lib/city/universe.ts`,
`scene3d/world3d.ts`, `scene3d/ThreeScene.ts`, `/api/city/universe`,
`/api/city/[username]`):

| Dimension | Current behavior | Where |
| --- | --- | --- |
| World scale | `universeBaseRing(sectorCount)` — Boot ≈ **32** tiles, full 3×3 = **64** (docstring prose "≈24/≈40" is stale; code snaps satellite-radii + 4 up to a multiple of 8) | `universe.ts:59` |
| Center | **The viewer's own city is always the world origin** — every other city placed at `anchor(city) − anchor(viewer)` | `universeCityOffset`, `universe.ts:155` |
| Foreign cities | **ONE building each** (pad+shaft+crown+spire+beacon, height by rank, violet for stakes), merged into ONE mesh; tap → chip + visit link | `buildUniverseCityBuildingsGeometry`, `world3d.ts:363` |
| City cap | 500 (`UNIVERSE_CITY_CAP`), positions from `user_rank_snapshots.portfolio_rank` (10-min cron) | `universe.ts:81` |
| Reach | Markers beyond ±150 tiles skipped (`UNIVERSE_MARKER_TILE_REACH`); ground plate half-extent ≈ 153 tiles | `world3d.ts:319`, `building3d.ts:872` |
| Satellites | Separate viewer-relative layer: 8 steal-target cities × 24 real mini buildings + relay core, scale 0.8, orbiting OUTSIDE the viewer's grid | `world3d.ts:217`, `neighbors.ts:29,38` |
| Payload | `{epoch, cities:[{rank, username, profession}]}` — summaries only, ~35 KB, `s-maxage=60`, 5-min poll | `/api/city/universe/route.ts` |
| Renderer divergence | Three (default): towers, always drawn, no lazy loads. Pixi (legacy): marker dots + ≤8 lazy minis / 14 live on viewport | `world3d.ts:356`, `UniverseLayer.ts:329` |

So "rendered differently" is true in three distinct senses today:
**(a)** placement — every viewer's universe is self-centered and
size-scaled; **(b)** renderer — the same URL shows towers in three and
dots+lazy-minis in pixi; **(c)** zoom state — pixi's world changes as you
pan (minis pop in), three's does not. A shared-universe ruling needs to
answer all three (§6).

One non-obvious baseline fact: the ORIGINAL 2026-09-28 design was already
translation-congruent ("every viewer sees the same constellation … a
translation nobody can observe", `universe.ts:4`). The 2026-09-29 dynamic
-distance ruling broke **scale** congruence (per-viewer base ring), not
translation congruence. U1 is therefore partially a *restoration*, not a
new design.

## §3 Decoupling the two asks

| | Viewer-scaled worlds (today) | Shared absolute world |
| --- | --- | --- |
| **One building per city** (today's rendering) | current state | **U1** — congruence only |
| **All cities fully rendered** (the ask) | not studied — incoherent (a "full" world that looks different per viewer) | **U1+U2+U3** — the full ask |

U1 alone already changes the product meaningfully (same geography for
everyone) at near-zero cost. U2/U3 (payload + rendering) are what make it
look like the ask envisions. Phasing gates each step independently.

## §4 U1 — congruence: everyone sees the same universe

### §4.1 Mechanics

- **`WORLD_BASE_RING = 64`** (fixed constant, replaces
  `universeBaseRing(sectorCount)`): the largest home city's satellite ring
  is 60 tiles (`satelliteRingRadii(9)`); +`UNIVERSE_CLEARANCE_TILES` 4 = 64,
  already a multiple of the ring step. Every viewer's universe starts at
  the same radius. Ring step stays **8** with minis at ~0.55 scale (the
  2026-09-29 "almost crashing" packing), widening to 12 only if U3's minis
  render bigger (§5.2).
- **Keep or kill the self-centering translation — two flavors:**
  - **T-congruence (cheap):** keep `universeCityOffset`'s translate-to-viewer
    step. Every viewer sees the *same constellation*, self-centered. This is
    the 2026-09-28 design with the scale fix. Diff: one constant.
  - **A-congruence (recommended):** world origin = rank-1 city (**"the
    Capital"**); your city renders at ITS anchor (one group transform); the
    camera *flies to* your city on load (the `focusSatellite` machinery
    already exists); `/city/[username]` frames the visited city in the SAME
    world — every visitor sees identical world pixels. Positions become
    shareable language; spectating ("watch them climb toward the center")
    becomes legible. Cost: camera framing work + the LOD interaction rules
    in §4.2.
- **Satellites stay viewer-relative in U1** (they are YOUR steal targets —
  an overlay, not geography). Strictly, the owner's own view then has one
  viewer-relative layer on a shared world; that is correct and does not
  violate congruence (geography is shared; overlays are personal). §8 U4
  optionally converges them into highlights on the absolute map.

### §4.2 The overlap problem (the one real design constraint)

In a world-anchored layout, a full-detail home city spans ~±50–60 tiles
(3×3 grid + moat), while foreign mini cities sit on rings only 8 tiles
apart. Inner-ring (higher-rank) minis would geometrically poke through the
viewer's own grid at close zoom. Resolution — extend the existing LOD bands
(`scene/lod.ts`: world < 0.7, district 0.7–1.2, close > 1.2):

| Zoom band | Home city | Universe cities |
| --- | --- | --- |
| world (< 0.7) | demotes to its own mini (symmetric — you see yourself in the world) | all render as minis at absolute anchors |
| district (0.7–1.2) | full detail | minis visible EXCEPT anchors inside the home footprint + 6 tiles (hidden — they'd be inside/behind you) |
| close (> 1.2) | full detail | hidden (this is already the pixi rule; port it to three) |

The world-band demotion is what makes the world honest: at world zoom
*everyone including you* is a skyline, so your position in the geography is
legible and no rendering rule depends on who is looking.

### §4.3 What dies / what must be rewritten

- `universeBaseRing(sectorCount)` and its coupling to satellite radii (for
  sizing the universe; satellites keep their own radii).
- The 2026-09-29 dynamic-distance ruling (documented above as the UX cost).
- `universe.test.ts` assertions "base ring scales with sectorCount" and
  "viewer translation invariance" invert into: same anchor for every
  viewer; fixed base clears the LARGEST city's satellite zone; own-city
  offset = own anchor (A-congruence) or zero (T-congruence).
- Stale `universe.ts` docstring numbers (≈24/≈40) — fix while touching.

### §4.4 Numbers after U1

Base 64, step 8 → ring capacities = radius (64, 72, 80, …); cumulative
64, 136, 216, 304, 400, 504 → **500 cities end on ring 6, world rim ≈ 112
tiles** — inside the current reach (150) and ground plate (~153). No plate
or reach change needed at step 8.

## §5 U2+U3 — full rendering: what "all" actually costs

### §5.1 The definition (satellite precedent)

"Fully rendered" for a foreign city = its **top-24 buildings by value** as
windowless mini buildings (family palette, tier heights, monuments + relay
core) + a "+N more" plate when `visibleOwnedCount > 24`. This is exactly
what the 8 satellite cities render today (`buildSatelliteCluster`,
`world3d.ts:217`) — the ask generalizes an existing, user-approved renderer
from 8 cities to 500.

### §5.2 Scale math

- **12,000 mini buildings** (500 × 24) at ~0.55 scale on
  `satelliteClusterTiles` anchors (radius 7 airy clusters — reuse as-is).
- **Boxes:** mini path skips windows/mullions; ~6 boxes per mini → **~72k
  boxes ≈ 1.7M verts / ~2.6M tris**, merged into static vertex-colored
  geometry behind ~6 shared materials. For calibration: today's whole world
  view is ~3.6k boxes; the 3D renderer was measured at 54 draw calls /
  197 full-detail buildings; merged static geometry of this size is routine
  desktop load and fine on mid mobile at DPR ≤ 2. Device tiers for low-end:
  8 buildings/city (4,000 minis, ~576k verts) or 4/city.
- **Draw calls:** ring-chunked meshes (~6 rings → ~6 extra draw calls), not
  per-city (500) and certainly not per-building (12,000).
- **Build time:** full-detail 200 buildings already build "well under a
  sync budget" (building3d.test.ts); minis are cheaper per building but 60×
  the count → **progressive chunked build**, inner rings first, N
  cities/frame; the world completes in ~1–2 s without blocking input.
- **Footprint:** a 24-mini cluster at 0.55 spans ~8–9 tiles → ring step 8
  stays honest; if the minis read too tight at 0.8 scale, step 12 pushes
  the world rim to ≈ 144 tiles — still inside plate/reach, but verify.

### §5.3 Payload + API + DB (U2)

- **`GET /api/city/world`** (or extend `/api/city/universe`): per city
  `{rank, username, profession, hqStage, visibleOwnedCount, truncated,
  skyline: [[tier, familyIdx] × ≤24]}`. JSON ≈ 110 KB raw / **~35–45 KB
  gz**; a binary variant (4 bits tier + 4 bits family per building) would
  be ~30 KB raw if ever needed. Viewer-independent by construction →
  `public, s-maxage=60, stale-while-revalidate=300`, same 5-min poll.
  No auth, no per-user variance (the CDN rule).
- **Query:** the city route's neighbor fetch generalized — one windowed
  `ROW_NUMBER() OVER (PARTITION BY owner_id ORDER BY player_value DESC)`
  over ownership ⋈ users for the top-500 owners, `rn ≤ 24`, plus goddess
  flags per city. One query, indexed on `owner_id`; the doubly-correlated
  portfolio expression is NOT needed (ranks come from
  `user_rank_snapshots`). Expected: a few hundred ms cold on Neon, absorbed
  by the CDN window. **Escape hatch if it bites:** materialize the world
  projection inside the existing 10-min `rank-snapshot` cron into a derived
  table — per-request cost collapses to one indexed read, and no new cron
  is added (cost doctrine respected).
- **Cost doctrine check:** no new crons, no tightened cadences, no
  per-viewer payloads, polling unchanged (5 min ≥ 2 min rule), Pusher not
  required (the world is a shared 10-min-stale artifact — see §5.4).

### §5.4 Churn — the ongoing cost

Rank order changes every snapshot (portfolio rewards move values), and
ring slots are dense: an insertion re-slots every later city. Today that is
free (markers re-derive; the 3D mesh rebuilds silently). With 12,000 minis
a full rebuild is ~1–2 s of chunked work — acceptable as a snap, bad as a
loop. Mitigations, in order:

1. **Epoch gate (exists):** rebuild only when the rank ORDER hash changes.
2. **Ring-chunked dirty rebuild:** diff ring membership; rebuild only
   rings whose member set changed (typically 1–3 of ~6; ~100–200 ms).
3. **Debounce to the poll cadence:** at most one world re-derive per 5-min
   fetch, never per snapshot.
4. **No per-city glides in world view** — far cities snap (reduced-motion
   parity for free); the camera, not the geometry, animates.

Everyone seeing the same 10-min-stale world is a *feature* of this design,
not a bug: it is what makes the payload cacheable and the geography stable
enough to share.

### §5.5 The honest ceiling — what is rejected

TRUE full fidelity — every building of every city (not top-24), with the
lit-window mosaic, at world zoom — is 500 × up-to-200+ = 100k+ buildings
(~4–6M verts just for mass), payloads in the MBs, per-viewer framing that
fights the CDN, and geometry rebuild churn that never settles. It violates
the bounded-rendering invariant outright and dies on low-end mobile. The
24-cap is the user's own bounded-rendering line; this study does not
propose crossing it. (Visiting a city's page already shows its TRUE full
render — that boundary stays.)

## §6 The three "rendered differently" senses — rulings needed

1. **Placement (congruence):** resolved by U1 — recommend A-congruence
   (absolute camera, Capital-centric world). T-congruence is the fallback
   if camera work must be deferred; it can ship in the same PR as a flag.
2. **Renderer (three vs pixi):** recommend ruling pixi a **compatibility
   renderer** with skyline *silhouette* parity only (batched rect
   skylines — pixi's strength; no per-mini Graphics trees), documented as
   visually simplified, OR freezing pixi at markers with documented
   divergence. Do NOT port full mini parity to pixi (double maintenance for
   a non-default path).
3. **Zoom state:** world content becomes deterministic across viewers and
   renderers at world zoom (all minis, always drawn — no lazy pop-in,
   honoring the "all or nothing" ruling's spirit). Lazy fetching survives
   only as the progressive *geometry build* order, which is invisible.

## §7 Options ladder

| Option | Content | Cost | Verdict |
| --- | --- | --- | --- |
| **A. Status quo** | self-centered, size-scaled worlds; one tower per city | 0 | the baseline being questioned |
| **B. U1 congruence only** | shared constellation (absolute camera), towers stay | ~0.5–1 day, no new data | cheap identity win; shippable alone |
| **C. U1+U2+U3 (recommended)** | shared world + every city's real top-24 skyline | ~3–4 days total | the ask, inside every invariant |
| **D. Congruent + viewport-lazy full minis** | minis pop in as you pan | similar to C | **rejected** — re-introduces the lazy pop-in the 2026-09-30 ruling killed |
| **E. True full fidelity** | every building, every city, full LOD | weeks + ongoing | **rejected** — §5.5 |

## §8 Migration plan (phased, each gated)

- **U1 — congruence.** `WORLD_BASE_RING` constant; delete the per-viewer
  scale (and the translation, if A-congruence); home city renders at its
  anchor via one group transform; camera fly-to-home on load; public
  `/city/[u]` frames the visited city in the same world; LOD band rules of
  §4.2 (close-zoom universe hide is a straight port of the pixi rule).
  Rewrite the scaling tests into congruence tests. **Gate:** two
  different-size test viewers produce byte-identical world geometry (probe:
  `window.__city3d` anchors); public page world matches the owner's minus
  UI chrome; game-systems review (display-only, but per AGENTS.md gate).
- **U2 — world payload.** Route + windowed query + types + vitest (caps,
  determinism, CDN headers, no-auth). Renderer consumes it but still draws
  towers. **Gate:** payload ≤ ~150 KB raw / ≤ ~50 KB gz; cold query p95 <
  ~500 ms (else cron materialization); headers verified.
- **U3 — skylines.** Per-city mini geometry (reuse
  `buildMiniBuildingGeometry` + `satelliteClusterTiles`), ring-chunked
  meshes, progressive build, device tiers, "+N more" plates on focus,
  per-city hit proxies (one invisible pick box per city — not per
  building), selection-only chips (existing DOM budget rule), stake violet
  + Capital hero treatment. **Gate:** dev-probe draw calls and build time
  within budget; 60 fps desktop / ≥30 fps mid mobile at world zoom;
  image-analyst pass on day/night world shots; zh + en strings.
- **U4 — optional convergence.** Satellites become highlights on the
  absolute map (steal UX = fly to the real city); pixi silhouette parity
  or formal freeze; cron materialization if U2's query cost shows up in
  billing.

## §9 What this does NOT change

Rank source and 10-min snapshot cadence; the economy and every formula;
`/api/city/[username]` full-city projection; satellite steal logic and
protections; the Root Sequence countdown; DETAILED_LIMIT 200; the renderer
flag. The 2026-09-30 "one building" ruling is superseded only by an
explicit user go-ahead on U3 — until then `273e81b` remains the shipped
world.
