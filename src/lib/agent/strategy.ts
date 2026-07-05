import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { PROFESSIONS } from "@/lib/professions";
import { MISSIONS } from "@/lib/missions";
import { isPurchaseUnlockedAtLevel } from "@/lib/missions-data";
import { BONUS_CARD_USERNAMES } from "@/lib/bonus-cards";
import { getSlotCost, getCreateNpcState } from "@/lib/agent/actions";
import {
  GODDESS_USERNAMES,
  MOST_EXPENSIVE_GODDESS,
  MOST_EXPENSIVE_GODDESS_ECONOMY_SHARE,
  MOST_EXPENSIVE_GODDESS_MIN_VALUE,
} from "@/lib/goddesses";

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

export interface AgentStrategy {
  agentId: number;
  credits: number;
  owned: OwnedCard[];
  ownedProfessions: string[]; // distinct, non-null professions currently owned
  buyCandidates: BuyCandidate[]; // best (owned-first, cheapest) card per missing profession
  growthCandidates: GrowthCandidate[]; // any acquirable card, bought purely to grow the roster
  goddessCandidates: GoddessCandidate[]; // UNLOCKED goddesses not yet owned & currently acquirable
  lockedGoddesses: string[]; // goddesses still locked for purchase (unlock by climbing missions)
  comboCandidate: ComboCandidate | null; // present only when a sellable 6-combo exists
  ownedCount: number; // total cards owned (drives mission ladder)
  ownedGoddessCount: number; // goddesses owned (6 => win countdown)
  missionLevel: number; // current marketplace mission index
  nextMissionThreshold: number | null; // owned-count needed for the next mission reward
  hireSlots: number; // max cards the Agent can own
  slotsRemaining: number; // hireSlots - ownedCount (0 => can't hire until expanded)
  atHireLimit: boolean; // true when slotsRemaining <= 0
  slotUpgrade: { cost: number; affordable: boolean }; // single-use "+10 Player Slots"
  createNpc: { cost: number; affordable: boolean; onCooldown: boolean }; // single-use "Create NPC"
}

/**
 * Builds the Agent's current game state and the set of legal, profitable
 * candidate actions. The runner (LLM or heuristic) only ever picks from these,
 * and every action is independently re-validated by the action cores.
 *
 * Strategy: aggressively grow the roster (preferring to STEAL owned cards,
 * cheapest -> most expensive, before buying ownerless NPCs) to climb the
 * mission ladder and pursue the 6 distinct professions for combo sales, while
 * also tracking goddess acquisition toward a possible win. The runner picks
 * among buyCandidates / goddessCandidates / comboCandidate.
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

  // Goddess acquisition targets (toward owning all 6 => win). Exclude goddesses
  // the Agent already owns and any currently blocked by another owner. The most
  // expensive goddess is priced as a share of the economy; the rest at value.
  const goddessRows = await db
    .select({
      id: users.id,
      username: users.username,
      value: users.playerValue,
      ownerId: ownership.ownerId,
      blockSellUntil: ownership.blockSellUntil,
    })
    .from(users)
    .leftJoin(ownership, eq(ownership.ownedId, users.id))
    .where(inArray(users.username, GODDESS_USERNAMES));

  const [econ] = await db
    .select({
      total: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 0 THEN credits ELSE 0 END), 0)`,
    })
    .from(users);
  const economy = Number(econ?.total ?? 0);

  const ownedGoddessCount = goddessRows.filter((g) => g.ownerId === agentId).length;
  const goddessCandidates: GoddessCandidate[] = [];
  const lockedGoddesses: string[] = [];
  for (const g of goddessRows) {
    if (g.ownerId === agentId) continue; // already owned
    // Mission lock: a goddess can only be BOUGHT once unlocked by completing the
    // mission that awards it. Locked goddesses are surfaced (lockedGoddesses) so
    // the Agent understands it must accumulate cards to unlock them, but they are
    // NOT offered as buy candidates (the purchase would be rejected anyway).
    if (!isPurchaseUnlockedAtLevel(g.username, missionLevel)) {
      lockedGoddesses.push(g.username);
      continue;
    }
    const blockedByOther =
      g.ownerId != null &&
      g.ownerId !== agentId &&
      !!g.blockSellUntil &&
      new Date(g.blockSellUntil).getTime() > now;
    if (blockedByOther) continue; // can't steal right now
    const cost =
      g.username === MOST_EXPENSIVE_GODDESS
        ? Math.max(MOST_EXPENSIVE_GODDESS_MIN_VALUE, Math.floor(economy * MOST_EXPENSIVE_GODDESS_ECONOMY_SHARE))
        : Number(g.value);
    goddessCandidates.push({
      targetId: g.id,
      username: g.username,
      cost,
      affordable: cost <= credits,
    });
  }

  // Growth / accumulation targets: ANY acquirable card (regardless of
  // profession) bought purely to grow the owned-card count. Climbing the
  // mission ladder awards goddess cards (at 100/200/300/400/500 owned, plus the
  // final "Goddess" at 10,000 owned), and owning all 6 goddesses wins the game
  // — so accumulating cards is itself a path to victory. Excludes goddesses and
  // bonus cards (acquired/earned via
  // their own paths), protected and onboarding-pool cards, the Agent itself,
  // cards it already owns, and any card under an active sell block by another
  // owner. Affordable only; owned-first (steal) then priciest (pumps values).
  const excludedUsernames = [...GODDESS_USERNAMES, ...BONUS_CARD_USERNAMES];
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

  // Single-use action cards the Agent may choose to use, just like a player.
  const ownedCount = owned.length;
  const slotsRemaining = hireSlots - ownedCount;
  const slotCost = getSlotCost(hireSlots);
  const npcState = await getCreateNpcState(agentId);

  return {
    agentId,
    credits,
    owned,
    ownedProfessions,
    buyCandidates,
    growthCandidates,
    goddessCandidates,
    lockedGoddesses,
    comboCandidate,
    ownedCount,
    ownedGoddessCount,
    missionLevel,
    nextMissionThreshold,
    hireSlots,
    slotsRemaining,
    atHireLimit: slotsRemaining <= 0,
    slotUpgrade: { cost: slotCost, affordable: slotCost <= credits },
    createNpc: {
      cost: npcState.cost,
      affordable: npcState.cost <= credits,
      onCooldown: npcState.onCooldown,
    },
  };
}
