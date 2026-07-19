import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  // Users table indexes
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_is_npc ON users(is_npc)`);
  console.log("✅ idx_users_is_npc");

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)`);
  console.log("✅ idx_users_is_active");

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_last_online ON users(last_online_at)`);
  console.log("✅ idx_users_last_online");

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)`);
  console.log("✅ idx_users_created_at");

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_player_value ON users(player_value)`);
  console.log("✅ idx_users_player_value");

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_avatar_completed ON users(avatar_completed)`);
  console.log("✅ idx_users_avatar_completed");

  // Ownership table indexes
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ownership_block_sell_until ON ownership(block_sell_until)`);
  console.log("✅ idx_ownership_block_sell_until");

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ownership_perm_block_until ON ownership(perm_block_until)`);
  console.log("✅ idx_ownership_perm_block_until");

  console.log("\n🎉 All performance indexes created successfully");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
