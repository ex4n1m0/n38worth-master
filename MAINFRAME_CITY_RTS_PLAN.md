# Mainframe City RTS — verified Phase A plan

Status: PHASE A COMPLETE, 2026-09-26. Implementation pending two user
approval gates (§"Approval gates"). Source product plan:
`C:\Users\igorc\Downloads\n38worth-rts-zcode-prompt.md` (user-provided).
This document SUPERSEDES `MAINFRAME_CITY_PLAN.md` (slice plan — slices 1–4
shipped; slices 5–10 are folded into the phases below).

Reviewed by (2026-09-26): Explore (repo map), n38worth-game-systems
(invariants — approve with revisions, all revisions incorporated below),
n38worth-city-ui (rendering ADR), n38worth-backend-economy (persistence
proposal), security-reviewer (threat model — 3 contract blockers + 1
pre-existing critical, incorporated), n38worth-qa-performance (acceptance
matrix + budgets).

## Current state (what exists, all UNCOMMITTED)

- Slices 1–4 shipped: pure projection (`src/lib/city/projection.ts`,
  `types.ts`; stage 0–5 = log2(value/floor) clamped, DETAILED_LIMIT=200),
  public CDN-cached `GET /api/city/[username]`, feature flag
  (`game_settings.city_enabled`, currently OFF, `npm run city:flag -- on|off`),
  CSS-grid `/city` page (`CityGrid`/`BuildingTile`, keyboard-navigable),
  en+zh i18n batch, vitest suite (67 tests, node-env, pure-logic only).
- Overclock (`pumpPlayer.ts`) VERIFIED to double value (VALUE_MULTIPLIER=2,
  capped by MAX_PLAYER_VALUE=1e12). Mission ladder = the sector authority:
  thresholds 20/50/100/250/500/1000/2000/5000(+1000×wins dynamic final).
- No renderer library installed (only native Canvas 2D in MatrixRain).
  No PATCH routes exist in the repo (all mutations are POST/actions).
  No rate-limiting infra. neon-http = NO transactions anywhere.

## Decisions

### D1 — Renderer: PixiJS v8 (ADR by n38worth-city-ui)
`pixi.js@^8` single package, WebGL backend forced (`preference: "webgl"`),
NO `@pixi/react` (imperative scene controller class, not a React reconciler),
mounted via `next/dynamic(..., { ssr: false })` inside the existing client
`/city` page. React keeps HUD/inspector/queue/dialogs; canvas is
`aria-hidden` with a DOM a11y mirror list (roving focus, generalized from
`CityGrid`'s `useTileGridKeyboard`). DPR capped at 2. Render-on-demand
ticker (zero RAF when idle). `prefers-reduced-motion` → camera snaps, FX
collapse to one-frame state swaps.

Rejected: DOM/CSS/SVG iso (zoom blurs rasterized DOM, ~1,600 composited
layers at 8 layers × 200 buildings breaks iOS layer budget); hand-rolled
Canvas 2D engine (duplicates Pixi, no WebGL headroom for glow FX, violates
the no-game-engine spirit worse than a library); `@pixi/react` (React in the
render loop, fights the DOM-HUD/canvas-world boundary).

Fallback ladder (runtime degradation, not redeploy): WebGL fail/lost ×2 →
SceneErrorBoundary swaps canvas host for the kept CSS-grid "district
overview" (same CityProjection) → chunk-load failure → same DOM view →
kill switch = `city_enabled` off.

Key sizing fact: `/api/city/[username]` bounds detailed buildings at 200 —
the renderer's worst case is 200 detailed sprites + aggregate blocks + 6
landmarks + HQ, NOT 5,000. The 5,000 claim is a Phase D contract question
(raise DETAILED_LIMIT) gated on QA fixtures, per this plan.

Risk carried: chunk size unmeasured until install (target ≤ ~140 KB gzip
for the async scene chunk; measure + QA gate at Phase B).

### D2 — Tier spec (game-systems ruling: APPROVE with corrections)
```
ratio = max(1, playerValue / max(1, valueFloor))
tier  = clamp(1, 7, 1 + floor(log2(ratio)))   // 1×=1 … 2×=2 … 64×+=7
```
This is the existing `buildingStage` re-indexed 0–5 → 1–7 PLUS one new top
bucket (64×+, previously folded into "32×+"). Single implementation stays in
`src/lib/city/projection.ts`; `BuildingTier = 1|…|7` in types; BuildingTile
floors = tier directly; projection tests updated. Not persisted anywhere.
Overclock = exactly +1 tier in the normal range, with two documented
exceptions (UX must not promise a tier at extremes): ratio ≥ 64 (pinned at
7) and value > 5e11 (MAX_PLAYER_VALUE clamp can absorb a full-cost overclock
with no tier change — bites high-floor cards like goddesses).

### D3 — Sectors
`sectorsUnlocked = 1 + clamp(0, MISSIONS.length, missionLevel)` (unchanged,
sticky/monotonic). Sector identities per mission level: Boot (always open) /
20 / 50 Botnet / 100 Banker / 250 Oracle / 500 Locksmith / 1000 Clockkeeper
/ 2000 NullPointer / final Architect. The FINAL threshold is DYNAMIC
(`finalGoddessThreshold = 5000 + 1000 × winCount`) — any "next sector at N"
label must be computed server-side. Sector-progress display uses the
missions' total-ownership basis (`getOwnedCount` counts ALL rows), NOT the
city API's visible-only `ownedCount` (which under-reports).

### D4 — HQ (own card as Core)
Allowed with constraints: never counts toward ownedCount/portfolio/family
aggregates (own player_value stays excluded from portfolio canon); no
self-ownership semantics (not hireable/sellable/poachable — self-hire
already rejected); no boss-relationship protection data (own firewall-on-
self lives on the boss's ownership row — never in city payloads); fixed at
sector 0 center in Phase B (no layout row; a placeable HQ would need a
deliberate special case in the ownership-exists write guard — defer).

### D5 — Data contract (backend proposal + security revisions)
Three routes, strict viewer-separation (security TH-06 hard rule):

1. `GET /api/city/[username]` — PUBLIC, auth-free, CDN s-maxage=60 (stays
   viewer-independent FOREVER). Adds: `placement` field per detailed
   building (LEFT JOIN city_layout through the SAME ownership+visibleSql
   join — layout is NEVER read standalone on public paths), `layoutVersion`
   (from city_layout_meta), per-family placed/queued AGGREGATE counts
   (visible-basis only). NO placement queue array here (TH-01: queue
   includes hidden owned cards).
2. `GET /api/city/my-layout` — NEW, owner-only (`auth()`), `Cache-Control:
   private, no-store`. Returns the placement queue (all owned cards incl.
   hidden ones), own layout rows, layoutVersion. The own-city page uses
   this for the queue; public viewers never see it.
3. `POST /api/city/layout` — NEW, owner-only mutation (house style: repo
   has zero PATCH routes). Request: `{ baseVersion, placements[1..32]`
   `({cardId, sector, x, y, rotation?, variant?}), removedCardIds? }`.
   Validation order: static shape/enum/bounds checks (sector whitelist
   `s0..s8` from MISSIONS.length, x/y ∈ [0,31], rotation/variant ∈ {0..3})
   → lazy orphan cleanup (DELETE rows with no matching ownership) →
   ownership pre-check → sector unlock check (missionLevel) → collision
   pre-check → CAS version bump (UPDATE city_layout_meta … WHERE
   layout_version = baseVersion RETURNING; rowcount 0 → 409) → guarded
   multi-row upsert with `WHERE EXISTS(ownership)` inside the INSERT (the
   mid-flight-poach guard) → best-effort Pusher `city-layout-updated` on
   `player-{id}`. Errors English (v1 canon): 401 Unauthorized, 400 shape,
   403 Sector not unlocked, 409 Avatar no longer owned / Tile already
   occupied / Layout version mismatch (+currentLayoutVersion), 429
   Too many layout updates (500 ms per-owner min interval via the meta
   row's updated_at). 23505 unique-violation → 409.

Client rule: ONE batched POST per interaction end (drop-end / exit build
mode), never per pointer-move; never optimistic — buildings appear only
after the server projection confirms.

### D6 — `city_layout` schema (additive, reversible; GATED on user approval)
```sql
CREATE TABLE IF NOT EXISTS city_layout (
  id SERIAL PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owned_player_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sector_key VARCHAR(8) NOT NULL,   -- "s0".."s8", whitelist in code
  tile_x INTEGER NOT NULL,          -- 0..GRID_SIZE-1 (GRID_SIZE = 32)
  tile_y INTEGER NOT NULL,
  rotation INTEGER NOT NULL DEFAULT 0,   -- 0..3 (code-validated)
  variant  INTEGER NOT NULL DEFAULT 0,   -- 0..3 (code-validated)
  layout_version INTEGER NOT NULL,       -- audit stamp of writing epoch
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_city_layout_owner_avatar
  ON city_layout (owner_user_id, owned_player_id);
CREATE UNIQUE INDEX idx_city_layout_owner_tile
  ON city_layout (owner_user_id, sector_key, tile_x, tile_y);
CREATE INDEX idx_city_layout_owned_player ON city_layout (owned_player_id);

CREATE TABLE IF NOT EXISTS city_layout_meta (
  owner_user_id INTEGER NOT NULL PRIMARY KEY
    REFERENCES users(id) ON DELETE CASCADE,
  layout_version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```
Migration: `drizzle/0024_add_city_layout.sql` +
`scripts/apply-0024-add-city-layout.ts` (idempotent, hand-written,
unjournaled — house pattern). `ON DELETE CASCADE` chosen deliberately
(RESTRICT would break the 6+ existing manual user-deletion flows that
don't know about this table; CASCADE precedent: ipSessions). No CHECK
constraints (house style — code-validated enums; unique indexes are the
race guard under no-transactions). Rollback: flag off → redeploy →
`DROP TABLE IF EXISTS city_layout, city_layout_meta` (cosmetic data only).

### D7 — Layout row lifecycle (game-systems table, backend default adopted)
Hire → no row (building enters queue by derivation: ownership + no layout
row). Poach/sell/discard/combo/decay/reset → row ORPHANED (invisible via
the ownership join; lazily deleted by the owner's next POST step-1
cleanup). Re-hire/restore of the same card → row RESURRECTS the old tile
("restore reconstructs" — matches plan). User deletion (war/admin/purge/
demo/account) → CASCADE. World reset → all rows orphan, cities render
empty, sectors reset to 1 (correct). Goddesses: fixed landmark positions in
Phase B/E (not layout rows); Mass Hire card = placeable ordinary card.
Projection-level safety net: two placed buildings sharing a tile
(orphan-resurrection corner case) → deterministic winner (value desc,
cardId asc), loser demoted to queue; self-heals on next save.

### D8 — Security controls (must-ship-with-Phase-B checklist)
- Owner identity ONLY from `auth()` session — `owner_user_id` never in the
  request body (TH-02). Ownership re-validated in the same request AND
  inside the INSERT's WHERE EXISTS (no-transaction race guard, TH-03).
- Public GET never reads layout outside the ownership+visibleSql join;
  queue only on the authed no-store route (TH-01). Cached route returns
  byte-identical responses for all viewers; no Set-Cookie ever (TH-06).
- Zod at the boundary: int bounds, sector allowlist, enum rotation/variant,
  batch ≤ 32, disjoint id sets (TH-04). Adversarial payload tests required.
- Per-owner write cooldown ≥ 500 ms + batched client semantics (TH-05).
- No `dangerouslySetInnerHTML`/`innerHTML` anywhere in
  `src/components/city/**` (TH-07, zero today — keep it); usernames/bios
  render as text only; avatars only via `/api/avatar/[username]`; no
  per-card timestamps in public payloads (TH-09).
- Renderer receives server-computed stage/protection/sectors only (TH-12).
- **TH-00 (pre-existing, CRITICAL, outside city scope):**
  `POST /api/admin/reset` has NO auth/CRON_SECRET/isAdminUser gate and
  wipes the whole game (messages/transactions/ownership/users). Middleware
  skips `/api/*` so nothing else guards it. ESCALATED to the user
  2026-09-26 — fix = `isAdminUser(session.user.name)` gate or route
  deletion; independent of this plan but MUST land before any rollout.

### D9 — QA approach, purity modules, budgets (n38worth-qa-performance)
Zero new test dependencies. Coverage = [A] vitest pure-logic + [B] the
established manual browser recipe (local dev + guest demo account +
screenshots + rAF-sampling via evaluate). New pure modules (all under
`src/lib/city/`, node-safe, `now`/`seed` injected):
`scene/iso.ts` (tile↔screen + picking), `scene/camera.ts` (zoom clamp,
pan bounds, reset target), `scene/lod.ts` (close/district/world bands),
`placement.ts` (validatePlacement preview-only predicate,
derivePlacementQueue, applyLayoutPatch version-checked reducer),
`layout.ts` (reconcileLayout → scene diff: enter/upgrade/reposition/exit),
`motion.ts` (reduced-motion policy), `fixtures.ts` (seeded mulberry32
generators for 20/100/500/1000/5000 — no DB contact; browser runs use a
double-env-gated dev-only fixture branch in the city route:
`NODE_ENV=development && CITY_FIXTURES=1 && username=fixture-N`).

Budgets (measured, recorded, gates not vibes): payload ≤ 32 KB @20 /
≤ 96 KB @1k / ≤ 160 KB @5k (ceiling 256 KB); initial usable ≤ 1.5 s @100
desktop (≤ 3 s @5k mobile viewport); projection+reconcile compute
< 25 ms @5k (vitest bench); camera 60 fps desktop p95 ≤ 20 ms / 30 fps
mobile; selection ≤ 100 ms highlight / ≤ 300 ms inspector; heap ≤ 350 MB
@5k; ≤ 8 atlases ≤ 2048²; a11y DOM bridge ≤ 1,500 nodes at any LOD.
Known unmeasurable with current tooling (record as limitations): real
low-power hardware, CPU throttling fidelity, exact GPU texture memory.

Full Phase B acceptance matrix + exit criteria live with the QA agent's
2026-09-26 report; the essential exit gates: all lints/tests/builds green,
keyboard-only full pass (place/select/inspect/relocate), en+zh screenshot
set through image-analyst (desktop/mobile/close/district/build-mode/
selection/firewall/hard-lock/loss/empty/error/reduced-motion), measured
budgets recorded, zero-write auth rejection tests, flag left OFF,
game-systems + security sign-offs.

## Resolved conflicts (primary-agent rulings)
1. Placement queue in public GET (backend) vs hidden-card leak (security)
   → queue moves to owner-authed `GET /api/city/my-layout`; public GET gets
   only visible-card placements + visible-basis aggregate counts.
2. Batch cap 64 (backend) vs ≤25 (security) → 32.
3. DB CHECK constraints (security) vs house-no-checks (backend) → no CHECKs;
   code validation + the two unique indexes (the actual race guard).
4. Tier ladder 0–5 (implemented) vs 1–7 (plan) → 1–7 per game-systems
   ruling (D2); re-index lands as Phase B task 0 with tests pinned to
   exactly one file.

## Phase B task sequence (Boot Sector vertical slice)
0. Tier re-index 0–5 → 1–7 (projection + types + BuildingTile + tests).
   No new deps; unblocks all tier work.
1. Pure scene/placement modules + vitest coverage (D9 list) — builds and
   tests WITHOUT Pixi installed.
2. **[GATED]** `npm install pixi.js@^8` → SceneHost + CityScene controller
   (camera rig, iso world, BuildingSprite 8-layer with PLACEHOLDER_ART
   procedural Graphics, HQ sprite, aggregate blocks, FX layer) + a11y
   mirror + SceneErrorBoundary.
3. **[GATED]** Apply migration 0024 + drizzle schema + POST /api/city/layout
   + GET /api/city/my-layout + public GET fold-in (placement join +
   layoutVersion + aggregate counts). Code can land before the migration
   runs (routes fail closed), but the DB write gate needs user approval.
4. React shell: CityWorld/HUD/BuildingInspector/PlacementQueue/
   BuildingMirrorList + i18n `city-world.json` (en+zh) + globals.css world
   styles + reduced-motion block.
5. Data wiring: scene.sync from `["city", username]`; placement mutations
   (batched, never optimistic); fix the overclock→city gap (Explore
   finding: overclock fires no `["city"]` invalidation for the owner —
   invalidate at the overclock action's success site); Pusher
   `city-layout-updated` → other devices refetch.
6. QA evidence + budgets measurement + image-analyst screenshot set +
   game-systems/security sign-off. Flag stays OFF; rollout is a separate
   user decision (flip + deploy together per AGENTS.md).

Phase C–F (full profession city, scale+sectors+LOD, goddesses+Root
Sequence, public cities+rollout) follow the source plan's phases; each
gets its own review cycle. Root Sequence rule (game-systems): render ONLY
from `/api/goddess-countdown` state + `game-global` Pusher events, mirror
`expiresAt` via `useNow()`; grace-resume restores the ORIGINAL startedAt;
`rootSequenceEligible` alone must never start a sequence.

## Approval gates (BLOCKING, need the user)
1. **Install `pixi.js@^8`** — major new dependency (async-loaded, scene
   chunk only; size measured + QA-gated after install).
2. **Apply migration 0024** (`city_layout` + `city_layout_meta`) to the
   shared dev/prod Neon DB — additive + reversible, but it is a production
   schema change (and AGENTS.md notes the shared-DB ALTER-before-code
   hazard; the apply script is idempotent and runs BEFORE deploy, which is
   safe because nothing references the tables until the city POST ships
   behind the OFF flag).
3. **TH-00 hotfix decision** — gate or delete `/api/admin/reset`
   (pre-existing unauthenticated world-wipe; recommended: isAdminUser
   gate + CRON_SECRET-style env fallback).

## Rollback
Flag off (instant, global) → redeloy previous build → drop the two new
tables (cosmetic data only). No economy table is ever touched by this
feature. Slice-4 CSS-grid view is RETAINED as the fallback "district
overview", not deleted.
