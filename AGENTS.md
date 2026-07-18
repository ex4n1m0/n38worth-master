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
- **Drizzle gotcha:** in a no-join `db.select({...}).from(users)` query, a
  column embedded in a raw `sql` template **in the SELECT field list** renders
  UNQUALIFIED (`${users.id}` → `"id"`, not `"users"."id"`). Inside a correlated
  subquery like `(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = ${users.id})`
  the bare `"id"` resolves to the subquery's own table (`o.id`) and silently
  returns wrong results (usually 0). Use a literal `"users"."id"` in raw
  select-field subqueries instead. WHERE/ORDER BY raw sql and joined queries
  render qualified names and are fine.

## Autonomous AI players (12: 6 AGIs + 6 goddesses)
- **Roster:** `src/lib/agent/roster.ts` defines `AGENT_ROSTER` (6 AGIs) and
  `GODDESS_ROSTER` (6 goddesses). `AI_PLAYER_USERNAMES` combines both.
  `isAgentUsername` = AGI only (for display); `isAIPlayerUsername` = any AI
  player (for chat/loop-prevention/gameplay gates).
- **Seeding:** `ensureAgent` (AGIs, sets isNpc=0) vs `ensureGoddess`
  (non-destructive — never flips isNpc/overwrites avatar/value). Both are
  called by `ensureAgents` which returns all 12.
- **Cadence:** `/api/cron/agent` fires every 1 min, picks 2 agents per tick
  (covering all 12 every 6 min). Per-agent last-play gate in `runner.ts`:
  ACTIVE (humans online) = 6-min interval; IDLE (no humans) = 60-min interval.
  No 5-on/10-off cycle, no per-cycle refill. AI players earn credits via the
  same portfolio-reward + rank-bonus crons as humans (goddesses included via
  `isNpc=0 OR username IN (GODDESS_USERNAMES)` filter).
- **Chat:** `maybeAgentChat` uses the LLM only, shared 3-min reply cooldown,
  hard-gates on human presence (no AI chat in empty rooms). Each AI speaks in
  its own personality via `getAutonomousPlayerDefinition`.
