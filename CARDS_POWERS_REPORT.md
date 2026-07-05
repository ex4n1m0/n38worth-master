# Goddess Cards & Bonus Cards - Powers & Logic Report

**Generated:** May 18, 2026  
**Scope:** Complete analysis of all 6 Goddess Cards and 3 Bonus Cards powers, their implementation status, and logic locations.

---

## 1. GODDESS CARDS (6 Total)

### 1.1 Goddess of Wealth
| Aspect | Details |
|--------|---------|
| **Description** | The player holding this card gains double from all passive income, portfolio rewards, and boss income. |
| **Power ID** | `hasWealth` |
| **Value** | 100,000 |
| **Implementation Status** | FULLY IMPLEMENTED |
| **Logic Location** | `src/app/api/cron/portfolio-reward/route.ts:89,187,193` |

**Logic Details:**
- Portfolio rewards are doubled for Wealth holders: `playerNetReward = playerPowers.hasWealth ? baseNetReward * 2 : baseNetReward`
- Boss tax income is doubled for Wealth holders: `effectiveBossTax = bossPowers.hasWealth ? bossTax * 2 : bossTax`

---

### 1.2 Goddess of Knowledge
| Aspect | Details |
|--------|---------|
| **Description** | The player holding this card can see all avatars without needing to press the reveal buttons. |
| **Power ID** | `hasKnowledge` |
| **Value** | 1,000,000 |
| **Implementation Status** | FULLY IMPLEMENTED |
| **Logic Location** | `src/app/api/game/reveal-avatar-short/route.ts:74-75,79,97-114` |

**Logic Details:**
- Knowledge holders get free avatar reveals: `const isFree = senderPowers.hasKnowledge;`
- Reveal cost is 0 for Knowledge holders: `const cost = isFree ? 0 : Math.round(currentValue * costRate * 100) / 100;`
- No credits deducted from sender, no credits gifted to target

---

### 1.3 Goddess of Fate
| Aspect | Details |
|--------|---------|
| **Description** | The player holding this card can create NPCs and perform mass hire for free. |
| **Power ID** | `hasFate` |
| **Value** | 10,000,000 |
| **Implementation Status** | FULLY IMPLEMENTED |
| **Logic Location** | `src/app/api/game/create-npc/route.ts:60-62,71-81` & `src/app/api/game/mass-hire-fee/route.ts:28-31` |

**Logic Details:**
- NPC creation is free for Fate holders: `const isFree = powers.hasFate; const effectiveCost = isFree ? 0 : COST;`
- Mass hire fee is waived: `if (powers.hasFate) { return NextResponse.json({ ok: true, deducted: 0 }); }`
- Normal cost is 1,000 credits for both actions

---

### 1.4 Goddess of Time
| Aspect | Details |
|--------|---------|
| **Description** | The player holding this card reduces the time needed to receive portfolio rewards and boss income by half, but only for himself. |
| **Power ID** | `hasTime` |
| **Value** | 100,000,000 |
| **Implementation Status** | FULLY IMPLEMENTED |
| **Logic Location** | `src/app/api/cron/portfolio-reward/route.ts:51-130` |

**Logic Details:**
- Portfolio rewards run every 2 minutes for regular players
- Time holders receive rewards EVERY cron tick (every minute if cron is set to `*/1`)
- When global interval hasn't elapsed, ONLY Time holders are processed: `if (!playerPowers.hasTime) continue;`
- This effectively gives Time holders 2x frequency (every tick vs every other tick)

---

### 1.5 Goddess of War
| Aspect | Details |
|--------|---------|
| **Description** | The player holding this card can break blocks for free; only the normal hire cost applies when hiring a player. |
| **Power ID** | `hasWar` |
| **Value** | 1,000,000,000 |
| **Implementation Status** | FULLY IMPLEMENTED |
| **Logic Location** | `src/app/api/game/break-partnership/route.ts:90-92,103-115` |

**Logic Details:**
- Break fee calculation: `const breakCost = buyerPowers.hasWar ? 0 : hoursRemaining * target.playerValue;`
- War holders pay 0 break fee, only the normal player value cost
- Break fee is paid to the current owner as compensation

---

### 1.6 Goddess (Goddess of Creation)
| Aspect | Details |
|--------|---------|
| **Description** | The player holding this card activates all powers from all other cards, regardless of whether the player holds any other goddess card or not. |
| **Power ID** | `hasAll` |
| **Value** | 10,000,000,000 |
| **Implementation Status** | FULLY IMPLEMENTED |
| **Logic Location** | `src/lib/goddess-powers.ts:33-42` |

**Logic Details:**
- If player owns "Goddess", all power flags are set to true:
```typescript
const hasAll = owned.has("Goddess");
return {
  hasWealth: hasAll || owned.has("Goddess of Wealth"),
  hasKnowledge: hasAll || owned.has("Goddess of Knowledge"),
  hasFate: hasAll || owned.has("Goddess of Fate"),
  hasTime: hasAll || owned.has("Goddess of Time"),
  hasWar: hasAll || owned.has("Goddess of War"),
  hasAll,
};
```

---

## 2. BONUS CARDS (3 Total)

### 2.1 Bonus Own Value
| Aspect | Details |
|--------|---------|
| **Description** | Your own player value increases by 1% every hour. |
| **Image** | `/Bonus_Own.png` |
| **Implementation Status** | **IMPLEMENTED** |
| **Logic Location** | `src/app/api/cron/bonus-cards/route.ts:64-95` |

**Logic Details:**
- Hourly cron job applies 1% increase to owner's `playerValue`
- Uses BigInt arithmetic to prevent overflow
- Capped at PostgreSQL bigint limit (`PG_BIGINT_MAX`)
- Description displayed in UI (`PlayerCard.tsx:603-607`, `OwnershipList.tsx:407-409`)

---

### 2.2 Bonus Owned Players
| Aspect | Details |
|--------|---------|
| **Description** | All your owned players' values increase by 1% every hour. |
| **Image** | `/Bonus_Owned.png` |
| **Implementation Status** | **IMPLEMENTED** |
| **Logic Location** | `src/app/api/cron/bonus-cards/route.ts:97-139` |

**Logic Details:**
- Hourly cron job applies 1% increase to all owned players' `playerValue`
- Uses BigInt arithmetic to prevent overflow
- Capped at PostgreSQL bigint limit (`PG_BIGINT_MAX`)
- Description displayed in UI (`PlayerCard.tsx:603-607`, `OwnershipList.tsx:407-409`)

---

### 2.3 Bonus Player Slot
| Aspect | Details |
|--------|---------|
| **Description** | You gain +1 hire slot every hour. |
| **Image** | `/Bonus_Slot.png` |
| **Implementation Status** | **IMPLEMENTED** |
| **Logic Location** | `src/app/api/cron/bonus-cards/route.ts:141-164` |

**Logic Details:**
- Hourly cron job adds +1 to owner's `hireSlots`
- Uses Drizzle SQL increment: `sql`${users.hireSlots} + 1``
- Description displayed in UI (`PlayerCard.tsx:603-607`, `OwnershipList.tsx:407-409`)

---

## 3. BONUS CARDS - SPECIAL MECHANICS

In addition to the hourly power effects, Bonus Cards have these special behaviors:

### 3.1 Free to Hire
| Location | Logic |
|----------|-------|
| `src/actions/purchasePlayer.ts:71-76,79,82-84,152-157,164,194-199,202-207` | Bonus cards cost 0 to hire: `const costMultiplier = isBonusCard ? 0 : Math.max(1, blockDurationHours);` |

### 3.2 Fixed 3-Hour Unbreakable Block
| Location | Logic |
|----------|-------|
| `src/actions/purchasePlayer.ts:79,239-247` | Bonus cards get automatic 3-hour block: `const effectiveBlockHours = isBonusCard ? 3 : blockDurationHours;` |
| `src/app/api/game/break-partnership/route.ts:61-66` | Cannot break bonus card partnerships: `if (BONUS_CARD_USERNAMES.includes(target.username)) { return NextResponse.json({ error: "Bonus cards have an unbreakable partnership block..." }, { status: 403 });` |
| `src/components/PlayerCard.tsx:724,732-739` | UI shows "Unbreakable Block" for bonus cards |

### 3.3 Cannot Be Value Boosted
| Location | Logic |
|----------|-------|
| `src/app/api/game/boost-value/route.ts:49-55` | Bonus cards cannot be boosted: `if (BONUS_CARD_USERNAMES.includes(target.username)) { return NextResponse.json({ error: "Bonus cards cannot be value-boosted" }, { status: 403 }); }` |

### 3.4 Cannot Be Boost-Card Boosted
| Location | Logic |
|----------|-------|
| `src/app/api/game/boost-card/route.ts:69-74` | Cannot extend bonus card block: `if (BONUS_CARD_USERNAMES.includes(target.username)) { return NextResponse.json({ error: "Bonus cards cannot be boosted — the 3h block is fixed and unbreakable" }, { status: 403 }); }` |

### 3.5 Avatars Always Visible
| Location | Logic |
|----------|-------|
| `src/lib/avatar-utils.ts:23,29` | Bonus card avatars are always shown: `if (isSelf || isHired || isGoddess || isBonus || isAvatarRevealed) { return avatarUrl || UNHIRED_AVATAR_SRC; }` |
| `src/components/PlayerCard.tsx:239` | Avatar reveal logic includes bonus cards: `isAvatarRevealed: isAvatarRevealed || isAvatarTempRevealed || isBonusCard,` |

### 3.6 Locked UI (No Actions)
| Location | Logic |
|----------|-------|
| `src/components/OwnershipList.tsx:182,395-410,457-466` | Bonus cards show locked UI with power description only - no send credits, boost, reveal, or chat |

---

## 4. IMPLEMENTATION STATUS SUMMARY

### Goddess Cards - Fully Implemented
| Goddess | Power | Status |
|---------|-------|--------|
| Wealth | 2x passive income, portfolio rewards, boss income | IMPLEMENTED |
| Knowledge | Free avatar reveals | IMPLEMENTED |
| Fate | Free NPC creation & mass hire | IMPLEMENTED |
| Time | 2x reward frequency (every tick) | IMPLEMENTED |
| War | Free block breaking | IMPLEMENTED |
| Creation | All powers combined | IMPLEMENTED |

### Bonus Cards - Fully Implemented
| Bonus Card | Effect | Status |
|------------|--------|--------|
| Bonus Own Value | 1% own value increase/hour | **IMPLEMENTED** via `bonus-cards` cron |
| Bonus Owned Players | 1% owned players value increase/hour | **IMPLEMENTED** via `bonus-cards` cron |
| Bonus Player Slot | +1 hire slot/hour | **IMPLEMENTED** via `bonus-cards` cron |
| **Special Mechanics** | Free hire, 3h unbreakable block, always visible avatar | IMPLEMENTED |

---

## 5. KEY FILES REFERENCE

### Goddess Powers
| File | Purpose |
|------|---------|
| `src/lib/goddesses.ts` | Goddess names, descriptions, values |
| `src/lib/goddess-powers.ts` | Power detection logic (`getGoddessPowers()`) |
| `src/app/api/cron/portfolio-reward/route.ts` | Wealth & Time powers implementation |
| `src/app/api/game/reveal-avatar-short/route.ts` | Knowledge power implementation |
| `src/app/api/game/create-npc/route.ts` | Fate power (NPC creation) implementation |
| `src/app/api/game/mass-hire-fee/route.ts` | Fate power (mass hire) implementation |
| `src/app/api/game/break-partnership/route.ts` | War power implementation |

### Bonus Cards
| File | Purpose |
|------|---------|
| `src/lib/bonus-cards.ts` | Bonus card names, descriptions, images |
| `src/app/api/cron/bonus-cards/route.ts` | **NEW: Hourly power application** |
| `src/app/api/game/init-bonus-cards/route.ts` | Creates bonus cards as protected NPCs |
| `src/app/api/game/bonus-cards/route.ts` | Fetches bonus cards with ownership info |
| `src/actions/purchasePlayer.ts` | Free hire + 3h block logic for bonus cards |
| `src/app/api/game/break-partnership/route.ts` | Unbreakable block enforcement |
| `src/app/api/game/boost-value/route.ts` | Blocks value boosting for bonus cards |
| `src/app/api/game/boost-card/route.ts` | Blocks boost-card for bonus cards |
| `src/lib/avatar-utils.ts` | Always-visible avatar logic |
| `src/components/PlayerCard.tsx` | Bonus card UI rendering |
| `src/components/OwnershipList.tsx` | Locked UI for bonus cards |

---

## 6. CRON JOB SCHEDULE (Relevant to Powers)

| Cron Job | Schedule | Related Powers |
|----------|----------|----------------|
| `portfolio-reward` | Every 2 minutes | Wealth (2x rewards), Time (2x frequency) |
| `rank-bonus` | Every 1 minute | Rank-based bonuses |
| `boss-tax` | Every hour | Wealth (2x boss tax) |
| `bonus-cards` | Every hour | Bonus Own Value, Bonus Owned Players, Bonus Player Slot |

**All bonus card powers are now automated via the `bonus-cards` cron job.**

---

## 7. IMPLEMENTATION COMPLETE

### Bonus Cards Powers - Now Fully Automated

The `bonus-cards` cron job (`src/app/api/cron/bonus-cards/route.ts`) runs hourly and:

1. **Bonus Own Value**: Increases owner's `playerValue` by 1% using BigInt arithmetic (capped at `PG_BIGINT_MAX`)
2. **Bonus Owned Players**: Increases all owned players' `playerValue` by 1% using BigInt arithmetic (capped at `PG_BIGINT_MAX`)
3. **Bonus Player Slot**: Adds +1 to owner's `hireSlots` column

### Vercel Configuration Updated

The `vercel.json` now includes:
```json
{
  "path": "/api/cron/bonus-cards",
  "schedule": "0 * * * *"
}
```

### Safety Features

- **BigInt arithmetic** prevents overflow when values are extremely large
- **Capping at PG_BIGINT_MAX** prevents database overflow
- **Individual error handling** per bonus card type ensures one failure doesn't block others
- **Rate limiting** via `lastBonusCardsTime` prevents duplicate runs
- **CRON_SECRET authentication** for security

---

**END OF REPORT**
