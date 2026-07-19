-- Add performance indexes for frequently queried columns.
-- These indexes eliminate full table scans on the most common filter/sort paths.

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_is_npc ON users(is_npc);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_last_online ON users(last_online_at);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_player_value ON users(player_value);
CREATE INDEX IF NOT EXISTS idx_users_avatar_completed ON users(avatar_completed);

-- Ownership table indexes
CREATE INDEX IF NOT EXISTS idx_ownership_block_sell_until ON ownership(block_sell_until);
CREATE INDEX IF NOT EXISTS idx_ownership_perm_block_until ON ownership(perm_block_until);
