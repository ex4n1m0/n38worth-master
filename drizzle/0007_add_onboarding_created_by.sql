-- Add onboarding_created_by column to track which player created each onboarding NPC
-- This enables visibility restriction: onboarding NPCs are only visible to their creator
-- until the creator completes onboarding

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_created_by" INTEGER;

-- Add index for efficient filtering of private onboarding NPCs
CREATE INDEX IF NOT EXISTS "idx_users_onboarding_created_by" ON "users"("onboarding_created_by");
