/**
 * One-time script: deactivate the 5 removed AGI players (Astra, Lyra, Mira,
 * Nova, Vesper). They are no longer in the roster and should not appear in
 * the game. The Agent is kept (chat-only support).
 *
 * Run with: npx tsx scripts/deactivate-removed-agis.ts
 */
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

const REMOVED_AGIS = ["Astra", "Lyra", "Mira", "Nova", "Vesper"];

async function main() {
  console.log(`Deactivating ${REMOVED_AGIS.length} removed AGI players...`);

  // 1. Deactivate the users
  const updated = await db
    .update(users)
    .set({ isActive: 0, updatedAt: new Date() })
    .where(inArray(users.username, REMOVED_AGIS))
    .returning({ id: users.id, username: users.username });

  console.log(`Deactivated ${updated.length} users:`);
  for (const u of updated) {
    console.log(`  - ${u.username} (id=${u.id})`);
  }

  // 2. Release any ownership rows (free cards they owned)
  const released = await db
    .delete(ownership)
    .where(
      inArray(
        ownership.ownerId,
        updated.map((u) => u.id)
      )
    )
    .returning({ id: ownership.id });

  console.log(`Released ${released.length} ownership rows.`);

  // 3. Also release ownership rows where they are the owned card
  const releasedAsCard = await db
    .delete(ownership)
    .where(
      inArray(
        ownership.ownedId,
        updated.map((u) => u.id)
      )
    )
    .returning({ id: ownership.id });

  console.log(`Released ${releasedAsCard.length} ownership rows (as owned card).`);

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
