# Project notes for AI agents

## Localization (English + 简体中文, since 2026-09)
- **All user-visible strings go through the dictionary**: add a key to BOTH
  `en` and `zh` in `src/lib/i18n.ts` (the `TranslationKeys` type fails the
  build if zh drifts from en) and read it via `const { t, locale } =
  useLanguage()` from `src/components/LanguageContext`. Interpolation uses
  `{param}` placeholders + `.replace()` chains; plurals use two keys.
- **Locale-aware game vocabulary lives next to its data**: render goddess /
  Botnet names via `cardDisplayName(username, locale)`, professions via
  `professionName(name, locale)` / `professionPerk(name, locale)`, rank titles
  via `rankTitle(title, locale)`, mission labels via
  `missionLabel(index, locale)` / `finalGoddessLabel(threshold, locale)`. DB
  values, usernames, API params and comparisons stay raw English — only the
  DISPLAY text is translated.
- **Never hardcode English UI text** in components (JSX, toasts, titles,
  aria-labels, placeholders, alt). Server-side strings (API `data.error`
  values, DM receipt writes) are English in v1 — see CHINESE_I18N_STUDY.md §6
  before changing that.
- Language switcher: `<LanguageSwitcher />` (icon variant in the navbar,
  pill variant on landing/auth/public). Locale persists in localStorage
  `n38-lang` + cookie; `?lang=zh` deep-links and browser detection set it.
- zh glossary is canonical in CHINESE_I18N_STUDY.md §4 (化身 hire=雇佣
  credits=信用点 boss=老板 overclock=超频 firewall=防火墙 breach=击穿
  hard lock=硬锁 botnet=僵尸网络 the Six=六使, etc.) — keep new copy
  consistent with it.

## Infrastructure / accounts
- **Vercel: Pro plan.** Minute-level (and sub-hourly) cron schedules are allowed
  (e.g. `*/1`, `0,30 * * * *`), and functions may set `maxDuration` up to 60s.
- **Unsplash: Production API tier** (5000 requests/hour, not the 50/hr Demo tier).
  Used for NPC avatars in `src/lib/random-player.ts`. If Unsplash fails (rate
  limit, duplicates, network), falls back to picsum.photos as a last resort.
- **Unsplash/picsum avatars are HOTLINKED, not compressed** (since 2026-07-31):
  `unsplashAvatarUrl` in `src/lib/hotlink-avatar.ts` builds a 256px square webp
  URL on Unsplash's CDN (required by their API guidelines; image requests don't
  count against the rate limit), and picsum fallbacks store the stable
  `picsum.photos/seed/...` URL directly. Only legacy NPC rows (pre-2026-07-31)
  carry `data:` URIs. `compressAvatar` remains for user-uploaded files only —
  never download/compress Unsplash photos into the DB.

## Workflow preferences
- **Work locally; commit and deploy ONLY when the user explicitly asks.**
  When a commit/deploy is requested, do them together (never deploy
  uncommitted work or commit without deploying what was committed).

## Commands
- Build: `npm run build`
- Lint: `npm run lint` (or `npx eslint <files>`)
- Typecheck: `npx tsc --noEmit`
- Deploy to production: `npx vercel --prod --yes`
- Cap over-ceiling player values (one-time DB fix): `npm run cap:player-values`
- Rebrand: rename `users.profession` rows (one-time): `npm run rebrand:professions`
- Rebrand: swap goddess avatar art to statics (one-time): `npm run rebrand:goddess-art`
- Regenerate sci-fi placeholder art: `npm run gen:scifi-art`

## Sci-fi rebrand (2026-09)
The game was rebranded from medieval/dark-fantasy to a sci-fi "simulation /
Matrix" theme via DISPLAY-NAME INDIRECTION — DB keys, API paths, cron routes,
and Pusher events were NOT renamed. Keep these rules:

- **Goddess usernames are DB keys and stay as-is** ("Goddess of Wealth" etc.
  in `GODDESS_USERNAMES`, `POWER_BITS`, missions' `rewardCards`, purchase
  locks). User-facing names live in `src/lib/display-names.ts` (The
  Architect / The Banker / The Oracle / The Locksmith / The Clockkeeper /
  NullPointer, collectively "the Six"; "Mass Hire" → "Botnet"). Render
  special-card names through `cardDisplayName(username)` — links and API
  calls keep the raw username.
- **Professions were renamed in code AND data**: Cryptographer, Zero-Day,
  Overclocker, Cache Keeper, Server Marshal, Bot Herder (perks are
  "Firmware Perks"). New code must use these names; run
  `npm run rebrand:professions` when deploying to a DB that still has the
  old profession strings on user rows.
- **Action vocabulary**: OVERCLOCK (was pump), FIREWALL (was block sell /
  sell block), BREACH (was break), HARD LOCK (was perm block / fate seal),
  CLOAKED (was hidden), SCAN (was reveal), BOTNET (was mass hire).
  "Hire", "credits", "boss", "hire slots" are unchanged.
- **Rank titles** in `src/lib/ranks.ts` are sci-fi ladders (Lurker→Architect,
  Null→Yotta, Ghost→Ascendant, Void→Hegemon). The "Empire" leaderboard
  category DISPLAYS as "Grid"/"Widest Grid" but its API value stays
  `"empire"` (same for `"legacy"` etc.) — never rename `/api/ranks/[type]`
  values or `user_rank_snapshots` columns.
- **Win-condition copy**: "root the mainframe", "the simulation reboots",
  winners list is "The Root Wall" (`HallOfChampions` component), world
  reset overlay says "The Simulation is Rebooting".
- **Placeholder art** in `public/` (TheBanker.webp, NewCryptographer.webp,
  simulation.webp hero, reboot.webp, VW_Icon.png terminal icon, og.jpg social
  card, NEW_HIDDEN.webp masked avatar, 10slots.webp) was
  generated by `npm run gen:scifi-art` — deterministic, safe to re-run.
  Replace with real art by overwriting the same filenames.
- Old fantasy art (NewGoddess*.webp, okworld.webp, WORLD_RESET.webp,
  masshire.webp, reveal.webp, okworld_OG.jpg) is left in place for history;
  do not reference them in new UI. The OG/Twitter image routes
  (src/app/opengraph-image.tsx, twitter-image.tsx) serve `og.jpg`.

## Conventions
- **Build stamp is automatic:** the landing page shows "build <sha> · deployed
  <date>" via `src/lib/build-info.ts`; values are inlined at compile time by
  `next.config.ts` (`env`, from VERCEL_GIT_COMMIT_SHA / local git + build
  time). Never maintain a manual version number — it bumps on every commit
  and deploy by itself.
- **Mission completion awards (all 8 tracks):** +50 hire slots, the mission's
  reward card(s) (Mass Hire / goddesses), AND one free NPC auto-owned by the
  player (`awardMissionNpc` in `src/lib/missions.ts`). The NPC is claimed from
  the `isOnboardingPool` pre-generated pool first (no Unsplash call in the
  request path); if the pool is empty, fall back to a hotlinked picsum
  avatar (`fetchFallbackNpcAvatar` in `src/lib/npc-fallback-avatar.ts`) —
  the hidden placeholder is the last resort only. Never create Unsplash NPCs
  synchronously in a request path. Stale hidden-avatar NPCs can be repaired
  with `npm run backfill:hidden-avatars`.
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
- **Leaderboard rank positions are snapshotted:** `/api/cron/rank-snapshot`
  (every 10 min) pre-computes all 5 category ranks into
  `user_rank_snapshots` (one query with window RANK(), chunked upserts);
  `/api/leaderboard` reads it via one indexed lookup and falls back to the
  live correlated-COUNT computation when a user has no row. If you change
  the portfolio formula or rank eligibility filters, update BOTH the cron's
  `visible` CTE and the route's fallback SQL — they must stay identical.
- **Sound effects:** `useSound()` / `playSound()` in `src/hooks/useSound.ts`
  (17 semantic types; files in `public/sounds/*.mp3`, Kenney CC0). Mute +
  volume live in `useSoundSettings` (zustand, localStorage-persisted),
  toggled from the navbar speaker icon and the Settings page. When adding a
  new user action or game event, play the matching semantic sound (`error`
  on failed toasts, `hire`/`sell`/`reward`/etc. on success).

## Cost controls (2026-07)
- **Goddess gameplay is DISABLED (2026-08-21)**: the `/api/cron/agent` cron
  entry was removed from vercel.json (route still exists, still gated on
  `AGENT_ENABLED=true`, but nothing invokes it). The six goddesses are now
  static hireable cards — they never buy cards or pump. `runAgentTurn` has no
  remaining call sites in the request path. Re-enable by re-adding the cron
  entry (and setting `AGENT_ENABLED=true`).
- **Random player creation is DISABLED**: the `/api/cron/random-player` and
  `/api/cron/random-player-status` cron entries were removed from vercel.json
  (routes still exist but nothing invokes them). The only remaining
  `createRandomPlayer` call site is the combo-sale NPC respawn in
  `comboCore.ts` (player-triggered, kept for game economy).
- **Cron cadences** (verify against vercel.json before relying on this list):
  portfolio-reward 0,30 * * * *; offline-penalty */30; leaderboard-prizes
  hourly; rank-bonus hourly; rank-snapshot */10; goddess-countdown */5;
  fate-seal */5; refill-onboarding-pool every 3h; default-avatar hourly;
  delete-demo-players hourly; boss-tax every 2h. Ownership-limit and agent
  crons removed. Don't tighten these without the user's approval —
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
- **Cadence:** DISABLED (2026-08-21) — `/api/cron/agent` no longer has a cron
  entry in vercel.json, so goddesses never take turns (no buys, no pumps).
  Historical behaviour, if re-enabled: fired every 30 min, picked 2 goddesses
  per tick. Per-agent last-play gate in `runner.ts`: ACTIVE (humans online) =
  6-min interval; IDLE (no humans) = 60-min interval. AI players earn credits
  via the same portfolio-reward + rank-bonus crons as humans (goddesses
  included via `isNpc=0 OR username IN (GODDESS_USERNAMES)` filter).
- **Chat:** the support Agent was removed — `src/lib/agent/chat.ts` is deleted,
  no `agent-typing` Pusher event is emitted, and no AI player ever speaks.
- **Removed Agent is not a hireable card:** `purchaseCore.ts` rejects attempts
  to hire it (`isRemovedAgentUsername` check on the target).

## Mainframe City building layer (planned 2026-09)
The city is a DERIVED visual projection of the existing economy — never a
second economy, currency, or simulation. Invariants (enforced by
n38worth-game-systems review):
- Owned avatar = building/module. Hire constructs; loss/poach removes;
  restore reconstructs. Building stage derives from current value relative
  to value_floor; the server computes it, the client only renders it.
- PLACEMENT IS DERIVED (2026-09-27 "value orbits"): the HQ core + the Six
  landmarks hold the center; every other owned building fills CLOCKWISE
  square rings around the HQ in VALUE order (priciest innermost, cheapest
  at the rim) — `rankArrangeTiles` (src/lib/city/placement.ts) over the
  pure orbit walk in src/lib/city/rings.ts. A value change re-ranks the
  whole orbit on the next projection and the scene GLIDES moved buildings
  to their new ring. Locked sectors are skipped by the orbit walk, so the
  mission ladder still gates city growth. The persisted city_layout
  machinery (POST /api/city/layout, GET /api/city/my-layout,
  layout-merge.ts) is legacy-retained but UNUSED — /api/city/[username]
  no longer joins it, and the manual ghost/build-mode/queue UI is deleted.
- Firewall / hard-lock authority stays in blockSellUntil / permBlockUntil
  timestamps; the city layer only adds protection VISUALS.
- Professions set building families; owning all six professions completes a
  district (combo state stays in existing profession logic — do not fork it).
- Existing ownership milestones (missionLevel) unlock sectors; the six
  goddess cards are landmarks; holding all six drives the Root Sequence
  countdown VISUAL (goddess-countdown.ts stays authoritative).
- Credits remain the only currency. NO construction timers, roads,
  utilities, citizens, crafting, building damage, or game engines in the MVP
  — CSS/SVG/WebP and restrained transitions only.
- Data comes from a read-only derived projection (e.g. /api/city/[username])
  computed from existing ownership/value/profession/milestone/protection/
  goddess state; prefer additive endpoints over economy-table changes, and
  never duplicate economy formulas in UI components.
- Rendering stays bounded: aggregate ordinary avatars beyond the
  detailed-display limit, lazy-load heavy avatar media, support keyboard
  interaction and prefers-reduced-motion.
- Economy-touching city work follows: map paths → state invariants → review
  by n38worth-game-systems (formulas/milestones/goddesses) and
  security-reviewer (auth/ownership/races) → image-analyst for major UI
  states. Tests before economy-logic changes (framework TBD — the repo
  currently has none).
