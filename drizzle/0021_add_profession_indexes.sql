-- Speed up profession assignment/change cost queries.
-- GROUP BY users.profession: partial index (only rows with a profession) so the
-- scan is index-only. COUNT on game_history by (actor, type): composite index.
CREATE INDEX IF NOT EXISTS idx_users_profession ON users(profession) WHERE profession IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_game_history_actor_type ON game_history(actor_id, event_type);
