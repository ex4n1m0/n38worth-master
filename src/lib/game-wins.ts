/**
 * Game win counter.
 *
 * Tracks how many times the game has been won (a player held all 6 goddesses
 * through the full countdown, triggering a world reset). Stored in
 * game_settings under `game_win_count`.
 *
 * The count drives the DYNAMIC threshold of the final mission: unlocking the
 * last Goddess requires 5,000 owned cards, +1,000 for every game won so far
 * (see `finalGoddessThreshold` in missions-data.ts).
 */

import { db } from "@/db";
import { gameSettings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { finalGoddessThreshold } from "@/lib/missions-data";

const GAME_WIN_COUNT_KEY = "game_win_count";

/** Total number of recorded game wins. Defaults to 0 when unset. */
export async function getGameWinCount(): Promise<number> {
  try {
    const [row] = await db
      .select({ value: gameSettings.settingValue })
      .from(gameSettings)
      .where(eq(gameSettings.settingKey, GAME_WIN_COUNT_KEY))
      .limit(1);
    return Number(row?.value ?? 0);
  } catch {
    return 0;
  }
}

/** Increment the win counter by 1 (called from the game-win reset path). */
export async function incrementGameWinCount(): Promise<void> {
  await db
    .insert(gameSettings)
    .values({ settingKey: GAME_WIN_COUNT_KEY, settingValue: 1, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: gameSettings.settingKey,
      set: {
        settingValue: sql`${gameSettings.settingValue} + 1`,
        updatedAt: new Date(),
      },
    });
}

/** Effective owned-card threshold for the final Goddess (5,000 + 1,000/win). */
export async function getFinalGoddessThreshold(): Promise<number> {
  return finalGoddessThreshold(await getGameWinCount());
}
