import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { compressAvatar } from "../src/lib/compress-avatar";

const GODDESSES: { filename: string; username: string }[] = [
  { filename: "NewGoddessWealth.webp", username: "Goddess of Wealth" },
  { filename: "NewGoddessKnowledge.webp", username: "Goddess of Knowledge" },
  { filename: "NewGoddessFate.webp", username: "Goddess of Fate" },
  { filename: "NewGoddessTime.webp", username: "Goddess of Time" },
  { filename: "NewGoddessWar.webp", username: "Goddess of War" },
  { filename: "NewGoddess.webp", username: "Goddess" },
];

async function main() {
  console.log("Updating goddess avatars from new webp art...\n");

  for (const g of GODDESSES) {
    const filePath = path.join(process.cwd(), "public", g.filename);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      continue;
    }

    const imageBuffer = fs.readFileSync(filePath);
    const { buffer: compressed, mimeType } = await compressAvatar(imageBuffer, "image/webp");
    const avatarUrl = `data:${mimeType};base64,${compressed.toString("base64")}`;

    const updated = await db
      .update(users)
      .set({ avatarUrl })
      .where(eq(users.username, g.username))
      .returning({ id: users.id, username: users.username });

    if (updated.length === 0) {
      console.log(`⚠️  No row found for "${g.username}" — skipped`);
    } else {
      console.log(`✅ Updated "${g.username}" (id: ${updated[0].id}) — ${(compressed.length / 1024).toFixed(1)} KB ${mimeType}`);
    }
  }

  console.log("\nDone!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
