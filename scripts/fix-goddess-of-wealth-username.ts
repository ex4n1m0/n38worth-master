import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const [existing] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, "Goddess of Weather"));

  if (!existing) {
    console.log("No user found with username 'Goddess of Weather' — nothing to do.");
    process.exit(0);
  }

  console.log(`Found: ID=${existing.id}, username="${existing.username}"`);

  await db
    .update(users)
    .set({ username: "Goddess of Wealth" })
    .where(eq(users.username, "Goddess of Weather"));

  console.log(`✅ Renamed to "Goddess of Wealth" successfully.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
