# GAME INTEGRATION STUDY

**What kind of game can be layered onto n38worth's "collect things + steal from others" core — besides the SimCity-style city trial?**

- Date: 2026-10-01
- Status: STUDY ONLY. Nothing implemented, nothing committed, no economy touched.
- Method: (1) full mechanics inventory of the live game from source (formulas + file refs, §2);
  (2) 2025–26 market precedent research on the "collect + steal" genre family (§4);
  (3) candidate genre blueprints scored against the repo's own invariants (§5–§7).

---

## 1. The question, framed

The current game is, mechanically, a **stock market of people**: you acquire players as
cards, their value compounds, owned cards pay rent, and anyone can poach a card you own by
paying its price — unless you've locked it. The city layer (2026-09/10) made the portfolio
*visible* but added no new verbs.

The question is which **new game verb families** integrate cleanly: a layer that reuses the
existing economy (credits-only), the existing protections, the existing crons/Pusher/chat,
and the city as its stage — without forking the economy or violating the derived-layer
invariants in AGENTS.md.

---

## 2. The game today — mechanics anatomy (from source)

### 2.1 Core numbers

| Mechanic | Rule | Where |
|---|---|---|
| Acquire cost | `value × max(1, leaseHours)` — 1× value per lease-hour, no poach premium | `purchaseCore.ts:134-142` |
| Value growth on acquire | ×2.0 (<1k) / ×1.75 (<10k) / ×1.5 (<100k) / ×1.25 (<1M) / ×1.1 (≥1M) | `purchaseCore.ts:15-21` |
| Purchase payout | card gets 100% of cost; previous owner gets 100% **+1% per card they hold** → **~200%+ of the price is minted per purchase** | `purchaseCore.ts:256-260` |
| Renovate (pump) | cost = 100% of value; value ×2; 100% paid to the card; +10 min deed lock per press (12 h cap) | `pumpPlayer.ts` |
| Deed lock extend | cost = 100% of value; value +10%; 90% to card; +1 h lock (Notary ×1.5; 12 h cap) | `purchaseCore.ts:888-975` |
| Iron deed (perm lock) | free 24 h on the first 10 NPC acquires per player | `purchaseCore.ts:25-26,358-374` |
| Foreclose (break lock) | fee = `ceil(hoursLeft) × value` (1000× vs Fate holder; free for War holder; −20% Auctioneer); fee paid to the owner | `purchaseCore.ts:722-871` |
| Rent | **0.2%/h of portfolio value** (paid :00 for everyone, :30 for Time-power holders); boss tax 10% | `portfolio-reward` cron |
| Combo (Development) | 6 owned cards, 6 distinct professions → payout **Σvalues × 10**; cards reset to floor; +50 slots first time | `comboCore.ts:117-118` |
| Land Grab (mass hire) | unlocked at 50 cards; per press hires up to `1 + 10% of owned` cheapest (+1 Prospector) | `mass-hire.ts:197` |
| Missions (permits) | one ladder at 20/50/100/250/500/1000/2000/5000(+1000×wins) owned cards; each: +50 slots + a Founder card (purchase-locked until won) | `missions-data.ts:32-81` |
| Win condition | hold all six Founders → **60-min Root Sequence**; steal cancels (2-min grace); win → world reset (accounts keep; ownership wiped; credits→100) | `goddess-countdown.ts` |
| Ranks | 4 ladders × 10 tiers (Grid / Credits / Value / Portfolio) | `ranks.ts` |
| Caps | player value ≤ 1e12; credits ≤ 2^53−1 | `safeguards.ts` |
| Boss tax | players with a boss who own 0 cards pay 1% of credits/h | `boss-tax` cron |
| Offline decay | only portfolios > 500 cards shed cards when offline | `ownershipDecay.ts:57-66` |

### 2.2 Reusable infrastructure a new layer can stand on

- **Crons**: Bearer-secret GET routes in `vercel.json` (12 active); `game_settings` KV table
  for cross-request state; in-memory dedupe guards.
- **Pusher**: `player-{id}`, `market`, `game-global` channels with ~20 event types already
  in production (`market-events.ts`, `pusher-client.ts`) — a real-time event/raid feed needs
  **zero new infrastructure**.
- **Chat/DMs**: in-app global chat + DM system with game-event receipt inserts (7 sites).
  (OnlyHumans relocation is still study-only — `ONLYHUMANS_CHAT_STUDY.md` not implemented.)
- **City layer**: read-only derived projection (`/api/city/[username]`), 14-tier building
  ladder, protection visuals, satellites, shared universe — a free **stage** for any new
  layer's visuals.
- **Rank snapshots**: `user_rank_snapshots` every 10 min — ready-made settlement oracle for
  anything that resolves on leaderboard state.

### 2.3 Dead/disabled machinery that is actually an opportunity

| Asset | State | Opportunity |
|---|---|---|
| `leaderboard-prizes` cron | runs hourly, computes 6 boards, **pays `prize: 0`** — all payout code intact but zeroed | revive as the payer for event/raid prize pools |
| `/api/cron/agent` (goddess AI) | route exists, cron entry removed 2026-08-21 | re-enable **event-window-only** as scripted boss behavior (§5G) |
| `multi-account-warning` events | live | anti-abuse rail for any PvP/raid layer |

### 2.4 What the core loop is MISSING (the integration surface)

1. **No suspense moment.** Every action is deterministic price math. The decade's most
   profitable loop (Coin Master / Monopoly Go) is built on the randomized steal *reveal*.
2. **No trading.** Cards are unique people — nothing is swappable, so no sticker-trading
   social glue (Monopoly Go effectively "outsourced its retention" to sticker trading).
3. **No compositional value.** Beyond one combo (6 professions), card *composition*
   doesn't matter; cheap cards are dead weight (tier-1 art, no role).
4. **No cooperation.** 100% solo + faceless PvP. No allies, no shared goals.
5. **Slow session pacing.** Rent 30 min, login reward 24 h, mission thresholds far apart —
   long dead zones with nothing to *do*.
6. **Structural inflation.** Each purchase mints ~2× its price; sinks are few (goddess
   extension burn, 10%-of-credits slot/reveal purchases). A new layer should add **sinks**.
7. **Revenge isn't productized.** Being poached stings, but there's no nemesis loop, no
   bounty, no "who raided me" feed.

### 2.5 Pre-existing bug found during the inventory (unrelated to this study)

`purchaseCore.ts:23` grants **30 s** of deed lock per lease-hour, while its supposed
duplicate `purchasePlayer.ts:23` grants **3 min** — the two purchase paths have drifted and
are NOT identical despite the comment claiming so. Worth a fix pass whenever purchase code
is next touched.

---

## 3. Hard constraints (from AGENTS.md rulings — non-negotiable)

1. **Credits are the only currency.** No tokens, tickets, gems, or second economy.
2. **Derived-layer principle.** The city projects the economy; a new game layer must not
   become a second simulation. New *state* must be additive (new tables OK; forks of
   economy formulas are not).
3. **No realtime game server.** The stack is request → cron → Pusher (one-way). Any new
   layer must be **asynchronous or turn-based**. No twitch/skill modes.
4. **Mission ladder stays the growth spine** — ownership milestones gate growth; a new
   layer must not bypass it with parallel power progression.
5. **Invariant safety**: portfolio formula (owned × max(ownerCount,1), own value excluded),
   `MAX_PLAYER_VALUE` / `MAX_CREDITS` clamps at every new value-growth site, race-safe
   writes (the combo-exploit history is the cautionary tale — `comboCore.ts:16-21`).
6. **Cost discipline**: no new tight crons without approval; prefer Pusher events over
   polling; public GETs CDN-cached, per-user routes never `s-maxage`.
7. **i18n**: every user-visible string in en+zh (`TranslationKeys` build-gated), vocabulary
   consistent with the city metaphor bible (`CITY_REBRAND_STUDY.md` §2).
8. **Process**: economy-touching work → tests first → `n38worth-game-systems` +
   `security-reviewer` gates.

---

## 4. Precedent map — where "collect + steal" printed money in 2023–2026

| Ingredient | Coin Master (Moon Active) | Monopoly Go (Scopely) | Steal a Brainrot (Roblox, 2025) | **n38worth today** |
|---|---|---|---|---|
| Collection | cards (duplicates) | sticker albums (seasons) | brainrots, rarity tiers | player cards (unique) ✅ |
| Income engine | spins → coins | dice → rent | brainrots generate $/s | **rent 0.2%/h** ✅ |
| Steal | raids on other villages | Shutdown / Bank-heist minigame | physically raid others' bases | poach at full price ➖ (no luck, high cost) |
| Protection | shields (max 3) | — (victim awareness) | base defense vigilance | **Deed Lock / Iron Deed** ✅✓ |
| Suspense moment | slot spin + raid dig | dice + heist minigame | grab timing | ❌ **none** |
| Build identity | village | landmark boards | base | **3D city layer** ✅✓ |
| Trading | ❌ | **stickers — the retention core** | trading meta | ❌ none |
| Social graph | Facebook friends | Facebook friends | servers/strangers | chat + DMs ➖ |
| Live events | seasons | albums, Golden Blitz | **12.8M-CCU concert**; 25.8M CCU peak | Root Sequence ➖ |
| Energy gate | spins | dice | none | none (credits gate) ✅ keep |

Headline numbers: **Monopoly Go crossed $6B lifetime IAP in 2025, the fastest mobile game
ever to the mark (~1,275 days)** — its retention core is exactly steal/raid + seasonal
sticker trading. **Steal a Brainrot set the all-time concurrency record for any game,
25.8M CCU (Oct 11, 2025)** — its loop is literally "collect income-generating characters,
steal them from other players' bases, defend your own". **Coin Master** (multi-$B/yr since
2019) validated shields + raids + village progression as a mass-market loop.

The other side of the ledger — the closest *ancestor* of n38worth itself: **Empire
Avenue** (2010–2015, virtual stock market of people, shut down) died of gamification
fatigue and a circular economy with no sinks and no play verbs beyond holding. Lesson
directly relevant here: **"owning people-stock" alone is not a game; the verbs around it
(raid, trade, cooperate, compete) are.**

Also relevant: **asynchronous auto-battlers** (TFT mobile, Hearthstone Battlegrounds,
The Bazaar, Super Auto Pets) proved collection-vs-collection PvP works without live
matchmaking — you fight snapshots of real players. That pattern fits this stack
perfectly (no realtime server needed, §5D).

**Read of the table:** n38worth already has ~70% of the most profitable casual formula of
the decade (income + steal + shields + city identity). What's missing is precisely the
list in §2.4: the suspense moment, the trading glue, cooperative verbs, and productized
revenge. That is the integration surface — no genre needs to be invented.

---

## 5. Candidate genre layers (blueprints)

Each: concept → precedent → how it maps onto existing code → economy impact → risks →
effort (S <1wk, M 1–3wk, L 3wk+) → verdict.

---

### A. VAULT RAIDS — the social-raiding layer (Coin Master/Monopoly Go pattern)

**Concept.** A second, *luck-flavored* steal verb alongside the premium deterministic one
(poaching). Players get **3 raid charges/day** (cron-granted, hoard cap 6). A raid targets
another player's **vault**: a short server-seeded multi-step reveal (e.g. "3 locks, pick
the drill order") that determines loot. Loot = **a % of the target's liquid credits**
(small, capped) **+ standing bounty pool credits**. Deed-locked cards' value counts as
**vaulted** — untouchable — which finally gives deed locks a *defensive-wealth* meaning
(they currently only guard poaching). Victims get a Pusher event, an attacker identity in
the feed, and a **free counter-raid charge** (the revenge loop). The city shows a cracked
vault / repair animation — derived from the raid log, no new economy state.

**Precedent.** Coin Master raids + shields; Monopoly Go Shutdown/Bank Heist; Steal a
Brainrot's whole identity. This is the single most financially proven loop in casual.

**Mapping.** Charges: one small table or `game_settings`; resolution: pure server RNG +
audit row; feed: existing `event-feed` + `player-{id}` Pusher; visuals: city protection
layer already renders per-card locks. Targets picked from the existing market/satellite
list (already exposes "who owns what").

**Economy.** Net-neutral-to-sink if raid entry burns a fee and mint is bounded by a
cron-sized pool; victim loss is capped (e.g. ≤1% of liquid credits, floor-protected so
newbies never bleed). Credits-only ✅.

**Risks.** Non-consensual loss aversion is potent but dangerous — caps + insurance via
locks are mandatory; alt-farming of the pool (gate payouts on `visible` accounts, reuse
multi-account flags).

**Effort: M.** **Verdict: STRONG — the flagship recommendation.** It supplies the missing
suspense moment (§2.4-1) and the revenge loop (§2.4-7) in the genre the market just
validated at $6B and 25M CCU.

---

### B. THE CONTRACT BOARD — bounties on other players' cards (EVE-style contracts)

**Concept.** An escrowed public bounty board: *"2M ¢ to whoever forecloses card `X` from
owner `Y`"* or *"`Z` ¢ if card `X` is in MY portfolio within 48 h."* Anyone posts (credits
escrowed server-side at post time); anyone takes; the contract auto-settles inside the
existing purchase/foreclose flows (a post-success hook in `purchaseCore`). Also the
inverse: **protection contracts** ("standing fee for first warning when someone peeks my
off-market cards"). This makes the *already-possible* poach economy legible, social, and
narrative ("someone is paying to have you broken") without changing a single price.

**Precedent.** EVE Online's contract/mercenary culture (the famous heists were social
engineering through exactly this kind of layer); bounty systems in Browser Mafia-wars
lineage games.

**Mapping.** One `contracts` table + board UI + a settle hook in the two purchase paths +
Pusher notify + DM receipt insert (pattern already exists ×7). No new formula.

**Economy.** Zero new mint — escrow moves existing credits. The safest possible layer.
**Effort: S–M.**

**Risks.** Griefing-by-bounty on newbies (cap targets to `visible`, value-tiered);
contract spam (listing fee burn = small sink).

**Verdict: STRONG — build FIRST.** Cheapest, purely additive, and it *productizes* the
game's existing identity (stealing) instead of adding a new one.

---

### C. CREW JOBS — PvE heists on the Founders' vaults (composition finally matters)

**Concept.** Six rotating PvE heists (one per Founder): *"Break the Banker's vault."*
Entry requires a **crew assembled from owned cards** with composition gates (≥1 Vault
Keeper, crew value ≥ 50k, etc.). The run is a 3–5 step seeded event chain (choices +
rolls derived from crew stats — professions, tiers, purchaseCount as experience). Payouts
come **from the boss-tax pot** (recycling today's 1%-of-idle-players tax into a prize
pool — poetic and zero-mint). Crew cards earn **crew XP** (additive column) unlocking
cosmetic flair in the city. A roguelite "site inspection" mode for mid-game missions can
be folded into this engine later.

**Precedent.** Payday/Ocean's crew-composition fantasy; heist events in Mafia-lineage
games; PvE boss events in every successful live-service game.

**Mapping.** Event engine = new module + content JSON; XP = additive column; payout cron
reuse; Pusher `game-global` for job board rotation; city = crew staging visuals (derived).

**Economy.** Credits-only; prize pool bounded by the tax pot (a true **recycling sink**).
Fixes gap §2.4-3: cheap low-tier cards become crew material → the long tail of the
collection gains utility.

**Risks.** Content treadmill (author 6 chains, rotate them); exploit surface on
resolution RNG (server-seeded, audit-logged).

**Effort: M–L.** **Verdict: STRONG — phase 2.** It adds the missing *cooperative-ish,
sessionable* play and the collection depth.

---

### D. CREW BATTLES — asynchronous auto-battler over the collection

**Concept.** Pick 5 cards as a **defense lineup**; attack other players' lineups
**asynchronously against their snapshot ghost** (no lockstep, no realtime server).
Combat is a deterministic-sim-with-seed rendered as a bounded CSS/SVG instant replay:
professions = synergies (Notary repairs shields, Renovator buffs, Prospector scouts the
enemy backline…), and power = the **city's own 14-tier ladder formula** (value/floor
log2) reused as the combat tier. Entry fee = burn sink; prizes = credits; weekly ladder
rides the existing `rank-snapshot` machinery.

**Precedent.** TFT mobile / Hearthstone Battlegrounds (collection → synergy battles;
cosmetic-first monetization), The Bazaar / Super Auto Pets (async ghosts proven on
web/PC), GameRefinery's async-PvP-for-casual pattern.

**Mapping.** Ghost snapshots: one table written on lineup save; combat: pure function +
seed (unit-testable, satisfies the tests-first rule); replay: bounded DOM/SVG animation
(respects the "restrained transitions" ruling); ladders: `user_rank_snapshots` pattern.

**Economy.** Credits-only; fees burned; whale dominance mitigated by **value-band
brackets** (fight within your band → cheap-card crews have their own meta — also fixes
gap §2.4-3).

**Risks.** Balance treadmill is the worst of all candidates; PvP fairness perception
(Hearthstone Battlegrounds' functional-advantage backlash is the cautionary tale — keep
any purchasable edge out).

**Effort: M–L.** **Verdict: GOOD — phase 3**, after A/B/C establish the layer stack. The
deepest "skill-ish" expression the stack can support.

---

### E. BLUEPRINT ALBUMS + TRADING — Monopoly Go's sticker glue, city-flavored

**Concept.** Game actions drop **city-blueprint fragments** (acquire → residential,
renovate → commercial, foreclose → industrial, mission → civic, raid → vault art; weighted
drop tables off existing actions). Seasonal albums; duplicates are **tradable** through an
escrowed DM trade (the ONLY trading surface — player cards stay unique and non-tradeable,
preserving the poach economy). Set completion rewards: **cosmetic city props** (plaza,
park, statue, monorail — pure derived visuals), titles, +slots. Art is generated by the
existing procedural system — near-zero art budget.

**Precedent.** Monopoly Go sticker economy — the documented mechanism by which Scopely
"outsourced retention" to players trading with each other; seasonal albums across all
top-grossing casual games.

**Mapping.** Drops: additive table written inside existing action cores (the audit-log
pattern); trades: escrow route + DM receipt (pattern exists); rewards: city prop flags in
the derived projection (visual only — invariant-safe).

**Economy.** Drop tables must be sink-neutral (no credit minting); trading escrow is
zero-mint; cosmetic rewards carry **no power** (mission ladder stays the spine).

**Risks.** Trade scam surface (escrow server-side, no direct transfers); album inflation
over seasons (retire sets).

**Effort: M.** **Verdict: STRONG — phase 2–3.** The proven retention glue; uniquely cheap
here because the procedural art system already exists.

---

### F. SYNDICATES & DISTRICT CONTROL — the guild layer

**Concept.** Player alliances (cap ~30). Weekly season: each city **district** (sectors
already exist via the mission ladder / universe rings) is held by the syndicate with the
highest aggregate **portfolio-growth delta** (growth, not absolute — whales can't
permanently capture everything). Holding grants *small* buffs (e.g. +5% rent for members,
district flag + color-wash visuals in the city) plus a shared syndicate vault (defense
fund, intra-syndicate gifting — credits only).

**Precedent.** Guild wars are the #1 long-run retention driver in mobile (Clash lineage,
Monopoly Go partner events); territory control is the classic endgame.

**Mapping.** New tables + one weekly cron; buffs must thread through `portfolio-reward`
(invariant review required); city visuals derived from ownership flags.

**Economy.** Buffs are the first candidate that **modifies an economy formula** — highest
invariant risk of all candidates; keep them tiny and review-gated.

**Risks.** Alt-syndicates, whale capture, collusion; the heaviest live-ops commitment.

**Effort: L.** **Verdict: LATER — phase 4.** The retention king, but only after A–D prove
the stack; do not open with guilds.

---

### G. FORECLOSURE DAY — server-wide raid events (revive the dead machinery)

**Concept.** A monthly server event: a Founder's bank (NPC entity) has a shared HP bar =
f(server portfolio). Every renovate/foreclose/raid on event-tagged targets chips it;
server-wide milestones unlock **payout waves** (bounded mint) to all participants. Climax:
world-bank breach → a fast Root-Sequence-style finale. This is where the **dead
`leaderboard-prizes` cron** (payout code intact, `prize: 0`) becomes the event payer, and
where the **disabled goddess AI cron** can run *event-window-only* as scripted boss
behavior. Pusher `game-global` drives the shared bar in real time.

**Precedent.** World bosses across every live service; Roblox-scale live events (the
12.8M-CCU concert) show the ceiling for shared spectacle; n38worth's own Root Sequence is
already a proto-version of this.

**Mapping.** Nearly everything exists: event flag in `game_settings`, a cron, Pusher
broadcast, prize revival, agent-cron re-enable behind a window flag.

**Economy.** Mint bounded by the event pool; **adds the game's first genuinely
cooperative goal** (gap §2.4-4) with the smallest possible effort.

**Effort: S–M.** **Verdict: STRONG — early.** Highest leverage-per-effort in the study:
it revives two pieces of dead infrastructure and adds cooperation in one move.

---

### H. INSIDER TIPS — a light prediction market

**Concept.** A daily parlay: bet credits on leaderboard movements ("who's top-3 Portfolio
at the :00 snapshot?", "will a Root Sequence complete today?") settled by the
already-running 10-minute `rank-snapshot` oracle.

**Precedent.** Fantasy-stock mini-games; the "stock market of people" identity itself.

**Risks.** Players can move the quantities they bet on (whale insider-trading IS thematic
but abusable) — needs tiny bet caps and settlement on quantities no single player
controls. Finance vocabulary doubles the i18n surface. Deep derivatives (shorting cards,
options) are explicitly **out**: too abusable, too heavy.

**Effort: M.** **Verdict: NICHE — fold a light version into G's event framework later;
don't build standalone.**

---

### I. Roguelite permit runs — folded into C

Standalone choose-your-cards text runs duplicate Crew Jobs' engine with less payoff. Fold
into C as the mid-game "site inspection" mode. **Not a separate candidate.**

### J. Live auctions & raffles — folded into G

A weekly timed auction (bid escrow, snipe protection) of one unique cosmetic city prop or
a seasonal Founder-for-a-day card is cheap fun, but it's a *feature*, not a layer. Build
inside the event framework (G). **Not a separate candidate.**

---

## 6. Scoring matrix

Scores 1–5 (5 best). *Economy safety* = low risk of invariant/balance damage;
*Newbie safety* = can a day-1 player participate without being farmed.

| # | Layer | Retention | Social glue | Suspense | Econ. safety | Newbie safety | Infra reuse | Effort | Live-ops |
|---|---|---|---|---|---|---|---|---|---|
| A | Vault raids | 5 | 4 | 5 | 3 | 3 | 4 | M | M |
| B | Contract board | 4 | 5 | 2 | 5 | 4 | 5 | S–M | L |
| C | Crew jobs (PvE) | 4 | 3 | 3 | 4 | 5 | 3 | M–L | **H** |
| D | Crew battles (auto-battler) | 4 | 3 | 4 | 3 | 3 | 3 | M–L | H |
| E | Blueprint albums + trading | 5 | 5 | 3 | 4 | 5 | 4 | M | M |
| F | Syndicates / districts | 5 | 5 | 2 | **2** | 2 | 2 | 2 | **L→H** |
| G | Server raid events | 4 | 5 | 4 | 4 | 5 | **5** | **S–M** | M |
| H | Insider tips | 2 | 2 | 3 | 2 | 2 | 4 | M | M |

---

## 7. Recommended roadmap

**Phase 1 — "Make stealing a *moment*" (B + G).** The contract board (S–M, zero-mint,
purely additive) plus Foreclosure Day (S–M, revives dead prize + agent machinery). Both
are cheap, both deepen the *existing* identity instead of adding a new one, and G is the
game's first cooperative verb.

**Phase 2 — The flagship genre layer (A + E).** Vault raids supply the luck/suspense/
revenge loop the $6B-and-25M-CCU formula runs on; blueprint albums + escrowed trading
supply its retention glue. Deed locks become true shields. City renders the whole story
(cracked vaults, repair crews, album props) as pure derived visuals.

**Phase 3 — Depth (C, then D).** Crew jobs make the long tail of the collection useful
(recycling the boss-tax pot as prizes); crew battles add the skill ceiling via async
ghosts and value-band brackets.

**Phase 4 — Scale (F).** Syndicates and district control, only after the stack is proven —
it's the heaviest and the only candidate that modifies an economy formula.

**Cross-cutting:** every phase is credits-only, async, mission-gated for power, fully
i18n'd, and rendered through the derived city. Tests + game-systems/security gates before
each economy touch.

---

## 8. Anti-patterns — what NOT to integrate

1. **Energy gates on the core loop** (spins/dice). Credits already pace the game; adding
   energy would F2P-ize a wealth game and monetize against its identity.
2. **A second currency** of any kind (raid tokens that buy power, premium drafts…).
   Violates the credits-only invariant at the design level, not just the code level.
3. **Direct card-for-card trading.** Cards are unique people and the poach premium is the
   economy's engine; only cosmetic duplicates (E) are tradeable.
4. **Realtime skill/arcade modes.** No game server, one-way Pusher, polling-based clients.
   Async ghosts (D) are the correct ceiling.
5. **Crafting/grind professions** (gather → combine loops). Content treadmill with no fit
   to the fantasy; the professions system already exists and is gated correctly.
6. **Power rewards outside the mission ladder.** Any layer granting slots/value/income
   directly creates a parallel progression spine and breaks invariant §3-4.
7. **Cash-out/NFT paths.** The Empire Avenue lesson: when the currency faces the real
   world, the circular economy collapses into speculation and dies.

---

## 9. Open rulings needed from the user

1. **Raids on liquid credits — yes/no?** The biggest fork in A: can a raider take a
   (capped) % of a victim's actual credits — real loss aversion, Coin Master-style — or
   only minted pool money? My recommendation: yes, but ≤1% of liquid, deed-locked wealth
   untouchable, floor-protected.
2. **Cooperative touching ownership?** Lending cards for crew jobs (C) creates
   pseudo-ownership state. My recommendation: credits-only cooperation in v1; defer lending.
3. **Revive `leaderboard-prizes` payouts?** G assumes it (currently `prize: 0`). The cron
   already runs — paying real (bounded) prizes costs only mint budget, not infra.
4. **Vocabulary slot** for the new verbs in the city metaphor (en+zh): raid →
   "HEIST / 夜袭"? contract → "CONTRACT / 契约"? Decide before copy is written, then keep
   it consistent with `CITY_REBRAND_STUDY.md` §2.
5. **Fix the purchase-drift bug** (§2.5) before any layer touches purchase flows.

---

## 10. Sources

- [Scopely — Monopoly Go hits $6B in record time](https://www.scopely.com/en/news/sensor-tower-scopelys-monopoly-go-hit-6-billion-revenue-milestone-in-2025-in-record-time)
- [GameDev Reports — Monopoly Go crosses $6B](https://gamedevreports.substack.com/p/sensor-tower-monopoly-go-crossed)
- [The Why of Play — Monopoly Go design deep dive](https://thewhyofplay.com/2024/08/23/monopoly-go-a-design-deep-dive/)
- [Tech Insider — Monopoly Go's sticker economy](https://tech-insider.org/monopoly-go-sticker-economy-mobile-monetization/)
- [GameAnalytics — How Coin Master disrupted social casino](https://www.gameanalytics.com)
- [PocketGamer — Coin Master monetization (shields/raids)](https://pocketgamer.biz)
- [Wikipedia — Steal a Brainrot (25.8M CCU record)](https://en.wikipedia.org/wiki/Steal_a_Brainrot)
- [Polygon — Steal a Brainrot records](https://www.polygon.com/fortnite-steal-a-brainrot-concurrents-peak-records-roblox-who-makes-it/)
- [Wikipedia — Empire.Kred (ancestor, closed 2015)](https://en.wikipedia.org/wiki/Empire.Kred)
- [Deconstructor of Fun — TFT billion-dollar teardown](https://www.deconstructoroffun.com/blog/2020/7/19/how-riot-can-turn-teamfight-tactics-into-a-billion-dollar-game)
- [In An Age — Hearthstone (Battlegrounds) monetization](https://inanage.com/2024/03/29/hearthstone-evolving-monetization/)
- [GameRefinery — async PvP in casual games](https://www.gamerefinery.com/4-great-examples-pvp-modes-casual-games/)
- Repo-internal: `AGENTS.md`, `CITY_REBRAND_STUDY.md`, `ONLYHUMANS_CHAT_STUDY.md`,
  `src/lib/purchaseCore.ts`, `src/lib/comboCore.ts`, `src/lib/missions-data.ts`,
  `src/lib/goddess-countdown.ts`, `src/app/api/cron/*` (inventoried 2026-10-01).
