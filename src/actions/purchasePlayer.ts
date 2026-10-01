"use server";

import { auth } from "@/lib/auth";
import { buyPlayerCore } from "@/lib/purchaseCore";

/**
 * Thin auth wrapper over buyPlayerCore (2026-10-01).
 *
 * This file USED to be a full copy of the purchase body and had silently
 * drifted from purchaseCore (3-min vs 30-s deed lock per lease-hour, missing
 * perm blocks for the first 10 NPC acquires, missing removed-Agent rejection,
 * photoScore parity, no market broadcast). It is now a delegation only —
 * every purchase path (market API, restore-all, foreclosure) runs the exact
 * same core, including the bounty settlement hook.
 */
export async function purchasePlayer(targetId: number, blockDurationHours: number = 1) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const buyerId = parseInt(session.user.id);
  return buyPlayerCore(buyerId, targetId, blockDurationHours);
}
