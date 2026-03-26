import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users, ownership } from "../src/db/schema";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";

// Manually load .env.local
const envPath = join(process.cwd(), ".env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...valueParts] = line.split("=");
    if (key && !key.startsWith("#")) {
      const value = valueParts.join("=").trim();
      if (value) {
        process.env[key.trim()] = value;
      }
    }
  });
} catch (error) {
  console.error("Error loading .env.local:", error);
}

async function testDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const neonSql = neon(process.env.DATABASE_URL);
  const db = drizzle(neonSql);

  try {
    // Count total users
    const [userCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users);
    console.log("Total users:", userCount.count);

    // Count active users
    const [activeCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(sql`${users.isActive} = 1`);
    console.log("Active users:", activeCount.count);

    // Count NPCs
    const [npcCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(sql`${users.isNpc} = 1`);
    console.log("NPCs:", npcCount.count);

    // Count humans
    const [humanCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(sql`${users.isNpc} = 0`);
    console.log("Humans:", humanCount.count);

    // Count ownerships
    const [ownershipCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ownership);
    console.log("Total ownerships:", ownershipCount.count);

    // Sample users
    const sampleUsers = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
        credits: users.credits,
        isActive: users.isActive,
        isNpc: users.isNpc,
        lastOnlineAt: users.lastOnlineAt,
      })
      .from(users)
      .limit(5);
    console.log("\nSample users:");
    console.table(sampleUsers);

    // Check for users with null lastOnlineAt
    const [neverOnline] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(sql`${users.lastOnlineAt} IS NULL`);
    console.log("\nUsers never online:", neverOnline.count);

  } catch (error) {
    console.error("Database error:", error);
  }
}

testDatabase();