# Project notes for AI agents

## Infrastructure / accounts
- **Vercel: Pro plan.** Minute-level (and sub-hourly) cron schedules are allowed
  (e.g. `*/1`, `0,30 * * * *`), and functions may set `maxDuration` up to 60s.
- **Unsplash: Production API tier** (5000 requests/hour, not the 50/hr Demo tier).
  Used for NPC avatars in `src/lib/random-player.ts`.

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
- **Drizzle gotcha:** in a no-join `db.select({...}).from(users)` query, a
  column embedded in a raw `sql` template **in the SELECT field list** renders
  UNQUALIFIED (`${users.id}` → `"id"`, not `"users"."id"`). Inside a correlated
  subquery like `(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = ${users.id})`
  the bare `"id"` resolves to the subquery's own table (`o.id`) and silently
  returns wrong results (usually 0). Use a literal `"users"."id"` in raw
  select-field subqueries instead. WHERE/ORDER BY raw sql and joined queries
  render qualified names and are fine.
