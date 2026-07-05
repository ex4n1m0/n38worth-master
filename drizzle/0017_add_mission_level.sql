-- Add mission_level column to track marketplace "collect N cards" mission progress.
-- 0-based index of the current mission; increments as missions are completed.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mission_level" integer DEFAULT 0 NOT NULL;
