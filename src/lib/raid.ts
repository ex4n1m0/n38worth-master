import { randomInt } from "crypto";
import { db } from "@/db";
import { users, ownership, raidState, raidLog, messages, gameHistory } from "@/db/schema";
import { eq, sql, and, gt, or, desc, inArray } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL, capCredits } from "@/lib/safeguards";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { isRemovedAgentUsername } from "@/lib/agent/roster";
import { maybeDropBlueprint } from "@/lib/blueprint-service";

/**
 * VAULT RAIDS — the social-raiding layer (GAME_INTEGRATION_STUDY §5A).
 *
 * A raid is a luck-flavored SECOND steal verb alongside the deterministic,
 * premium one (poaching the card itself). It never touches cards, values, or
 * ownership — only liquid CREDITS move. All rewards are clamped through the
 * safeguards (MAX_CREDITS) and the victim's exposure is capped.
 *
 * Design constants (v1, 2026-10-01):
 *  - Charges: lazy accrual, 1 per 8h, cap 3. Revenge grants +1 and may push
 *    one above the cap (cap 4). No cron — accrual is computed on read.
 *  - Resolution: 3 vault locks, each cracks with p=0.55 → loot multiplier
 *    0.2 / 0.6 / 1.0 / 1.4 by locks cracked.
 *  - Loot = (minted pool + victim share) × multiplier.
 *      pool = 0.5% of the ATTACKER's portfolio, clamped [100, 1e9] — scales
 *      with progression, bounded mint.
 *      victim share = 1% of the victim's liquid credits (0.5% if any of the
 *      victim's cards carries an active deed lock / iron deed — locks are the
 *      vault's shield), only if the victim holds ≥ 5000¢ (newbies never
 *      bleed), capped at 3× the pool.
 */

export const RAID_CHARGE_INTERVAL_MS = 8 * 60 * 60 * 1000; // 8h
export const RAID_CHARGE_CAP = 3;
export const RAID_REVENGE_CAP = 4; // revenge may hold one charge over the cap
export const RAID_LOCK_COUNT = 3;
export const RAID_LOCK_SUCCESS_P = 0.55;
export const RAID_LOCK_MULTIPLIERS = [0.2, 0.6, 1.0, 1.4] as const;

export const RAID_POOL_RATE = 0.005; // 0.5% of attacker portfolio
export const RAID_POOL_MIN = 100;
export const RAID_POOL_MAX = 1e9;
export const RAID_VICTIM_RATE = 0.01; // 1% of victim liquid credits
export const RAID_VICTIM_RATE_LOCKED = 0.005; // deed-locked victims shield half
export const RAID_VICTIM_CREDIT_FLOOR = 5000; // victims below this never lose credits
export const RAID_VICTIM_LOOT_CAP_MULT = 3; // victim share ≤ 3 × pool

/** Entry burn: a small SINK per raid (also taxes multi-account farming). */
export const RAID_ENTRY_BURN_MIN = 10;
export const RAID_ENTRY_BURN_RATE = 0.02; // 2% of the minted pool
/**
 * Revenge grants are limited to one per victim per cooldown window. Without
 * this, two cooperating accounts could alternate raids forever (each raid
 * spends 1 charge and hands the partner 1 back — charge-neutral, mint-positive).
 */
export const REVENGE_GRANT_COOLDOWN_MS = 8 * 60 * 60 * 1000;

export function raidEntryBurn(poolCredits: number): number {
  return Math.max(RAID_ENTRY_BURN_MIN, Math.floor(poolCredits * RAID_ENTRY_BURN_RATE));
}

/** Revenge only pays out when the victim actually bled AND isn't on cooldown. */
export function shouldGrantRevenge(
  victimCreditsLost: number,
  lastRevengeAt: number | null,
  now: number,
  cooldownMs: number = REVENGE_GRANT_COOLDOWN_MS
): boolean {
  if (victimCreditsLost <= 0) return false;
  if (lastRevengeAt == null) return true;
  return now - lastRevengeAt >= cooldownMs;
}

export const RAID_HISTORY_LIMIT = 20;
export const RAID_TARGET_COUNT = 6;

// ── Pure helpers (unit-tested in src/lib/__tests__/raid.test.ts) ──

export interface RaidChargeState {
  charges: number;
  nextChargeAt: number; // epoch ms
}

/**
 * Lazy energy accrual. While below the cap and the next charge is due, grant
 * it and schedule the following one. AT the cap the clock pauses: the next
 * charge is always a full interval away from now, so a player who banks
 * charges doesn't log in to an instantly-refilled meter after spending one.
 */
export function accrueRaidCharges(
  state: RaidChargeState,
  now: number,
  cap: number = RAID_CHARGE_CAP,
  interval: number = RAID_CHARGE_INTERVAL_MS
): RaidChargeState {
  let charges = state.charges;
  let nextChargeAt = state.nextChargeAt;
  while (charges < cap && now >= nextChargeAt) {
    charges += 1;
    nextChargeAt += interval;
  }
  if (charges >= cap) {
    nextChargeAt = now + interval;
  }
  return { charges, nextChargeAt };
}

/** Roll the lock picks server-side (crypto RNG — never client-supplied). */
export function rollLocks(count: number = RAID_LOCK_COUNT): boolean[] {
  const threshold = Math.round(RAID_LOCK_SUCCESS_P * 1000);
  return Array.from({ length: count }, () => randomInt(1000) < threshold);
}

export interface RaidLootBreakdown {
  locks: boolean[];
  locksCracked: number;
  multiplier: number;
  poolCredits: number;
  victimCredits: number;
  loot: number;
}

/**
 * Pure resolution. `rolls` is the server-generated lock outcome; the client
 * receives the same array to animate the reveal — the numbers are already
 * final before any animation starts.
 */
export function resolveRaid(input: {
  rolls: boolean[];
  attackerPortfolio: number;
  victimCredits: number;
  victimHasActiveLocks: boolean;
}): RaidLootBreakdown {
  const pool = Math.min(
    RAID_POOL_MAX,
    Math.max(RAID_POOL_MIN, Math.floor(input.attackerPortfolio * RAID_POOL_RATE))
  );

  let victimCredits = 0;
  if (input.victimCredits >= RAID_VICTIM_CREDIT_FLOOR) {
    const rate = input.victimHasActiveLocks ? RAID_VICTIM_RATE_LOCKED : RAID_VICTIM_RATE;
    victimCredits = Math.min(Math.floor(input.victimCredits * rate), pool * RAID_VICTIM_LOOT_CAP_MULT);
    if (victimCredits < 0) victimCredits = 0;
  }

  const locksCracked = input.rolls.filter(Boolean).length;
  const multiplier = RAID_LOCK_MULTIPLIERS[
    Math.min(locksCracked, RAID_LOCK_MULTIPLIERS.length - 1)
  ];
  const loot = capCredits(Math.floor((pool + victimCredits) * multiplier));

  return { locks: input.rolls, locksCracked, multiplier, poolCredits: pool, victimCredits, loot };
}

// ── DB service ──

export interface RaidStateView {
  charges: number;
  cap: number;
  nextChargeAt: number;
}

async function loadAccruedRaidState(userId: number): Promise<RaidStateView> {
  const now = Date.now();
  let [row] = await db.select().from(raidState).where(eq(raidState.userId, userId));

  if (!row) {
    await db
      .insert(raidState)
      .values({ userId, charges: RAID_CHARGE_CAP, nextChargeAt: new Date(now + RAID_CHARGE_INTERVAL_MS) })
      .onConflictDoNothing();
    [row] = await db.select().from(raidState).where(eq(raidState.userId, userId));
    return { charges: row?.charges ?? RAID_CHARGE_CAP, cap: RAID_CHARGE_CAP, nextChargeAt: row?.nextChargeAt.getTime() ?? now + RAID_CHARGE_INTERVAL_MS };
  }

  const accrued = accrueRaidCharges(
    { charges: row.charges, nextChargeAt: row.nextChargeAt.getTime() },
    now
  );
  if (accrued.charges !== row.charges || accrued.nextChargeAt !== row.nextChargeAt.getTime()) {
    // Compare-and-swap: never write charges computed from a stale read. If a
    // concurrent spend/revenge/accrual changed the row first, adopt ITS value
    // instead of resurrecting a charge someone just spent (there are no
    // transactions on neon-http, so the guard must live in the WHERE clause).
    const updated = await db
      .update(raidState)
      .set({ charges: accrued.charges, nextChargeAt: new Date(accrued.nextChargeAt), updatedAt: new Date(now) })
      .where(
        and(
          eq(raidState.userId, userId),
          eq(raidState.charges, row.charges),
          eq(raidState.nextChargeAt, row.nextChargeAt)
        )
      )
      .returning({ charges: raidState.charges, nextChargeAt: raidState.nextChargeAt });
    if (updated.length === 0) {
      const [fresh] = await db.select().from(raidState).where(eq(raidState.userId, userId));
      if (fresh) {
        return { charges: fresh.charges, cap: RAID_CHARGE_CAP, nextChargeAt: fresh.nextChargeAt.getTime() };
      }
    }
  }
  return { charges: accrued.charges, cap: RAID_CHARGE_CAP, nextChargeAt: accrued.nextChargeAt };
}

/** GET-model for the raid panel: current charges + recent raids by/against. */
export async function getRaidOverview(userId: number) {
  const [state, logRows] = await Promise.all([
    loadAccruedRaidState(userId),
    db
      .select({
        id: raidLog.id,
        attackerId: raidLog.attackerId,
        victimId: raidLog.victimId,
        locksCracked: raidLog.locksCracked,
        lootCredits: raidLog.lootCredits,
        victimCredits: raidLog.victimCredits,
        createdAt: raidLog.createdAt,
      })
      .from(raidLog)
      .where(
        sql`(${raidLog.attackerId} = ${userId} OR ${raidLog.victimId} = ${userId}) AND ${raidLog.createdAt} > now() - interval '7 days'`
      )
      .orderBy(desc(raidLog.createdAt))
      .limit(RAID_HISTORY_LIMIT),
  ]);

  // Resolve names for both sides of every row in one query.
  const ids = [...new Set(logRows.flatMap((r) => [r.attackerId, r.victimId]))];
  const nameRows = ids.length
    ? await db
        .select({ id: users.id, username: users.username, avatarUrl: users.avatarUrl })
        .from(users)
        .where(inArray(users.id, ids))
    : [];
  const names = new Map(nameRows.map((n) => [n.id, n]));

  return {
    ...state,
    history: logRows.map((r) => ({
      id: r.id,
      direction: r.attackerId === userId ? ("out" as const) : ("in" as const),
      other: names.get(r.attackerId === userId ? r.victimId : r.attackerId) ?? null,
      locksCracked: r.locksCracked,
      lootCredits: Number(r.lootCredits),
      victimCredits: Number(r.victimCredits),
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export interface RaidTargetCandidate {
  id: number;
  username: string;
  avatarUrl: string | null;
  playerValue: number;
  isNpc: number;
}

/** "Case a target" — visible, active players worth hitting. */
export async function getRaidTargets(userId: number): Promise<RaidTargetCandidate[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      playerValue: users.playerValue,
      isNpc: users.isNpc,
    })
    .from(users)
    .where(
      and(
        sql`${users.id} <> ${userId}`,
        eq(users.isActive, 1),
        eq(users.isOnboardingPool, 0),
        sql`(${users.isNpc} = 1 OR (${users.avatarUrl} IS NOT NULL AND ${users.avatarCompleted} = 1))`,
        sql`${users.username} NOT IN (${sql.join(GODDESS_USERNAMES.map((n) => sql`${n}`), sql`, `)})`,
        sql`${users.credits} >= ${RAID_VICTIM_CREDIT_FLOOR}`
      )
    )
    .orderBy(sql`random()`)
    .limit(RAID_TARGET_COUNT);
  return rows.filter((r) => !isRemovedAgentUsername(r.username));
}

/**
 * Attacker portfolio, computed with the CANONICAL owned-value expression
 * (textually identical to the portfolio-reward cron's query): Σ owned card
 * value × (1 + number of cards that card owns). The cron additionally
 * multiplies by GREATEST(ownerCount, 1) — how many players own the attacker —
 * which is always 1 under the current single-owner model (unique index on
 * ownership.owned_id) and would only ever RAISE the pool (conservative
 * direction if multi-owner ever returned). Never fork this formula.
 */
export async function getPortfolioValue(userId: number): Promise<number> {
  const [row] = await db
    .select({
      ownedValue: sql<number>`COALESCE(SUM(${users.playerValue} * (1 + COALESCE(sub.owned_count, 0))), 0)`,
    })
    .from(ownership)
    .innerJoin(users, eq(ownership.ownedId, users.id))
    .leftJoin(
      sql`(SELECT owner_id, COUNT(*) AS owned_count FROM ownership GROUP BY owner_id) AS sub`,
      sql`sub.owner_id = ${users.id}`
    )
    .where(eq(ownership.ownerId, userId));
  return Number(row?.ownedValue ?? 0);
}

export interface RaidExecuteResult {
  success?: true;
  error?: string;
  target?: { id: number; username: string; avatarUrl: string | null };
  locks?: boolean[];
  locksCracked?: number;
  multiplier?: number;
  loot?: number;
  poolCredits?: number;
  victimCredits?: number;
  chargesLeft?: number;
}

export async function executeRaid(attackerId: number, targetId: number): Promise<RaidExecuteResult> {
  if (attackerId === targetId) {
    return { error: "You cannot raid your own vault" };
  }

  const [attacker] = await db
    .select({ id: users.id, username: users.username, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, attackerId));
  if (!attacker) return { error: "Attacker not found" };

  const [target] = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      credits: users.credits,
      isActive: users.isActive,
      isNpc: users.isNpc,
      isOnboardingPool: users.isOnboardingPool,
      avatarCompleted: users.avatarCompleted,
    })
    .from(users)
    .where(eq(users.id, targetId));

  if (!target || isRemovedAgentUsername(target.username)) return { error: "Target not found" };
  if (!target.isActive) return { error: "Target is no longer active" };
  if (GODDESS_USERNAMES.includes(target.username)) {
    return { error: "The Founders' landmarks cannot be raided" };
  }
  if (target.isOnboardingPool) return { error: "Target not found" };
  if (target.isNpc !== 1 && !(target.avatarUrl && target.avatarCompleted === 1)) {
    return { error: "Target not found" };
  }

  // You cannot raid a building you own (recycling your own NPC's hoarded
  // credits to yourself + the pool mint would be a free faucet).
  const [selfOwned] = await db
    .select({ id: ownership.id })
    .from(ownership)
    .where(and(eq(ownership.ownerId, attackerId), eq(ownership.ownedId, targetId)))
    .limit(1);
  if (selfOwned) {
    return { error: "You cannot raid a building you own" };
  }

  // 1. Accrue + persist charges, then spend one atomically (race-safe).
  await loadAccruedRaidState(attackerId);
  const spendRows = await db
    .update(raidState)
    .set({
      charges: sql`${raidState.charges} - 1`,
      // Cap-pause semantics: leaving the cap restarts the refill clock.
      nextChargeAt: sql`CASE WHEN ${raidState.charges} >= ${RAID_CHARGE_CAP} THEN now() + interval '${sql.raw(String(RAID_CHARGE_INTERVAL_MS / 60000))} minutes' ELSE ${raidState.nextChargeAt} END`,
      updatedAt: new Date(),
    })
    .where(and(eq(raidState.userId, attackerId), sql`${raidState.charges} >= 1`))
    .returning({ charges: raidState.charges });
  if (spendRows.length === 0) {
    return { error: "No raid charges — wait for the next one" };
  }
  const chargesLeft = spendRows[0].charges;

  // 2. Does the victim run a locked vault? (any active deed lock / iron deed shields half)
  const [lockRow] = await db
    .select({ id: ownership.id })
    .from(ownership)
    .where(
      and(
        eq(ownership.ownerId, targetId),
        or(gt(ownership.blockSellUntil, new Date()), gt(ownership.permBlockUntil, new Date()))
      )
    )
    .limit(1);
  const victimHasActiveLocks = !!lockRow;

  // 3. Resolve (pure) — attacker portfolio scales the minted pool.
  const [portfolio, targetFresh] = await Promise.all([
    getPortfolioValue(attackerId),
    db.select({ credits: users.credits }).from(users).where(eq(users.id, targetId)),
  ]);
  const victimCreditsSnapshot = Number(targetFresh[0]?.credits ?? 0);

  const breakdown = resolveRaid({
    rolls: rollLocks(),
    attackerPortfolio: portfolio,
    victimCredits: victimCreditsSnapshot,
    victimHasActiveLocks,
  });

  // 4. Move credits. Entry burn first (sink), then victim (floored at 0),
  //    then attacker (capped).
  const entryBurn = raidEntryBurn(breakdown.poolCredits);
  if (entryBurn > 0) {
    await db
      .update(users)
      .set({ credits: sql`GREATEST(credits - ${entryBurn}, 0)`, updatedAt: new Date() })
      .where(eq(users.id, attackerId));
  }
  if (breakdown.victimCredits > 0) {
    await db
      .update(users)
      .set({ credits: sql`GREATEST(credits - ${breakdown.victimCredits}, 0)`, updatedAt: new Date() })
      .where(eq(users.id, targetId));
  }
  if (breakdown.loot > 0) {
    await db
      .update(users)
      .set({ credits: sql`LEAST(credits + ${breakdown.loot}, ${sql.raw(MAX_CREDITS_SQL)})`, updatedAt: new Date() })
      .where(eq(users.id, attackerId));
  }

  // 5. Audit + logs.
  await db.insert(raidLog).values({
    attackerId,
    victimId: targetId,
    locksCracked: breakdown.locksCracked,
    lootCredits: breakdown.loot,
    poolCredits: breakdown.poolCredits,
    victimCredits: breakdown.victimCredits,
  });
  await db.insert(gameHistory).values({
    eventType: "raid",
    actorId: attackerId,
    targetId,
    targetUsername: target.username,
    details: JSON.stringify({
      locksCracked: breakdown.locksCracked,
      loot: breakdown.loot,
      pool: breakdown.poolCredits,
      victimShare: breakdown.victimCredits,
      victimShielded: victimHasActiveLocks,
      entryBurn,
    }),
  });

  // 6. Revenge charge for the victim (may hold one over the cap) — ONLY when
  //    the victim actually lost credits AND they haven't been granted one in
  //    the cooldown window. Both gates exist to kill multi-account cycling
  //    (two alts alternating raids would otherwise be charge-neutral and
  //    mint-positive forever). Never fails the raid.
  try {
    const [victimState] = await db
      .select({ lastRevengeAt: raidState.lastRevengeAt })
      .from(raidState)
      .where(eq(raidState.userId, targetId));
    const revengeEligible = shouldGrantRevenge(
      breakdown.victimCredits,
      victimState?.lastRevengeAt ? victimState.lastRevengeAt.getTime() : null,
      Date.now()
    );
    if (revengeEligible) {
      await db
        .insert(raidState)
        .values({
          userId: targetId,
          charges: 1,
          nextChargeAt: new Date(Date.now() + RAID_CHARGE_INTERVAL_MS),
          lastRevengeAt: new Date(),
        })
        .onConflictDoUpdate({
          target: raidState.userId,
          set: {
            charges: sql`LEAST(${raidState.charges} + 1, ${RAID_REVENGE_CAP})`,
            nextChargeAt: sql`CASE WHEN ${raidState.charges} >= ${RAID_CHARGE_CAP} THEN now() + interval '${sql.raw(String(RAID_CHARGE_INTERVAL_MS / 60000))} minutes' ELSE ${raidState.nextChargeAt} END`,
            lastRevengeAt: new Date(),
            updatedAt: new Date(),
          },
        });
    }
  } catch (revengeError) {
    console.error("Raid revenge-charge error:", revengeError);
  }

  // 7. DM receipt to the victim (game-event receipt pattern; English in v1).
  try {
    await db.insert(messages).values({
      senderId: attackerId,
      recipientId: targetId,
      type: "private",
      content: `💀 VAULT RAID: ${attacker.username} cracked ${breakdown.locksCracked}/3 locks and took ${breakdown.loot}¢${breakdown.victimCredits > 0 ? ` (${breakdown.victimCredits}¢ from your vault)` : ""}. You got a REVENGE charge — lock your deeds to shield your credits.`,
    });
  } catch (dmError) {
    console.error("Raid DM receipt error:", dmError);
  }

  // 8b. Blueprint drop (vault ← raid). Best-effort.
  try {
    await maybeDropBlueprint(attackerId, "vault");
  } catch {
    /* drops are cosmetic */
  }

  // 9. Real-time events.
  try {
    await Promise.all([
      pusher.trigger(`player-${attackerId}`, "raid-resolved", {
        targetUsername: target.username,
        locks: breakdown.locks,
        locksCracked: breakdown.locksCracked,
        loot: breakdown.loot,
        poolCredits: breakdown.poolCredits,
        victimCredits: breakdown.victimCredits,
      }),
      pusher.trigger(`player-${targetId}`, "raid-suffered", {
        attackerUsername: attacker.username,
        attackerAvatar: attacker.avatarUrl,
        locksCracked: breakdown.locksCracked,
        amount: breakdown.victimCredits,
        loot: breakdown.loot,
      }),
    ]);
  } catch (pusherError) {
    console.error("Raid pusher error:", pusherError);
  }

  return {
    success: true,
    target: { id: target.id, username: target.username, avatarUrl: target.avatarUrl },
    locks: breakdown.locks,
    locksCracked: breakdown.locksCracked,
    multiplier: breakdown.multiplier,
    loot: breakdown.loot,
    poolCredits: breakdown.poolCredits,
    victimCredits: breakdown.victimCredits,
    chargesLeft,
  };
}
