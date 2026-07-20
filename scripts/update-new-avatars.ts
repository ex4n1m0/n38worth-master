/**
 * One-time script: swap in the new avatar images.
 *  1. Goddess avatars — compress NewGoddess*.png into data URLs in the DB.
 *  2. AGI avatars — point the 6 agents at their new public paths immediately
 *     (ensureAgent would do this over the next few cron ticks anyway).
 *  3. Migrate any stored "/hidden.png" avatar to "/NEW_HIDDEN.png".
 *
 * Run: npx tsx scripts/update-new-avatars.ts
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { compressAvatar } from "../src/lib/compress-avatar";

const GODDESSES: Array<{ filename: string; username: string }> = [
  { filename: "NewGoddess.webp", username: "Goddess" },
  { filename: "NewGoddessFate.webp", username: "Goddess of Fate" },
  { filename: "NewGoddessKnowledge.webp", username: "Goddess of Knowledge" },
  { filename: "NewGoddessTime.webp", username: "Goddess of Time" },
  { filename: "NewGoddessWar.webp", username: "Goddess of War" },
  { filename: "NewGoddessWealth.webp", username: "Goddess of Wealth" },
];

const AGENTS: Array<{ avatarUrl: string; username: string }> = [
  { avatarUrl: "/NewAIPlayer.webp", username: "Agent" },
  { avatarUrl: "/NewAstra.webp", username: "Astra" },
  { avatarUrl: "/NewLyra.webp", username: "Lyra" },
  { avatarUrl: "/NewMira.webp", username: "Mira" },
  { avatarUrl: "/NewNova.webp", username: "Nova" },
  { avatarUrl: "/NewVesper.webp", username: "Vesper" },
];

async function main() {
  console.log("Updating goddess avatars...\n");
  for (const g of GODDESSES) {
    const filePath = path.join(process.cwd(), "public", g.filename);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      continue;
    }
    const imageBuffer = fs.readFileSync(filePath);
    const { buffer: compressed, mimeType } = await compressAvatar(imageBuffer, "image/webp");
    const avatarUrl = `data:${mimeType};base64,${compressed.toString("base64")}`;
    const result = await db
      .update(users)
      .set({ avatarUrl, updatedAt: new Date() })
      .where(eq(users.username, g.username))
      .returning({ id: users.id });
    if (result.length > 0) {
      console.log(`✅ ${g.username} — ${g.filename} (${(compressed.length / 1024).toFixed(1)} KB)`);
    } else {
      console.log(`⚠️  ${g.username} not found in DB — skipped`);
    }
  }

  console.log("\nUpdating AGI avatars...\n");
  for (const a of AGENTS) {
    const result = await db
      .update(users)
      .set({ avatarUrl: a.avatarUrl, updatedAt: new Date() })
      .where(eq(users.username, a.username))
      .returning({ id: users.id });
    console.log(result.length > 0 ? `✅ ${a.username} → ${a.avatarUrl}` : `⚠️  ${a.username} not found — skipped`);
  }

  console.log("\nMigrating stored /hidden.png avatars to /NEW_HIDDEN.png...\n");
  const migrated = await db
    .update(users)
    .set({ avatarUrl: "/NEW_HIDDEN.webp", updatedAt: new Date() })
    .where(eq(users.avatarUrl, "/hidden.png"))
    .returning({ id: users.id });
  console.log(`✅ Migrated ${migrated.length} player(s)`);

  console.log("\nDone!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
