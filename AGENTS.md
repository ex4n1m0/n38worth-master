# Project notes for AI agents

## Infrastructure / accounts
- **Vercel: Pro plan.** Minute-level (and sub-hourly) cron schedules are allowed
  (e.g. `*/1`, `0,30 * * * *`), and functions may set `maxDuration` up to 60s.
- **Unsplash: Production API tier** (5000 requests/hour, not the 50/hr Demo tier).
  Used for NPC avatars in `src/lib/random-player.ts`. If Unsplash fails (rate
  limit, duplicates, network), falls back to picsum.photos as a last resort.

## Workflow preferences
- **Always commit AND deploy together.** When deploying, also commit the changes
  to git (and vice versa). Don't leave deployed work uncommitted.

## Commands
- Build: `npm run build`
- Lint: `npm run lint` (or `npx eslint <files>`)
- Typecheck: `npx tsc --noEmit`
- Deploy to production: `npx vercel --prod --yes`
- Cap over-ceiling player values (one-time DB fix): `npm run cap:player-values`

## Conventions
- **Mission completion awards (all 8 tracks):** +50 hire slots, the mission's
  reward card(s) (Mass Hire / goddesses), AND one free NPC auto-owned by the
  player (`awardMissionNpc` in `src/lib/missions.ts`). The NPC is claimed from
  the `isOnboardingPool` pre-generated pool first (no Unsplash call in the
  request path); hidden-avatar fallback if the pool is empty. Never create
  Unsplash NPCs synchronously in a request path — use the pool or the fallback.
- Player (card) values are capped at `MAX_PLAYER_VALUE` (1e12) via
  `capPlayerValue` / `MAX_PLAYER_VALUE_SQL` in `src/lib/safeguards.ts`. Clamp any
  new value-growth site with these so values never approach `MAX_SAFE_INTEGER`
  (which makes cards unaffordable/unpurchasable).
- Credits are capped at `MAX_CREDITS` (`MAX_CREDITS_SQL`) in the same file.
- **Portfolio value = owned cards' value × max(ownerCount, 1).** The player's
  OWN card value (`player_value`) is NOT included — portfolio is what you OWN,
  not what you ARE. This is enforced in `safePortfolioValue` (safeguards.ts)
  AND in every raw SQL portfolio expression across leaderboard, players,
  ranks, goddesses, and the reward crons. Any new portfolio SQL must omit
  `player_value` from the formula.
- **CDN caching for public API routes:** all auth-free GET routes (ranks,
  ranks/[type], landing-data, hall-of-fame, goddess-countdown, chat/public-messages,
  players/chat-list, players/human-count, npcs/top-hired, professions/counts,
  avatar/[username]) set `Cache-Control: public, s-maxage=…, stale-while-revalidate=…`
  so the Vercel CDN serves repeat/polled requests without invoking the function.
  When adding a new public GET route, add a similar header. NEVER add s-maxage to
  any route that calls `auth()` or varies per user — the CDN would leak one
  user's data to others. (`export const dynamic = "force-dynamic"` does not
  block this; explicit response headers are honored.)
- **Drizzle gotcha:** in a no-join `db.select({...}).from(users)` query, a
  column embedded in a raw `sql` template **in the SELECT field list** renders
  UNQUALIFIED (`${users.id}` → `"id"`, not `"users"."id"`). Inside a correlated
  subquery like `(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = ${users.id})`
  the bare `"id"` resolves to the subquery's own table (`o.id`) and silently
  returns wrong results (usually 0). Use a literal `"users"."id"` in raw
  select-field subqueries instead. WHERE/ORDER BY raw sql and joined queries
  render qualified names and are fine.
- **Instant UI updates despite slow polling:** polls are intentionally slow
  (cost savings), so navbar indicators rely on cache invalidation for
  responsiveness. Any action that changes the player's owned-card count
  (hire, discard, mass-hire, restore, combo sale, break-partnership, and the
  `ownership-changed` Pusher event) must invalidate BOTH `["missions"]`
  (mission progress bar) and `["ownership-limit"]` (slots counter) in
  addition to the usual credits/player/ownership keys. Don't put navbar
  indicators on raw useState+setInterval — use react-query so invalidation
  reaches them.
- **Shared 1s clock:** use `useNow()` from `src/hooks/useNow.ts` for any
  countdown/ticker UI (one module-level interval shared by all subscribers).
  Never add per-component `setInterval(…, 1000)` timers — with 50+ cards on
  screen that meant 50+ intervals. Also avoids calling `Date.now()` during
  render, which the react-hooks/purity lint rule rejects.
- **Sound effects:** `useSound()` / `playSound()` in `src/hooks/useSound.ts`
  (17 semantic types; files in `public/sounds/*.mp3`, Kenney CC0). Mute +
  volume live in `useSoundSettings` (zustand, localStorage-persisted),
  toggled from the navbar speaker icon and the Settings page. When adding a
  new user action or game event, play the matching semantic sound (`error`
  on failed toasts, `hire`/`sell`/`reward`/etc. on success).

## Cost controls (2026-07)
- **Random player creation is DISABLED**: the `/api/cron/random-player` and
  `/api/cron/random-player-status` cron entries were removed from vercel.json
  (routes still exist but nothing invokes them). The only remaining
  `createRandomPlayer` call site is the combo-sale NPC respawn in
  `comboCore.ts` (player-triggered, kept for game economy).
- **Cron cadences were slowed** to minimize invocations: agent */30,
  fate-seal */30, goddess-countdown */30, offline-penalty */30,
  refill-onboarding-pool every 3h, default-avatar hourly,
  delete-demo-players hourly, boss-tax every 2h. Ownership-limit cron
  removed (no-op). Don't tighten these without the user's approval —
  billing reduction is a priority.
- **Middleware matcher narrowed** in `src/proxy.ts` so `auth()` only runs on
  protected/avatar-required pages, not on `/api/*`, `/`, `/privacy`, `/terms`,
  or static assets. This removes JWT verification overhead from every public
  and API request.
- **Client polling was slowed ~5x** (most refetchIntervals are 150–600s).
  Public GET routes are CDN-cached (see Conventions). Keep new polling ≥2 min
  and prefer Pusher events over polling.

## Autonomous AI players (6 goddesses)
- **Roster:** `src/lib/agent/roster.ts` defines `GODDESS_ROSTER` — the six
  goddesses are the only gameplay AI players. `AI_PLAYER_USERNAMES` contains
  only goddesses. The historical chat-support `Agent` account is listed in
  `REMOVED_AGENT_USERNAMES` so old databases keep it hidden and unhireable.
- **Seeding:** `ensureGoddess` is non-destructive — it never flips isNpc or
  overwrites avatar/value. `ensureAgents` returns only the six goddesses and
  deactivates any historical removed-Agent row (`isActive=0`) without deleting
  data.
- **Cadence:** `/api/cron/agent` fires every 30 min (reduced from 1 min for
  Vercel cost savings), picks 2 goddesses per tick. Per-agent last-play gate
  in `runner.ts`: ACTIVE (humans online) = 6-min interval; IDLE (no humans) =
  60-min interval. AI players earn credits via the same portfolio-reward +
  rank-bonus crons as humans (goddesses included via `isNpc=0 OR username IN
  (GODDESS_USERNAMES)` filter).
- **Chat:** the support Agent was removed — `src/lib/agent/chat.ts` is deleted,
  no `agent-typing` Pusher event is emitted, and no AI player ever speaks.
- **Removed Agent is not a hireable card:** `purchaseCore.ts` rejects attempts
  to hire it (`isRemovedAgentUsername` check on the target).
