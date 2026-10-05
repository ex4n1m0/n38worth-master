# TEXT_SHORTENING_STUDY.md — cut game text ~20–50% with zero meaning loss

**Date:** 2026-10-03 · **Status: SHIPPED — commit 5023b32, deployed to n38worth.com (build stamp verified, shortened copy confirmed in served chunk, dead keys absent)** · Phase C (server errors) skipped as planned

Goal: reduce the total amount of user-visible text across the whole game
(EN + 简体中文) while keeping every fact, number, and vocabulary ruling
identical.

## 0. Implementation record (2026-10-03, same day)

- **101 values rewritten** (74 JSON en+zh pairs + 24 inline `i18n.ts` edits +
  3 zh follow-up grammar fixes) and **18 dead keys deleted**, via a
  verified patch script (exact old-value match, placeholder-token parity,
  per-file indentation preserved).
- **Results (en chars):** touched strings 10,098 → 6,632 (**−34%**) ·
  tutorial bodies 2,182 → 1,322 (**−39%**) · landing How-to-Play 889 → 581
  (**−35%**) · whole dictionary 35,563 → ~32,100 (**−9.7%** — lower than the
  §7 estimate because the remaining long strings are dense interpolated
  fact-toasts that are at their floor without meaning loss).
- **Fixed in passing:** tutorial step 6's prefix previously read
  "sell all six for RENOVATE multiplies…" (broken grammar before the
  highlight); now grammatical: "one of each six forms a development.
  RENOVATE doubles value: every ¢ in counts 10× when you sell all six."
- **Verified:** `npx tsc --noEmit` 0 errors outside the unrelated
  untracked `src/lib/autopilot/` WIP · eslint clean · en/zh key parity per
  file · `{param}` token sets identical vs HEAD for every touched and
  deleted key · all 10 tutorial panels re-composed around their cyan
  highlights and reviewed · dead keys grep-verified unreferenced
  (incl. dynamic-prefix greps).
- NOT deployed — visible only locally until commit+deploy (workflow rule).

---

## 1. Where the text actually is (measured 2026-10-03)

| Source | Keys | EN chars | Notes |
|---|---|---|---|
| Client dictionary (`i18n.ts` inline + `i18n-keys/{en,zh}/*.json`) | **1,286** | **~35,563** | ~14.4k zh chars. THE surface. |
| — of which legal (Terms + Privacy) | 48 | 3,047 | **out of scope** (§8) |
| — of which dead/unreferenced keys | 18 | 295 | free deletion (§6) |
| Vocab-next-to-data (`missions-data`, `professions`, `ranks`, `crew-jobs`, `blueprints`, `display-names`) | ~120 strings | ~1,800 | already terse — leave alone |
| Server-side English (API `error:` values, event feed, DM receipts) | ~200 unique | ~6,000 | short already; optional phase 3 (§8) |

Per-file dictionary volume (EN chars): action-buttons 5,927 · misc-meta 4,851
(≈half legal) · settings-onboarding 4,785 · missions-goddesses 3,538 (tutorial
lives here) · raid-bounties 3,141 · market-cards 2,211 · city-world 1,892 ·
chat-history 1,457 · city-2d 1,362 · leaderboard-ranks 1,275 · ownership-home
806 · city 394 · i18n.ts inline 3,924.

## 2. The 80/20: length distribution

| EN length | Keys | Chars | Share | Treatment |
|---|---|---|---|---|
| 0–15 | 608 | 5,554 | 15.6% | buttons/labels — don't touch |
| 16–30 | 339 | 7,373 | 20.7% | leave (already tight) |
| 31–60 | 208 | 8,925 | 25.1% | light polish, −10% |
| 61–100 | 74 | 5,407 | 15.2% | rewrite, −35% |
| 101–200 | 53 | 7,318 | 20.6% | rewrite, −50% |
| 200+ | 4 | 986 | 2.8% | rewrite, −50% |

**131 keys longer than 60 chars carry 38.6% of ALL English text.** 10% of the
keys, ~40% of the words. Shortening is a scalpel job on ~300 keys, not a
rewrite of the dictionary. The wordiest single surfaces:

- **Tutorial** (10 panels, 37 body fragments): **2,182 chars** — the longest
  reading task in the game, shown to every new player.
- **Landing How-to-Play** (6 bodies): 889 chars before you can play.
- **Confirm dialogs** (discard-all ×3 variants, redeem, test reset): ~600.
- **Page subtitles & feature hints** (/raid, blueprint albums, vault, catalog):
  ~1,000.
- **Status banners** (game won, account reset, multi-account, offline penalty):
  ~700.
- **Settings/onboarding explainer rules**: ~800.

## 3. Editorial rules (the style guide for the pass)

Each rule keeps the meaning; only packaging is cut.

- **R1 — Kill dialog lead-ins.** "Are you sure you want to X?" is already
  asked by the dialog title + confirm button. The body states only the
  consequence.
- **R2 — One idea per string.** Cut the second clause when it restates the
  first ("and grows your net worth", "plus hourly rent of…" stays — it's a
  separate fact; "…so buildings change hands" goes — it's color).
- **R3 — Cut what the screen already shows.** Tab names the user is looking
  at, numbers in the same panel ("shown in the header"), the four features
  listed inside a tab the tutorial just named, "avatars on every building"
  (visible in one second on the map).
- **R4 — Cut marketing flourish.** "visible to everyone!", "forever",
  "Choose wisely!", "Good luck —".
- **R5 — Cut parentheticals and dashes-asides.** "(or the bottom-right
  corner)", "(Actual cost depends on…)".
- **R6 — Imperative voice, drop subjects.** "You will receive approximately
  {value}¢" → "receive ~{value}¢"; "Your first 10 come with" → "first 10 carry".
- **R7 — FACTS ARE INVARIANT.** Every number, duration, and mechanic stays
  exact: 0.2% hourly rent, 24h iron deed on first 10, 60-min crown hold,
  +50 land plots, 10× renovation leverage, 50% penalties/refunds, 2% fees,
  feature/tab names, city vocabulary rulings (ACQUIRE/RENOVATE/DEED LOCK/…).
  Shortened copy must still pass the ONBOARDING copy-audit drift checklist.
- **R8 — zh mirrors the shortened EN.** Same facts; zh glossary
  (CHINESE_I18N_STUDY §4) unchanged. zh is already dense — expect −10–15%
  there vs −20%+ for en.

## 4. Before → after (the rewrites, en + zh)

Character counts in brackets. Placeholders `{…}` preserved exactly.

### 4.1 Tutorial — 2,182 → ~1,050 chars (−52%)

Composition constraint: each body is prefix + `<highlight>` + suffix (+
middle fragments on steps 2/3/6); shortened fragments must still read as one
sentence around the cyan highlights.

| Fragment | Now (chars) | Proposed |
|---|---|---|
| 1 prefix | Every player here is a piece of prime real estate — including you. Acquire other players to grow your holdings, get acquired to earn capital, and grow your net worth. The first to (180) | Every player here is a building for sale — you included. Acquire to grow; get acquired to earn. First to (109) |
| 1 suffix | takes the city and claims the Cornerstone. (43) | wins the city and the Cornerstone. (36) |
| 2 text1 | is what you acquire buildings with. (37) | buys buildings. (16) |
| 2 text3 | — it climbs every time someone acquires you, plus hourly rent of 0.2% of your portfolio. (89) | — it rises when you're acquired; rent adds 0.2% of portfolio hourly. (68) |
| 3 text1 | is your headquarters — profile, holdings, ranks and global chat. (63) | holds profile, ranks and chat. (30) |
| 3 text2 | is the open market where you browse, search and acquire. (58) | is the open market. (21) |
| 3 text3 | are the other two — Raid is your heist hub (vault raids, bounties, crew jobs, battles) and City is the shared map of every player's skyline. (141) | are heists and the shared world map. (37) |
| 4 suffix | tab, filter by trade or price, and tap a card to acquire it. Your land plots (shown in the header) cap how many buildings you can hold — permits grant more. (157) | tab and tap a card to acquire. Land plots cap your holdings — permits add more. (81) |
| 5 suffix | tab — it opens centered on YOUR city: HQ at the core, Founder landmarks around it, your buildings ringing outward priciest-first. Zoom out to the shared blueprint — every player's city on one map, avatars on every building — and tap anything to inspect it. (257) | tab — it opens on YOUR city: HQ core, Founder landmarks, buildings priciest-first. Zoom out for the shared map; tap anything to inspect. (138) |
| 6 prefix | Every building has a trade. Own one of each of the six trades to assemble a development: sell all six for (106) | Own one of each six trades to form a development — sell all six for (68) |
| 6 middle | multiplies what they're worth — every ¢ you renovate in counts 10×. (68) | doubles their value — every ¢ in counts 10×. (46) |
| 6 suffix | shields them from takeovers. Build the set in the combo dock — the pill in the bottom bar (or the bottom-right corner), or press (130) | blocks takeovers. Build the set in the combo dock (bottom pill) or press (74) |
| 7 suffix | , reward cards and a free crew member. Your progress is always in the header. (77) | , reward cards and a free crew member. (38) |
| 8 prefix | The ticker streams every market move in real time. (51) | The ticker streams every market move. (38) |
| 8 suffix | (on Home) is where players coordinate — and raid each other. (59) | (Home) is where players plot — and raid. (40) |
| 9 suffix | — sound, avatar, password… and this tutorial replays from there any time. Good luck — go crown the skyline. (108) | — sound, avatar, password; this tutorial replays there. Go crown the skyline. (80) |
| tutRaidBody | This tab is the heist hub. Spend raid charges to crack rivals' vaults for liquid capital; post bounties so the city poaches for you; field five-building crews for bank heists and auto-battles; collect blueprints from every move. Getting raided grants a REVENGE charge — deed locks shield half your credits. (306) | Crack vaults with raid charges, post bounties, run crew heists and battles, collect blueprints. Getting raided grants REVENGE — deed locks halve the loss. (157) |

zh follows the same cuts, e.g. step-5 suffix → 「页签——定位到你的城市：总部居中，奠基者地标环绕，建筑按价值由内向外。缩小即是共享地图，点按任意建筑查看。」(~60 → ~57 chars, zh saves less but reads faster).

### 4.2 Landing How-to-Play — 889 → ~480 chars (−46%)

| Key | Now | Proposed |
|---|---|---|
| landQuick1Body | buildings at their appraisal — every purchase raises one on your skyline and lifts its value. Your first 10 come with a 24-hour iron deed. (138) | buildings at appraisal — each rises on your skyline and gains value. First 10 carry a 24h iron deed. (100) |
| landQuick2Body | to double a building's value — your main engine. Deed locks shield your towers; foreclosures crack a rival's so buildings change hands. (135) | to double a building's value. Deed locks shield yours; foreclosures crack rivals'. (82) |
| landQuick3Body | rent hourly — 0.2% of your portfolio, top-rank bonuses, plus The Banker's value every 24h. (89) | hourly rent — 0.2% of portfolio, rank bonuses, The Banker's value every 24h. (77) |
| landQuick4Body | your skyline on the shared City map — every player's city sits on one blueprint, avatars on every building. Permits add +50 land plots; all six trades complete a district. (171) | your skyline on the shared map — one blueprint, every player's city. Permits add +50 plots; six trades complete a district. (122) |
| landQuick5Body | by holding all six Founders' landmarks for 1 hour — they crown your city, the city is rebuilt, and your name joins the Cornerstone forever. (139) | by holding all six Founders for 1 hour — the city is rebuilt, your name joins the Cornerstone. (95) |
| landQuickRaidBody | rivals' vaults with raid charges and post bounties on buildings you covet. Field a five-building crew for Founder-bank heists and crew battles — every move also cracks the shared World Vault for a server-wide payout. (216) | rivals' vaults, post bounties, run crew heists and battles — every move cracks the shared World Vault too. (105) |

### 4.3 Confirm dialogs — ~600 → ~270 chars (−55%, rule R1)

| Key | Now | Proposed |
|---|---|---|
| sellOutConfirmDesc | Are you sure you want to redeem your deed from your landlord? You will receive capital based on your current value. (115) | Redeem your deed for capital at your current value. (52) |
| discardConfirmDesc | Are you sure you want to discard this building? You will lose ownership. (73) | You will lose ownership of this building. (40) |
| discardAllConfirmDesc | Are you sure you want to discard all {count} owned buildings? You will receive approximately {value}¢ and all their values will reset. Buildings with an active deed lock will be skipped. (186) | Discard {count} buildings for ~{value}¢; their values reset. Deed-locked ones are skipped. (89) |
| discardAllDialogDesc(+Plural) | Discarding all {count} players costs {cost}¢ upfront. You'll receive back ~{refund}¢ (50%), and each discarded player receives their 50%. Players with active deed locks will be skipped. (185) | Costs {cost}¢ upfront; you get ~{refund}¢ (50%) back. Deed-locked players are skipped. (83) |
| confirmTestReset | This will RESET THE ENTIRE GAME (test mode, no Hall of Fame entry). All ownership, capital, and progress will be wiped. Are you sure? (133) | RESETS THE ENTIRE GAME (test mode, no Hall of Fame). All ownership, capital and progress wiped. Continue? (110) |
| warDeleteHumanDesc | {name} is a human player and cannot be demolished — instead their building's value resets to 1¢ and you lose ownership of them. They remain in the game. (152) | {name} is human — can't be demolished. Their value resets to 1¢ and you lose ownership. (92) |
| warDeleteNpcDesc | This NPC will be permanently demolished and 2 new NPCs will be generated into the market. This cannot be undone. (112) | Permanently demolishes this NPC; 2 new ones enter the market. (62) |

### 4.4 Subtitles & hints — ~1,000 → ~500 chars (−50%)

| Key | Now | Proposed |
|---|---|---|
| raidPageSubtitle | Crack rivals' vaults and take their liquid capital. Deed locks shield half of a victim's credits — lock up before you log off. (126) | Crack vaults, take liquid capital. Deed locks halve raid losses — lock up before logging off. (95) |
| bpAlbumsHint | Every acquire, renovate, foreclosure, permit and raid can drop blueprints. Complete an album to raise its prop on your city — visible to everyone on the shared map. (164) | Any acquire, renovate, foreclosure, permit or raid can drop blueprints. Complete an album to raise its prop on your city. (120) |
| bpTradeHint | Duplicates (×2+) are the only tradeable cards in the game — offer a swap, escrowed server-side. (111→) | Duplicates (×2+) are the only tradeable cards — swaps are escrowed server-side. (85) |
| vaultHint | Every acquire, renovate and raid cracks the shared vault — break it open and everyone who helped gets paid. (107) | Every acquire, renovate and raid cracks the shared vault — break it and all contributors get paid. (94) |
| missionCoachMark | This bar tracks your current permit. Permits unlock features — ranks, developments, Land Grab and the Founders. (111) | This bar tracks your permit. Permits unlock ranks, developments, Land Grab and the Founders. (94) |
| coachCredits | Earn capital when other players acquire your cards, plus hourly rent — 0.2% of your portfolio. Your value grows every time you get acquired. (140) | Earn capital when others acquire your cards, plus hourly rent (0.2% of portfolio). Value grows each time you're acquired. (122) |
| coachGetRest | on a building to acquire it. Each acquisition raises that building's value — and pays capital to the previous owner. Own buildings, then earn when others acquire them from you! (176) | a building to acquire it — its value rises and the previous owner gets paid. Own buildings, earn when others take them. (119) |
| catalogSubtitleAll | Every building design in the game — the 2D blueprint map, the shared card art and the 3D view, side by side. (108) | Every building design — 2D blueprint, card art and 3D view, side by side. (77) |
| renamePerkHint | Ownership perk: you can rename this building once. If it gets acquired from you, the next owner gets their own rename. Choose wisely! (133) | Perk: rename this building once. The next owner gets their own rename. (72) |

### 4.5 Status banners — ~700 → ~380 chars (−45%)

| Key | Now | Proposed |
|---|---|---|
| gameWonDesc | A player assembled all six Founders and crowned the skyline! The city has been rebuilt. Everyone starts fresh with 100¢. See the Cornerstone for the new city's founder! (168) | All six Founders assembled — skyline crowned, city rebuilt. Everyone restarts with 100¢. See the Cornerstone! (109) |
| accountResetDesc | Your account ran out of capital and has been reset to a fresh start. You have 10¢ to begin again — upload an avatar to earn bonus capital! (138) | Out of capital — fresh start with 10¢. Upload an avatar for bonus capital! (76) |
| multiAccountWarningDesc | Multiple accounts have been detected from your network. If this continues, a 50% penalty will be applied to your capital and player value. (138) | Multiple accounts detected on your network. Continued use cuts your capital and value by 50%. (96) |
| multiAccountPenaltyActiveDesc | Your account has been penalized for using multiple accounts from the same network. A 50% reduction has been applied to your capital and player value. (149) | Penalized for multiple accounts: capital and value cut 50%. (60) |
| offlinePenaltyBody | Away too long? Your cheapest buildings get repossessed one by one. Stay active to keep your portfolio. (97) | Away too long? Cheapest buildings get repossessed one by one. (62) |
| countdownStartedSixDesc | You own all six Founders! Hold them for 60 minutes to crown the skyline! Other players will try to foreclose them away! (119) | All six Founders yours! Hold 60 minutes to crown the skyline — rivals will try to foreclose them. (98) |
| settingsConvertDemoDesc | Your demo account will be deleted after 1 hour. Change your username AND upload a custom avatar to convert it into a permanent account. (135) | Demo account deletes in 1 hour. Change username AND upload an avatar to keep it. (82) |

### 4.6 Settings/onboarding rule lines — ~800 → ~450 chars (−44%)

| Key | Now | Proposed |
|---|---|---|
| assignCostRule | The Building's value will reset to its floor value. Cost = (others with that trade) × {base}¢ × your change #. A trade nobody else has is free. (143) | Value resets to floor. Cost = (others with that trade) × {base}¢ × change #. Unowned trades are free. (101) |
| changeCostRule | Cost = (other players with that trade) × {base}¢ × your change number. A trade nobody else has is free. (103) | Cost = (others with that trade) × {base}¢ × change #. Unowned trades are free. (75) |
| onboardingProfessionDesc | Select the path that will define your footprint in the city. Your trade icon shows on your card and your city. (103) | Pick your path — the trade icon shows on your card and city. (61) |
| settingsAvatarCardDesc | Your avatar is your card's photo across the whole game. (55) | Your avatar is your card's photo. (37) |

The same treatment continues mechanically through the remaining 61–100-char
keys (~74) and selected 31–60-char keys — the tables above define the voice.

## 5. What is NOT shortened (guardrails)

- **DB values, API params, i18n KEY names, Pusher payloads, gameHistory
  types** — untouched (display-only pass).
- **`{param}` placeholders** — every rewrite keeps the exact placeholder set;
  a script check compares tokens before/after per key.
- **Facts/numbers** (R7): verified against the onboarding copy audit.
- **aria-labels** — shortened only by removing flourish, never below
  "what does this control do".
- **Legal pages** (48 keys, 3,047 chars): Terms/Privacy are protections;
  cutting them for brevity trades legal clarity for style. Out of scope.
  (If desired later: a separate, lawyer-eyed trim.)
- **Vocab-next-to-data files** — mission labels, trade perks, crew-job
  flavors, blueprint names are already one-liners; leave.
- **Layout**: only ever shorter — no wrapping/overflow risk. A few modals
  will look sparser; that is the point.
- **zh**: rebuilt from the shortened en, full-width punctuation, glossary
  terms unchanged. The `TranslationKeys` type fails the build if en/zh drift.

## 6. Free win: 18 dead keys (−295 chars, −18 keys)

`cityHud*` cluster (13 — HUD strings from the removed 3D HUD era),
`cityEmptyTitle`, `raidVictimNone`, `bountyExpires`, `bountyReward`,
`bountyTarget` (raid-bounties leftovers; the `bountyTargets` hits in code
are variable names, not key references). Verified unreferenced outside the
dictionary (regex `\bkey\b` over all src, dynamic-construction grep clean).

## 7. Estimated impact

| Bucket | Now | After | Saved |
|---|---|---|---|
| Dead keys | 295 | 0 | −295 |
| >100-char keys (57) | 8,304 | ~4,150 | −50% |
| 61–100-char keys (74) | 5,407 | ~3,500 | −35% |
| 31–60-char keys (208) | 8,925 | ~8,000 | −10% |
| ≤30-char keys (947) | 12,927 | ~12,700 | −2% |
| **Dictionary total (en)** | **35,563** | **~28,300** | **−20.4%** |
| zh (proportional) | ~14,400 | ~12,400 | −14% |
| Tutorial reading load | 2,182 | ~1,050 | **−52%** |
| Landing pre-play reading | 889 | ~480 | **−46%** |

## 8. Server-side strings (optional phase 3)

511 `error:` sites (~200 unique, mostly 30–60 chars), event-feed lines and DM
receipts are already terse and en-only by design (CHINESE_I18N_STUDY §6).
Recommended: skip, except ~15 wordiest errors (the 12-hour-maximum pair, the
rename-perk and upload-avatar sentences) which can lose their second
sentence. Low value; do only if the cheap passes feel insufficient.

## 9. Implementation plan (when approved)

1. **Phase A — mechanical (~110 keys):** dialogs, banners, hints, settings
   rules + delete the 18 dead keys. Pure `i18n-keys/*.json` + inline edits,
   en and zh together.
2. **Phase B — tutorial + landing (~45 keys):** composition-sensitive
   (prefix/highlight/suffix grammar); rewrite per §4.1–4.2, then eyeball the
   rendered overlay in dev for sentence flow around the cyan highlights.
3. **Phase C — optional server errors (§8).**
4. **Verify:** `npx tsc --noEmit` (en/zh lockstep) · placeholder-token diff
   script per key · `npm run lint` · visual pass (tutorial overlay, landing
   How-to-Play, /raid, settings, discard-all dialog) via dev server +
   image-analyst on screenshots · spot-check the onboarding-audit facts.

All local; no commit/deploy until asked (workflow rule).
