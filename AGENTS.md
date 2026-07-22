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

## Autonomous AI players (6 goddesses + 1 chat-only Agent)
- **Roster:** `src/lib/agent/roster.ts` defines `AGENT_ROSTER` (1 chat-only
  support Agent) and `GODDESS_ROSTER` (6 goddesses — the only gameplay AI
  players). `AI_PLAYER_USERNAMES` combines both. `isAgentUsername` = Agent
  only; `isAIPlayerUsername` = Agent or any goddess.
- **Seeding:** `ensureAgent` (Agent, sets isNpc=0, chat-only) vs
  `ensureGoddess` (non-destructive — never flips isNpc/overwrites
  avatar/value). Both are called by `ensureAgents` which returns all 7.
- **Cadence:** `/api/cron/agent` fires every 30 min (reduced from 1 min for
  Vercel cost savings), picks 2 goddesses per tick. The Agent is never picked
  for gameplay.
  Per-agent last-play gate in `runner.ts`: ACTIVE (humans online) = 6-min
  interval; IDLE (no humans) = 60-min interval. AI players earn credits via
  the same portfolio-reward + rank-bonus crons as humans (goddesses included
  via `isNpc=0 OR username IN (GODDESS_USERNAMES)` filter).
- **Chat:** `maybeAgentChat` uses the LLM only, shared 1-min reply cooldown,
  hard-gates on human presence (no AI chat in empty rooms). Only the Agent
  speaks — it acts as a technical-support agent, answering game-related
  questions from humans. All other AI players are silent.
- **Agent is not a hireable card:** `purchaseCore.ts` rejects attempts to
  hire the Agent (`isAgentUsername` check on the target).
