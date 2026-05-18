-- Create table for temporary avatar reveals (e.g., 1-minute reveals on leaderboard)
CREATE TABLE IF NOT EXISTS "avatar_reveals" (
  "id" serial PRIMARY KEY,
  "viewer_id" integer NOT NULL REFERENCES "users"("id"),
  "target_id" integer NOT NULL REFERENCES "users"("id"),
  "reveal_until" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Index for quick lookup by viewer
CREATE INDEX IF NOT EXISTS "idx_avatar_reveals_viewer" ON "avatar_reveals"("viewer_id");

-- Index for quick lookup by target
CREATE INDEX IF NOT EXISTS "idx_avatar_reveals_target" ON "avatar_reveals"("target_id");

-- Unique index to prevent duplicate reveals per viewer/target
CREATE UNIQUE INDEX IF NOT EXISTS "idx_avatar_reveals_pair" ON "avatar_reveals"("viewer_id", "target_id");
