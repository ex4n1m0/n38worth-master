import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { compressAvatar } from "../src/lib/compress-avatar";

interface NpcDefinition {
  filename: string;
  username: string;
  playerValue: number;
}

const NPCS: NpcDefinition[] = [
  { filename: "SamplePlayer5.png", username: "Morríghan", playerValue: 100_000_000 },
  { filename: "SamplePlayer4.png", username: "Athena", playerValue: 1_000_000 },
  { filename: "SamplePlayer3.png", username: "Freyja", playerValue: 100_000 },
  { filename: "SamplePlayer2.png", username: "Ishtar", playerValue: 10_000 },
  { filename: "SamplePlayer1.png", username: "Inanna", playerValue: 1_000_000_000 },
];

async function main() {
  console.log("Creating goddess NPCs...\n");

  for (const npc of NPCS) {
    // Check if username already exists
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, npc.username));

    if (existing) {
      console.log(`⚠️  Skipping "${npc.username}" — already exists (id: ${existing.id})`);
      continue;
    }

    // Read the PNG file
    const filePath = path.join(process.cwd(), "public", npc.filename);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      continue;
    }

    const imageBuffer = fs.readFileSync(filePath);
    console.log(`📷 Read ${npc.filename} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);

    // Compress to base64 data URL
    const { buffer: compressed, mimeType } = await compressAvatar(imageBuffer, "image/png");
    const base64 = compressed.toString("base64");
    const avatarUrl = `data:${mimeType};base64,${base64}`;
    console.log(`   Compressed to ${(compressed.length / 1024).toFixed(1)} KB (${mimeType})`);

    // Insert into database
    const [newPlayer] = await db
      .insert(users)
      .values({
        username: npc.username,
        passwordHash: null,
        avatarUrl,
        playerValue: npc.playerValue,
        valueFloor: npc.playerValue,
        credits: 0,
        isActive: 1,
        isVerified: 0,
        isNpc: 1,
        isProtected: 1, // Goddesses are protected from deletion
      })
      .returning({ id: users.id, username: users.username });

    console.log(`✅ Created "${newPlayer.username}" (id: ${newPlayer.id}) — value: $${npc.playerValue.toLocaleString()}\n`);
  }

  console.log("Done!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
