import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(users)
    .where(eq(users.isNpc, 1));
  console.log("Remaining NPCs:", result.count);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
