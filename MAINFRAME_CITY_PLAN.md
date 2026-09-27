# Mainframe City — implementation plan (Stage 8)

Status: SUPERSEDED 2026-09-26 by `MAINFRAME_CITY_RTS_PLAN.md` (user pivoted
to the 2.5D isometric RTS direction). Slices 1–4 below SHIPPED and are
reused by the new plan; slices 5–10 are folded into its Phase C–F. Kept for
history. Source package:
`n38worth-zcode/` (bootstrap prompt stage 8); workspace rules: `AGENTS.md`
§"Mainframe City building layer". Subagent owners/reviewers refer to the
team configured on 2026-09-26 (`n38worth-game-systems`, `n38worth-city-ui`,
`n38worth-backend-economy`, `n38worth-qa-performance`, plus the shared
`security-reviewer` and `image-analyst`).

## Grounded architecture decisions (v1)

Verified against the repo on 2026-09-26:

- **No schema changes in the MVP.** The city is fully derivable from
  existing state: `ownership` + `users.player_value`/`value_floor`/
  `profession`/`mission_level` + `ownership.block_sell_until`/
  `perm_block_until` + goddess roster. No new tables, no new columns.
- **Pure derivation module first**: `src/lib/city/projection.ts` — a pure
  function (ownership rows + owner stats → city model). The API route and
  any tooling consume it; UI NEVER recomputes economy math (AGENTS.md rule).
- **Route**: `src/app/api/city/[username]/route.ts`, auth-free GET, modeled
  on `src/app/api/players/[username]/route.ts` (pre-aggregated LEFT JOIN
  subqueries — no per-row N+1; `visibleSql` filter; removed-agent guard)
  but WITHOUT `auth()` so it can set `Cache-Control: public, s-maxage=60,
  stale-while-revalidate=300` like the other public GET routes. Hidden
  humans (no avatar / incomplete) and `onboardingCreatedBy`-hidden rows
  404 unconditionally — no viewer-specific branches, that's what keeps the
  CDN cache safe.
- **Pages**: `(game)/city/page.tsx` (own city) and `(game)/city/
  [username]/page.tsx` (public viewing). Navbar entry added to
  `mainNavLinks` (src/components/Navbar.tsx:45) behind the feature flag.
- **Client data**: react-query key `["city", username]`, refetchInterval
  ≥ 120s; live updates via existing Pusher (`player-{id}` ownership-changed,
  `game-global` countdown events) invalidating the key — same pattern as
  `useMarketEvents.ts`.
- **Feature flag**: `game_settings` row `city_enabled` (`settingKey`/
  `settingValue`, pattern per `src/lib/goddess-powers.ts`). Default OFF;
  navbar link and /city pages render a 404-ish "sector locked" state until
  enabled. Rollout = flip one row, rollback = flip it back.
- **i18n**: every city string added to BOTH `en` and `zh` in
  `src/lib/i18n.ts` (+ `src/lib/i18n-keys/{en,zh}/*.json` sweeps);
  profession/goddess names render via `professionName` /
  `cardDisplayName(username, locale)`.
- **Tests**: repo has NO framework today. Slice 1 proposes **vitest**
  (pure-logic tests only — formulas, projection, thresholds). DB-touching
  tests are OUT OF SCOPE until a dedicated branch database exists: dev and
  prod share ONE Neon DB and must never be tested against.
- **No transactions exist** (neon-http): the city adds no writes at all in
  v1, so it adds no new race surface. Any future write (e.g. saved layouts)
  needs game-systems + security review first.

## Building model spec (v1, derived)

- One building per OWNED card (per ownership row), grouped by the owned
  card's `profession` into six building families.
- **Stage** 0–5 from `player_value / max(value_floor, 1)` ratio via fixed
  thresholds defined ONCE in `src/lib/city/projection.ts` (exact numbers =
  open decision below; game-systems reviews before merge).
- **Protection visuals**: active `block_sell_until` (firewall) and
  `perm_block_until` (hard lock) from the owner's own ownership rows
  (own-row semantics, matching the `ownBlockSellUntil` convention).
- **Sectors** unlock by `mission_level` thresholds reused from
  `src/lib/missions-data.ts` (no new milestone definitions).
- **Goddesses** (the six `GODDESS_USERNAMES`) render as landmarks, not
  ordinary buildings. **Root Sequence** visual state mirrors
  `src/lib/goddess-countdown.ts` / `/api/goddess-countdown` — read-only.
- **Density cap**: detailed rendering for at most the first N buildings
  (N=200 proposed) by value; the rest aggregate into per-family density
  blocks. Heavy avatar media lazy-loads on building interaction only.

## Slices

Each slice lands as one reviewable unit. Commits/deploys happen only when
the user explicitly asks (AGENTS.md workflow rule).

### 1. Baseline telemetry and economy-invariant tests
Owner: **n38worth-qa-performance** · Reviewers: n38worth-game-systems.
- Propose vitest + config + `npm test` script (approval gate BEFORE adding
  dependencies). Tests: `src/lib/safeguards.ts` (caps, `safePortfolioValue`
  excludes player_value), `src/lib/missions-data.ts` thresholds/rewards,
  pure parts of `goddess-countdown.ts` state machine, display-name helpers.
- Files: `vitest.config.ts`, `src/lib/__tests__/*`, package.json scripts.
- Schema/API: none. Rollback: delete files, revert package.json.
- Acceptance: `npm test`, `npm run lint`, `npx tsc --noEmit`,
  `npm run build` all green; no DB access from any test.

### 2. Read-only city projection model
Owner: **n38worth-backend-economy** · Reviewers: n38worth-game-systems,
n38worth-qa-performance (unit tests).
- Files: `src/lib/city/projection.ts`, `src/lib/city/types.ts`,
  `src/lib/__tests__/city/projection.test.ts`.
- Schema/API: none (pure module). Rollback: delete `src/lib/city/`.
- Acceptance: deterministic output for fixed input; stage/profession/
  sector/landmark rules per spec; imports (never duplicates) economy
  constants; 100% unit-covered branch points.

### 3. `/api/city/[username]` endpoint
Owner: **n38worth-backend-economy** · Reviewers: security-reviewer,
n38worth-game-systems.
- Files: `src/app/api/city/[username]/route.ts`.
- Schema: none. API: new public GET; response = projection output +
  pagination info for large portfolios (aggregate beyond limit).
- Rollback: delete route.
- Acceptance: CDN cache headers present; NO `auth()` call (grep-verified);
  404 for hidden/removed/unknown; hidden-avatar owned cards filtered via
  `visibleSql`; sub-minute response for the largest real portfolio;
  security-reviewer sign-off (no data leakage past visibility rules).

### 4. Boot Sector vertical slice (own city, auto-placement)
Owner: **n38worth-city-ui** · Reviewers: n38worth-game-systems,
image-analyst, n38worth-qa-performance.
- Files: `(game)/city/page.tsx`, `src/components/city/CityGrid.tsx` +
  `BuildingTile.tsx` (CSS grid auto-placement, no drag), navbar entry,
  gameSettings flag check hook, i18n keys (en+zh).
- Schema: one `game_settings` upsert script (flag default off).
- Rollback: flip flag off; delete page/components.
- Acceptance: own city renders from `["city", me]`; construct animation on
  hire via Pusher invalidation; keyboard navigable tiles; lint/tsc/build;
  image-analyst screenshot pass (desktop + mobile).

### 5. Hire / loss / restore / overclock / firewall visual states
Owner: **n38worth-city-ui** · Reviewers: image-analyst,
n38worth-qa-performance.
- Files: city components + `src/hooks/useCityEvents.ts` (wraps
  `player-{id}` + `market-changed` → invalidate `["city", username]`).
- Acceptance: each state visually distinct (incl. hard-lock ≠ firewall);
  `prefers-reduced-motion` static fallbacks; no formula recomputed client-
  side (server sends stage/state).

### 6. Six profession buildings + combo district
Owner: **n38worth-city-ui** · Reviewers: n38worth-game-systems (combo
semantics unchanged), image-analyst.
- Files: city components; reuse `professionName`; district-complete badge
  derives from existing combo state (NO forked logic).
- Acceptance: families distinguishable at a glance (screenshot review);
  district completion matches `useProfessionComboSelection` state exactly.

### 7. Milestone sectors + density aggregation
Owner: **n38worth-backend-economy** (projection) + **n38worth-city-ui**
(rendering) · Reviewer: n38worth-game-systems.
- Files: `projection.ts` (sector map + aggregation), city components.
- Acceptance: sector unlocks == mission thresholds from `missions-data.ts`;
  >N buildings aggregate with correct counts; DOM node count bounded
  (assert in test); large-portfolio route time stays sub-second.

### 8. Goddess landmarks + Root Sequence
Owner: **n38worth-city-ui** · Reviewers: n38worth-game-systems (countdown
authority), image-analyst.
- Files: city components + subscription to existing `game-global` events
  and `["goddess-countdown"]` query.
- Acceptance: six landmarks via `cardDisplayName`; Root Sequence visual
  mirrors countdown start/cancel within one poll/event cycle; no new
  countdown logic.

### 9. Public city viewing + screenshot sharing
Owner: **n38worth-city-ui** (+ backend pagination) · Reviewers:
security-reviewer, image-analyst.
- Files: `(game)/city/[username]/page.tsx`, share button (Web Share API /
  clipboard link), entry link from `players/[username]` page.
- Acceptance: only publicly-visible data rendered (route already filters);
  share text localized en+zh; OG stays static `og.jpg` in v1 (per-user OG
  generation deferred by decision).

### 10. Accessibility, mobile performance, regression, security, rollout
Owners: **n38worth-qa-performance** (lead), all specialists · Reviewers:
security-reviewer, n38worth-game-systems.
- Full a11y pass (labels, contrast, focus, motion), mobile profile of the
  largest city, regression suite run, final security sweep, then flip
  `city_enabled` on.
- Acceptance: qa release recommendation with zero blockers; game-systems
  and security sign-offs recorded.

## Open decisions (need the user)

1. **Stage thresholds** for `player_value/value_floor` → stages 0–5
   (proposal: 1×, 2×, 4×, 8×, 16×, 32× — powers of two matching the
   overclock/value-multiplier feel).
2. **Test framework**: vitest proposed (slice 1 approval gate).
3. **City art**: v1 procedural CSS/SVG shapes per profession vs extending
   `gen:scifi-art` with WebP building sprites (recommendation: CSS/SVG
   first, sprites later if screenshots say so).
4. **Entry point**: dedicated navbar icon (recommended) vs Home section.
5. Detailed-building cap N (proposal: 200).
