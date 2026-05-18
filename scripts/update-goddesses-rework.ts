/**
 * Migration script: Replace old 5 goddesses with 6 new goddesses.
 *
 * This script:
 * 1. Deletes the old 5 goddesses (Morríghan, Athena, Freyja, Ishtar, Inanna)
 * 2. Clears any existing ownership of old goddesses
 * 3. Creates 6 new goddesses with new names, avatars, and values
 *
 * Run: npx tsx scripts/update-goddesses-rework.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { db } from "../src/db";
import { users, ownership, transactions } from "../src/db/schema";
import { eq, inArray, or } from "drizzle-orm";
import { compressAvatar } from "../src/lib/compress-avatar";
import { sql } from "drizzle-orm";

interface GoddessDefinition {
  filename: string;
  username: string;
  playerValue: number;
}

// The 6 new goddesses with their respective images and values
const NEW_GODDESSES: GoddessDefinition[] = [
  { filename: "GODOFWEALTH.png", username: "Goddess of Wealth", playerValue: 100_000 },
  { filename: "GODOFKNOW.png", username: "Goddess of Knowledge", playerValue: 1_000_000 },
  { filename: "GODOFFATE.png", username: "Goddess of Fate", playerValue: 10_000_000 },
  { filename: "GODOFTIME.png", username: "Goddess of Time", playerValue: 100_000_000 },
  { filename: "GODOFWAR.png", username: "Goddess of War", playerValue: 1_000_000_000 },
  { filename: "GODDESS.png", username: "Goddess", playerValue: 10_000_000_000 },
];

// Old goddess names to delete
const OLD_GODDESS_NAMES = ["Morríghan", "Athena", "Freyja", "Ishtar", "Inanna"];

async function main() {
  console.log("🔄 Starting goddess rework migration...\n");

  // Step 1: Delete ownership records for old goddesses
  console.log("Step 1: Finding old goddesses...");
  const oldGoddesses = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.username, OLD_GODDESS_NAMES));

  if (oldGoddesses.length > 0) {
    const oldIds = oldGoddesses.map((g) => g.id);
    console.log(`Found ${oldGoddesses.length} old goddesses: ${oldGoddesses.map((g) => g.username).join(", ")}`);

    // Delete ownership records for old goddesses
    await db
      .delete(ownership)
      .where(inArray(ownership.ownedId, oldIds));
    console.log(`✅ Cleared ownership records for old goddesses`);

    // Delete transactions referencing old goddesses (can't set NULL due to NOT NULL constraint)
    await db.execute(sql`DELETE FROM transactions WHERE target_id IN (${sql.join(oldIds, sql`, `)})`);
    console.log(`✅ Deleted transactions referencing old goddesses`);

    // Delete reward history for old goddesses
    await db.execute(sql`DELETE FROM reward_history WHERE user_id IN (${sql.join(oldIds, sql`, `)})`);
    console.log(`✅ Deleted reward history for old goddesses`);

    // Delete messages to/from old goddesses
    await db.execute(sql`DELETE FROM messages WHERE recipient_id IN (${sql.join(oldIds, sql`, `)}) OR sender_id IN (${sql.join(oldIds, sql`, `)})`);
    console.log(`✅ Deleted messages to/from old goddesses`);

    // Delete game_history records referencing old goddesses
    await db.execute(sql`DELETE FROM game_history WHERE actor_id IN (${sql.join(oldIds, sql`, `)}) OR target_id IN (${sql.join(oldIds, sql`, `)})`);
    console.log(`✅ Deleted game history for old goddesses`);

    // Delete old goddesses
    await db.delete(users).where(inArray(users.id, oldIds));
    console.log(`✅ Deleted old goddesses from database\n`);
  } else {
    console.log("No old goddesses found (may have been deleted already)\n");
  }

  // Step 2: Create new goddesses
  console.log("Step 2: Creating 6 new goddesses...\n");

  for (const goddess of NEW_GODDESSES) {
    // Check if goddess already exists
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, goddess.username));

    if (existing) {
      console.log(`⚠️  Skipping "${goddess.username}" — already exists (id: ${existing.id})`);
      continue;
    }

    // Read the image file
    const filePath = path.join(process.cwd(), "public", goddess.filename);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      continue;
    }

    const imageBuffer = fs.readFileSync(filePath);
    console.log(`📷 Read ${goddess.filename} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);

    // Compress to base64 data URL
    const { buffer: compressed, mimeType } = await compressAvatar(imageBuffer, "image/png");
    const base64 = compressed.toString("base64");
    const avatarUrl = `data:${mimeType};base64,${base64}`;
    console.log(`   Compressed to ${(compressed.length / 1024).toFixed(1)} KB (${mimeType})`);

    // Insert into database
    const [newPlayer] = await db
      .insert(users)
      .values({
        username: goddess.username,
        passwordHash: null,
        avatarUrl,
        playerValue: goddess.playerValue,
        valueFloor: goddess.playerValue,
        credits: 0,
        isActive: 1,
        isVerified: 0,
        isNpc: 1,
        isProtected: 1, // Goddesses are protected from deletion
      })
      .returning({ id: users.id, username: users.username });

    console.log(`✅ Created "${newPlayer.username}" (id: ${newPlayer.id}) — value: ${goddess.playerValue.toLocaleString()}¢\n`);
  }

  console.log("🎉 Goddess rework migration complete!");
  console.log("\nSummary:");
  console.log("- Old goddesses deleted");
  console.log("- 6 new goddesses created with new names, avatars, and values");
  console.log("- Game now requires owning all 6 goddesses to win");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
