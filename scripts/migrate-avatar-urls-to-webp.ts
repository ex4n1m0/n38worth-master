/**
 * One-time migration: update DB avatar URL references from the old .png
 * defaults to the new lightweight .webp versions.
 *
 *  1. AGI players (6): /NewAIPlayer.png etc. → .webp
 *  2. Any human/NPC still on /NEW_HIDDEN.png → /NEW_HIDDEN.webp
 *
 * Goddess avatars are stored as compressed WebP data URLs already — no change.
 *
 * Run: npx tsx scripts/migrate-avatar-urls-to-webp.ts
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";

const AGENT_URL_MAP: Array<{ from: string; to: string }> = [
  { from: "/NewAIPlayer.png", to: "/NewAIPlayer.webp" },
  { from: "/NewAstra.png", to: "/NewAstra.webp" },
  { from: "/NewLyra.png", to: "/NewLyra.webp" },
  { from: "/NewMira.png", to: "/NewMira.webp" },
  { from: "/NewNova.png", to: "/NewNova.webp" },
  { from: "/NewVesper.png", to: "/NewVesper.webp" },
];

async function main() {
  console.log("Migrating AGI avatar URLs to .webp...\n");
  for (const { from, to } of AGENT_URL_MAP) {
    const res = await db
      .update(users)
      .set({ avatarUrl: to, updatedAt: new Date() })
      .where(eq(users.avatarUrl, from))
      .returning({ id: users.id });
    console.log(`✅ ${from} → ${to}: ${res.length} row(s) updated`);
  }

  console.log("\nMigrating /NEW_HIDDEN.png → /NEW_HIDDEN.webp...\n");
  const migrated = await db
    .update(users)
    .set({ avatarUrl: "/NEW_HIDDEN.webp", updatedAt: new Date() })
    .where(eq(users.avatarUrl, "/NEW_HIDDEN.png"))
    .returning({ id: users.id });
  console.log(`✅ Migrated ${migrated.length} row(s)`);

  console.log("\nDone!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
