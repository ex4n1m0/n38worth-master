# City Building Rebrand Study — "The City Building Simulation"

Date: 2026-09-29 · Status: PROPOSAL (awaiting go-ahead; nothing implemented)

This is the deep assessment + naming bible for rebranding n38worth away from the
sci-fi/Matrix-computer theme onto a full **city building tycoon** theme, slogan
**"The City Building Simulation"**. It inventories every user-facing surface,
maps each game mechanic to city vocabulary that matches what the code actually
does, and proposes new English + 简体中文 text for everything.

Architecture reminder: this rebrand is **display-layer only** (same trick as the
2026-09 sci-fi rebrand). DB usernames, `users.profession` values, API paths,
Pusher events, cron routes, i18n KEY names, and code identifiers never change.
The dictionary (`src/lib/i18n.ts` + `src/lib/i18n-keys/{en,zh}/*.json`), the
display helpers (`display-names.ts`, `professions.ts`, `ranks.ts`,
`missions-data.ts`, `goddesses.ts`), page metadata, and art assets are the
surfaces that change.

---

## 1. Where the current copy stands (audit)

The city rebrand is already ~70% done in the dictionary: "buildings", hire
slots, skyline, sectors, districts, catalog. The Matrix layer survives in six
clusters:

| Cluster | Where it lives | Size |
|---|---|---|
| **Win condition** (mainframe / root / reboot / Root Wall / the Six / goddess) | `missions-goddesses.json`, `leaderboard-ranks.json`, `misc-meta.json`, `city-world.json` (ROOT SEQUENCE), `WorldRebootingOverlay`, `HallOfChampions` | ~50 keys |
| **Power actions** (OVERCLOCK / FIREWALL / BREACH / HARD LOCK / SCAN / CLOAKED / Reveal / War Delete / Steal / Sell Out) | `action-buttons.json`, `market-cards.json`, `ownership-home.json`, `leaderboard-ranks.json`, `city.json` | ~80 keys |
| **Vocabulary helpers** (the Six display names, 6 professions + "Firmware Perks", 40 rank rungs, 8 mission labels) | `display-names.ts`, `professions.ts`, `ranks.ts`, `missions-data.ts`, `goddesses.ts` | ~120 strings |
| **Landing / meta / art** ("city trading simulation", "Jack into the simulation", `matrix` keyword, `/simulation.webp`, `MatrixRain`, `/reboot.webp`, `VW_Icon.png` terminal favicon, `og.jpg`) | `i18n.ts:81-134`, `layout.tsx:17-41`, `page.tsx`, image routes | ~20 strings + 8 assets |
| **Server-authored English shown raw** (168 API `error:` literals, 6 system-DM writers, `triggerGameReset` broadcast, multi-account pusher text) | `src/app/api/**`, `src/actions/**`, `src/lib/multi-account.ts` | ~15 theme-bearing |
| **City layer leftovers** ("Mainframe City", "Boot Sector", "Simulation time", "SIGNAL LOST", "Root Sequence", "in orbit", "Shared universe") | `city.json`, `city-world.json` | ~25 keys |

Dictionary totals: 1,090 keys (en = zh, enforced by `TranslationKeys`);
**307 keys match theme vocabulary** and will be rewritten, plus ~60 landing/
tutorial/guide keys refreshed for voice. Zero keys are added/removed, so the
type guard and all call sites stay intact.

Known **copy bugs** to fix in the same pass (found during the audit):
1. Tutorial step 6 describes a combo mechanic that doesn't exist ("own 4+ of
   the same kind to arm a combo") — the code is *6 distinct trades, one-shot
   10× sale*.
2. `offlinePenaltyBody` says "lose 1% credits" — the code *releases cheapest
   NPC buildings* on a tiered schedule.
3. `boost-card` DM starts with a corrupted emoji byte (`�️`).
4. `landingCountdownSuffix` zh value is an empty string.
5. `leaderboardPrizeDesc` says "every 10 minutes"; the cron is hourly.
6. Register page has ~12 hardcoded English strings bypassing the dictionary;
   `ChatRoom` placeholder/arias and `(game)/layout.tsx` "Loading..." too.
7. `fate-seal` route comment says "runs every minute" (cron is `*/5`).

---

## 2. Mechanics → city vocabulary (the naming bible)

Every row below matches what the code actually does (verified against
`purchaseCore.ts`, `pumpPlayer.ts`, `blockSell.ts`, `comboCore.ts`,
`mass-hire.ts`, `perm-block/route.ts`, crons).

| Current | Proposed EN | Proposed ZH | Mechanic it must explain |
|---|---|---|---|
| The City Trading Simulation (slogan) | **The City Building Simulation** | 城市建造模拟 | New slogan, all surfaces + og.jpg |
| Hire / GET (action) | **ACQUIRE** / **BUY** | 收购 / 买入 | Pay a building's value; it joins your city; its value rises; previous owner + the building get paid |
| hire / hiring (in prose) | acquire | 收购（文中用法） | — |
| hire slots | **land plots** (plots) | 地块 | Cap on simultaneous holdings; missions +50; buy +10 |
| credits (¢) | **capital** (¢) | 资金 | Sole currency; keep the ¢ symbol everywhere |
| boss | **landlord** | 房东 | Whoever owns your card |
| Boss Tax (hourly 1%) | **rent** | 租金 | Bossed players who own 0 buildings pay 1% of credits hourly to the landlord |
| Portfolio Tax (10%) | **management fee** | 管理费 | Your landlord skims 10% of your rent income |
| Portfolio Reward (0.2%/h) | **rent collection** (collect rent) | 收租 | Hourly income = 0.2% of holdings value |
| portfolio | portfolio (en unchanged; real-estate standard) | 物业 / 物业总值 | Owned buildings' aggregate value (formula untouched) |
| value / 身价 | value (flavor: "appraisal") | 估值 | A card's price tag; building value 建筑价值 already fine |
| OVERCLOCK | **RENOVATE** | 翻新 | Owner-only; costs 100% of value, doubles it, 90–100% paid to the building, +10 min deed lock |
| Self-Overclock | Self-Renovate | 自我翻新 | Same, on your own card |
| FIREWALL / sell block | **DEED LOCK** | 契锁 | Owner-only; costs 100% of value, +10% value, +1 h protection per press (12 h cap); blocks hostile acquisition AND your own development sale/discard |
| HARD LOCK / perm block | **IRON DEED** | 铁契 | 24 h, NPC buildings only, max 10, moveable, unbreakable even by foreclosure; first 10 NPC acquisitions get one free |
| BREACH / break partnership | **FORECLOSE** | 法拍 | Pay hours×value fee (−20% Auctioneer, free with The Wrecker, 1000× vs sealed deeds) to break a rival's deed lock and take the building; fee goes to the holder |
| partnership | **leasehold** (a protected holding) | 租约持有（文中简称“租约”） | An ownership row under an active deed lock |
| CLOAKED | **OFF-MARKET** | 未挂牌 | Buildings with no owner show a masked photo |
| Reveal (1 h, owner) | **OPEN HOUSE** | 开放参观 | Owner-only; 100% of value cost, +10% value, +1 h public photo per press |
| Reveal on Network (1 min) | **QUICK VIEW** | 快速看房 | Anyone; 10% of value (20% if locked); free with The Surveyor |
| Mass Reveal | **GRAND OPENING** | 盛大开业 | Reveal your whole portfolio for 10 min (10× value each + fee) |
| SCAN (bonus card) | **AERIAL VIEW** | 鸟瞰全城 | 10% of your credits → see every building incl. off-market for 10 min |
| BOTNET / Mass Hire | **LAND GRAB** | 圈地 | Bulk-acquire cheapest ownerless buildings (limit 1+10% of holdings, 10-min cooldown, unlocks at 50 owned) |
| Steal (city/world action) | **TAKE OVER** | 接管 | Acquire an owned, unprotected building from another player (they're paid a bonus) |
| Sell Out (buy your freedom) | **REDEEM** | 赎回 | Pay 90% of your capital to free your deed from your landlord |
| Discard | Sell (label already says sell) | 出售 | Release a building for its value |
| combo / Profession Combo | **DEVELOPMENT** (Development Deal) | 开发（开发项目） | Own exactly 6 buildings, one per trade → sell all for 10× combined value; first sale +50 plots; 6 fresh NPCs spawn |
| profession | **trade** | 行业 | The 6 building families; also gates art + districts |
| Firmware Perks | **Trade Secrets** | 行业秘诀 | Perks active while you ARE or OWN that trade |
| Missions | **Permits** | 建造许可（短用：许可） | Building-count ladder that unlocks features/sectors — bold rename, see §7 |
| the Six / goddesses | **the Founders** | 奠基六杰 | The six landmark cards + win condition |
| Goddess power | Founder power | 奠基人权能 | — |
| root the mainframe | **crown the skyline** | 加冕天际线 | Hold all six Founders 60 min → win |
| ROOT SEQUENCE (city HUD) | **CORONATION** | 加冕序列 | Countdown visual on the world map |
| The Root Wall | **The Cornerstone** | 奠基石 | Hall of fame; winners' names carved |
| "The Simulation is Rebooting" | **"The City Is Being Rebuilt"** | 城市重建中 | World-reset overlay |
| reboot (count of games) | "cities built" | 已建成 N 座城市 | Each game era = one city |
| Game #{number} | City #{number} | 第 {number} 座城市 | — |
| Mainframe City | **the City** | 城市（"你的城市"） | `cityTitle` → "Your City"; public page "Visiting {name}'s city" |
| Boot Sector (s0) | **Old Town** | 老城区 | Always-open center sector |
| Simulation time | City time | 城市时间 | Day/night clock |
| Sector {n} | keep "Sector"（城市分区语境中性） | 扇区→分区 | Mission-gated rings |
| Satellite cities "in orbit" | satellites (real planning term); "{count} in the metro" | 卫星城；都会圈内 {count} 座 | Other players' cities on the world map |
| Universe · {count} cities / Shared universe | **Metro · {count} cities / The shared metro** | 都会圈 · {count} 座城市 / 共享都会圈 | The shared world map |
| SIGNAL LOST (fx) | **SOLD** | 已售出 | Building vanishes from the world view |
| Jack into the simulation | Claim your plot | 领取你的地块 | Register subtitle / guest copy |
| Offline Penalty | **Condemnation** | 荒置查封 | Offline >10 min → cheapest buildings repossessed on a tiered schedule |
| Daily Login Reward | **Daily Dividend** | 每日分红 | Auto-claimed daily payout |
| Rank Bonus | Civic bonuses (flavor; label can stay) | 市政奖励 | Hourly top-3 payouts on 4 boards |
| Score | keep "Score" (neutral) | 热度（可选） | Times acquired/renovated — optionally "Buzz" |

**Kept as-is (already city-native or neutral):** n38worth name, ¢, Buildings
(was done 2026-09-28), Grid / Widest Grid board (a city grid!), Portfolio, Home
tab, Catalog, Squad, History, avatar in the *photo* sense (头像), satellites,
sectors, day/night cycle, friends-for-sale tribute line.

---

## 3. The Founders (was "the Six goddesses")

DB usernames stay (`Goddess`, `Goddess of Wealth`, …). Only
`CARD_DISPLAY_NAMES` / `CARD_DISPLAY_NAMES_ZH` and `THE_SIX` change, plus the
power texts in `goddesses.ts` and the roster one-liners in `agent/roster.ts`.

Lore: **six magnates founded the city. Each lends their signature power to
whoever holds their landmark. Hold all six and crown the skyline.**

| DB username | Now | Proposed EN / ZH | Power copy (matches mechanics) |
|---|---|---|---|
| `Goddess of Wealth` | The Banker | **The Banker** / 银行家 | "Rent and management fees from your holdings pay double." 你的物业租金与管理费翻倍。 |
| `Goddess of Knowledge` | The Oracle | **The Surveyor** / 测绘师 | "The Surveyor's maps show every building in the city — including off-market ones." 测绘师的地图看得到全城每一座建筑——包括未挂牌的。 |
| `Goddess of Fate` | The Locksmith | **The Registrar** / 登记官 | "Every building you own gets a sealed deed — foreclosing one costs 1000× its value." 你名下所有建筑契据加封——法拍需支付其 1000 倍估值。 |
| `Goddess of Time` | The Clockkeeper | **The Foreman** / 监工 | "On the Foreman's site, payday comes twice as often — you collect rent (and pay management fees) at double frequency." 工地由监工掌舵——发薪日频率翻倍：收租（与缴费）都更勤。 |
| `Goddess of War` | NullPointer | **The Wrecker** / 拆迁王 | "Foreclose any leasehold for free, paying only the building's price. Can also demolish one owned building (1-min cooldown): NPC buildings are cleared and two fresh ones rise in their place; humans are reset to 1¢ and walk free." 免费法拍任意租约持有，只需支付建筑价格。还可拆除名下一座建筑（1 分钟冷却）：NPC 建筑被清场并由两座新建筑取代；人类重置为 1¢ 并重获自由。 |
| `Goddess` (final) | The Architect | **The Architect** / 总建筑师 | "The master builder who drew the city's first blueprint grants every Founder's power — even those you don't hold." 画出城市第一张蓝图的总建造师，授予全部奠基人权能——即使你并未持有对方。 |
| `Mass Hire` | Botnet | **Land Grab** / 圈地 | Bulk-acquisition bonus card (unlocks at 50 buildings). |

Roster one-liners (roster.ts identities): The Architect — *"drew the city's
first blueprint"*; the other five — *"one of the six who built this city"*.
Collective: `THE_SIX` → `"the Founders"`, zh `奠基六杰`.
City landmark labels: "The Six landmarks" → "Founders' landmarks" 奠基人地标;
"{count}/6 monuments" → "{count}/6 landmarks"; "Goddess power" → "Founder
power"; "Dormant — acquire to awaken" keeps working as-is.

Art: regenerate the six statics in new personas (same filenames —
`TheBanker.webp` stays, `TheOracle.webp` is re-rendered as The Surveyor etc.;
`rebrand-goddess-art.ts` maps username→filename so only the renders change).

---

## 4. Trades (was professions) + Trade Secrets

Professions were renamed in code AND data last time. **This time: display-layer
only** — `professionName()/professionPerk()` already indirection, so
`users.profession` rows, art-family keys (`FAMILIES` in
`scripts/gen-city-pixel-art.ts`), and sheet filenames stay exactly as they are.
No `rebrand:professions` DB run, no shared-Neon risk.

| DB value | Now | Proposed EN / ZH | Trade Secret (perk) | Perk copy |
|---|---|---|---|---|
| `Cryptographer` | 密码学家 | **Notary** / 公证人 | **Notarized Deeds** 公证契据 | "Your deed locks last 50% longer (1.5 h per press)." 你的契锁持续时间延长 50%（每次加签 1.5 小时）。 |
| `Zero-Day` | 零日客 | **Auctioneer** / 拍卖师 | **Inside Bid** 内幕出价 | "Foreclosures you pay for are 20% cheaper." 你支付的法拍费用便宜 20%。 |
| `Overclocker` | 超频师 | **Renovator** / 翻新师 | **In-House Crew** 自有施工队 | "Renovations cost 10% less but still double the building's value." 翻新费用减少 10%，但建筑估值依然翻倍。 |
| `Cache Keeper` | 缓存管家 | **Vault Keeper** / 金库管家 | **Accrued Interest** 生息 | "Your daily dividend is 25% bigger." 你的每日分红增加 25%。 |
| `Server Marshal` | 服务器执法官 | **City Planner** / 城市规划师 | **Upzoned** 扩批用地 | "+2 land plots." +2 个地块。 |
| `Bot Herder` | 僵尸牧人 | **Prospector** / 勘探者 | **Sharp Eye** 火眼金睛 | "Land Grab claims +1 extra building." 圈地每次多圈 1 座建筑。 |
| (none, 55% of NPCs) | Hidden Card | **Undeveloped plot** / 待开发地块 | — | The no-profession card; art family `Unassigned` unchanged |

In-game tooltip explanations (double as the combo dock / filter copy):
- "Every building belongs to a trade. Holding (or being) a trade keeps its
  Trade Secret active."
- Development: "Own one building of each of the six trades, then sell the set
  for **10× its combined value** — every ¢ you renovate into them counts 10×."
  六大行业各持一栋，整体出售可得合计价值的 **10 倍**——翻新注入的每一 ¢ 都按 10 倍计。
- `comboPerksLostPrefix` "Firmware Perks lost until you rebuild:" → "Trade
  Secrets lost until you rebuild:" 重建前将失去以下行业秘诀：

Card art `/New<Profession>.webp` files: keep filenames (they're keyed by DB
value in `professions.ts`), re-render contents in trade personas.

---

## 5. Ranks & boards

`ranks.ts` ladders change wholesale (en titles + `RANK_TITLES_ZH`). API values,
snapshot columns, thresholds, and colors untouched.

**Grid — owned buildings** (0/3/8/15/25/40/60/80/100/150):
`Newcomer 新人 → Tenant 租客 → Leaseholder 承租人 → Freeholder 业主 →
Landlord 房东 → Developer 开发商 → Builder 营造商 → Magnate 地产大亨 →
Tycoon 巨富 → Baron 巨头`

**Credits — capital** (0/100/500/2k/5k/15k/50k/100k/250k/1M):
`Broke 破产 → Pocket Change 零钱 → Nest Egg 小金库 → Savings 存款 →
Windfall 意外之财 → First Pot 第一桶金 → Fortune 财富 → Riches 豪富 →
Wealth 巨富 → Mogul 大亨`
("First Pot" = 第一桶金 at 15k — the exact idiom for first earnings.)

**Value — your building's appraisal** (1/5/15/50/100/250/500/1k/2.5k/5k) —
*your own card grows through building types*:
`Empty Lot 空地 → Kiosk 报刊亭 → Storefront 临街店面 → Walk-Up 步行楼 →
Townhouse 联排宅 → Mid-Rise 多层楼 → High-Rise 高层楼 → Tower 塔楼 →
Skyscraper 摩天楼 → Landmark 城市地标`

**Portfolio — your holdings' scale** (0/100/500/2k/5k/15k/50k/150k/500k/1M):
`Ghost Town 荒城 → Outpost 前哨站 → Village 村镇 → Town 城镇 → Borough 市区 →
City 城市 → Metropolis 大都会 → Megacity 特大城市 → Megalopolis 巨型都市 →
World Capital 世界之都`

Boards (labels only): Most Credits 资金最多 · **Widest Grid 最广网格 (keep)** ·
The Cornerstone 奠基石 · Top Score · Top Portfolio 物业最强 · Top Value ·
Recent Hires 最近收购 · Recently Online 最近在线.

---

## 6. Win condition & world reset

- Trigger text: "You own all six Founders! Hold them for 60 minutes to **crown
  the skyline**!" 你集齐了全部六位奠基人！持有 60 分钟即可**加冕天际线**！
- Others' toast: "{name} owns all six Founders — take one landmark to stop
  them! If the timer reaches zero, the skyline is crowned and **the city is
  rebuilt**." {name} 集齐了全部六位奠基人——夺走一座地标即可阻止！倒计时归零则天际线加冕，城市重建。
- City world HUD "ROOT SEQUENCE" → "CORONATION 加冕序列"; phases →
  "Cranes rising 塔吊升起 / Steel rising 钢架飞升 / Final floor 顶层封板 /
  Crowning… 加冕中…".
- Overlay: title "**The City Is Being Rebuilt** 城市重建中"; winner line
  "{name} assembled all six Founders — the skyline is crowned" {name} 集齐六位奠基人——天际线加冕; preparing → "Clearing the site for a
  new city…" 正在清场，迎接新城……; art `/reboot.webp` → cranes/dawn skyline;
  `MatrixRain` backdrop → remove (or a falling-blueprint canvas).
- Post-reset toast: "🏆 A New City Rises! All six Founders assembled — the
  city has been rebuilt. Everyone starts fresh with 100¢. See the Cornerstone
  for the new city's founder!" / zh 全文重写（替换 gameWonTitle/Desc）.
- Hall of fame: "**The Cornerstone** 奠基石"; badges "{count} cities built ·
  Latest founder: {name}" 已建成 {count} 座城市 · 最新奠基人：{name}; empty
  state: "No Founders yet — the cornerstone awaits. Assemble all six, crown
  the skyline, and carve your name into the next city." 尚无奠基人——奠基石虚位以待。集齐六位奠基人、加冕天际线，把名字刻进下一座城市。
- Server broadcast (`triggerGameReset.ts:117,283`, stays English):
  "🏆 {winner} has assembled all six Founders and CROWNED THE SKYLINE! The city
  has been rebuilt!"
- Landing countdown banner: "{name} is minutes from crowning the skyline"
  （zh 补上空缺的 `landingCountdownSuffix`）。

---

## 7. Permits (was Missions) — bold, recommended

The mission ladder is literally a building-count requirement that unlocks
features and sectors — that IS a permit process. Rename at display time only
(key names, `missionLevel`, API fields unchanged).

- Mission bar → **Permit progress**; toast "🎉 Permit approved!" 许可获批！
- Labels: "Own 20 buildings to earn your **Builder's Permit**" 拥有 {n} 座建筑，取得建造执照 → "Own 50 to unlock **Land Grab**" →
  "…100 to raise **The Banker's landmark**" …依次到 The Architect。
  zh 模板：拥有 {n} 座建筑，解锁〈圈地／银行家／测绘师／登记官／监工／拆迁王／总建筑师〉。
- `missionCoachMark`: "This bar tracks your current permit. Permits unlock
  features — ranks, developments, Land Grab and the Founders."
- Sector lock chip: "Locked — the zoning board requires {threshold} buildings"
  未解锁——规划局要求 {threshold} 座建筑。
- Win hint: "How to win: raise all six Founders' landmarks and hold them for
  60 minutes." 如何获胜：请出全部六位奠基人地标并持有 60 分钟。

If "Permits" feels too risky for retention, fallback = keep "Missions 任务" and
only swap the reward names (Land Grab, Founders). Everything else in this doc
works either way.

Economy flavor swaps in the same pass: Portfolio Reward → **Rent Collection**
收租 ("Collect 0.2% of your holdings' value as rent, hourly"); Boss Tax →
**Rent 租金**; Portfolio Tax → **Management Fee 管理费**; Daily Login →
**Daily Dividend 每日分红**; Offline Penalty → **Condemnation 荒置查封**
("Buildings crumble without their owner — away too long and your cheapest are
repossessed" — also fixes the stale 1%-credits copy); leaderboard prize copy →
"Civic prizes — top 3 paid hourly" (fixes the 10-min lie).

---

## 8. City layer vocabulary

| Key | New EN / ZH |
|---|---|
| `cityTitle` | Your City / 我的城市 |
| `citySubtitle` | Every acquisition raises a building on your skyline / 每次收购都会在你的天际线上立起一座建筑 |
| `cityLockedBody` | City construction hasn't started yet. / 城市尚未动工。 |
| `cityProfileVisitLink` / `cityPublicBanner` | Visit {name}'s city / 探访 {name} 的城市 |
| `cityBootSector` | Old Town / 老城区 |
| `citySimTime` | City time / 城市时间 |
| `cityHudSector` | Sector {index} → "District" is taken by profession districts; keep Sector / 第 {index} 分区 |
| `cityStatGoddesses` / `cityLandmarksTitle` | The Founders / 奠基六杰 |
| `cityDistrictComplete` | All six trades on site — the district core is open. / 六大行业齐聚——城区核心开放。 |
| `citySatellitesCount` | {count} in the metro / 都会圈内 {count} 座 |
| `cityUniverseChip` / `cityUniverseSummaryLabel` | Metro · {count} cities · your rank #{rank} / 都会圈 · {count} 座城市 · 排名 #{rank}；The shared metro / 共享都会圈 |
| `cityRootSequenceLabel` + phases | CORONATION + phases from §6 / 加冕序列 |
| `cityFxLostSignal` | SOLD / 已售出 |
| `citySteal` | Take Over / 接管 |
| `cityFirewall` / `cityHardLock` | Deed Lock 契锁 / Iron Deed 铁契 |
| `cityWorldCanvasLabel` | City world view / 城市世界视图 |
| `cityHqNoteOwn` | Your HQ — every acquisition builds around it. / 你的总部——每次收购都围绕它建设。 |
| Catalog sections | "The Founders' landmarks" 奠基人地标; "Levels 1–7 (standard) / 8–14 (spectacular)" keep; `catalogFirewall/catalogHardLock` → DEED LOCK / IRON DEED |
| Public city page meta | "{username}'s City — n38worth" · "Visit {username}'s city: buildings, districts and landmarks derived from their live portfolio on n38worth." |

---

## 9. Rewritten marquee copy

**Landing hero:** tagline `landingTagline` → "the city building simulation" /
城市建造模拟. Hero art `/simulation.webp` → skyline render; `MatrixRain` + scanlines removed.

**How to Play (5 lines, full text):**
1. **ACQUIRE** 收购 — "buildings at their appraisal — every purchase raises one
   on your skyline and lifts its value. Your first 10 come with a 24-hour iron
   deed." 按估值收购建筑——每次收购都会在你的天际线上立起一座新楼并推高其价值。前 10 座自带 24 小时铁契。
2. **RENOVATE** 翻新 — "to double a building's value — your main engine. Deed
   locks shield your towers; foreclosures crack a rival's so buildings change
   hands." 翻新让建筑估值翻倍——这是你的主引擎。契锁守护你的高楼；法拍击破对手的契约，让建筑易主。
3. **COLLECT** 收租 — "rent hourly: 0.2% of your holdings, civic rank bonuses,
   plus The Banker's value every 24 h." 每小时收租：物业总值的 0.2%、市政排名奖励，每 24 小时还有银行家的身价分红。
4. **GROW** 拓展 — "your skyline in the City view — permits add +50 plots and
   unlock new sectors; all six trades complete a district." 在城市视图中拓展天际线——许可 +50 地块并解锁新分区；六大行业齐聚即成一个城区。
5. **WIN** 加冕 — "by holding all six Founders' landmarks for 1 hour — they
   crown your city, the city is rebuilt, and your name is set into the
   Cornerstone forever." 集齐六位奠基人地标并守住 1 小时——地标为你的城市加冕，城市重建，你的名字永铭奠基石。

**Register subtitle:** "Claim your plot and start building" / 领取你的地块，开始建造。
**Guest copy:** "Start building instantly with a random identity — no sign-up
needed" / 一键随机身份开工——无需注册。
**Landing CTA:** "Start Here" stays.

**Tutorial (9 steps) — full rewrite, city voice, fixing the step-6 lie:**
1. "Welcome to the City — every player here is a piece of prime real estate,
   including you. Acquire other players to grow your holdings, get acquired to
   earn, and grow your net worth. The first to **crown the skyline** takes the
   city." 欢迎来到这座城市——这里的每个玩家都是一块宝地，包括你。收购别人壮大物业，被收购赚取资金，提升净值。第一个**加冕天际线**的人赢得整座城市。
2. Wallet: "**Capital (¢)** is what you acquire buildings with. **Appraisal**
   is what others pay for **you** — it climbs every time someone acquires you,
   plus rent every 30 minutes."
3. Tabs: "**Home** is your headquarters — profile, holdings, ranks and chat.
   **City** is your skyline — every building you acquire rises there.
   **Buildings** is the open market."
4. Acquiring: "Open the **Buildings** tab, filter by trade or price, and tap to
   acquire. Your **land plots** (in the header) cap how many buildings you can
   hold — permits grant more."
5. City: "hires construct buildings around your HQ (priciest closest in),
   permits unlock new sectors, and zooming out reveals every player's city on
   the shared metro map. Tap any building to inspect it."
6. Developments (FIXED): "Every building has a trade. Own one of each of the
   six trades to assemble a **development**: sell all six for **10× their
   combined value** — every ¢ you **RENOVATE** into them counts 10×. **DEED
   LOCKS** shield them from takeovers." 每座建筑都有自己的行业。六大行业各持一栋即组成**开发项目**：整体出售可得合计价值 **10 倍**——**翻新**注入的每一 ¢ 都按 10 倍计。**契锁**可防对手接管。
7. Permits: "Own buildings to pass permits. Each pays **+50 land plots**,
   reward cards and a free crew member. Progress is always in the header."
8. Ticker/chat: "The ticker streams every market move. **Global Chat** (on
   Home) is where players negotiate — and raid each other."
9. Finish: "Your avatar menu opens **Settings** — sound, avatar, password… and
   this tutorial replays from there. Good luck — go crown the skyline."

**New-player guide (6 steps)** and **starter checklist** get the same swaps
(acquire/capital/plots/rent/trades/Founders/coronation).

**Action toasts** (pattern): "Acquired {name}! Appraisal → {value}¢" 已收购
{name}！估值 → {value}¢ · "🔨 Renovated {name}! Value → {value}¢" 已翻新 ·
"Deed Lock on {name}! +1 h (cost {cost}¢)" 契锁生效 · "Foreclosed! You
acquired {name}!" 法拍成功 · "Land Grab claimed {count} buildings for
{amount}¢" 圈地得手 · "🎉 Development sold! +{amount}¢" 开发出售！ · "Open
house at {name}'s — visible for 1 h" 开放参观 · "Aerial view — every building
visible for 10 minutes" 鸟瞰全城.

**History verbs:** got→acquired 收购 · overclocked→renovated 翻新 ·
fired→redeemed 赎回 · deleted NPC→demolished 拆除 · deleted player→demolished 拆除.
Filters: ALL / ACQUISITIONS / RENOVATIONS 全部 / 收购 / 翻新.

---

## 10. Metadata, art & marketing surfaces

- `layout.tsx`: title "n38worth" (keep — net worth IS the game); description →
  **"The city building simulation — acquire, renovate and protect buildings to
  crown your skyline."** ×3 (plain/OG/Twitter); keywords → drop `matrix`, use
  `["city","city builder","tycoon","trading","game","social","MMO","multiplayer","simulation","skyscraper"]`.
- OG alt (both image routes): "n38worth — the city building simulation".
- Regenerate via `gen:scifi-art` (update its prompts): `og.jpg` (city + slogan),
  `VW_Icon.png` (terminal glyph → skyline/building glyph), `simulation.webp` →
  skyline hero, `reboot.webp` → crane/dawn rebuild art, `endgame.webp` /
  `navbar.webp` if abstract keep, `NEW_HIDDEN.webp` (off-market silhouette —
  maybe a "coming soon" hoarding), `botnet.webp` → Land Grab card, `scan.webp`
  → Aerial View card, `10slots.webp` → "+10 PLOTS" card, six goddess statics →
  Founder personas, six `New<Profession>.webp` → trade personas. Same
  filenames everywhere; nothing in code moves.
- Build stamp, kin strip, friends-for-sale tribute: untouched.
- `PublicCityView` `navigator.share` title stays "n38worth".

---

## 11. Server-side English (v1 policy) — targeted swap

Staying English-only per CHINESE_I18N_STUDY §6, but the ~15 theme-bearing
literals swap vocabulary so raw toasts don't leak Matrix terms:
- `purchaseCore.ts`: "…is under a protected leasehold and cannot be acquired
  for {m} more minutes"; "Insufficient capital…"; "You've reached your plot
  limit of {n}. Buy more plots to expand!"; "🔒 {name} is locked — win it from
  a permit first."; "This leasehold is unbreakable for {m} more minutes…".
- `pumpPlayer.ts` DM: "🔨 {owner} RENOVATED you! Value → {v}¢ (+{gift}¢
  gifted)…"; `blockSell.ts`: "🔒 {owner} put a DEED LOCK on you! +1 h…";
  `boost-card` DM fixed emoji: "🔒 Deed Lock on {name} for 1 h!…"; reveal DMs:
  "🏠 Open house at {name}'s!…".
- `mass-hire.ts`: "🔒 Land Grab unlocks at {threshold} buildings…".
- `perm-block`: "Iron deeds can only be placed on NPC buildings" / "Iron deed
  limit reached".
- `comboCore.ts`: "Exactly 6 buildings required for a development"; "{name} is
  deed-locked and can't be sold for {m} more minutes".
- `multi-account.ts` texts keep (no theme words).
- Register-page/ChatRoom/layout literals move into the dictionary while at it.

---

## 12. What must NOT change (invariants)

- DB usernames (Goddess*, Mass Hire), `users.profession` values, POWER_BITS,
  `GODDESS_USERNAMES`, mission `rewardCards`, purchase locks.
- API paths, route params, `/api/ranks/[type]` values (`empire`, `legacy`…),
  snapshot columns, cron routes & schedules, Pusher event names.
- i18n key NAMES (values only), `TranslationKeys` parity, `useLanguage` plumbing.
- Art-family keys + pixel sheet filenames (`Cryptographer-t1.png`…) — display
  maps over them.
- Economy formulas, portfolio formula, caps, cooldowns — this is copy only.
- AGENTS.md + CHINESE_I18N_STUDY §4 glossary get a new "city era" section
  documenting the table in §2 (so future copy stays consistent), and this file
  becomes the canonical naming bible.

---

## 13. Implementation plan (after go-ahead)

| Phase | Contents | Risk |
|---|---|---|
| **P1 Vocabulary core** | §2 table applied to the 307 dictionary values; display-names, professions display tables + perks, ranks ladders, missions labels, goddess powers/roster one-liners | low — parity enforced by typecheck |
| **P2 Narrative cluster** | §6–§9: win condition, Cornerstone, rebuild overlay (+MatrixRain removal), Coronation HUD, tutorial, How-to-Play, guide, city.json/city-world.json, toasts, History verbs | low |
| **P3 Marketing & art** | layout meta, image alts, `gen:scifi-art` prompt rewrite + regenerate all §10 assets | low (deterministic scripts) |
| **P4 Server strings & hygiene** | §11 swap + the 7 copy bugs + dictionary-policy violations | medium — touch API handlers; verify each toast path |
| **P5 Docs** | AGENTS.md rebrand section, CHINESE_I18N_STUDY §4 city-era glossary | — |

Verification: `npx tsc --noEmit` (en/zh parity auto-checked), `npm run lint`,
`npm run build`, local smoke of landing/tutorial/market/city/reset overlay;
image-analyst pass on regenerated art; no DB migrations, no new dependencies,
deploy = one commit (only when you ask).

Estimated churn: ~370 dictionary values, 5 helper files, ~15 server literals,
3 metadata files, ~15 art assets, 2 docs.
