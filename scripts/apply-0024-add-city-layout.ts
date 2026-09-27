import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

// One-off: apply drizzle/0024_add_city_layout.sql (idempotent — safe to
// re-run). NOTE: dev and prod share ONE Neon DB; the tables are referenced
// by nothing until the city layout routes deploy behind the OFF flag, so
// applying before deploy is safe (MAINFRAME_CITY_RTS_PLAN §"Approval gates").
async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS city_layout (
      id SERIAL PRIMARY KEY,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      owned_player_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sector_key VARCHAR(8) NOT NULL,
      tile_x INTEGER NOT NULL,
      tile_y INTEGER NOT NULL,
      rotation INTEGER NOT NULL DEFAULT 0,
      variant INTEGER NOT NULL DEFAULT 0,
      layout_version INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_city_layout_owner_avatar
        ON city_layout (owner_user_id, owned_player_id)`
  );
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_city_layout_owner_tile
        ON city_layout (owner_user_id, sector_key, tile_x, tile_y)`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_city_layout_owned_player
        ON city_layout (owned_player_id)`
  );
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS city_layout_meta (
      owner_user_id INTEGER NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      layout_version INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  console.log("Applied: city_layout + city_layout_meta (or already existed).");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
