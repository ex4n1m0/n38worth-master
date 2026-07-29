/**
 * One-time backfill: NPCs stuck with the hidden placeholder avatar
 * ("/NEW_HIDDEN.webp") get a real compressed picsum avatar.
 *
 * These rows come from fallback creation paths that used to store the
 * placeholder directly (mission rewards when the onboarding pool was empty,
 * onboarding starter fallback when Unsplash failed).
 *
 * Run:
 *   npx tsx scripts/backfill-hidden-npc-avatars.ts            # backfill all
 *   npx tsx scripts/backfill-hidden-npc-avatars.ts --dry-run  # preview only
 *
 * Loads DATABASE_URL from .env.local automatically.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq } from "drizzle-orm";
import { users } from "../src/db/schema";
import { fetchFallbackNpcAvatar } from "../src/lib/npc-fallback-avatar";

const HIDDEN_AVATAR = "/NEW_HIDDEN.webp";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set (.env.local).");
    process.exit(1);
  }

  const sqlClient = neon(process.env.DATABASE_URL);
  const db = drizzle(sqlClient);

  // Only touch NPCs (humans with the default avatar are owned by the
  // default-avatar cron flow).
  const targets = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(and(eq(users.avatarUrl, HIDDEN_AVATAR), eq(users.isNpc, 1)));

  console.log(`Found ${targets.length} NPC(s) with the hidden placeholder avatar.`);
  if (dryRun) {
    console.log("Dry run — no changes.");
    return;
  }

  let updated = 0;
  let failed = 0;
  for (const npc of targets) {
    const avatar = await fetchFallbackNpcAvatar();
    if (!avatar) {
      console.warn(`  ✗ ${npc.username} (${npc.id}): picsum failed, leaving placeholder`);
      failed++;
      continue;
    }
    await db
      .update(users)
      .set({
        avatarUrl: avatar.avatarUrl,
        photoAuthorName: avatar.photoAuthorName,
        photoAuthorUrl: avatar.photoAuthorUrl,
        photoSourceUrl: avatar.photoSourceUrl,
        photoScore: 0,
      })
      .where(eq(users.id, npc.id));
    console.log(`  ✓ ${npc.username} (${npc.id})`);
    updated++;
    // Small delay to be polite to picsum.
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`Done: ${updated} updated, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
