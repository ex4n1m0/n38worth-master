import { randomInt } from "crypto";
import { db } from "@/db";
import { users, gameHistory, messages, blueprintInventory, blueprintTrades } from "@/db/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import {
  BLUEPRINTS_BY_ID,
  rollDrop,
  backfillGrant,
  completedProps,
  tradeableDuplicates,
  albumComplete,
  albumBlueprints as albumBlueprintsFor,
  ALBUMS,
  type BlueprintCategory,
  type Inventory,
} from "@/lib/blueprints";

/**
 * Blueprint service — drops, inventory (with one-time backfill), and the
 * escrowed trade state machine. Every mutation is best-effort: a drop can
 * never fail the action that triggered it (callers wrap in try/catch).
 */

const BACKFILL_SENTINEL = "__backfilled";
export const TRADE_DURATION_MS = 48 * 60 * 60 * 1000;

/** Per-action drop chance by category (mission drops are guaranteed). */
const DROP_CHANCE: Record<BlueprintCategory, number> = {
  residential: 0.25, // acquire
  commercial: 0.25, // renovate
  industrial: 0.3, // foreclose
  civic: 1.0, // permit completed — guaranteed
  vault: 0.5, // raid (charge-gated, only legendary source)
};

async function addBlueprints(userId: number, grants: { id: string; count: number }[]): Promise<void> {
  for (const g of grants) {
    await db
      .insert(blueprintInventory)
      .values({ userId, blueprintId: g.id, count: g.count })
      .onConflictDoUpdate({
        target: [blueprintInventory.userId, blueprintInventory.blueprintId],
        set: {
          count: sql`${blueprintInventory.count} + ${g.count}`,
          updatedAt: new Date(),
        },
      });
  }
}

/** Maybe drop a fragment for an action (server-side crypto RNG). */
export async function maybeDropBlueprint(userId: number, category: BlueprintCategory): Promise<string | null> {
  try {
    const chance = DROP_CHANCE[category];
    if (randomInt(1000) >= chance * 1000) return null;
    const roll: [number, number] = [randomInt(1000) / 1000, randomInt(1000) / 1000];
    const id = rollDrop(category, roll);
    if (!id) return null;
    await addBlueprints(userId, [{ id, count: 1 }]);
    try {
      await pusher.trigger(`player-${userId}`, "blueprint-drop", { id, category });
    } catch {
      // never fail a drop on Pusher
    }
    return id;
  } catch (error) {
    console.error("Blueprint drop error (ignored):", error);
    return null;
  }
}

async function loadInventory(userId: number): Promise<Inventory> {
  const rows = await db
    .select({ id: blueprintInventory.blueprintId, count: blueprintInventory.count })
    .from(blueprintInventory)
    .where(eq(blueprintInventory.userId, userId));
  return new Map(rows.map((r) => [r.id, r.count]));
}

/**
 * One-time backfill from gameHistory so veterans start with a starter
 * album (common-heavy, capped at 30). Runs lazily on the first inventory
 * read; the `__backfilled` sentinel row marks it done forever.
 */
async function ensureBackfilled(userId: number): Promise<void> {
  // Claim-first (review F2): the sentinel insert itself is the claim — a
  // concurrent first read gets 0 rows back and bails, so the one-time grant
  // can never run twice.
  const claimed = await db
    .insert(blueprintInventory)
    .values({ userId, blueprintId: BACKFILL_SENTINEL, count: 0 })
    .onConflictDoNothing()
    .returning({ id: blueprintInventory.id });
  if (claimed.length === 0) return;

  const catMap: Record<string, BlueprintCategory> = {
    purchase: "residential",
    pump: "commercial",
    raid: "vault",
  };
  const rows = await db
    .select({ eventType: gameHistory.eventType, count: sql<number>`COUNT(*)` })
    .from(gameHistory)
    .where(and(eq(gameHistory.actorId, userId), inArray(gameHistory.eventType, ["purchase", "pump", "raid"])))
    .groupBy(gameHistory.eventType);
  // Forecloses ride the purchase event; civic (permits) has no history type —
  // derive it from mission level so the civic album isn't backfill-dead.
  const [user] = await db
    .select({ missionLevel: users.missionLevel })
    .from(users)
    .where(eq(users.id, userId));
  const historical: Partial<Record<BlueprintCategory, number>> = {};
  for (const r of rows) {
    const cat = catMap[r.eventType];
    if (cat) historical[cat] = Number(r.count);
  }
  historical.industrial = Math.floor((historical.residential ?? 0) * 0.4);
  historical.civic = (user?.missionLevel ?? 0) * 3;

  const grant = backfillGrant(historical);
  if (grant.length > 0) await addBlueprints(userId, grant);
}

export interface BlueprintView {
  inventory: { id: string; count: number }[];
  albums: {
    id: BlueprintCategory;
    total: number;
    owned: number;
    complete: boolean;
    props: string[];
  }[];
  duplicates: { id: string; count: number }[];
  tradesOut: {
    id: number;
    toUsername: string;
    offerBp: string;
    requestBp: string;
    status: string;
    expiresAt: string;
  }[];
  tradesIn: {
    id: number;
    fromUsername: string;
    offerBp: string;
    requestBp: string;
    status: string;
    expiresAt: string;
  }[];
}

export async function getBlueprintView(userId: number): Promise<BlueprintView> {
  await ensureBackfilled(userId);
  await expireOpenTrades(userId);

  const inv = await loadInventory(userId);
  const inventory = [...inv.entries()]
    .filter(([id]) => id !== BACKFILL_SENTINEL)
    .map(([id, count]) => ({ id, count }));

  const tradeRows = await db
    .select({
      id: blueprintTrades.id,
      fromId: blueprintTrades.fromId,
      toId: blueprintTrades.toId,
      offerBp: blueprintTrades.offerBp,
      requestBp: blueprintTrades.requestBp,
      status: blueprintTrades.status,
      expiresAt: blueprintTrades.expiresAt,
    })
    .from(blueprintTrades)
    .where(
      and(
        inArray(blueprintTrades.status, ["open"]),
        sql`(${blueprintTrades.fromId} = ${userId} OR ${blueprintTrades.toId} = ${userId})`
      )
    )
    .orderBy(desc(blueprintTrades.createdAt))
    .limit(30);

  const otherIds = [...new Set(tradeRows.map((t) => (t.fromId === userId ? t.toId : t.fromId)))];
  const others = otherIds.length
    ? await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, otherIds))
    : [];
  const names = new Map(others.map((o) => [o.id, o.username]));

  const toDto = (t: (typeof tradeRows)[number]) => ({
    id: t.id,
    offerBp: t.offerBp,
    requestBp: t.requestBp,
    status: t.status,
    expiresAt: t.expiresAt.toISOString(),
  });

  return {
    inventory,
    albums: ALBUMS.map((a) => {
      const items = albumBlueprintsFor(a.id);
      return {
        id: a.id,
        total: items.length,
        owned: items.filter((b) => (inv.get(b.id) ?? 0) >= 1).length,
        complete: albumComplete(inv, a.id),
        props: albumComplete(inv, a.id) ? [a.prop] : [],
      };
    }),
    duplicates: tradeableDuplicates(inv),
    tradesOut: tradeRows.filter((t) => t.fromId === userId).map((t) => ({
      ...toDto(t),
      toUsername: names.get(t.toId) ?? "?",
    })),
    tradesIn: tradeRows.filter((t) => t.toId === userId).map((t) => ({
      ...toDto(t),
      fromUsername: names.get(t.fromId) ?? "?",
    })),
  };
}

/** Completed prop keys for a user (public payload for the world map). */
export async function completedPropsForUser(userId: number): Promise<string[]> {
  const inv = await loadInventory(userId);
  return completedProps(inv);
}

// ── trade state machine ──

async function takeCopy(userId: number, blueprintId: string): Promise<boolean> {
  const rows = await db
    .update(blueprintInventory)
    .set({ count: sql`${blueprintInventory.count} - 1`, updatedAt: new Date() })
    .where(
      and(
        eq(blueprintInventory.userId, userId),
        eq(blueprintInventory.blueprintId, blueprintId),
        sql`${blueprintInventory.count} > 1`
      )
    )
    .returning({ id: blueprintInventory.id });
  return rows.length > 0;
}

async function giveCopy(userId: number, blueprintId: string): Promise<void> {
  await addBlueprints(userId, [{ id: blueprintId, count: 1 }]);
}

async function dm(toUserId: number, fromUserId: number, content: string): Promise<void> {
  try {
    await db.insert(messages).values({
      senderId: fromUserId,
      recipientId: toUserId,
      type: "private",
      content,
    });
  } catch {
    /* receipts are best-effort */
  }
}

export async function proposeTrade(
  fromId: number,
  toUsername: string,
  offerBp: string,
  requestBp: string
): Promise<{ error?: string }> {
  if (!BLUEPRINTS_BY_ID.has(offerBp) || !BLUEPRINTS_BY_ID.has(requestBp)) {
    return { error: "Unknown blueprint" };
  }
  if (offerBp === requestBp) return { error: "Pick two different blueprints" };

  const normalized = toUsername.trim();
  const [target] = await db
    .select({ id: users.id, username: users.username, isActive: users.isActive })
    .from(users)
    .where(eq(users.username, normalized));
  if (!target || !target.isActive || target.id === fromId) {
    return { error: "Trade partner not found" };
  }

  const [openCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(blueprintTrades)
    .where(and(eq(blueprintTrades.fromId, fromId), eq(blueprintTrades.status, "open")));
  if (Number(openCount.count) >= 5) return { error: "Too many open trades (max 5)" };

  // Escrow the offered copy FIRST (conditional: needs a duplicate).
  const took = await takeCopy(fromId, offerBp);
  if (!took) return { error: "You need a duplicate of that blueprint to offer it" };

  const [fromUser] = await db.select({ username: users.username }).from(users).where(eq(users.id, fromId));
  try {
    await db.insert(blueprintTrades).values({
      fromId,
      toId: target.id,
      offerBp,
      requestBp,
      status: "open",
      expiresAt: new Date(Date.now() + TRADE_DURATION_MS),
    });
  } catch (insertError) {
    // Review F3: never strand the escrowed copy if the insert fails.
    console.error("Blueprint trade insert error (refunding escrow):", insertError);
    await giveCopy(fromId, offerBp);
    return { error: "Could not open the trade — your duplicate was returned" };
  }
  await dm(
    target.id,
    fromId,
    `📐 TRADE OFFER: ${fromUser?.username ?? "?"} offers a duplicate blueprint for one of yours — see the Blueprints tab.`
  );
  try {
    await pusher.trigger(`player-${target.id}`, "blueprint-trade", { kind: "offer" });
  } catch {
    /* best-effort */
  }
  return {};
}

export async function acceptTrade(userId: number, tradeId: number): Promise<{ error?: string }> {
  const [trade] = await db
    .select()
    .from(blueprintTrades)
    .where(and(eq(blueprintTrades.id, tradeId), eq(blueprintTrades.toId, userId)))
  ;
  if (!trade || trade.status !== "open") return { error: "Trade not found" };
  // An expired-but-unswept trade must not be accepted (pinned behavior).
  if (trade.expiresAt.getTime() <= Date.now()) {
    return { error: "This trade has expired" };
  }

  // Claim atomically; a concurrent accept/cancel/expire loses here.
  const claimed = await db
    .update(blueprintTrades)
    .set({ status: "accepted", completedAt: new Date() })
    .where(and(eq(blueprintTrades.id, tradeId), eq(blueprintTrades.status, "open")))
    .returning({ id: blueprintTrades.id });
  if (claimed.length === 0) return { error: "Trade is no longer open" };

  // Escrow the counterpart (must own a duplicate).
  const took = await takeCopy(userId, trade.requestBp);
  if (!took) {
    // Roll the claim back to open — the accept was invalid, not the trade.
    await db
      .update(blueprintTrades)
      .set({ status: "open", completedAt: null })
      .where(and(eq(blueprintTrades.id, tradeId), eq(blueprintTrades.status, "accepted")));
    return { error: "You need a duplicate of the requested blueprint" };
  }

  // Swap.
  await giveCopy(trade.fromId, trade.requestBp);
  await giveCopy(userId, trade.offerBp);
  const [me] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId));
  await dm(
    trade.fromId,
    userId,
    `📐 TRADE COMPLETE: your duplicate blueprint was swapped with ${me?.username ?? "a player"}.`
  );
  try {
    await Promise.all([
      pusher.trigger(`player-${trade.fromId}`, "blueprint-trade", { kind: "accepted" }),
      pusher.trigger(`player-${userId}`, "blueprint-trade", { kind: "accepted" }),
    ]);
  } catch {
    /* best-effort */
  }
  return {};
}

export async function declineTrade(userId: number, tradeId: number): Promise<{ error?: string }> {
  const refunded = await db
    .update(blueprintTrades)
    .set({ status: "declined", completedAt: new Date() })
    .where(and(eq(blueprintTrades.id, tradeId), eq(blueprintTrades.toId, userId), eq(blueprintTrades.status, "open")))
    .returning({ offerBp: blueprintTrades.offerBp, fromId: blueprintTrades.fromId });
  if (refunded.length === 0) return { error: "Trade not found" };
  await giveCopy(refunded[0].fromId, refunded[0].offerBp);
  await dm(refunded[0].fromId, userId, "📐 Your blueprint trade was declined — your duplicate was returned.");
  return {};
}

export async function cancelTrade(userId: number, tradeId: number): Promise<{ error?: string }> {
  const refunded = await db
    .update(blueprintTrades)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(and(eq(blueprintTrades.id, tradeId), eq(blueprintTrades.fromId, userId), eq(blueprintTrades.status, "open")))
    .returning({ offerBp: blueprintTrades.offerBp });
  if (refunded.length === 0) return { error: "Trade not found" };
  await giveCopy(userId, refunded[0].offerBp);
  return {};
}

/** Lazy expiry sweep (refund the escrowed offer) on inventory reads. */
export async function expireOpenTrades(userId: number): Promise<number> {
  const expired = await db
    .update(blueprintTrades)
    .set({ status: "expired", completedAt: new Date() })
    .where(
      and(
        eq(blueprintTrades.status, "open"),
        sql`${blueprintTrades.expiresAt} <= now()`,
        sql`(${blueprintTrades.fromId} = ${userId} OR ${blueprintTrades.toId} = ${userId})`
      )
    )
    .returning({ fromId: blueprintTrades.fromId, offerBp: blueprintTrades.offerBp });
  for (const t of expired) await giveCopy(t.fromId, t.offerBp);
  return expired.length;
}

/**
 * World-reset integration: open trades are cancelled WITH refunds (the
 * inventory itself SURVIVES resets — collections are cosmetic retention).
 */
export async function cancelAllTradesForWorldReset(): Promise<void> {
  try {
    // Single atomic claim of ALL open rows (review F1): refund ONLY rows
    // this call actually flipped, so a concurrent accept can never be
    // double-dispositioned.
    const claimed = await db
      .update(blueprintTrades)
      .set({ status: "cancelled", completedAt: new Date() })
      .where(eq(blueprintTrades.status, "open"))
      .returning({ fromId: blueprintTrades.fromId, offerBp: blueprintTrades.offerBp });
    for (const t of claimed) await giveCopy(t.fromId, t.offerBp);
  } catch (error) {
    console.error("World-reset trade cancellation error:", error);
  }
}
