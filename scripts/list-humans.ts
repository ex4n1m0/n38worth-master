import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { and, desc, eq } from "drizzle-orm";

async function main() {
  const humans = await db
    .select({
      id: users.id,
      username: users.username,
      playerValue: users.playerValue,
      credits: users.credits,
      createdAt: users.createdAt,
      lastOnlineAt: users.lastOnlineAt,
    })
    .from(users)
    .where(and(eq(users.isNpc, 0), eq(users.isProtected, 0)))
    .orderBy(desc(users.playerValue));

  console.log(`Found ${humans.length} human players (excluding goddesses):\n`);
  console.table(
    humans.map((h) => ({
      id: h.id,
      username: h.username,
      value: h.playerValue,
      credits: Math.floor(h.credits),
      created: new Date(h.createdAt).toISOString().slice(0, 10),
      lastOnline: new Date(h.lastOnlineAt).toISOString().slice(0, 16).replace("T", " "),
    }))
  );
  console.log(`\nTotal: ${humans.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
