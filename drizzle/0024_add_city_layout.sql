-- Mainframe City RTS — persistent building layout (MAINFRAME_CITY_RTS_PLAN §D6).
-- Purely cosmetic placement of owned avatars; ownership/value/profession
-- state stays in users/ownership. Additive + reversible: rollback is
-- DROP TABLE city_layout, city_layout_meta (flag off + redeploy first).
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
);

-- One placement per owner+avatar; DB-level tile collision guard (the only
-- atomic arbiter under neon-http's no-transaction driver).
CREATE UNIQUE INDEX IF NOT EXISTS idx_city_layout_owner_avatar
  ON city_layout (owner_user_id, owned_player_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_city_layout_owner_tile
  ON city_layout (owner_user_id, sector_key, tile_x, tile_y);
-- FK-side index so user deletion (CASCADE source lookup) stays a scan.
CREATE INDEX IF NOT EXISTS idx_city_layout_owned_player
  ON city_layout (owned_player_id);

-- Per-owner optimistic-concurrency gate. A single-row UPDATE on this table
-- is the compare-and-swap that replaces a transaction.
CREATE TABLE IF NOT EXISTS city_layout_meta (
  owner_user_id INTEGER NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  layout_version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
