import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users, ownership } from "../src/db/schema";
import { sql, eq } from "drizzle-orm";

async function main() {
  console.log("Finding NPCs without owners to initialize ownerlessAt...\n");

  // Find all NPCs without owners
  const npcs = await db
    .select({
      id: users.id,
      username: users.username,
      ownerlessAt: users.ownerlessAt,
      createdAt: users.createdAt,
      ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`,
    })
    .from(users)
    .where(eq(users.isNpc, 1));

  const ownerlessNpcs = npcs.filter(npc => Number(npc.ownerCount) === 0 && !npc.ownerlessAt);

  console.log(`Found ${ownerlessNpcs.length} NPC(s) without owners that need ownerlessAt initialized.`);

  if (ownerlessNpcs.length > 0) {
    for (const npc of ownerlessNpcs) {
      // Set ownerlessAt to createdAt (they've been ownerless since creation)
      await db
        .update(users)
        .set({ ownerlessAt: npc.createdAt })
        .where(eq(users.id, npc.id));
      console.log(`  ✓ Set ownerlessAt for ${npc.username} (ID: ${npc.id})`);
    }
    console.log(`\n✅ Initialized ownerlessAt for ${ownerlessNpcs.length} NPC(s).`);
  } else {
    console.log("\nNo NPCs need initialization.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});