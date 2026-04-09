-- Add onboarding columns to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_completed" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_npcs" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_owned_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_complete" integer DEFAULT 0 NOT NULL;