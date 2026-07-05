import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { inArray } from "drizzle-orm";

async function main() {
  const goddesses = await db
    .select({
      id: users.id,
      username: users.username,
      isProtected: users.isProtected,
      isNpc: users.isNpc,
      playerValue: users.playerValue,
    })
    .from(users)
    .where(
      inArray(users.username, ["Goddess of Wealth", "Goddess of Knowledge", "Goddess of Fate", "Goddess of Time", "Goddess of War", "Goddess"])
    );

  console.log("\n🛡️  Goddess Protection Status:\n");
  for (const g of goddesses) {
    const status = g.isProtected === 1 ? "✅ PROTECTED" : "❌ NOT PROTECTED";
    console.log(`  ${g.username} (ID: ${g.id}) - ${status} - Value: $${g.playerValue.toLocaleString()}`);
  }
  console.log(`\nTotal: ${goddesses.length}/6 goddesses found\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});