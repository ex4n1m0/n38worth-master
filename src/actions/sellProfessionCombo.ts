"use server";

import { auth } from "@/lib/auth";
import { sellComboCore } from "@/lib/comboCore";

/**
 * Server action: sell a 6-player profession combo.
 *
 * Thin authentication wrapper around `sellComboCore`. The owner is resolved
 * from the session here; all combo mechanics live in the session-free core so
 * they can be shared with automated players (e.g. the AI Agent cron).
 */
export async function sellProfessionCombo(playerIds: number[]) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const ownerId = parseInt(session.user.id);
  return sellComboCore(ownerId, playerIds);
}
