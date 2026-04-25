import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Updating Inanna's value to $1,000,000,000...\n");

  const [updated] = await db
    .update(users)
    .set({
      playerValue: 1_000_000_000,
      valueFloor: 1_000_000_000,
      updatedAt: new Date(),
    })
    .where(eq(users.username, "Inanna"))
    .returning({ id: users.id, username: users.username, playerValue: users.playerValue });

  if (updated) {
    console.log(`✅ Updated "${updated.username}" (ID: ${updated.id}) — new value: $${updated.playerValue.toLocaleString()}`);
  } else {
    console.log("❌ Inanna not found in database");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});