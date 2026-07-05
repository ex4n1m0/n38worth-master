import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { createRandomPlayer } from "@/lib/random-player";
import { getBonusCardPrice, doubleBonusCardPrice } from "@/lib/bonus-card-price";

/**
 * Session-free cores for the single-use "action" bonus cards the AI Agent can
 * use like a normal player. These mirror the logic of their respective API
 * routes (`/api/game/buy-hire-slots`, `/api/game/create-npc`) but take the
 * actor id explicitly so the Agent cron (which has no browser session) can call
 * them. Only the actions with real strategic value to a headless agent are
 * implemented:
 *   - +10 Player Slots: expands the hire cap so accumulation never stalls.
 *   - Create NPC: spawns a fresh ownerless target when the market is thin.
 * "Mass Hire" is intentionally omitted — the Agent's multi-action buy burst is
 * already an equivalent "hire many cheapest-first" loop. "10-Min Knowledge"
 * (temporary avatar reveal) is omitted — it has no value to an automated agent.
 */

const SLOTS_PER_PURCHASE = 10;
const MAX_SLOT_TIER = 50;
const CREATE_NPC_COOLDOWN_MS = 30_000;

/**
 * Cost to buy the next +10 slots — 1.3× per tier, capped at tier 50.
 * Mirrors the formula in `/api/game/buy-hire-slots` and `/api/settings/ownership-limit`.
 */
export function getSlotCost(currentSlots: number): number {
  const tier = Math.min(MAX_SLOT_TIER, Math.max(0, Math.floor(currentSlots / 10) - 2));
  return Math.round(1000 * Math.pow(1.3, tier));
}

export interface AgentActionResult {
  success: boolean;
  cost?: number;
  error?: string;
  detail?: unknown;
}

/** Buy +10 hire slots for `userId` (session-free core for the Agent). */
export async function buyHireSlotsCore(userId: number): Promise<AgentActionResult> {
  try {
    const [user] = await db
      .select({ credits: users.credits, hireSlots: users.hireSlots })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) return { success: false, error: "User not found" };

    const cost = getSlotCost(user.hireSlots);
    if (user.credits < cost) {
      return { success: false, error: `Need ${cost}¢ for +${SLOTS_PER_PURCHASE} slots` };
    }

    await db
      .update(users)
      .set({
        credits: sql`GREATEST(credits - ${cost}, 0)`,
        hireSlots: sql`hire_slots + ${SLOTS_PER_PURCHASE}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return { success: true, cost, detail: { newLimit: user.hireSlots + SLOTS_PER_PURCHASE } };
  } catch (error) {
    console.error("Agent buyHireSlotsCore error:", error);
    return { success: false, error: "buy slots failed" };
  }
}

/** Current Create NPC price + whether the cooldown is active for `userId`. */
export async function getCreateNpcState(
  userId: number
): Promise<{ cost: number; onCooldown: boolean }> {
  let cost = 1000;
  try {
    const card = await getBonusCardPrice("Create NPC");
    cost = card?.price ?? 1000;
  } catch {
    // fall back to base price
  }
  let onCooldown = false;
  try {
    const [u] = await db
      .select({ lastCreateNpcAt: users.lastCreateNpcAt })
      .from(users)
      .where(eq(users.id, userId));
    if (u?.lastCreateNpcAt) {
      onCooldown = Date.now() - new Date(u.lastCreateNpcAt).getTime() < CREATE_NPC_COOLDOWN_MS;
    }
  } catch {
    // columns may be missing — treat as not on cooldown
  }
  return { cost, onCooldown };
}

/** Spawn a fresh ownerless NPC, charging `userId` the Create NPC price. */
export async function createNpcCore(userId: number): Promise<AgentActionResult> {
  try {
    const [caller] = await db
      .select({ credits: users.credits, lastCreateNpcAt: users.lastCreateNpcAt })
      .from(users)
      .where(eq(users.id, userId));

    if (!caller) return { success: false, error: "User not found" };

    if (caller.lastCreateNpcAt) {
      const elapsed = Date.now() - new Date(caller.lastCreateNpcAt).getTime();
      if (elapsed < CREATE_NPC_COOLDOWN_MS) {
        return { success: false, error: "Create NPC cooling down" };
      }
    }

    const card = await getBonusCardPrice("Create NPC");
    const cost = card?.price ?? 1000;
    if (caller.credits < cost) {
      return { success: false, error: `Need ${cost}¢ to create an NPC` };
    }

    await db
      .update(users)
      .set({
        credits: Math.max(Math.round((caller.credits - cost) * 100) / 100, 0),
        lastCreateNpcAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const result = await createRandomPlayer();
    if (!result.success) {
      // Refund on failure.
      await db
        .update(users)
        .set({
          credits: Math.round(caller.credits * 100) / 100,
          lastCreateNpcAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      return { success: false, error: result.message || "NPC creation failed" };
    }

    if (card) await doubleBonusCardPrice(card.id, card.price);
    return { success: true, cost, detail: { player: result.player } };
  } catch (error) {
    console.error("Agent createNpcCore error:", error);
    return { success: false, error: "create NPC failed" };
  }
}
