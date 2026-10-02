# Building Designs Study — 2D, 3D and the shared card art (2026-10-02)

A complete inventory of every building design the game can render, across all
three render surfaces, written as the input for the upcoming "which designs
need improvement" review. It also drove the /catalog rebuild shipped with it:
the catalog now shows every subject in **2D blueprint**, **card art** and
**3D** side by side, so each row of this study can be *seen*, not just read.

---

## 1. Three render surfaces, ONE art source

```
                     building-art.ts  (pure ArtSpec — the ONE card-art source)
                    /            |               \
        BuildingSprite.tsx    CityMap2D.tsx     map3d/art-geometry.ts
        (SVG echo, market     (canvas           (ArtSpec → volumes:
        cards + catalog)       "Blueprint"      boxes/spheres/tori)
                                footprints)          |
                                                    v
                                          map3d/engine.ts (three.js,
                                          instanced per (family, tier))
```

- **Card art** (`src/lib/city/building-art.ts`) is the canonical design: an
  iso 2:1 vector spec (poly/rect/ellipse/circle/line/path shapes). It has the
  family silhouettes, tier ladder, lit windows, halos, beacons.
- **2D Blueprint map** (`map2d/draw.ts`) does NOT consume the card art at
  all — buildings are abstract family-colored square footprints with the
  card's photo avatar in the center. It is a land-registry map, not a
  skyline.
- **3D view** (`map3d/art-geometry.ts` + `engine.ts`) COMPILES the card art
  into real volumes — same colors, same massing, rotatable, with a sun and
  soft shadows.

So "the building design" for any one card exists in three languages; the
catalog + §7 coverage matrix below make the differences auditable.

---

## 2. Inventory A — owned buildings: 7 families × 14 tiers

### 2.1 The tier ladder (shared by all surfaces)

`buildingTier(value, floor)` = `1 + floor(log2(value/floor))`, clamped 1..14
(`projection.ts`). Tier ≈ value multiplier 2^(t−1) (t14 = ×8192+).

- **Civic league = tiers 1–7**: family stack + shared tier tells.
- **Grand league = tiers 8–14**: the family megaform; `step = tier − 8` adds
  one elaboration per tier (halo rings, turrets, masts, crowns).
- Shared civic tells: antenna t3+, pods t4+, halo ring t5+, crown cap t6+,
  mega cap + white orb t7; platform slab base; pulsing rooftop beacon;
  seeded lit windows (warm `#ffb547` / cool `#cfe0ff` mix, stable per card).

### 2.2 Per-family design sheet

Colors: **mass/neon** from `district.ts` (card + 3D), **fill/stroke** from
`map2d/palette.ts` (2D footprint). Display names via `professionName()`.

| # | Family (DB key) | Display | 2D footprint | Civic form (t1–7) | Grand megaform (t8–14) |
|---|---|---|---|---|---|
| 0 | Cryptographer | Notary 公证人 | blue `#7FA8C9` | **Vault plates** — 2–4 stacked wide boxes + double dome + neon pin (mass warm stone `#6b5f49`, neon violet `#b491ff`) | **VAULT CITADEL** — podium plates, glass drum, shield dome (grows +2/tier); turrets s2+, neon dome ring s4+, halo s5+, finial s6+ |
| 1 | Zero-Day | Auctioneer 拍卖师 | green `#89B49B` | **Hollow gateway** — twin pillars + top beam + neon diamond (mass concrete `#6e737b`, neon red `#ff4a5e`) | **MEGA GATE** — twin glass pillars, beam shelves, central neon shard, crown bridge; pillar antennas s4+, vertical portal ellipse s6+ |
| 2 | Overclocker | Renovator 改造师 | tan `#C9A97F` | **Reactor** — cylinder body + up to 4 coil rings + neon dot (mass brick `#6e4538`, neon lime `#b7ff4a`) | **GRAND REACTOR** — glass core, coil ladder, glow band; side towers s1+, plasma crown + ring, halo s2+, spire s6+ |
| 3 | Cache Keeper | Vault Keeper 守库人 | purple `#A893C9` | **Offset chip stacks** — alternating-offset boxes, alternating shade + neon antenna (mass adobe `#6f6046`, neon emerald `#3ddc97`) | **GRAND DATA ZIGGURAT** — offset glass slabs with neon edges, twin data-dot columns, floating cache crowns; halo + orb s6+ |
| 4 | Server Marshal | City Planner 城市规划师 | red `#C98F8F` | **Rack slab** — narrow uniform slab + up to 5 LED rows (mass steel `#5d6d7f`, neon sky `#6fc6ff`) | **RACK SPIRE** — podium, dense-LED shaft, setback crown, mast array (3, 5 at s4+); halos s3+/s5+, top halo + orb s6+ |
| 5 | Bot Herder | Prospector 勘探者 | teal `#8FC0C9` | **Hangar + bays** — central hall + two 70%-height side bays + neon ring (mass metal `#61666e`, neon amber `#ffb547`) | **DRONE NEXUS** — tri-lobed glass hangar, door light rows, glow band, landing rings; side antennas s3+, halo + orb s6+ |
| 6 | — (no trade) | No trade 无行业 | gray `#B9B3A8` | **Stepped cube** — up to 4 shrinking boxes (mass `#625e50`, neon `#9ca3af`) | **Stepped mega-mast** — 4 chroma decks + spire + neon diamond; halos s1+/s3+, halo + orb s6+ |

### 2.3 How each surface renders the ladder

**2D map** (`drawBuilding`): footprint square = `tierScale(t)·cell`,
`tierScale` 0.42→1.0 across t1→t14 (sub-linear: most growth happens by t8);
family fill @ 0.85 alpha + stroke; **grand inner register** (nested stroke
rect) at t≥8; avatar photo circle (72% of footprint) when ≥24 px; lock badge
top-left. **No family shape difference at all — only hue.**

**Card art** (`buildingArt`): full silhouette detail as in the table above;
windows/halos/beacons per spec; rooftop beacon pulses (CSS) on cards,
static on canvas. Height grows every tier (civic +floorH, grand
+grandFloorH), so the ladder is always visible.

**3D** (`compileArtToVolumes`): pvBox triplets → real boxes (color
un-shaded from the 0.62 left face); filled ellipses/circles → spheres
(squashed); stroked ellipses/circles → tori (halo rings!); rects → thin
boxes; window dots (<0.09 cells) → facade quads **mirrored to all four
faces** of the tallest mass; lines → thin boxes; **paths are skipped**
(below map legibility); **`opacity` is ignored** (see F5). Scale
`k = tierScale(t)·1.45/128`, one InstancedMesh per (family, tier) class,
geometry compiled at **seed 0** (class-wide windows — per-card seeds are
invisible at map scale), ±4% per-instance lightness jitter.

---

## 3. Inventory B — the HQ core

Every city's center, one per player, 3×3 cells.

| Aspect | 2D map | 3D view | Card art |
|---|---|---|---|
| Base | navy plate `#2E4A66` + border + diagonals | 3×0.3×3 navy plate | — (HQ is not a card) |
| Body | — (flat) | **the owner's trade grand megaform**, tier 10/12/14 by stage (`HQ_K = 2.4/128`), seeded by username | — |
| Crown | gold ring around the **owner's avatar** (52%) | gold mast + gold beacon sphere; gold trim box at stage 2+ | — |
| Stages | 2: gold outer register · 3: + corner circle | same body ladder 10→12→14 + trim at 2+ | — |

Note: the avatar-in-gold-ring exists ONLY in 2D (F6).

## 4. Inventory C — the six Founder landmarks

Hex slots on ring 2, canonical `GODDESS_USERNAMES` order. Accent colors from
`landmark-colors.ts`.

| Idx | DB username | Display | Monument (card + 3D) | Accent |
|---|---|---|---|---|
| 0 | Goddess | The Architect 总建筑师 | Root spire + 2 orbit rings + white tip | sky `#7dd3fc` |
| 1 | Goddess of Fate | The Registrar 登记官 | Twin citadel towers + **floating key** | amber `#f59e0b` |
| 2 | Goddess of Knowledge | The Surveyor 测绘师 | Observatory dome + sensor eye + relay mast arcs | violet `#a78bfa` |
| 3 | Goddess of Time | The Foreman 监工 | Clock tower (white hands) + 2 chrono rings | teal `#5eead4` |
| 4 | Goddess of War | The Wrecker 拆迁王 | Fractured obelisk + 3 orbit shards | crimson `#ef4444` |
| 5 | Goddess of Wealth | The Banker 银行家 | Stepped treasury pyramid + colonnade + coin dots | gold `#fbbf24` |

- **Card**: `monumentArt(i)` — the stage-2 elaborated echo, drawn on a dark
  two-tile pad. (Its code comments still use pre-rebrand names —
  Locksmith/Oracle/Clockkeeper/NullPointer — see F8.)
- **3D**: same monument art compiled to volumes (`MONUMENT_K = 1.6/150`) —
  all six fully distinct, with shadow.
- **2D**: `drawLandmark` — **all six are the SAME gold hexagon** + center
  dot (`#F5C518` @ 0.92, brown stroke). Distinction only via the selection
  panel, never on the map itself (F2).

## 5. Inventory D — album props (completed-blueprint rewards)

One fixed ring-3 cell each (`layout.PROP_CELLS`, displaces a building — user
ruling 2026-10-02). Cosmetic only. Names from `blueprints.ts ALBUMS`.

| Prop | Display | 2D (`drawProp`) | 3D (`makeProp`) |
|---|---|---|---|
| park | Central Park 中央公园 | lawn plate + diagonal footpath + 3 tree dots | green pad + 3 cone trees |
| marquee | Neon Marquee 霓虹门楼 | 2 posts + **striped canopy + 4 bulbs** | **a single gold box** |
| crane | Crane Row 吊车阵 | full tower crane: base pad, mast, peak ties, jib + counter-jib, cable + **hook**, counterweight | **2 boxes** (mast + jib) |
| rotunda | City Rotunda 市政圆厅 | colonnade base (3 columns) + dome arc + gold finial | cylinder + gold half-dome |
| goldvault | Golden Vault Emblem 黄金金库徽记 | gold square plate + dial ring + 4 spokes + hub (deliberately NOT a hexagon) | gold plate + torus dial (no spokes) |

Props have **no card art** (they never appear on cards). The 3D versions are
deliberately simpler, but marquee/crane lose their identity entirely (F3).

## 6. Inventory E — protection & map marks (not buildings, but they live on them)

| Mark | 2D | 3D |
|---|---|---|
| Deed Lock / Iron Deed badge | dark square + gold keyhole, top-left of footprint | **nothing** (F1) |
| Raid damage (24h) | red cracks + `×N` badge circle | `×N` sprite badge |
| Open bounty target | red crosshair reticle | red torus ring |
| You (own plot) | dashed orange plot ring | dashed orange diamond |
| Roads | dashed ink lines | dashed 3D lines |
| City label | canvas text `name · count` | sprite label |

---

## 7. Coverage matrix

| Design feature | Card art | 2D map | 3D view |
|---|---|---|---|
| Family silhouettes | ✅ full | ❌ hue only | ✅ compiled volumes |
| 14-tier ladder | ✅ height + features every tier | ⚠️ footprint size (sub-linear) + inner register t8+ | ✅ full ladder |
| Lit windows | ✅ seeded per card, 2 faces | ❌ | ✅ class-wide (seed 0), mirrored 4 faces |
| Halo/neon rings | ✅ stroked ellipses | ❌ | ✅ tori (opacity lost) |
| Rooftop beacon | ✅ pulses (CSS) | ❌ | ✅ static sphere |
| Avatars on buildings | n/a | ✅ center circle ≥24 px | ❌ (2D-only by ruling) |
| Protection badge | ❌ | ✅ | ❌ |
| HQ | ❌ | ✅ plate + avatar ring | ✅ megaform + mast |
| Founder landmarks distinct | ✅ 6 monuments | ❌ one shared gold hex | ✅ 6 monuments |
| Album props | ❌ | ✅ detailed | ⚠️ simplified |
| Paths (key, arcs, hands) | ✅ | n/a | ❌ skipped by compiler |

---

## 8. Findings — candidates for the design-improvement review

Ordered by gameplay/visual impact, not by effort:

- **F1 — Protection is invisible in 3D.** Deed Lock / Iron Deed render only
  as the 2D keyhole badge. A 3D player can't see which towers are locked.
  Candidate: a shield/plate accent on locked volumes (e.g. gold ring at the
  base, or dim + outline in the compiler output).
- **F2 — The six Founders are indistinguishable on the 2D map.** All
  landmarks share one gold hexagon while card art and 3D have six fully
  designed monuments. Candidate: per-Founder glyph inside the hex (mini
  spire/key/eye/clock/shard/pyramid), keeping the blueprint line language.
- **F3 — 3D props lost their identity.** Marquee = one gold box, crane = two
  boxes, versus rich 2D drawings. Rotunda/park/goldvault read fine.
  Candidate: promote the 3D props to the same detail level as `drawProp`
  (striped canopy + bulbs; jib ties + counterweight + hook).
- **F4 — The 2D tier ladder is nearly invisible.** Footprint grows
  sub-linearly (t1 = 42% of the cell already) and t≥8 adds only a nested
  stroke. Family = hue only. This is the Blueprint-style intent, but grand
  towers barely announce themselves (size + register only).
- **F5 — The 3D compiler drops `opacity` and `path`.** Halo rings (0.55–0.85
  alpha) and glow bands render at full strength; monument keys/arcs/clock
  hands vanish. Candidate: bake opacity into color (premultiplied darker) or
  add thin-volume paths.
- **F6 — HQ owner avatar exists only in 2D.** The 2026-10-02 ruling made
  building avatars 2D-only; the HQ gold-ring avatar is arguably the same
  class. Decide: keep (3D stays clean) or add a billboard sprite.
- **F7 — (informational) 3D windows are class-wide (seed 0)** — per-card
  window patterns only exist on cards. Deliberate, invisible at map scale.
- **F8 — Docs drift:** `monumentArt` comments still use pre-rebrand Founder
  names (Locksmith/Oracle/Clockkeeper/NullPointer). Harmless; rename
  comments when touching the file.
- **F9 — (informational) Civic t1–2 cards are near-windowless** (window rows
  derive from art height); they read as plain blocks — fine for "empty lot"
  flavor, worth knowing when judging t1 art.
- **F10 — Adjacent-tier 3D deltas are barely perceptible.** The compile is
  faithful, but a one-tier step often adds only a thin halo/antenna or a few
  percent of height — at catalog-plate or zoomed-out world scale, tiers
  1–3 (and grand 8–10, and HQ stages 10/12/14) look near-identical in 3D
  while the card art clearly progresses. (Catalog QA 2026-10-02.)
- **F11 — Deed Lock and Iron Deed render IDENTICALLY on the 2D map.**
  `drawBuilding` draws the same dark badge + gold keyhole for both
  `firewall` and `hardlock` — a timed lock is indistinguishable from a
  permanent one until you open the inspector. (Exposed by the catalog's
  side-by-side protection plates.)

## 9. The /catalog rebuild shipped with this study

`/catalog` now renders EVERY subject from §2–§6 in all available surfaces,
side by side, from the exact same primitives the live views use (if the
catalog and the map disagree, one of them is buggy by definition):

- **Trade families** — 7 families × ALL 14 tiers; each tier row shows
  2D blueprint plate · card art (live SVG) · 3D render, with league
  sub-headers (civic 1–7 / grand 8–14).
- **Protection states** — Deed Lock / Iron Deed 2D badges next to the same
  building's 3D render (which today shows none — the F1 gap, visible).
- **HQ core** — stages 1–3, 2D + 3D.
- **Founder landmarks** — all six, card monument + 2D hex + 3D monument.
- **Album props** — all five, 2D + 3D.

Implementation: `src/lib/city/map3d/plate.ts` (one shared offscreen WebGL
renderer, sequential shots, same lights/sun/ground language as the engine);
engine.ts now exports the reusable builders (`artClassGeometry`,
`volumesToGeometry`, `buildHqObject`, `buildMonumentObject`,
`buildPropObject`) so the catalog can NEVER drift from the world map.
