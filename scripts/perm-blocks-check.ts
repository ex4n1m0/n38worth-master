import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../src/db";
import { ownership, users } from "../src/db/schema";
import { isNotNull, eq, and, count } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({ username: users.username, ownedId: ownership.ownedId, permBlockUntil: ownership.permBlockUntil })
    .from(ownership)
    .innerJoin(users, eq(ownership.ownerId, users.id))
    .where(isNotNull(ownership.permBlockUntil))
    .limit(10);
  console.log("perm blocks:", rows);

  const [totals] = await db
    .select({ active: count(ownership.id) })
    .from(ownership)
    .where(and(isNotNull(ownership.permBlockUntil), eq(ownership.permBlockUntil, new Date(Date.now() + 24 * 60 * 60 * 1000))));
  console.log("total active-ish:", totals);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
