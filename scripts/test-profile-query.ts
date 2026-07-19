import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users, ownership } from "../src/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";

async function test() {
  const username = "IgorCarlier";

  // First check if the player exists
  const [player] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, username));

  console.log("Player:", player);

  if (!player) {
    console.log("Player not found in DB");
    process.exit(0);
  }

  // Test the recentOwnerSub
  const recentOwnerSub = db
    .select({
      ownedId: sql<number>`ro.owned_id`.as("owned_id"),
      ownerName: sql<string | null>`ro.owner_name`.as("owner_name"),
      ownerValue: sql<number | null>`ro.owner_value`.as("owner_value"),
    })
    .from(
      sql`(SELECT DISTINCT ON (o.owned_id) o.owned_id, u.username AS owner_name, u.player_value AS owner_value FROM ownership o JOIN users u ON o.owner_id = u.id ORDER BY o.owned_id, o.purchased_at DESC) ro`
    )
    .as("ros");

  try {
    const result = await db
      .select({ ownedId: recentOwnerSub.ownedId, ownerName: recentOwnerSub.ownerName })
      .from(recentOwnerSub)
      .limit(1);
    console.log("recentOwnerSub test:", result);
  } catch (err) {
    console.error("recentOwnerSub error:", err);
  }

  // Test the full owners query
  const visibleSql = sql`("users"."is_npc" = 1 OR ("users"."avatar_url" IS NOT NULL AND "users"."avatar_completed" = 1))`;

  const ownerCountSub = db
    .select({ ownedId: ownership.ownedId, cnt: sql<number>`count(*)`.as("cnt") })
    .from(ownership)
    .groupBy(ownership.ownedId)
    .as("oc");

  const ownedCountSub = db
    .select({ ownerId: ownership.ownerId, cnt: sql<number>`count(*)`.as("cnt") })
    .from(ownership)
    .groupBy(ownership.ownerId)
    .as("odc");

  const portfolioSub = db
    .select({
      ownerId: ownership.ownerId,
      total: sql<number>`COALESCE(sum("users"."player_value"::numeric), 0)`.as("total"),
    })
    .from(ownership)
    .innerJoin(users, eq(ownership.ownedId, users.id))
    .groupBy(ownership.ownerId)
    .as("pv");

  try {
    const owners = await db
      .select({
        id: users.id,
        username: users.username,
        ownerCount: sql<number>`"oc"."cnt"`,
        ownedCount: sql<number>`"odc"."cnt"`,
        portfolioValue: sql<number>`"pv"."total"`,
        ownerName: sql<string | null>`"ros"."owner_name"`,
        ownerValue: sql<number | null>`"ros"."owner_value"`,
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownerId, users.id))
      .leftJoin(ownerCountSub, eq(ownerCountSub.ownedId, users.id))
      .leftJoin(ownedCountSub, eq(ownedCountSub.ownerId, users.id))
      .leftJoin(portfolioSub, eq(portfolioSub.ownerId, users.id))
      .leftJoin(recentOwnerSub, sql`"ros"."owned_id" = "users"."id"`)
      .where(and(eq(ownership.ownedId, player.id), visibleSql))
      .orderBy(desc(users.lastOnlineAt))
      .limit(5);

    console.log("Owners query result:", JSON.stringify(owners, null, 2));
  } catch (err) {
    console.error("Owners query error:", err);
  }

  process.exit(0);
}

test().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
