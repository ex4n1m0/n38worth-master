import { randomInt } from "crypto";
import { db } from "@/db";
import { users, gameSettings, rewardHistory, crewLineups, crewBattles, crewBattleRecords } from "@/db/schema";
import { eq, and, sql, desc, inArray, ne } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";
import { getCrewRoster } from "@/lib/crew-job-service";
import { CREW_POT_FLOOR, CREW_POT_SETTING_KEY } from "@/lib/crew-jobs";
import {
  ATTACK_COOLDOWN_MS,
  DEFENSE_REWARD_FROM_POT,
  prizeEligible,
  ELO_K_ATTACKER,
  ELO_K_DEFENDER,
  ELO_BASE,
  LINEUP_SIZE,
  PRIZE_FROM_POT,
  bandOf,
  eloUpdate,
  simulateBattle,
  type BattleCard,
} from "@/lib/crew-battle";

/**
 * Crew Battles service — lineup snapshots, band-parity matchmaking, and the
 * attack executor. Money rules: the entry fee is burned; the win prize and
 * the successful-defense reward are paid from the recycled Crew Pot with the
 * same CAS guards as crew jobs (never below the pot floor, never minted).
 */

async function readPot(): Promise<number> {
  const [row] = await db
    .select({ value: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, CREW_POT_SETTING_KEY));
  return Number(row?.value ?? 0);
}

/** CAS pot debit for `amount` — true only when it actually landed. */
async function debitPot(amount: number): Promise<boolean> {
  if (amount <= 0) return true;
  const rows = await db
    .update(gameSettings)
    .set({ settingValue: sql`${gameSettings.settingValue} - ${amount}`, updatedAt: new Date() })
    .where(
      and(
        eq(gameSettings.settingKey, CREW_POT_SETTING_KEY),
        sql`${gameSettings.settingValue} >= ${amount + CREW_POT_FLOOR}`
      )
    )
    .returning({ id: gameSettings.id });
  return rows.length > 0;
}

async function getRecord(userId: number) {
  const [row] = await db
    .select()
    .from(crewBattleRecords)
    .where(eq(crewBattleRecords.userId, userId));
  if (row) return row;
  const [created] = await db
    .insert(crewBattleRecords)
    .values({ userId, rating: ELO_BASE })
    .onConflictDoNothing()
    .returning();
  return (
    created ?? {
      id: 0,
      userId,
      wins: 0,
      losses: 0,
      streak: 0,
      rating: ELO_BASE,
      updatedAt: new Date(),
    }
  );
}

// ── lineup ──

export async function saveLineup(
  userId: number,
  cardIds: number[]
): Promise<{ error?: string; lineup?: BattleCard[]; band?: number }> {
  if (!Array.isArray(cardIds) || cardIds.length !== LINEUP_SIZE || new Set(cardIds).size !== LINEUP_SIZE) {
    return { error: `Lineup must be exactly ${LINEUP_SIZE} distinct buildings` };
  }
  const roster = await getCrewRoster(userId);
  const byId = new Map(roster.map((c) => [c.id, c]));
  const lineup: BattleCard[] = [];
  for (const id of cardIds) {
    const card = byId.get(id);
    if (!card) return { error: "Lineup includes a building you do not own" };
    lineup.push({ id: card.id, u: card.u, f: card.f, t: card.t, p: card.p });
  }
  const band = bandOf(lineup).index;
  await db
    .insert(crewLineups)
    .values({ userId, cards: lineup, band, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: crewLineups.userId,
      set: { cards: lineup, band, updatedAt: new Date() },
    });
  return { lineup, band };
}

// ── view ──

export interface BattlesView {
  myLineup: { cards: BattleCard[]; band: number; updatedAt: string } | null;
  myRecord: { wins: number; losses: number; streak: number; rating: number };
  targets: { userId: number; username: string; rating: number; wins: number; losses: number; cards: BattleCard[] }[];
  recent: { id: number; opponent: string; won: boolean; prize: number; createdAt: string; direction: "out" | "in" }[];
  ladder: { username: string; rating: number; wins: number; losses: number }[];
  pot: number;
  cooldownEndAt: number | null;
}

export async function getBattlesView(userId: number): Promise<BattlesView> {
  const [lineupRow] = await db.select().from(crewLineups).where(eq(crewLineups.userId, userId));
  const record = await getRecord(userId);
  const pot = await readPot();

  // Targets: saved ghosts in MY band, excluding me, random 3, with records.
  let targets: BattlesView["targets"] = [];
  if (lineupRow) {
    const rows = await db
      .select({
        userId: crewLineups.userId,
        cards: crewLineups.cards,
        username: users.username,
      })
      .from(crewLineups)
      .innerJoin(users, eq(crewLineups.userId, users.id))
      .where(and(eq(crewLineups.band, lineupRow.band), ne(crewLineups.userId, userId), eq(users.isActive, 1)))
      .orderBy(sql`random()`)
      .limit(3);
    const ids = rows.map((r) => r.userId);
    const recs = ids.length
      ? await db.select().from(crewBattleRecords).where(inArray(crewBattleRecords.userId, ids))
      : [];
    const recMap = new Map(recs.map((r) => [r.userId, r]));
    targets = rows.map((r) => ({
      userId: r.userId,
      username: r.username,
      rating: recMap.get(r.userId)?.rating ?? ELO_BASE,
      wins: recMap.get(r.userId)?.wins ?? 0,
      losses: recMap.get(r.userId)?.losses ?? 0,
      cards: r.cards,
    }));
  }

  // Recent battles involving me (both directions).
  const battleRows = await db
    .select({
      id: crewBattles.id,
      attackerId: crewBattles.attackerId,
      defenderId: crewBattles.defenderId,
      winnerId: crewBattles.winnerId,
      prize: crewBattles.prize,
      createdAt: crewBattles.createdAt,
    })
    .from(crewBattles)
    .where(sql`(${crewBattles.attackerId} = ${userId} OR ${crewBattles.defenderId} = ${userId})`)
    .orderBy(desc(crewBattles.createdAt))
    .limit(10);
  const otherIds = [
    ...new Set(battleRows.map((b) => (b.attackerId === userId ? b.defenderId : b.attackerId))),
  ];
  const others = otherIds.length
    ? await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, otherIds))
    : [];
  const nameMap = new Map(others.map((o) => [o.id, o.username]));
  const recent = battleRows.map((b) => ({
    id: b.id,
    opponent: nameMap.get(b.attackerId === userId ? b.defenderId : b.attackerId) ?? "?",
    won: b.winnerId === userId,
    prize: Number(b.prize),
    createdAt: b.createdAt.toISOString(),
    direction: b.attackerId === userId ? ("out" as const) : ("in" as const),
  }));

  // Ladder: top 10 by rating among players with a battle or a lineup.
  const ladderRows = await db
    .select({
      username: users.username,
      rating: crewBattleRecords.rating,
      wins: crewBattleRecords.wins,
      losses: crewBattleRecords.losses,
    })
    .from(crewBattleRecords)
    .innerJoin(users, eq(crewBattleRecords.userId, users.id))
    .where(sql`${crewBattleRecords.wins} + ${crewBattleRecords.losses} > 0`)
    .orderBy(desc(crewBattleRecords.rating))
    .limit(10);

  // Attack cooldown from my latest attack.
  const [lastAttack] = await db
    .select({ createdAt: crewBattles.createdAt })
    .from(crewBattles)
    .where(eq(crewBattles.attackerId, userId))
    .orderBy(desc(crewBattles.createdAt))
    .limit(1);
  const cooldownEnd = lastAttack ? lastAttack.createdAt.getTime() + ATTACK_COOLDOWN_MS : null;

  return {
    myLineup: lineupRow
      ? { cards: lineupRow.cards, band: lineupRow.band, updatedAt: lineupRow.updatedAt.toISOString() }
      : null,
    myRecord: { wins: record.wins, losses: record.losses, streak: record.streak, rating: record.rating },
    targets,
    recent,
    ladder: ladderRows,
    pot,
    cooldownEndAt: cooldownEnd && cooldownEnd > Date.now() ? cooldownEnd : null,
  };
}

// ── attack ──

export interface AttackResult {
  success?: true;
  error?: string;
  battle?: {
    id: number;
    won: boolean;
    rounds: number;
    prize: number;
    log: unknown[];
    units: unknown[];
    attackerRating: number;
    defenderRating: number;
  };
}

export async function attackLineup(userId: number, targetUserId: number): Promise<AttackResult> {
  if (userId === targetUserId) return { error: "You cannot attack your own crew" };

  const [myLineup] = await db.select().from(crewLineups).where(eq(crewLineups.userId, userId));
  if (!myLineup) return { error: "Save a defense lineup first" };
  const [targetLineup] = await db.select().from(crewLineups).where(eq(crewLineups.userId, targetUserId));
  if (!targetLineup) return { error: "Target has no lineup" };
  if (targetLineup.band !== myLineup.band) {
    return { error: "Target is outside your battle band" };
  }

  // Anti-farming (review F1): the target must be an active player, and the
  // same defender can't be farmed repeatedly.
  const [targetUser] = await db
    .select({ isActive: users.isActive, username: users.username })
    .from(users)
    .where(eq(users.id, targetUserId));
  if (!targetUser || targetUser.isActive !== 1) return { error: "Target not found" };
  const [repeat] = await db
    .select({ createdAt: crewBattles.createdAt })
    .from(crewBattles)
    .where(
      and(
        eq(crewBattles.attackerId, userId),
        eq(crewBattles.defenderId, targetUserId),
        sql`${crewBattles.createdAt} > now() - interval '1 hour'`
      )
    )
    .limit(1);
  if (repeat) return { error: "You just fought this crew — find another mark" };

  const [lastAttack] = await db
    .select({ createdAt: crewBattles.createdAt })
    .from(crewBattles)
    .where(eq(crewBattles.attackerId, userId))
    .orderBy(desc(crewBattles.createdAt))
    .limit(1);
  if (lastAttack && Date.now() < lastAttack.createdAt.getTime() + ATTACK_COOLDOWN_MS) {
    return { error: "Crews are repositioning — try again in a minute" };
  }

  const band = bandOf(myLineup.cards);
  const fee = band.fee;
  const prize = Math.floor(fee * PRIZE_FROM_POT);
  const defenseReward = Math.floor(fee * DEFENSE_REWARD_FROM_POT);

  // Pot must cover the prize (and the defense reward) before we burn a fee.
  const pot = await readPot();
  if (pot < prize + defenseReward + CREW_POT_FLOOR) {
    return { error: "The crew pot can't cover this battle — try again later" };
  }

  // Burn-collect the entry fee (review F2 ruling: the fee is RECYCLED into
  // the pot, not destroyed — battles become self-funding while staying a
  // net money-supply sink of 0.1×fee per battle).
  const feePaid = await db
    .update(users)
    .set({ credits: sql`credits - ${fee}`, updatedAt: new Date() })
    .where(and(eq(users.id, userId), sql`credits >= ${fee}`))
    .returning({ id: users.id });
  if (feePaid.length === 0) return { error: `Entry fee is ${fee}¢ — not enough capital` };
  await db
    .insert(gameSettings)
    .values({ settingKey: CREW_POT_SETTING_KEY, settingValue: fee, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: gameSettings.settingKey,
      set: { settingValue: sql`${gameSettings.settingValue} + ${fee}`, updatedAt: new Date() },
    });

  // Resolve against the target's SAVED ghost.
  const seed = randomInt(1, 2 ** 31);
  const result = simulateBattle(myLineup.cards, targetLineup.cards, seed);
  const attackerWon = result.winner === "A";

  // Elo for the prize gate (F1): one-sided wins pay nothing.
  const gateMyRec = await getRecord(userId);
  const gateTheirRec = await getRecord(targetUserId);
  const eligible = prizeEligible(gateMyRec.rating, gateTheirRec.rating);

  // Pot payouts (CAS; a failed debit just means a smaller/no prize — the
  // battle still stands and is recorded).
  let prizePaid = 0;
  let defensePaid = 0;
  if (attackerWon) {
    if (eligible && (await debitPot(prize))) {
      prizePaid = prize;
      await db
        .update(users)
        .set({ credits: sql`LEAST(credits + ${prize}, ${sql.raw(MAX_CREDITS_SQL)})`, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }
  } else {
    if (await debitPot(defenseReward)) {
      defensePaid = defenseReward;
      await db
        .update(users)
        .set({ credits: sql`LEAST(credits + ${defenseReward}, ${sql.raw(MAX_CREDITS_SQL)})`, updatedAt: new Date() })
        .where(eq(users.id, targetUserId));
    }
  }

  // Elo + records (both sides move; defender at half K).
  const myRec = gateMyRec;
  const theirRec = gateTheirRec;
  const myUpdate = eloUpdate(myRec.rating, theirRec.rating, attackerWon ? 1 : 0, ELO_K_ATTACKER);
  const theirUpdate = eloUpdate(theirRec.rating, myRec.rating, attackerWon ? 0 : 1, ELO_K_DEFENDER);
  for (const [uid, rec, upd, won] of [
    [userId, myRec, myUpdate, attackerWon],
    [targetUserId, theirRec, theirUpdate, !attackerWon],
  ] as const) {
    await db
      .insert(crewBattleRecords)
      .values({
        userId: uid,
        wins: won ? 1 : 0,
        losses: won ? 0 : 1,
        streak: won ? 1 : -1,
        rating: upd.rating,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: crewBattleRecords.userId,
        set: {
          wins: sql`${crewBattleRecords.wins} + ${won ? 1 : 0}`,
          losses: sql`${crewBattleRecords.losses} + ${won ? 0 : 1}`,
          streak: won
            ? sql`GREATEST(${crewBattleRecords.streak}, 0) + 1`
            : sql`LEAST(${crewBattleRecords.streak}, 0) - 1`,
          rating: upd.rating,
          updatedAt: new Date(),
        },
      });
  }

  // Audit + notifications.
  const winnerId = attackerWon ? userId : targetUserId;
  // Pusher payloads: each side's toast names the OTHER player (review F3).
  const [inserted] = await db
    .insert(crewBattles)
    .values({
      attackerId: userId,
      defenderId: targetUserId,
      attackerCards: myLineup.cards,
      defenderCards: targetLineup.cards,
      seed,
      winnerId,
      rounds: result.rounds,
      log: result.log,
      fee,
      prize: prizePaid,
      defenseReward: defensePaid,
    })
    .returning({ id: crewBattles.id });

  if (prizePaid > 0) {
    try {
      await db.insert(rewardHistory).values({
        userId,
        type: "crew_battle",
        amount: prizePaid,
        details: JSON.stringify({ battleId: inserted.id, vs: targetUserId }),
      });
    } catch {
      /* best-effort */
    }
  }

  try {
    await Promise.all([
      pusher.trigger(`player-${userId}`, "crew-battle-done", {
        won: attackerWon,
        prize: prizePaid,
        opponent: targetUser.username,
      }),
      pusher.trigger(`player-${targetUserId}`, "crew-battle-done", {
        won: !attackerWon,
        reward: defensePaid,
        opponent: (await db.select({ username: users.username }).from(users).where(eq(users.id, userId)))[0]?.username,
      }),
    ]);
  } catch {
    /* best-effort */
  }

  return {
    success: true,
    battle: {
      id: inserted.id,
      won: attackerWon,
      rounds: result.rounds,
      prize: prizePaid,
      log: result.log,
      units: result.units,
      attackerRating: myUpdate.rating,
      defenderRating: theirUpdate.rating,
    },
  };
}
