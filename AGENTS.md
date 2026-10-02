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

## Theme eras: fantasy → sci-fi (2026-09) → CITY BUILDING (2026-09-29)
The game is now themed as **"The City Building Simulation"** — a city building
tycoon game. Both rebrands were applied via DISPLAY-NAME INDIRECTION — DB keys,
API paths, cron routes, and Pusher events were NOT renamed. The canonical
naming bible is `CITY_REBRAND_STUDY.md` (§2 vocabulary table). Keep these rules:

- **Goddess usernames are DB keys and stay as-is** ("Goddess of Wealth" etc.
  in `GODDESS_USERNAMES`, `POWER_BITS`, missions' `rewardCards`, purchase
  locks). User-facing names live in `src/lib/display-names.ts`: The Architect /
  The Banker / The Surveyor / The Registrar / The Foreman / The Wrecker,
  collectively "the Founders" (奠基六杰); "Mass Hire" → "Land Grab". Render
  special-card names through `cardDisplayName(username)` — links and API
  calls keep the raw username. Founder ART FILES keep their historical
  filenames (TheOracle.webp holds The Surveyor's art, etc.) — they are DB
  avatarUrl contracts.
- **Professions: DB values stay** (Cryptographer, Zero-Day, Overclocker, Cache
  Keeper, Server Marshal, Bot Herder — also the art-family keys in the city
  scene). The city DISPLAY names live in `professions.ts`
  (`PROFESSION_DISPLAY_NAMES`): Notary / Auctioneer / Renovator / Vault
  Keeper / City Planner / Prospector — perks are "Trade Secrets" (行业秘诀).
  Render via `professionName(name, locale)` / `professionPerk(name, locale)`;
  never compare user input against display names. The 2026-09
  `rebrand:professions` script is historical — do NOT run it again.
- **City action vocabulary (display only)**: ACQUIRE (was hire), RENOVATE (was
  pump/overclock), DEED LOCK (was firewall/block sell), FORECLOSE (was
  breach/break), IRON DEED (was hard lock), OFF-MARKET (was cloaked/hidden),
  OPEN HOUSE (1h reveal), AERIAL VIEW (was scan), LAND GRAB (was botnet/mass
  hire), REDEEM (was sell out), TAKE OVER (city steal), DEVELOPMENT (was
  profession combo). Economy nouns: "capital" (was credits), "landlord" (was
  boss), "rent" (portfolio income), "land plots" (was hire slots), "permits"
  (was missions), "trades" (was professions). Key names, code identifiers,
  API paths, DB columns and cron routes are unchanged (`hireSlots`,
  `blockSellUntil`, `/api/game/pump`, `mass-hire.ts`, `perm-block` route …).
- **Units display as BUILDINGS (since 2026-09-28)**: the tradable
  avatar/card is "building(s)" / "建筑" in ALL user-visible copy — nav tab,
  market, toasts, tutorial, permit labels (`missions-data.ts`), trade
  secrets, Founder powers, and API `error:` strings. The PROFILE-PHOTO sense
  keeps "avatar" / "头像" (upload/change/random avatar, "Your Avatar is your
  Brand"). Key names, code identifiers, API paths and DB values are
  unchanged (`navAvatars`, `avatarValueTooltip`, `/api/avatar/*`,
  `reveal-avatar` routes).
- **Rank titles** in `src/lib/ranks.ts` are city ladders (Grid:
  Newcomer→Baron; Credits: Broke→Mogul; Value: Empty Lot→Landmark; Portfolio:
  Ghost Town→World Capital). The "Empire" leaderboard category DISPLAYS as
  "Grid"/"Widest Grid" (a city grid — kept) but its API value stays
  `"empire"` (same for `"legacy"` etc.) — never rename `/api/ranks/[type]`
  values or `user_rank_snapshots` columns.
- **Win-condition copy**: "crown the skyline" (hold all six Founders 60 min),
  "the city is rebuilt" (world reset), winners list is "The Cornerstone"
  (`HallOfChampions`), world reset overlay says "The City Is Being Rebuilt",
  the countdown HUD shows "CORONATION". Server `gameHistory`/Pusher strings
  use the same vocabulary but stay English.
- **Placeholder art** in `public/` (TheBanker.webp, NewCryptographer.webp,
  simulation.webp hero skyline, reboot.webp cranes-at-dawn, VW_Icon.png
  skyline icon, og.jpg social card, NEW_HIDDEN.webp off-market avatar,
  10slots.webp) is city-themed and generated by `npm run gen:scifi-art`
  (script kept its historical name) — deterministic, safe to re-run.
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

## Crew Battles — async auto-battler (2026-10-02, GAME_INTEGRATION_STUDY §5D)
- **Lineups are SNAPSHOTS** (`crew_lineups`, one per player): 5 owned cards
  stored with combat stats; attacks always resolve against the saved ghost.
  Bands = Σ lineup tiers (5-20/21-35/36-50/51+, fees 100/250/500/1000) —
  band parity is enforced on attack.
- **Combat** `src/lib/crew-battle.ts` (pure, seeded mulberry32): HP 18+5×tier,
  ATK 4+2×tier, speed = tier +3 Auctioneer; team passives per trade (Notary
  heal 2/round, Renovator +20% ATK, Vault Keeper +20% HP, City Planner +10%
  both, Prospector 15% ×2 crit); locked cards +10% HP; attacker first-strike
  on speed ties, defender wins deep HP ties; ≤30 rounds; full log audited.
- **Economy (F2 ruling)**: the fee RECYCLES into the crew pot (not burned) —
  battles are self-funding (pot +0.1×fee/battle at parity) and a net
  money-supply sink; prize 1.6×fee / defense reward 0.2×fee are CAS pot
  debits above the floor. ANTI-FARMING (F1): inactive targets rejected;
  1h per-(attacker,defender) repeat cooldown; one-sided matchups (expected
  score > 0.9) pay NO prize (prizeEligible).
- Elo: K24 attacker / K12 defender, floor 100 (crew_battle_records; W/L +
  streak). /raid 5th tab: lineup editor (roster shared with crew jobs),
  3 same-band targets, ladder, HP-bar replay modal (reduced-motion safe).
  i18n battles* keys incl. localized badges. Pusher crew-battle-done.

## Crew Jobs — PvE heists on the Founders' banks (2026-10-01, §5C)
- **Crew** = 5 owned visible cards; gates are COMPOSITION (Σ tiers + required
  families) — cheap cards finally matter. Jobs: 6 Founder banks with
  escalating gates/payouts (`src/lib/crew-jobs.ts`); job keys are raw goddess
  usernames; display titles/flavors in the catalog (en/zh).
- **The Crew Pot** (game_settings `crew_pot`): funded by 20% of every
  boss-tax transfer (bosses keep 80% — the cron splits and banks the skim
  per run; boss history/Pusher record the 80% share) + one-time 100k
  bootstrap. Payouts are POT-BOUNDED (CAS debit ≥ payout+floor, single
  guarded retry on concurrent drain that credits only what actually
  debited). NEVER mint into the pot; the floor (100) always holds.
- **Resolution**: 3 steps; crew power = Σ tier + 3×(cards of the step's
  favored family) + 1×(locked cards); success = power ≥ difficulty×roll,
  rolls uniform over {0.7,0.9,1.1,1.3}; outcomes fail/partial/clean/perfect
  × 0/0.4/1.0/1.6. Step difficulties are DERIVED (calibratedDifficulty —
  accounts for stacked family bonuses) so a min-gate crew is never a
  guaranteed perfect while a 5×t14 crew always is (pinned by tests).
- Entry fee 2% (burned). Cooldown 4h/job (latest crew_job_runs row;
  audit row stores steps+powers in `details`). /raid 4th tab; Pusher
  `crew-job-done`; i18n crew* keys incl. localized outcome labels.

## Blueprint Albums + escrowed trading (2026-10-01, GAME_INTEGRATION_STUDY §5E)
- **Catalog** `src/lib/blueprints.ts`: 24 blueprints / 5 albums (residential
  ← acquire, commercial ← renovate, industrial ← foreclose, civic ← permits
  [guaranteed], vault ← raids [ONLY legendary source]). Rarity weights
  60/27/11/2. Display names live in the catalog (nameEn/nameZh via
  `blueprintName(id, locale)`) — vocabulary-next-to-data convention.
- **Drops** (`blueprint-service.maybeDropBlueprint`, crypto RNG, best-effort
  never fails the action): hooks in buyPlayerCore (residential),
  breakPartnershipCore (industrial), pumpPlayer (commercial), missions award
  (civic, guaranteed), executeRaid (vault), mass-hire (one residential roll
  per press — its loop bypasses buyPlayerCore). One-time gameHistory
  backfill (≤30 commons/rares, claim-first `__backfilled` sentinel row).
- **Rewards are COSMETIC ONLY**: album completion raises a PROP on your city
  (park/marquee/crane/rotunda/goldvault) — derived from inventory, shipped
  per-city as `cities[].props` in /api/city/world, drawn by CityMap2D. NO
  slots/value/credits ever. **Props TAKE THE PLACE of buildings (user ruling
  2026-10-02)**: `layoutCity` (map2d/layout.ts) gives each prop key a FIXED
  ring-3 cell (`PROP_CELLS`, compass points) reserved before the building
  walk — a completed album visibly costs one building slot per prop, on
  every viewer's identical map.
- **Trading** (`blueprint_trades`): duplicates (count>1) only — cards stay
  non-tradeable. Propose escrows the offer copy (conditional count>1
  decrement; insert-failure refunds); accept claims via conditional status
  UPDATE, escrows counterpart, rolls back the claim if missing; expire gate
  pinned; decline/cancel/expire refund claim-first. Max 5 open/user, 48h.
  World reset: collections SURVIVE (cosmetic retention); open trades cancel
  with refunds via ONE atomic claim-all UPDATE.
- Tables `blueprint_inventory` / `blueprint_trades` (CASCADE FKs). i18n sweep
  in raid-bounties.json (bp* keys) + Pusher `blueprint-drop` /
  `blueprint-trade` handlers in usePlayerEvents. /raid third tab.

## World Vault + heist map visuals (2026-10-01, GAME_INTEGRATION_STUDY §5G)
- **The World Vault** (`src/lib/world-vault.ts`, bar on /raid): always-on
  server-wide progress bar. Damage = weighted gameHistory counts since
  `fd_epoch_start` (purchase 1 / pump 1 / raid 2 — ZERO new action-path
  writes). Break at goal (base 600, ×1.6/arm, calibrated to ~1–3 active
  days): every contributor with ≥3 weighted damage mints flat 500¢ (≤500
  participants), top 3 get max(100, 0.1% owned-value) × [3,2,1]; all
  LEAST-capped; rewardHistory type "world_vault"; Pusher game-global
  `vault-broken`. Break processing: CAS claim on fd_epoch_start (exactly
  once), lazily on GET /api/game/world-vault (no-store, maxDuration 60) +
  hourly backstop inside the leaderboard-prizes cron. The epoch row is
  BOOTSTRAPPED on first maybeProcessBreak — never assume it exists. World
  reset re-arms it explicitly (gameHistory SURVIVES resets — do not delete
  the row or pre-reset damage re-breaks the fresh vault).
- **Heist map visuals** (/api/city/world extra fields `raidHits` 24h +
  `bountyTargets` unexpired-open): CityMap2D draws crack strokes + ×N badge
  on raided cities and a red crosshair marker on bounty targets — derived,
  read-only, deterministic. game-global is a SHARED Pusher channel: unbind
  your event only, NEVER unsubscribe the channel (WorldVaultBar pattern).

## Heist layer: Vault Raids + Bounty Board (2026-10-01)
Implemented from GAME_INTEGRATION_STUDY.md §5A/§5B ("The City Heist Simulation"
rebrand). Credits-only, mission ladder untouched, all routes per-user authed
(`no-store`).

- **Vault raids** (`src/lib/raid.ts`, page `/raid`, nav "Raid"): a luck-flavored
  SECOND steal verb next to poaching. Raid charges: lazy accrual 1/8h, cap 3
  (revenge may hold 4, one revenge grant per victim per 8h AND only when the
  victim actually lost credits — `shouldGrantRevenge` gates multi-account
  cycling). Resolution: 3 locks @ p=0.55 → loot multiplier 0.2/0.6/1.0/1.4 over
  (minted pool + victim share). Pool = 0.5% of the ATTACKER's portfolio
  clamped [100, 1e9] (`getPortfolioValue` = the canonical cron expression — do
  not fork). Victim share = 1% of liquid credits (0.5% if any deed lock /
  iron deed active — locks are the vault shield), 0 below 5000¢, ≤ 3× pool.
  Entry burn = max(10, 2% of pool) — the layer's sink. Never touches
  cards/values/ownership. Tables `raid_state` (CASCADE FK, unique user) +
  `raid_log`. Charge persistence is CAS-guarded (`loadAccruedRaidState`) —
  never write charges from a stale read; neon-http has no transactions.
- **Bounty board** (`src/lib/bounties.ts`): escrowed contracts on other
  players' cards. Types: `foreclose` (pays whoever POACHES the target —
  settled in `buyPlayerCore` via `settleBountiesOnPurchase`, every open
  bounty on the card pays the taker) and `deliver` (escrow refunds the
  creator when THEY acquire it). Post: reward + 2% burned fee, min 100¢,
  max 1e9¢, 48h expiry (lazy sweep + refund on board reads), max 5 open per
  creator, integer rewards only. All state flips are single conditional
  `UPDATE ... WHERE status='open' RETURNING` (no double-claims). World reset
  expires open bounties WITHOUT refunds (credits reset to 100 anyway) and
  wipes raid tables (`triggerGameReset.ts` 5c).
- **`purchasePlayer` is a thin wrapper over `buyPlayerCore`** (2026-10-01). It
  used to be a drifted duplicate (3-min vs 30-s deed locks per lease-hour,
  missing perm-blocks/removed-Agent check/market broadcast). NEVER re-fork
  it — all purchase paths (market API, restore-all, foreclosure, missions)
  run the core; `buyPlayerCore` whitelists lease hours to {1,2,4,6} and hosts
  the bounty settle hook. The Fate break flow also calls the core directly.
- **Raid/bounty vocabulary** (i18n sweep `i18n-keys/{en,zh}/raid-bounties.json`):
  VAULT RAID 金库劫案, raid charges 突袭机会, loot 赃款, BOUNTIES 悬赏,
  FORECLOSE bounty 强取, DELIVER bounty 送达, revenge charge 复仇机会.
  Pusher events: `raid-resolved`, `raid-suffered`, `bounty-claimed`,
  `bounty-completed`, `bounty-update` (handlers in `usePlayerEvents`).

## City 2D shared world map (2026-10-01, CITY_2D_WORLD_STUDY.md — COMPLETE)
The city view is ONE STATIC 2D CANVAS (Style A "Blueprint", always day) —
`CityMap2D` mounted by `CityWorld`. STAGE RULING UPDATE (2026-10-02, user):
BOTH renderer stages (2D and 3D) FILL the whole available column (width 100%,
height `clamp(420px, calc(100vh - 230px), 1080px)` — canvas matches the full
wrapper, no square clamp; supersedes the 2026-10-01 square 1:1 stage). User
rulings
encoded: static draw zero animation (rAF-on-event only), camera opens on YOUR
city, literally every visible city fully rendered (no caps), avatars take the
center square (card avatar ≥24px draw size; HQ = owner avatar ≥22px).

- **Layout** `src/lib/city/map2d/layout.ts` (pure, tested): per-city square
  rings clockwise from 12 o'clock, HQ 3×3 core, 6 Founder landmark hex slots
  on ring 2 (canonical GODDESS_USERNAMES order — never permute), buildings
  value-desc (server-sorted). World: biggest city center, others on square
  rings by building count desc (ties → username asc), per-side packing with
  2×maxHalf corner exclusion (overlap-free by construction — see tests).
  Family indexing: `map2d/families.ts` (PROFESSIONS order + unassigned=6;
  palette order MUST stay in lockstep).
- **Data** `GET /api/city/world` (THE world endpoint): all visible cities +
  ALL owned buildings (tier/protection server-computed via canonical
  projection helpers — never fork) + ownership roads;
  `public, s-maxage=60, swr=300`. Goddesses are landmarks only (excluded
  from buildings); hidden cards excluded (visibleSql parity).
- **Renderer** `CityMap2D`: single canvas, pan/zoom/tap hit-testing, module
  avatar cache (batched redraw), selection via the EXISTING cityWorldStore
  channels (select/selectUniverseBuilding/selectUniverseCity/selectHq/
  selectLandmark with slot↔canonical goddess index translation) so the
  inspector + panels work unchanged. i18n sweep `i18n-keys/{en,zh}/city-2d.json`.
- **/catalog is the COMPREHENSIVE buildings catalog (2026-10-02 rebuild, see
  BUILDING_CATALOG_STUDY.md)**: every subject — 7 families × ALL 14 tiers,
  protection states, HQ stages 1–3, the six Founder landmarks, the five
  album props — shown side by side as 2D blueprint plate (map2d primitives)
  + live card art (BuildingSprite) + 3D shot. 3D plates come from
  `map3d/plate.ts` (one module-singleton OFFSCREEN WebGLRenderer, ~8ms-frame
  batched queue, soft failure), which builds subjects via the engine's
  EXPORTED builders (`artClassGeometry`, `buildHqObject`, `buildMonumentObject`,
  `buildPropObject`, `buildProtectionRing` in engine.ts) — extend those, never
  fork them. Catalog i18n keys live in `i18n-keys/{en,zh}/city-2d.json`
  (catalog* keys).
- **CARD-MATCHES-3D RULING (2026-10-02 evening, study §10)**: BuildingSprite
  renders the COMPILED VOLUMES — `buildingArt → compileArtToVolumes →
  volumesToCardArt` (lib/city/volume-art.ts, pure 2:1 iso with the engine's
  0.95/0.8/1.2 face shading) — the exact boxes/spheres/tori the 3D engine
  instanced, so card and 3D cannot drift. Scale constants ART_K/MONUMENT_K/
  HQ_K live ONLY in art-geometry.ts. The compiler BAKES opacity toward paper
  and the art contains NO `path` shapes (all replaced with circles/lines) —
  keep it that way. Protection: gold = Deed Lock, ink = Iron Deed (2D badge
  square vs diamond; 3D base ring via PROTECTION_RING). 2D landmarks carry
  per-Founder sigils (drawLandmark's canonical param). tierScale jumps at
  the league boundary (civic 0.40→0.86, grand 0.97→1.0).

**SHIP 2 DONE (2026-10-01) — the old engine is DELETED.** Removed:
`world/scene/` (PixiJS ~9.5k LOC), `world/scene3d/` (Three.js ~6.9k LOC),
`renderer-flag.ts`, CitySceneHost/CitySceneMount/scene-api/CityHud/
SceneErrorBoundary/BuildingsCatalogMount, /dev-catalog,
`lib/city/{placement,rings,streets,river,universe,satellites,layout-merge,
layout-schema}.ts`, `lib/city/scene/{camera,camera3d,iso,lights,culling,
diff,motion}.ts`, `/api/city/{universe,layout,my-layout}` routes,
`public/city-assets/**` (117 Kenney GLBs), the pixi.js + three +
@types/three deps, ~216 renderer tests, 21 dead i18n keys, and the legacy
city_layout machinery. **Do not reintroduce any of it** — extend map2d/
instead. KEPT from the old layer (still used by panels/inspector):
`lib/city/{projection,neighbors,district,landmark-colors,root-sequence,
fixtures,types}.ts`, `lib/city/scene/{store,lod,daylight,summary}.ts`,
CityGrid/BuildingTile/BuildingSprite.tsx (DOM), `useCityWorldStore`,
city feature flag (`useCityEnabled` / `city:flag`).

**UPDATE (2026-10-02, "free camera rotations" ruling):** three.js IS back as
the SECOND renderer — `CityMap3D` (`?view=3d`, toggle "3D"), engine in
`src/lib/city/map3d/engine.ts`, three@0.186 lazily imported ONLY when that
view mounts (own chunk; default bundle stays 2D). It is a MINIMAL fresh
engine (compiled card-art geometry per family/tier via `map3d/art-geometry.ts`
— windows, silhouettes, halos from the shared building-art.ts; one shadow
sun, custom orbit controls, raycast selection, render-on-demand) — do NOT
grow it back into the deleted framework (no GLB kit, no addons imports, no
LOD ladders). The city toggle is TWO views only: "2D" (the Blueprint
CityMap2D, default) and "3D" — an intermediate "Isometric" canvas view
(CityMapIso + map2d/iso.ts) shipped and was REMOVED the same day (2026-10-02
user ruling); `building-art.ts` (the extracted card-art spec shared by
BuildingSprite cards + the 3D compiler) SURVIVES it — never fork it. Legacy
deep links/storage (`?view=blueprint`, `?view=iso`) alias to 2D. Avatars
appear on buildings ONLY in the 2D view (user ruling 2026-10-02).

## Mainframe City building layer (planned 2026-09; RENDERER PARTS DELETED 2026-10-01)
The city is a DERIVED visual projection of the existing economy — never a
second economy, currency, or simulation. Invariants (enforced by
n38worth-game-systems review):

> **HISTORICAL (2026-10-01):** everything below about RENDERERS (Pixi/Three,
> ?renderer= flags, orbit ring geometry, streets/river/satellite mini-cities,
> Kenney kit, pixel atlas, day/night, LODs, world-map v2) describes the
> DELETED engine — see the "City 2D shared world map" section above for the
> live system. Still-true bits: the derived-projection invariants, the
> /api/city/[username] contract, goddesses-as-landmarks, mission-gated
> sectors vocabulary, and the no-second-economy rules.
- **Renderer (2026-09-30): the city defaults to the THREE.JS 3D renderer**
  (`src/components/city/world/scene3d/` — camera3d.ts pure ortho adapter at
  yaw45/elev30 = exact 2:1 iso parity, building3d.ts procedural geometry,
  world3d.ts streets/satellites/aggregate/universe, ThreeScene.ts owner).
  `?renderer=pixi` opts BACK to the legacy PixiJS 2D scene (both satisfy the
  `CitySceneApi` contract in scene-api.ts; CitySceneMount loads exactly one
  lazy chunk; a three init failure auto-retries pixi once). Flag logic:
  `src/lib/city/renderer-flag.ts`. Scene3d QA probe: `window.__city3d`
  (dev builds only).
- Owned avatar = building/module. Hire constructs; loss/poach removes;
  restore reconstructs. Building stage derives from current value relative
  to value_floor; the server computes it, the client only renders it.
- PLACEMENT IS DERIVED (2026-09-27 "value orbits"; SOLID BLOCK ROWS
  2026-09-30 "no chessboard" ruling, superseding the 2026-09-29
  checkerboard): the HQ core + the Six landmarks hold the center; every
  other owned building fills CLOCKWISE square rings around the HQ in VALUE
  order (priciest innermost, cheapest at the rim) — `rankArrangeTiles`
  (src/lib/city/placement.ts) over the block-row walk (`spacedOrbitOrder`
  in src/lib/city/rings.ts: every OTHER ring (ORBIT_RING_STRIDE 2) with
  EVERY tile on the ring — solid wall-to-wall block rows; the gap rings are
  continuous ring BOULEVARDS via `deriveBoulevards` in streets.ts) starting
  at ORBIT_START_RING 4 (the landmarks' 1-tile moat alone separates). A
  value change re-ranks the whole orbit on the next projection and the
  scene GLIDES moved buildings to their new ring. Locked sectors are
  skipped by the orbit walk, so the
- **Foreign cities (satellites + shared universe) mirror the home rules
  (2026-09-29)**: mini-city buildings use the same SPACED walk
  (`satelliteClusterTiles` — checkerboard, airy-first, cluster radius 7 =
  airy rings 4+7 = 44 slots) and render up to NEIGHBOR_BUILDING_LIMIT 24
  buildings (2026-09-29 "render all their buildings" ruling; beyond that
  the "+N more" plate stays — bounded rendering). All mini-city content —
  relay, the Six monuments, buildings — depth-sorts in ONE painter order
  (zIndex = tile-depth sum), and the home city renders buildings + HQ +
  monuments in the single sortable buildings layer (2026-09-29
  "landmarks appeared on top of other buildings" fix — nothing stacks
  above the towers). The universe base ring is FIXED (WORLD_BASE_RING 64
  in universe.ts, 2026-09-30 shared-universe ruling — every viewer sees
  the SAME constellation; supersedes the 2026-09-29 dynamic-per-viewer
  ruling). Each universe city ships a top-24 skyline
  (UNIVERSE_SKYLINE_LIMIT) as [tier, family] tuples.
  mission ladder still gates city growth. The persisted city_layout
  machinery (POST /api/city/layout, GET /api/city/my-layout,
  layout-merge.ts) is legacy-retained but UNUSED — /api/city/[username]
  no longer joins it, and the manual ghost/build-mode/queue UI is deleted.
- **World-map v2 (2026-10-01 "do all proposed modifications")**: (a)
  satellite mini-cities use the home city's SOLID ladder rings
  (`satelliteClusterTiles` — the 2026-09-29 airy checkerboard parity is
  DROPPED); (b) the four ring-4 civic lots render in 3D as kit buildings
  tinted per kind (`scene3d/civic3d.ts` — CIVIC_NEON, CIVIC_TINT 0.85 with
  a 0.85-gray premultiply so hues separate at overview; beacon on top;
  tier-scaled; tier 0 stays empty); (c) country connectors carry GREEN
  verges (COUNTRY_VERGE in world3d); (d) the 8 satellites' mini buildings
  render as REAL Kenney kit models (per-(prefab, profession) instanced
  pools from `planSatelliteKitMinis`; relay stays procedural; the
  procedural merged minis remain the no-kit fallback); (e) the WORLD RIVER
  (`lib/city/river.ts`): a 3-tile water band in the always-empty gap past
  the LAST populated universe ring (dynamic offset
  `riverOffsetForCities(cities)` — slides outward as rings populate;
  water plate roadTile_001; never overlaps cities/satellites by
  construction, pinned by tests).
- **Defaults while tuning (2026-10-01 user ruling)**: the city defaults to
  CLASSIC procedural art + PINNED DAYLIGHT (day) while the Kenney kit is
  fine-tuned — renderer-flag.ts `cityArtStyle()` / `cityDaylightMode()`;
  players switch via the HUD buttons (Modern/Classic, Auto/Day/Night).
- **Kenney kit v2 (2026-09-30 evening, "more variety + nicer roads")**:
  the tier ladder is 1–3 suburban / 4–7 the MID league (14 commercial
  blocks + 20 INDUSTRIAL works pooled — `pickBuildingPrefab` mixes both
  kits deterministically) / 8–14 skyscrapers. Streets render KENNEY 3D
  ROAD TILES (`public/city-assets/roadtiles/*.gltf` — roadTile_142
  straight / 043 4-way / 025 zebra; multi-primitive prototypes in
  `CityKit.roadTiles`, instanced PER MATERIAL in `ThreeScene.syncStreets`;
  zebra accents on intersection approaches; the procedural asphalt grid
  stays the fallback). Road-tile materials are dimmed at load (×0.62,
  Stone ×0.45) so the day sun + bloom don't blow them out. Traffic lights
  (`roads/traffic-light`) instance at a parity subset of cross tiles
  (cap 48). The /catalog page renders the REAL 3D kit via offscreen
  WebGL shots (`BuildingsCatalogMount`) using the SAME recipe functions
  and the shared HQ/monument constants exported from assets3d.
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
- **Building art is ONE procedural system in two leagues over the 14-level
  progression ladder (2026-09-29 pixel-sheet retirement, user ruling)**:
  `buildingTier` clamps to 1..14 (1×–8192×+ of value_floor). TIERS 1–7 render
  the CIVIC vector architecture (art.ts modular family stack + shared tier
  features); TIERS 8–14 render the GRAND league — each family's bespoke
  `drawGrand()` megaform (self-contained spectacular architecture, one more
  elaboration per tier, `step = tier − 8`; chroma glass mixes the neon accent
  into the mass via `mixRGB`). The HQ core and the Six monuments render
  procedural value-stage elaborations for ALL THREE stages (stage 2–3 are
  taller crowned forms, not separate assets). The DOM card preview
  (components/city/BuildingSprite.tsx) is an SVG echo of the same two leagues
  for every tier, and goddess cards show their monument echo.
- **The generated pixel atlas is RETIRED** (2026-09-28→2026-09-29): the
  49 PNG sheets, `scene/pixel-art.ts` loader, `city-pixel-art.generated.ts`
  manifest, `pixelVariantOf` variant module, its test, the
  `gen:city-pixel-art` script and the `/city/pixel/` proxy bypass are all
  DELETED — do not reintroduce sheet-based building art; extend art.ts /
  landmarks.ts instead. Day/night = authored state pairs: grass terrain plate
  (day/night in IsoWorld) + concrete platforms (day/night pair in art.ts) +
  lit-window glow dimming (`facadeGlowAt`) + scoped soft-lift filters for the
  hero bodies (HQ/monuments/aggregate). There is NO global day ColorMatrix —
  add authored day/night pairs to new elements instead of reintroducing one.
  **Animated lights + facade detail (2026-09-29 evening "more details, more
  light animation" pass)**: the lit-window mosaic (civic league) renders at
  EVERY LOD — it is the building's light identity, not close-LOD texture
  (dark insets/mullions/micro-props stay close-LOD); the mosaic splits into
  two seeded channels that the light clock dims out of phase
  (`windowFlickerAt` — occupancy churn), beacons are seeded red/white with a
  second strobe at tier 6+, civic towers tier 2+ carry a descending edge
  data-pulse (`edgePulseAt`), grand megaforms keep the ascending rise dot,
  and every building has the warm `drawEntranceGlow` lobby at its base. All
  animation stays alpha/position-only on the quantized light clock
  (lights.ts) — never per-frame redraws.
  All art is original code-plotted work; never feed copyrighted game assets
  into the pipeline.
- Economy-touching city work follows: map paths → state invariants → review
  by n38worth-game-systems (formulas/milestones/goddesses) and
  security-reviewer (auth/ownership/races) → image-analyst for major UI
  states. Tests before economy-logic changes (framework TBD — the repo
  currently has none).
