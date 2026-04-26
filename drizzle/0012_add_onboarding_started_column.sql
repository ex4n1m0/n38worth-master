-- Add onboarding_started column to track if onboarding has been initiated
-- This prevents existing players from being incorrectly auto-completed when NPC assignment fails
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_started" integer DEFAULT 0 NOT NULL;
