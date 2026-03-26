/**
 * Script to compress ALL existing avatar images in the database to ≤ 100 KB.
 * Handles both:
 *   - data: URL avatars (re-encode at max quality WebP)
 *   - Unsplash URL avatars (download, compress, store as data URL)
 *
 * Usage:
 *   npx tsx scripts/compress-avatars.ts
 *
 * Loads DATABASE_URL from .env.local automatically.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import sharp from "sharp";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users } from "../src/db/schema";
import { eq, sql, isNotNull } from "drizzle-orm";

const TARGET_MAX_BYTES = 100 * 1024; // 100 KB
const MAX_DIMENSION = 512;

async function compressBuffer(input: Buffer): Promise<Buffer> {
  // Try quality 95 at max dimension first
  const pipeline = sharp(input).resize(MAX_DIMENSION, MAX_DIMENSION, {
    fit: "inside",
    withoutEnlargement: true,
  });

  const maxQ = await pipeline.clone().webp({ quality: 95 }).toBuffer();
  if (maxQ.length <= TARGET_MAX_BYTES) return maxQ;

  const minQ = await pipeline.clone().webp({ quality: 1 }).toBuffer();
  if (minQ.length > TARGET_MAX_BYTES) {
    // Need smaller dimensions
    for (const dim of [384, 256, 192, 128]) {
      const smallPipeline = sharp(input).resize(dim, dim, {
        fit: "inside",
        withoutEnlargement: true,
      });
      const smallMax = await smallPipeline.clone().webp({ quality: 95 }).toBuffer();
      if (smallMax.length <= TARGET_MAX_BYTES) return smallMax;
      const smallMin = await smallPipeline.clone().webp({ quality: 1 }).toBuffer();
      if (smallMin.length <= TARGET_MAX_BYTES) {
        return binarySearch(smallPipeline, smallMin);
      }
    }
    return sharp(input).resize(128, 128, { fit: "inside", withoutEnlargement: true }).webp({ quality: 1 }).toBuffer();
  }

  return binarySearch(pipeline, minQ);
}

async function binarySearch(pipeline: sharp.Sharp, minQBuf: Buffer): Promise<Buffer> {
  let lo = 1, hi = 94, best = minQBuf;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = await pipeline.clone().webp({ quality: mid }).toBuffer();
    if (candidate.length <= TARGET_MAX_BYTES) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set.");
    process.exit(1);
  }

  const sqlClient = neon(databaseUrl);
  const db = drizzle(sqlClient);

  console.log("🔍 Fetching ALL users with avatars...");

  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(isNotNull(users.avatarUrl));

  console.log(`📷 Found ${allUsers.length} users with avatars.\n`);

  let compressed = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of allUsers) {
    if (!user.avatarUrl) {
      skipped++;
      continue;
    }

    try {
      let inputBuffer: Buffer;
      let sourceType: string;

      if (user.avatarUrl.startsWith("data:")) {
        // Existing data URL avatar
        const match = user.avatarUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) {
          console.log(`  ⚠️  [${user.username}] Invalid data URL format, skipping.`);
          skipped++;
          continue;
        }
        inputBuffer = Buffer.from(match[2], "base64");
        sourceType = "data URL";
      } else if (user.avatarUrl.startsWith("http")) {
        // External URL avatar (Unsplash etc.) — download it
        console.log(`  ⬇️  [${user.username}] Downloading external avatar...`);
        try {
          const response = await fetch(user.avatarUrl);
          if (!response.ok) {
            console.log(`  ⚠️  [${user.username}] Download failed (${response.status}), skipping.`);
            skipped++;
            continue;
          }
          const arrayBuffer = await response.arrayBuffer();
          inputBuffer = Buffer.from(arrayBuffer);
          sourceType = "external URL";
        } catch (err) {
          console.log(`  ⚠️  [${user.username}] Download error, skipping.`);
          skipped++;
          continue;
        }
      } else {
        console.log(`  ⚠️  [${user.username}] Unknown avatar format, skipping.`);
        skipped++;
        continue;
      }

      const currentSizeKB = (inputBuffer.length / 1024).toFixed(1);

      // Re-encode at max quality WebP for best visual quality ≤ 100 KB
      const compressedBuf = await compressBuffer(inputBuffer);
      const newSizeKB = (compressedBuf.length / 1024).toFixed(1);

      const newBase64 = compressedBuf.toString("base64");
      const newDataUrl = `data:image/webp;base64,${newBase64}`;

      await db
        .update(users)
        .set({ avatarUrl: newDataUrl, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      console.log(`  ✅ [${user.username}] ${sourceType}: ${currentSizeKB} KB → ${newSizeKB} KB`);
      compressed++;
    } catch (err) {
      console.error(`  ❌ [${user.username}] Error:`, err);
      failed++;
    }
  }

  console.log("\n📊 Summary:");
  console.log(`   Processed: ${compressed}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Failed: ${failed}`);
  console.log("✨ Done!");
}

main().catch(console.error);
