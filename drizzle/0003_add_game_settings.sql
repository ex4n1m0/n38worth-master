-- Create game_settings table for dynamic game configuration
CREATE TABLE IF NOT EXISTS "game_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "setting_key" varchar(50) NOT NULL,
  "setting_value" integer NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "game_settings_key_unique" UNIQUE("setting_key")
);

-- Insert initial ownership limit based on current player count (10% of total)
-- This will be recalculated daily by the cron job
INSERT INTO "game_settings" ("setting_key", "setting_value", "updated_at")
SELECT 'max_ownership_limit', GREATEST(1, FLOOR(COUNT(*) * 0.1)), now()
FROM "users"
ON CONFLICT ("setting_key") DO NOTHING;