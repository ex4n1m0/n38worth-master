import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, inArray, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { PROFESSIONS } from "@/lib/professions";
import { MISSIONS } from "@/lib/missions";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { getGoddessPowers } from "@/lib/goddess-powers";

export const PROFESSION_NAMES = PROFESSIONS.map((p) => p.name);

export interface OwnedCard {
  id: number;
  username: string;
  profession: string | null;
  value: number;
  isNpc: boolean;
  blocked: boolean; // ownership block still active (can't sell yet)
}

export interface BuyCandidate {
  targetId: number;
  username: string;
  profession: string;
  value: number; // ~= cost at blockDurationHours=1
  photoScore: number; // Unsplash likes — "how good the photo looks" proxy
  hasOwner: boolean; // true when stealing from a current owner
  ownerIsHuman: boolean; // true when the current owner is a human player
}

export interface GoddessCandidate {
  targetId: number;
  username: string;
  cost: number;
  affordable: boolean;
}

export interface ComboCandidate {
  playerIds: number[];
  sumValue: number;
  estimatedReward: number;
}

export interface GrowthCandidate {
  targetId: number;
  username: string;
  value: number; // ~= cost at blockDurationHours=1
  photoScore: number; // Unsplash likes — "how good the photo looks" proxy
  hasOwner: boolean;
  ownerIsHuman: boolean;
}

export interface BreakCandidate {
  targetId: number;
  username: string;
  profession: string | null;
  value: number; // player's current value
  breakCost: number; // total cost (break fee + hire cost)
  isFateSealed: boolean; // true if owner has Fate power (1000x cost)
  ownerName: string | null;
  blockRemainingMs: number;
}

export interface AgentStrategy {
  agentId: number;
  credits: number;
  owned: OwnedCard[];
  ownedProfessions: string[]; // distinct, non-null professions currently owned
  buyCandidates: BuyCandidate[]; // best (owned-first, cheapest) card per missing profession
  growthCandidates: GrowthCandidate[]; // any acquirable card, bought purely to grow the roster
  breakCandidates: BreakCandidate[]; // cards under sell blocks that can be broken (steal by force)
  goddessCandidates: GoddessCandidate[]; // UNLOCKED goddesses not yet owned & currently acquirable
  lockedGoddesses: string[]; // goddesses still locked for purchase (unlock by climbing missions)
  comboCandidate: ComboCandidate | null; // present only when a sellable 6-combo exists
  ownedCount: number; // total cards owned (drives mission ladder)
  ownedGoddessCount: number; // goddesses owned (6 => win countdown)
  missionLevel: number; // current marketplace mission index
  nextMissionThreshold: number | null; // owned-count needed for the next mission reward
  hireSlots: number; // max cards the Agent can own
  slotsRemaining: number; // hireSlots - ownedCount (0 => can't hire, cap is fixed)
  atHireLimit: boolean; // true when slotsRemaining <= 0
  hasWar: boolean; // true if Agent has Goddess of War (free break blocks)
}

/**
 * Builds the Agent's current game state and the set of legal, profitable
 * candidate actions. The runner (LLM or heuristic) only ever picks from these,
 * and every action is independently re-validated by the action cores.
 *
 * Strategy: aggressively grow the roster (preferring to STEAL owned cards,
 * cheapest -> most expensive, before buying ownerless NPCs) to climb the
 * mission ladder and pursue the 6 distinct professions for combo sales. The
 * Agent is barred from BUYING goddesses and bonus cards, so the runner only
 * picks among buyCandidates / growthCandidates / comboCandidate (plus the
 * BUY_SLOTS / CREATE_NPC action cards). `goddessCandidates` is always empty.
 */
export async function buildStrategy(agentId: number): Promise<AgentStrategy> {
  // Agent credits + mission progress + hire capacity
  const [agent] = await db
    .select({
      credits: users.credits,
      missionLevel: users.missionLevel,
      hireSlots: users.hireSlots,
    })
    .from(users)
    .where(eq(users.id, agentId));
  const credits = Number(agent?.credits ?? 0);
  const missionLevel = Number(agent?.missionLevel ?? 0);
  const hireSlots = Number(agent?.hireSlots ?? 20);
  const nextMissionThreshold =
    missionLevel < MISSIONS.length ? MISSIONS[missionLevel].threshold : null;

  // Owned roster (join ownership for the block status)
  const ownedRows = await db
    .select({
      id: users.id,
      username: users.username,
      profession: users.profession,
      value: users.playerValue,
      isNpc: users.isNpc,
      blockSellUntil: ownership.blockSellUntil,
    })
    .from(ownership)
    .innerJoin(users, eq(users.id, ownership.ownedId))
    .where(eq(ownership.ownerId, agentId));

  const now = Date.now();
  const owned: OwnedCard[] = ownedRows.map((r) => ({
    id: r.id,
    username: r.username,
    profession: r.profession,
    value: Number(r.value),
    isNpc: r.isNpc === 1,
    blocked: !!r.blockSellUntil && new Date(r.blockSellUntil).getTime() > now,
  }));

  const ownedProfessions = Array.from(
    new Set(owned.filter((c) => !!c.profession).map((c) => c.profession as string))
  );

  // Missing professions = the 6 canonical professions we don't yet own.
  const missingProfessions = PROFESSION_NAMES.filter((p) => !ownedProfessions.includes(p));

  // For each missing profession, pick the best acquisition target. Ordering:
  // OWNED cards first (steal from current owners), then MOST EXPENSIVE first --
  // stealing pricey cards pumps their value faster and keeps the game lively.
  // Restricted to cards the Agent can currently afford (cost = playerValue at
  // blockDurationHours=1) so progression never stalls on an unaffordable target;
  // when no owned card is affordable it falls back to the priciest affordable
  // ownerless NPC. Goddesses/bonus cards have a null profession so they are
  // naturally excluded here. We skip protected and onboarding-pool cards, the
  // Agent itself, cards the Agent already owns, and any card whose current owner
  // still holds an active (un-stealable) sell block.
  const ownerUser = alias(users, "owner_user");
  const buyCandidates: BuyCandidate[] = [];
  for (const profession of missingProfessions) {
    const [cand] = await db
      .select({
        id: users.id,
        username: users.username,
        value: users.playerValue,
        photoScore: users.photoScore,
        ownerId: ownership.ownerId,
        ownerIsNpc: ownerUser.isNpc,
      })
      .from(users)
      .leftJoin(ownership, eq(ownership.ownedId, users.id))
      .leftJoin(ownerUser, eq(ownerUser.id, ownership.ownerId))
      .where(
        sql`${users.profession} = ${profession}
          AND ${users.isProtected} = 0
          AND ${users.isOnboardingPool} = 0
          AND ${users.id} <> ${agentId}
          AND ${users.playerValue} <= ${credits}
          AND (${ownership.ownerId} IS NULL OR ${ownership.ownerId} <> ${agentId})
          AND (${ownership.blockSellUntil} IS NULL OR ${ownership.blockSellUntil} <= NOW())`
      )
      // Steal owned cards first, then PRETTIEST photo first (photoScore), with
      // card value as the tie-break.
      .orderBy(
        sql`(CASE WHEN ${ownership.ownerId} IS NOT NULL THEN 0 ELSE 1 END) ASC, ${users.photoScore} DESC, ${users.playerValue} DESC`
      )
      .limit(1);
    if (cand) {
      buyCandidates.push({
        targetId: cand.id,
        username: cand.username,
        profession,
        value: Number(cand.value),
        photoScore: Number(cand.photoScore ?? 0),
        hasOwner: cand.ownerId != null,
        ownerIsHuman: cand.ownerId != null && cand.ownerIsNpc === 0,
      });
    }
  }

  // Goddesses are NOT purchasable by the Agent. We still read the goddess rows
  // to report how many the Agent already owns (context/telemetry), but the Agent
  // never buys goddesses — so no goddess buy candidates are ever produced.
  const goddessRows = await db
    .select({
      id: users.id,
      ownerId: ownership.ownerId,
    })
    .from(users)
    .leftJoin(ownership, eq(ownership.ownedId, users.id))
    .where(inArray(users.username, GODDESS_USERNAMES));

  const ownedGoddessCount = goddessRows.filter((g) => g.ownerId === agentId).length;
  // Agent is barred from buying goddesses AND bonus cards. Goddess candidates are
  // always empty; buy/growth candidates already exclude bonus cards below.
  const goddessCandidates: GoddessCandidate[] = [];
  const lockedGoddesses: string[] = [];

  // Growth / accumulation targets: ANY acquirable card (regardless of
  // profession) bought purely to grow the owned-card count. Climbing the
  // mission ladder awards goddess cards (at 1000/2000/3000/4000/5000 owned, plus
  // the final "Goddess" at 6,000 owned), and owning all 6 goddesses wins the game
  // — so accumulating cards is itself a path to victory. Excludes goddesses and
  // bonus cards (acquired/earned via
  // their own paths), protected and onboarding-pool cards, the Agent itself,
  // cards it already owns, and any card under an active sell block by another
  // owner. Affordable only; owned-first (steal) then priciest (pumps values).
  const excludedUsernames = [...GODDESS_USERNAMES];
  const growthRows = await db
    .select({
      id: users.id,
      username: users.username,
      value: users.playerValue,
      photoScore: users.photoScore,
      ownerId: ownership.ownerId,
      ownerIsNpc: ownerUser.isNpc,
    })
    .from(users)
    .leftJoin(ownership, eq(ownership.ownedId, users.id))
    .leftJoin(ownerUser, eq(ownerUser.id, ownership.ownerId))
    .where(
      sql`${users.isProtected} = 0
        AND ${users.isOnboardingPool} = 0
        AND ${users.id} <> ${agentId}
        AND ${users.playerValue} <= ${credits}
        AND ${users.username} NOT IN (${sql.join(
          excludedUsernames.map((u) => sql`${u}`),
          sql`, `
        )})
        AND (${ownership.ownerId} IS NULL OR ${ownership.ownerId} <> ${agentId})
        AND (${ownership.blockSellUntil} IS NULL OR ${ownership.blockSellUntil} <= NOW())`
    )
    // Steal owned cards first, then PRETTIEST photo first (photoScore), with
    // card value as the tie-break.
    .orderBy(
      sql`(CASE WHEN ${ownership.ownerId} IS NOT NULL THEN 0 ELSE 1 END) ASC, ${users.photoScore} DESC, ${users.playerValue} DESC`
    )
    .limit(8);

  const growthCandidates: GrowthCandidate[] = growthRows.map((r) => ({
    targetId: r.id,
    username: r.username,
    value: Number(r.value),
    photoScore: Number(r.photoScore ?? 0),
    hasOwner: r.ownerId != null,
    ownerIsHuman: r.ownerId != null && r.ownerIsNpc === 0,
  }));

  // Break candidates: cards under an active sell block that the Agent could
  // break by force. Excludes goddesses, bonus cards, the Agent itself, and
  // cards the Agent already owns. The break cost = break fee + hire cost.
  // For Fate-sealed cards (block > 30 days), the break fee is 1000× value.
  // For normal blocks, break fee = ceil(hoursRemaining) × value. War power
  // waives the normal break fee (but NOT the Fate fee). Only affordable cards
  // are included. Limited to 6 candidates, sorted by value descending.
  const breakRows = await db
    .select({
      id: users.id,
      username: users.username,
      profession: users.profession,
      value: users.playerValue,
      ownerId: ownership.ownerId,
      ownerName: ownerUser.username,
      blockSellUntil: ownership.blockSellUntil,
      blockUnbreakableUntil: ownership.blockUnbreakableUntil,
    })
    .from(users)
    .innerJoin(ownership, eq(ownership.ownedId, users.id))
    .leftJoin(ownerUser, eq(ownerUser.id, ownership.ownerId))
    .where(
      sql`${users.isProtected} = 0
        AND ${users.isOnboardingPool} = 0
        AND ${users.id} <> ${agentId}
        AND ${ownership.ownerId} <> ${agentId}
        AND ${ownership.blockSellUntil} > NOW()
        AND (${ownership.blockUnbreakableUntil} IS NULL OR ${ownership.blockUnbreakableUntil} <= NOW())
        AND ${users.username} NOT IN (${sql.join(
          excludedUsernames.map((u) => sql`${u}`),
          sql`, `
        )})`
    )
    .orderBy(desc(users.playerValue))
    .limit(20);

  // Check which owners have Fate power (for 1000x break cost).
  const ownerIds = [...new Set(breakRows.map((r) => r.ownerId).filter((id): id is number => id != null))];
  const ownerFateMap = new Map<number, boolean>();
  for (const oid of ownerIds) {
    try {
      const powers = await getGoddessPowers(oid);
      ownerFateMap.set(oid, powers.hasFate);
    } catch {
      ownerFateMap.set(oid, false);
    }
  }

  // Check if the Agent itself has War power (free breaks).
  let agentHasWar = false;
  try {
    const agentPowers = await getGoddessPowers(agentId);
    agentHasWar = agentPowers.hasWar;
  } catch { /* best-effort */ }

  const breakCandidates: BreakCandidate[] = [];
  for (const r of breakRows) {
    const blockEnd = r.blockSellUntil ? new Date(r.blockSellUntil).getTime() : 0;
    const remainingMs = Math.max(0, blockEnd - now);
    const isFateSealed = remainingMs > 30 * 24 * 60 * 60 * 1000; // > 30 days = Fate seal
    const ownerHasFate = r.ownerId != null && (ownerFateMap.get(r.ownerId) ?? false);

    let breakFee: number;
    if (isFateSealed || ownerHasFate) {
      breakFee = Number(r.value) * 1000;
    } else if (agentHasWar) {
      breakFee = 0;
    } else {
      const hoursRemaining = Math.ceil(remainingMs / (60 * 60 * 1000));
      breakFee = hoursRemaining * Number(r.value);
    }

    const totalCost = breakFee + Number(r.value);
    if (totalCost > credits) continue; // only affordable breaks

    breakCandidates.push({
      targetId: r.id,
      username: r.username,
      profession: r.profession,
      value: Number(r.value),
      breakCost: totalCost,
      isFateSealed: isFateSealed || ownerHasFate,
      ownerName: r.ownerName,
      blockRemainingMs: remainingMs,
    });
    if (breakCandidates.length >= 6) break;
  }

  // Combo: pick one owned, currently-sellable (unblocked) card per distinct
  // profession. A sellable 6-combo requires 6 distinct professions all unblocked.
  const comboPick: OwnedCard[] = [];
  const usedProfessions = new Set<string>();
  for (const card of owned) {
    if (!card.profession || card.blocked) continue;
    if (usedProfessions.has(card.profession)) continue;
    usedProfessions.add(card.profession);
    comboPick.push(card);
    if (comboPick.length === 6) break;
  }

  let comboCandidate: ComboCandidate | null = null;
  if (comboPick.length === 6) {
    const sumValue = comboPick.reduce((s, c) => s + c.value, 0);
    comboCandidate = {
      playerIds: comboPick.map((c) => c.id),
      sumValue,
      estimatedReward: sumValue * 10,
    };
  }

  const ownedCount = owned.length;
  const slotsRemaining = hireSlots - ownedCount;

  return {
    agentId,
    credits,
    owned,
    ownedProfessions,
    buyCandidates,
    growthCandidates,
    breakCandidates,
    goddessCandidates,
    lockedGoddesses,
    comboCandidate,
    ownedCount,
    ownedGoddessCount,
    missionLevel,
    nextMissionThreshold,
    hireSlots,
    slotsRemaining,
    hasWar: agentHasWar,
    atHireLimit: slotsRemaining <= 0,
  };
}
