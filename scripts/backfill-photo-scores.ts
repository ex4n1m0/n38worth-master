/**
 * Backfill `users.photo_score` for existing NPCs from their Unsplash photo's
 * current `likes` count.
 *
 * NPCs created before the photoScore feature have photo_score = 0. This script
 * walks every NPC that has a stored Unsplash `photoSourceUrl`, re-fetches the
 * photo via the Unsplash API, and writes its `likes` into photo_score so the AI
 * Agent's "prettiest photo first" selection ranks them correctly.
 *
 * Usage:
 *   npx tsx scripts/backfill-photo-scores.ts            # only rows still at 0 (resumable)
 *   npx tsx scripts/backfill-photo-scores.ts --all      # refresh EVERY NPC's score
 *   npx tsx scripts/backfill-photo-scores.ts --limit=50 # cap how many to process
 *
 * Loads DATABASE_URL + UNSPLASH_ACCESS_KEY from .env.local automatically.
 * Sequential with a small delay to respect Unsplash rate limits; on a 403/429
 * (rate limited) it stops cleanly so you can re-run later to resume.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users } from "../src/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY?.trim() || "";

const DELAY_MS = 250; // pause between Unsplash calls to stay under rate limits

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Extract the 11-char Unsplash photo ID from a stored photoSourceUrl, e.g.
 *   https://unsplash.com/photos/a-man-on-a-rock-AbCdEf12345?utm_source=...
 *   https://unsplash.com/photos/AbCdEf12345?utm_source=...
 * The ID is always the final token of the path (IDs are 11 chars).
 */
function extractPhotoId(sourceUrl: string): string | null {
  try {
    const u = new URL(sourceUrl);
    if (!u.pathname.includes("/photos/")) return null;
    const path = u.pathname.replace(/\/$/, "");
    const id = path.slice(-11);
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

async function main() {
  if (!UNSPLASH_ACCESS_KEY) {
    throw new Error("UNSPLASH_ACCESS_KEY is not set (add it to .env.local)");
  }
  const args = process.argv.slice(2);
  const refreshAll = args.includes("--all");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Math.max(1, parseInt(limitArg.split("=")[1], 10) || 0) : 0;

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set (.env.local).");
    process.exit(1);
  }

  const sqlClient = neon(process.env.DATABASE_URL);
  const db = drizzle(sqlClient);

  // Target NPCs with an Unsplash photo. By default only those still at 0
  // (resumable); --all refreshes every NPC.
  const whereClause = refreshAll
    ? and(eq(users.isNpc, 1), isNotNull(users.photoSourceUrl))
    : and(eq(users.isNpc, 1), isNotNull(users.photoSourceUrl), eq(users.photoScore, 0));

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      photoSourceUrl: users.photoSourceUrl,
    })
    .from(users)
    .where(whereClause);

  const targets = limit > 0 ? rows.slice(0, limit) : rows;

  console.log(
    `Backfilling photo scores for ${targets.length} NPC(s)` +
      (refreshAll ? " (--all: refreshing every score)" : " (only rows at 0)") +
      (limit > 0 ? `, capped at ${limit}` : "") +
      ".\n"
  );

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    const progress = `[${i + 1}/${targets.length}]`;

    const photoId = row.photoSourceUrl ? extractPhotoId(row.photoSourceUrl) : null;
    if (!photoId) {
      skipped++;
      console.warn(`${progress} ${row.username}: could not parse photo ID from ${row.photoSourceUrl}`);
      continue;
    }

    try {
      const res = await fetch(`https://api.unsplash.com/photos/${photoId}`, {
        headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
      });

      if (res.status === 403 || res.status === 429) {
        console.error(
          `\n${progress} ${row.username}: Unsplash rate limit hit (HTTP ${res.status}). ` +
            `Stopping — re-run the script later to resume.`
        );
        break;
      }

      if (res.status === 404) {
        skipped++;
        console.warn(`${progress} ${row.username}: photo ${photoId} not found (404), skipping`);
        await sleep(DELAY_MS);
        continue;
      }

      if (!res.ok) {
        failed++;
        console.warn(`${progress} ${row.username}: HTTP ${res.status}, skipping`);
        await sleep(DELAY_MS);
        continue;
      }

      const data = await res.json();
      const likes = Number(data?.likes ?? 0) || 0;

      await db.update(users).set({ photoScore: likes }).where(eq(users.id, row.id));
      updated++;
      console.log(`${progress} ${row.username}: photoScore = ${likes}`);
    } catch (err) {
      failed++;
      console.warn(`${progress} ${row.username}: error`, err instanceof Error ? err.message : err);
    }

    await sleep(DELAY_MS);
  }

  console.log(
    `\nDone. Updated ${updated}, skipped ${skipped}, failed ${failed}, of ${targets.length} target(s).`
  );
  if (failed > 0) {
    console.log("Some rows failed transiently — re-run to retry them.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
