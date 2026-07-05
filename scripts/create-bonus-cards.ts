import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { compressAvatar } from "../src/lib/compress-avatar";
import { BONUS_CARD_USERNAMES, BONUS_CARD_IMAGES, BONUS_CARD_VALUES } from "../src/lib/bonus-cards";

async function main() {
  console.log("Creating bonus card NPCs...\n");

  for (const username of BONUS_CARD_USERNAMES) {
    // Check if username already exists
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));

    if (existing) {
      console.log(`⚠️  Skipping "${username}" — already exists (id: ${existing.id})`);
      continue;
    }

    const imageFile = BONUS_CARD_IMAGES[username].replace(/^\//, "");
    const filePath = path.join(process.cwd(), "public", imageFile);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      continue;
    }

    const imageBuffer = fs.readFileSync(filePath);
    console.log(`📷 Read ${imageFile} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);

    const { buffer: compressed, mimeType } = await compressAvatar(imageBuffer, "image/png");
    const base64 = compressed.toString("base64");
    const avatarUrl = `data:${mimeType};base64,${base64}`;
    console.log(`   Compressed to ${(compressed.length / 1024).toFixed(1)} KB (${mimeType})`);

    const [newPlayer] = await db
      .insert(users)
      .values({
        username,
        passwordHash: null,
        avatarUrl,
        playerValue: BONUS_CARD_VALUES[username] ?? 1000,
        valueFloor: 0,
        credits: 0,
        isActive: 1,
        isVerified: 0,
        isNpc: 1,
        isProtected: 1, // Bonus cards are protected from deletion
      })
      .returning({ id: users.id, username: users.username });

    console.log(`✅ Created "${newPlayer.username}" (id: ${newPlayer.id})\n`);
  }

  console.log("Done!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
